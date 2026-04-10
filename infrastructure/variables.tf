variable "aws_region" {
  description = "AWS region to deploy resources (set via terraform.tfvars or -var flag)"
  type        = string
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

variable "health_endpoint_url" {
  description = "Full HTTPS URL of the /health endpoint to monitor with Route 53 health checks and CloudWatch Synthetics (e.g. https://abc123.execute-api.us-east-1.amazonaws.com/dev/health). If empty, Route 53 health checks and Synthetics canary will be skipped."
  type        = string
  default     = ""
}

variable "monthly_budget_limit_usd" {
  description = "Monthly cost budget ceiling in USD. An alerts-only budget fires at 80% (actual) and 100% (forecasted) of this amount. Alerts-only budgets are always free (no action-enabled budget charges)."
  type        = number
  default     = 10
}

variable "budget_stop_threshold_usd" {
  description = "Monthly spend threshold in USD at which AWS Budgets automatically attaches a deny policy to all Lambda execution roles, stopping cost-generating operations. Counts as 1 of the 2 free action-enabled budgets per account per month."
  type        = number
  default     = 20
}
