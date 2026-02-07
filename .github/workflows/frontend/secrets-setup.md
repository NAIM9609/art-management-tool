# Required GitHub Secrets Configuration

This document lists all the GitHub Secrets that need to be configured for the frontend deployment workflow to function properly.

## How to Add Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter the name and value for each secret below
5. Click **Add secret**

## Required Secrets

These secrets MUST be configured for the workflow to run successfully:

### 1. AWS_ACCESS_KEY_ID
- **Description**: AWS access key ID for authentication
- **Example**: `AKIAIOSFODNN7EXAMPLE`
- **How to get**: Create an IAM user in AWS Console with programmatic access

### 2. AWS_SECRET_ACCESS_KEY
- **Description**: AWS secret access key for authentication
- **Example**: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`
- **How to get**: Provided when creating the IAM user (save it immediately, you won't see it again)

### 3. S3_BUCKET_NAME
- **Description**: Name of the S3 bucket where build artifacts will be stored
- **Example**: `my-art-tool-builds` or `art-management-frontend-builds`
- **How to get**: Create a bucket in S3 console or use existing bucket

## Optional Secrets

These secrets are optional but enable additional features:

### 4. AWS_REGION
- **Description**: AWS region where your S3 bucket and Amplify app are located
- **Example**: `us-east-1`, `eu-west-1`, `ap-southeast-1`
- **Default**: `us-east-1` (if not specified)

### 5. AMPLIFY_APP_ID
- **Description**: AWS Amplify application ID for automatic deployment triggering
- **Example**: `d1234567890abc`
- **How to get**: 
  1. Go to AWS Amplify Console
  2. Select your app
  3. The App ID is in the URL and app settings
- **Note**: If not provided, workflow will skip Amplify deployment step

### 6. AMPLIFY_BRANCH_NAME
- **Description**: Branch name in Amplify to deploy to
- **Example**: `main`, `production`, `staging`
- **Default**: `main` (if not specified)

### 7. AMPLIFY_WEBHOOK_URL
- **Description**: Alternative webhook URL for triggering Amplify deployments
- **Example**: `https://webhooks.amplify.us-east-1.amazonaws.com/prod/webhooks?id=...&token=...`
- **How to get**:
  1. Go to AWS Amplify Console
  2. Navigate to **App settings** → **Build settings** → **Incoming webhooks**
  3. Create a new webhook and copy the URL
- **Note**: Can be used instead of or in addition to AMPLIFY_APP_ID

## IAM Policy for GitHub Actions User

Create an IAM user with the following policy for minimal required permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3BuildArtifacts",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET_NAME/*"
      ]
    },
    {
      "Sid": "S3ListBucket",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET_NAME"
      ]
    },
    {
      "Sid": "AmplifyDeployment",
      "Effect": "Allow",
      "Action": [
        "amplify:StartJob",
        "amplify:GetJob"
      ],
      "Resource": [
        "arn:aws:amplify:*:*:apps/YOUR_APP_ID/branches/*/jobs/*"
      ]
    }
  ]
}
```

Replace:
- `YOUR_BUCKET_NAME` with your actual S3 bucket name
- `YOUR_APP_ID` with your Amplify app ID (or use `*` for all apps)

## S3 Bucket Setup

### Create S3 Bucket (AWS CLI)

```bash
# Create bucket
aws s3 mb s3://my-art-tool-builds --region us-east-1

# Enable versioning (recommended)
aws s3api put-bucket-versioning \
  --bucket my-art-tool-builds \
  --versioning-configuration Status=Enabled

# Optional: Set lifecycle policy to delete old builds after 30 days
cat > lifecycle-policy.json << EOF
{
  "Rules": [
    {
      "Id": "DeleteOldBuilds",
      "Status": "Enabled",
      "Prefix": "builds/frontend-build-",
      "Expiration": {
        "Days": 30
      },
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 7
      }
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket my-art-tool-builds \
  --lifecycle-configuration file://lifecycle-policy.json
```

### Create S3 Bucket (AWS Console)

1. Go to AWS S3 Console
2. Click **Create bucket**
3. Enter bucket name: `my-art-tool-builds` (or your preferred name)
4. Select region: `us-east-1` (or your preferred region)
5. Keep default settings for:
   - Block all public access: **Enabled** (recommended)
   - Bucket versioning: **Enabled** (optional but recommended)
   - Default encryption: **Enabled** (optional but recommended)
6. Click **Create bucket**

## Verification Checklist

Before running the workflow, verify:

- [ ] All required secrets are added to GitHub repository
- [ ] IAM user has correct permissions
- [ ] S3 bucket exists and is accessible
- [ ] AWS region matches between bucket and secrets
- [ ] Amplify app is created (if using Amplify deployment)
- [ ] Branch name matches Amplify branch configuration

## Testing the Secrets

You can test if your secrets are working by:

1. Pushing a small change to the `copilot/remove-go-backend-replace-typescript` branch
2. Going to **Actions** tab in GitHub
3. Watching the workflow run
4. Checking for any authentication or permission errors

## Troubleshooting

### Error: "Access Denied" when uploading to S3
- Check that `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are correct
- Verify IAM user has `s3:PutObject` permission
- Ensure S3 bucket name is correct

### Error: "Bucket not found"
- Verify `S3_BUCKET_NAME` secret matches the actual bucket name
- Ensure bucket is in the correct region
- Check that bucket hasn't been deleted

### Error: "Amplify app not found"
- Verify `AMPLIFY_APP_ID` is correct
- Ensure IAM user has Amplify permissions
- Check that the app exists in the specified region

## Security Best Practices

1. **Never commit secrets to code** - Always use GitHub Secrets
2. **Use least-privilege IAM policies** - Only grant necessary permissions
3. **Rotate credentials regularly** - Change access keys every 90 days
4. **Enable MFA for AWS account** - Extra security for production
5. **Use separate AWS accounts** - Different accounts for dev/staging/prod
6. **Monitor CloudTrail logs** - Track all API calls for audit
7. **Enable S3 bucket encryption** - Protect data at rest

## Additional Resources

- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS S3 Security Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)
- [AWS Amplify Documentation](https://docs.aws.amazon.com/amplify/)