terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region to deploy resources (provided by CI via TF_VAR_aws_region)"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "art-management-tool"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name. Defaults to '{project_name}-{environment}-art-management' if empty."
  type        = string
  default     = ""
}

variable "s3_bucket_name" {
  description = "S3 bucket name for product images. Defaults to 'art-management-images-{environment}' if empty."
  type        = string
  default     = ""
}

variable "cdn_url" {
  description = "CloudFront CDN base URL for serving product images"
  type        = string
  default     = ""
}

variable "lambda_reserved_concurrency" {
  description = "Reserved concurrency per Lambda function. Set to null to leave unreserved."
  type        = number
  default     = 10
  nullable    = true
}

variable "jwt_secret" {
  description = "JWT secret for Product Service auth. If empty, Terraform generates a strong random secret."
  type        = string
  default     = ""
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------

locals {
  # Resolve table/bucket names so they match the naming convention in main.tf
  dynamodb_table_name = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${var.project_name}-${var.environment}-art-management"
  s3_bucket_name      = var.s3_bucket_name != "" ? var.s3_bucket_name : "art-management-images-${var.environment}"

  # One entry per Lambda handler.  Key becomes the suffix of the function name.
  # list-* operations get a longer timeout to handle paginated DynamoDB scans.
  lambda_functions_config = {
    "product-service-list-products" = {
      timeout     = 10
      handler     = "dist/handlers/product.handler.listProducts"
      description = "List all products (paginated)"
    }
    "product-service-get-product" = {
      timeout     = 5
      handler     = "dist/handlers/product.handler.getProduct"
      description = "Get a single product by slug"
    }
    "product-service-create-product" = {
      timeout     = 5
      handler     = "dist/handlers/product.handler.createProduct"
      description = "Create a new product"
    }
    "product-service-update-product" = {
      timeout     = 5
      handler     = "dist/handlers/product.handler.updateProduct"
      description = "Update an existing product"
    }
    "product-service-delete-product" = {
      timeout     = 5
      handler     = "dist/handlers/product.handler.deleteProduct"
      description = "Delete a product"
    }
    "product-service-list-categories" = {
      timeout     = 10
      handler     = "dist/handlers/category.handler.listCategories"
      description = "List all categories (paginated)"
    }
    "product-service-get-category" = {
      timeout     = 5
      handler     = "dist/handlers/category.handler.getCategory"
      description = "Get a single category by slug"
    }
    "product-service-create-category" = {
      timeout     = 5
      handler     = "dist/handlers/category.handler.createCategory"
      description = "Create a new category"
    }
    "product-service-update-category" = {
      timeout     = 5
      handler     = "dist/handlers/category.handler.updateCategory"
      description = "Update an existing category"
    }
    "product-service-delete-category" = {
      timeout     = 5
      handler     = "dist/handlers/category.handler.deleteCategory"
      description = "Delete a category"
    }
    "product-service-list-variants" = {
      timeout     = 10
      handler     = "dist/handlers/variant.handler.listVariants"
      description = "List variants for a product"
    }
    "product-service-create-variant" = {
      timeout     = 5
      handler     = "dist/handlers/variant.handler.createVariant"
      description = "Create a new product variant"
    }
    "product-service-update-variant" = {
      timeout     = 5
      handler     = "dist/handlers/variant.handler.updateVariant"
      description = "Update an existing product variant"
    }
    "product-service-update-stock" = {
      timeout     = 5
      handler     = "dist/handlers/variant.handler.updateStock"
      description = "Update stock quantity for a variant"
    }
    "product-service-get-upload-url" = {
      timeout     = 5
      handler     = "dist/handlers/image.handler.getUploadUrl"
      description = "Generate presigned S3 URL for product image upload"
    }
    "product-service-list-images" = {
      timeout     = 10
      handler     = "dist/handlers/image.handler.listImages"
      description = "List images for a product"
    }
    "product-service-delete-image" = {
      timeout     = 5
      handler     = "dist/handlers/image.handler.deleteImage"
      description = "Delete a product image"
    }
    "product-service-health" = {
      timeout     = 10
      handler     = "dist/handlers/health.handler.getHealth"
      description = "Health check endpoint for product service"
    }
  }

  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "product-service"
    ManagedBy   = "Terraform"
  }

  effective_jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.product_service_jwt_secret.result
}

data "aws_caller_identity" "current" {}

resource "random_password" "product_service_jwt_secret" {
  length           = 48
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}<>?"
}

# ---------------------------------------------------------------------------
# IAM – Execution Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "product_service_lambda" {
  name        = "${var.project_name}-${var.environment}-product-service-lambda-role"
  description = "Execution role for Product Service Lambda functions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaAssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# IAM – DynamoDB Policy (least-privilege read/write on the single table)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "product_service_dynamodb" {
  name        = "${var.project_name}-${var.environment}-product-service-dynamodb"
  description = "DynamoDB read/write access for Product Service"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:TransactWriteItems",
          "dynamodb:TransactGetItems",
          "dynamodb:DescribeTable"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.dynamodb_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.dynamodb_table_name}/index/*"
        ]
      }
    ]
  })

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# IAM – S3 Policy (read/write for product image objects only)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "product_service_s3" {
  name        = "${var.project_name}-${var.environment}-product-service-s3"
  description = "S3 read/write access for Product Service image operations"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3ObjectAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::${local.s3_bucket_name}/products/*"
      },
      {
        Sid    = "S3PresignedUrl"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "arn:aws:s3:::${local.s3_bucket_name}/products/*"
      },
      {
        Sid    = "S3BucketList"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::${local.s3_bucket_name}"
      }
    ]
  })

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# IAM – Policy Attachments
# ---------------------------------------------------------------------------

# CloudWatch Logs – use the AWS-managed policy (least privilege for log streams)
resource "aws_iam_role_policy_attachment" "product_service_logs" {
  role       = aws_iam_role.product_service_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "product_service_dynamodb" {
  role       = aws_iam_role.product_service_lambda.name
  policy_arn = aws_iam_policy.product_service_dynamodb.arn
}

resource "aws_iam_role_policy_attachment" "product_service_s3" {
  role       = aws_iam_role.product_service_lambda.name
  policy_arn = aws_iam_policy.product_service_s3.arn
}

# ---------------------------------------------------------------------------
# Placeholder deployment package
# Used for `terraform plan/apply` before CI/CD publishes the real artifact.
# The real deployment is handled by the CI/CD pipeline (S3 + Lambda update).
# ---------------------------------------------------------------------------

data "archive_file" "product_service_placeholder" {
  type        = "zip"
  output_path = "${path.module}/product-service-placeholder.zip"

  # Generic top-level placeholder for compatibility.
  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD' }) });"
    filename = "index.js"
  }

  # Match product handlers from local.lambda_functions_config.
  source {
    content  = <<-JS
      exports.listProducts = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'listProducts' }) });
      exports.getProduct = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getProduct' }) });
      exports.createProduct = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'createProduct' }) });
      exports.updateProduct = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'updateProduct' }) });
      exports.deleteProduct = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'deleteProduct' }) });
    JS
    filename = "dist/handlers/product.handler.js"
  }

  # Match category handlers from local.lambda_functions_config.
  source {
    content  = <<-JS
      exports.listCategories = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'listCategories' }) });
      exports.getCategory = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getCategory' }) });
      exports.createCategory = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'createCategory' }) });
      exports.updateCategory = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'updateCategory' }) });
      exports.deleteCategory = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'deleteCategory' }) });
    JS
    filename = "dist/handlers/category.handler.js"
  }

  # Match variant handlers from local.lambda_functions_config.
  source {
    content  = <<-JS
      exports.listVariants = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'listVariants' }) });
      exports.createVariant = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'createVariant' }) });
      exports.updateVariant = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'updateVariant' }) });
      exports.updateStock = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'updateStock' }) });
    JS
    filename = "dist/handlers/variant.handler.js"
  }

  # Match image handlers from local.lambda_functions_config.
  source {
    content  = <<-JS
      exports.getUploadUrl = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getUploadUrl' }) });
      exports.listImages = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'listImages' }) });
      exports.deleteImage = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'deleteImage' }) });
    JS
    filename = "dist/handlers/image.handler.js"
  }

  # Match health handler from local.lambda_functions_config.
  source {
    content  = "exports.getHealth = async () => ({ statusCode: 200, body: JSON.stringify({ status: 'healthy', service: 'product-service', version: '1.0.0', timestamp: new Date().toISOString(), checks: { dynamodb: 'healthy', s3: 'healthy', memory: 'healthy' }, uptime: 0 }) });"
    filename = "dist/handlers/health.handler.js"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups (pre-created so retention is set before first invoke)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "product_service" {
  for_each = local.lambda_functions_config

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = 14

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# Lambda Functions
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "product_service" {
  for_each = local.lambda_functions_config

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.product_service_lambda.arn

  # Runtime & handler
  runtime = "nodejs18.x"
  handler = each.value.handler

  # Deployment package (placeholder – replaced by CI/CD pipeline)
  filename         = data.archive_file.product_service_placeholder.output_path
  source_code_hash = data.archive_file.product_service_placeholder.output_base64sha256

  # Performance / cost controls
  timeout     = each.value.timeout
  memory_size = 256

  # Prevent runaway costs: cap concurrency per function (configurable).
  reserved_concurrent_executions = lookup(each.value, "reserved_concurrent_executions", var.lambda_reserved_concurrency)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = local.dynamodb_table_name
      S3_BUCKET_NAME      = local.s3_bucket_name
      CDN_URL             = var.cdn_url
      AWS_REGION_CUSTOM   = var.aws_region
      AWS_REGION_NAME     = var.aws_region
      ENVIRONMENT         = var.environment
      JWT_SECRET          = local.effective_jwt_secret
    }
  }

  # Ensure the log group exists before the function is created so that
  # Lambda does not auto-create it without the retention policy.
  depends_on = [
    aws_cloudwatch_log_group.product_service,
    aws_iam_role_policy_attachment.product_service_logs,
    aws_iam_role_policy_attachment.product_service_dynamodb,
    aws_iam_role_policy_attachment.product_service_s3,
  ]

  tags = merge(local.common_tags, {
    Name    = "${var.project_name}-${var.environment}-${each.key}"
    Timeout = tostring(each.value.timeout)
  })
}
