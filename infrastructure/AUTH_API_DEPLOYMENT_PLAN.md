# Auth API CloudFormation Deployment Plan

Status: Infrastructure Complete - Ready for Build & Deployment

## Files Implemented

### Infrastructure (NEW)
- infrastructure/nested/auth-api.yaml - CloudFormation template for Auth API
- infrastructure/root-stack.yaml - Updated with Auth API nested stack

### Code Changes (Security Fixes)
- backend/src/lambda.ts - handleLogin now sets httpOnly cookies
- frontend/app/[locale]/admin/login/page.tsx - Removed insecure localStorage

## Deployment Phases

### PHASE 1: Build Lambda (5-10 minutes)

cd backend
npm install
npm run lambda:build
ls -la dist/lambda.js


### PHASE 2: Package Lambda (2 minutes)

cd backend
mkdir -p lambda-package
cp dist/lambda.js lambda-package/
cp -r node_modules lambda-package/
zip -r lambda-deployment.zip lambda-package/
rm -rf lambda-package
ls -lh lambda-deployment.zip


### PHASE 3: Upload to S3 (1 minute)

aws s3 mb s3://art-management-tool-lambda-code-us-east-1 --region us-east-1 2>/dev/null || true
aws s3 cp backend/lambda-deployment.zip s3://art-management-tool-lambda-code-us-east-1/auth-api/lambda-deployment.zip --region us-east-1


### PHASE 4: Deploy CloudFormation Stack (10-15 minutes)

aws cloudformation deploy 
  --template-file infrastructure/root-stack.yaml 
  --stack-name art-management-tool-root 
  --parameter-overrides 
    ProjectName=art-management-tool 
    Environment=dev 
    JwtSecret=YOUR_JWT_SECRET_HERE 
    AllowedOrigins=https://dev.giorgiopriviteralab.com,http://localhost:3000 
    LambdaReservedConcurrency=10 
    LambdaCodeS3Bucket=art-management-tool-lambda-code-us-east-1 
    LambdaCodeS3Key=auth-api/lambda-deployment.zip 
    DynamoDBTableName=art-management-tool-dev-audit 
    EnableAuthApi=true 
  --region us-east-1 
  --capabilities CAPABILITY_NAMED_IAM


### PHASE 5: Verify Deployment (5 minutes)

aws cloudformation describe-stacks --stack-name art-management-tool-root --region us-east-1 --query 'Stacks[0].Outputs' --output table

# Get Auth API endpoint from outputs above, then test:

curl https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/dev/health

# Test login endpoint:

curl -v -X POST https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/dev/api/auth/login 
  -H 'Content-Type: application/json' 
  -d '{\"username\":\"admin\",\"password\":\"YOUR_PASSWORD\"}'

# Check CloudWatch logs:

aws logs tail /aws/lambda/art-management-tool-dev-auth-api --follow --region us-east-1


## Security Verification Checklist

[x] JWT tokens stored in httpOnly cookies (not localStorage)
[x] credentials: 'include' in fetch calls
[x] SameSite=Strict cookie flag enabled
[x] Secure flag enabled on cookies
[x] CORS configured for API Gateway
[x] Audit logging to DynamoDB

## Rollback (if needed)

# Disable Auth API without full stack deletion
aws cloudformation update-stack \
  --stack-name art-management-tool-root \
  --use-previous-template \
  --parameters ParameterKey=EnableAuthApi,ParameterValue=false \
  --region us-east-1


## Next Action

Execute PHASE 1: npm run lambda:build in backend/

---
Created: 2026-04-26
Status: Ready for Deployment
