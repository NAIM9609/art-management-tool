# CloudFront metrics are emitted in us-east-1 regardless of stack region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# ---------------------------------------------------------------------------
# DynamoDB Consumed Capacity Alarms
# Billing mode: PROVISIONED – base table: 5 RCU / 5 WCU.
# Threshold set at 80% of provisioned capacity (4 RCU/s = 240 per 60s period)
# to warn before throttling, which would pressure an increase in provisioned
# capacity (and incur costs once the total exceeds the 25 RCU/WCU free tier).
# Note: GSI consumed capacity is tracked separately (dimension:
# GlobalSecondaryIndexName). Each GSI is also provisioned at 5 RCU/5 WCU.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "dynamodb_read_capacity" {
  alarm_name        = "${var.project_name}-${var.environment}-dynamodb-read-capacity"
  alarm_description = "DynamoDB base-table consumed read capacity > 240 RCU/min (≥80% of 5 RCU/s provisioned). Throttling would force a capacity increase beyond the 25 RCU always-free limit."

  namespace   = "AWS/DynamoDB"
  metric_name = "ConsumedReadCapacityUnits"
  dimensions = {
    TableName = aws_dynamodb_table.art_management.name
  }
  statistic = "Sum"
  period    = 60 # 1-minute granularity

  comparison_operator = "GreaterThanThreshold"
  threshold           = 240 # 4 RCU/s × 60s = 80% of provisioned 5 RCU/s base table
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.monitoring_tags
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_write_capacity" {
  alarm_name        = "${var.project_name}-${var.environment}-dynamodb-write-capacity"
  alarm_description = "DynamoDB base-table consumed write capacity > 240 WCU/min (≥80% of 5 WCU/s provisioned). Throttling would force a capacity increase beyond the 25 WCU always-free limit."

  namespace   = "AWS/DynamoDB"
  metric_name = "ConsumedWriteCapacityUnits"
  dimensions = {
    TableName = aws_dynamodb_table.art_management.name
  }
  statistic = "Sum"
  period    = 60

  comparison_operator = "GreaterThanThreshold"
  threshold           = 240 # 4 WCU/s × 60s = 80% of provisioned 5 WCU/s base table
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.monitoring_tags
}
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
  alarm_description = "Lambda error rate > 1% (25-minute evaluation window; 3 of 5 datapoints)"

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
# Lambda GB-Seconds Alarm
# Free tier: 400,000 GB-seconds/month.  Alert at 80% = 320,000 GB-s/month.
# Daily pace: 320,000 / 30 ≈ 10,667 GB-s/day.
# All Lambda functions are provisioned at 256 MB = 0.25 GB, so:
#   GB-seconds = Sum(Duration_ms) / 1000 * 0.25
#   Alarm when Sum(Duration_ms) / 1000 * 0.25 > 10,667
# No FunctionName dimension → account-level aggregate.
# NOTE: The invocations alarm (30K/day) does NOT protect this limit.  At 256 MB
# and a 10-second timeout, only ~5,333 invocations/day exhaust the GB-second
# free tier.  This alarm is the binding guard for long-running functions.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "lambda_gb_seconds" {
  alarm_name        = "${var.project_name}-${var.environment}-lambda-gb-seconds"
  alarm_description = "Lambda compute > 10,667 GB-seconds/day (pace for 320K/month – 80% of the 400K GB-second free tier at 256 MB)"

  comparison_operator = "GreaterThanThreshold"
  threshold           = 10667 # GB-seconds per day
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "gb_seconds"
    expression  = "m_duration / 1000 * 0.25" # 256 MB = 0.25 GB
    label       = "GB-Seconds (256 MB)"
    return_data = true
  }

  metric_query {
    id = "m_duration"
    metric {
      namespace   = "AWS/Lambda"
      metric_name = "Duration"
      period      = 86400 # 1 day
      stat        = "Sum"
      # No dimensions = account-level aggregate across all Lambda functions
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
  alarm_description = "API Gateway 5xx error rate > 5% (25-minute evaluation window; 3 of 5 datapoints)"

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
  provider = aws.us_east_1

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
