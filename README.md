# Art Management Tool

A full-stack art management application with e-commerce capabilities, built with Next.js (frontend) and Node.js/Express (backend).

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL (primary), DynamoDB (auxiliary)
- **Storage**: AWS S3 with CloudFront CDN
- **Infrastructure**: Docker, Terraform, AWS ECS

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
   docker-compose -f docker-compose.development.yml up -d
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

## Deployment Scripts

Helper scripts for manual deployment are located in the `scripts/` directory. All scripts
require `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to be set in the environment.

### Prerequisites

```bash
# Install required CLI tools
# - AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html
# - Terraform 1.x: https://developer.hashicorp.com/terraform/install
# - Node.js 20+, npm, zip

# Required environment variables
export AWS_ACCESS_KEY_ID=<your-key>
export AWS_SECRET_ACCESS_KEY=<your-secret>
export AWS_REGION=eu-north-1          # or your region
export LAMBDA_BUCKET=<your-s3-bucket> # S3 bucket for Lambda packages
export API_GATEWAY_URL=<your-api-url> # optional, enables smoke tests
```

### deploy-all.sh — Full deployment

Deploys infrastructure and all services, runs smoke tests, and displays endpoints.

```bash
./scripts/deploy-all.sh -e dev
./scripts/deploy-all.sh -e staging --skip-infrastructure
./scripts/deploy-all.sh -e prod --services product,order
```

### deploy-service.sh — Deploy a single service

Builds, packages, uploads to S3, updates all Lambda functions for the named service,
and runs a service-specific smoke test.

```bash
./scripts/deploy-service.sh product
./scripts/deploy-service.sh product -e staging
./scripts/deploy-service.sh order -e prod --skip-tests
```

Valid service names: `audit`, `cart`, `content`, `discount`, `integration`,
`notification`, `order`, `product`.

### deploy-infrastructure.sh — Terraform deployment

Runs `terraform init`, `terraform plan`, prompts for confirmation, then applies.
Saves all Terraform outputs to `terraform-outputs.env`.

```bash
./scripts/deploy-infrastructure.sh -e dev
./scripts/deploy-infrastructure.sh -e prod --plan-only
```

### rollback.sh — Roll back a service

Rolls back a Lambda service to a previous version. Supports `previous` (last
deployed), a commit SHA, or a full S3 key.

```bash
./scripts/rollback.sh product previous
./scripts/rollback.sh product v123 -e staging
./scripts/rollback.sh order abc1234 -e prod -y
```

### logs.sh — Stream CloudWatch logs

Tails and filters CloudWatch logs for Lambda functions. Supports follow mode,
log-level filtering, and pattern matching.

```bash
./scripts/logs.sh product
./scripts/logs.sh product --follow
./scripts/logs.sh product --follow --level ERROR
./scripts/logs.sh all -e staging --follow
```

### smoke-test.sh — Verify API endpoints

Tests all API endpoints, verifies expected HTTP responses, and reports failures
with a colour-coded summary.

```bash
./scripts/smoke-test.sh -u https://abc123.execute-api.eu-north-1.amazonaws.com/dev
./scripts/smoke-test.sh -e prod
```

---

## Documentation

- [Local Testing Guide](LOCAL_TESTING.md) - Testing with LocalStack
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md) - Implementation details
- [Infrastructure README](infrastructure/README.md) - Terraform setup

## Contributing

1. Ensure all tests pass locally with LocalStack
2. Run linting: `npm run lint`
3. Follow the [Local Testing Guide](LOCAL_TESTING.md) before submitting PRs
4. Ensure GitHub Actions workflow passes

## License

Private repository - All rights reserved.
