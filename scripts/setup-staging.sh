#!/usr/bin/env bash
# setup-staging.sh — Prepare the staging environment for a migration dry run.
#
# Steps:
#   1. Clone production PostgreSQL snapshot to staging
#   2. Create the DynamoDB staging table (matching production schema)
#   3. Deploy Lambda staging functions (optional, controlled by --deploy-lambdas)
#
# Usage:
#   ./scripts/setup-staging.sh [OPTIONS]
#
# Options:
#   -e, --environment ENV       Staging environment name (default: staging)
#   -r, --region REGION         AWS region (default: $AWS_REGION or eu-north-1)
#   -t, --table-name TABLE      DynamoDB table name (default: art-management-tool-staging-art-management)
#   -b, --pg-backup FILE        Path to a pg_dump .sql file to restore (default: backups/prod-backup.sql)
#   --staging-db-host HOST      PostgreSQL host for staging (required unless --skip-pg)
#   --staging-db-port PORT      PostgreSQL port for staging (default: 5432)
#   --staging-db-user USER      PostgreSQL user for staging (default: postgres)
#   --staging-db-password PASS  PostgreSQL password for staging
#   --staging-db-name NAME      PostgreSQL database name for staging (default: art_management_staging)
#   --skip-pg                   Skip PostgreSQL clone step
#   --skip-dynamo               Skip DynamoDB table creation step
#   --deploy-lambdas            Deploy Lambda functions to staging after setup
#   -h, --help                  Show this help message

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
# Defaults
# ---------------------------------------------------------------------------
ENVIRONMENT="${ENVIRONMENT:-staging}"
# Default region matches the DynamoDB dry-run workflow (us-east-1).
# Override via --region or the AWS_REGION environment variable to match your deployment region.
AWS_REGION="${AWS_REGION:-us-east-1}"
DYNAMODB_TABLE_NAME="${DYNAMODB_TABLE_NAME:-art-management-tool-staging-art-management}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PG_BACKUP_FILE="${PG_BACKUP_FILE:-$REPO_ROOT/backups/prod-backup.sql}"

STAGING_DB_HOST=""
STAGING_DB_PORT="5432"
STAGING_DB_USER="${STAGING_DB_USER:-postgres}"
STAGING_DB_PASSWORD="${STAGING_DB_PASSWORD:-}"
STAGING_DB_NAME="art_management_staging"

SKIP_PG=false
SKIP_DYNAMO=false
DEPLOY_LAMBDAS=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment)      ENVIRONMENT="$2";          shift 2 ;;
    -r|--region)           AWS_REGION="$2";            shift 2 ;;
    -t|--table-name)       DYNAMODB_TABLE_NAME="$2";   shift 2 ;;
    -b|--pg-backup)        PG_BACKUP_FILE="$2";        shift 2 ;;
    --staging-db-host)     STAGING_DB_HOST="$2";       shift 2 ;;
    --staging-db-port)     STAGING_DB_PORT="$2";       shift 2 ;;
    --staging-db-user)     STAGING_DB_USER="$2";       shift 2 ;;
    --staging-db-password) STAGING_DB_PASSWORD="$2";   shift 2 ;;
    --staging-db-name)     STAGING_DB_NAME="$2";       shift 2 ;;
    --skip-pg)             SKIP_PG=true;               shift ;;
    --skip-dynamo)         SKIP_DYNAMO=true;           shift ;;
    --deploy-lambdas)      DEPLOY_LAMBDAS=true;        shift ;;
    -h|--help)
      sed -n '/^# Usage:/,/^[^#]/{ /^[^#]/q; s/^# \{0,1\}//; p }' "$0"
      exit 0
      ;;
    *) error "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
step "Pre-flight checks"

for cmd in aws psql pg_restore; do
  if ! command -v "$cmd" &>/dev/null; then
    warn "Optional command not found: $cmd (some steps may be skipped)"
  fi
done

if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set"
  exit 1
fi
success "AWS credentials present"

info "Environment  : ${BOLD}$ENVIRONMENT${RESET}"
info "AWS Region   : ${BOLD}$AWS_REGION${RESET}"
info "DynamoDB     : ${BOLD}$DYNAMODB_TABLE_NAME${RESET}"

# ---------------------------------------------------------------------------
# Step 1: Clone production PostgreSQL to staging
# ---------------------------------------------------------------------------
if [[ "$SKIP_PG" == "false" ]]; then
  step "Step 1: Clone PostgreSQL production data to staging"

  if [[ -z "$STAGING_DB_HOST" ]]; then
    error "--staging-db-host is required when cloning PostgreSQL."
    error "Use --skip-pg to skip this step if the staging database is already populated."
    exit 1
  fi

  if [[ ! -f "$PG_BACKUP_FILE" ]]; then
    error "PostgreSQL backup file not found: $PG_BACKUP_FILE"
    error "Generate a backup with: pg_dump -Fc -h <prod-host> -U <user> -d <db> -f $PG_BACKUP_FILE"
    error "Or set --pg-backup to point to an existing dump."
    exit 1
  fi

  info "Backup file: $PG_BACKUP_FILE ($(du -sh "$PG_BACKUP_FILE" | cut -f1))"
  info "Target    : postgresql://${STAGING_DB_USER}@${STAGING_DB_HOST}:${STAGING_DB_PORT}/${STAGING_DB_NAME}"

  export PGPASSWORD="${STAGING_DB_PASSWORD}"

  # Create staging database if it doesn't exist
  DB_EXISTS=$(psql -h "$STAGING_DB_HOST" -p "$STAGING_DB_PORT" -U "$STAGING_DB_USER" \
    -t -c "SELECT 1 FROM pg_database WHERE datname='${STAGING_DB_NAME}';" 2>/dev/null | xargs || echo "")
  if [[ "$DB_EXISTS" != "1" ]]; then
    psql -h "$STAGING_DB_HOST" -p "$STAGING_DB_PORT" -U "$STAGING_DB_USER" \
      -c "CREATE DATABASE \"${STAGING_DB_NAME}\";"
    info "Created staging database: ${STAGING_DB_NAME}"
  else
    warn "Database '${STAGING_DB_NAME}' already exists — pg_restore will overwrite existing data."
  fi

  info "Restoring from backup (this may take several minutes for large databases)…"
  pg_restore \
    --host="$STAGING_DB_HOST" \
    --port="$STAGING_DB_PORT" \
    --username="$STAGING_DB_USER" \
    --dbname="$STAGING_DB_NAME" \
    --no-owner \
    --role="$STAGING_DB_USER" \
    --clean \
    --if-exists \
    --verbose \
    "$PG_BACKUP_FILE" 2>&1 | tail -20

  # Verify row counts
  CATEGORY_COUNT=$(psql -h "$STAGING_DB_HOST" -p "$STAGING_DB_PORT" -U "$STAGING_DB_USER" \
    -d "$STAGING_DB_NAME" -t -c "SELECT COUNT(*) FROM categories;" 2>/dev/null | xargs || echo "0")
  PRODUCT_COUNT=$(psql -h "$STAGING_DB_HOST" -p "$STAGING_DB_PORT" -U "$STAGING_DB_USER" \
    -d "$STAGING_DB_NAME" -t -c "SELECT COUNT(*) FROM products;" 2>/dev/null | xargs || echo "0")

  success "PostgreSQL staging restore complete"
  info "  categories: ${CATEGORY_COUNT} rows"
  info "  products:   ${PRODUCT_COUNT} rows"

  unset PGPASSWORD
else
  warn "Skipping PostgreSQL clone (--skip-pg)"
fi

# ---------------------------------------------------------------------------
# Step 2: Create DynamoDB staging table
# ---------------------------------------------------------------------------
if [[ "$SKIP_DYNAMO" == "false" ]]; then
  step "Step 2: Create DynamoDB staging table"

  AWS_ENDPOINT_ARGS=()
  if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
    AWS_ENDPOINT_ARGS=(--endpoint-url "$AWS_ENDPOINT_URL")
  fi

  # Check if table already exists
  if aws dynamodb describe-table \
      --table-name "$DYNAMODB_TABLE_NAME" \
      --region "$AWS_REGION" \
      "${AWS_ENDPOINT_ARGS[@]}" \
      --no-cli-pager &>/dev/null; then
    warn "DynamoDB table '${DYNAMODB_TABLE_NAME}' already exists — skipping creation."
    warn "To recreate it, delete it first: aws dynamodb delete-table --table-name ${DYNAMODB_TABLE_NAME}"
  else
    info "Creating DynamoDB table: ${DYNAMODB_TABLE_NAME}"
    aws dynamodb create-table \
      --table-name "$DYNAMODB_TABLE_NAME" \
      --attribute-definitions \
        AttributeName=PK,AttributeType=S \
        AttributeName=SK,AttributeType=S \
        AttributeName=GSI1PK,AttributeType=S \
        AttributeName=GSI1SK,AttributeType=S \
        AttributeName=GSI2PK,AttributeType=S \
        AttributeName=GSI2SK,AttributeType=S \
        AttributeName=GSI3PK,AttributeType=S \
        AttributeName=GSI3SK,AttributeType=S \
      --key-schema \
        AttributeName=PK,KeyType=HASH \
        AttributeName=SK,KeyType=RANGE \
      --global-secondary-indexes \
        'IndexName=GSI1,KeySchema=[{AttributeName=GSI1PK,KeyType=HASH},{AttributeName=GSI1SK,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
        'IndexName=GSI2,KeySchema=[{AttributeName=GSI2PK,KeyType=HASH},{AttributeName=GSI2SK,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
        'IndexName=GSI3,KeySchema=[{AttributeName=GSI3PK,KeyType=HASH},{AttributeName=GSI3SK,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
      --billing-mode PAY_PER_REQUEST \
      --sse-specification Enabled=true \
      --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
      --region "$AWS_REGION" \
      "${AWS_ENDPOINT_ARGS[@]}" \
      --tags \
        Key=Environment,Value="$ENVIRONMENT" \
        Key=Project,Value=art-management-tool \
        Key=ManagedBy,Value=setup-staging.sh \
      --no-cli-pager

    info "Waiting for table to become active…"
    aws dynamodb wait table-exists \
      --table-name "$DYNAMODB_TABLE_NAME" \
      --region "$AWS_REGION" \
      "${AWS_ENDPOINT_ARGS[@]}"

    success "DynamoDB table created: ${DYNAMODB_TABLE_NAME}"
  fi
else
  warn "Skipping DynamoDB table creation (--skip-dynamo)"
fi

# ---------------------------------------------------------------------------
# Step 3: Deploy Lambda staging functions (optional)
# ---------------------------------------------------------------------------
if [[ "$DEPLOY_LAMBDAS" == "true" ]]; then
  step "Step 3: Deploy Lambda staging functions"

  if [[ -x "$SCRIPT_DIR/deploy-all.sh" ]]; then
    info "Running deploy-all.sh for environment=${ENVIRONMENT}…"
    ENVIRONMENT="$ENVIRONMENT" "$SCRIPT_DIR/deploy-all.sh"
    success "Lambda functions deployed to staging"
  else
    warn "deploy-all.sh not found or not executable; skipping Lambda deployment."
    warn "Deploy manually with: ./scripts/deploy-service.sh <service> -e $ENVIRONMENT"
  fi
else
  info "Skipping Lambda deployment (pass --deploy-lambdas to enable)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
success "Staging environment setup complete for ${BOLD}${ENVIRONMENT}${RESET}"
echo ""
info "Next steps:"
info "  1. Run the migration:   cd backend && DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME} npm run migrate:production"
info "  2. Validate results:    cd backend && DYNAMODB_TABLE_NAME=${DYNAMODB_TABLE_NAME} npm run validate:migration"
info "  3. If issues arise:     cd backend && ROLLBACK_MODE=restore npm run rollback:migration"
