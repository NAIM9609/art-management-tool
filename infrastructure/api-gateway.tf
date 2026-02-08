# API Gateway for Art Management API
# HTTP API (v2) for cost efficiency

resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
  description   = "Art Management Tool API Gateway"

  cors_configuration {
    allow_origins     = split(",", var.cors_allowed_origins)
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
    allow_headers     = ["*"]
    expose_headers    = ["*"]
    max_age           = 3600
    allow_credentials = true
  }

  tags = {
    Name        = "${var.project_name}-api"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Lambda integration
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

# Default route (catch-all)
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Health check route
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# API routes - grouped by resource

# Shop routes
resource "aws_apigatewayv2_route" "shop" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /api/shop/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Admin routes
resource "aws_apigatewayv2_route" "admin" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /api/admin/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Auth routes
resource "aws_apigatewayv2_route" "auth" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /api/auth/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Personaggi routes
resource "aws_apigatewayv2_route" "personaggi" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /api/personaggi/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Fumetti routes
resource "aws_apigatewayv2_route" "fumetti" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "ANY /api/fumetti/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Production stage with auto-deploy
resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "prod"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
    })
  }

  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }

  tags = {
    Name        = "${var.project_name}-api-prod"
    Environment = var.environment
    Project     = var.project_name
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway_logs" {
  name              = "/aws/api-gateway/${var.project_name}"
  retention_in_days = 14

  tags = {
    Name        = "${var.project_name}-api-gateway-logs"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Optional: Custom domain name
resource "aws_apigatewayv2_domain_name" "api" {
  count       = var.api_domain_name != "" ? 1 : 0
  domain_name = var.api_domain_name

  domain_name_configuration {
    certificate_arn = var.api_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = {
    Name        = "${var.project_name}-api-domain"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_apigatewayv2_api_mapping" "api" {
  count       = var.api_domain_name != "" ? 1 : 0
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.api[0].id
  stage       = aws_apigatewayv2_stage.prod.id
}

# Output API Gateway details
output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_stage.prod.invoke_url
}

output "api_id" {
  description = "API Gateway ID"
  value       = aws_apigatewayv2_api.api.id
}

output "api_custom_domain" {
  description = "API Gateway custom domain"
  value       = var.api_domain_name != "" ? aws_apigatewayv2_domain_name.api[0].domain_name : null
}
