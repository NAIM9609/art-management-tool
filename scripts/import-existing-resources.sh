#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# import-existing-resources.sh
#
# Pre-imports AWS resources that already exist into Terraform state so that
# `terraform apply` does not fail with EntityAlreadyExists (409) or
# ResourceAlreadyExistsException (400) errors.
#
# Covers:
#   • IAM Roles       (one per service)
#   • IAM Policies    (DynamoDB, S3, SES, SNS, SSM — wherever they exist)
#   • IAM Policy Attachments (role ↔ policy pairs)
#   • CloudWatch Log Groups  (Lambda /aws/lambda/… and API GW /aws/apigateway/…)
#
# Usage (run from infrastructure/services):
#   bash ../../scripts/import-existing-resources.sh <environment> [project-name]
#
#   environment  – dev | staging | prod
#   project-name – defaults to art-management-tool
# ---------------------------------------------------------------------------

set -euo pipefail

ENVIRONMENT="${1:?Usage: $0 <environment> [project-name]}"
PROJECT_NAME="${2:-art-management-tool}"
PREFIX="${PROJECT_NAME}-${ENVIRONMENT}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
try_import() {
  local tf_addr="$1"
  local aws_id="$2"
  local output
  # Always pass the environment variable so Terraform uses the correct resource names.
  if output=$(terraform import -var="environment=${ENVIRONMENT}" "${tf_addr}" "${aws_id}" 2>&1); then
    echo "  ✓ Imported  : ${tf_addr}"
  else
    if echo "${output}" | grep -qE "Resource already managed|already exists in state"; then
      echo "  = In state  : ${tf_addr}"
    elif echo "${output}" | grep -qiE "does not exist|NoSuchEntity|NotFoundException|not found"; then
      echo "  ~ Not found : ${tf_addr}  (${aws_id})"
    else
      # Show the actual error so CI logs make it obvious what went wrong.
      echo "  ! Error     : ${tf_addr}"
      echo "${output}" | grep -v "^$" | head -8 | sed 's/^/    /'
    fi
  fi
}

iam_policy_arn() {
  # Returns the ARN for a local IAM policy by name, or empty string if absent.
  local policy_name="$1"
  aws iam list-policies --scope Local \
    --query "Policies[?PolicyName=='${policy_name}'].Arn" \
    --output text 2>/dev/null || true
}

role_exists() {
  aws iam get-role --role-name "$1" > /dev/null 2>&1
}

echo "============================================================"
echo " Importing existing AWS resources into Terraform state"
echo "  Environment : ${ENVIRONMENT}"
echo "  Project     : ${PROJECT_NAME}"
echo "  Prefix      : ${PREFIX}"
echo "============================================================"
echo ""

# ---------------------------------------------------------------------------
# 1. IAM Roles
# ---------------------------------------------------------------------------
echo "--- IAM Roles ---"

declare -A IAM_ROLE_MAP=(
  ["product_service_lambda"]="${PREFIX}-product-service-lambda-role"
  ["cart_service_lambda"]="${PREFIX}-cart-service-lambda-role"
  ["order_service_lambda"]="${PREFIX}-order-service-lambda-role"
  ["notification_service_lambda"]="${PREFIX}-notification-service-lambda-role"
  ["discount_service_lambda"]="${PREFIX}-discount-service-lambda-role"
  ["content_service_lambda"]="${PREFIX}-content-service-lambda-role"
  ["audit_service_lambda"]="${PREFIX}-audit-service-lambda-role"
  ["integration_service_lambda"]="${PREFIX}-integration-service-lambda-role"
)

for TF_NAME in "${!IAM_ROLE_MAP[@]}"; do
  ROLE_NAME="${IAM_ROLE_MAP[$TF_NAME]}"
  if role_exists "${ROLE_NAME}"; then
    try_import "aws_iam_role.${TF_NAME}" "${ROLE_NAME}"
  else
    echo "  ~ Not found : aws_iam_role.${TF_NAME} (${ROLE_NAME})"
  fi
done

echo ""

# ---------------------------------------------------------------------------
# 2. IAM Policies
# ---------------------------------------------------------------------------
echo "--- IAM Policies ---"

# Format: ["tf_address"]="aws-policy-name"
declare -A IAM_POLICY_MAP=(
  ["aws_iam_policy.product_service_dynamodb"]="${PREFIX}-product-service-dynamodb"
  ["aws_iam_policy.product_service_s3"]="${PREFIX}-product-service-s3"
  ["aws_iam_policy.cart_service_dynamodb"]="${PREFIX}-cart-service-dynamodb"
  ["aws_iam_policy.order_service_dynamodb"]="${PREFIX}-order-service-dynamodb"
  ["aws_iam_policy.order_service_ses[0]"]="${PREFIX}-order-service-ses"
  ["aws_iam_policy.order_service_sns[0]"]="${PREFIX}-order-service-sns"
  ["aws_iam_policy.order_service_ssm[0]"]="${PREFIX}-order-service-ssm"
  ["aws_iam_policy.notification_service_dynamodb"]="${PREFIX}-notification-service-dynamodb"
  ["aws_iam_policy.discount_service_dynamodb"]="${PREFIX}-discount-service-dynamodb"
  ["aws_iam_policy.content_service_dynamodb"]="${PREFIX}-content-service-dynamodb"
  ["aws_iam_policy.content_service_s3"]="${PREFIX}-content-service-s3"
  ["aws_iam_policy.audit_service_dynamodb"]="${PREFIX}-audit-service-dynamodb"
  ["aws_iam_policy.integration_service_dynamodb"]="${PREFIX}-integration-service-dynamodb"
)

for TF_ADDR in "${!IAM_POLICY_MAP[@]}"; do
  POLICY_NAME="${IAM_POLICY_MAP[$TF_ADDR]}"
  ARN=$(iam_policy_arn "${POLICY_NAME}")
  if [ -n "${ARN}" ]; then
    try_import "${TF_ADDR}" "${ARN}"
  else
    echo "  ~ Not found : ${TF_ADDR} (${POLICY_NAME})"
  fi
done

echo ""

# ---------------------------------------------------------------------------
# 3. IAM Role Policy Attachments
#    Format: <role-name>/<policy-arn>
# ---------------------------------------------------------------------------
echo "--- IAM Role Policy Attachments ---"

AWS_LAMBDA_EXEC_POLICY="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"

import_attachment() {
  local tf_addr="$1"
  local role_name="$2"
  local policy_arn="$3"
  # Only attempt if both the role and the policy are known to exist
  if role_exists "${role_name}" && [ -n "${policy_arn}" ]; then
    try_import "${tf_addr}" "${role_name}/${policy_arn}"
  fi
}

# Logs attachments (managed AWS policy — ARN is fixed)
import_attachment "aws_iam_role_policy_attachment.product_service_logs"       "${PREFIX}-product-service-lambda-role"       "${AWS_LAMBDA_EXEC_POLICY}"
import_attachment "aws_iam_role_policy_attachment.cart_service_logs"          "${PREFIX}-cart-service-lambda-role"          "${AWS_LAMBDA_EXEC_POLICY}"
import_attachment "aws_iam_role_policy_attachment.order_service_logs"         "${PREFIX}-order-service-lambda-role"         "${AWS_LAMBDA_EXEC_POLICY}"
import_attachment "aws_iam_role_policy_attachment.notification_service_logs"  "${PREFIX}-notification-service-lambda-role"  "${AWS_LAMBDA_EXEC_POLICY}"
import_attachment "aws_iam_role_policy_attachment.discount_service_logs"      "${PREFIX}-discount-service-lambda-role"      "${AWS_LAMBDA_EXEC_POLICY}"
import_attachment "aws_iam_role_policy_attachment.content_service_logs"       "${PREFIX}-content-service-lambda-role"       "${AWS_LAMBDA_EXEC_POLICY}"
import_attachment "aws_iam_role_policy_attachment.audit_service_logs"         "${PREFIX}-audit-service-lambda-role"         "${AWS_LAMBDA_EXEC_POLICY}"
import_attachment "aws_iam_role_policy_attachment.integration_service_logs"   "${PREFIX}-integration-service-lambda-role"   "${AWS_LAMBDA_EXEC_POLICY}"

# DynamoDB policy attachments
import_attachment "aws_iam_role_policy_attachment.product_service_dynamodb"      "${PREFIX}-product-service-lambda-role"      "$(iam_policy_arn "${PREFIX}-product-service-dynamodb")"
import_attachment "aws_iam_role_policy_attachment.cart_service_dynamodb"         "${PREFIX}-cart-service-lambda-role"         "$(iam_policy_arn "${PREFIX}-cart-service-dynamodb")"
import_attachment "aws_iam_role_policy_attachment.order_service_dynamodb"        "${PREFIX}-order-service-lambda-role"        "$(iam_policy_arn "${PREFIX}-order-service-dynamodb")"
import_attachment "aws_iam_role_policy_attachment.notification_service_dynamodb" "${PREFIX}-notification-service-lambda-role" "$(iam_policy_arn "${PREFIX}-notification-service-dynamodb")"
import_attachment "aws_iam_role_policy_attachment.discount_service_dynamodb"     "${PREFIX}-discount-service-lambda-role"     "$(iam_policy_arn "${PREFIX}-discount-service-dynamodb")"
import_attachment "aws_iam_role_policy_attachment.content_service_dynamodb"      "${PREFIX}-content-service-lambda-role"      "$(iam_policy_arn "${PREFIX}-content-service-dynamodb")"
import_attachment "aws_iam_role_policy_attachment.audit_service_dynamodb"        "${PREFIX}-audit-service-lambda-role"        "$(iam_policy_arn "${PREFIX}-audit-service-dynamodb")"
import_attachment "aws_iam_role_policy_attachment.integration_service_dynamodb"  "${PREFIX}-integration-service-lambda-role"  "$(iam_policy_arn "${PREFIX}-integration-service-dynamodb")"

# S3 policy attachments (product + content only)
import_attachment "aws_iam_role_policy_attachment.product_service_s3" "${PREFIX}-product-service-lambda-role" "$(iam_policy_arn "${PREFIX}-product-service-s3")"
import_attachment "aws_iam_role_policy_attachment.content_service_s3" "${PREFIX}-content-service-lambda-role" "$(iam_policy_arn "${PREFIX}-content-service-s3")"

# Order-service optional policy attachments
ORDER_SES_ARN=$(iam_policy_arn "${PREFIX}-order-service-ses")
ORDER_SNS_ARN=$(iam_policy_arn "${PREFIX}-order-service-sns")
ORDER_SSM_ARN=$(iam_policy_arn "${PREFIX}-order-service-ssm")
import_attachment "aws_iam_role_policy_attachment.order_service_ses[0]" "${PREFIX}-order-service-lambda-role" "${ORDER_SES_ARN}"
import_attachment "aws_iam_role_policy_attachment.order_service_sns[0]" "${PREFIX}-order-service-lambda-role" "${ORDER_SNS_ARN}"
import_attachment "aws_iam_role_policy_attachment.order_service_ssm[0]" "${PREFIX}-order-service-lambda-role" "${ORDER_SSM_ARN}"

echo ""

# ---------------------------------------------------------------------------
# 4. CloudWatch Log Groups — Lambda (/aws/lambda/…)
# ---------------------------------------------------------------------------
LAMBDA_PREFIX="/aws/lambda/${PREFIX}-"
APIGW_PREFIX="/aws/apigateway/${PREFIX}-"

echo "--- CloudWatch Log Groups (Lambda) ---"

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
    FUNC_KEY="${LOG_GROUP#"${LAMBDA_PREFIX}"}"
    TF_RESOURCE=""
    for SERVICE in "${!LAMBDA_SERVICE_MAP[@]}"; do
      if [[ "${FUNC_KEY}" == "${SERVICE}-"* || "${FUNC_KEY}" == "${SERVICE}" ]]; then
        TF_RESOURCE="aws_cloudwatch_log_group.${LAMBDA_SERVICE_MAP[$SERVICE]}[\"${FUNC_KEY}\"]"
        break
      fi
    done
    if [ -z "${TF_RESOURCE}" ]; then
      echo "  ? Unknown prefix, skipping: ${LOG_GROUP}"
    else
      try_import "${TF_RESOURCE}" "${LOG_GROUP}"
    fi
  done
else
  echo "  No Lambda log groups found with prefix: ${LAMBDA_PREFIX}"
fi

echo ""

# ---------------------------------------------------------------------------
# 5. CloudWatch Log Groups — API Gateway (/aws/apigateway/…)
# ---------------------------------------------------------------------------
echo "--- CloudWatch Log Groups (API Gateway) ---"

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
echo "============================================================"
echo " Import pass complete."
echo " ✓ Imported   = added to TF state (won't be re-created)"
echo " = In state   = already managed (no action needed)"
echo " ~ Not found  = doesn't exist in AWS yet (will be created)"
echo " ! Error      = investigate the error message above"
echo "============================================================"
