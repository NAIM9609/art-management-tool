# ---------------------------------------------------------------------------
# DynamoDB Consumed Capacity Alarms
# Threshold: 20 RCU / WCU per minute – approaching the 25 RCU/WCU free tier.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "dynamodb_read_capacity" {
  alarm_name        = "${var.project_name}-${var.environment}-dynamodb-read-capacity"
  alarm_description = "DynamoDB consumed read capacity > 20 RCU/min – approaching free-tier limit (25 RCU)"

  namespace   = "AWS/DynamoDB"
  metric_name = "ConsumedReadCapacityUnits"
  dimensions = {
    TableName = aws_dynamodb_table.art_management.name
  }
  statistic = "Sum"
  period    = 60 # 1-minute granularity

  comparison_operator = "GreaterThanThreshold"
  threshold           = 20
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.monitoring_tags
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_write_capacity" {
  alarm_name        = "${var.project_name}-${var.environment}-dynamodb-write-capacity"
  alarm_description = "DynamoDB consumed write capacity > 20 WCU/min – approaching free-tier limit (25 WCU)"

  namespace   = "AWS/DynamoDB"
  metric_name = "ConsumedWriteCapacityUnits"
  dimensions = {
    TableName = aws_dynamodb_table.art_management.name
  }
  statistic = "Sum"
  period    = 60

  comparison_operator = "GreaterThanThreshold"
  threshold           = 20
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.monitoring_tags
}

# ---------------------------------------------------------------------------
# Lambda Invocations Alarm
# Free tier: 1,000,000 requests/month.  Alert at 90 % = 900,000/month.
# Expressed as a daily pace: 900,000 / 30 = 30,000 invocations/day.
# No FunctionName dimension → aggregates across all Lambda functions in the
# account, which matches the "per-account free tier" intent.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "lambda_invocations" {
  alarm_name        = "${var.project_name}-${var.environment}-lambda-invocations"
  alarm_description = "Lambda invocations > 30,000/day (pace for 900K/month – 90% of free tier)"

  namespace   = "AWS/Lambda"
  metric_name = "Invocations"
  statistic   = "Sum"
  period      = 86400 # 1 day

  comparison_operator = "GreaterThanThreshold"
  threshold           = 30000
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.monitoring_tags
}

# ---------------------------------------------------------------------------
# Lambda Error Rate Alarm (> 1 %)
# Uses metric math: error_rate = 100 * Errors / Invocations.
# No dimensions → account-level aggregate across all Lambda functions.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "lambda_error_rate" {
  alarm_name        = "${var.project_name}-${var.environment}-lambda-error-rate"
  alarm_description = "Lambda error rate > 1% (5-minute window)"

  comparison_operator = "GreaterThanThreshold"
  threshold           = 1 # percent
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "error_rate"
    expression  = "IF(m_invocations > 0, 100 * m_errors / m_invocations, 0)"
    label       = "Error Rate (%)"
    return_data = true
  }

  metric_query {
    id = "m_errors"
    metric {
      namespace   = "AWS/Lambda"
      metric_name = "Errors"
      period      = 300
      stat        = "Sum"
    }
  }

  metric_query {
    id = "m_invocations"
    metric {
      namespace   = "AWS/Lambda"
      metric_name = "Invocations"
      period      = 300
      stat        = "Sum"
    }
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.monitoring_tags
}

# ---------------------------------------------------------------------------
# API Gateway 5xx Error Rate Alarm (> 5 %)
# Only created when var.api_gateway_id is supplied (services deployment first).
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx_error_rate" {
  count = var.api_gateway_id != "" ? 1 : 0

  alarm_name        = "${var.project_name}-${var.environment}-api-gateway-5xx-error-rate"
  alarm_description = "API Gateway 5xx error rate > 5% (5-minute window)"

  comparison_operator = "GreaterThanThreshold"
  threshold           = 5 # percent
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "error_rate_5xx"
    expression  = "IF(m_requests > 0, 100 * m_5xx / m_requests, 0)"
    label       = "5xx Error Rate (%)"
    return_data = true
  }

  metric_query {
    id = "m_5xx"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5XXError"
      period      = 300
      stat        = "Sum"
      dimensions = {
        ApiId = var.api_gateway_id
      }
    }
  }

  metric_query {
    id = "m_requests"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "Count"
      period      = 300
      stat        = "Sum"
      dimensions = {
        ApiId = var.api_gateway_id
      }
    }
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.monitoring_tags
}

# ---------------------------------------------------------------------------
# CloudFront Data Transfer Alarm (> 45 GB/month)
# CloudFront metrics are published only to us-east-1.
# Daily threshold: 45 GB / 30 days ≈ 1.5 GB/day = 1,610,612,736 bytes.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "cloudfront_data_transfer" {
  alarm_name        = "${var.project_name}-${var.environment}-cloudfront-data-transfer"
  alarm_description = "CloudFront BytesDownloaded > 1.5 GB/day (pace for 45 GB/month)"

  namespace   = "AWS/CloudFront"
  metric_name = "BytesDownloaded"
  dimensions = {
    DistributionId = aws_cloudfront_distribution.images.id
    Region         = "Global"
  }
  statistic = "Sum"
  period    = 86400 # 1 day

  comparison_operator = "GreaterThanThreshold"
  threshold           = 1610612736 # bytes: 45 GB / 30 days = 1.5 GB/day = 1,610,612,736 bytes
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.monitoring_tags
}
