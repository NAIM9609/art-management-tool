# ---------------------------------------------------------------------------
# API Gateway – HTTP API (v2)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "content_service" {
  name          = "${var.project_name}-${var.environment}-content-service"
  protocol_type = "HTTP"
  description   = "HTTP API for the Content Service"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Requested-With"]
    max_age       = 300
  }

  tags = local.content_common_tags
}

resource "aws_apigatewayv2_stage" "content_service" {
  api_id      = aws_apigatewayv2_api.content_service.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.content_service_api_gateway.arn
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

  tags = local.content_common_tags
}

resource "aws_cloudwatch_log_group" "content_service_api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-content-service"
  retention_in_days = 14

  tags = local.content_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Integrations (one per Lambda function)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "content_service" {
  for_each = local.content_lambda_functions_config

  api_id             = aws_apigatewayv2_api.content_service.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.content_service[each.key].invoke_arn
  integration_method = "POST"

  payload_format_version = "2.0"
}

# ---------------------------------------------------------------------------
# API Gateway Routes
# Each entry maps an "METHOD /path" key to the Lambda function key.
# ---------------------------------------------------------------------------

locals {
  content_api_routes = {
    # Personaggi
    "GET /api/personaggi"              = "content-service-list-personaggi"
    "GET /api/personaggi/{id}"         = "content-service-get-personaggio"
    "POST /api/personaggi"             = "content-service-create-personaggio"
    "PUT /api/personaggi/{id}"         = "content-service-update-personaggio"
    "DELETE /api/personaggi/{id}"      = "content-service-delete-personaggio"
    "POST /api/personaggi/{id}/upload" = "content-service-get-personaggio-upload-url"

    # Fumetti
    "GET /api/fumetti"              = "content-service-list-fumetti"
    "GET /api/fumetti/{id}"         = "content-service-get-fumetto"
    "POST /api/fumetti"             = "content-service-create-fumetto"
    "PUT /api/fumetti/{id}"         = "content-service-update-fumetto"
    "DELETE /api/fumetti/{id}"      = "content-service-delete-fumetto"
    "POST /api/fumetti/{id}/upload" = "content-service-get-fumetto-upload-url"
  }
}

resource "aws_apigatewayv2_route" "content_service" {
  for_each = local.content_api_routes

  api_id    = aws_apigatewayv2_api.content_service.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.content_service[each.value].id}"
}

# ---------------------------------------------------------------------------
# Lambda Permissions – allow API Gateway to invoke each function
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "content_service" {
  for_each = local.content_lambda_functions_config

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.content_service[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.content_service.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "content_service_api_endpoint" {
  description = "Base URL of the Content Service API"
  value       = aws_apigatewayv2_stage.content_service.invoke_url
}

output "content_service_api_id" {
  description = "ID of the Content Service API Gateway"
  value       = aws_apigatewayv2_api.content_service.id
}

output "content_service_lambda_function_arns" {
  description = "ARNs of all Content Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.content_service : k => fn.arn
  }
}

output "content_service_lambda_function_names" {
  description = "Names of all Content Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.content_service : k => fn.function_name
  }
}

output "content_service_iam_role_arn" {
  description = "ARN of the IAM execution role shared by Content Service Lambda functions"
  value       = aws_iam_role.content_service_lambda.arn
}
