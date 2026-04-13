# Art Management Tool

A full-stack art management application with e-commerce capabilities, built with Next.js on the frontend and TypeScript/Node.js services on the backend.

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Backend**: TypeScript services and local Express API runtime
- **Database**: PostgreSQL (primary), DynamoDB (auxiliary)
- **Storage**: AWS S3 with CloudFront CDN
- **Infrastructure**: Docker, Terraform, AWS Lambda, API Gateway, Amplify

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development without Docker)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/NAIM9609/art-management-tool.git
   cd art-management-tool
   ```

2. **Create environment file**
   ```bash
   cp .env.development.example .env.development
   ```

3. **Start development environment**
   ```bash
   docker compose -f docker-compose.development.yml up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080
   - LocalStack (AWS emulator): http://localhost:4566

## Testing

For comprehensive local testing setup, including LocalStack configuration for AWS services (DynamoDB, S3):

📚 **[Local Testing Guide](LOCAL_TESTING.md)**

The testing guide covers:
- Setting up LocalStack for local AWS service emulation
- Running unit and integration tests
- Linting and code quality checks
- CI/CD workflow overview
- Cost prevention strategies

### Quick Test Commands

```bash
cd backend

# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests (requires LocalStack)
npm run test:integration

# Lint code
npm run lint
```

## Project Structure

```
├── backend/              # Express.js backend API
│   ├── src/
│   │   ├── config/       # Configuration management
│   │   ├── entities/     # TypeORM entities
│   │   ├── handlers/     # Route handlers
│   │   ├── middleware/   # Express middleware
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic & AWS services
│   │   └── utils/        # Utility functions
│   └── Dockerfile
├── frontend/             # Next.js frontend
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── services/         # API service clients
│   └── Dockerfile
├── infrastructure/       # Terraform IaC for AWS
├── localstack-init/      # LocalStack initialization scripts
└── docker-compose.*.yml  # Docker Compose configurations
```

## Deployment

All deployments are managed via GitHub Actions workflows in `.github/workflows/`.

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `deploy-product-service.yml` | Push to `main` (product paths) or manual | Build, test, package, and deploy product-service Lambdas |
| `deploy-cart-service.yml` | Push to `main` (cart paths) or manual | Build, test, package, and deploy cart-service Lambdas |
| `deploy-order-service.yml` | Push to `main` (order paths) or manual | Build, test, package, and deploy order-service Lambdas |
| `deploy-content-service.yml` | Push to `main` (content paths) or manual | Build, test, package, and deploy content-service Lambdas |
| `deploy-audit-service.yml` | Push to `main` (audit paths) or manual | Build, test, package, and deploy audit-service Lambdas |
| `deploy-discount-service.yml` | Push to `main` (discount paths) or manual | Build, test, package, and deploy discount-service Lambdas |
| `deploy-notification-service.yml` | Push to `main` (notification paths) or manual | Build, test, package, and deploy notification-service Lambdas |
| `deploy-integration-service.yml` | Push to `main` (integration paths) or manual | Build, test, package, and deploy integration-service Lambdas |
| `deploy-infrastructure.yml` | Manual (`workflow_dispatch`) or reusable call | Terraform plan/apply for infrastructure in `infrastructure/services` |
| `deploy-all.yml` | Manual (`workflow_dispatch`) | Optional Terraform apply followed by matrix deployment for all Lambda services |
| `frontend-deploy.yml` | Push to `main` (frontend paths) or manual | Static-export frontend build, S3 upload, optional Amplify deployment |
| `backend-tests.yml` / `frontend-tests.yml` / `terraform-validate.yml` | Push and PR path filters | CI validation for backend, frontend, and Terraform |

Each service workflow installs from the lockfile, runs targeted tests, bundles with esbuild, uploads artifacts to S3, updates Lambda functions, runs smoke checks when configured, and rolls back to `previous.zip` on failure.

### Local Development Scripts

LocalStack scripts for local testing are in `scripts/`:

- `localstack-deploy-service.{sh,ps1}` — Deploy a single service to LocalStack
- `localstack-deploy-all.{sh,ps1}` — Deploy all services to LocalStack
- `localstack-invoke.{sh,ps1}` — Invoke a Lambda function on LocalStack

See [Local Testing Guide](LOCAL_TESTING.md) for details.

---

## Documentation

- [Local Testing Guide](LOCAL_TESTING.md) - Testing with LocalStack
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md) - Implementation details
- [Infrastructure README](infrastructure/README.md) - Terraform setup
- [TERRAFORM_GITHUB_ACTIONS_GUIDE.md](TERRAFORM_GITHUB_ACTIONS_GUIDE.md) - Deployment and Terraform flow
- [INFRA_COMPARISON_CHECKLIST.md](INFRA_COMPARISON_CHECKLIST.md) - Blank comparison checklist
- [INFRA_COMPARISON_CHECKLIST_PREFILLED.md](INFRA_COMPARISON_CHECKLIST_PREFILLED.md) - Repo-specific baseline checklist

## Contributing

1. Ensure all tests pass locally with LocalStack
2. Run linting: `npm run lint`
3. Follow the [Local Testing Guide](LOCAL_TESTING.md) before submitting PRs
4. Ensure GitHub Actions workflow passes

## License

Private repository - All rights reserved.
