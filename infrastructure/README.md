# Art Management Tool - Infrastructure

This directory contains Terraform configuration for deploying the Art Management Tool infrastructure on AWS.

## Resources Created

### Networking
- **VPC** (10.0.0.0/16) with DNS support
- **Internet Gateway** for public internet access
- **Public Subnets** (2 across multiple AZs)
- **Route Tables** for public subnet routing
- **Security Groups** for backend (port 8080) and frontend (ports 80, 443, 3000)

### Database
- **DynamoDB Table** for art management data
  - Billing mode: PAY_PER_REQUEST
  - Point-in-time recovery enabled
  - Server-side encryption enabled
  - TTL enabled on `expires_at` attribute
  - 3 Global Secondary Indexes (GSI1, GSI2, GSI3)

### Storage & CDN
- **S3 Bucket** (`art-management-images-${environment}`)
  - Versioning: Disabled
  - Public access: Blocked (all 4 settings enabled)
  - Lifecycle rules:
    - Delete objects in `temp/` folder after 365 days
    - Transition objects to Glacier storage after 180 days
    - Note: Temp objects are transitioned to Glacier at 180 days and deleted at 365 days (cost optimization)
  
- **CloudFront Distribution**
  - Origin: S3 bucket via Origin Access Identity (OAI)
  - Price class: PriceClass_100 (North America + Europe only)
  - HTTPS redirect enforced
  - Compression enabled (gzip and brotli)
  - Cache TTL: min=1 day, default=7 days, max=1 year
  
- **CloudFront Origin Access Identity (OAI)**
  - Provides secure access from CloudFront to S3
  - S3 bucket policy allows only OAI access
  
- **Custom Cache Policy**
  - Optimized for image delivery with WebP support
  - Caches based on Accept and Accept-Encoding headers
  - Ignores query strings and cookies
  - Compression enabled
  
- **Security Headers Policy**
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - Strict-Transport-Security: max-age=31536000

## Prerequisites

- Terraform >= 1.0
- AWS CLI configured with appropriate credentials
- AWS account with permissions to create the required resources

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region to deploy resources | `us-east-1` |
| `project_name` | Project name used for resource naming | `art-management-tool` |
| `environment` | Environment name (dev, staging, prod) | `dev` |
| `table_name` | DynamoDB table name (optional) | `{project_name}-{environment}-art-management` |

## Outputs

| Output | Description |
|--------|-------------|
| `vpc_id` | ID of the VPC |
| `public_subnet_ids` | IDs of the public subnets |
| `backend_security_group_id` | ID of the backend security group |
| `frontend_security_group_id` | ID of the frontend security group |
| `table_name` | Name of the DynamoDB table |
| `table_arn` | ARN of the DynamoDB table |
| `gsi1_name`, `gsi2_name`, `gsi3_name` | Names of the GSI indexes |
| `s3_bucket_name` | Name of the S3 bucket for images |
| `cdn_url` | CloudFront distribution domain name |
| `cloudfront_distribution_id` | ID of the CloudFront distribution |

## Deployment

### Initialize Terraform

```bash
cd infrastructure
terraform init
```

### Plan Changes

```bash
terraform plan -var="environment=dev"
```

### Apply Configuration

```bash
terraform apply -var="environment=dev"
```

### Destroy Resources (when needed)

```bash
terraform destroy -var="environment=dev"
```

## Using Different Environments

To deploy to different environments, specify the environment variable:

```bash
# Development
terraform apply -var="environment=dev"

# Staging
terraform apply -var="environment=staging"

# Production
terraform apply -var="environment=prod"
```

## S3 Bucket Usage

After deployment, the S3 bucket name will be available in the outputs. Configure your application with:

```bash
# Get the outputs
terraform output s3_bucket_name
terraform output cdn_url
```

Then set these environment variables in your application:
- `S3_BUCKET_NAME`: The bucket name from output
- `CDN_URL`: The CloudFront domain from output (format: `https://{cdn_url}`)

## Image Upload and Access

### Upload images to S3
Images should be uploaded to the S3 bucket using the AWS SDK with appropriate IAM credentials.

### Access images via CDN
Images are accessible via the CloudFront CDN URL:
```
https://{cdn_url}/{image-path}
```

### Temporary files
Files in the `temp/` prefix will be automatically deleted after 365 days.

## Security Considerations

1. **Public Access Blocked**: All public access to the S3 bucket is blocked
2. **OAI Only**: Only CloudFront can access the S3 bucket via OAI
3. **HTTPS Only**: All HTTP requests are redirected to HTTPS
4. **Security Headers**: Response headers include security best practices
5. **Encryption**: S3 and DynamoDB use server-side encryption

## Cost Optimization

- **DynamoDB**: PAY_PER_REQUEST billing only charges for actual usage
- **S3**: Lifecycle rules move old objects to Glacier (cheaper storage)
- **CloudFront**: PriceClass_100 limits distribution to North America and Europe
- **Compression**: Reduces bandwidth costs

## Monitoring

After deployment, monitor:
- CloudFront distribution metrics in AWS Console
- S3 bucket metrics for storage and requests
- DynamoDB table metrics for read/write capacity

## Troubleshooting

### CloudFront takes time to deploy
CloudFront distributions can take 15-30 minutes to fully deploy. Use `wait_for_deployment = false` to avoid waiting during Terraform apply.

### S3 bucket name already exists
S3 bucket names must be globally unique. If the name is taken, modify the `environment` variable or bucket name format.

### Permission errors
Ensure your AWS credentials have sufficient permissions to create all resources (VPC, S3, CloudFront, DynamoDB, IAM for OAI).
