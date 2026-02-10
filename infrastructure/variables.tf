variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "art-management-tool"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "table_name" {
  description = "DynamoDB table name for art management. If not provided, defaults to '{project_name}-{environment}-art-management'"
  type        = string
  default     = null
}
