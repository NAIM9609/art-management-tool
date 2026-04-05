# ---------------------------------------------------------------------------
# Remote state backend (S3 + DynamoDB locking)
#
# The bucket name, key, and DynamoDB table are injected at `terraform init`
# time via -backend-config flags (see deploy-infrastructure.yml).
# This keeps credentials out of source control while still locking state.
#
# Required GitHub Actions secrets:
#   TF_BACKEND_BUCKET          – S3 bucket name  (e.g. art-management-tool-tfstate)
#   TF_BACKEND_DYNAMODB_TABLE  – DynamoDB table   (e.g. art-management-tool-tfstate-locks)
#
# Create the DynamoDB table once (primary key: LockID, type: String):
#   aws dynamodb create-table \
#     --table-name art-management-tool-tfstate-locks \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST \
#     --region eu-north-1
# ---------------------------------------------------------------------------

terraform {
  backend "s3" {
    # Values supplied via -backend-config at terraform init (see workflow)
    encrypt = true
    region  = "eu-north-1"
  }
}
