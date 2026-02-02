# GitHub Actions Frontend Deployment Setup

This document describes the automated build and deployment workflow for the frontend application.

## Overview

The GitHub Actions workflow automatically builds the Next.js frontend, packages it into a ZIP archive, uploads it to AWS S3, and triggers an AWS Amplify deployment whenever code is pushed to the `copilot/remove-go-backend-replace-typescript` branch.

## Workflow File

Location: `.github/workflows/frontend-deploy.yml`

## Prerequisites

Before the workflow can run successfully, you need to configure the following GitHub Secrets in your repository:

### Required Secrets

1. **AWS_ACCESS_KEY_ID** - AWS access key ID for authentication
2. **AWS_SECRET_ACCESS_KEY** - AWS secret access key for authentication
3. **S3_BUCKET_NAME** - Name of the S3 bucket where build artifacts will be stored

### Optional Secrets

4. **AWS_REGION** - AWS region (default: `us-east-1` if not specified)
5. **AMPLIFY_APP_ID** - AWS Amplify application ID (required for automatic deployment trigger)
6. **AMPLIFY_BRANCH_NAME** - Branch name in Amplify (default: `main` if not specified)
7. **AMPLIFY_WEBHOOK_URL** - Alternative webhook URL for triggering Amplify deployments

## Setting Up GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with its corresponding value

### Example Secret Values

```
AWS_ACCESS_KEY_ID: AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_BUCKET_NAME: my-art-tool-builds
AWS_REGION: us-east-1
AMPLIFY_APP_ID: d1234567890abc
AMPLIFY_BRANCH_NAME: main
```

## AWS Setup

### 1. Create an S3 Bucket

```bash
# Using AWS CLI
aws s3 mb s3://my-art-tool-builds --region us-east-1

# Set appropriate permissions
aws s3api put-bucket-versioning \
  --bucket my-art-tool-builds \
  --versioning-configuration Status=Enabled
```

### 2. Create IAM User for GitHub Actions

Create an IAM user with programmatic access and attach the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:PutObjectMetadata"
      ],
      "Resource": [
        "arn:aws:s3:::my-art-tool-builds",
        "arn:aws:s3:::my-art-tool-builds/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "amplify:StartJob",
        "amplify:GetJob"
      ],
      "Resource": "arn:aws:amplify:*:*:apps/*/branches/*/jobs/*"
    }
  ]
}
```

### 3. Configure AWS Amplify

#### Option A: Connect Amplify to S3

1. Log in to the AWS Amplify Console
2. Select your application or create a new one
3. Navigate to **App settings** → **Build settings**
4. Update the build specification to use the S3 artifact:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        # Download and extract the build from S3
        - aws s3 cp s3://my-art-tool-builds/builds/frontend-build-latest.zip build.zip
        - unzip build.zip
    build:
      commands:
        - echo "Build already completed by GitHub Actions"
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths: []
```

#### Option B: Use Manual Deployment

1. Download the build artifact from S3
2. Deploy manually using AWS CLI:

```bash
# Download from S3
aws s3 cp s3://my-art-tool-builds/builds/frontend-build-latest.zip .

# Deploy to Amplify
aws amplify create-deployment \
  --app-id YOUR_APP_ID \
  --branch-name main
```

#### Option C: Use Amplify Webhook

1. In Amplify Console, go to **App settings** → **Build settings** → **Incoming webhooks**
2. Create a new webhook
3. Copy the webhook URL
4. Add it as `AMPLIFY_WEBHOOK_URL` in GitHub Secrets

## Workflow Behavior

### Trigger

The workflow runs automatically when code is pushed to the `copilot/remove-go-backend-replace-typescript` branch.

### Steps

1. **Checkout** - Retrieves the latest code from the repository
2. **Setup Node.js** - Configures Node.js 20 (LTS) environment
3. **Install Dependencies** - Runs `npm ci` for clean, reproducible builds
4. **Build Frontend** - Executes `npm run build` to create production assets
5. **Create Archive** - Packages build output into a ZIP file with timestamp
6. **Configure AWS** - Sets up AWS credentials from GitHub Secrets
7. **Upload to S3** - Uploads both timestamped and 'latest' versions to S3
8. **Trigger Amplify** - Starts Amplify deployment or sends webhook notification
9. **Summary** - Outputs deployment details

### Build Artifacts

The workflow creates two ZIP files:

1. **Timestamped**: `frontend-build-YYYYMMDD-HHMMSS.zip` - Historical archive
2. **Latest**: `frontend-build-latest.zip` - Always points to the most recent build

Both are uploaded to: `s3://YOUR_BUCKET/builds/`

### Build Contents

The ZIP archive includes:

- `.next/standalone/` - Standalone Next.js server
- `.next/static/` - Static assets (JS, CSS, images)
- `public/` - Public assets
- `package.json` - Package metadata

## Manual Deployment Steps (if Amplify auto-deploy fails)

If automatic Amplify deployment doesn't work, you can deploy manually:

1. **Download the build from S3:**
   ```bash
   aws s3 cp s3://my-art-tool-builds/builds/frontend-build-latest.zip .
   ```

2. **Extract the archive:**
   ```bash
   unzip frontend-build-latest.zip
   ```

3. **Deploy to your hosting platform:**
   ```bash
   # For Amplify
   aws amplify start-deployment --app-id YOUR_APP_ID --branch-name main
   
   # For EC2/VPS
   scp -r .next/ user@your-server:/path/to/app/
   ssh user@your-server 'cd /path/to/app && pm2 restart app'
   ```

## Monitoring and Troubleshooting

### View Workflow Runs

1. Go to your GitHub repository
2. Click on the **Actions** tab
3. Select the "Frontend Build and Deploy" workflow
4. View individual run details and logs

### Common Issues

#### Issue: "S3 bucket not found"
**Solution**: Verify `S3_BUCKET_NAME` secret is correct and the bucket exists

#### Issue: "Access denied to S3"
**Solution**: Check IAM user permissions and ensure the policy allows S3 operations

#### Issue: "Amplify app not found"
**Solution**: Verify `AMPLIFY_APP_ID` is correct or leave it empty to skip Amplify trigger

#### Issue: "Build fails during npm ci"
**Solution**: Check `package-lock.json` is committed to the repository

### Debugging

Enable debug logging by adding these secrets:
- `ACTIONS_STEP_DEBUG`: `true`
- `ACTIONS_RUNNER_DEBUG`: `true`

## Environment Variables

The workflow uses these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_VERSION` | `20` | Node.js version to use |
| `AWS_REGION` | `us-east-1` | Default AWS region |

## Security Best Practices

1. **Never commit AWS credentials** to the repository
2. **Use least-privilege IAM policies** - only grant necessary permissions
3. **Enable S3 bucket versioning** to keep build history
4. **Rotate AWS access keys** regularly
5. **Enable CloudTrail logging** for audit trails
6. **Use HTTPS for all S3 endpoints**

## Customization

### Change Node.js Version

Edit the `NODE_VERSION` in `.github/workflows/frontend-deploy.yml`:

```yaml
env:
  NODE_VERSION: '18'  # Change to desired version
```

### Change Build Directory

If your build output is in a different directory, modify the "Create build archive" step:

```yaml
- name: Create build archive
  run: |
    mkdir -p ../deploy-package
    cp -r .next/standalone ../deploy-package/
    # Add or modify paths as needed
```

### Add Post-Deployment Steps

Add additional steps after the deployment:

```yaml
- name: Notify Slack
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -d '{"text":"Frontend deployed successfully!"}'
```

## Cost Considerations

- **GitHub Actions**: Free for public repositories, 2000 minutes/month for private
- **S3 Storage**: ~$0.023 per GB/month
- **S3 Data Transfer**: First 100 GB free/month
- **Amplify**: Varies based on build minutes and hosting

## Support

For issues or questions:
- Check the [GitHub Actions documentation](https://docs.github.com/en/actions)
- Review [AWS Amplify documentation](https://docs.aws.amazon.com/amplify/)
- Open an issue in this repository

## License

This workflow configuration is part of the Art Management Tool project and follows the same license.
