#!/usr/bin/env bash
# logs.sh — Tail and filter CloudWatch logs for a Lambda service
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

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  echo -e "${BOLD}Usage:${RESET} $(basename "$0") <service-name> [OPTIONS]"
  echo ""
  echo "Arguments:"
  echo "  service-name   One of: audit, cart, content, discount, integration,"
  echo "                         notification, order, product"
  echo "                 Use 'all' to stream logs from all services."
  echo ""
  echo "Options:"
  echo "  -e, --environment ENV      Target environment: dev | staging | prod (default: dev)"
  echo "  -r, --region REGION        AWS region (default: \$AWS_REGION or eu-north-1)"
  echo "  -f, --follow               Follow/tail mode (stream new log events)"
  echo "  -l, --level LEVEL          Filter by log level: ERROR | WARN | INFO | DEBUG"
  echo "  -n, --function FUNCTION    Tail a specific function (e.g. list-products)"
  echo "  -s, --since DURATION       Start time, e.g. 1h, 30m, 2d (default: 10m)"
  echo "  -p, --pattern PATTERN      Additional grep filter pattern"
  echo "  -h, --help                 Show this help message"
  echo ""
  echo "Environment variables:"
  echo "  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  echo ""
  echo "Examples:"
  echo "  $(basename "$0") product"
  echo "  $(basename "$0") product --follow"
  echo "  $(basename "$0") product --follow --level ERROR"
  echo "  $(basename "$0") product -f -l WARN -n list-products"
  echo "  $(basename "$0") all -e staging --follow"
}

# ---------------------------------------------------------------------------
# Service → function suffixes map (for log group discovery)
# ---------------------------------------------------------------------------
declare -A SERVICE_FUNCTIONS
SERVICE_FUNCTIONS[audit]="get-entity-history get-user-activity get-activity-by-date"
SERVICE_FUNCTIONS[cart]="get-cart add-item update-quantity remove-item clear-cart apply-discount remove-discount"
SERVICE_FUNCTIONS[content]="list-personaggi get-personaggio create-personaggio update-personaggio delete-personaggio get-personaggio-upload-url list-fumetti get-fumetto create-fumetto update-fumetto delete-fumetto get-fumetto-upload-url"
SERVICE_FUNCTIONS[discount]="validate-code list-discounts get-discount create-discount update-discount delete-discount get-stats"
SERVICE_FUNCTIONS[integration]="etsy-initiate-oauth etsy-handle-callback etsy-sync-products etsy-sync-inventory etsy-sync-orders etsy-webhook etsy-scheduled-sync"
SERVICE_FUNCTIONS[notification]="list-notifications mark-as-read mark-all-read delete-notification"
SERVICE_FUNCTIONS[order]="create-order get-order get-customer-orders list-orders update-status process-payment webhook"
SERVICE_FUNCTIONS[product]="list-products get-product create-product update-product delete-product list-categories get-category create-category update-category delete-category list-variants create-variant update-variant update-stock get-upload-url list-images delete-image"

ALL_SERVICES=(audit cart content discount integration notification order product)

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
SERVICE_NAME=""
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
FOLLOW=false
LOG_LEVEL=""
SPECIFIC_FUNCTION=""
SINCE="10m"
PATTERN=""
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
    -r|--region)      AWS_REGION="$2"; shift 2 ;;
    -f|--follow)      FOLLOW=true; shift ;;
    -l|--level)       LOG_LEVEL="${2^^}"; shift 2 ;;
    -n|--function)    SPECIFIC_FUNCTION="$2"; shift 2 ;;
    -s|--since)       SINCE="$2"; shift 2 ;;
    -p|--pattern)     PATTERN="$2"; shift 2 ;;
    -h|--help)        usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Validate service
if [[ "$SERVICE_NAME" != "all" ]] && \
   [[ -z "${SERVICE_FUNCTIONS[$SERVICE_NAME]+_}" ]]; then
  error "Unknown service '${SERVICE_NAME}'."
  echo "Valid services: all ${!SERVICE_FUNCTIONS[*]}"
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
if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set"
  exit 1
fi

if ! command -v aws &>/dev/null; then
  error "aws CLI not found"
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  error "python3 not found"
  exit 1
fi

# ---------------------------------------------------------------------------
# Convert SINCE to epoch milliseconds for --start-time
# ---------------------------------------------------------------------------
since_to_ms() {
  local dur="$1"
  local value unit
  value="${dur//[^0-9]/}"
  unit="${dur//[0-9]/}"
  local secs
  case "${unit,,}" in
    s) secs=$value ;;
    m) secs=$(( value * 60 )) ;;
    h) secs=$(( value * 3600 )) ;;
    d) secs=$(( value * 86400 )) ;;
    *) secs=600 ;;
  esac
  echo $(( ($(date +%s) - secs) * 1000 ))
}

START_MS=$(since_to_ms "$SINCE")

# ---------------------------------------------------------------------------
# Build list of log groups to tail
# ---------------------------------------------------------------------------
LOG_GROUPS=()

if [[ "$SERVICE_NAME" == "all" ]]; then
  SERVICES_TO_LOG=("${ALL_SERVICES[@]}")
else
  SERVICES_TO_LOG=("$SERVICE_NAME")
fi

for SVC in "${SERVICES_TO_LOG[@]}"; do
  if [[ -n "$SPECIFIC_FUNCTION" ]]; then
    LG="/aws/lambda/${PROJECT_NAME}-${ENVIRONMENT}-${SVC}-service-${SPECIFIC_FUNCTION}"
    LOG_GROUPS+=("$LG")
  else
    read -ra FNS <<< "${SERVICE_FUNCTIONS[$SVC]}"
    for FN_SUFFIX in "${FNS[@]}"; do
      LG="/aws/lambda/${PROJECT_NAME}-${ENVIRONMENT}-${SVC}-service-${FN_SUFFIX}"
      LOG_GROUPS+=("$LG")
    done
  fi
done

if [[ ${#LOG_GROUPS[@]} -eq 0 ]]; then
  error "No log groups resolved."
  exit 1
fi

info "Environment : ${BOLD}${ENVIRONMENT}${RESET}"
info "Service     : ${BOLD}${SERVICE_NAME}${RESET}"
info "Region      : ${BOLD}${AWS_REGION}${RESET}"
info "Since       : ${BOLD}${SINCE}${RESET}"
[[ -n "$LOG_LEVEL"  ]] && info "Level filter: ${BOLD}${LOG_LEVEL}${RESET}"
[[ -n "$PATTERN"    ]] && info "Pattern     : ${BOLD}${PATTERN}${RESET}"
[[ "$FOLLOW" == "true" ]] && info "Mode        : ${BOLD}follow${RESET}"
echo ""

# ---------------------------------------------------------------------------
# Color-code log lines by level
# ---------------------------------------------------------------------------
colorize_log() {
  while IFS= read -r line; do
    if echo "$line" | grep -qiE '\bERROR\b|\bFATAL\b'; then
      echo -e "${RED}${line}${RESET}"
    elif echo "$line" | grep -qiE '\bWARN\b|\bWARNING\b'; then
      echo -e "${YELLOW}${line}${RESET}"
    elif echo "$line" | grep -qiE '\bINFO\b'; then
      echo -e "${GREEN}${line}${RESET}"
    elif echo "$line" | grep -qiE '\bDEBUG\b'; then
      echo -e "${CYAN}${line}${RESET}"
    else
      echo "$line"
    fi
  done
}

# Convert epoch milliseconds to a human-readable timestamp
ms_to_human() {
  local ts="$1"
  date -d "@$(( ts / 1000 ))" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || \
  date -r "$(( ts / 1000 ))" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || \
  echo "$ts"
}

# ---------------------------------------------------------------------------
# Filter events for a single log group
# ---------------------------------------------------------------------------
fetch_log_group() {
  local lg="$1"
  local next_token=""
  local token_arg=()

  # Verify log group exists
  if ! aws logs describe-log-groups \
       --log-group-name-prefix "$lg" \
       --region "$AWS_REGION" \
       --query "logGroups[?logGroupName=='${lg}'].logGroupName" \
       --output text 2>/dev/null | grep -q .; then
    warn "Log group not found (may not have received traffic): ${lg}"
    return 0
  fi

  echo -e "${BOLD}${CYAN}── ${lg} ──${RESET}"

  local filter_args=(
    --log-group-name "$lg"
    --start-time "$START_MS"
    --region "$AWS_REGION"
    --output json
  )

  if [[ -n "$LOG_LEVEL" ]]; then
    filter_args+=(--filter-pattern "\"${LOG_LEVEL}\"")
  fi

  while true; do
    local response
    response=$(aws logs filter-log-events "${filter_args[@]}" \
      "${token_arg[@]}" 2>/dev/null || true)

    local result
    result=$(python3 -c "
import json, sys
payload = sys.stdin.read().strip()
if not payload:
    raise SystemExit(0)
data = json.loads(payload)
for event in data.get('events', []):
    timestamp = event.get('timestamp', '')
    message = str(event.get('message', '')).replace('\t', '    ').replace('\n', '\\n')
    print(f'{timestamp}\t{message}')
" <<< "$response")

    if [[ -n "$result" ]]; then
      # Format: timestamp<TAB>message — convert epoch ms to human time
      while IFS=$'\t' read -r ts msg; do
        if [[ -z "$ts" ]]; then continue; fi
        HUMAN_TS=$(ms_to_human "$ts")
        LINE="[${HUMAN_TS}] ${msg}"
        if [[ -n "$PATTERN" ]]; then
          echo "$LINE" | grep --color=never -i "$PATTERN" || true
        else
          echo "$LINE"
        fi
      done <<< "$result"
    fi

    next_token=$(python3 -c "
import json, sys
payload = sys.stdin.read().strip()
if not payload:
    print('')
    raise SystemExit(0)
data = json.loads(payload)
print(data.get('nextToken', ''))
" <<< "$response")

    if [[ -z "$next_token" ]] || [[ "$next_token" == "None" ]]; then
      break
    fi
    token_arg=(--next-token "$next_token")
  done
}

# ---------------------------------------------------------------------------
# Follow mode — continuously poll log groups
# ---------------------------------------------------------------------------
if [[ "$FOLLOW" == "true" ]]; then
  echo -e "${BOLD}Streaming logs (Ctrl+C to stop)...${RESET}"
  echo ""

  # Track the watermark per log group
  declare -A LG_START
  for LG in "${LOG_GROUPS[@]}"; do
    LG_START["$LG"]=$START_MS
  done

  while true; do
    for LG in "${LOG_GROUPS[@]}"; do
      # Verify group exists silently
      if ! aws logs describe-log-groups \
           --log-group-name-prefix "$LG" \
           --region "$AWS_REGION" \
           --query "logGroups[?logGroupName=='${LG}'].logGroupName" \
           --output text 2>/dev/null | grep -q .; then
        continue
      fi

      local_start="${LG_START[$LG]}"
      local_end=$(( $(date +%s) * 1000 ))

      FILTER_ARGS=(
        --log-group-name "$LG"
        --start-time "$local_start"
        --end-time "$local_end"
        --region "$AWS_REGION"
        --output text
        --query "events[*].[timestamp,message]"
      )
      [[ -n "$LOG_LEVEL" ]] && FILTER_ARGS+=(--filter-pattern "\"${LOG_LEVEL}\"")

      result=$(aws logs filter-log-events "${FILTER_ARGS[@]}" 2>/dev/null || true)

      if [[ -n "$result" ]]; then
        while IFS=$'\t' read -r ts msg; do
          [[ -z "$ts" ]] && continue
          HUMAN_TS=$(ms_to_human "$ts")
          LABEL=$(echo "$LG" | sed 's|.*/||')
          LINE="${BOLD}[${LABEL}]${RESET} [${HUMAN_TS}] ${msg}"
          if [[ -n "$PATTERN" ]]; then
            echo -e "$LINE" | grep --color=never -i "$PATTERN" | colorize_log || true
          else
            echo -e "$LINE" | colorize_log
          fi
        done <<< "$result"
        # Advance watermark past the last event
        LATEST_TS=$(echo "$result" | awk -F'\t' '{print $1}' | sort -n | tail -1)
        if [[ -n "$LATEST_TS" ]]; then
          LG_START["$LG"]=$(( LATEST_TS + 1 ))
        fi
      fi
    done
    sleep 5
  done
else
  # ---------------------------------------------------------------------------
  # One-shot mode — fetch and display logs
  # ---------------------------------------------------------------------------
  for LG in "${LOG_GROUPS[@]}"; do
    fetch_log_group "$LG" | colorize_log
  done
  echo ""
  success "Log retrieval complete."
fi
