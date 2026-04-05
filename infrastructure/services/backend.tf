# ---------------------------------------------------------------------------
# Remote state backend (S3 only — no DynamoDB lock table)
#
# Concurrent apply protection is handled at the GitHub Actions layer via
# the workflow's `concurrency` block (group: terraform-<env>), which queues
# runs rather than cancelling them.  A separate DynamoDB lock table is
# therefore not needed and avoids any additional AWS cost.
#
# S3 state storage stays well inside the always-free tier:
#   • 5 GB storage  (state files are a few KB each)
#   • 20,000 GET / 2,000 PUT requests per month
#
# The bucket name and key are injected at `terraform init` time via
# -backend-config flags in the workflow (no credentials in source control).
#
# Required GitHub Actions secret:
#   TF_BACKEND_BUCKET – S3 bucket name (e.g. art-management-tool-tfstate)
#
# Create the bucket once (versioning recommended so you can roll back state):
#   aws s3api create-bucket \
#     --bucket art-management-tool-tfstate \
#     --region eu-north-1 \
#     --create-bucket-configuration LocationConstraint=eu-north-1
#   aws s3api put-bucket-versioning \
#     --bucket art-management-tool-tfstate \
#     --versioning-configuration Status=Enabled
# ---------------------------------------------------------------------------

terraform {
  backend "s3" {
    # Values supplied via -backend-config at terraform init (see workflow)
    encrypt = true
    region  = "eu-north-1"
  }
}
