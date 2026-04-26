# Auth API CloudFormation Deployment - Quick Start

Status: ✅ Infrastructure Complete - Ready for Build & Deployment

## Files Implemented

### New Infrastructure
- infrastructure/nested/auth-api.yaml (200+ lines CloudFormation template)
- infrastructure/root-stack.yaml (updated with Auth API integration)

### Security Fixes
- backend/src/lambda.ts (handleLogin sets httpOnly cookies)
- frontend/app/[locale]/admin/login/page.tsx (removed localStorage XSS)

## Quick Deployment (30-40 minutes)

### 1. Build Lambda (5-10 min)
cd backend && npm run lambda:build

### 2. Package Lambda (2 min)
mkdir -p lambda-package
cp dist/lambda.js lambda-package/
cp -r node_modules lambda-package/
zip -r lambda-deployment.zip lambda-package/

### 3. Upload to S3 (1 min)
aws s3 mb s3://art-management-tool-lambda-code-us-east-1 --region us-east-1 2>/dev/null || true
aws s3 cp lambda-deployment.zip s3://art-management-tool-lambda-code-us-east-1/auth-api/lambda-deployment.zip

### 4. Deploy Stack (10-15 min)
aws cloudformation deploy --template-file infrastructure/root-stack.yaml --stack-name art-management-tool-root --parameter-overrides ProjectName=art-management-tool Environment=dev JwtSecret=YOUR_SECRET AllowedOrigins=https://dev.giorgiopriviteralab.com,http://localhost:3000 LambdaCodeS3Bucket=art-management-tool-lambda-code-us-east-1 LambdaCodeS3Key=auth-api/lambda-deployment.zip DynamoDBTableName=art-management-tool-dev-audit EnableAuthApi=true --region us-east-1 --capabilities CAPABILITY_NAMED_IAM

### 5. Verify (5 min)
aws logs tail /aws/lambda/art-management-tool-dev-auth-api --follow --region us-east-1

## Next: Execute Step 1
