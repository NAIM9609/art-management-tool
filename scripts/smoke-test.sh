#!/usr/bin/env bash
# smoke-test.sh — Test all API endpoints, verify responses, report failures
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
error()   { echo -e "${RED}[FAIL]${RESET}  $*" >&2; }
step()    { echo -e "\n${BOLD}${CYAN}==> $*${RESET}"; }

PASS=0
FAIL=0
SKIP=0
declare -a FAILURES=()

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  echo -e "${BOLD}Usage:${RESET} $(basename "$0") [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -e, --environment ENV   Target environment: dev | staging | prod (default: dev)"
  echo "  -u, --url URL           API Gateway base URL (overrides \$API_GATEWAY_URL)"
  echo "  -t, --timeout SECS      Request timeout in seconds (default: 10)"
  echo "  -v, --verbose           Show response bodies"
  echo "  -h, --help              Show this help message"
  echo ""
  echo "Environment variables:"
  echo "  API_GATEWAY_URL   Base URL of the deployed API"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") -u https://abc123.execute-api.eu-north-1.amazonaws.com/dev"
  echo "  $(basename "$0") -e prod"
}

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENVIRONMENT="${ENVIRONMENT:-dev}"
API_BASE="${API_GATEWAY_URL:-}"
TIMEOUT=10
VERBOSE=false

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
    -u|--url)         API_BASE="$2"; shift 2 ;;
    -t|--timeout)     TIMEOUT="$2"; shift 2 ;;
    -v|--verbose)     VERBOSE=true; shift ;;
    -h|--help)        usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "$API_BASE" ]]; then
  error "API base URL is required. Set API_GATEWAY_URL or use --url."
  usage
  exit 1
fi

# Strip trailing slash
API_BASE="${API_BASE%/}"

# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------
# test_endpoint <method> <path> <expected_status_prefix> <description>
# expected_status_prefix: "2" = 2xx, "4" = 4xx, "23" = 2xx or 3xx, etc.
test_endpoint() {
  local method="$1"
  local path="$2"
  local expected_prefix="$3"
  local description="$4"
  local url="${API_BASE}${path}"

  local BODY_FILE
  BODY_FILE=$(mktemp)
  trap 'rm -f "$BODY_FILE"' RETURN

  local http_status
  http_status=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
    --max-time "$TIMEOUT" \
    -X "$method" \
    -H "Accept: application/json" \
    "$url" 2>/dev/null || echo "000")

  local first_digit="${http_status:0:1}"
  local passed=false

  # Check if first digit is in expected_prefix
  if echo "$expected_prefix" | grep -q "$first_digit"; then
    passed=true
  fi

  if [[ "$passed" == "true" ]]; then
    success "${method} ${path} → ${http_status}  (${description})"
    PASS=$(( PASS + 1 ))
  elif [[ "$http_status" == "000" ]]; then
    error "${method} ${path} → TIMEOUT/UNREACHABLE  (${description})"
    FAILURES+=("${method} ${path}: timeout/unreachable")
    FAIL=$(( FAIL + 1 ))
  else
    error "${method} ${path} → ${http_status}  (${description})"
    FAILURES+=("${method} ${path}: HTTP ${http_status} (expected ${expected_prefix}xx)")
    FAIL=$(( FAIL + 1 ))
  fi

  if [[ "$VERBOSE" == "true" ]] && [[ -s "$BODY_FILE" ]]; then
    echo -e "  ${CYAN}Response:${RESET} $(head -c 200 "$BODY_FILE")"
  fi
}

# ---------------------------------------------------------------------------
# Run tests
# ---------------------------------------------------------------------------
echo -e "${BOLD}Art Management Tool — Smoke Tests${RESET}"
echo -e "API Base URL : ${CYAN}${API_BASE}${RESET}"
echo -e "Environment  : ${BOLD}${ENVIRONMENT}${RESET}"
echo ""

# ---------------------------------------------------------------------------
# Product Service
# ---------------------------------------------------------------------------
step "Product Service"
test_endpoint GET  "/api/products"                "23"  "List products (public)"
test_endpoint GET  "/api/products/nonexistent-id" "4"   "Get unknown product → 404"
test_endpoint GET  "/api/categories"              "23"  "List categories (public)"
test_endpoint POST "/api/products"                "4"   "Create product without auth → 401/403"

# ---------------------------------------------------------------------------
# Cart Service
# ---------------------------------------------------------------------------
step "Cart Service"
test_endpoint GET  "/api/cart"                    "234" "Get cart (no session → 200 empty cart, or 400/404)"
test_endpoint POST "/api/cart/items"              "4"   "Add item without body → 400/401"

# ---------------------------------------------------------------------------
# Order Service
# ---------------------------------------------------------------------------
step "Order Service"
test_endpoint GET  "/api/orders"                  "4"   "List orders without auth → 401/403"
test_endpoint GET  "/api/orders/nonexistent-id"   "4"   "Get unknown order → 401/403/404"
test_endpoint POST "/api/orders"                  "4"   "Create order without auth → 401/403"

# ---------------------------------------------------------------------------
# Discount Service
# ---------------------------------------------------------------------------
step "Discount Service"
test_endpoint GET  "/api/discounts"               "4"   "List discounts without auth → 401/403"
test_endpoint POST "/api/discounts/validate"      "4"   "Validate discount without body → 400/401"

# ---------------------------------------------------------------------------
# Notification Service
# ---------------------------------------------------------------------------
step "Notification Service"
test_endpoint GET  "/api/notifications"           "4"   "List notifications without auth → 401/403"

# ---------------------------------------------------------------------------
# Content Service
# ---------------------------------------------------------------------------
step "Content Service"
test_endpoint GET  "/api/personaggi"              "23"  "List personaggi (public)"
test_endpoint GET  "/api/fumetti"                 "23"  "List fumetti (public)"

# ---------------------------------------------------------------------------
# Audit Service
# ---------------------------------------------------------------------------
step "Audit Service"
test_endpoint GET  "/api/audit/entity/test"       "4"   "Get entity history without auth → 401/403"
test_endpoint GET  "/api/audit/user/test"         "4"   "Get user activity without auth → 401/403"

# ---------------------------------------------------------------------------
# Integration Service
# ---------------------------------------------------------------------------
step "Integration Service"
test_endpoint GET  "/api/integrations/etsy/oauth" "4"   "Etsy OAuth without auth → 401/403"

# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------
step "Admin endpoints"
test_endpoint GET  "/api/admin/orders"            "4"   "Admin orders without auth → 401/403"
test_endpoint GET  "/api/admin/products"          "4"   "Admin products without auth → 401/403"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL=$(( PASS + FAIL + SKIP ))
echo ""
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo -e "${BOLD}Smoke Test Summary${RESET}"
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo -e "  Total  : ${BOLD}${TOTAL}${RESET}"
echo -e "  ${GREEN}Passed : ${PASS}${RESET}"
echo -e "  ${YELLOW}Skipped: ${SKIP}${RESET}"

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "  ${RED}Failed : ${FAIL}${RESET}"
  echo ""
  echo -e "${RED}${BOLD}Failures:${RESET}"
  for FAILURE in "${FAILURES[@]}"; do
    echo -e "  ${RED}✗${RESET} ${FAILURE}"
  done
  echo ""
  exit 1
else
  echo -e "  ${GREEN}Failed : 0${RESET}"
  echo ""
  success "All smoke tests passed."
fi
