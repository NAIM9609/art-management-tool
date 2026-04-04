#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# import-log-groups.sh
#
# Pre-imports existing CloudWatch Log Groups into Terraform state to avoid
# "ResourceAlreadyExistsException" errors during terraform apply.
# AWS Lambda can auto-create log groups on first invocation; this script
# reconciles those with Terraform state so the resource block is treated as
# already-managed rather than needing to be (re)created.
#
# Usage:
#   ./scripts/import-log-groups.sh <environment> [project-name]
#
#   environment  – e.g. prod, staging, dev
#   project-name – defaults to art-management-tool
#
# Must be run from the Terraform working directory (infrastructure/services).
# ---------------------------------------------------------------------------

set -euo pipefail

ENVIRONMENT="${1:?Usage: $0 <environment> [project-name]}"
PROJECT_NAME="${2:-art-management-tool}"

LAMBDA_PREFIX="/aws/lambda/${PROJECT_NAME}-${ENVIRONMENT}-"
APIGW_PREFIX="/aws/apigateway/${PROJECT_NAME}-${ENVIRONMENT}-"

# ---------------------------------------------------------------------------
# Helper: attempt import; silently skip if already in state or not found in AWS
# ---------------------------------------------------------------------------
try_import() {
  local tf_addr="$1"
  local aws_id="$2"

  if terraform import "${tf_addr}" "${aws_id}" > /dev/null 2>&1; then
    echo "  ✓ Imported: ${aws_id}"
  else
    echo "  - Skipped (already managed or not found): ${aws_id}"
  fi
}

echo "=== Importing existing CloudWatch Log Groups ==="
echo "    Environment : ${ENVIRONMENT}"
echo "    Project     : ${PROJECT_NAME}"
echo ""

# ---------------------------------------------------------------------------
# Lambda log groups  →  for_each resources
# ---------------------------------------------------------------------------
echo "--- Lambda log groups (prefix: ${LAMBDA_PREFIX}) ---"

declare -A LAMBDA_SERVICE_MAP=(
  ["product-service"]="product_service"
  ["cart-service"]="cart_service"
  ["order-service"]="order_service"
  ["notification-service"]="notification_service"
  ["discount-service"]="discount_service"
  ["content-service"]="content_service"
  ["audit-service"]="audit_service"
  ["integration-service"]="integration_service"
)

LAMBDA_LOG_GROUPS=$(
  aws logs describe-log-groups \
    --log-group-name-prefix "${LAMBDA_PREFIX}" \
    --query 'logGroups[].logGroupName' \
    --output text 2>/dev/null || true
)

if [ -n "${LAMBDA_LOG_GROUPS}" ]; then
  for LOG_GROUP in ${LAMBDA_LOG_GROUPS}; do
    FUNC_KEY="${LOG_GROUP#"${LAMBDA_PREFIX}"}"   # strip the common prefix

    TF_RESOURCE=""
    for SERVICE in "${!LAMBDA_SERVICE_MAP[@]}"; do
      if [[ "${FUNC_KEY}" == "${SERVICE}-"* || "${FUNC_KEY}" == "${SERVICE}" ]]; then
        TF_NAME="${LAMBDA_SERVICE_MAP[$SERVICE]}"
        TF_RESOURCE="aws_cloudwatch_log_group.${TF_NAME}[\"${FUNC_KEY}\"]"
        break
      fi
    done

    if [ -z "${TF_RESOURCE}" ]; then
      echo "  ? Unrecognised log group, skipping: ${LOG_GROUP}"
      continue
    fi

    try_import "${TF_RESOURCE}" "${LOG_GROUP}"
  done
else
  echo "  No Lambda log groups found with this prefix."
fi

echo ""

# ---------------------------------------------------------------------------
# API Gateway log groups  →  single (non-for_each) resources
# ---------------------------------------------------------------------------
echo "--- API Gateway log groups (prefix: ${APIGW_PREFIX}) ---"

declare -A APIGW_SERVICE_MAP=(
  ["product-service"]="api_gateway"
  ["cart-service"]="cart_service_api_gateway"
  ["order-service"]="order_service_api_gateway"
  ["notification-service"]="notification_service_api_gateway"
  ["discount-service"]="discount_service_api_gateway"
  ["content-service"]="content_service_api_gateway"
  ["audit-service"]="audit_service_api_gateway"
  ["integration-service"]="integration_api_gateway"
)

for SERVICE_SUFFIX in "${!APIGW_SERVICE_MAP[@]}"; do
  LOG_GROUP="${APIGW_PREFIX}${SERVICE_SUFFIX}"
  TF_RESOURCE="aws_cloudwatch_log_group.${APIGW_SERVICE_MAP[$SERVICE_SUFFIX]}"

  EXISTS=$(
    aws logs describe-log-groups \
      --log-group-name-prefix "${LOG_GROUP}" \
      --query "logGroups[?logGroupName=='${LOG_GROUP}'].logGroupName" \
      --output text 2>/dev/null || true
  )

  if [ -n "${EXISTS}" ]; then
    try_import "${TF_RESOURCE}" "${LOG_GROUP}"
  fi
done

echo ""
echo "=== Import pass complete ==="
