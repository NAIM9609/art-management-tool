# ---------------------------------------------------------------------------
# Content Service – Lambda functions, IAM, CloudWatch, and placeholder package
#
# NOTE: This file is part of the same Terraform root module as
# product-service.tf. Shared provider/variable declarations are defined there
# and reused here.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------

locals {
  # Resolve table/bucket names so they match the naming convention in main.tf
  content_dynamodb_table_name = var.dynamodb_table_name != "" ? var.dynamodb_table_name : "${var.project_name}-${var.environment}-art-management"
  content_s3_bucket_name      = var.s3_bucket_name != "" ? var.s3_bucket_name : "art-management-images-${var.environment}"

  # One entry per Lambda handler.  Key becomes the suffix of the function name.
  # list-* operations get a longer timeout to handle paginated DynamoDB scans.
  content_lambda_functions_config = {
    # Personaggi (Characters)
    "content-service-list-personaggi" = {
      timeout     = 10
      handler     = "dist/handlers/personaggi.handler.listPersonaggi"
      description = "List all personaggi (paginated)"
    }
    "content-service-get-personaggio" = {
      timeout     = 5
      handler     = "dist/handlers/personaggi.handler.getPersonaggio"
      description = "Get a single personaggio by ID"
    }
    "content-service-create-personaggio" = {
      timeout     = 5
      handler     = "dist/handlers/personaggi.handler.createPersonaggio"
      description = "Create a new personaggio"
    }
    "content-service-update-personaggio" = {
      timeout     = 5
      handler     = "dist/handlers/personaggi.handler.updatePersonaggio"
      description = "Update an existing personaggio"
    }
    "content-service-delete-personaggio" = {
      timeout     = 5
      handler     = "dist/handlers/personaggi.handler.deletePersonaggio"
      description = "Delete a personaggio"
    }
    "content-service-get-personaggio-upload-url" = {
      timeout     = 5
      handler     = "dist/handlers/personaggi.handler.uploadImage"
      description = "Generate presigned S3 URL for personaggio image upload"
    }

    # Fumetti (Comics)
    "content-service-list-fumetti" = {
      timeout     = 10
      handler     = "dist/handlers/fumetti.handler.listFumetti"
      description = "List all fumetti (paginated)"
    }
    "content-service-get-fumetto" = {
      timeout     = 5
      handler     = "dist/handlers/fumetti.handler.getFumetto"
      description = "Get a single fumetto by ID"
    }
    "content-service-create-fumetto" = {
      timeout     = 5
      handler     = "dist/handlers/fumetti.handler.createFumetto"
      description = "Create a new fumetto"
    }
    "content-service-update-fumetto" = {
      timeout     = 5
      handler     = "dist/handlers/fumetti.handler.updateFumetto"
      description = "Update an existing fumetto"
    }
    "content-service-delete-fumetto" = {
      timeout     = 5
      handler     = "dist/handlers/fumetti.handler.deleteFumetto"
      description = "Delete a fumetto"
    }
    "content-service-get-fumetto-upload-url" = {
      timeout     = 5
      handler     = "dist/handlers/fumetti.handler.uploadPage"
      description = "Generate presigned S3 URL for fumetto page upload"
    }
    "content-service-temp-upload-presign" = {
      timeout     = 5
      handler     = "dist/handlers/upload.handler.tempUploadPresign"
      description = "Generate presigned S3 URL for a temporary upload slot"
    }
  }

  content_common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "content-service"
    ManagedBy   = "Terraform"
  }

  content_effective_jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.content_service_jwt_secret.result
}

data "aws_caller_identity" "content_current" {}

resource "random_password" "content_service_jwt_secret" {
  length           = 48
  special          = true
  override_special = "!@#$%^&*()-_=+[]{}<>?"
}

# ---------------------------------------------------------------------------
# IAM – Execution Role
# ---------------------------------------------------------------------------

resource "aws_iam_role" "content_service_lambda" {
  name        = "${var.project_name}-${var.environment}-content-service-lambda-role"
  description = "Execution role for Content Service Lambda functions"

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

  tags = local.content_common_tags
}

# ---------------------------------------------------------------------------
# IAM – DynamoDB Policy (least-privilege read/write on the single table)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "content_service_dynamodb" {
  name        = "${var.project_name}-${var.environment}-content-service-dynamodb"
  description = "DynamoDB read/write access for Content Service"

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
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.content_current.account_id}:table/${local.content_dynamodb_table_name}",
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.content_current.account_id}:table/${local.content_dynamodb_table_name}/index/*"
        ]
      }
    ]
  })

  tags = local.content_common_tags
}

# ---------------------------------------------------------------------------
# IAM – S3 Policy (read/write for personaggi and fumetti image objects only)
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "content_service_s3" {
  name        = "${var.project_name}-${var.environment}-content-service-s3"
  description = "S3 put-object access for Content Service image uploads"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3PersonaggiAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "arn:aws:s3:::${local.content_s3_bucket_name}/personaggi/*"
      },
      {
        Sid    = "S3FumettiAccess"
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "arn:aws:s3:::${local.content_s3_bucket_name}/fumetti/*"
      }
    ]
  })

  tags = local.content_common_tags
}

# ---------------------------------------------------------------------------
# IAM – Policy Attachments
# ---------------------------------------------------------------------------

# CloudWatch Logs – use the AWS-managed policy (least privilege for log streams)
resource "aws_iam_role_policy_attachment" "content_service_logs" {
  role       = aws_iam_role.content_service_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "content_service_dynamodb" {
  role       = aws_iam_role.content_service_lambda.name
  policy_arn = aws_iam_policy.content_service_dynamodb.arn
}

resource "aws_iam_role_policy_attachment" "content_service_s3" {
  role       = aws_iam_role.content_service_lambda.name
  policy_arn = aws_iam_policy.content_service_s3.arn
}

# ---------------------------------------------------------------------------
# Placeholder deployment package
# Used for `terraform plan/apply` before CI/CD publishes the real artifact.
# The real deployment is handled by the CI/CD pipeline (S3 + Lambda update).
# ---------------------------------------------------------------------------

data "archive_file" "content_service_placeholder" {
  type        = "zip"
  output_path = "${path.module}/content-service-placeholder.zip"

  # Generic top-level placeholder for compatibility.
  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD' }) });"
    filename = "index.js"
  }

  # Match personaggi handlers from local.content_lambda_functions_config.
  source {
    content  = <<-JS
      exports.listPersonaggi = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'listPersonaggi' }) });
      exports.getPersonaggio = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getPersonaggio' }) });
      exports.createPersonaggio = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'createPersonaggio' }) });
      exports.updatePersonaggio = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'updatePersonaggio' }) });
      exports.deletePersonaggio = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'deletePersonaggio' }) });
      exports.uploadImage = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'uploadImage' }) });
    JS
    filename = "dist/handlers/personaggi.handler.js"
  }

  # Match fumetti handlers from local.content_lambda_functions_config.
  source {
    content  = <<-JS
      exports.listFumetti = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'listFumetti' }) });
      exports.getFumetto = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'getFumetto' }) });
      exports.createFumetto = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'createFumetto' }) });
      exports.updateFumetto = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'updateFumetto' }) });
      exports.deleteFumetto = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'deleteFumetto' }) });
      exports.uploadPage = async () => ({ statusCode: 200, body: JSON.stringify({ message: 'placeholder – deploy via CI/CD', function: 'uploadPage' }) });
    JS
    filename = "dist/handlers/fumetti.handler.js"
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups (pre-created so retention is set before first invoke)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "content_service" {
  for_each = local.content_lambda_functions_config

  name              = "/aws/lambda/${var.project_name}-${var.environment}-${each.key}"
  retention_in_days = 14

  tags = local.content_common_tags
}

# ---------------------------------------------------------------------------
# Lambda Functions
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "content_service" {
  for_each = local.content_lambda_functions_config

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.content_service_lambda.arn

  # Runtime & handler
  runtime = "nodejs18.x"
  handler = each.value.handler

  # Deployment package (placeholder – replaced by CI/CD pipeline)
  filename         = data.archive_file.content_service_placeholder.output_path
  source_code_hash = data.archive_file.content_service_placeholder.output_base64sha256

  # Performance / cost controls
  timeout     = each.value.timeout
  memory_size = 256

  # Prevent runaway costs: cap concurrency per function (configurable).
  reserved_concurrent_executions = lookup(each.value, "reserved_concurrent_executions", var.lambda_reserved_concurrency)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = local.content_dynamodb_table_name
      S3_BUCKET_NAME      = local.content_s3_bucket_name
      CDN_URL             = var.cdn_url
      AWS_REGION_CUSTOM          = var.aws_region
      AWS_REGION_NAME     = var.aws_region
      ENVIRONMENT         = var.environment
      JWT_SECRET          = local.content_effective_jwt_secret
    }
  }

  # Ensure the log group exists before the function is created so that
  # Lambda does not auto-create it without the retention policy.
  depends_on = [
    aws_cloudwatch_log_group.content_service,
    aws_iam_role_policy_attachment.content_service_logs,
    aws_iam_role_policy_attachment.content_service_dynamodb,
    aws_iam_role_policy_attachment.content_service_s3,
  ]

  tags = merge(local.content_common_tags, {
    Name    = "${var.project_name}-${var.environment}-${each.key}"
    Timeout = tostring(each.value.timeout)
  })
}
