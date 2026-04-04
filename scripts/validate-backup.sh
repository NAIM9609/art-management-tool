#!/usr/bin/env bash
# validate-backup.sh — Validate a DynamoDB backup by restoring to a temp table,
#                      counting records, spot-checking data, then deleting the temp table
#
# Usage:
#   ./scripts/validate-backup.sh <backup-arn> [OPTIONS]
#
# Arguments:
#   backup-arn   Full ARN of the DynamoDB backup to validate
#
# Options:
#   -e, --environment ENV       Target environment: dev | staging | prod (default: dev)
#   -r, --region REGION         AWS region (default: $AWS_REGION_CUSTOM or eu-north-1)
#   --sample-size N             Number of items to spot-check (default: 5)
#   --keep-table                Do not delete the temp table after validation
#   -h, --help                  Show this help message
#
# Environment variables:
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   ENVIRONMENT, AWS_REGION_CUSTOM
set -euo pipefail

# ---------------------------------------------------------------------------
# Colors & helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
step()    { echo -e "\n${BOLD}${CYAN}==> $*${RESET}"; }

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  echo -e "${BOLD}Usage:${RESET} $(basename "$0") <backup-arn> [OPTIONS]"
  echo ""
  echo "Arguments:"
  echo "  backup-arn   Full ARN of the DynamoDB backup (arn:aws:dynamodb:...)"
  echo ""
  echo "Options:"
  echo "  -e, --environment ENV    Target environment: dev | staging | prod (default: dev)"
  echo "  -r, --region REGION      AWS region (default: \$AWS_REGION_CUSTOM or eu-north-1)"
  echo "  --sample-size N          Number of items to spot-check (default: 5)"
  echo "  --keep-table             Do not delete the temp table after validation"
  echo "  -h, --help               Show this help message"
  echo ""
  echo "Environment variables:"
  echo "  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") arn:aws:dynamodb:eu-north-1:123456789012:table/art-management/backup/01234"
  echo "  $(basename "$0") arn:aws:dynamodb:... --sample-size 10 --keep-table"
}

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION_CUSTOM="${AWS_REGION_CUSTOM:-eu-north-1}"
SAMPLE_SIZE=5
KEEP_TABLE=false
TEMP_TABLE_NAME=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]] || [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  usage
  exit 0
fi

BACKUP_ARN="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
    -r|--region)      AWS_REGION_CUSTOM="$2";  shift 2 ;;
    --sample-size)    SAMPLE_SIZE="$2"; shift 2 ;;
    --keep-table)     KEEP_TABLE=true;  shift ;;
    -h|--help) usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Validate backup ARN format
if [[ ! "$BACKUP_ARN" =~ ^arn:aws:dynamodb: ]]; then
  error "Invalid backup ARN format: ${BACKUP_ARN}"
  error "Expected: arn:aws:dynamodb:<region>:<account-id>:table/<table>/backup/<id>"
  exit 1
fi

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
  error "Invalid environment '${ENVIRONMENT}'. Must be: dev, staging, prod"
  exit 1
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
step "Pre-flight checks"

if ! command -v aws &>/dev/null; then
  error "AWS CLI not found. Install it from https://aws.amazon.com/cli/"
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  error "python3 not found (required for JSON processing)"
  exit 1
fi

if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set"
  exit 1
fi

success "Pre-flight checks passed"

# ---------------------------------------------------------------------------
# Production safeguard
# ---------------------------------------------------------------------------
if [[ "$ENVIRONMENT" == "prod" ]]; then
  warn "You are about to restore and validate a backup in the PRODUCTION environment."
  warn "A temporary table will be created and deleted unless --keep-table is set."
  read -r -p "$(echo -e "${BOLD}Type 'yes' to confirm: ${RESET}")" CONFIRM
  if [[ "${CONFIRM,,}" != "yes" ]]; then
    warn "Validation cancelled."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Cleanup trap — delete temp table on exit (unless --keep-table)
# ---------------------------------------------------------------------------
cleanup() {
  local EXIT_CODE=$?
  if [[ -n "$TEMP_TABLE_NAME" ]] && [[ "$KEEP_TABLE" == "false" ]]; then
    echo ""
    step "Cleaning up temporary table '${TEMP_TABLE_NAME}'"
    TABLE_EXISTS=$(aws dynamodb describe-table \
      --table-name "$TEMP_TABLE_NAME" \
      --region "$AWS_REGION_CUSTOM" \
      --query "Table.TableStatus" \
      --output text 2>/dev/null || echo "NOT_FOUND")

    if [[ "$TABLE_EXISTS" != "NOT_FOUND" ]]; then
      aws dynamodb delete-table \
        --table-name "$TEMP_TABLE_NAME" \
        --region "$AWS_REGION_CUSTOM" \
        --output json > /dev/null
      success "Temporary table '${TEMP_TABLE_NAME}' deleted"
    else
      info "Temporary table '${TEMP_TABLE_NAME}' already gone"
    fi
  elif [[ -n "$TEMP_TABLE_NAME" ]] && [[ "$KEEP_TABLE" == "true" ]]; then
    warn "--keep-table set; temp table '${TEMP_TABLE_NAME}' was NOT deleted"
  fi
  exit "$EXIT_CODE"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Describe backup
# ---------------------------------------------------------------------------
step "Describing backup"

BACKUP_INFO=$(aws dynamodb describe-backup \
  --backup-arn "$BACKUP_ARN" \
  --region "$AWS_REGION_CUSTOM" \
  --output json)

BACKUP_STATUS=$(echo "$BACKUP_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['BackupDescription']['BackupDetails']['BackupStatus'])")
SOURCE_TABLE=$(echo "$BACKUP_INFO"  | python3 -c "import sys,json; print(json.load(sys.stdin)['BackupDescription']['SourceTableDetails']['TableName'])")
BACKUP_NAME=$(echo "$BACKUP_INFO"   | python3 -c "import sys,json; print(json.load(sys.stdin)['BackupDescription']['BackupDetails']['BackupName'])")

if [[ "$BACKUP_STATUS" != "AVAILABLE" ]]; then
  error "Backup is not AVAILABLE (status: ${BACKUP_STATUS})"
  exit 1
fi

info "Source table : ${SOURCE_TABLE}"
info "Backup name  : ${BACKUP_NAME}"

# ---------------------------------------------------------------------------
# Restore to temporary table
# ---------------------------------------------------------------------------
TIMESTAMP=$(date -u +"%Y%m%d%H%M%S")
TEMP_TABLE_NAME="${SOURCE_TABLE}-validate-${TIMESTAMP}"

step "Restoring backup to temporary table '${TEMP_TABLE_NAME}'"

aws dynamodb restore-table-from-backup \
  --target-table-name "$TEMP_TABLE_NAME" \
  --backup-arn "$BACKUP_ARN" \
  --region "$AWS_REGION_CUSTOM" \
  --output json > /dev/null

success "Restore initiated"

# ---------------------------------------------------------------------------
# Wait for temp table to become ACTIVE
# ---------------------------------------------------------------------------
step "Waiting for temporary table to become ACTIVE"

MAX_WAIT=900   # 15 minutes
INTERVAL=15
ELAPSED=0

while true; do
  TABLE_STATUS=$(aws dynamodb describe-table \
    --table-name "$TEMP_TABLE_NAME" \
    --region "$AWS_REGION_CUSTOM" \
    --query "Table.TableStatus" \
    --output text 2>/dev/null || echo "CREATING")

  if [[ "$TABLE_STATUS" == "ACTIVE" ]]; then
    success "Temp table '${TEMP_TABLE_NAME}' is ACTIVE"
    break
  fi

  info "Status: ${TABLE_STATUS} — waiting ${INTERVAL}s... (${ELAPSED}/${MAX_WAIT}s)"
  sleep "$INTERVAL"
  ELAPSED=$(( ELAPSED + INTERVAL ))

  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    error "Timed out waiting for table (last status: ${TABLE_STATUS})"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Count records
# ---------------------------------------------------------------------------
step "Counting records in temporary table"

ITEM_COUNT=$(aws dynamodb describe-table \
  --table-name "$TEMP_TABLE_NAME" \
  --region "$AWS_REGION_CUSTOM" \
  --query "Table.ItemCount" \
  --output text)

if [[ "$ITEM_COUNT" -eq 0 ]]; then
  warn "Temporary table contains 0 items — backup may be empty"
  VALIDATION_PASSED=false
else
  success "Item count: ${ITEM_COUNT}"
  VALIDATION_PASSED=true
fi

# ---------------------------------------------------------------------------
# Spot-check: sample SAMPLE_SIZE items and validate structure
# ---------------------------------------------------------------------------
step "Spot-checking ${SAMPLE_SIZE} item(s) for structural validity"

SAMPLE_OUTPUT=$(aws dynamodb scan \
  --table-name "$TEMP_TABLE_NAME" \
  --limit "$SAMPLE_SIZE" \
  --region "$AWS_REGION_CUSTOM" \
  --output json)

SAMPLE_COUNT=$(echo "$SAMPLE_OUTPUT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('Items', [])))")

if [[ "$SAMPLE_COUNT" -eq 0 ]]; then
  warn "No sample items returned"
  VALIDATION_PASSED=false
else
  info "Sampled ${SAMPLE_COUNT} item(s)"

  # Validate each sampled item has PK and SK (required keys)
  INVALID_COUNT=$(echo "$SAMPLE_OUTPUT" | python3 - <<'PYEOF'
import sys, json
data = json.load(sys.stdin)
items = data.get("Items", [])
invalid = 0
for i, item in enumerate(items):
    pk = item.get("PK", {}).get("S") or item.get("PK", {}).get("N") or item.get("PK", {}).get("B")
    sk = item.get("SK", {}).get("S") or item.get("SK", {}).get("N") or item.get("SK", {}).get("B")
    if not pk or not sk:
        print(f"  WARN  item[{i}] missing PK or SK: {json.dumps(item)[:200]}", file=sys.stderr)
        invalid += 1
    else:
      print(f"  OK    PK={pk!r} SK={sk!r}", file=sys.stderr)
print(invalid)
PYEOF
)

  # The last line of INVALID_COUNT output is the count
  INVALID_ITEMS=$(echo "$INVALID_COUNT" | tail -1)

  if [[ "$INVALID_ITEMS" -gt 0 ]]; then
    warn "${INVALID_ITEMS} item(s) are missing PK or SK"
    VALIDATION_PASSED=false
  else
    success "All ${SAMPLE_COUNT} sampled item(s) have valid PK and SK"
  fi
fi

# ---------------------------------------------------------------------------
# Verify GSIs are ACTIVE
# ---------------------------------------------------------------------------
step "Checking Global Secondary Indexes on temp table"

GSI_LIST=$(aws dynamodb describe-table \
  --table-name "$TEMP_TABLE_NAME" \
  --region "$AWS_REGION_CUSTOM" \
  --query "Table.GlobalSecondaryIndexes[*].{Name:IndexName,Status:IndexStatus}" \
  --output json 2>/dev/null || echo "[]")

GSI_COUNT=$(echo "$GSI_LIST" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

if [[ "$GSI_COUNT" -eq 0 ]]; then
  info "No GSIs found"
else
  ALL_GSI_ACTIVE=true
  while IFS= read -r gsi_json; do
    [[ -z "$gsi_json" ]] && continue
    GSI_NAME=$(echo "$gsi_json"   | python3 -c "import sys,json; print(json.load(sys.stdin)['Name'])")
    GSI_STATUS=$(echo "$gsi_json" | python3 -c "import sys,json; print(json.load(sys.stdin)['Status'])")
    if [[ "$GSI_STATUS" == "ACTIVE" ]]; then
      success "  GSI '${GSI_NAME}': ${GSI_STATUS}"
    else
      warn "  GSI '${GSI_NAME}': ${GSI_STATUS} (not yet ACTIVE)"
      ALL_GSI_ACTIVE=false
    fi
  done < <(echo "$GSI_LIST" | python3 -c "
import sys, json
for item in json.load(sys.stdin):
    print(json.dumps(item))
")

  if [[ "$ALL_GSI_ACTIVE" == "false" ]]; then
    warn "Some GSIs are not yet ACTIVE — this may be transient"
  else
    success "All ${GSI_COUNT} GSI(s) are ACTIVE"
  fi
fi

# ---------------------------------------------------------------------------
# Final result
# ---------------------------------------------------------------------------
echo ""
if [[ "$VALIDATION_PASSED" == "true" ]]; then
  echo -e "${BOLD}${GREEN}Validation PASSED${RESET}"
else
  echo -e "${BOLD}${RED}Validation FAILED${RESET}"
fi

echo -e "  Backup ARN   : ${CYAN}${BACKUP_ARN}${RESET}"
echo -e "  Temp table   : ${TEMP_TABLE_NAME}"
echo -e "  Item count   : ${ITEM_COUNT}"
echo -e "  Spot-checked : ${SAMPLE_COUNT} / ${SAMPLE_SIZE} items"
echo -e "  Keep table   : ${KEEP_TABLE}"
echo ""

if [[ "$VALIDATION_PASSED" != "true" ]]; then
  exit 1
fi
