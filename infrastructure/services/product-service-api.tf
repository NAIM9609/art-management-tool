# ---------------------------------------------------------------------------
# API Gateway – HTTP API (v2)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "product_service" {
  name          = "${var.project_name}-${var.environment}-product-service"
  protocol_type = "HTTP"
  description   = "HTTP API for the Product Service"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Requested-With"]
    max_age       = 300
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_stage" "product_service" {
  api_id      = aws_apigatewayv2_api.product_service.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
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

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.project_name}-${var.environment}-product-service"
  retention_in_days = 14

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# Lambda Integrations (one per Lambda function)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "product_service" {
  for_each = local.lambda_functions_config

  api_id             = aws_apigatewayv2_api.product_service.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.product_service[each.key].invoke_arn
  integration_method = "POST"

  payload_format_version = "2.0"
}

# ---------------------------------------------------------------------------
# API Gateway Routes
# Each entry maps an "METHOD /path" key to the Lambda function key.
# ---------------------------------------------------------------------------

locals {
  api_routes = {
    # Health check
    "GET /health" = "product-service-health"

    # Products
    "GET /api/products"         = "product-service-list-products"
    "GET /api/products/{slug}"  = "product-service-get-product"
    "POST /api/products"        = "product-service-create-product"
    "PUT /api/products/{id}"    = "product-service-update-product"
    "DELETE /api/products/{id}" = "product-service-delete-product"

    # Categories
    "GET /api/categories"         = "product-service-list-categories"
    "GET /api/categories/{slug}"  = "product-service-get-category"
    "POST /api/categories"        = "product-service-create-category"
    "PUT /api/categories/{id}"    = "product-service-update-category"
    "DELETE /api/categories/{id}" = "product-service-delete-category"

    # Variants
    "GET /api/products/{id}/variants"  = "product-service-list-variants"
    "POST /api/products/{id}/variants" = "product-service-create-variant"
    "PUT /api/variants/{id}"           = "product-service-update-variant"
    "PATCH /api/variants/{id}/stock"   = "product-service-update-stock"

    # Images
    "GET /api/products/{id}/upload-url"          = "product-service-get-upload-url"
    "GET /api/products/{id}/images"              = "product-service-list-images"
    "DELETE /api/products/{id}/images/{imageId}" = "product-service-delete-image"
  }
}

resource "aws_apigatewayv2_route" "product_service" {
  for_each = local.api_routes

  api_id    = aws_apigatewayv2_api.product_service.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.product_service[each.value].id}"
}

# ---------------------------------------------------------------------------
# Lambda Permissions – allow API Gateway to invoke each function
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "product_service" {
  for_each = local.lambda_functions_config

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.product_service[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.product_service.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "api_endpoint" {
  description = "Base URL of the Product Service API"
  value       = aws_apigatewayv2_stage.product_service.invoke_url
}

output "api_id" {
  description = "ID of the Product Service API Gateway"
  value       = aws_apigatewayv2_api.product_service.id
}

output "lambda_function_arns" {
  description = "ARNs of all Product Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.product_service : k => fn.arn
  }
}

output "lambda_function_names" {
  description = "Names of all Product Service Lambda functions"
  value = {
    for k, fn in aws_lambda_function.product_service : k => fn.function_name
  }
}

output "iam_role_arn" {
  description = "ARN of the IAM execution role shared by Product Service Lambda functions"
  value       = aws_iam_role.product_service_lambda.arn
}
