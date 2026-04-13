# Terraform Services Module

This Terraform root (`infrastructure/services`) provisions the service-based AWS infrastructure for all backend Lambda services and their API Gateways.

## Required Variables

- `aws_region`
- `environment`
- `jwt_secret`

## Pre-merge Validation Commands

Run before merging changes:

```bash
terraform -chdir=infrastructure/services fmt -check -recursive
terraform -chdir=infrastructure/services init -backend=false
terraform -chdir=infrastructure/services validate
```
