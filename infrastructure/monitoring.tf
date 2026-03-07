# ---------------------------------------------------------------------------
# Locals – monitoring helpers
# ---------------------------------------------------------------------------

locals {
  # Resolved DynamoDB table name (mirrors the expression in main.tf)
  monitoring_dynamodb_table_name = aws_dynamodb_table.art_management.name

  # All product-service Lambda function name suffixes (must stay in sync with
  # services/product-service.tf -> local.lambda_functions_config).
  monitoring_lambda_function_keys = [
    "product-service-list-products",
    "product-service-get-product",
    "product-service-create-product",
    "product-service-update-product",
    "product-service-delete-product",
    "product-service-list-categories",
    "product-service-get-category",
    "product-service-create-category",
    "product-service-update-category",
    "product-service-delete-category",
    "product-service-list-variants",
    "product-service-create-variant",
    "product-service-update-variant",
    "product-service-update-stock",
    "product-service-get-upload-url",
    "product-service-list-images",
    "product-service-delete-image",
  ]

  # Full Lambda function names for use in CloudWatch metric expressions.
  monitoring_lambda_function_names = [
    for key in local.monitoring_lambda_function_keys :
    "${var.project_name}-${var.environment}-${key}"
  ]

  # Cost-allocation tags applied to every monitoring resource.
  monitoring_tags = {
    Environment = var.environment
    Project     = "art-management"
    Service     = "monitoring"
    ManagedBy   = "Terraform"
  }

  # ---------------------------------------------------------------------------
  # Pre-built metric arrays for the CloudWatch dashboard widgets.
  # Each element follows CloudWatch's JSON format:
  #   ["Namespace", "MetricName", "DimName", "DimValue", {options}]
  # ---------------------------------------------------------------------------

  dashboard_lambda_invocation_metrics = [
    for name in local.monitoring_lambda_function_names :
    ["AWS/Lambda", "Invocations", "FunctionName", name, { stat = "Sum", period = 60 }]
  ]

  dashboard_lambda_error_metrics = [
    for name in local.monitoring_lambda_function_names :
    ["AWS/Lambda", "Errors", "FunctionName", name, { stat = "Sum", period = 60 }]
  ]

  dashboard_lambda_duration_p50_metrics = [
    for name in local.monitoring_lambda_function_names :
    ["AWS/Lambda", "Duration", "FunctionName", name, { stat = "p50", period = 60 }]
  ]

  dashboard_lambda_duration_p99_metrics = [
    for name in local.monitoring_lambda_function_names :
    ["AWS/Lambda", "Duration", "FunctionName", name, { stat = "p99", period = 60 }]
  ]

  # API Gateway metric widgets – empty when no API ID is supplied.
  dashboard_apigw_request_metrics = var.api_gateway_id != "" ? [
    ["AWS/ApiGateway", "Count", "ApiId", var.api_gateway_id, { stat = "Sum", period = 60 }]
  ] : []

  dashboard_apigw_error_metrics = var.api_gateway_id != "" ? [
    ["AWS/ApiGateway", "4XXError", "ApiId", var.api_gateway_id, { stat = "Sum", period = 60, color = "#FF9900" }],
    ["AWS/ApiGateway", "5XXError", "ApiId", var.api_gateway_id, { stat = "Sum", period = 60, color = "#D62728" }],
  ] : []
}

# ---------------------------------------------------------------------------
# SNS Topic – alert notifications
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-alerts"

  tags = local.monitoring_tags
}

# Subscribe the administrator email to the SNS topic.
# AWS sends a confirmation email; the subscription is pending until confirmed.
resource "aws_sns_topic_subscription" "admin_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.admin_email
}

# ---------------------------------------------------------------------------
# CloudWatch Dashboard
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [

      # ── DynamoDB ─────────────────────────────────────────────────────────

      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 1
        properties = {
          markdown = "## DynamoDB"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 1
        width  = 12
        height = 6
        properties = {
          title   = "DynamoDB Consumed Read Capacity"
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", local.monitoring_dynamodb_table_name, { stat = "Sum", period = 60 }]
          ]
          region = var.aws_region
          yAxis  = { left = { min = 0 } }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 1
        width  = 12
        height = 6
        properties = {
          title   = "DynamoDB Consumed Write Capacity"
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", local.monitoring_dynamodb_table_name, { stat = "Sum", period = 60 }]
          ]
          region = var.aws_region
          yAxis  = { left = { min = 0 } }
        }
      },

      # ── Lambda – Product Service ──────────────────────────────────────────

      {
        type   = "text"
        x      = 0
        y      = 7
        width  = 24
        height = 1
        properties = {
          markdown = "## Lambda – Product Service"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 8
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Invocations by Function"
          view    = "timeSeries"
          stacked = true
          metrics = local.dashboard_lambda_invocation_metrics
          region  = var.aws_region
          yAxis   = { left = { min = 0 } }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 8
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Errors by Function"
          view    = "timeSeries"
          stacked = true
          metrics = local.dashboard_lambda_error_metrics
          region  = var.aws_region
          yAxis   = { left = { min = 0 } }
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 14
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Duration p50 by Function"
          view    = "timeSeries"
          stacked = false
          metrics = local.dashboard_lambda_duration_p50_metrics
          region  = var.aws_region
          yAxis   = { left = { min = 0 } }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 14
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Duration p99 by Function"
          view    = "timeSeries"
          stacked = false
          metrics = local.dashboard_lambda_duration_p99_metrics
          region  = var.aws_region
          yAxis   = { left = { min = 0 } }
        }
      },

      # ── API Gateway – Product Service ─────────────────────────────────────

      {
        type   = "text"
        x      = 0
        y      = 20
        width  = 24
        height = 1
        properties = {
          markdown = "## API Gateway – Product Service"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 21
        width  = 12
        height = 6
        properties = {
          title   = "API Gateway Requests"
          view    = "timeSeries"
          stacked = false
          metrics = local.dashboard_apigw_request_metrics
          region  = var.aws_region
          yAxis   = { left = { min = 0 } }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 21
        width  = 12
        height = 6
        properties = {
          title   = "API Gateway 4xx / 5xx Errors"
          view    = "timeSeries"
          stacked = false
          metrics = local.dashboard_apigw_error_metrics
          region  = var.aws_region
          yAxis   = { left = { min = 0 } }
        }
      },

      # ── CloudFront ───────────────────────────────────────────────────────

      {
        type   = "text"
        x      = 0
        y      = 27
        width  = 24
        height = 1
        properties = {
          markdown = "## CloudFront"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 28
        width  = 24
        height = 6
        properties = {
          title   = "CloudFront Data Transfer (Bytes Downloaded)"
          view    = "timeSeries"
          stacked = false
          # CloudFront metrics are always published to us-east-1.
          metrics = [
            ["AWS/CloudFront", "BytesDownloaded", "DistributionId", aws_cloudfront_distribution.images.id, "Region", "Global", { stat = "Sum", period = 86400 }]
          ]
          region = "us-east-1"
          yAxis  = { left = { min = 0 } }
        }
      },
    ]
  })
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "sns_topic_arn" {
  description = "ARN of the SNS topic used for CloudWatch alarm notifications"
  value       = aws_sns_topic.alerts.arn
}

output "dashboard_url" {
  description = "URL of the CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}
