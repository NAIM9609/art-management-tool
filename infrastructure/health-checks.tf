# ---------------------------------------------------------------------------
# Health Check & Synthetic Monitoring
#
# Resources in this file:
#   1. Route 53 Health Check  – monitors the /health endpoint every 30 s
#   2. CloudWatch Alarm       – fires if the health check fails 3 times
#   3. CloudWatch Synthetics  – canary that runs a critical-flow test every 5 min
#   4. CloudWatch Alarm       – fires if the canary reports failures
#
# All resources are conditional on var.health_endpoint_url being set so that
# the module can be applied before the API Gateway URL is known.
# ---------------------------------------------------------------------------

locals {
  # Parse hostname and path from the health endpoint URL so they can be
  # supplied to the Route 53 health check resource independently.
  # When the variable is empty we fall back to safe placeholder values that
  # satisfy Terraform's type system without creating real resources (count=0).
  health_check_enabled = var.health_endpoint_url != ""
  health_endpoint_host = local.health_check_enabled ? regex("^https?://([^/:]+)", var.health_endpoint_url)[0] : "localhost"
  health_endpoint_path = local.health_check_enabled ? (
    length(regexall("^https?://[^/]+(/.+)$", var.health_endpoint_url)) > 0
    ? regex("^https?://[^/]+(/.+)$", var.health_endpoint_url)[0]
    : "/health"
  ) : "/health"

  health_checks_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "health-checks"
    ManagedBy   = "Terraform"
  }
}

# ---------------------------------------------------------------------------
# IAM Role – CloudWatch Synthetics
# ---------------------------------------------------------------------------

resource "aws_iam_role" "synthetics_canary" {
  count = local.health_check_enabled ? 1 : 0

  name        = "${var.project_name}-${var.environment}-synthetics-canary-role"
  description = "Execution role for CloudWatch Synthetics canary"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SyntheticsAssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.health_checks_tags
}

resource "aws_iam_role_policy" "synthetics_canary" {
  count = local.health_check_enabled ? 1 : 0

  name = "${var.project_name}-${var.environment}-synthetics-canary-policy"
  role = aws_iam_role.synthetics_canary[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:log-group:/aws/lambda/cwsyn-*:*"
      },
      {
        Sid    = "S3Artifacts"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetBucketLocation",
        ]
        Resource = [
          aws_s3_bucket.synthetics_artifacts[0].arn,
          "${aws_s3_bucket.synthetics_artifacts[0].arn}/*",
        ]
      },
      {
        Sid    = "CloudWatchMetrics"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "CloudWatchSynthetics"
          }
        }
      },
      {
        Sid    = "XRay"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
        ]
        Resource = "*"
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# S3 Bucket – Synthetics Canary Artifacts
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "synthetics_artifacts" {
  count = local.health_check_enabled ? 1 : 0

  bucket        = "${var.project_name}-${var.environment}-synthetics-artifacts"
  force_destroy = true

  tags = local.health_checks_tags
}

resource "aws_s3_bucket_lifecycle_configuration" "synthetics_artifacts" {
  count = local.health_check_enabled ? 1 : 0

  bucket = aws_s3_bucket.synthetics_artifacts[0].id

  rule {
    id     = "expire-artifacts"
    status = "Enabled"

    filter {
      prefix = "canary/"
    }

    expiration {
      days = 30
    }
  }
}

resource "aws_s3_bucket_public_access_block" "synthetics_artifacts" {
  count = local.health_check_enabled ? 1 : 0

  bucket                  = aws_s3_bucket.synthetics_artifacts[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# Route 53 Health Check
# ---------------------------------------------------------------------------

resource "aws_route53_health_check" "product_service" {
  count = local.health_check_enabled ? 1 : 0

  fqdn              = local.health_endpoint_host
  port              = 443
  type              = "HTTPS_STR_MATCH"
  resource_path     = local.health_endpoint_path
  request_interval  = 30
  failure_threshold = 3
  search_string     = "\"status\":\"healthy\""

  tags = merge(local.health_checks_tags, {
    Name = "${var.project_name}-${var.environment}-product-service-health"
  })
}

# CloudWatch alarm that fires when the Route 53 health check reports unhealthy.
# Route 53 health-check metrics are always published to us-east-1.
resource "aws_cloudwatch_metric_alarm" "route53_health_check" {
  count    = local.health_check_enabled ? 1 : 0
  provider = aws.us_east_1

  alarm_name        = "${var.project_name}-${var.environment}-route53-health-check"
  alarm_description = "Route 53 health check for product-service /health endpoint is failing"

  namespace   = "AWS/Route53"
  metric_name = "HealthCheckStatus"
  dimensions = {
    HealthCheckId = aws_route53_health_check.product_service[0].id
  }
  statistic = "Minimum"
  period    = 60

  # HealthCheckStatus is 1 (healthy) or 0 (unhealthy).
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  treat_missing_data  = "breaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.health_checks_tags
}

# ---------------------------------------------------------------------------
# CloudWatch Synthetics Canary
# ---------------------------------------------------------------------------

# Canary script: performs a GET /health and asserts HTTP 200 + healthy status.
data "archive_file" "canary_script" {
  count = local.health_check_enabled ? 1 : 0

  type        = "zip"
  output_path = "${path.module}/canary-script.zip"

  source {
    filename = "nodejs/node_modules/index.js"
    content  = <<-JS
      const synthetics = require('Synthetics');
      const log        = require('SyntheticsLogger');

      const healthCheckBlueprint = async () => {
        const url = '${var.health_endpoint_url}';
        log.info('Checking health endpoint: ' + url);

        const response = await synthetics.executeHttpStep(
          'GET /health',
          url,
          { method: 'GET', headers: { Accept: 'application/json' } }
        );

        const body = JSON.parse(response.body);
        log.info('Health response: ' + JSON.stringify(body));

        if (response.statusCode !== 200) {
          throw new Error('Expected HTTP 200, got ' + response.statusCode);
        }
        if (body.status === 'unhealthy') {
          throw new Error('Service is unhealthy: ' + JSON.stringify(body.checks));
        }
      };

      exports.handler = async () => {
        return await healthCheckBlueprint();
      };
    JS
  }
}

resource "aws_synthetics_canary" "health_check" {
  count = local.health_check_enabled ? 1 : 0

  name                 = "${var.project_name}-${var.environment}-health"
  artifact_s3_location = "s3://${aws_s3_bucket.synthetics_artifacts[0].bucket}/canary/"
  execution_role_arn   = aws_iam_role.synthetics_canary[0].arn
  runtime_version      = "syn-nodejs-puppeteer-9.1"
  handler              = "index.handler"

  # Run every 5 minutes.
  schedule {
    expression = "rate(5 minutes)"
  }

  # Start the canary automatically after creation.
  start_canary = true

  # Base64-encoded zip file containing the canary script.
  zip_file = filebase64(data.archive_file.canary_script[0].output_path)

  tags = local.health_checks_tags
}

# CloudWatch alarm on Synthetics canary failure rate.
resource "aws_cloudwatch_metric_alarm" "synthetics_canary_failures" {
  count = local.health_check_enabled ? 1 : 0

  alarm_name        = "${var.project_name}-${var.environment}-synthetics-canary-failures"
  alarm_description = "CloudWatch Synthetics canary health check is failing"

  namespace   = "CloudWatchSynthetics"
  metric_name = "Failed"
  dimensions = {
    CanaryName = aws_synthetics_canary.health_check[0].name
  }
  statistic = "Sum"
  period    = 300

  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.health_checks_tags
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "route53_health_check_id" {
  description = "ID of the Route 53 health check for the product service /health endpoint"
  value       = local.health_check_enabled ? aws_route53_health_check.product_service[0].id : null
}

output "synthetics_canary_name" {
  description = "Name of the CloudWatch Synthetics canary"
  value       = local.health_check_enabled ? aws_synthetics_canary.health_check[0].name : null
}
