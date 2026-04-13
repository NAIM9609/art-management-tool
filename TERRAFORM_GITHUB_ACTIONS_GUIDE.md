# Terraform + GitHub Actions Guide (art-management-tool)

This guide describes the deployment flow that actually exists in this repository today.

Related documents:

- [INFRA_COMPARISON_CHECKLIST.md](INFRA_COMPARISON_CHECKLIST.md)
- [INFRA_COMPARISON_CHECKLIST_PREFILLED.md](INFRA_COMPARISON_CHECKLIST_PREFILLED.md)

## 1. Ownership Model

- Terraform owns infrastructure definitions under `infrastructure/services`.
- GitHub Actions owns orchestration: validation, plan/apply, packaging, upload, Lambda update, smoke tests, rollback.
- Frontend deployment is handled separately from backend Lambda deployment.

## 2. End-to-End Flow

```text
Backend or service code change
  -> backend-tests.yml
  -> optional deploy-<service>.yml on matching paths
       -> validate secrets
       -> npm ci + targeted tests
       -> esbuild bundle + zip
       -> upload zip to S3 artifact bucket
       -> update Lambda functions
       -> smoke test if API_GATEWAY_URL is configured
       -> rollback from previous.zip on failure

Frontend code change
  -> frontend-tests.yml
  -> frontend-deploy.yml on matching paths
       -> npm ci + build static export
       -> upload build zip to S3
       -> optionally trigger Amplify deployment

Infrastructure change or manual deployment
  -> terraform-validate.yml
  -> deploy-infrastructure.yml (manual or workflow_call)
       -> validate secrets
       -> bootstrap state bucket if needed
       -> terraform init/fmt/validate/plan/apply
       -> import pre-existing resources before apply
```

## 3. Workflow Inventory

Primary workflows:

- `backend-tests.yml`
- `frontend-tests.yml`
- `terraform-validate.yml`
- `deploy-infrastructure.yml`
- `deploy-all.yml`
- `deploy-product-service.yml`
- `deploy-cart-service.yml`
- `deploy-order-service.yml`
- `deploy-content-service.yml`
- `deploy-audit-service.yml`
- `deploy-discount-service.yml`
- `deploy-notification-service.yml`
- `deploy-integration-service.yml`
- `frontend-deploy.yml`

## 4. Terraform Structure

Current service infrastructure root:

- `infrastructure/services/backend.tf`
- `infrastructure/services/common-variables.tf`
- `infrastructure/services/*-service.tf`
- `infrastructure/services/*-api.tf`

Important current-state details:

- Backend type is S3 only.
- There is no DynamoDB state lock table in this flow.
- Environment isolation is done by state key, not workspaces.
- The state key pattern is `services/<environment>/terraform.tfstate`.

## 5. Authentication and Secrets

Current deploy model uses static AWS credentials, not OIDC.

Core secrets used across workflows:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION_CUSTOM`
- `LAMBDA_BUCKET`

Optional infrastructure input:

- `JWT_SECRET` (the Terraform service stack can generate strong random per-service secrets when this is omitted)

Additional secrets used in specific flows:

- `TF_BACKEND_BUCKET`
- `BACKEND_API_URL`
- `S3_BUCKET_NAME`
- `AMPLIFY_APP_ID`
- `AMPLIFY_BRANCH_NAME`
- `API_GATEWAY_URL`
- `SMOKE_TEST_TOKEN`
- `SLACK_WEBHOOK_URL`

## 6. Terraform Apply Unit

Workflow: `deploy-infrastructure.yml`

Sequence:

1. Validate required secrets.
2. Configure AWS credentials.
3. Set up Terraform.
4. Bootstrap the S3 backend bucket if needed.
5. Run `terraform init` with `-backend-config` values.
6. Run `terraform fmt -check -recursive`.
7. Run `terraform validate -no-color`.
8. On apply runs, execute `scripts/import-existing-resources.sh <environment>`.
9. Run `terraform plan -out=tfplan`.
10. If requested, run `terraform apply -auto-approve tfplan`.

JWT secret behavior:

- The workflow always passes `jwt_secret` to Terraform.
- An empty value is valid because the Terraform service modules generate strong random secrets when `jwt_secret` is blank.

Concurrency:

- `concurrency.group = terraform-<environment>`
- `cancel-in-progress = false`

## 7. Backend Artifact Deploy Unit

Per-service deploy workflows all follow the same shape:

1. Validate secrets.
2. `npm ci` in `backend/`.
3. Run service-scoped tests.
4. Build with `node esbuild.lambda.mjs <service>`.
5. Zip the service bundle from `backend/dist/lambda/<service>`.
6. Ensure the S3 artifact bucket exists and is hardened.
7. Upload the zip to a service/environment SHA-based key.
8. Run `aws lambda update-function-code` for each function in the service.
9. Wait with `aws lambda wait function-updated`.
10. Run smoke tests if endpoint secrets are present.
11. On success, copy the uploaded zip to `previous.zip`.
12. On failure, restore from `previous.zip`.

Important nuance:

- Product service includes a dedicated `product-service-health` function in infrastructure and deploy lists. Keep it there or `/health` will drift.

## 8. Frontend Deploy Unit

Workflow: `frontend-deploy.yml`

Sequence:

1. Validate secrets.
2. `npm ci` in `frontend/`.
3. Build with `NEXT_OUTPUT_MODE=export` and `NEXT_PUBLIC_API_URL` set from secrets.
4. Package the `out/` directory as a zip artifact.
5. Upload the build zips to S3.
6. If `AMPLIFY_APP_ID` is configured, create and start an Amplify deployment.

## 9. Local Reproduction Commands

```bash
# Terraform validation equivalent
terraform -chdir=infrastructure/services init -backend=false -input=false
terraform -chdir=infrastructure/services validate

# Backend build and tests
cd backend
npm ci
npm run build
npm run test:integration

# Frontend build
cd ../frontend
npm ci
npm run build

# Local stack
cd ..
docker compose -f docker-compose.development.yml up -d
```

## 10. Fast Diagnosis Map

| Symptom | First place to check |
|---|---|
| Missing required secret message | workflow validation step |
| Terraform init or backend config failure | `deploy-infrastructure.yml` backend bootstrap and init |
| Empty Terraform plan but broken Lambda behavior | service deploy workflow, not Terraform |
| Lambda update failure | S3 artifact upload, function name list, IAM permissions |
| Frontend build succeeds but deploy does nothing | missing `AMPLIFY_APP_ID` / `AMPLIFY_BRANCH_NAME` or S3 bucket config |
| Local docs and stack disagree | `docker-compose.development.yml`, `.env.development.example`, `LOCAL_TESTING.md` |

## 11. Decision Rule

If Terraform apply succeeds but the application still fails, stop debugging Terraform and move to the artifact deploy and runtime layers.

If Terraform apply fails, debug credentials, backend bucket setup, import-before-apply behavior, and input variables before touching service code.
