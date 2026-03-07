# ---------------------------------------------------------------------------
# Cart Service – Lambda functions, IAM, CloudWatch, and placeholder package
#
# NOTE: This file is part of the same Terraform root module as
# product-service.tf.  Variables (aws_region, project_name, environment,
# dynamodb_table_name, allowed_origins, lambda_reserved_concurrency),
# locals (dynamodb_table_name), and data sources (aws_caller_identity.current)
# that are already declared in product-service.tf are intentionally reused
# here without re-declaration.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Cart Service – additional variable
# ---------------------------------------------------------------------------

variable "cart_jwt_secret" {
  description = "JWT secret for Cart Service auth. If empty, Terraform generates a strong random secret."
  type        = string
  default     = ""
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------

locals {
  # One entry per Lambda handler.  Key becomes the suffix of the function name.
  cart_lambda_functions_config = {
    "cart-service-get-cart" = {
      timeout     = 10
      handler     = "dist/handlers/cart.handler.getCart"
      description = "Get the current cart for a session or user"
    }
    "cart-service-add-item" = {
      timeout     = 5
      handler     = "dist/handlers/cart.handler.addItem"
      description = "Add an item to the cart"
    }
    "cart-service-update-quantity" = {
      timeout     = 5
      handler     = "dist/handlers/cart.handler.updateQuantity"
      description = "Update the quantity of a cart item"
    }
    "cart-service-remove-item" = {
      timeout     = 5
      handler     = "dist/handlers/cart.handler.removeItem"
      description = "Remove an item from the cart"
    }
    "cart-service-clear-cart" = {
      timeout     = 5
      handler     = "dist/handlers/cart.handler.clearCart"
      description = "Clear all items from the cart"
    }
    "cart-service-apply-discount" = {
      timeout     = 5
      handler     = "dist/handlers/cart.handler.applyDiscount"
      description = "Apply a discount code to the cart"
    }
  }

  cart_common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "cart-service"
    ManagedBy   = "Terraform"
  }

  cart_effective_jwt_secret = var.cart_jwt_secret != "" ? var.cart_jwt_secret : random_password.cart_service_jwt_secret.result
}

resource "random_password" "cart_service_jwt_secret" {
  length           = 48
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}<>?"
}

# ---------------------------------------------------------------------------
# IAM – Execution Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "cart_service_lambda" {
  name        = "${var.project_name}-${var.environment}-cart-service-lambda-role"
  description = "Execution role for Cart Service Lambda functions"

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

  tags = local.cart_common_tags
}

# ---------------------------------------------------------------------------
# IAM – DynamoDB Policy (least-privilege read/write on the single table)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "cart_service_dynamodb" {
  name        = "${var.project_name}-${var.environment}-cart-service-dynamodb"
  description = "DynamoDB read/write access for Cart Service"

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
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.dynamodb_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.dynamodb_table_name}/index/*"
        ]
      }
    ]
  })

  tags = local.cart_common_tags
}

# ---------------------------------------------------------------------------
# IAM – Policy Attachments
# ---------------------------------------------------------------------------

# CloudWatch Logs – use the AWS-managed policy (least privilege for log streams)
resource "aws_iam_role_policy_attachment" "cart_service_logs" {
  role       = aws_iam_role.cart_service_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "cart_service_dynamodb" {
  role       = aws_iam_role.cart_service_lambda.name
  policy_arn = aws_iam_policy.cart_service_dynamodb.arn
}

# ---------------------------------------------------------------------------
# Placeholder deployment package
# Used for `terraform plan/apply` before CI/CD publishes the real artifact.
# The real deployment is handled by the CI/CD pipeline (S3 + Lambda update).
# ---------------------------------------------------------------------------

data "archive_file" "cart_service_placeholder" {
  type        = "zip"
  output_path = "${path.module}/cart-service-placeholder.zip"

  # Generic top-level placeholder for compatibility.
  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD' }) });"
    filename = "index.js"
  }

  # Match cart handlers from local.cart_lambda_functions_config.
  source {
    content  = <<-JS
      exports.getCart = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getCart' }) });
      exports.addItem = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'addItem' }) });
      exports.updateQuantity = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'updateQuantity' }) });
      exports.removeItem = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'removeItem' }) });
      exports.clearCart = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'clearCart' }) });
      exports.applyDiscount = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'applyDiscount' }) });
    JS
    filename = "dist/handlers/cart.handler.js"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups (pre-created so retention is set before first invoke)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "cart_service" {
  for_each = local.cart_lambda_functions_config

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = 14

  tags = local.cart_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Functions
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "cart_service" {
  for_each = local.cart_lambda_functions_config

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.cart_service_lambda.arn

  # Runtime & handler
  runtime = "nodejs18.x"
  handler = each.value.handler

  # Deployment package (placeholder – replaced by CI/CD pipeline)
  filename         = data.archive_file.cart_service_placeholder.output_path
  source_code_hash = data.archive_file.cart_service_placeholder.output_base64sha256

  # Performance / cost controls
  timeout     = each.value.timeout
  memory_size = 256

  # Prevent runaway costs: cap concurrency per function (configurable).
  reserved_concurrent_executions = lookup(each.value, "reserved_concurrent_executions", var.lambda_reserved_concurrency)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = local.dynamodb_table_name
      AWS_REGION          = var.aws_region
      AWS_REGION_NAME     = var.aws_region
      ENVIRONMENT         = var.environment
      JWT_SECRET          = local.cart_effective_jwt_secret
    }
  }

  # Ensure the log group exists before the function is created so that
  # Lambda does not auto-create it without the retention policy.
  depends_on = [
    aws_cloudwatch_log_group.cart_service,
    aws_iam_role_policy_attachment.cart_service_logs,
    aws_iam_role_policy_attachment.cart_service_dynamodb,
  ]

  tags = merge(local.cart_common_tags, {
    Name    = "${var.project_name}-${var.environment}-${each.key}"
    Timeout = tostring(each.value.timeout)
  })
}
