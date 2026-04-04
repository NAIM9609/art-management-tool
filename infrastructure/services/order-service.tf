# ---------------------------------------------------------------------------
# Variables (order-service-specific – shared variables defined in common-variables.tf)
# ---------------------------------------------------------------------------

variable "payment_provider" {
  description = "Payment provider to use: 'mock' (default) or 'stripe'."
  type        = string
  default     = "mock"
}

variable "ses_from_email" {
  description = "SES verified sender address for order confirmation emails (optional)."
  type        = string
  default     = ""
}

variable "ses_identity_arn" {
  description = "ARN of the SES verified identity allowed to send emails (optional)."
  type        = string
  default     = ""
}

variable "sns_order_topic_arn" {
  description = "ARN of an existing SNS topic for order event notifications (optional)."
  type        = string
  default     = ""
}

variable "stripe_api_key_ssm_parameter_arn" {
  description = "ARN of SSM parameter containing Stripe API key (optional)."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------

locals {
  order_dynamodb_table_name = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${var.project_name}-${var.environment}-art-management"

  order_lambda_functions_config = {
    "order-service-create-order" = {
      timeout     = 10
      handler     = "dist/handlers/order.handler.createOrder"
      description = "Create a new order"
    }
    "order-service-get-order" = {
      timeout     = 5
      handler     = "dist/handlers/order.handler.getOrder"
      description = "Get a single order by order number"
    }
    "order-service-get-customer-orders" = {
      timeout     = 10
      handler     = "dist/handlers/order.handler.getCustomerOrders"
      description = "List orders for a customer by email"
    }
    "order-service-list-orders" = {
      timeout     = 10
      handler     = "dist/handlers/order.handler.listOrders"
      description = "List all orders (admin, paginated)"
    }
    "order-service-update-status" = {
      timeout     = 5
      handler     = "dist/handlers/order.handler.updateOrderStatus"
      description = "Update order fulfillment status (admin)"
    }
    "order-service-process-payment" = {
      timeout     = 15
      handler     = "dist/handlers/order.handler.processPayment"
      description = "Process payment for an existing order"
    }
    "order-service-webhook" = {
      timeout     = 10
      handler     = "dist/handlers/order.handler.webhookHandler"
      description = "Handle payment provider webhook events"
    }
  }

  order_common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "order-service"
    ManagedBy   = "Terraform"
  }

  # Derived flags used to conditionally create optional IAM policies
  order_ses_enabled          = var.ses_identity_arn != "" && var.ses_from_email != ""
  order_sns_enabled          = var.sns_order_topic_arn != ""
  order_stripe_ssm_enabled   = var.stripe_api_key_ssm_parameter_arn != ""
  order_effective_jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.order_service_jwt_secret.result
}

data "aws_caller_identity" "order_current" {}

resource "random_password" "order_service_jwt_secret" {
  length           = 48
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}<>?"
}

# ---------------------------------------------------------------------------
# IAM – Execution Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "order_service_lambda" {
  name        = "${var.project_name}-${var.environment}-order-service-lambda-role"
  description = "Execution role for Order Service Lambda functions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaAssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.order_common_tags
}

# ---------------------------------------------------------------------------
# IAM – DynamoDB Policy (least-privilege read/write on the single table)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "order_service_dynamodb" {
  name        = "${var.project_name}-${var.environment}-order-service-dynamodb"
  description = "DynamoDB read/write access for Order Service"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:TransactWriteItems",
          "dynamodb:TransactGetItems"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.order_current.account_id}:table/${local.order_dynamodb_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.order_current.account_id}:table/${local.order_dynamodb_table_name}/index/*"
        ]
      }
    ]
  })

  tags = local.order_common_tags
}

# ---------------------------------------------------------------------------
# IAM – SES Policy (optional – order confirmation emails)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "order_service_ses" {
  count = local.order_ses_enabled ? 1 : 0

  name        = "${var.project_name}-${var.environment}-order-service-ses"
  description = "SES send-email permission for Order Service"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SESSendEmail"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = var.ses_identity_arn
        Condition = {
          StringEquals = {
            "ses:FromAddress" = var.ses_from_email
          }
        }
      }
    ]
  })

  tags = local.order_common_tags
}

# ---------------------------------------------------------------------------
# IAM – SNS Policy (optional – order event notifications)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "order_service_sns" {
  count = local.order_sns_enabled ? 1 : 0

  name        = "${var.project_name}-${var.environment}-order-service-sns"
  description = "SNS publish permission for Order Service"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SNSPublish"
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = var.sns_order_topic_arn
      }
    ]
  })

  tags = local.order_common_tags
}

# ---------------------------------------------------------------------------
# IAM – SSM Policy (optional – Stripe API key from Parameter Store)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "order_service_ssm" {
  count = local.order_stripe_ssm_enabled ? 1 : 0

  name        = "${var.project_name}-${var.environment}-order-service-ssm"
  description = "Read access to Stripe API key SSM parameter for Order Service"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SSMGetStripeApiKey"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = var.stripe_api_key_ssm_parameter_arn
      }
    ]
  })

  tags = local.order_common_tags
}

# ---------------------------------------------------------------------------
# IAM – Policy Attachments
# ---------------------------------------------------------------------------

# CloudWatch Logs – use the AWS-managed policy (least privilege for log streams)
resource "aws_iam_role_policy_attachment" "order_service_logs" {
  role       = aws_iam_role.order_service_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "order_service_dynamodb" {
  role       = aws_iam_role.order_service_lambda.name
  policy_arn = aws_iam_policy.order_service_dynamodb.arn
}

resource "aws_iam_role_policy_attachment" "order_service_ses" {
  count = local.order_ses_enabled ? 1 : 0

  role       = aws_iam_role.order_service_lambda.name
  policy_arn = aws_iam_policy.order_service_ses[0].arn
}

resource "aws_iam_role_policy_attachment" "order_service_sns" {
  count = local.order_sns_enabled ? 1 : 0

  role       = aws_iam_role.order_service_lambda.name
  policy_arn = aws_iam_policy.order_service_sns[0].arn
}

resource "aws_iam_role_policy_attachment" "order_service_ssm" {
  count = local.order_stripe_ssm_enabled ? 1 : 0

  role       = aws_iam_role.order_service_lambda.name
  policy_arn = aws_iam_policy.order_service_ssm[0].arn
}

# ---------------------------------------------------------------------------
# Placeholder deployment package
# Used for `terraform plan/apply` before CI/CD publishes the real artifact.
# The real deployment is handled by the CI/CD pipeline (S3 + Lambda update).
# ---------------------------------------------------------------------------

data "archive_file" "order_service_placeholder" {
  type        = "zip"
  output_path = "${path.module}/order-service-placeholder.zip"

  # Generic top-level placeholder for compatibility.
  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD' }) });"
    filename = "index.js"
  }

  # Match order handlers from local.order_lambda_functions_config.
  source {
    content  = <<-JS
      exports.createOrder = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'createOrder' }) });
      exports.getOrder = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getOrder' }) });
      exports.getCustomerOrders = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getCustomerOrders' }) });
      exports.listOrders = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'listOrders' }) });
      exports.updateOrderStatus = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'updateOrderStatus' }) });
      exports.processPayment = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'processPayment' }) });
      exports.webhookHandler = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'webhookHandler' }) });
    JS
    filename = "dist/handlers/order.handler.js"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups (pre-created so retention is set before first invoke)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "order_service" {
  for_each = local.order_lambda_functions_config

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = 14

  tags = local.order_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Functions
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "order_service" {
  for_each = local.order_lambda_functions_config

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.order_service_lambda.arn

  # Runtime & handler
  runtime = "nodejs18.x"
  handler = each.value.handler

  # Deployment package (placeholder – replaced by CI/CD pipeline)
  filename         = data.archive_file.order_service_placeholder.output_path
  source_code_hash = data.archive_file.order_service_placeholder.output_base64sha256

  # Performance / cost controls
  timeout     = each.value.timeout
  memory_size = 256

  # Prevent runaway costs: cap concurrency per function (configurable).
  reserved_concurrent_executions = lookup(each.value, "reserved_concurrent_executions", var.lambda_reserved_concurrency)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME              = local.order_dynamodb_table_name
      AWS_REGION_CUSTOM                = var.aws_region
      AWS_REGION_NAME                  = var.aws_region
      ENVIRONMENT                      = var.environment
      JWT_SECRET                       = local.order_effective_jwt_secret
      PAYMENT_PROVIDER                 = var.payment_provider
      STRIPE_API_KEY_SSM_PARAMETER_ARN = var.stripe_api_key_ssm_parameter_arn
      SES_FROM_EMAIL                   = var.ses_from_email
      SNS_ORDER_TOPIC_ARN              = var.sns_order_topic_arn
    }
  }

  # Ensure the log group exists before the function is created so that
  # Lambda does not auto-create it without the retention policy.
  depends_on = [
    aws_cloudwatch_log_group.order_service,
    aws_iam_role_policy_attachment.order_service_logs,
    aws_iam_role_policy_attachment.order_service_dynamodb,
  ]

  tags = merge(local.order_common_tags, {
    Name    = "${var.project_name}-${var.environment}-${each.key}"
    Timeout = tostring(each.value.timeout)
  })
}
