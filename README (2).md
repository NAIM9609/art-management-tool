# Art Management Tool Operations Notes

This file is a repo-specific quick reference for local development and deployment.
It replaces the copied accommodations-planner baseline with the actual model used here.

## Stack Summary

- Frontend: Next.js 16 static export or standalone runtime
- Backend: TypeScript Lambda services plus local Express runtime for development
- Data: PostgreSQL for relational data and DynamoDB for service-oriented workloads
- Storage: S3 for image assets, CloudFront for delivery
- Infrastructure: Terraform under `infrastructure/services`
- CI/CD: GitHub Actions workflows for tests, Terraform, frontend deploy, and per-service Lambda deploys

## Local Development

Use the development compose stack to start the full local environment:

```bash
docker compose -f docker-compose.development.yml up -d
```

That stack now includes:

- PostgreSQL on `localhost:5432`
- LocalStack on `localhost:4566`
- Backend on `localhost:8080`
- Frontend on `localhost:3000`

If you prefer service-by-service local Lambda deployment, use the PowerShell or shell helpers in `scripts/` and the detailed steps in `LOCAL_TESTING.md`.

## CI/CD Model

- `backend-tests.yml`, `frontend-tests.yml`, and `terraform-validate.yml` validate code on push and pull request
- `deploy-infrastructure.yml` runs Terraform plan/apply for a chosen environment
- `deploy-<service>.yml` workflows deploy individual Lambda service bundles
- `deploy-all.yml` optionally runs Terraform first, then deploys every backend service through a matrix job
- `frontend-deploy.yml` builds the static frontend bundle, uploads it to S3, and optionally triggers Amplify deployment

## Required Deployment Secrets

Common backend and infrastructure deploy secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION_CUSTOM`
- `LAMBDA_BUCKET`

Optional infrastructure input:

- `JWT_SECRET` (if omitted, Terraform generates per-service secrets)

Terraform state and frontend deploy extras:

- `TF_BACKEND_BUCKET` (optional; otherwise derived from the AWS account id)
- `BACKEND_API_URL`
- `S3_BUCKET_NAME`
- `AMPLIFY_APP_ID` and `AMPLIFY_BRANCH_NAME` (optional)

## Terraform State Model

- Backend type: S3 only
- Locking: GitHub Actions `concurrency`, not DynamoDB
- Root: `infrastructure/services`
- Isolation: state key `services/<environment>/terraform.tfstate`
- Workspace usage: none in the current model

## Useful References

- `README.md` for the project overview
- `LOCAL_TESTING.md` for local execution and LocalStack workflows
- `TERRAFORM_GITHUB_ACTIONS_GUIDE.md` for deployment flow details
- `INFRA_COMPARISON_CHECKLIST.md` and `INFRA_COMPARISON_CHECKLIST_PREFILLED.md` for side-by-side debugging