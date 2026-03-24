#!/bin/bash

# LocalStack initialization script for AWS services
# This script runs automatically when LocalStack starts

set -uo pipefail

AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
AWS_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

# Resolve the LocalStack AWS command once, then reuse it everywhere.
if command -v awslocal >/dev/null 2>&1; then
  AWS_LOCAL_CMD=(awslocal)
elif command -v aws >/dev/null 2>&1; then
  export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
  export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
  export AWS_DEFAULT_REGION="$AWS_REGION"
  AWS_LOCAL_CMD=(aws --endpoint-url "$AWS_ENDPOINT_URL" --region "$AWS_REGION")
else
  echo "Error: neither 'awslocal' nor 'aws' is available in PATH." >&2
  echo "Tip: use 'lstk start' to run LocalStack, then install AWS CLI v2." >&2
  exit 1
fi

aws_local() {
  "${AWS_LOCAL_CMD[@]}" "$@"
}

echo "Initializing LocalStack AWS services..."

# Wait for LocalStack to be fully ready
sleep 5

# Create S3 bucket for images
echo "Creating S3 bucket: art-images-dev"
aws_local s3 mb s3://art-images-dev || true
aws_local s3api put-bucket-cors --bucket art-images-dev --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}'

# Create DynamoDB table: products
echo "Creating DynamoDB table: products"
aws_local dynamodb create-table \
  --table-name products \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=status-createdAt-index,KeySchema=[{AttributeName=status,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: orders
echo "Creating DynamoDB table: orders"
aws_local dynamodb create-table \
  --table-name orders \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=userId-createdAt-index,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: carts
echo "Creating DynamoDB table: carts"
aws_local dynamodb create-table \
  --table-name carts \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=userId,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=userId-index,KeySchema=[{AttributeName=userId,KeyType=HASH}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: discount-codes
echo "Creating DynamoDB table: discount-codes"
aws_local dynamodb create-table \
  --table-name discount-codes \
  --attribute-definitions \
    AttributeName=code,AttributeType=S \
  --key-schema \
    AttributeName=code,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: audit-logs
echo "Creating DynamoDB table: audit-logs"
aws_local dynamodb create-table \
  --table-name audit-logs \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=entityType,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=entityType-timestamp-index,KeySchema=[{AttributeName=entityType,KeyType=HASH},{AttributeName=timestamp,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: notifications
echo "Creating DynamoDB table: notifications"
aws_local dynamodb create-table \
  --table-name notifications \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=userId-createdAt-index,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: etsy-products
echo "Creating DynamoDB table: etsy-products"
aws_local dynamodb create-table \
  --table-name etsy-products \
  --attribute-definitions \
    AttributeName=listingId,AttributeType=S \
    AttributeName=shopId,AttributeType=S \
  --key-schema \
    AttributeName=listingId,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=shopId-index,KeySchema=[{AttributeName=shopId,KeyType=HASH}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: etsy-sync-configs
echo "Creating DynamoDB table: etsy-sync-configs"
aws_local dynamodb create-table \
  --table-name etsy-sync-configs \
  --attribute-definitions \
    AttributeName=shopId,AttributeType=S \
  --key-schema \
    AttributeName=shopId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: etsy-oauth-tokens
echo "Creating DynamoDB table: etsy-oauth-tokens"
aws_local dynamodb create-table \
  --table-name etsy-oauth-tokens \
  --attribute-definitions \
    AttributeName=shopId,AttributeType=S \
  --key-schema \
    AttributeName=shopId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

echo "LocalStack initialization complete!"
echo "Available services:"
echo "  - S3 bucket: art-images-dev"
echo "  - DynamoDB tables: products, orders, carts, discount-codes, audit-logs, notifications, etsy-products, etsy-sync-configs, etsy-oauth-tokens"
echo "  - Endpoint: http://localhost:4566"
