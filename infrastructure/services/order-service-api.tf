# ---------------------------------------------------------------------------
# API Gateway – HTTP API (v2)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "order_service" {
  name          = "${var.project_name}-${var.environment}-order-service"
  protocol_type = "HTTP"
  description   = "HTTP API for the Order Service"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Requested-With"]
    max_age       = 300
  }

  tags = local.order_common_tags
}

resource "aws_apigatewayv2_stage" "order_service" {
  api_id      = aws_apigatewayv2_api.order_service.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.order_service_api_gateway.arn
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

  tags = local.order_common_tags
}

resource "aws_cloudwatch_log_group" "order_service_api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-order-service"
  retention_in_days = 14

  tags = local.order_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Integrations (one per Lambda function)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "order_service" {
  for_each = local.order_lambda_functions_config

  api_id             = aws_apigatewayv2_api.order_service.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.order_service[each.key].invoke_arn
  integration_method = "POST"

  payload_format_version = "2.0"

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# API Gateway Routes
# Each entry maps a "METHOD /path" key to the Lambda function key.
# ---------------------------------------------------------------------------

locals {
  order_api_routes = {
    # Customer order routes
    "POST /api/orders"              = "order-service-create-order"
    "GET /api/orders/{orderNumber}" = "order-service-get-order"
    "GET /api/orders"               = "order-service-get-customer-orders"
    "POST /api/orders/{id}/payment" = "order-service-process-payment"

    # Admin order routes
    "GET /api/admin/orders"               = "order-service-list-orders"
    "PATCH /api/admin/orders/{id}/status" = "order-service-update-status"

    # Payment webhook
    "POST /api/webhooks/payment" = "order-service-webhook"
  }
}

resource "aws_apigatewayv2_route" "order_service" {
  for_each = local.order_api_routes

  api_id    = aws_apigatewayv2_api.order_service.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.order_service[each.value].id}"

  depends_on = [aws_apigatewayv2_integration.order_service]
}

# ---------------------------------------------------------------------------
# Lambda Permissions – allow API Gateway to invoke each function
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "order_service" {
  for_each = local.order_lambda_functions_config

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.order_service[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.order_service.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "order_service_api_endpoint" {
  description = "Base URL of the Order Service API"
  value       = aws_apigatewayv2_stage.order_service.invoke_url
}

output "order_service_api_id" {
  description = "ID of the Order Service API Gateway"
  value       = aws_apigatewayv2_api.order_service.id
}

output "order_service_lambda_function_arns" {
  description = "ARNs of all Order Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.order_service : k => fn.arn
  }
}

output "order_service_lambda_function_names" {
  description = "Names of all Order Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.order_service : k => fn.function_name
  }
}

output "order_service_iam_role_arn" {
  description = "ARN of the IAM execution role shared by Order Service Lambda functions"
  value       = aws_iam_role.order_service_lambda.arn
}
