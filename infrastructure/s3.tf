# S3 Bucket for file uploads (product images, etc.)

resource "aws_s3_bucket" "uploads" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = var.s3_bucket_name != "" ? var.s3_bucket_name : "${var.project_name}-uploads-${var.environment}"

  tags = {
    Name        = "${var.project_name}-uploads"
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  count                   = var.create_s3_bucket ? 1 : 0
  bucket                  = aws_s3_bucket.uploads[0].id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.uploads[0].id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.uploads[0].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = split(",", var.cors_allowed_origins)
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  count  = var.create_s3_bucket ? 1 : 0
  bucket = aws_s3_bucket.uploads[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.uploads[0].arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.uploads]
}

# Output S3 details
output "s3_bucket_name" {
  description = "Name of the S3 bucket for uploads"
  value       = var.create_s3_bucket ? aws_s3_bucket.uploads[0].id : null
}

output "s3_bucket_domain" {
  description = "Domain name of the S3 bucket"
  value       = var.create_s3_bucket ? aws_s3_bucket.uploads[0].bucket_regional_domain_name : null
}
