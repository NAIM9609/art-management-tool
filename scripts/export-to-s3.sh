#!/usr/bin/env bash
# export-to-s3.sh — Export a DynamoDB table to S3 in JSON format (gzip-compressed)
#
# Usage:
#   ./scripts/export-to-s3.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV     Target environment: dev | staging | prod (default: dev)
#   -r, --region REGION       AWS region (default: $AWS_REGION or eu-north-1)
#   -t, --table TABLE         DynamoDB table name (default: derived from project/env)
#   -b, --bucket BUCKET       S3 bucket for exports ($BACKUP_S3_BUCKET)
#   --prefix PREFIX           S3 key prefix (default: dynamodb)
#   --retention-days DAYS     S3 lifecycle expiration in days (default: 90)
#   --no-lifecycle            Skip setting the lifecycle policy
#   -h, --help                Show this help message
#
# Environment variables:
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   ENVIRONMENT, AWS_REGION, DYNAMODB_TABLE_NAME, BACKUP_S3_BUCKET
#
# Notes:
#   - DynamoDB point-in-time recovery must be enabled on the table.
#   - The export is done via DynamoDB's native S3 export (ExportTableToPointInTime).
#   - Exported data format: DynamoDB JSON, compressed with gzip.
#   - Stored under: s3://<bucket>/dynamodb/YYYY/MM/DD/
#   - An S3 lifecycle rule is applied to expire objects after --retention-days days.
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
  echo "  -e, --environment ENV     Target environment: dev | staging | prod (default: dev)"
  echo "  -r, --region REGION       AWS region (default: \$AWS_REGION or eu-north-1)"
  echo "  -t, --table TABLE         DynamoDB table name (overrides default)"
  echo "  -b, --bucket BUCKET       S3 destination bucket (\$BACKUP_S3_BUCKET)"
  echo "  --prefix PREFIX           S3 key prefix (default: dynamodb)"
  echo "  --retention-days DAYS     Lifecycle expiration in days (default: 90)"
  echo "  --no-lifecycle            Skip setting the S3 lifecycle policy"
  echo "  -h, --help                Show this help message"
  echo ""
  echo "Environment variables:"
  echo "  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  echo "  ENVIRONMENT, AWS_REGION, DYNAMODB_TABLE_NAME, BACKUP_S3_BUCKET"
  echo ""
  echo "Examples:"
  echo "  BACKUP_S3_BUCKET=my-backups $(basename "$0")"
  echo "  $(basename "$0") -e prod -b my-backups -r us-east-1"
  echo "  $(basename "$0") -b my-backups --retention-days 180"
}

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
TABLE_NAME="${DYNAMODB_TABLE_NAME:-}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_PREFIX="dynamodb"
RETENTION_DAYS=90
SET_LIFECYCLE=true

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment)    ENVIRONMENT="$2";    shift 2 ;;
    -r|--region)         AWS_REGION="$2";     shift 2 ;;
    -t|--table)          TABLE_NAME="$2";     shift 2 ;;
    -b|--bucket)         S3_BUCKET="$2";      shift 2 ;;
    --prefix)            S3_PREFIX="$2";      shift 2 ;;
    --retention-days)    RETENTION_DAYS="$2"; shift 2 ;;
    --no-lifecycle)      SET_LIFECYCLE=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
  error "Invalid environment '${ENVIRONMENT}'. Must be: dev, staging, prod"
  exit 1
fi

# Derive table name if not set
if [[ -z "$TABLE_NAME" ]]; then
  TABLE_NAME="art-management-tool-${ENVIRONMENT}-art-management"
fi

if [[ -z "$S3_BUCKET" ]]; then
  error "S3 bucket is required. Set BACKUP_S3_BUCKET or use -b / --bucket"
  exit 1
fi

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  error "Invalid --retention-days '${RETENTION_DAYS}'. It must be a positive integer."
  exit 1
fi

if (( RETENTION_DAYS <= 0 )); then
  error "Invalid --retention-days '${RETENTION_DAYS}'. It must be greater than 0."
  exit 1
fi

if [[ "$SET_LIFECYCLE" == "true" ]] && (( RETENTION_DAYS < 60 )); then
  error "Invalid --retention-days '${RETENTION_DAYS}'. It must be at least 60 when lifecycle transitions are enabled."
  exit 1
fi

if [[ -z "$S3_PREFIX" ]]; then
  error "Invalid --prefix. It must not be empty."
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
# Verify table and PITR
# ---------------------------------------------------------------------------
step "Verifying table '${TABLE_NAME}' and point-in-time recovery"

TABLE_STATUS=$(aws dynamodb describe-table \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --query "Table.TableStatus" \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [[ "$TABLE_STATUS" == "NOT_FOUND" ]]; then
  error "Table '${TABLE_NAME}' not found in region '${AWS_REGION}'"
  exit 1
fi

PITR_STATUS=$(aws dynamodb describe-continuous-backups \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --query "ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus" \
  --output text 2>/dev/null || echo "UNKNOWN")

if [[ "$PITR_STATUS" != "ENABLED" ]]; then
  error "Point-in-time recovery is not enabled on '${TABLE_NAME}' (status: ${PITR_STATUS})"
  error "Enable it with: aws dynamodb update-continuous-backups --table-name ${TABLE_NAME} --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true"
  exit 1
fi

success "Table is ${TABLE_STATUS} and PITR is ${PITR_STATUS}"

# ---------------------------------------------------------------------------
# Production safeguard
# ---------------------------------------------------------------------------
if [[ "$ENVIRONMENT" == "prod" ]]; then
  warn "You are about to run a PRODUCTION export and may create/configure an S3 bucket."
  warn "Bucket: ${S3_BUCKET}"
  warn "Prefix: ${S3_PREFIX}/"
  read -r -p "$(echo -e "${BOLD}Type 'yes' to confirm: ${RESET}")" CONFIRM
  if [[ "${CONFIRM,,}" != "yes" ]]; then
    warn "Export cancelled."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Build S3 destination path: s3://<bucket>/dynamodb/YYYY/MM/DD/
# ---------------------------------------------------------------------------
YEAR=$(date -u +"%Y")
MONTH=$(date -u +"%m")
DAY=$(date -u +"%d")
EXPORT_PREFIX="${S3_PREFIX}/${YEAR}/${MONTH}/${DAY}"
S3_DESTINATION="s3://${S3_BUCKET}/${EXPORT_PREFIX}/"

info "Export destination: ${S3_DESTINATION}"

# ---------------------------------------------------------------------------
# Verify (or create) the S3 bucket
# ---------------------------------------------------------------------------
step "Verifying S3 bucket '${S3_BUCKET}'"

if ! aws s3api head-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION" 2>/dev/null; then
  warn "Bucket '${S3_BUCKET}' not found — creating it in region '${AWS_REGION}'"

  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket \
      --bucket "$S3_BUCKET" \
      --region "$AWS_REGION"
  else
    aws s3api create-bucket \
      --bucket "$S3_BUCKET" \
      --region "$AWS_REGION" \
      --create-bucket-configuration LocationConstraint="$AWS_REGION"
  fi

  # Enable versioning for safety
  aws s3api put-bucket-versioning \
    --bucket "$S3_BUCKET" \
    --versioning-configuration Status=Enabled \
    --region "$AWS_REGION"

  # Block public access
  aws s3api put-public-access-block \
    --bucket "$S3_BUCKET" \
    --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
    --region "$AWS_REGION"

  success "Bucket created: ${S3_BUCKET}"
fi

# ---------------------------------------------------------------------------
# Set lifecycle policy (delete after RETENTION_DAYS days)
# ---------------------------------------------------------------------------
if [[ "$SET_LIFECYCLE" == "true" ]]; then
  step "Setting S3 lifecycle policy (prefix: ${S3_PREFIX}/, expiration: ${RETENTION_DAYS} days)"

  LIFECYCLE_CONFIG=$(python3 - <<PYEOF
import json
policy = {
    "Rules": [
        {
            "ID": "dynamodb-backup-expiration",
            "Status": "Enabled",
            "Filter": {"Prefix": "${S3_PREFIX}/"},
            "Expiration": {"Days": ${RETENTION_DAYS}},
            "NoncurrentVersionExpiration": {"NoncurrentDays": ${RETENTION_DAYS}}
        },
        {
            "ID": "dynamodb-backup-glacier-archive",
            "Status": "Enabled",
            "Filter": {"Prefix": "${S3_PREFIX}/"},
            "Transitions": [
                {"Days": 30,  "StorageClass": "STANDARD_IA"},
                {"Days": 60,  "StorageClass": "GLACIER"}
            ]
        }
    ]
}
print(json.dumps(policy))
PYEOF
)

  aws s3api put-bucket-lifecycle-configuration \
    --bucket "$S3_BUCKET" \
    --lifecycle-configuration "$LIFECYCLE_CONFIG" \
    --region "$AWS_REGION"

  success "Lifecycle policy applied (${S3_PREFIX}/ → expire after ${RETENTION_DAYS} days, Glacier after 60 days)"
fi

# ---------------------------------------------------------------------------
# Start DynamoDB export to S3
# ---------------------------------------------------------------------------
step "Starting DynamoDB export to S3 (format: DYNAMODB_JSON, compression: GZIP)"

# Get current table ARN
TABLE_ARN=$(aws dynamodb describe-table \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --query "Table.TableArn" \
  --output text)

EXPORT_OUTPUT=$(aws dynamodb export-table-to-point-in-time \
  --table-arn "$TABLE_ARN" \
  --s3-bucket "$S3_BUCKET" \
  --s3-prefix "$EXPORT_PREFIX" \
  --export-format "DYNAMODB_JSON" \
  --s3-sse-algorithm "AES256" \
  --region "$AWS_REGION" \
  --output json)

EXPORT_ARN=$(echo "$EXPORT_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['ExportDescription']['ExportArn'])")
EXPORT_STATUS=$(echo "$EXPORT_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['ExportDescription']['ExportStatus'])")

info "Export ARN    : ${EXPORT_ARN}"
info "Export status : ${EXPORT_STATUS}"

# ---------------------------------------------------------------------------
# Wait for export to complete
# ---------------------------------------------------------------------------
step "Waiting for export to complete (this may take several minutes for large tables)"

MAX_WAIT=1800   # 30 minutes
INTERVAL=30
ELAPSED=0

while true; do
  STATUS=$(aws dynamodb describe-export \
    --export-arn "$EXPORT_ARN" \
    --region "$AWS_REGION" \
    --query "ExportDescription.ExportStatus" \
    --output text)

  if [[ "$STATUS" == "COMPLETED" ]]; then
    success "Export COMPLETED"
    break
  elif [[ "$STATUS" == "FAILED" ]]; then
    FAILURE_MSG=$(aws dynamodb describe-export \
      --export-arn "$EXPORT_ARN" \
      --region "$AWS_REGION" \
      --query "ExportDescription.FailureMessage" \
      --output text 2>/dev/null || echo "unknown")
    error "Export FAILED: ${FAILURE_MSG}"
    exit 1
  fi

  info "Status: ${STATUS} — waiting ${INTERVAL}s... (${ELAPSED}/${MAX_WAIT}s)"
  sleep "$INTERVAL"
  ELAPSED=$(( ELAPSED + INTERVAL ))

  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    error "Timed out waiting for export after ${MAX_WAIT}s (last status: ${STATUS})"
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Fetch export details
# ---------------------------------------------------------------------------
EXPORT_DETAILS=$(aws dynamodb describe-export \
  --export-arn "$EXPORT_ARN" \
  --region "$AWS_REGION" \
  --output json)

EXPORTED_ITEMS=$(echo "$EXPORT_DETAILS" | python3 -c "import sys,json; print(json.load(sys.stdin)['ExportDescription'].get('ExportedItemCount','unknown'))")
EXPORT_MANIFEST=$(echo "$EXPORT_DETAILS" | python3 -c "import sys,json; print(json.load(sys.stdin)['ExportDescription'].get('ExportManifest',''))" 2>/dev/null || echo "")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}Export complete${RESET}"
echo -e "  Table        : ${TABLE_NAME}"
echo -e "  Destination  : ${CYAN}${S3_DESTINATION}${RESET}"
echo -e "  Export ARN   : ${CYAN}${EXPORT_ARN}${RESET}"
echo -e "  Items        : ${EXPORTED_ITEMS}"
echo -e "  Retention    : ${RETENTION_DAYS} days"
echo -e "  Region       : ${AWS_REGION}"
[[ -n "$EXPORT_MANIFEST" ]] && echo -e "  Manifest     : ${EXPORT_MANIFEST}"
echo ""

echo "$EXPORT_ARN"
