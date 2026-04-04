#!/usr/bin/env bash
# deploy-all.sh — Deploy infrastructure + all services, run smoke tests, display endpoints
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
  echo "  -e, --environment ENV      Target environment: dev | staging | prod (default: dev)"
  echo "  -r, --region REGION        AWS region (default: \$AWS_REGION_CUSTOM or eu-north-1)"
  echo "  -b, --bucket BUCKET        S3 bucket for Lambda artifacts (\$LAMBDA_BUCKET)"
  echo "  --skip-infrastructure      Skip Terraform infrastructure deployment"
  echo "  --skip-smoke               Skip smoke tests"
  echo "  --skip-tests               Skip unit tests during service deploys"
  echo "  --services LIST            Comma-separated list of services to deploy"
  echo "                             (default: all services)"
  echo "  -h, --help                 Show this help message"
  echo ""
  echo "Environment variables:"
  echo "  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  echo "  LAMBDA_BUCKET     S3 bucket for Lambda packages"
  echo "  JWT_SECRET        Optional override for infrastructure"
  echo "  API_GATEWAY_URL   Base URL for smoke tests (optional)"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") -e dev"
  echo "  $(basename "$0") -e staging --skip-infrastructure"
  echo "  $(basename "$0") -e prod --services product,order"
}

# ---------------------------------------------------------------------------
# All known services (deployment order)
# ---------------------------------------------------------------------------
ALL_SERVICES=(
  product
  discount
  cart
  order
  content
  notification
  audit
  integration
)

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION_CUSTOM="${AWS_REGION_CUSTOM:-eu-north-1}"
LAMBDA_BUCKET="${LAMBDA_BUCKET:-}"
SKIP_INFRA=false
SKIP_SMOKE=false
SKIP_TESTS=false
SERVICES_TO_DEPLOY=()

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment)      ENVIRONMENT="$2"; shift 2 ;;
    -r|--region)           AWS_REGION_CUSTOM="$2"; shift 2 ;;
    -b|--bucket)           LAMBDA_BUCKET="$2"; shift 2 ;;
    --skip-infrastructure) SKIP_INFRA=true; shift ;;
    --skip-smoke)          SKIP_SMOKE=true; shift ;;
    --skip-tests)          SKIP_TESTS=true; shift ;;
    --services)
      IFS=',' read -ra RAW_SERVICES <<< "$2"
      SERVICES_TO_DEPLOY=()
      for svc in "${RAW_SERVICES[@]}"; do
        svc_trimmed="${svc#"${svc%%[![:space:]]*}"}"
        svc_trimmed="${svc_trimmed%"${svc_trimmed##*[![:space:]]}"}"
        if [[ -n "$svc_trimmed" ]]; then
          SERVICES_TO_DEPLOY+=("$svc_trimmed")
        fi
      done
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Default: deploy all services
if [[ ${#SERVICES_TO_DEPLOY[@]} -eq 0 ]]; then
  SERVICES_TO_DEPLOY=("${ALL_SERVICES[@]}")
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

for cmd in node npm aws zip; do
  if ! command -v "$cmd" &>/dev/null; then
    error "Required command not found: $cmd"
    exit 1
  fi
done
[[ "$SKIP_INFRA" == "false" ]] && ! command -v terraform &>/dev/null && \
  error "terraform not found (required unless --skip-infrastructure)" && exit 1

if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set"
  exit 1
fi

if [[ -z "$LAMBDA_BUCKET" ]]; then
  error "LAMBDA_BUCKET is required (set env var or use -b)"
  exit 1
fi
success "Pre-flight checks passed"

echo ""
echo -e "${BOLD}Deployment Summary${RESET}"
echo -e "  Environment : ${BOLD}${ENVIRONMENT}${RESET}"
echo -e "  Region      : ${BOLD}${AWS_REGION_CUSTOM}${RESET}"
echo -e "  Services    : ${BOLD}${SERVICES_TO_DEPLOY[*]}${RESET}"
echo -e "  Skip Infra  : ${BOLD}${SKIP_INFRA}${RESET}"
echo ""

# Production confirmation
if [[ "$ENVIRONMENT" == "prod" ]]; then
  echo -e "${RED}${BOLD}WARNING: You are about to deploy to PRODUCTION.${RESET}"
  read -r -p "$(echo -e "${BOLD}Type 'yes' to confirm: ${RESET}")" CONFIRM
  if [[ "${CONFIRM,,}" != "yes" ]]; then
    warn "Deployment cancelled."
    exit 0
  fi
fi

START_TIME=$(date +%s)

# ---------------------------------------------------------------------------
# 1. Deploy infrastructure
# ---------------------------------------------------------------------------
if [[ "$SKIP_INFRA" == "false" ]]; then
  step "Step 1/3: Deploying infrastructure"
  export ENVIRONMENT AWS_REGION_CUSTOM JWT_SECRET="${JWT_SECRET:-}" \
         ETSY_API_KEY="${ETSY_API_KEY:-}" ETSY_API_SECRET="${ETSY_API_SECRET:-}"
  bash "$SCRIPT_DIR/deploy-infrastructure.sh" \
    --environment "$ENVIRONMENT" \
    --region "$AWS_REGION_CUSTOM" \
    --output-file "terraform-outputs-${ENVIRONMENT}.env"
  success "Infrastructure deployed"

  # Source outputs if available
  OUTPUTS_FILE="$(cd "$SCRIPT_DIR/.." && pwd)/terraform-outputs-${ENVIRONMENT}.env"
  if [[ -f "$OUTPUTS_FILE" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$OUTPUTS_FILE"; set +a
    info "Terraform outputs loaded from $OUTPUTS_FILE"
  fi
else
  warn "Skipping infrastructure deployment (--skip-infrastructure)"
fi

# ---------------------------------------------------------------------------
# 2. Deploy all services
# ---------------------------------------------------------------------------
step "Step 2/3: Deploying services"
FAILED_SERVICES=()

for SVC in "${SERVICES_TO_DEPLOY[@]}"; do
  info "Deploying ${SVC}-service..."
  DEPLOY_ARGS=(
    "$SVC"
    --environment "$ENVIRONMENT"
    --region "$AWS_REGION_CUSTOM"
    --bucket "$LAMBDA_BUCKET"
    --skip-smoke   # smoke tests run collectively below
  )
  [[ "$SKIP_TESTS" == "true" ]] && DEPLOY_ARGS+=(--skip-tests)

  if bash "$SCRIPT_DIR/deploy-service.sh" "${DEPLOY_ARGS[@]}"; then
    success "${SVC}-service deployed"
  else
    error "${SVC}-service deployment FAILED"
    FAILED_SERVICES+=("$SVC")
  fi
done

if [[ ${#FAILED_SERVICES[@]} -gt 0 ]]; then
  error "The following services failed to deploy: ${FAILED_SERVICES[*]}"
  exit 1
fi
success "All services deployed"

# ---------------------------------------------------------------------------
# 3. Run smoke tests
# ---------------------------------------------------------------------------
if [[ "$SKIP_SMOKE" == "true" ]]; then
  warn "Skipping smoke tests (--skip-smoke)"
else
  step "Step 3/3: Running smoke tests"
  SMOKE_ARGS=(--environment "$ENVIRONMENT")
  [[ -n "${API_GATEWAY_URL:-}" ]] && SMOKE_ARGS+=(--url "$API_GATEWAY_URL")
  if bash "$SCRIPT_DIR/smoke-test.sh" "${SMOKE_ARGS[@]}"; then
    success "All smoke tests passed"
  else
    error "Smoke tests reported failures"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Display endpoints
# ---------------------------------------------------------------------------
END_TIME=$(date +%s)
DURATION=$(( END_TIME - START_TIME ))
MINUTES=$(( DURATION / 60 ))
SECONDS=$(( DURATION % 60 ))

echo ""
HEADER="  Deployment Complete: ${ENVIRONMENT}  "
BORDER=$(printf '═%.0s' $(seq 1 ${#HEADER}))
echo -e "${BOLD}${GREEN}╔${BORDER}╗${RESET}"
echo -e "${BOLD}${GREEN}║${HEADER}║${RESET}"
echo -e "${BOLD}${GREEN}╚${BORDER}╝${RESET}"
echo ""
echo -e "  ${BOLD}Duration:${RESET} ${MINUTES}m ${SECONDS}s"
echo ""
if [[ -n "${API_GATEWAY_URL:-}" ]]; then
  echo -e "  ${BOLD}Endpoints:${RESET}"
  echo -e "    API Gateway  : ${CYAN}${API_GATEWAY_URL}${RESET}"
  echo -e "    Products     : ${CYAN}${API_GATEWAY_URL}/api/products${RESET}"
  echo -e "    Orders       : ${CYAN}${API_GATEWAY_URL}/api/orders?email=customer@example.com${RESET}"
  echo -e "    Cart         : ${CYAN}${API_GATEWAY_URL}/api/cart${RESET}"
  echo -e "    Discounts    : ${CYAN}${API_GATEWAY_URL}/api/admin/discounts${RESET}"
  echo -e "    Notifications: ${CYAN}${API_GATEWAY_URL}/api/admin/notifications${RESET}"
  echo -e "    Audit        : ${CYAN}${API_GATEWAY_URL}/api/admin/audit/entity/test/123${RESET}"
  echo -e "    Etsy OAuth   : ${CYAN}${API_GATEWAY_URL}/api/integrations/etsy/auth${RESET}"
  echo -e "    Content      : ${CYAN}${API_GATEWAY_URL}/api/personaggi${RESET}"
fi
echo ""
