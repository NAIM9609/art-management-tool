# Infrastructure Comparison Checklist (This Repo vs Other Project)

Use this checklist to compare another deployment stack against the actual art-management-tool model.

How to use:

1. Fill This Repo from this repository.
2. Fill Other Project from the target repository.
3. Mark Drift as Yes when behavior differs.
4. Debug from top to bottom: pipeline shape, auth, state, apply, artifact deploy, runtime.

## 1. Trigger and Pipeline Shape

| Item | This Repo | Other Project | Drift (Yes/No) | Notes |
|---|---|---|---|---|
| Backend CI triggers | push + pull_request on `main` with backend path filters |  |  |  |
| Frontend CI triggers | push + pull_request on `main` with frontend path filters |  |  |  |
| Terraform validation trigger | push + pull_request on `main` with infrastructure path filters |  |  |  |
| Infrastructure deploy trigger | manual `workflow_dispatch` and reusable `workflow_call` |  |  |  |
| Per-service deploy trigger | push to `main` for matching service paths, plus manual dispatch |  |  |  |
| Batch deploy trigger | manual `workflow_dispatch` via `deploy-all.yml` |  |  |  |
| Frontend deploy trigger | push to `main` for frontend paths, plus manual dispatch |  |  |  |
| Concurrency controls | Terraform deploy uses `concurrency` per environment |  |  |  |

## 2. Authentication and Secrets

| Item | This Repo | Other Project | Drift (Yes/No) | Notes |
|---|---|---|---|---|
| AWS auth method in workflows | static `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` secrets |  |  |  |
| OIDC deploy auth in workflows | no |  |  |  |
| Region source | `AWS_REGION_CUSTOM` secret |  |  |  |
| Lambda artifact bucket source | `LAMBDA_BUCKET` secret |  |  |  |
| Terraform state bucket source | `TF_BACKEND_BUCKET` secret or derived account-based fallback |  |  |  |
| Frontend deploy API source | `BACKEND_API_URL` secret |  |  |  |
| Frontend artifact bucket source | `S3_BUCKET_NAME` secret |  |  |  |
| Amplify deploy source | optional `AMPLIFY_APP_ID` + `AMPLIFY_BRANCH_NAME` secrets |  |  |  |

## 3. Terraform State and Environment Isolation

| Item | This Repo | Other Project | Drift (Yes/No) | Notes |
|---|---|---|---|---|
| Terraform root for service infra | `infrastructure/services` |  |  |  |
| Backend type | S3 backend only |  |  |  |
| Locking strategy | GitHub Actions concurrency, not DynamoDB state locking |  |  |  |
| State key strategy | `services/<environment>/terraform.tfstate` |  |  |  |
| Workspace strategy | no Terraform workspaces in the current service-infra flow |  |  |  |
| Environment selection | workflow input and `environment` Terraform variable |  |  |  |
| Prod overrides file | none in current service-infra flow |  |  |  |

## 4. Terraform Apply Unit

| Item | This Repo | Other Project | Drift (Yes/No) | Notes |
|---|---|---|---|---|
| Terraform setup workflow | `deploy-infrastructure.yml` |  |  |  |
| Init command present | yes, with dynamic backend config |  |  |  |
| State bucket bootstrap | yes, bucket is created if missing |  |  |  |
| Format and validate before plan | yes |  |  |  |
| Import-before-apply step | yes, `scripts/import-existing-resources.sh` on apply |  |  |  |
| Plan before apply | yes, saved to `tfplan` |  |  |  |
| Apply mode | `terraform apply -auto-approve tfplan` |  |  |  |
| Core inputs | `aws_region`, `environment`, `jwt_secret` |  |  |  |

## 5. Artifact Deploy Unit (Backend)

| Item | This Repo | Other Project | Drift (Yes/No) | Notes |
|---|---|---|---|---|
| Build step | `npm ci` + targeted Jest + esbuild bundle |  |  |  |
| Packaging step | zip from `backend/dist/lambda/<service>` |  |  |  |
| Artifact store | S3 object in `LAMBDA_BUCKET` |  |  |  |
| Function update method | `aws lambda update-function-code` |  |  |  |
| Update verification | `aws lambda wait function-updated` |  |  |  |
| Rollback model | copy current zip to `previous.zip`, restore on failure |  |  |  |
| Batch deployment | `deploy-all.yml` matrix across services |  |  |  |
| Product-service health nuance | dedicated `product-service-health` function must remain in deploy lists |  |  |  |

## 6. Runtime Unit

| Item | This Repo | Other Project | Drift (Yes/No) | Notes |
|---|---|---|---|---|
| API routing model | API Gateway routes defined in `infrastructure/services/*-api.tf` |  |  |  |
| Frontend hosting model | static export uploaded to S3 with optional Amplify deployment trigger |  |  |  |
| Local dev stack | PostgreSQL + LocalStack + backend + frontend via Docker Compose |  |  |  |
| Local AWS emulation | LocalStack for DynamoDB and S3 |  |  |  |
| Backend local runtime | Express on port 8080 |  |  |  |
| Frontend local runtime | Next.js on port 3000 |  |  |  |

## 7. Fast Drift Triage

If one section has more than 3 Drift = Yes entries, stop and debug that section before moving lower.

Recommended order:

1. Trigger and Pipeline Shape
2. Authentication and Secrets
3. Terraform State and Environment Isolation
4. Terraform Apply Unit
5. Artifact Deploy Unit
6. Runtime Unit

## 8. Quick Command Set to Validate Drift

```bash
# Workflow inventory
ls .github/workflows

# Terraform service infra
terraform -chdir=infrastructure/services init -backend=false
terraform -chdir=infrastructure/services validate

# Backend build smoke check
cd backend
npm ci
npm run build

# Frontend build smoke check
cd ../frontend
npm ci
npm run build
```

## 9. Decision Rule

If Terraform apply succeeds but traffic or functions still fail, move immediately to artifact deployment, API route wiring, and smoke-test coverage.

If Terraform apply fails, debug credentials, state backend, backend bucket bootstrap, input variables, and import-before-apply behavior before touching application code.
