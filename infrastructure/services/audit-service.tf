# ---------------------------------------------------------------------------
# Audit Service – Lambda functions, IAM, CloudWatch, and API Gateway
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
  audit_dynamodb_table_name = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${var.project_name}-${var.environment}-art-management"

  # One entry per Lambda handler. Key becomes the suffix of the function name.
  # Audit logs are read-only from the API; writes happen internally via audit helpers.
  audit_lambda_functions_config = {
    "audit-service-get-entity-history" = {
      timeout     = 10
      handler     = "dist/handlers/audit.handler.getEntityHistory"
      description = "Get full audit history for an entity"
    }
    "audit-service-get-user-activity" = {
      timeout     = 10
      handler     = "dist/handlers/audit.handler.getUserActivity"
      description = "Get audit activity for a specific user"
    }
    "audit-service-get-activity-by-date" = {
      timeout     = 10
      handler     = "dist/handlers/audit.handler.getActivityByDate"
      description = "Get audit logs within a date range"
    }
  }

  audit_common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "audit-service"
    ManagedBy   = "Terraform"
  }

  audit_effective_jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.audit_service_jwt_secret.result
}

data "aws_caller_identity" "audit_current" {}

resource "random_password" "audit_service_jwt_secret" {
  length           = 48
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}<>?"
}

# ---------------------------------------------------------------------------
# IAM – Execution Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "audit_service_lambda" {
  name        = "${var.project_name}-${var.environment}-audit-service-lambda-role"
  description = "Execution role for Audit Service Lambda functions"

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

  tags = local.audit_common_tags
}

# ---------------------------------------------------------------------------
# IAM – DynamoDB Policy (read-only access – audit logs must not be modified
# via the API; writes are performed internally by audit helper functions)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "audit_service_dynamodb" {
  name        = "${var.project_name}-${var.environment}-audit-service-dynamodb"
  description = "DynamoDB read-only access for Audit Service"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBReadAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:BatchGetItem"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.audit_current.account_id}:table/${local.audit_dynamodb_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.audit_current.account_id}:table/${local.audit_dynamodb_table_name}/index/*"
        ]
      }
    ]
  })

  tags = local.audit_common_tags
}

# ---------------------------------------------------------------------------
# IAM – Policy Attachments
# ---------------------------------------------------------------------------

resource "aws_iam_role_policy_attachment" "audit_service_logs" {
  role       = aws_iam_role.audit_service_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "audit_service_dynamodb" {
  role       = aws_iam_role.audit_service_lambda.name
  policy_arn = aws_iam_policy.audit_service_dynamodb.arn
}

# ---------------------------------------------------------------------------
# Placeholder deployment package
# Used for `terraform plan/apply` before CI/CD publishes the real artifact.
# The real deployment is handled by the CI/CD pipeline (S3 + Lambda update).
# ---------------------------------------------------------------------------

data "archive_file" "audit_service_placeholder" {
  type        = "zip"
  output_path = "${path.module}/audit-service-placeholder.zip"

  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD' }) });"
    filename = "index.js"
  }

  source {
    content  = <<-JS
      exports.getEntityHistory = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getEntityHistory' }) });
      exports.getUserActivity = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getUserActivity' }) });
      exports.getActivityByDate = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getActivityByDate' }) });
    JS
    filename = "dist/handlers/audit.handler.js"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups (pre-created so retention is set before first invoke)
# Import blocks ensure Terraform adopts any log groups already created by
# Lambda (auto-created on first invocation) instead of failing with
# ResourceAlreadyExistsException.
# ---------------------------------------------------------------------------

import {
  for_each = local.audit_lambda_functions_config
  to       = aws_cloudwatch_log_group.audit_service[each.key]
  id       = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
}

resource "aws_cloudwatch_log_group" "audit_service" {
  for_each = local.audit_lambda_functions_config

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = 14

  tags = local.audit_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Functions
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "audit_service" {
  for_each = local.audit_lambda_functions_config

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.audit_service_lambda.arn

  runtime = "nodejs18.x"
  handler = each.value.handler

  filename         = data.archive_file.audit_service_placeholder.output_path
  source_code_hash = data.archive_file.audit_service_placeholder.output_base64sha256

  timeout     = each.value.timeout
  memory_size = 256

  reserved_concurrent_executions = lookup(each.value, "reserved_concurrent_executions", var.lambda_reserved_concurrency)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = local.audit_dynamodb_table_name
      AWS_REGION_CUSTOM   = var.aws_region
      AWS_REGION_NAME     = var.aws_region
      ENVIRONMENT         = var.environment
      JWT_SECRET          = local.audit_effective_jwt_secret
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.audit_service,
    aws_iam_role_policy_attachment.audit_service_logs,
    aws_iam_role_policy_attachment.audit_service_dynamodb,
  ]

  tags = merge(local.audit_common_tags, {
    Name    = "${var.project_name}-${var.environment}-${each.key}"
    Timeout = tostring(each.value.timeout)
  })
}

# ---------------------------------------------------------------------------
# API Gateway – HTTP API (v2)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "audit_service" {
  name          = "${var.project_name}-${var.environment}-audit-service"
  protocol_type = "HTTP"
  description   = "HTTP API for the Audit Service"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Requested-With"]
    max_age       = 300
  }

  tags = local.audit_common_tags
}

resource "aws_apigatewayv2_stage" "audit_service" {
  api_id      = aws_apigatewayv2_api.audit_service.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.audit_service_api_gateway.arn
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

  tags = local.audit_common_tags
}

import {
  to = aws_cloudwatch_log_group.audit_service_api_gateway
  id = "/aws/apigateway/${var.project_name}-${var.environment}-audit-service"
}

resource "aws_cloudwatch_log_group" "audit_service_api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-audit-service"
  retention_in_days = 14

  tags = local.audit_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Integrations (one per Lambda function)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "audit_service" {
  for_each = local.audit_lambda_functions_config

  api_id             = aws_apigatewayv2_api.audit_service.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.audit_service[each.key].invoke_arn
  integration_method = "POST"

  payload_format_version = "2.0"
}

# ---------------------------------------------------------------------------
# API Gateway Routes
# ---------------------------------------------------------------------------

locals {
  audit_api_routes = {
    "GET /api/admin/audit/entity/{type}/{id}" = "audit-service-get-entity-history"
    "GET /api/admin/audit/user/{userId}"      = "audit-service-get-user-activity"
    "GET /api/admin/audit/date-range"         = "audit-service-get-activity-by-date"
  }
}

resource "aws_apigatewayv2_route" "audit_service" {
  for_each = local.audit_api_routes

  api_id    = aws_apigatewayv2_api.audit_service.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.audit_service[each.value].id}"
}

# ---------------------------------------------------------------------------
# Lambda Permissions – allow API Gateway to invoke each function
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "audit_service" {
  for_each = local.audit_lambda_functions_config

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.audit_service[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.audit_service.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "audit_service_api_endpoint" {
  description = "Base URL of the Audit Service API"
  value       = aws_apigatewayv2_stage.audit_service.invoke_url
}

output "audit_service_api_id" {
  description = "ID of the Audit Service API Gateway"
  value       = aws_apigatewayv2_api.audit_service.id
}

output "audit_service_lambda_function_arns" {
  description = "ARNs of all Audit Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.audit_service : k => fn.arn
  }
}

output "audit_service_lambda_function_names" {
  description = "Names of all Audit Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.audit_service : k => fn.function_name
  }
}

output "audit_service_iam_role_arn" {
  description = "ARN of the IAM execution role shared by Audit Service Lambda functions"
  value       = aws_iam_role.audit_service_lambda.arn
}
