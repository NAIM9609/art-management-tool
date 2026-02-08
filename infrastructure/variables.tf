variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "eu-west-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "art-management-tool"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

# DynamoDB variables
variable "create_dev_table" {
  description = "Whether to create a dev DynamoDB table"
  type        = bool
  default     = false
}

# Lambda variables
variable "lambda_zip_path" {
  description = "Path to the Lambda deployment package"
  type        = string
  default     = "../backend/dist/lambda.zip"
}

variable "jwt_secret" {
  description = "JWT secret for authentication"
  type        = string
  sensitive   = true
}

variable "log_level" {
  description = "Log level for Lambda function"
  type        = string
  default     = "info"
}

# API Gateway variables
variable "cors_allowed_origins" {
  description = "Comma-separated list of allowed CORS origins"
  type        = string
  default     = "https://artmanagement.amplifyapp.com,http://localhost:3000"
}

variable "api_domain_name" {
  description = "Custom domain name for API Gateway (optional)"
  type        = string
  default     = ""
}

variable "api_certificate_arn" {
  description = "ACM certificate ARN for custom domain (required if api_domain_name is set)"
  type        = string
  default     = ""
}

# S3 variables
variable "create_s3_bucket" {
  description = "Whether to create an S3 bucket for file uploads"
  type        = bool
  default     = true
}

variable "s3_bucket_name" {
  description = "S3 bucket name for file uploads"
  type        = string
  default     = ""
}
