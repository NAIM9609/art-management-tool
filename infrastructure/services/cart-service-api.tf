# ---------------------------------------------------------------------------
# API Gateway – HTTP API (v2) for Cart Service
#
# NOTE: This file is part of the same Terraform root module as
# product-service.tf and cart-service.tf.  Shared variables (project_name,
# environment, allowed_origins) and locals (cart_lambda_functions_config,
# cart_common_tags) are declared in those files and available here.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# API Gateway – HTTP API (v2)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "cart_service" {
  name          = "${var.project_name}-${var.environment}-cart-service"
  protocol_type = "HTTP"
  description   = "HTTP API for the Cart Service"

  cors_configuration {
    allow_origins     = var.allowed_origins
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["Content-Type", "Authorization", "X-Requested-With", "X-Cart-Session", "X-Session-Id"]
    expose_headers    = ["Set-Cookie"]
    allow_credentials = true
    max_age           = 300
  }

  tags = local.cart_common_tags
}

resource "aws_apigatewayv2_stage" "cart_service" {
  api_id      = aws_apigatewayv2_api.cart_service.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.cart_service_api_gateway.arn
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

  tags = local.cart_common_tags
}

import {
  to = aws_cloudwatch_log_group.cart_service_api_gateway
  id = "/aws/apigateway/${var.project_name}-${var.environment}-cart-service"
}

resource "aws_cloudwatch_log_group" "cart_service_api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-cart-service"
  retention_in_days = 14

  tags = local.cart_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Integrations (one per Lambda function)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "cart_service" {
  for_each = local.cart_lambda_functions_config

  api_id             = aws_apigatewayv2_api.cart_service.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.cart_service[each.key].invoke_arn
  integration_method = "POST"

  payload_format_version = "2.0"
}

# ---------------------------------------------------------------------------
# API Gateway Routes
# Each entry maps an "METHOD /path" key to the Lambda function key.
# ---------------------------------------------------------------------------

locals {
  cart_api_routes = {
    # Cart
    "GET /api/cart"               = "cart-service-get-cart"
    "POST /api/cart/items"        = "cart-service-add-item"
    "PATCH /api/cart/items/{id}"  = "cart-service-update-quantity"
    "DELETE /api/cart/items/{id}" = "cart-service-remove-item"
    "DELETE /api/cart"            = "cart-service-clear-cart"
    "POST /api/cart/discount"     = "cart-service-apply-discount"
    "DELETE /api/cart/discount"   = "cart-service-remove-discount"
  }
}

resource "aws_apigatewayv2_route" "cart_service" {
  for_each = local.cart_api_routes

  api_id    = aws_apigatewayv2_api.cart_service.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.cart_service[each.value].id}"
}

# ---------------------------------------------------------------------------
# Lambda Permissions – allow API Gateway to invoke each function
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "cart_service" {
  for_each = local.cart_lambda_functions_config

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cart_service[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.cart_service.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "cart_api_endpoint" {
  description = "Base URL of the Cart Service API"
  value       = aws_apigatewayv2_stage.cart_service.invoke_url
}

output "cart_api_id" {
  description = "ID of the Cart Service API Gateway"
  value       = aws_apigatewayv2_api.cart_service.id
}

output "cart_lambda_function_arns" {
  description = "ARNs of all Cart Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.cart_service : k => fn.arn
  }
}

output "cart_lambda_function_names" {
  description = "Names of all Cart Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.cart_service : k => fn.function_name
  }
}

output "cart_iam_role_arn" {
  description = "ARN of the IAM execution role shared by Cart Service Lambda functions"
  value       = aws_iam_role.cart_service_lambda.arn
}
