output "service_api_endpoints" {
  description = "Invoke URLs for each service-specific API Gateway stage in the active environment"
  value = {
    audit        = aws_apigatewayv2_stage.audit_service.invoke_url
    cart         = aws_apigatewayv2_stage.cart_service.invoke_url
    content      = aws_apigatewayv2_stage.content_service.invoke_url
    discount     = aws_apigatewayv2_stage.discount_service.invoke_url
    integration  = aws_apigatewayv2_stage.integration_service.invoke_url
    legacy       = aws_apigatewayv2_stage.legacy_api.invoke_url
    notification = aws_apigatewayv2_stage.notification_service.invoke_url
    order        = aws_apigatewayv2_stage.order_service.invoke_url
    product      = aws_apigatewayv2_stage.product_service.invoke_url
  }
}

output "service_api_gateway_ids" {
  description = "API Gateway IDs for each service-specific HTTP API"
  value = {
    audit        = aws_apigatewayv2_api.audit_service.id
    cart         = aws_apigatewayv2_api.cart_service.id
    content      = aws_apigatewayv2_api.content_service.id
    discount     = aws_apigatewayv2_api.discount_service.id
    integration  = aws_apigatewayv2_api.integration_service.id
    legacy       = aws_apigatewayv2_api.legacy_api.id
    notification = aws_apigatewayv2_api.notification_service.id
    order        = aws_apigatewayv2_api.order_service.id
    product      = aws_apigatewayv2_api.product_service.id
  }
}