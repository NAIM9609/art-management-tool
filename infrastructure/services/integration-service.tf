# ---------------------------------------------------------------------------
# Integration Service – Terraform Infrastructure
#
# Resources:
#   - IAM execution role + policies (DynamoDB, SSM, CloudWatch Logs)
#   - Lambda functions for every Etsy handler
#   - API Gateway HTTP API (v2) with routes
#   - EventBridge rule for daily scheduled sync
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Integration Service – Terraform Infrastructure
#
# NOTE: This file is part of the same Terraform root module as
# product-service.tf. Shared provider/variable declarations are defined there
# and reused here.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Variables (integration-service specific)
# ---------------------------------------------------------------------------

variable "etsy_client_id" {
  description = "Etsy OAuth application client ID."
  type        = string
  default     = ""
  sensitive   = true
}

variable "etsy_client_secret" {
  description = "Etsy OAuth application client secret."
  type        = string
  default     = ""
  sensitive   = true
}

variable "etsy_redirect_uri" {
  description = "Etsy OAuth redirect URI (must match the URI registered in your Etsy app)."
  type        = string
  default     = ""
}

variable "etsy_webhook_secret" {
  description = "Shared secret used to verify Etsy webhook HMAC signatures."
  type        = string
  default     = ""
  sensitive   = true
}

variable "etsy_shop_ids" {
  description = "Comma-separated list of Etsy shop IDs to include in the daily scheduled sync."
  type        = string
  default     = ""
}

variable "scheduled_sync_enabled" {
  description = "Whether to create the EventBridge rule for daily scheduled sync."
  type        = bool
  default     = true
}

variable "scheduled_sync_cron" {
  description = "EventBridge cron expression for daily sync (UTC)."
  type        = string
  default     = "cron(0 2 * * ? *)"
}

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------

locals {
  integration_dynamodb_table_name  = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${var.project_name}-${var.environment}-art-management"
  integration_effective_jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.integration_service_jwt_secret.result

  # Handler functions config: key → { timeout, handler, description }
  integration_lambda_functions_config = {
    # OAuth
    "integration-service-etsy-initiate-oauth" = {
      timeout     = 5
      handler     = "dist/handlers/etsy.handler.initiateOAuth"
      description = "Initiate Etsy OAuth flow"
    }
    "integration-etsy-callback" = {
      timeout     = 10
      handler     = "dist/handlers/etsy.handler.handleCallback"
      description = "Handle Etsy OAuth callback and exchange code for tokens"
    }

    # Sync
    "integration-service-etsy-sync-products" = {
      timeout     = 30
      handler     = "dist/handlers/etsy.handler.syncProducts"
      description = "Sync Etsy product listings to the platform"
    }
    "integration-service-etsy-sync-inventory" = {
      timeout     = 60
      handler     = "dist/handlers/etsy.handler.syncInventory"
      description = "Sync Etsy listing inventory to the platform"
    }
    "integration-service-etsy-sync-orders" = {
      timeout     = 30
      handler     = "dist/handlers/etsy.handler.syncOrders"
      description = "Sync Etsy orders (receipts) to the platform"
    }

    # Webhook
    "integration-service-etsy-webhook" = {
      timeout     = 10
      handler     = "dist/handlers/etsy.handler.handleWebhook"
      description = "Handle incoming Etsy webhook events"
    }

    # Scheduled sync (invoked by EventBridge)
    "integration-service-etsy-scheduled-sync" = {
      timeout     = 300
      handler     = "dist/handlers/etsy.handler.scheduledSync"
      description = "Daily scheduled sync of all Etsy shops (products, inventory, orders)"
    }
  }

  integration_common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "integration-service"
    ManagedBy   = "Terraform"
  }
}

data "aws_caller_identity" "integration_current" {}

resource "random_password" "integration_service_jwt_secret" {
  length           = 48
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}<>?"
}

# ---------------------------------------------------------------------------
# IAM – Execution Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "integration_service_lambda" {
  name        = "${var.project_name}-${var.environment}-integration-service-lambda-role"
  description = "Execution role for Integration Service Lambda functions"

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

  tags = local.integration_common_tags
}

# ---------------------------------------------------------------------------
# IAM – DynamoDB Policy (store OAuth tokens and sync state)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "integration_service_dynamodb" {
  name        = "${var.project_name}-${var.environment}-integration-service-dynamodb"
  description = "DynamoDB read/write access for Integration Service (OAuth tokens, sync state)"

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
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.integration_current.account_id}:table/${local.integration_dynamodb_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.integration_current.account_id}:table/${local.integration_dynamodb_table_name}/index/*"
        ]
      }
    ]
  })

  tags = local.integration_common_tags
}

# ---------------------------------------------------------------------------
# IAM – Policy Attachments
# ---------------------------------------------------------------------------

resource "aws_iam_role_policy_attachment" "integration_service_logs" {
  role       = aws_iam_role.integration_service_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "integration_service_dynamodb" {
  role       = aws_iam_role.integration_service_lambda.name
  policy_arn = aws_iam_policy.integration_service_dynamodb.arn
}

# ---------------------------------------------------------------------------
# Placeholder deployment package
# Used for `terraform plan/apply` before CI/CD publishes the real artifact.
# ---------------------------------------------------------------------------

data "archive_file" "integration_service_placeholder" {
  type        = "zip"
  output_path = "${path.module}/integration-service-placeholder.zip"

  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD' }) });"
    filename = "index.js"
  }

  source {
    content  = <<-JS
      exports.initiateOAuth    = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder', function: 'initiateOAuth' }) });
      exports.handleCallback   = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder', function: 'handleCallback' }) });
      exports.syncProducts     = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder', function: 'syncProducts' }) });
      exports.syncInventory    = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder', function: 'syncInventory' }) });
      exports.syncOrders       = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder', function: 'syncOrders' }) });
      exports.handleWebhook    = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder', function: 'handleWebhook' }) });
      exports.scheduledSync    = async () => console.log('placeholder scheduledSync');
    JS
    filename = "dist/handlers/etsy.handler.js"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "integration_service" {
  for_each = local.integration_lambda_functions_config

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = 14

  tags = local.integration_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Functions
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "integration_service" {
  for_each = local.integration_lambda_functions_config

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.integration_service_lambda.arn

  runtime = "nodejs18.x"
  handler = each.value.handler

  filename         = data.archive_file.integration_service_placeholder.output_path
  source_code_hash = data.archive_file.integration_service_placeholder.output_base64sha256

  timeout     = each.value.timeout
  memory_size = 256

  reserved_concurrent_executions = lookup(each.value, "reserved_concurrent_executions", var.lambda_reserved_concurrency)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = local.integration_dynamodb_table_name
      AWS_REGION_NAME     = var.aws_region
      ENVIRONMENT         = var.environment
      JWT_SECRET          = local.integration_effective_jwt_secret
      ETSY_CLIENT_ID      = var.etsy_client_id
      ETSY_CLIENT_SECRET  = var.etsy_client_secret
      ETSY_REDIRECT_URI   = var.etsy_redirect_uri
      ETSY_WEBHOOK_SECRET = var.etsy_webhook_secret
      ETSY_SHOP_IDS       = var.etsy_shop_ids
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.integration_service,
    aws_iam_role_policy_attachment.integration_service_logs,
    aws_iam_role_policy_attachment.integration_service_dynamodb,
  ]

  tags = merge(local.integration_common_tags, {
    Name    = "${var.project_name}-${var.environment}-${each.key}"
    Timeout = tostring(each.value.timeout)
  })
}

# ---------------------------------------------------------------------------
# API Gateway – HTTP API (v2)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "integration_service" {
  name          = "${var.project_name}-${var.environment}-integration-service"
  protocol_type = "HTTP"
  description   = "HTTP API for the Integration Service (Etsy)"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Requested-With", "X-Etsy-Signature"]
    max_age       = 300
  }

  tags = local.integration_common_tags
}

resource "aws_apigatewayv2_stage" "integration_service" {
  api_id      = aws_apigatewayv2_api.integration_service.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.integration_api_gateway.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      sourceIp           = "$context.identity.sourceIp"
      requestTime        = "$context.requestTime"
      protocol           = "$context.protocol"
      httpMethod         = "$context.httpMethod"
      resourcePath       = "$context.path"
      routeKey           = "$context.routeKey"
      status             = "$context.status"
      responseLength     = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
    })
  }

  tags = local.integration_common_tags
}

resource "aws_cloudwatch_log_group" "integration_api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-integration-service"
  retention_in_days = 14

  tags = local.integration_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Integrations
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "integration_service" {
  for_each = local.integration_lambda_functions_config

  api_id             = aws_apigatewayv2_api.integration_service.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.integration_service[each.key].invoke_arn
  integration_method = "POST"

  payload_format_version = "2.0"

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# API Gateway Routes
# ---------------------------------------------------------------------------

locals {
  integration_api_routes = {
    # OAuth – public endpoints
    "GET /api/integrations/etsy/auth"     = "integration-service-etsy-initiate-oauth"
    "GET /api/integrations/etsy/callback" = "integration-etsy-callback"

    # Admin sync endpoints (JWT auth enforced at handler level)
    "POST /api/admin/integrations/etsy/sync/products"  = "integration-service-etsy-sync-products"
    "POST /api/admin/integrations/etsy/sync/inventory" = "integration-service-etsy-sync-inventory"
    "POST /api/admin/integrations/etsy/sync/orders"    = "integration-service-etsy-sync-orders"

    # Webhook – verified via HMAC at handler level
    "POST /api/webhooks/etsy" = "integration-service-etsy-webhook"
  }
}

resource "aws_apigatewayv2_route" "integration_service" {
  for_each = local.integration_api_routes

  api_id    = aws_apigatewayv2_api.integration_service.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.integration_service[each.value].id}"

  depends_on = [aws_apigatewayv2_integration.integration_service]
}

# ---------------------------------------------------------------------------
# Lambda Permissions – allow API Gateway to invoke each function
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "integration_service_apigw" {
  # Grant invoke permission only to Lambdas that are exposed via API Gateway routes.
  for_each = {
    for _, fn in local.integration_api_routes : fn => fn
  }

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.integration_service[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.integration_service.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# EventBridge – Daily Scheduled Sync
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "etsy_scheduled_sync" {
  count = var.scheduled_sync_enabled ? 1 : 0

  name                = "${var.project_name}-${var.environment}-etsy-scheduled-sync"
  description         = "Daily trigger for Etsy integration sync (products, inventory, orders)"
  schedule_expression = var.scheduled_sync_cron

  tags = local.integration_common_tags
}

resource "aws_cloudwatch_event_target" "etsy_scheduled_sync" {
  count = var.scheduled_sync_enabled ? 1 : 0

  rule      = aws_cloudwatch_event_rule.etsy_scheduled_sync[0].name
  target_id = "EtsyScheduledSyncLambda"
  arn       = aws_lambda_function.integration_service["integration-service-etsy-scheduled-sync"].arn
}

resource "aws_lambda_permission" "etsy_scheduled_sync_eventbridge" {
  count = var.scheduled_sync_enabled ? 1 : 0

  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.integration_service["integration-service-etsy-scheduled-sync"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.etsy_scheduled_sync[0].arn
}


# ---------------------------------------------------------------------------
# Moved – key renames (integration and lambda)
# ---------------------------------------------------------------------------

moved {
  from = aws_apigatewayv2_integration.integration_service["integration-service-etsy-handle-callback"]
  to   = aws_apigatewayv2_integration.integration_service["integration-etsy-callback"]
}

moved {
  from = aws_lambda_function.integration_service["integration-service-etsy-handle-callback"]
  to   = aws_lambda_function.integration_service["integration-etsy-callback"]
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "integration_api_endpoint" {
  description = "Base URL of the Integration Service API"
  value       = aws_apigatewayv2_stage.integration_service.invoke_url
}

output "integration_api_id" {
  description = "ID of the Integration Service API Gateway"
  value       = aws_apigatewayv2_api.integration_service.id
}

output "integration_lambda_function_arns" {
  description = "ARNs of all Integration Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.integration_service : k => fn.arn
  }
}

output "integration_lambda_function_names" {
  description = "Names of all Integration Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.integration_service : k => fn.function_name
  }
}

output "integration_iam_role_arn" {
  description = "ARN of the IAM execution role for Integration Service Lambda functions"
  value       = aws_iam_role.integration_service_lambda.arn
}

output "etsy_scheduled_sync_rule_arn" {
  description = "ARN of the EventBridge rule for daily Etsy sync (empty when disabled)"
  value       = var.scheduled_sync_enabled ? aws_cloudwatch_event_rule.etsy_scheduled_sync[0].arn : ""
}
