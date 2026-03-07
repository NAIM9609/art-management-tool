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

variable "admin_email" {
  description = "Email address to receive CloudWatch alarm notifications via SNS. Must be a real deliverable address; AWS sends a confirmation email before the subscription is active."
  type        = string

  validation {
    condition     = can(regex("^[^@]+@[^@]+\\.[^@]+$", var.admin_email)) && var.admin_email != "admin@example.com"
    error_message = "admin_email must be a valid email address (not the default placeholder 'admin@example.com')."
  }
}

variable "api_gateway_id" {
  description = "ID of the API Gateway HTTP API (v2) to monitor. If not provided, API Gateway alarms and dashboard widgets will be skipped."
  type        = string
  default     = ""
}
