# ---------------------------------------------------------------------------
# Discount Service – Lambda functions, IAM, CloudWatch, and API Gateway
#
# NOTE: This file is part of the same Terraform root module as
# product-service.tf. Shared provider/variable declarations are defined there
# and reused here.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------

locals {
  # Resolve table name so it matches the naming convention in main.tf
  discount_dynamodb_table_name = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${var.project_name}-${var.environment}-art-management"

  # One entry per Lambda handler. Key becomes the suffix of the function name.
  discount_lambda_functions_config = {
    "discount-service-validate-code" = {
      timeout     = 5
      handler     = "dist/handlers/discount.handler.validateCode"
      description = "Validate a discount code against a cart total"
    }
    "discount-service-list-discounts" = {
      timeout     = 10
      handler     = "dist/handlers/discount.handler.listDiscounts"
      description = "List all discount codes (paginated)"
    }
    "discount-service-get-discount" = {
      timeout     = 5
      handler     = "dist/handlers/discount.handler.getDiscount"
      description = "Get a single discount by ID"
    }
    "discount-service-create-discount" = {
      timeout     = 5
      handler     = "dist/handlers/discount.handler.createDiscount"
      description = "Create a new discount code"
    }
    "discount-service-update-discount" = {
      timeout     = 5
      handler     = "dist/handlers/discount.handler.updateDiscount"
      description = "Update an existing discount code"
    }
    "discount-service-delete-discount" = {
      timeout     = 5
      handler     = "dist/handlers/discount.handler.deleteDiscount"
      description = "Soft-delete a discount code"
    }
    "discount-service-get-stats" = {
      timeout     = 10
      handler     = "dist/handlers/discount.handler.getStats"
      description = "Get usage statistics for a discount code"
    }
  }

  discount_common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "discount-service"
    ManagedBy   = "Terraform"
  }

  discount_effective_jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.discount_service_jwt_secret.result
}

data "aws_caller_identity" "discount_current" {}

resource "random_password" "discount_service_jwt_secret" {
  length           = 48
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}<>?"
}

# ---------------------------------------------------------------------------
# IAM – Execution Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "discount_service_lambda" {
  name        = "${var.project_name}-${var.environment}-discount-service-lambda-role"
  description = "Execution role for Discount Service Lambda functions"

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

  tags = local.discount_common_tags
}

# ---------------------------------------------------------------------------
# IAM – DynamoDB Policy (least-privilege read/write on the single table)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "discount_service_dynamodb" {
  name        = "${var.project_name}-${var.environment}-discount-service-dynamodb"
  description = "DynamoDB read/write access for Discount Service"

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
          "dynamodb:Query"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.discount_current.account_id}:table/${local.discount_dynamodb_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.discount_current.account_id}:table/${local.discount_dynamodb_table_name}/index/*"
        ]
      }
    ]
  })

  tags = local.discount_common_tags
}

# ---------------------------------------------------------------------------
# IAM – Policy Attachments
# ---------------------------------------------------------------------------

resource "aws_iam_role_policy_attachment" "discount_service_logs" {
  role       = aws_iam_role.discount_service_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "discount_service_dynamodb" {
  role       = aws_iam_role.discount_service_lambda.name
  policy_arn = aws_iam_policy.discount_service_dynamodb.arn
}

# ---------------------------------------------------------------------------
# Placeholder deployment package
# Used for `terraform plan/apply` before CI/CD publishes the real artifact.
# The real deployment is handled by the CI/CD pipeline (S3 + Lambda update).
# ---------------------------------------------------------------------------

data "archive_file" "discount_service_placeholder" {
  type        = "zip"
  output_path = "${path.module}/discount-service-placeholder.zip"

  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD' }) });"
    filename = "index.js"
  }

  source {
    content  = <<-JS
      exports.validateCode = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'validateCode' }) });
      exports.listDiscounts = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'listDiscounts' }) });
      exports.getDiscount = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getDiscount' }) });
      exports.createDiscount = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'createDiscount' }) });
      exports.updateDiscount = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'updateDiscount' }) });
      exports.deleteDiscount = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'deleteDiscount' }) });
      exports.getStats = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getStats' }) });
    JS
    filename = "dist/handlers/discount.handler.js"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups (pre-created so retention is set before first invoke)
# Import blocks ensure Terraform adopts any log groups already created by
# Lambda (auto-created on first invocation) instead of failing with
# ResourceAlreadyExistsException.
# ---------------------------------------------------------------------------

import {
  for_each = local.discount_lambda_functions_config
  to       = aws_cloudwatch_log_group.discount_service[each.key]
  id       = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
}

resource "aws_cloudwatch_log_group" "discount_service" {
  for_each = local.discount_lambda_functions_config

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = 14

  tags = local.discount_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Functions
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "discount_service" {
  for_each = local.discount_lambda_functions_config

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.discount_service_lambda.arn

  runtime = "nodejs18.x"
  handler = each.value.handler

  filename         = data.archive_file.discount_service_placeholder.output_path
  source_code_hash = data.archive_file.discount_service_placeholder.output_base64sha256

  timeout     = each.value.timeout
  memory_size = 256

  reserved_concurrent_executions = lookup(each.value, "reserved_concurrent_executions", var.lambda_reserved_concurrency)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = local.discount_dynamodb_table_name
      AWS_REGION_CUSTOM   = var.aws_region
      AWS_REGION_NAME     = var.aws_region
      ENVIRONMENT         = var.environment
      JWT_SECRET          = local.discount_effective_jwt_secret
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.discount_service,
    aws_iam_role_policy_attachment.discount_service_logs,
    aws_iam_role_policy_attachment.discount_service_dynamodb,
  ]

  tags = merge(local.discount_common_tags, {
    Name    = "${var.project_name}-${var.environment}-${each.key}"
    Timeout = tostring(each.value.timeout)
  })
}

# ---------------------------------------------------------------------------
# API Gateway – HTTP API (v2)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "discount_service" {
  name          = "${var.project_name}-${var.environment}-discount-service"
  protocol_type = "HTTP"
  description   = "HTTP API for the Discount Service"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Requested-With"]
    max_age       = 300
  }

  tags = local.discount_common_tags
}

resource "aws_apigatewayv2_stage" "discount_service" {
  api_id      = aws_apigatewayv2_api.discount_service.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.discount_service_api_gateway.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      sourceIp           = "$context.http.sourceIp"
      requestTime        = "$context.requestTime"
      protocol           = "$context.protocol"
      httpMethod         = "$context.http.method"
      resourcePath       = "$context.http.path"
      routeKey           = "$context.routeKey"
      status             = "$context.status"
      responseLength     = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
    })
  }

  tags = local.discount_common_tags
}

import {
  to = aws_cloudwatch_log_group.discount_service_api_gateway
  id = "/aws/apigateway/${var.project_name}-${var.environment}-discount-service"
}

resource "aws_cloudwatch_log_group" "discount_service_api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-discount-service"
  retention_in_days = 14

  tags = local.discount_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Integrations (one per Lambda function)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "discount_service" {
  for_each = local.discount_lambda_functions_config

  api_id             = aws_apigatewayv2_api.discount_service.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.discount_service[each.key].invoke_arn
  integration_method = "POST"

  payload_format_version = "2.0"
}

# ---------------------------------------------------------------------------
# API Gateway Routes
# ---------------------------------------------------------------------------

locals {
  discount_api_routes = {
    # Public
    "POST /api/discounts/validate" = "discount-service-validate-code"

    # Admin
    "GET /api/admin/discounts"            = "discount-service-list-discounts"
    "GET /api/admin/discounts/{id}"       = "discount-service-get-discount"
    "POST /api/admin/discounts"           = "discount-service-create-discount"
    "PUT /api/admin/discounts/{id}"       = "discount-service-update-discount"
    "DELETE /api/admin/discounts/{id}"    = "discount-service-delete-discount"
    "GET /api/admin/discounts/{id}/stats" = "discount-service-get-stats"
  }
}

resource "aws_apigatewayv2_route" "discount_service" {
  for_each = local.discount_api_routes

  api_id    = aws_apigatewayv2_api.discount_service.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.discount_service[each.value].id}"
}

# ---------------------------------------------------------------------------
# Lambda Permissions – allow API Gateway to invoke each function
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "discount_service" {
  for_each = local.discount_lambda_functions_config

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.discount_service[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.discount_service.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "discount_service_api_endpoint" {
  description = "Base URL of the Discount Service API"
  value       = aws_apigatewayv2_stage.discount_service.invoke_url
}

output "discount_service_api_id" {
  description = "ID of the Discount Service API Gateway"
  value       = aws_apigatewayv2_api.discount_service.id
}

output "discount_service_lambda_function_arns" {
  description = "ARNs of all Discount Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.discount_service : k => fn.arn
  }
}

output "discount_service_lambda_function_names" {
  description = "Names of all Discount Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.discount_service : k => fn.function_name
  }
}

output "discount_service_iam_role_arn" {
  description = "ARN of the IAM execution role shared by Discount Service Lambda functions"
  value       = aws_iam_role.discount_service_lambda.arn
}
