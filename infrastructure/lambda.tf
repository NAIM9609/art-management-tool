# Lambda Function for Art Management API
# Runs Express.js app via serverless-express

# Lambda execution role
resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "${var.project_name}-lambda-exec-role"
    Environment = var.environment
    Project     = var.project_name
  }
}

# IAM policy for DynamoDB access
resource "aws_iam_policy" "lambda_dynamodb_policy" {
  name        = "${var.project_name}-lambda-dynamodb-policy"
  description = "IAM policy for Lambda to access DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
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
          aws_dynamodb_table.art_management.arn,
          "${aws_dynamodb_table.art_management.arn}/index/*"
        ]
      }
    ]
  })
}

# IAM policy for CloudWatch Logs
resource "aws_iam_policy" "lambda_logs_policy" {
  name        = "${var.project_name}-lambda-logs-policy"
  description = "IAM policy for Lambda to write CloudWatch Logs"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# IAM policy for S3 access (for file uploads)
resource "aws_iam_policy" "lambda_s3_policy" {
  count       = var.create_s3_bucket ? 1 : 0
  name        = "${var.project_name}-lambda-s3-policy"
  description = "IAM policy for Lambda to access S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          var.create_s3_bucket ? aws_s3_bucket.uploads[0].arn : "*",
          var.create_s3_bucket ? "${aws_s3_bucket.uploads[0].arn}/*" : "*/*"
        ]
      }
    ]
  })
}

# Attach policies to role
resource "aws_iam_role_policy_attachment" "lambda_dynamodb" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_dynamodb_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_logs_policy.arn
}

resource "aws_iam_role_policy_attachment" "lambda_s3" {
  count      = var.create_s3_bucket ? 1 : 0
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_s3_policy[0].arn
}

# Lambda function
resource "aws_lambda_function" "api" {
  filename         = var.lambda_zip_path
  function_name    = "${var.project_name}-api"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "lambda.handler"
  runtime          = "nodejs18.x"
  timeout          = 30
  memory_size      = 512
  source_code_hash = filebase64sha256(var.lambda_zip_path)

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.art_management.name
      DYNAMODB_ENABLED    = "true"
      AWS_REGION_CUSTOM   = var.aws_region
      ENVIRONMENT         = var.environment
      JWT_SECRET          = var.jwt_secret
      CORS_ALLOWED_ORIGINS = var.cors_allowed_origins
      LOG_LEVEL           = var.log_level
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_dynamodb,
    aws_iam_role_policy_attachment.lambda_logs,
  ]

  tags = {
    Name        = "${var.project_name}-api"
    Environment = var.environment
    Project     = var.project_name
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 14

  tags = {
    Name        = "${var.project_name}-api-logs"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# Output Lambda details
output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.api.function_name
}

output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.api.arn
}
