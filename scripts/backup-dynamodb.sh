#!/usr/bin/env bash
# backup-dynamodb.sh — Create an on-demand DynamoDB backup for the art-management table
#
# Usage:
#   ./scripts/backup-dynamodb.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV   Target environment: dev | staging | prod (default: dev)
#   -r, --region REGION     AWS region (default: $AWS_REGION or eu-north-1)
#   -t, --table TABLE       DynamoDB table name (default: derived from project/env)
#   -o, --output FILE       Write backup ARN to this file (optional)
#   -h, --help              Show this help message
#
# Environment variables:
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   ENVIRONMENT, AWS_REGION, DYNAMODB_TABLE_NAME
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
  echo -e "${BOLD}Usage:${RESET} $(basename "$0") [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -e, --environment ENV   Target environment: dev | staging | prod (default: dev)"
  echo "  -r, --region REGION     AWS region (default: \$AWS_REGION or eu-north-1)"
  echo "  -t, --table TABLE       DynamoDB table name (overrides default)"
  echo "  -o, --output FILE       Write backup ARN to this file (optional)"
  echo "  -h, --help              Show this help message"
  echo ""
  echo "Environment variables:"
  echo "  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  echo "  ENVIRONMENT, AWS_REGION, DYNAMODB_TABLE_NAME"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0")"
  echo "  $(basename "$0") -e prod -r us-east-1"
  echo "  $(basename "$0") -e staging -o /tmp/latest-backup-arn.txt"
}

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
TABLE_NAME="${DYNAMODB_TABLE_NAME:-}"
OUTPUT_FILE=""
MAX_WAIT="${BACKUP_MAX_WAIT_SECONDS:-1800}"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
    -r|--region)      AWS_REGION="$2";  shift 2 ;;
    -t|--table)       TABLE_NAME="$2";  shift 2 ;;
    -o|--output)      OUTPUT_FILE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
  error "Invalid environment '${ENVIRONMENT}'. Must be: dev, staging, prod"
  exit 1
fi

if ! [[ "$MAX_WAIT" =~ ^[0-9]+$ ]] || [[ "$MAX_WAIT" -le 0 ]]; then
  error "Invalid BACKUP_MAX_WAIT_SECONDS='${MAX_WAIT}'. It must be a positive integer."
  exit 1
fi

# Derive table name if not set
if [[ -z "$TABLE_NAME" ]]; then
  TABLE_NAME="art-management-tool-${ENVIRONMENT}-art-management"
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
step "Pre-flight checks"

if ! command -v aws &>/dev/null; then
  error "AWS CLI not found. Install it from https://aws.amazon.com/cli/"
  exit 1
fi

if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set"
  exit 1
fi

success "Pre-flight checks passed"

# ---------------------------------------------------------------------------
# Confirm table exists
# ---------------------------------------------------------------------------
step "Verifying table '${TABLE_NAME}' exists"

TABLE_STATUS=$(aws dynamodb describe-table \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --query "Table.TableStatus" \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [[ "$TABLE_STATUS" == "NOT_FOUND" ]]; then
  error "Table '${TABLE_NAME}' not found in region '${AWS_REGION}'"
  exit 1
fi

if [[ "$TABLE_STATUS" != "ACTIVE" ]]; then
  error "Table '${TABLE_NAME}' is not ACTIVE (current status: ${TABLE_STATUS})"
  exit 1
fi

success "Table '${TABLE_NAME}' is ${TABLE_STATUS}"

# ---------------------------------------------------------------------------
# Production safeguard
# ---------------------------------------------------------------------------
if [[ "$ENVIRONMENT" == "prod" ]]; then
  warn "You are about to create and tag a backup in the PRODUCTION environment."
  warn "Table: ${TABLE_NAME}"
  read -r -p "$(echo -e "${BOLD}Type 'yes' to confirm: ${RESET}")" CONFIRM
  if [[ "${CONFIRM,,}" != "yes" ]]; then
    warn "Backup cancelled."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Create backup
# ---------------------------------------------------------------------------
TIMESTAMP=$(date -u +"%Y-%m-%d-%H-%M-%S")
BACKUP_NAME="${TABLE_NAME}-${TIMESTAMP}"

step "Creating on-demand backup '${BACKUP_NAME}'"

BACKUP_ARN=$(aws dynamodb create-backup \
  --table-name "$TABLE_NAME" \
  --backup-name "$BACKUP_NAME" \
  --region "$AWS_REGION" \
  --query "BackupDetails.BackupArn" \
  --output text)

if [[ -z "$BACKUP_ARN" ]]; then
  error "Failed to create backup — no ARN returned"
  exit 1
fi

info "Backup ARN: ${BACKUP_ARN}"

# ---------------------------------------------------------------------------
# Tag the backup
# ---------------------------------------------------------------------------
step "Tagging backup with timestamp and environment"

aws dynamodb tag-resource \
  --resource-arn "$BACKUP_ARN" \
  --tags \
    Key=CreatedAt,Value="$TIMESTAMP" \
    Key=Environment,Value="$ENVIRONMENT" \
    Key=Table,Value="$TABLE_NAME" \
    Key=ManagedBy,Value=backup-dynamodb.sh \
  --region "$AWS_REGION"

success "Tags applied"

# ---------------------------------------------------------------------------
# Wait for backup to complete
# ---------------------------------------------------------------------------
step "Waiting for backup to reach AVAILABLE status"

INTERVAL=10
ELAPSED=0

while true; do
  BACKUP_STATUS=$(aws dynamodb describe-backup \
    --backup-arn "$BACKUP_ARN" \
    --region "$AWS_REGION" \
    --query "BackupDescription.BackupDetails.BackupStatus" \
    --output text)

  if [[ "$BACKUP_STATUS" == "AVAILABLE" ]]; then
    success "Backup is AVAILABLE"
    break
  elif [[ "$BACKUP_STATUS" == "DELETED" ]] || [[ "$BACKUP_STATUS" == "CREATING" && $ELAPSED -ge $MAX_WAIT ]]; then
    error "Backup did not become AVAILABLE within ${MAX_WAIT}s (status: ${BACKUP_STATUS})"
    exit 1
  fi

  info "Status: ${BACKUP_STATUS} — waiting ${INTERVAL}s... (${ELAPSED}/${MAX_WAIT}s)"
  sleep "$INTERVAL"
  ELAPSED=$(( ELAPSED + INTERVAL ))

  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    error "Timed out waiting for backup after ${MAX_WAIT}s (last status: ${BACKUP_STATUS})"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
BACKUP_SIZE=$(aws dynamodb describe-backup \
  --backup-arn "$BACKUP_ARN" \
  --region "$AWS_REGION" \
  --query "BackupDescription.BackupDetails.BackupSizeBytes" \
  --output text 2>/dev/null || echo "unknown")

echo ""
echo -e "${BOLD}${GREEN}Backup complete${RESET}"
echo -e "  Name        : ${BOLD}${BACKUP_NAME}${RESET}"
echo -e "  ARN         : ${CYAN}${BACKUP_ARN}${RESET}"
echo -e "  Table       : ${TABLE_NAME}"
echo -e "  Environment : ${ENVIRONMENT}"
echo -e "  Region      : ${AWS_REGION}"
echo -e "  Size        : ${BACKUP_SIZE} bytes"
echo ""

# Optionally persist ARN to file
if [[ -n "$OUTPUT_FILE" ]]; then
  echo "$BACKUP_ARN" > "$OUTPUT_FILE"
  success "Backup ARN written to: ${OUTPUT_FILE}"
fi

echo "$BACKUP_ARN"
