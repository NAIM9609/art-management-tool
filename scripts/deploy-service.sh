#!/usr/bin/env bash
# deploy-service.sh — Build, package, and deploy a single Lambda service
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
  echo -e "${BOLD}Usage:${RESET} $(basename "$0") <service-name> [OPTIONS]"
  echo ""
  echo "Arguments:"
  echo "  service-name   One of: audit, cart, content, discount, integration,"
  echo "                         notification, order, product"
  echo ""
  echo "Options:"
  echo "  -e, --environment ENV   Target environment: dev | staging | prod (default: dev)"
  echo "  -r, --region REGION     AWS region (default: \$AWS_REGION_CUSTOM or eu-north-1)"
  echo "  -b, --bucket BUCKET     S3 bucket for Lambda artifacts (\$LAMBDA_BUCKET)"
  echo "  --skip-tests            Skip unit tests before deploying"
  echo "  --skip-smoke            Skip smoke test after deploying"
  echo "  -h, --help              Show this help message"
  echo ""
  echo "Environment variables:"
  echo "  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  echo "  LAMBDA_BUCKET     S3 bucket for Lambda packages"
  echo "  API_GATEWAY_URL   Base URL for smoke tests (optional)"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") product"
  echo "  $(basename "$0") product -e staging"
  echo "  $(basename "$0") order -e prod --skip-tests"
}

# ---------------------------------------------------------------------------
# Service → Lambda function names map
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
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION_CUSTOM="${AWS_REGION_CUSTOM:-eu-north-1}"
LAMBDA_BUCKET="${LAMBDA_BUCKET:-}"
SKIP_TESTS=false
SKIP_SMOKE=false
PROJECT_NAME="art-management-tool"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  error "Service name is required."
  usage
  exit 1
fi

# Allow --help as the first argument before service name
if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
  usage; exit 0
fi

SERVICE_NAME="$1"; shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
    -r|--region)      AWS_REGION_CUSTOM="$2"; shift 2 ;;
    -b|--bucket)      LAMBDA_BUCKET="$2"; shift 2 ;;
    --skip-tests)     SKIP_TESTS=true; shift ;;
    --skip-smoke)     SKIP_SMOKE=true; shift ;;
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
SERVICE_PATH="$BACKEND_DIR/services/${SERVICE_NAME}-service"

if [[ ! -d "$SERVICE_PATH" ]]; then
  error "Service directory not found: $SERVICE_PATH"
  exit 1
fi

for cmd in node npm aws zip; do
  if ! command -v "$cmd" &>/dev/null; then
    error "Required command not found: $cmd"
    exit 1
  fi
done
success "Required commands found"

if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set"
  exit 1
fi

if [[ -z "$LAMBDA_BUCKET" ]]; then
  error "LAMBDA_BUCKET is required (set env var or use -b)"
  exit 1
fi
success "Credentials and bucket validated"

FULL_SERVICE_NAME="${SERVICE_NAME}-service"
info "Service      : ${BOLD}${FULL_SERVICE_NAME}${RESET}"
info "Environment  : ${BOLD}${ENVIRONMENT}${RESET}"
info "AWS Region   : ${BOLD}${AWS_REGION_CUSTOM}${RESET}"
info "Lambda bucket: ${BOLD}${LAMBDA_BUCKET}${RESET}"

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------
step "Installing dependencies"
npm i --prefix "$BACKEND_DIR"
success "Dependencies installed"

# ---------------------------------------------------------------------------
# Run unit tests
# ---------------------------------------------------------------------------
if [[ "$SKIP_TESTS" == "true" ]]; then
  warn "Skipping unit tests (--skip-tests)"
else
  step "Running unit tests for ${FULL_SERVICE_NAME}"
  npm test --prefix "$BACKEND_DIR" -- \
    --testPathPattern="services/${FULL_SERVICE_NAME}" \
    --passWithNoTests
  success "Unit tests passed"
fi

# ---------------------------------------------------------------------------
# Build (esbuild Lambda bundler)
# ---------------------------------------------------------------------------
step "Building ${FULL_SERVICE_NAME}"
node "$BACKEND_DIR/esbuild.lambda.mjs" "$SERVICE_NAME"
success "Build complete"

# ---------------------------------------------------------------------------
# Package Lambda
# ---------------------------------------------------------------------------
step "Packaging Lambda"
BUNDLE_DIR="$BACKEND_DIR/dist/lambda/${FULL_SERVICE_NAME}"
if [[ ! -d "$BUNDLE_DIR" ]]; then
  error "Bundle output not found: $BUNDLE_DIR"
  exit 1
fi

LAMBDA_ZIP="/tmp/lambda-${SERVICE_NAME}-$$.zip"
(cd "$BUNDLE_DIR" && zip -r "$LAMBDA_ZIP" . -q)
PACKAGE_SIZE=$(du -sh "$LAMBDA_ZIP" | cut -f1)
success "Package created: $LAMBDA_ZIP (${PACKAGE_SIZE})"

# ---------------------------------------------------------------------------
# Upload to S3
# ---------------------------------------------------------------------------
step "Uploading package to S3"
COMMIT_SHA="${GITHUB_SHA:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date +%s)}"
S3_KEY="${FULL_SERVICE_NAME}/${ENVIRONMENT}/${COMMIT_SHA}.zip"

aws s3 cp "$LAMBDA_ZIP" "s3://${LAMBDA_BUCKET}/${S3_KEY}" \
  --region "$AWS_REGION_CUSTOM"
success "Uploaded to s3://${LAMBDA_BUCKET}/${S3_KEY}"

# ---------------------------------------------------------------------------
# Update Lambda functions
# ---------------------------------------------------------------------------
step "Updating Lambda functions"
read -ra FUNCTIONS <<< "$(echo "${SERVICE_FUNCTIONS[$SERVICE_NAME]}")"
FAILED=0
ANY_UPDATED=false

for FN_SUFFIX in "${FUNCTIONS[@]}"; do
  [[ -z "$FN_SUFFIX" ]] && continue
  FN="${PROJECT_NAME}-${ENVIRONMENT}-${FN_SUFFIX}"
  info "  Updating ${FN}..."
  if aws lambda update-function-code \
      --function-name "$FN" \
      --s3-bucket "$LAMBDA_BUCKET" \
      --s3-key "$S3_KEY" \
      --region "$AWS_REGION_CUSTOM" \
      --no-cli-pager &>/dev/null; then
    aws lambda wait function-updated \
      --function-name "$FN" \
      --region "$AWS_REGION_CUSTOM"
    ANY_UPDATED=true
    success "  ${FN} updated"
  else
    error "  Failed to update ${FN}"
    FAILED=1
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  error "One or more Lambda functions failed to update."
  exit 1
fi
success "All Lambda functions updated"

# ---------------------------------------------------------------------------
# Service-specific smoke test
# ---------------------------------------------------------------------------
if [[ "$SKIP_SMOKE" == "true" ]]; then
  warn "Skipping smoke test (--skip-smoke)"
elif [[ -z "${API_GATEWAY_URL:-}" ]]; then
  warn "API_GATEWAY_URL not set — skipping smoke test"
else
  step "Running smoke test for ${FULL_SERVICE_NAME}"
  # Map service → smoke endpoint/method/expected status family
  declare -A SMOKE_ENDPOINTS
  declare -A SMOKE_METHODS
  declare -A SMOKE_EXPECTED

  SMOKE_ENDPOINTS[product]="/api/products"
  SMOKE_METHODS[product]="GET"
  SMOKE_EXPECTED[product]="23"

  SMOKE_ENDPOINTS[cart]="/api/cart"
  SMOKE_METHODS[cart]="GET"
  SMOKE_EXPECTED[cart]="234"

  SMOKE_ENDPOINTS[order]="/api/orders?email=smoke@example.com"
  SMOKE_METHODS[order]="GET"
  SMOKE_EXPECTED[order]="24"

  SMOKE_ENDPOINTS[discount]="/api/discounts/validate"
  SMOKE_METHODS[discount]="POST"
  SMOKE_EXPECTED[discount]="4"

  SMOKE_ENDPOINTS[content]="/api/personaggi"
  SMOKE_METHODS[content]="GET"
  SMOKE_EXPECTED[content]="23"

  SMOKE_ENDPOINTS[audit]="/api/admin/audit/entity/smoke/123"
  SMOKE_METHODS[audit]="GET"
  SMOKE_EXPECTED[audit]="4"

  SMOKE_ENDPOINTS[notification]="/api/admin/notifications"
  SMOKE_METHODS[notification]="GET"
  SMOKE_EXPECTED[notification]="4"

  SMOKE_ENDPOINTS[integration]="/api/integrations/etsy/auth"
  SMOKE_METHODS[integration]="GET"
  SMOKE_EXPECTED[integration]="23"

  ENDPOINT="${SMOKE_ENDPOINTS[$SERVICE_NAME]:-/api/${SERVICE_NAME}}"
  HTTP_METHOD="${SMOKE_METHODS[$SERVICE_NAME]:-GET}"
  EXPECTED_PREFIXES="${SMOKE_EXPECTED[$SERVICE_NAME]:-23}"
  URL="${API_GATEWAY_URL}${ENDPOINT}"
  info "Testing ${HTTP_METHOD} ${URL}..."

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X "$HTTP_METHOD" "$URL" || echo "000")
  FIRST_DIGIT="${HTTP_STATUS:0:1}"
  if [[ "$HTTP_STATUS" == "000" ]] || ! [[ "$EXPECTED_PREFIXES" == *"$FIRST_DIGIT"* ]]; then
    error "Smoke test FAILED: HTTP ${HTTP_STATUS}"

    # Rollback if something was updated
    if [[ "$ANY_UPDATED" == "true" ]]; then
      warn "Rolling back ${FULL_SERVICE_NAME}..."
      PREV_S3_KEY="${FULL_SERVICE_NAME}/${ENVIRONMENT}/previous.zip"
      if aws s3 ls "s3://${LAMBDA_BUCKET}/${PREV_S3_KEY}" \
           --region "$AWS_REGION_CUSTOM" &>/dev/null; then
        ROLLBACK_FAILED=false
        for FN_SUFFIX in "${FUNCTIONS[@]}"; do
          [[ -z "$FN_SUFFIX" ]] && continue
          FN="${PROJECT_NAME}-${ENVIRONMENT}-${FN_SUFFIX}"
          info "Rolling back function ${FN} to previous version..."
          if ! aws lambda update-function-code \
            --function-name "$FN" \
            --s3-bucket "$LAMBDA_BUCKET" \
            --s3-key "$PREV_S3_KEY" \
            --region "$AWS_REGION_CUSTOM" \
            --no-cli-pager &>/dev/null; then
            error "Rollback FAILED while updating code for function ${FN}"
            ROLLBACK_FAILED=true
            continue
          fi
          if ! aws lambda wait function-updated \
            --function-name "$FN" \
            --region "$AWS_REGION_CUSTOM" \
            --no-cli-pager &>/dev/null; then
            error "Rollback FAILED while waiting for function ${FN} to update"
            ROLLBACK_FAILED=true
          fi
        done
        if [[ "$ROLLBACK_FAILED" == "true" ]]; then
          error "Rollback completed with failures for one or more functions. See log output above."
        else
          warn "Rollback complete"
        fi
      else
        warn "No previous version found — rollback skipped"
      fi
    fi
    exit 1
  fi
  success "Smoke test passed: HTTP ${HTTP_STATUS}"
fi

# ---------------------------------------------------------------------------
# Tag as previous version for future rollbacks
# ---------------------------------------------------------------------------
step "Tagging current version as 'previous'"
aws s3 cp \
  "s3://${LAMBDA_BUCKET}/${S3_KEY}" \
  "s3://${LAMBDA_BUCKET}/${FULL_SERVICE_NAME}/${ENVIRONMENT}/previous.zip" \
  --region "$AWS_REGION_CUSTOM" || warn "Could not tag previous version"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
rm -rf "$PACKAGE_DIR" "$LAMBDA_ZIP"

echo ""
success "Deployment of ${BOLD}${FULL_SERVICE_NAME}${RESET} to ${BOLD}${ENVIRONMENT}${RESET} complete."
