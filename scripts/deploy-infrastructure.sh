#!/usr/bin/env bash
# deploy-infrastructure.sh — Terraform init, plan, confirm, apply, save outputs
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
  echo "  -p, --plan-only         Run plan only, do not apply"
  echo "  -o, --output-file FILE  Save terraform outputs to FILE (default: terraform-outputs.env)"
  echo "  -h, --help              Show this help message"
  echo ""
  echo "Environment variables required:"
  echo "  AWS_ACCESS_KEY_ID"
  echo "  AWS_SECRET_ACCESS_KEY"
  echo "  JWT_SECRET             (optional, auto-generated if absent)"
  echo "  ETSY_API_KEY           (optional)"
  echo "  ETSY_API_SECRET        (optional)"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") -e dev"
  echo "  $(basename "$0") -e prod --plan-only"
}

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
PLAN_ONLY=false
OUTPUT_FILE="terraform-outputs.env"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
    -r|--region)      AWS_REGION="$2"; shift 2 ;;
    -p|--plan-only)   PLAN_ONLY=true; shift ;;
    -o|--output-file) OUTPUT_FILE="$2"; shift 2 ;;
    -h|--help)        usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
  error "Invalid environment '$ENVIRONMENT'. Must be: dev, staging, prod"
  exit 1
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
step "Pre-flight checks"

for cmd in terraform aws python3; do
  if ! command -v "$cmd" &>/dev/null; then
    error "Required command not found: $cmd"
    exit 1
  fi
done
success "terraform, aws, and python3 found"

if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set"
  exit 1
fi
success "AWS credentials present"

# Warn for production deploys
if [[ "$ENVIRONMENT" == "prod" ]]; then
  warn "You are about to deploy infrastructure to PRODUCTION."
fi

# ---------------------------------------------------------------------------
# Locate Terraform working directory
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$REPO_ROOT/infrastructure/services"

if [[ ! -d "$TF_DIR" ]]; then
  error "Terraform directory not found: $TF_DIR"
  exit 1
fi

info "Environment  : ${BOLD}$ENVIRONMENT${RESET}"
info "AWS Region   : ${BOLD}$AWS_REGION${RESET}"
info "Terraform dir: $TF_DIR"

# ---------------------------------------------------------------------------
# Terraform init
# ---------------------------------------------------------------------------
step "Terraform init"
terraform -chdir="$TF_DIR" init -upgrade
success "Terraform initialised"

# ---------------------------------------------------------------------------
# Terraform format check
# ---------------------------------------------------------------------------
step "Terraform format check"
if terraform -chdir="$TF_DIR" fmt -check -recursive; then
  success "Formatting is correct"
else
  warn "Some files are not formatted — run 'terraform fmt -recursive infrastructure/' to fix"
fi

# ---------------------------------------------------------------------------
# Terraform validate
# ---------------------------------------------------------------------------
step "Terraform validate"
terraform -chdir="$TF_DIR" validate
success "Configuration is valid"

# ---------------------------------------------------------------------------
# Build plan vars
# ---------------------------------------------------------------------------
JWT_SECRET="${JWT_SECRET:-}"
ETSY_API_KEY="${ETSY_API_KEY:-}"
ETSY_API_SECRET="${ETSY_API_SECRET:-}"

PLAN_ARGS=(
  -var="environment=${ENVIRONMENT}"
  -var="aws_region=${AWS_REGION}"
)
[[ -n "$JWT_SECRET"      ]] && PLAN_ARGS+=(-var="jwt_secret=${JWT_SECRET}")
[[ -n "$ETSY_API_KEY"    ]] && PLAN_ARGS+=(-var="etsy_api_key=${ETSY_API_KEY}")
[[ -n "$ETSY_API_SECRET" ]] && PLAN_ARGS+=(-var="etsy_api_secret=${ETSY_API_SECRET}")

PLAN_FILE="/tmp/tfplan-${ENVIRONMENT}-$(date +%Y%m%d%H%M%S)"

# ---------------------------------------------------------------------------
# Terraform plan
# ---------------------------------------------------------------------------
step "Terraform plan"
terraform -chdir="$TF_DIR" plan "${PLAN_ARGS[@]}" -out="$PLAN_FILE"
success "Plan saved to $PLAN_FILE"

if [[ "$PLAN_ONLY" == "true" ]]; then
  info "Plan-only mode — skipping apply."
  exit 0
fi

# ---------------------------------------------------------------------------
# Confirmation prompt
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}${BOLD}Review the plan above carefully.${RESET}"
if [[ "$ENVIRONMENT" == "prod" ]]; then
  echo -e "${RED}${BOLD}This will modify PRODUCTION infrastructure.${RESET}"
fi
echo ""
read -r -p "$(echo -e "${BOLD}Apply changes to ${ENVIRONMENT}? [yes/no]: ${RESET}")" CONFIRM

if [[ "${CONFIRM,,}" != "yes" ]]; then
  warn "Deployment cancelled by user."
  exit 0
fi

# ---------------------------------------------------------------------------
# Terraform apply
# ---------------------------------------------------------------------------
step "Terraform apply"
terraform -chdir="$TF_DIR" apply "$PLAN_FILE"
success "Infrastructure applied successfully"

# ---------------------------------------------------------------------------
# Save outputs
# ---------------------------------------------------------------------------
step "Saving outputs"
OUTPUT_PATH="$REPO_ROOT/$OUTPUT_FILE"
{
  echo "# Terraform outputs — environment=${ENVIRONMENT} — $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  terraform -chdir="$TF_DIR" output -json | \
    python3 -c "
import sys, json, shlex
data = json.load(sys.stdin)
for k, v in data.items():
    val = v.get('value', '')
    if isinstance(val, (list, dict)):
        val = json.dumps(val, separators=(',', ':'))
    else:
        val = str(val)
    print(f'{k.upper()}={shlex.quote(val)}')
"
} > "$OUTPUT_PATH"
success "Outputs saved to $OUTPUT_PATH"
cat "$OUTPUT_PATH"

echo ""
success "Infrastructure deployment complete for environment: ${BOLD}${ENVIRONMENT}${RESET}"
