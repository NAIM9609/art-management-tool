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
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
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

variable "allowed_origins" {
  description = "List of origins allowed to call the Notification Service API (CORS). Restrict to trusted domains in production."
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "lambda_reserved_concurrency" {
  description = "Reserved concurrency per Lambda function. Set to null to leave unreserved."
  type        = number
  default     = 10
  nullable    = true
}

variable "jwt_secret" {
  description = "JWT secret for Notification Service auth. If empty, Terraform generates a strong random secret."
  type        = string
  default     = ""
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------

locals {
  # Resolve table name so it matches the naming convention in main.tf
  dynamodb_table_name = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${var.project_name}-${var.environment}-art-management"

  # One entry per Lambda handler. Key becomes the suffix of the function name.
  lambda_functions_config = {
    "notification-service-list-notifications" = {
      timeout     = 10
      handler     = "dist/handlers/notification.handler.listNotifications"
      description = "List notifications (paginated, filterable)"
    }
    "notification-service-mark-as-read" = {
      timeout     = 5
      handler     = "dist/handlers/notification.handler.markAsRead"
      description = "Mark a single notification as read"
    }
    "notification-service-mark-all-read" = {
      timeout     = 5
      handler     = "dist/handlers/notification.handler.markAllAsRead"
      description = "Mark all notifications as read"
    }
    "notification-service-delete-notification" = {
      timeout     = 5
      handler     = "dist/handlers/notification.handler.deleteNotification"
      description = "Permanently delete a notification"
    }
  }

  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "notification-service"
    ManagedBy   = "Terraform"
  }

  effective_jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.notification_service_jwt_secret.result
}

data "aws_caller_identity" "current" {}

resource "random_password" "notification_service_jwt_secret" {
  length           = 48
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}<>?"
}

# ---------------------------------------------------------------------------
# IAM – Execution Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "notification_service_lambda" {
  name        = "${var.project_name}-${var.environment}-notification-service-lambda-role"
  description = "Execution role for Notification Service Lambda functions"

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

resource "aws_iam_policy" "notification_service_dynamodb" {
  name        = "${var.project_name}-${var.environment}-notification-service-dynamodb"
  description = "DynamoDB read/write access for Notification Service"

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
          "dynamodb:TransactGetItems"
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
# IAM – Policy Attachments
# ---------------------------------------------------------------------------

resource "aws_iam_role_policy_attachment" "notification_service_logs" {
  role       = aws_iam_role.notification_service_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "notification_service_dynamodb" {
  role       = aws_iam_role.notification_service_lambda.name
  policy_arn = aws_iam_policy.notification_service_dynamodb.arn
}

# ---------------------------------------------------------------------------
# Placeholder deployment package
# Used for `terraform plan/apply` before CI/CD publishes the real artifact.
# The real deployment is handled by the CI/CD pipeline (S3 + Lambda update).
# ---------------------------------------------------------------------------

data "archive_file" "notification_service_placeholder" {
  type        = "zip"
  output_path = "${path.module}/notification-service-placeholder.zip"

  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD' }) });"
    filename = "index.js"
  }

  source {
    content  = <<-JS
      exports.listNotifications = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'listNotifications' }) });
      exports.markAsRead = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'markAsRead' }) });
      exports.markAllAsRead = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'markAllAsRead' }) });
      exports.deleteNotification = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'deleteNotification' }) });
    JS
    filename = "dist/handlers/notification.handler.js"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups (pre-created so retention is set before first invoke)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "notification_service" {
  for_each = local.lambda_functions_config

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = 14

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# Lambda Functions
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "notification_service" {
  for_each = local.lambda_functions_config

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.notification_service_lambda.arn

  runtime = "nodejs18.x"
  handler = each.value.handler

  filename         = data.archive_file.notification_service_placeholder.output_path
  source_code_hash = data.archive_file.notification_service_placeholder.output_base64sha256

  timeout     = each.value.timeout
  memory_size = 256

  reserved_concurrent_executions = lookup(each.value, "reserved_concurrent_executions", var.lambda_reserved_concurrency)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = local.dynamodb_table_name
      AWS_REGION          = var.aws_region
      AWS_REGION_NAME     = var.aws_region
      ENVIRONMENT         = var.environment
      JWT_SECRET          = local.effective_jwt_secret
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.notification_service,
    aws_iam_role_policy_attachment.notification_service_logs,
    aws_iam_role_policy_attachment.notification_service_dynamodb,
  ]

  tags = merge(local.common_tags, {
    Name    = "${var.project_name}-${var.environment}-${each.key}"
    Timeout = tostring(each.value.timeout)
  })
}

# ---------------------------------------------------------------------------
# API Gateway – HTTP API (v2)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "notification_service" {
  name          = "${var.project_name}-${var.environment}-notification-service"
  protocol_type = "HTTP"
  description   = "HTTP API for the Notification Service"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Requested-With"]
    max_age       = 300
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_stage" "notification_service" {
  api_id      = aws_apigatewayv2_api.notification_service.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.notification_service_api_gateway.arn
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

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "notification_service_api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-notification-service"
  retention_in_days = 14

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# Lambda Integrations (one per Lambda function)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "notification_service" {
  for_each = local.lambda_functions_config

  api_id             = aws_apigatewayv2_api.notification_service.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.notification_service[each.key].invoke_arn
  integration_method = "POST"

  payload_format_version = "2.0"
}

# ---------------------------------------------------------------------------
# API Gateway Routes
# ---------------------------------------------------------------------------

locals {
  notification_api_routes = {
    "GET /api/admin/notifications"                      = "notification-service-list-notifications"
    "PATCH /api/admin/notifications/{id}/read"          = "notification-service-mark-as-read"
    "POST /api/admin/notifications/mark-all-read"       = "notification-service-mark-all-read"
    "DELETE /api/admin/notifications/{id}"              = "notification-service-delete-notification"
  }
}

resource "aws_apigatewayv2_route" "notification_service" {
  for_each = local.notification_api_routes

  api_id    = aws_apigatewayv2_api.notification_service.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.notification_service[each.value].id}"
}

# ---------------------------------------------------------------------------
# Lambda Permissions – allow API Gateway to invoke each function
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "notification_service" {
  for_each = local.lambda_functions_config

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notification_service[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.notification_service.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "notification_service_api_endpoint" {
  description = "Base URL of the Notification Service API"
  value       = aws_apigatewayv2_stage.notification_service.invoke_url
}

output "notification_service_api_id" {
  description = "ID of the Notification Service API Gateway"
  value       = aws_apigatewayv2_api.notification_service.id
}

output "notification_service_lambda_function_arns" {
  description = "ARNs of all Notification Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.notification_service : k => fn.arn
  }
}

output "notification_service_lambda_function_names" {
  description = "Names of all Notification Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.notification_service : k => fn.function_name
  }
}

output "notification_service_iam_role_arn" {
  description = "ARN of the IAM execution role shared by Notification Service Lambda functions"
  value       = aws_iam_role.notification_service_lambda.arn
}
