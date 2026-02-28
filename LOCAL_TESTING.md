# Local Testing Guide - Art Management Tool

This guide explains how to test cloud services (AWS DynamoDB, S3) locally before deploying to production, helping you avoid costly billing mistakes.

## Overview

The Art Management Tool uses AWS services (DynamoDB, S3) and payment providers (Stripe) that can incur significant costs if not tested properly. This setup allows you to:

- **Test AWS services locally** using LocalStack
- **Run integration tests** against local AWS services
- **Validate code quality** with linting and type checking
- **Prevent billing surprises** by catching issues before production deployment

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ installed (for running tests locally without Docker)
- Git installed

## Quick Start - Local Development

### 1. Setup Environment

Create a `.env.development` file by copying the example:

```bash
cp .env.development.example .env.development
```

The example file is pre-configured for LocalStack, so you can use it as-is.

### 2. Start Development Environment

Start all services (PostgreSQL, LocalStack, Backend, Frontend):

```bash
docker-compose -f docker-compose.development.yml up -d
```

This will start:
- **PostgreSQL** on port 5432
- **LocalStack** (AWS emulator) on port 4566
- **Backend API** on port 8080
- **Frontend** on port 3000

### 3. Verify Services

Check that all services are healthy:

```bash
docker-compose -f docker-compose.development.yml ps
```

Check LocalStack health:

```bash
curl http://localhost:4566/_localstack/health
```

### 4. View Logs

```bash
# All services
docker-compose -f docker-compose.development.yml logs -f

# Specific service
docker-compose -f docker-compose.development.yml logs -f backend
docker-compose -f docker-compose.development.yml logs -f localstack
```

### 5. Stop Services

```bash
docker-compose -f docker-compose.development.yml down
```

## Running Tests Locally

### Unit Tests (with AWS mocks)

These tests use `aws-sdk-client-mock` and don't require LocalStack:

```bash
cd backend
npm install
npm test
```

### Integration Tests (with LocalStack)

These tests run against real (local) AWS services:

```bash
# Start LocalStack and PostgreSQL
docker-compose -f docker-compose.development.yml up -d postgres localstack

# Wait for services to be ready
sleep 10

# Set environment variables
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=artuser
export DB_PASSWORD=dbpass
export DB_NAME=artmanagement

# Run integration tests
cd backend
npm run test:integration
```

### Linting

```bash
cd backend
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Build Verification

```bash
cd backend
npm run build
```

## LocalStack Services

LocalStack provides local AWS service emulation:

### DynamoDB Tables

The following tables are automatically created on LocalStack startup:

- `products` - Product catalog
- `orders` - Customer orders
- `carts` - Shopping carts
- `discount-codes` - Promotional codes
- `audit-logs` - Audit trail
- `notifications` - User notifications
- `etsy-products` - Etsy marketplace integration
- `etsy-sync-configs` - Etsy sync configuration
- `etsy-oauth-tokens` - Etsy OAuth tokens

### S3 Buckets

- `art-images-dev` - Image storage

### Accessing LocalStack

You can interact with LocalStack using the AWS CLI:

```bash
# List DynamoDB tables
aws --endpoint-url=http://localhost:4566 dynamodb list-tables

# List S3 buckets
aws --endpoint-url=http://localhost:4566 s3 ls

# Scan a DynamoDB table
aws --endpoint-url=http://localhost:4566 dynamodb scan --table-name products

# List objects in S3 bucket
aws --endpoint-url=http://localhost:4566 s3 ls s3://art-images-dev/
```

## CI/CD Integration

### GitHub Actions

The project includes a GitHub Actions workflow that runs tests automatically:

**`.github/workflows/backend-tests.yml`** runs on every push and PR:

1. **Linting** - ESLint checks
2. **Unit Tests** - Fast tests with mocks
3. **Integration Tests** - Tests with LocalStack
4. **Build** - TypeScript compilation

### Pre-commit Hooks (Optional)

To run tests before every commit, you can set up Git hooks:

```bash
# Create pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
echo "Running tests before commit..."

cd backend
npm test

if [ $? -ne 0 ]; then
  echo "Tests failed. Commit aborted."
  exit 1
fi

npm run lint

if [ $? -ne 0 ]; then
  echo "Linting failed. Commit aborted."
  exit 1
fi

echo "All checks passed!"
EOF

chmod +x .git/hooks/pre-commit
```

## Cost Prevention Strategies

### 1. Use Mock Services in Development

The configuration automatically uses:
- **Mock Payment Provider** instead of Stripe in development
- **LocalStack** instead of real AWS services
- **Disabled schedulers** to prevent automated jobs

### 2. Environment-Based Configuration

The backend automatically detects the environment:

```typescript
// backend/src/config/index.ts
const environment = process.env.ENVIRONMENT || 'development';

// AWS endpoint is only used when AWS_ENDPOINT_URL is set
const awsEndpoint = process.env.AWS_ENDPOINT_URL; // LocalStack in dev
```

### 3. Test Coverage Requirements

The project enforces 80% test coverage to ensure code is well-tested before production:

```json
{
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

### 4. Required Checks Before Production

Before deploying to production, ensure:

- [ ] All unit tests pass (`npm test`)
- [ ] All integration tests pass (`npm run test:integration`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Test coverage meets 80% threshold
- [ ] GitHub Actions workflow passes

## Debugging

### Backend Not Connecting to LocalStack

If the backend can't connect to LocalStack:

1. Check LocalStack is running:
   ```bash
   curl http://localhost:4566/_localstack/health
   ```

2. Check environment variables:
   ```bash
   docker-compose -f docker-compose.development.yml exec backend env | grep AWS
   ```

3. Check LocalStack logs:
   ```bash
   docker-compose -f docker-compose.development.yml logs localstack
   ```

### DynamoDB Table Not Found

If you get "Table not found" errors:

1. Verify tables were created:
   ```bash
   aws --endpoint-url=http://localhost:4566 dynamodb list-tables
   ```

2. Re-run initialization script:
   ```bash
   docker-compose -f docker-compose.development.yml restart localstack
   ```

### S3 Bucket Access Issues

If you get S3 access errors:

1. Verify bucket exists:
   ```bash
   aws --endpoint-url=http://localhost:4566 s3 ls
   ```

2. Check bucket permissions:
   ```bash
   aws --endpoint-url=http://localhost:4566 s3api get-bucket-cors --bucket art-images-dev
   ```

## Production Deployment Checklist

Before deploying to production:

- [ ] All tests pass locally with LocalStack
- [ ] GitHub Actions workflow is green
- [ ] Environment variables are set correctly in production
- [ ] AWS credentials have minimal required permissions
- [ ] Rate limiting is enabled (`RATE_LIMIT_ENABLED=true`)
- [ ] Logging level is set to `warn` or `error`
- [ ] JWT_SECRET is set to a strong random value
- [ ] Payment provider is set to `stripe` with valid keys
- [ ] S3 bucket and DynamoDB tables exist in production AWS
- [ ] CloudFront CDN is configured (if using)
- [ ] Database migrations have been run
- [ ] Backup strategy is in place

## Monitoring Costs

Even with local testing, monitor your AWS costs:

1. **Enable AWS Cost Alerts**
   - Set up billing alerts in AWS Console
   - Alert on daily spend > $10

2. **Monitor DynamoDB Capacity**
   - Check consumed read/write capacity
   - Review DynamoDB logs for capacity issues

3. **Monitor S3 Usage**
   - Track storage size
   - Monitor data transfer costs

4. **Use Cost Explorer**
   - Review daily/weekly costs
   - Identify unexpected spikes

## Troubleshooting

### Tests Fail with "Cannot connect to database"

Make sure PostgreSQL is running:
```bash
docker-compose -f docker-compose.development.yml up -d postgres
```

### LocalStack services not initialized

Check the initialization script ran:
```bash
docker-compose -f docker-compose.development.yml logs localstack | grep "initialization complete"
```

If not found, restart LocalStack:
```bash
docker-compose -f docker-compose.development.yml restart localstack
```

## Additional Resources

- [LocalStack Documentation](https://docs.localstack.cloud/)
- [AWS DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [AWS S3 Cost Optimization](https://aws.amazon.com/s3/cost-optimization/)
- [Jest Testing Documentation](https://jestjs.io/docs/getting-started)

## Support

If you encounter issues with local testing setup:

1. Check existing GitHub Issues
2. Review LocalStack logs
3. Verify environment variables are set correctly
4. Ensure Docker has enough resources allocated
