#!/usr/bin/env bash
# restore-dynamodb.sh — Restore a DynamoDB table from an on-demand backup ARN
#
# Usage:
#   ./scripts/restore-dynamodb.sh <backup-arn> [OPTIONS]
#
# Arguments:
#   backup-arn   Full ARN of the DynamoDB backup to restore from
#
# Options:
#   -e, --environment ENV       Target environment: dev | staging | prod (default: dev)
#   -r, --region REGION         AWS region (default: $AWS_REGION_CUSTOM or eu-north-1)
#   -n, --new-table NAME        Name for the restored table (default: <original>-restored-<timestamp>)
#   --no-wait                   Return immediately without waiting for table to become ACTIVE
#   -h, --help                  Show this help message
#
# Environment variables:
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   ENVIRONMENT, AWS_REGION_CUSTOM
#
# NOTE: After restoration is verified, traffic switchover is a manual step.
#       Update the DYNAMODB_TABLE_NAME environment variable in each Lambda
#       function configuration and redeploy, or use an alias/DNS cutover.
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
  echo "  -e, --environment ENV     Target environment: dev | staging | prod (default: dev)"
  echo "  -r, --region REGION       AWS region (default: \$AWS_REGION_CUSTOM or eu-north-1)"
  echo "  -n, --new-table NAME      Name for the restored table"
  echo "  --no-wait                 Do not wait for table to become ACTIVE"
  echo "  -h, --help                Show this help message"
  echo ""
  echo "Environment variables:"
  echo "  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") arn:aws:dynamodb:eu-north-1:123456789012:table/art-management/backup/01234"
  echo "  $(basename "$0") arn:aws:dynamodb:... -e prod -n art-management-prod-restored"
}

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION_CUSTOM="${AWS_REGION_CUSTOM:-eu-north-1}"
NEW_TABLE_NAME=""
NO_WAIT=false

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
    -n|--new-table)   NEW_TABLE_NAME="$2"; shift 2 ;;
    --no-wait)        NO_WAIT=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Validate backup ARN format
if [[ ! "$BACKUP_ARN" =~ ^arn:aws:dynamodb: ]]; then
  error "Invalid backup ARN format: ${BACKUP_ARN}"
  error "Expected format: arn:aws:dynamodb:<region>:<account-id>:table/<table-name>/backup/<id>"
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
BACKUP_SIZE=$(echo "$BACKUP_INFO"   | python3 -c "import sys,json; print(json.load(sys.stdin)['BackupDescription']['BackupDetails'].get('BackupSizeBytes','unknown'))")

if [[ "$BACKUP_STATUS" != "AVAILABLE" ]]; then
  error "Backup is not AVAILABLE (current status: ${BACKUP_STATUS})"
  exit 1
fi

info "Source table : ${SOURCE_TABLE}"
info "Backup name  : ${BACKUP_NAME}"
info "Backup size  : ${BACKUP_SIZE} bytes"
info "Status       : ${BACKUP_STATUS}"

# ---------------------------------------------------------------------------
# Derive restored table name
# ---------------------------------------------------------------------------
TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
if [[ -z "$NEW_TABLE_NAME" ]]; then
  NEW_TABLE_NAME="${SOURCE_TABLE}-restored-${TIMESTAMP}"
fi

# ---------------------------------------------------------------------------
# Production safeguard
# ---------------------------------------------------------------------------
if [[ "$ENVIRONMENT" == "prod" ]]; then
  warn "You are about to restore a backup in the PRODUCTION environment."
  warn "Restored table: ${NEW_TABLE_NAME}"
  read -r -p "$(echo -e "${BOLD}Type 'yes' to confirm: ${RESET}")" CONFIRM
  if [[ "${CONFIRM,,}" != "yes" ]]; then
    warn "Restore cancelled."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Restore table from backup (includes GSIs from backup)
# ---------------------------------------------------------------------------
step "Restoring table '${NEW_TABLE_NAME}' from backup"

aws dynamodb restore-table-from-backup \
  --target-table-name "$NEW_TABLE_NAME" \
  --backup-arn "$BACKUP_ARN" \
  --region "$AWS_REGION_CUSTOM" \
  --output json > /dev/null

success "Restore initiated for '${NEW_TABLE_NAME}'"

if [[ "$NO_WAIT" == "true" ]]; then
  warn "--no-wait specified; skipping status check"
  echo ""
  echo -e "  Restored table : ${CYAN}${NEW_TABLE_NAME}${RESET}"
  echo -e "  Region         : ${AWS_REGION_CUSTOM}"
  echo -e "  Status         : CREATING (async)"
  echo ""
  exit 0
fi

# ---------------------------------------------------------------------------
# Wait for table to become ACTIVE
# ---------------------------------------------------------------------------
step "Waiting for restored table to become ACTIVE"

MAX_WAIT=900   # 15 minutes — large tables can take a while
INTERVAL=15
ELAPSED=0

while true; do
  TABLE_STATUS=$(aws dynamodb describe-table \
    --table-name "$NEW_TABLE_NAME" \
    --region "$AWS_REGION_CUSTOM" \
    --query "Table.TableStatus" \
    --output text 2>/dev/null || echo "CREATING")

  if [[ "$TABLE_STATUS" == "ACTIVE" ]]; then
    success "Table '${NEW_TABLE_NAME}' is ACTIVE"
    break
  fi

  info "Status: ${TABLE_STATUS} — waiting ${INTERVAL}s... (${ELAPSED}/${MAX_WAIT}s)"
  sleep "$INTERVAL"
  ELAPSED=$(( ELAPSED + INTERVAL ))

  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    error "Timed out waiting for table after ${MAX_WAIT}s (last status: ${TABLE_STATUS})"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Verify data integrity: item count
# ---------------------------------------------------------------------------
step "Verifying data integrity (item count)"

# Use describe-table ItemCount for a low-cost sanity check on item count
ITEM_COUNT=$(aws dynamodb describe-table \
  --table-name "$NEW_TABLE_NAME" \
  --region "$AWS_REGION_CUSTOM" \
  --query "Table.ItemCount" \
  --output text)

info "Restored table item count: ${ITEM_COUNT}"

if [[ "$ITEM_COUNT" -eq 0 ]]; then
  warn "Restored table contains 0 items — verify the backup contained data"
else
  success "Data integrity check passed (${ITEM_COUNT} items)"
fi

# ---------------------------------------------------------------------------
# Verify GSIs are ACTIVE
# ---------------------------------------------------------------------------
step "Verifying Global Secondary Indexes"

GSI_LIST=$(aws dynamodb describe-table \
  --table-name "$NEW_TABLE_NAME" \
  --region "$AWS_REGION_CUSTOM" \
  --query "Table.GlobalSecondaryIndexes[*].{Name:IndexName,Status:IndexStatus}" \
  --output json 2>/dev/null || echo "[]")

GSI_COUNT=$(echo "$GSI_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))")

if [[ "$GSI_COUNT" -eq 0 ]]; then
  info "No GSIs found on restored table"
else
  ALL_ACTIVE=true
  while IFS= read -r line; do
    GSI_NAME=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Name'])")
    GSI_STATUS=$(echo "$line" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Status'])")
    if [[ "$GSI_STATUS" == "ACTIVE" ]]; then
      success "  GSI '${GSI_NAME}': ${GSI_STATUS}"
    else
      warn "  GSI '${GSI_NAME}': ${GSI_STATUS} (not yet ACTIVE)"
      ALL_ACTIVE=false
    fi
  done < <(echo "$GSI_LIST" | python3 -c "
import sys, json
items = json.load(sys.stdin)
for item in items:
    print(json.dumps(item))
")

  if [[ "$ALL_ACTIVE" == "false" ]]; then
    warn "Some GSIs are not yet ACTIVE — they will become ACTIVE shortly"
  else
    success "All ${GSI_COUNT} GSI(s) are ACTIVE"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}Restore complete${RESET}"
echo -e "  Restored table : ${BOLD}${NEW_TABLE_NAME}${RESET}"
echo -e "  Source backup  : ${CYAN}${BACKUP_ARN}${RESET}"
echo -e "  Item count     : ${ITEM_COUNT}"
echo -e "  Region         : ${AWS_REGION_CUSTOM}"
echo ""
echo -e "${YELLOW}${BOLD}NEXT STEPS — Traffic switchover (manual):${RESET}"
echo -e "  1. Validate the restored table data with: ./scripts/validate-backup.sh"
echo -e "  2. Update DYNAMODB_TABLE_NAME in each Lambda function (preserve other env vars):"
echo -e "     # WARNING: The 'Variables={...}' argument REPLACES all environment variables."
echo -e "     #          Include all required variables, not only DYNAMODB_TABLE_NAME."
echo -e "     aws lambda update-function-configuration \\"
echo -e "       --function-name <function-name> \\"
echo -e "       --environment Variables={DYNAMODB_TABLE_NAME=${NEW_TABLE_NAME},OTHER_VAR=value,...} \\" 
echo -e "       --region ${AWS_REGION_CUSTOM}"
echo -e "  3. Monitor CloudWatch metrics on the new table"
echo -e "  4. Delete the old table once confident: aws dynamodb delete-table ..."
echo ""

echo "$NEW_TABLE_NAME"
