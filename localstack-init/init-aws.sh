#!/bin/bash

# LocalStack initialization script for AWS services
# This script runs automatically when LocalStack starts

echo "Initializing LocalStack AWS services..."

# Wait for LocalStack to be fully ready
sleep 5

# Create S3 bucket for images
echo "Creating S3 bucket: art-images-dev"
awslocal s3 mb s3://art-images-dev
awslocal s3api put-bucket-cors --bucket art-images-dev --cors-configuration '{
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
awslocal dynamodb create-table \
  --table-name products \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=status-createdAt-index,KeySchema=[{AttributeName=status,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: orders
echo "Creating DynamoDB table: orders"
awslocal dynamodb create-table \
  --table-name orders \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=userId-createdAt-index,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: carts
echo "Creating DynamoDB table: carts"
awslocal dynamodb create-table \
  --table-name carts \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=userId,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=userId-index,KeySchema=[{AttributeName=userId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: discount-codes
echo "Creating DynamoDB table: discount-codes"
awslocal dynamodb create-table \
  --table-name discount-codes \
  --attribute-definitions \
    AttributeName=code,AttributeType=S \
  --key-schema \
    AttributeName=code,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: audit-logs
echo "Creating DynamoDB table: audit-logs"
awslocal dynamodb create-table \
  --table-name audit-logs \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=entityType,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=entityType-timestamp-index,KeySchema=[{AttributeName=entityType,KeyType=HASH},{AttributeName=timestamp,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: notifications
echo "Creating DynamoDB table: notifications"
awslocal dynamodb create-table \
  --table-name notifications \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=userId,AttributeType=S \
    AttributeName=createdAt,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=userId-createdAt-index,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: etsy-products
echo "Creating DynamoDB table: etsy-products"
awslocal dynamodb create-table \
  --table-name etsy-products \
  --attribute-definitions \
    AttributeName=listingId,AttributeType=S \
    AttributeName=shopId,AttributeType=S \
  --key-schema \
    AttributeName=listingId,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=shopId-index,KeySchema=[{AttributeName=shopId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: etsy-sync-configs
echo "Creating DynamoDB table: etsy-sync-configs"
awslocal dynamodb create-table \
  --table-name etsy-sync-configs \
  --attribute-definitions \
    AttributeName=shopId,AttributeType=S \
  --key-schema \
    AttributeName=shopId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Create DynamoDB table: etsy-oauth-tokens
echo "Creating DynamoDB table: etsy-oauth-tokens"
awslocal dynamodb create-table \
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
