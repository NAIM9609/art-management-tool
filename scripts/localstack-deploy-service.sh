#!/usr/bin/env bash
# localstack-deploy-service.sh — Build/package one service and deploy its Lambda functions to LocalStack
set -euo pipefail

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

usage() {
  echo -e "${BOLD}Usage:${RESET} $(basename "$0") <service-name> [OPTIONS]"
  echo ""
  echo "Arguments:"
  echo "  service-name   One of: audit, cart, content, discount, integration, notification, order, product"
  echo ""
  echo "Options:"
  echo "  -e, --environment ENV     Environment suffix in function names (default: dev)"
  echo "  --endpoint URL            LocalStack endpoint URL (default: http://localhost:4566)"
  echo "  --region REGION           AWS region for LocalStack (default: us-east-1)"
  echo "  --project-name NAME       Project name prefix (default: art-management-tool)"
  echo "  --bucket NAME             S3 bucket env var injected into Lambdas (default: art-images-dev)"
  echo "  --skip-build              Skip TypeScript build and reuse existing dist"
  echo "  -h, --help                Show this help"
  echo ""
  echo "Example:"
  echo "  $(basename "$0") content --endpoint http://localhost:4566"
}

declare -A SERVICE_FUNCTIONS
SERVICE_FUNCTIONS[audit]="audit-service-get-entity-history audit-service-get-user-activity audit-service-get-activity-by-date"
SERVICE_FUNCTIONS[cart]="cart-service-get-cart cart-service-add-item cart-service-update-quantity cart-service-remove-item cart-service-clear-cart cart-service-apply-discount cart-service-remove-discount"
SERVICE_FUNCTIONS[content]="content-service-list-personaggi content-service-get-personaggio content-service-create-personaggio content-service-update-personaggio content-service-delete-personaggio content-service-get-personaggio-upload-url content-service-list-fumetti content-service-get-fumetto content-service-create-fumetto content-service-update-fumetto content-service-delete-fumetto content-service-get-fumetto-upload-url"
SERVICE_FUNCTIONS[discount]="discount-service-validate-code discount-service-list-discounts discount-service-get-discount discount-service-create-discount discount-service-update-discount discount-service-delete-discount discount-service-get-stats"
SERVICE_FUNCTIONS[integration]="integration-service-etsy-initiate-oauth integration-service-etsy-handle-callback integration-service-etsy-sync-products integration-service-etsy-sync-inventory integration-service-etsy-sync-orders integration-service-etsy-webhook integration-service-etsy-scheduled-sync"
SERVICE_FUNCTIONS[notification]="notification-service-list-notifications notification-service-mark-as-read notification-service-mark-all-read notification-service-delete-notification"
SERVICE_FUNCTIONS[order]="order-service-create-order order-service-get-order order-service-get-customer-orders order-service-list-orders order-service-update-status order-service-process-payment order-service-webhook"
SERVICE_FUNCTIONS[product]="product-service-list-products product-service-get-product product-service-create-product product-service-update-product product-service-delete-product product-service-list-categories product-service-get-category product-service-create-category product-service-update-category product-service-delete-category product-service-list-variants product-service-create-variant product-service-update-variant product-service-update-stock product-service-get-upload-url product-service-list-images product-service-delete-image"

declare -A HANDLERS
# Audit
HANDLERS[audit-service-get-entity-history]="dist/handlers/audit.handler.getEntityHistory"
HANDLERS[audit-service-get-user-activity]="dist/handlers/audit.handler.getUserActivity"
HANDLERS[audit-service-get-activity-by-date]="dist/handlers/audit.handler.getActivityByDate"
# Cart
HANDLERS[cart-service-get-cart]="dist/handlers/cart.handler.getCart"
HANDLERS[cart-service-add-item]="dist/handlers/cart.handler.addItem"
HANDLERS[cart-service-update-quantity]="dist/handlers/cart.handler.updateQuantity"
HANDLERS[cart-service-remove-item]="dist/handlers/cart.handler.removeItem"
HANDLERS[cart-service-clear-cart]="dist/handlers/cart.handler.clearCart"
HANDLERS[cart-service-apply-discount]="dist/handlers/cart.handler.applyDiscount"
HANDLERS[cart-service-remove-discount]="dist/handlers/cart.handler.removeDiscount"
# Content
HANDLERS[content-service-list-personaggi]="dist/handlers/personaggi.handler.listPersonaggi"
HANDLERS[content-service-get-personaggio]="dist/handlers/personaggi.handler.getPersonaggio"
HANDLERS[content-service-create-personaggio]="dist/handlers/personaggi.handler.createPersonaggio"
HANDLERS[content-service-update-personaggio]="dist/handlers/personaggi.handler.updatePersonaggio"
HANDLERS[content-service-delete-personaggio]="dist/handlers/personaggi.handler.deletePersonaggio"
HANDLERS[content-service-get-personaggio-upload-url]="dist/handlers/personaggi.handler.uploadImage"
HANDLERS[content-service-list-fumetti]="dist/handlers/fumetti.handler.listFumetti"
HANDLERS[content-service-get-fumetto]="dist/handlers/fumetti.handler.getFumetto"
HANDLERS[content-service-create-fumetto]="dist/handlers/fumetti.handler.createFumetto"
HANDLERS[content-service-update-fumetto]="dist/handlers/fumetti.handler.updateFumetto"
HANDLERS[content-service-delete-fumetto]="dist/handlers/fumetti.handler.deleteFumetto"
HANDLERS[content-service-get-fumetto-upload-url]="dist/handlers/fumetti.handler.uploadPage"
# Discount
HANDLERS[discount-service-validate-code]="dist/handlers/discount.handler.validateCode"
HANDLERS[discount-service-list-discounts]="dist/handlers/discount.handler.listDiscounts"
HANDLERS[discount-service-get-discount]="dist/handlers/discount.handler.getDiscount"
HANDLERS[discount-service-create-discount]="dist/handlers/discount.handler.createDiscount"
HANDLERS[discount-service-update-discount]="dist/handlers/discount.handler.updateDiscount"
HANDLERS[discount-service-delete-discount]="dist/handlers/discount.handler.deleteDiscount"
HANDLERS[discount-service-get-stats]="dist/handlers/discount.handler.getStats"
# Integration
HANDLERS[integration-service-etsy-initiate-oauth]="dist/handlers/etsy.handler.initiateOAuth"
HANDLERS[integration-service-etsy-handle-callback]="dist/handlers/etsy.handler.handleCallback"
HANDLERS[integration-service-etsy-sync-products]="dist/handlers/etsy.handler.syncProducts"
HANDLERS[integration-service-etsy-sync-inventory]="dist/handlers/etsy.handler.syncInventory"
HANDLERS[integration-service-etsy-sync-orders]="dist/handlers/etsy.handler.syncOrders"
HANDLERS[integration-service-etsy-webhook]="dist/handlers/etsy.handler.handleWebhook"
HANDLERS[integration-service-etsy-scheduled-sync]="dist/handlers/etsy.handler.scheduledSync"
# Notification
HANDLERS[notification-service-list-notifications]="dist/handlers/notification.handler.listNotifications"
HANDLERS[notification-service-mark-as-read]="dist/handlers/notification.handler.markAsRead"
HANDLERS[notification-service-mark-all-read]="dist/handlers/notification.handler.markAllAsRead"
HANDLERS[notification-service-delete-notification]="dist/handlers/notification.handler.deleteNotification"
# Order
HANDLERS[order-service-create-order]="dist/handlers/order.handler.createOrder"
HANDLERS[order-service-get-order]="dist/handlers/order.handler.getOrder"
HANDLERS[order-service-get-customer-orders]="dist/handlers/order.handler.getCustomerOrders"
HANDLERS[order-service-list-orders]="dist/handlers/order.handler.listOrders"
HANDLERS[order-service-update-status]="dist/handlers/order.handler.updateOrderStatus"
HANDLERS[order-service-process-payment]="dist/handlers/order.handler.processPayment"
HANDLERS[order-service-webhook]="dist/handlers/order.handler.webhookHandler"
# Product
HANDLERS[product-service-list-products]="dist/handlers/product.handler.listProducts"
HANDLERS[product-service-get-product]="dist/handlers/product.handler.getProduct"
HANDLERS[product-service-create-product]="dist/handlers/product.handler.createProduct"
HANDLERS[product-service-update-product]="dist/handlers/product.handler.updateProduct"
HANDLERS[product-service-delete-product]="dist/handlers/product.handler.deleteProduct"
HANDLERS[product-service-list-categories]="dist/handlers/category.handler.listCategories"
HANDLERS[product-service-get-category]="dist/handlers/category.handler.getCategory"
HANDLERS[product-service-create-category]="dist/handlers/category.handler.createCategory"
HANDLERS[product-service-update-category]="dist/handlers/category.handler.updateCategory"
HANDLERS[product-service-delete-category]="dist/handlers/category.handler.deleteCategory"
HANDLERS[product-service-list-variants]="dist/handlers/variant.handler.listVariants"
HANDLERS[product-service-create-variant]="dist/handlers/variant.handler.createVariant"
HANDLERS[product-service-update-variant]="dist/handlers/variant.handler.updateVariant"
HANDLERS[product-service-update-stock]="dist/handlers/variant.handler.updateStock"
HANDLERS[product-service-get-upload-url]="dist/handlers/image.handler.getUploadUrl"
HANDLERS[product-service-list-images]="dist/handlers/image.handler.listImages"
HANDLERS[product-service-delete-image]="dist/handlers/image.handler.deleteImage"

declare -A RUNTIMES
RUNTIMES[cart]="nodejs20.x"
RUNTIMES[audit]="nodejs18.x"
RUNTIMES[content]="nodejs18.x"
RUNTIMES[discount]="nodejs18.x"
RUNTIMES[integration]="nodejs18.x"
RUNTIMES[notification]="nodejs18.x"
RUNTIMES[order]="nodejs18.x"
RUNTIMES[product]="nodejs18.x"

declare -A SERVICE_TABLES
SERVICE_TABLES[audit]="audit-logs"
SERVICE_TABLES[cart]="carts"
SERVICE_TABLES[content]="content"
SERVICE_TABLES[discount]="discount-codes"
SERVICE_TABLES[integration]="etsy-oauth-tokens"
SERVICE_TABLES[notification]="notifications"
SERVICE_TABLES[order]="orders"
SERVICE_TABLES[product]="products"

SERVICE_NAME=""
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
AWS_REGION="${AWS_REGION:-us-east-1}"
PROJECT_NAME="${PROJECT_NAME:-art-management-tool}"
S3_BUCKET_NAME="${S3_BUCKET_NAME:-art-images-dev}"
SKIP_BUILD=false

if [[ $# -lt 1 ]]; then
  error "Service name is required"
  usage
  exit 1
fi

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  exit 0
fi

SERVICE_NAME="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
    --endpoint) AWS_ENDPOINT_URL="$2"; shift 2 ;;
    --region) AWS_REGION="$2"; shift 2 ;;
    --project-name) PROJECT_NAME="$2"; shift 2 ;;
    --bucket) S3_BUCKET_NAME="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "${SERVICE_FUNCTIONS[$SERVICE_NAME]+_}" ]]; then
  error "Unknown service '${SERVICE_NAME}'"
  echo "Valid services: ${!SERVICE_FUNCTIONS[*]}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
SERVICE_DIR="$BACKEND_DIR/services/${SERVICE_NAME}-service"

if [[ ! -d "$SERVICE_DIR" ]]; then
  error "Service directory not found: $SERVICE_DIR"
  exit 1
fi

for cmd in node npm zip; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    error "Required command not found: $cmd"
    exit 1
  fi
done

if command -v awslocal >/dev/null 2>&1; then
  AWS_CMD=(awslocal)
elif command -v aws >/dev/null 2>&1; then
  export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
  export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
  export AWS_DEFAULT_REGION="$AWS_REGION"
  AWS_CMD=(aws --endpoint-url "$AWS_ENDPOINT_URL" --region "$AWS_REGION")
else
  error "Neither 'awslocal' nor 'aws' command is available"
  exit 1
fi

step "Preparing build for ${SERVICE_NAME}-service"
if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
  info "Installing backend dependencies"
  npm ci --prefix "$BACKEND_DIR"
fi

if [[ "$SKIP_BUILD" == "false" ]]; then
  npx --prefix "$BACKEND_DIR" tsc -p "$SERVICE_DIR/tsconfig.json" --outDir "$SERVICE_DIR/dist"
fi

PACKAGE_DIR="/tmp/localstack-lambda-package-${SERVICE_NAME}-$$"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

cp -r "$SERVICE_DIR/dist" "$PACKAGE_DIR/"
cp -r "$BACKEND_DIR/node_modules" "$PACKAGE_DIR/"

LAMBDA_ZIP="/tmp/localstack-lambda-${SERVICE_NAME}-$$.zip"
(cd "$PACKAGE_DIR" && zip -r "$LAMBDA_ZIP" . -q)
success "Package created: $LAMBDA_ZIP"

LAMBDA_ROLE_ARN="arn:aws:iam::000000000000:role/${PROJECT_NAME}-${ENVIRONMENT}-local-lambda-role"
RUNTIME="${RUNTIMES[$SERVICE_NAME]}"
TABLE_NAME="${SERVICE_TABLES[$SERVICE_NAME]}"
COMMON_ENV_VARS="DYNAMODB_TABLE_NAME=${TABLE_NAME},AWS_REGION=${AWS_REGION},AWS_REGION_NAME=${AWS_REGION},AWS_ENDPOINT_URL=${AWS_ENDPOINT_URL},ENVIRONMENT=${ENVIRONMENT},S3_BUCKET_NAME=${S3_BUCKET_NAME},CDN_URL=${AWS_ENDPOINT_URL}/${S3_BUCKET_NAME},JWT_SECRET=local-dev-secret,CORS_ALLOWED_ORIGINS=http://localhost:3000,PAYMENT_PROVIDER=mock,RATE_LIMIT_ENABLED=false,SCHEDULER_ENABLED=false,CONTENT_TABLE_NAME=content,PRODUCTS_TABLE_NAME=products,ORDERS_TABLE_NAME=orders,CARTS_TABLE_NAME=carts,DISCOUNTS_TABLE_NAME=discount-codes,AUDIT_TABLE_NAME=audit-logs,NOTIFICATIONS_TABLE_NAME=notifications,ETSY_TOKENS_TABLE_NAME=etsy-oauth-tokens"

step "Deploying Lambda functions to LocalStack"
FAILED=0
for FN_SUFFIX in ${SERVICE_FUNCTIONS[$SERVICE_NAME]}; do
  FUNCTION_NAME="${PROJECT_NAME}-${ENVIRONMENT}-${FN_SUFFIX}"
  HANDLER="${HANDLERS[$FN_SUFFIX]}"

  if [[ -z "$HANDLER" ]]; then
    error "Missing handler mapping for ${FN_SUFFIX}"
    FAILED=1
    continue
  fi

  if "${AWS_CMD[@]}" lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
    info "Updating ${FUNCTION_NAME}"
    "${AWS_CMD[@]}" lambda update-function-code \
      --function-name "$FUNCTION_NAME" \
      --zip-file "fileb://${LAMBDA_ZIP}" >/dev/null

    "${AWS_CMD[@]}" lambda update-function-configuration \
      --function-name "$FUNCTION_NAME" \
      --handler "$HANDLER" \
      --runtime "$RUNTIME" \
      --timeout 30 \
      --memory-size 256 \
      --environment "Variables={${COMMON_ENV_VARS}}" >/dev/null
  else
    info "Creating ${FUNCTION_NAME}"
    "${AWS_CMD[@]}" lambda create-function \
      --function-name "$FUNCTION_NAME" \
      --runtime "$RUNTIME" \
      --role "$LAMBDA_ROLE_ARN" \
      --handler "$HANDLER" \
      --timeout 30 \
      --memory-size 256 \
      --zip-file "fileb://${LAMBDA_ZIP}" \
        --environment "Variables={${COMMON_ENV_VARS}}" >/dev/null
  fi

  success "${FUNCTION_NAME} ready"
done

rm -rf "$PACKAGE_DIR" "$LAMBDA_ZIP"

if [[ "$FAILED" -ne 0 ]]; then
  error "One or more functions failed to deploy"
  exit 1
fi

success "LocalStack deployment completed for service: ${SERVICE_NAME}"
