# ---------------------------------------------------------------------------
# Budget Stop Action – $20 hard-stop (action-enabled budget)
#
# When actual monthly spend reaches $20 AWS Budgets automatically attaches
# the deny policy below to all Lambda execution roles. This stops every
# Lambda function from calling DynamoDB, S3, SNS, SES, and SSM – the
# primary cost-generating services – without any manual intervention.
#
# COST NOTE: Action-enabled budgets are free up to 2 per account per month.
# This is budget #1. The alerts-only budget in monitoring.tf is free and
# does NOT count toward that limit.
#
# HOW TO RESET (after resolving the overage):
#   AWS Console → Billing → Budgets → cost-stop budget → Actions →
#   select the triggered action → "Reset action"
#   This detaches the deny policy from all Lambda execution roles and
#   restores normal operation.
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# IAM – Deny policy attached to Lambda execution roles when budget fires
# ---------------------------------------------------------------------------

resource "aws_iam_policy" "budget_cost_stop" {
  name        = "${var.project_name}-${var.environment}-budget-cost-stop"
  description = "Deny policy automatically attached by AWS Budgets when monthly spend exceeds $${var.budget_stop_threshold_usd}. Blocks the cost-generating AWS service calls made by Lambda execution roles."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DenyAllCostGeneratingServices"
        Effect = "Deny"
        Action = [
          "dynamodb:*",
          "s3:*",
          "sns:Publish",
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
          "lambda:InvokeFunction",
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.monitoring_tags, {
    Purpose = "budget-cost-stop"
  })
}

# ---------------------------------------------------------------------------
# IAM – Role that AWS Budgets assumes to attach/detach the deny policy
# ---------------------------------------------------------------------------

resource "aws_iam_role" "budget_action_execution" {
  name        = "${var.project_name}-${var.environment}-budget-action-role"
  description = "Role assumed by AWS Budgets to attach the cost-stop deny policy to Lambda execution roles when the $${var.budget_stop_threshold_usd} monthly budget is exceeded"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "BudgetsAssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "budgets.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  tags = local.monitoring_tags
}

resource "aws_iam_role_policy" "budget_action_execution" {
  name = "${var.project_name}-${var.environment}-budget-action-policy"
  role = aws_iam_role.budget_action_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Allow Budgets to attach/detach only the specific cost-stop policy
        # to roles that match the Lambda execution role naming convention.
        Sid    = "AttachDetachCostStopPolicy"
        Effect = "Allow"
        Action = [
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
        ]
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-${var.environment}-*-lambda-role"
        Condition = {
          ArnEquals = {
            "iam:PolicyARN" = aws_iam_policy.budget_cost_stop.arn
          }
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# AWS Budgets – $20 action-enabled hard-stop budget
#
# Two action blocks are required because AWS limits each action to 4 IAM
# principals. With 8 Lambda execution roles we split them 4 + 4.
# Both actions fire at the same threshold and are executed automatically.
#
# Services covered:  8 Lambda execution roles
#   product-service  cart-service    order-service    notification-service
#   integration-service  discount-service  content-service  audit-service
# ---------------------------------------------------------------------------

resource "aws_budgets_budget" "cost_stop" {
  name         = "${var.project_name}-${var.environment}-cost-stop"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_stop_threshold_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Alert when spend crosses $20 (the budget actions below fire at the same threshold)
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.admin_email]
  }
}

# ── Action 1 of 2 – product, cart, order, notification ─────────────────────
resource "aws_budgets_budget_action" "cost_stop_customer_facing" {
  budget_name        = aws_budgets_budget.cost_stop.name
  notification_type  = "ACTUAL"
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  execution_role_arn = aws_iam_role.budget_action_execution.arn

  action_threshold {
    action_threshold_type  = "ABSOLUTE_VALUE"
    action_threshold_value = var.budget_stop_threshold_usd
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.budget_cost_stop.arn
      roles = [
        "${var.project_name}-${var.environment}-product-service-lambda-role",
        "${var.project_name}-${var.environment}-cart-service-lambda-role",
        "${var.project_name}-${var.environment}-order-service-lambda-role",
        "${var.project_name}-${var.environment}-notification-service-lambda-role",
      ]
    }
  }

  subscriber {
    address           = var.admin_email
    subscription_type = "EMAIL"
  }
}

# ── Action 2 of 2 – integration, discount, content, audit ──────────────────
resource "aws_budgets_budget_action" "cost_stop_backoffice" {
  budget_name        = aws_budgets_budget.cost_stop.name
  notification_type  = "ACTUAL"
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  execution_role_arn = aws_iam_role.budget_action_execution.arn

  action_threshold {
    action_threshold_type  = "ABSOLUTE_VALUE"
    action_threshold_value = var.budget_stop_threshold_usd
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.budget_cost_stop.arn
      roles = [
        "${var.project_name}-${var.environment}-integration-service-lambda-role",
        "${var.project_name}-${var.environment}-discount-service-lambda-role",
        "${var.project_name}-${var.environment}-content-service-lambda-role",
        "${var.project_name}-${var.environment}-audit-service-lambda-role",
      ]
    }
  }

  subscriber {
    address           = var.admin_email
    subscription_type = "EMAIL"
  }
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "budget_cost_stop_policy_arn" {
  description = "ARN of the deny policy attached to Lambda execution roles when the $${var.budget_stop_threshold_usd} budget is exceeded"
  value       = aws_iam_policy.budget_cost_stop.arn
}

output "budget_action_role_arn" {
  description = "ARN of the IAM role assumed by AWS Budgets to execute stop actions"
  value       = aws_iam_role.budget_action_execution.arn
}
