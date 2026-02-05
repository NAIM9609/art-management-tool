# Quick Start Guide - Frontend Deployment Automation

This guide will help you get the automated frontend deployment up and running in under 10 minutes.

## Prerequisites

- AWS Account with access to create S3 buckets and IAM users
- GitHub repository administrator access
- Basic familiarity with AWS Console

## Step 1: Create AWS Resources (5 minutes)

### 1.1 Create S3 Bucket

```bash
# Option A: Using AWS Console
# 1. Go to https://console.aws.amazon.com/s3/
# 2. Click "Create bucket"
# 3. Enter bucket name: "art-tool-frontend-builds" (or your preferred name)
# 4. Select region: us-east-1 (or your preferred region)
# 5. Keep default settings
# 6. Click "Create bucket"

# Option B: Using AWS CLI
aws s3 mb s3://art-tool-frontend-builds --region us-east-1
```

### 1.2 Create IAM User

```bash
# 1. Go to https://console.aws.amazon.com/iam/
# 2. Click "Users" → "Create user"
# 3. Username: "github-actions-deploy"
# 4. Enable "Programmatic access"
# 5. Click "Next"
# 6. Click "Attach policies directly"
# 7. Create and attach a least-privilege custom policy scoped to your S3 bucket (see SECRETS_SETUP.md for the exact policy JSON)
# 8. If using Amplify, also add only the minimal Amplify permissions as documented in SECRETS_SETUP.md (do NOT use AWSAmplifyFullAccess)
# 9. Click "Next" → "Create user"
# 10. **IMPORTANT**: Save the Access Key ID and Secret Access Key (you won't see them again!)
```

## Step 2: Configure GitHub Secrets (2 minutes)

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these three required secrets:

| Secret Name | Value | Example |
|-------------|-------|---------|
| `AWS_ACCESS_KEY_ID` | Your IAM user access key | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | Your IAM user secret key | `wJalrXUtnFEMI/K7MDENG/...` |
| `S3_BUCKET_NAME` | Your S3 bucket name | `art-tool-frontend-builds` |

**Optional secrets** (recommended):

| Secret Name | Value | Example |
|-------------|-------|---------|
| `AWS_REGION` | Your AWS region | `us-east-1` |
| `AMPLIFY_APP_ID` | Your Amplify app ID | `d1234567890abc` |

## Step 3: Test the Workflow (1 minute)

### Option A: Push to Branch (Automatic)

```bash
git checkout copilot/remove-go-backend-replace-typescript
git commit --allow-empty -m "Test deployment workflow"
git push
```

### Option B: Manual Trigger

1. Go to your GitHub repository
2. Click **Actions** tab
3. Select "Frontend Build and Deploy" workflow
4. Click **Run workflow**
5. Select branch: `copilot/remove-go-backend-replace-typescript`
6. Click **Run workflow**

## Step 4: Monitor the Deployment

1. Go to **Actions** tab in GitHub
2. Click on the running workflow
3. Watch the progress of each step:
   - ✅ Checkout code
   - ✅ Setup Node.js
   - ✅ Install dependencies
   - ✅ Build frontend
   - ✅ Create build archive
   - ✅ Configure AWS credentials
   - ✅ Upload to S3
   - ✅ Update Amplify deployment
   - ✅ Deployment summary

## Step 5: Verify Deployment

### Check S3 Bucket

```bash
# List uploaded builds
aws s3 ls s3://art-tool-frontend-builds/builds/

# Expected output:
# 2024-02-02 12:00:00     1234567 frontend-build-20240202-120000.zip
# 2024-02-02 12:00:00     1234567 frontend-build-latest.zip
```

### Download and Inspect Build (Optional)

```bash
# Download the latest build
aws s3 cp s3://art-tool-frontend-builds/builds/frontend-build-latest.zip .

# Extract and inspect
unzip frontend-build-latest.zip
ls -la .next/standalone
ls -la .next/static
```

## Troubleshooting

### ❌ Error: "Access Denied"

**Problem**: IAM user doesn't have S3 permissions

**Solution**: 
1. Check IAM user permissions in AWS Console
2. Ensure S3 bucket name in GitHub Secrets matches actual bucket
3. Verify AWS credentials are correct

### ❌ Error: "npm ci failed"

**Problem**: Missing or corrupted package-lock.json

**Solution**:
```bash
cd frontend
npm install
git add package-lock.json
git commit -m "Update package-lock.json"
git push
```

### ❌ Error: "Bucket not found"

**Problem**: S3 bucket doesn't exist or wrong name

**Solution**:
1. Verify bucket exists: `aws s3 ls s3://your-bucket-name`
2. Check `S3_BUCKET_NAME` secret in GitHub
3. Ensure region matches

### ✅ Workflow succeeds but no Amplify deployment

**Note**: This is expected if you haven't set up Amplify yet. The workflow will:
- ✅ Build the frontend
- ✅ Upload to S3
- ℹ️ Skip Amplify deployment (optional step)

To enable Amplify deployment, add the `AMPLIFY_APP_ID` secret (see SECRETS_SETUP.md).

## What Happens After Deployment?

1. **Build artifacts are stored in S3**:
   - Timestamped version: `s3://your-bucket/builds/frontend-build-YYYYMMDD-HHMMSS.zip`
   - Latest version: `s3://your-bucket/builds/frontend-build-latest.zip`

2. **If Amplify is configured**:
   - Amplify automatically downloads the latest build from S3
   - Extracts and deploys the Next.js application
   - Your app is live at your Amplify URL

3. **Build metadata**:
   - Timestamp
   - Git commit SHA
   - Branch name

## Next Steps

### Optional: Set Up AWS Amplify

If you want to use AWS Amplify for hosting:

1. **Create Amplify App**:
   ```bash
   # Go to https://console.aws.amazon.com/amplify/
   # Click "New app" → "Host web app"
   # Choose "Deploy without Git provider"
   # Give it a name: "art-management-frontend"
   ```

2. **Configure Amplify Build**:
   - Copy the example configuration from `.github/workflows/amplify.yml.example`
   - Add `S3_BUCKET_NAME` as environment variable in Amplify
   - Set up IAM role for Amplify to access S3

3. **Add Amplify Secrets**:
   - Add `AMPLIFY_APP_ID` to GitHub Secrets
   - Add `AMPLIFY_BRANCH_NAME` (optional, defaults to 'main')

### Optional: Set Up Custom Domain

1. In Amplify Console, go to **Domain management**
2. Click **Add domain**
3. Follow the instructions to configure DNS

### Optional: Enable Build Notifications

Add to your workflow (after deployment summary):

```yaml
- name: Notify team
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
      -H 'Content-Type: application/json' \
      -d '{"text":"Frontend deployed successfully! 🚀"}'
```

## Cost Estimate

Expected monthly costs (small project):

- **GitHub Actions**: FREE (public repo) or included in plan
- **S3 Storage**: ~$0.50/month (assuming ~20GB of builds)
- **S3 Data Transfer**: FREE (first 100GB/month)
- **Amplify**: FREE tier available, then ~$0.01 per build minute

**Total**: < $1/month for most projects

## Support

- **Documentation**: See `.github/workflows/README.md`
- **Secrets Setup**: See `.github/workflows/SECRETS_SETUP.md`
- **Issues**: Open a GitHub issue

## Summary

✅ **What you've set up**:
- Automated frontend builds on every push
- Build artifacts stored in S3
- Optional Amplify deployment
- Manual workflow trigger capability

✅ **What happens on each push**:
1. Code is checked out
2. Dependencies installed
3. Frontend built for production
4. Build packaged as ZIP
5. Uploaded to S3
6. Amplify notified (if configured)

🎉 **You're done!** Your frontend deployment is now fully automated.
