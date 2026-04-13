locals {
  legacy_dynamodb_table_name = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${var.project_name}-${var.environment}-art-management"
  legacy_s3_bucket_name      = var.s3_bucket_name != "" ? var.s3_bucket_name : "art-management-images-${var.environment}"
  legacy_effective_jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.legacy_api_jwt_secret.result

  legacy_lambda_config = {
    "legacy-api-router" = {
      timeout     = 30
      handler     = "dist/handlers/lambda.handler"
      description = "Legacy-compatible monolith API for frontend routing compatibility"
    }
  }

  legacy_common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "legacy-api"
    ManagedBy   = "Terraform"
  }
}

resource "random_password" "legacy_api_jwt_secret" {
  length           = 48
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}<>?"
}

resource "aws_iam_role" "legacy_api_lambda" {
  name        = "${var.project_name}-${var.environment}-legacy-api-lambda-role"
  description = "Execution role for the legacy-compatible API Lambda"

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

  tags = local.legacy_common_tags
}

resource "aws_iam_policy" "legacy_api_logs" {
  name        = "${var.project_name}-${var.environment}-legacy-api-logs"
  description = "CloudWatch Logs access for the legacy-compatible API Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogsAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.legacy_api_lambda.arn}:*"
      }
    ]
  })

  tags = local.legacy_common_tags
}

resource "aws_iam_role_policy_attachment" "legacy_api_logs" {
  role       = aws_iam_role.legacy_api_lambda.name
  policy_arn = aws_iam_policy.legacy_api_logs.arn
}

resource "aws_iam_policy" "legacy_api_dynamodb" {
  name        = "${var.project_name}-${var.environment}-legacy-api-dynamodb"
  description = "DynamoDB access for the legacy-compatible API Lambda"

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
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.legacy_dynamodb_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.legacy_dynamodb_table_name}/index/*"
        ]
      }
    ]
  })

  tags = local.legacy_common_tags
}

resource "aws_iam_role_policy_attachment" "legacy_api_dynamodb" {
  role       = aws_iam_role.legacy_api_lambda.name
  policy_arn = aws_iam_policy.legacy_api_dynamodb.arn
}

resource "aws_iam_policy" "legacy_api_s3" {
  name        = "${var.project_name}-${var.environment}-legacy-api-s3"
  description = "S3 access for the legacy-compatible API Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3BucketAccess"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::${local.legacy_s3_bucket_name}"
      },
      {
        Sid    = "S3ObjectAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::${local.legacy_s3_bucket_name}/*"
      }
    ]
  })

  tags = local.legacy_common_tags
}

resource "aws_iam_role_policy_attachment" "legacy_api_s3" {
  role       = aws_iam_role.legacy_api_lambda.name
  policy_arn = aws_iam_policy.legacy_api_s3.arn
}

data "archive_file" "legacy_api_placeholder" {
  type        = "zip"
  output_path = "${path.module}/legacy-api-placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder - deploy via CI/CD' }) });"
    filename = "dist/handlers/lambda.js"
  }
}

resource "aws_cloudwatch_log_group" "legacy_api_lambda" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-legacy-api-router"
  retention_in_days = 14

  tags = local.legacy_common_tags
}

resource "aws_lambda_function" "legacy_api" {
  for_each = local.legacy_lambda_config

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.legacy_api_lambda.arn
  runtime       = "nodejs18.x"
  handler       = each.value.handler
  filename         = data.archive_file.legacy_api_placeholder.output_path
  source_code_hash = data.archive_file.legacy_api_placeholder.output_base64sha256
  timeout          = each.value.timeout
  memory_size      = 512
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      DYNAMODB_TABLE_NAME      = local.legacy_dynamodb_table_name
      PRODUCTS_TABLE_NAME      = local.legacy_dynamodb_table_name
      CARTS_TABLE_NAME         = local.legacy_dynamodb_table_name
      ORDERS_TABLE_NAME        = local.legacy_dynamodb_table_name
      CONTENT_TABLE_NAME       = local.legacy_dynamodb_table_name
      NOTIFICATIONS_TABLE_NAME = local.legacy_dynamodb_table_name
      AUDIT_TABLE_NAME         = local.legacy_dynamodb_table_name
      S3_BUCKET_NAME           = local.legacy_s3_bucket_name
      CDN_URL                  = var.cdn_url
      AWS_REGION_CUSTOM        = var.aws_region
      AWS_REGION_NAME          = var.aws_region
      ENVIRONMENT              = var.environment
      JWT_SECRET               = local.legacy_effective_jwt_secret
      CORS_ALLOWED_ORIGINS     = join(",", var.allowed_origins)
      ADMIN_USERNAME           = var.admin_username != "" ? var.admin_username : "artadmin"
      ADMIN_PASSWORD_HASH      = var.admin_password_hash
      PAYMENT_PROVIDER         = "mock"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.legacy_api_lambda,
    aws_iam_role_policy_attachment.legacy_api_logs,
    aws_iam_role_policy_attachment.legacy_api_dynamodb,
    aws_iam_role_policy_attachment.legacy_api_s3,
  ]

  tags = merge(local.legacy_common_tags, {
    Name    = "${var.project_name}-${var.environment}-${each.key}"
    Timeout = tostring(each.value.timeout)
  })
}

resource "aws_apigatewayv2_api" "legacy_api" {
  name          = "${var.project_name}-${var.environment}-legacy-api"
  protocol_type = "HTTP"
  description   = "Legacy-compatible HTTP API for the static frontend"

  cors_configuration {
    allow_origins     = var.allowed_origins
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["Content-Type", "Authorization", "X-Requested-With", "X-Cart-Session", "x-session-id", "Stripe-Signature"]
    allow_credentials = true
    expose_headers    = ["Set-Cookie"]
    max_age           = 300
  }

  tags = local.legacy_common_tags
}

resource "aws_cloudwatch_log_group" "legacy_api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-legacy-api"
  retention_in_days = 14

  tags = local.legacy_common_tags
}

resource "aws_apigatewayv2_stage" "legacy_api" {
  api_id      = aws_apigatewayv2_api.legacy_api.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.legacy_api_gateway.arn
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

  tags = local.legacy_common_tags
}

resource "aws_apigatewayv2_integration" "legacy_api" {
  api_id                 = aws_apigatewayv2_api.legacy_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.legacy_api["legacy-api-router"].invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "legacy_api_default" {
  api_id    = aws_apigatewayv2_api.legacy_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.legacy_api.id}"
}

resource "aws_lambda_permission" "legacy_api" {
  statement_id  = "AllowLegacyApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.legacy_api["legacy-api-router"].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.legacy_api.execution_arn}/*/*"
}

output "legacy_api_endpoint" {
  description = "Base URL of the legacy-compatible API Gateway endpoint"
  value       = aws_apigatewayv2_stage.legacy_api.invoke_url
}

output "legacy_api_id" {
  description = "ID of the legacy-compatible API Gateway"
  value       = aws_apigatewayv2_api.legacy_api.id
}

output "legacy_api_lambda_name" {
  description = "Name of the legacy-compatible API Lambda function"
  value       = aws_lambda_function.legacy_api["legacy-api-router"].function_name
}