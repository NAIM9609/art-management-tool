#!/usr/bin/env bash
# rollback.sh — Roll back a Lambda service to a previous version
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
  echo -e "${BOLD}Usage:${RESET} $(basename "$0") <service-name> <version> [OPTIONS]"
  echo ""
  echo "Arguments:"
  echo "  service-name   One of: audit, cart, content, discount, integration,"
  echo "                         notification, order, product"
  echo "  version        Version identifier:"
  echo "                   'previous'       — last deployed package"
  echo "                   <commit-sha>     — specific commit SHA"
  echo "                   <s3-key>         — full S3 key path"
  echo ""
  echo "Options:"
  echo "  -e, --environment ENV   Target environment: dev | staging | prod (default: dev)"
  echo "  -r, --region REGION     AWS region (default: \$AWS_REGION or eu-north-1)"
  echo "  -b, --bucket BUCKET     S3 bucket for Lambda artifacts (\$LAMBDA_BUCKET)"
  echo "  -y, --yes               Skip confirmation prompt"
  echo "  -h, --help              Show this help message"
  echo ""
  echo "Environment variables:"
  echo "  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  echo "  LAMBDA_BUCKET     S3 bucket for Lambda packages"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") product previous"
  echo "  $(basename "$0") product v123  -e staging"
  echo "  $(basename "$0") order  abc1234 -e prod -y"
}

# ---------------------------------------------------------------------------
# Service → Lambda function suffixes map
# ---------------------------------------------------------------------------
declare -A SERVICE_FUNCTIONS
SERVICE_FUNCTIONS[audit]="
  audit-service-get-entity-history
  audit-service-get-user-activity
  audit-service-get-activity-by-date
"
SERVICE_FUNCTIONS[cart]="
  cart-service-get-cart
  cart-service-add-item
  cart-service-update-quantity
  cart-service-remove-item
  cart-service-clear-cart
  cart-service-apply-discount
  cart-service-remove-discount
"
SERVICE_FUNCTIONS[content]="
  content-service-list-personaggi
  content-service-get-personaggio
  content-service-create-personaggio
  content-service-update-personaggio
  content-service-delete-personaggio
  content-service-get-personaggio-upload-url
  content-service-list-fumetti
  content-service-get-fumetto
  content-service-create-fumetto
  content-service-update-fumetto
  content-service-delete-fumetto
  content-service-get-fumetto-upload-url
"
SERVICE_FUNCTIONS[discount]="
  discount-service-validate-code
  discount-service-list-discounts
  discount-service-get-discount
  discount-service-create-discount
  discount-service-update-discount
  discount-service-delete-discount
  discount-service-get-stats
"
SERVICE_FUNCTIONS[integration]="
  integration-service-etsy-initiate-oauth
  integration-service-etsy-handle-callback
  integration-service-etsy-sync-products
  integration-service-etsy-sync-inventory
  integration-service-etsy-sync-orders
  integration-service-etsy-webhook
  integration-service-etsy-scheduled-sync
"
SERVICE_FUNCTIONS[notification]="
  notification-service-list-notifications
  notification-service-mark-as-read
  notification-service-mark-all-read
  notification-service-delete-notification
"
SERVICE_FUNCTIONS[order]="
  order-service-create-order
  order-service-get-order
  order-service-get-customer-orders
  order-service-list-orders
  order-service-update-status
  order-service-process-payment
  order-service-webhook
"
SERVICE_FUNCTIONS[product]="
  product-service-list-products
  product-service-get-product
  product-service-create-product
  product-service-update-product
  product-service-delete-product
  product-service-list-categories
  product-service-get-category
  product-service-create-category
  product-service-update-category
  product-service-delete-category
  product-service-list-variants
  product-service-create-variant
  product-service-update-variant
  product-service-update-stock
  product-service-get-upload-url
  product-service-list-images
  product-service-delete-image
"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
SERVICE_NAME=""
VERSION=""
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
LAMBDA_BUCKET="${LAMBDA_BUCKET:-}"
AUTO_CONFIRM=false
PROJECT_NAME="art-management-tool"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 2 ]]; then
  # Allow --help with fewer args
  if [[ $# -eq 1 ]] && ([[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]); then
    usage; exit 0
  fi
  error "Service name and version are required."
  usage
  exit 1
fi

# Allow --help as the first argument
if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  usage; exit 0
fi

SERVICE_NAME="$1"; shift
VERSION="$1"; shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
    -r|--region)      AWS_REGION="$2"; shift 2 ;;
    -b|--bucket)      LAMBDA_BUCKET="$2"; shift 2 ;;
    -y|--yes)         AUTO_CONFIRM=true; shift ;;
    -h|--help)        usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Validate service
if [[ -z "${SERVICE_FUNCTIONS[$SERVICE_NAME]+_}" ]]; then
  error "Unknown service '${SERVICE_NAME}'."
  echo "Valid services: ${!SERVICE_FUNCTIONS[*]}"
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

if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set"
  exit 1
fi

if [[ -z "$LAMBDA_BUCKET" ]]; then
  error "LAMBDA_BUCKET is required (set env var or use -b)"
  exit 1
fi

if ! command -v aws &>/dev/null; then
  error "aws CLI not found"
  exit 1
fi
success "Pre-flight checks passed"

FULL_SERVICE_NAME="${SERVICE_NAME}-service"

# ---------------------------------------------------------------------------
# Resolve S3 key for the target version
# ---------------------------------------------------------------------------
step "Resolving version"

if [[ "$VERSION" == "previous" ]]; then
  S3_KEY="${FULL_SERVICE_NAME}/${ENVIRONMENT}/previous.zip"
elif [[ "$VERSION" == *"/"* ]]; then
  # Looks like a full S3 key
  S3_KEY="$VERSION"
else
  # Treat as commit SHA or tag (strip leading 'v' if present)
  CLEAN_VERSION="${VERSION#v}"
  S3_KEY="${FULL_SERVICE_NAME}/${ENVIRONMENT}/${CLEAN_VERSION}.zip"
fi

info "Service   : ${BOLD}${FULL_SERVICE_NAME}${RESET}"
info "Version   : ${BOLD}${VERSION}${RESET}"
info "S3 Key    : ${BOLD}s3://${LAMBDA_BUCKET}/${S3_KEY}${RESET}"
info "Env       : ${BOLD}${ENVIRONMENT}${RESET}"

# Check the artifact exists in S3
if ! aws s3 ls "s3://${LAMBDA_BUCKET}/${S3_KEY}" \
     --region "$AWS_REGION" &>/dev/null; then
  error "Artifact not found in S3: s3://${LAMBDA_BUCKET}/${S3_KEY}"
  exit 1
fi
success "Artifact found in S3"

# ---------------------------------------------------------------------------
# Confirmation prompt
# ---------------------------------------------------------------------------
if [[ "$AUTO_CONFIRM" == "false" ]]; then
  echo ""
  echo -e "${YELLOW}${BOLD}This will roll back ${FULL_SERVICE_NAME} in ${ENVIRONMENT} to version '${VERSION}'.${RESET}"
  if [[ "$ENVIRONMENT" == "prod" ]]; then
    echo -e "${RED}${BOLD}This affects PRODUCTION.${RESET}"
  fi
  echo ""
  read -r -p "$(echo -e "${BOLD}Proceed with rollback? [yes/no]: ${RESET}")" CONFIRM
  if [[ "${CONFIRM,,}" != "yes" ]]; then
    warn "Rollback cancelled by user."
    exit 0
  fi
fi

# ---------------------------------------------------------------------------
# Save current version before rollback
# ---------------------------------------------------------------------------
step "Saving current version before rollback"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
BACKUP_KEY="${FULL_SERVICE_NAME}/${ENVIRONMENT}/pre-rollback-${TIMESTAMP}.zip"

# Try to find the current 'previous.zip' to know what we're replacing
CURRENT_S3_KEY="${FULL_SERVICE_NAME}/${ENVIRONMENT}/previous.zip"
if aws s3 ls "s3://${LAMBDA_BUCKET}/${CURRENT_S3_KEY}" \
     --region "$AWS_REGION" &>/dev/null; then
  aws s3 cp \
    "s3://${LAMBDA_BUCKET}/${CURRENT_S3_KEY}" \
    "s3://${LAMBDA_BUCKET}/${BACKUP_KEY}" \
    --region "$AWS_REGION" || warn "Could not save backup"
  info "Current version backed up to s3://${LAMBDA_BUCKET}/${BACKUP_KEY}"
fi

# ---------------------------------------------------------------------------
# Roll back Lambda functions
# ---------------------------------------------------------------------------
step "Rolling back Lambda functions"
read -ra FUNCTIONS <<< "$(echo "${SERVICE_FUNCTIONS[$SERVICE_NAME]}")"
FAILED=0

for FN_SUFFIX in "${FUNCTIONS[@]}"; do
  [[ -z "$FN_SUFFIX" ]] && continue
  FN="${PROJECT_NAME}-${ENVIRONMENT}-${FN_SUFFIX}"
  info "  Rolling back ${FN}..."
  if aws lambda update-function-code \
      --function-name "$FN" \
      --s3-bucket "$LAMBDA_BUCKET" \
      --s3-key "$S3_KEY" \
      --region "$AWS_REGION" \
      --no-cli-pager &>/dev/null; then
    aws lambda wait function-updated \
      --function-name "$FN" \
      --region "$AWS_REGION"
    success "  ${FN} rolled back"
  else
    error "  Failed to roll back ${FN}"
    FAILED=1
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  error "One or more Lambda functions failed to roll back."
  exit 1
fi

# ---------------------------------------------------------------------------
# Verify rollback
# ---------------------------------------------------------------------------
step "Verifying rollback"
VERIFY_FAILED=0

for FN_SUFFIX in "${FUNCTIONS[@]}"; do
  [[ -z "$FN_SUFFIX" ]] && continue
  FN="${PROJECT_NAME}-${ENVIRONMENT}-${FN_SUFFIX}"

  # Check function state
  STATE=$(aws lambda get-function-configuration \
    --function-name "$FN" \
    --region "$AWS_REGION" \
    --query "State" \
    --output text 2>/dev/null || echo "Unknown")

  if [[ "$STATE" == "Active" ]]; then
    success "  ${FN}: Active"
  else
    warn "  ${FN}: State=${STATE}"
    VERIFY_FAILED=1
  fi
done

if [[ "$VERIFY_FAILED" -ne 0 ]]; then
  warn "Some functions may not be fully active yet — check AWS console."
else
  success "All functions verified as Active"
fi

echo ""
success "Rollback of ${BOLD}${FULL_SERVICE_NAME}${RESET} to version '${BOLD}${VERSION}${RESET}' complete on ${BOLD}${ENVIRONMENT}${RESET}."
