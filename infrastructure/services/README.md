# Terraform Services Module

This Terraform root (`infrastructure/services`) provisions the service-based AWS infrastructure, including the legacy compatibility API used by the frontend contract.

## Required Variables

- `aws_region`
- `environment`
- `jwt_secret`
- `admin_username`
- `admin_password_hash`

`admin_password_hash` must be a valid bcrypt hash. Validation is enforced in Terraform.

Accepted format pattern:

- starts with `$2a$`, `$2b$`, or `$2y$`
- two cost digits
- 53 bcrypt payload characters

## Generate a Bcrypt Hash

Use one of these commands and store only the resulting hash in your secret store.

PowerShell + Node.js:

```powershell
node -e "const bcrypt=require('bcrypt'); bcrypt.hash(process.argv[1], 12).then(h=>console.log(h));" "YourStrongPasswordHere"
```

Bash + Node.js:

```bash
node -e 'const bcrypt=require("bcrypt"); bcrypt.hash(process.argv[1], 12).then(h=>console.log(h));' "YourStrongPasswordHere"
```

## Pre-merge Validation Commands

Run before merging changes:

```bash
terraform -chdir=infrastructure/services fmt -check -recursive
terraform -chdir=infrastructure/services init -backend=false
terraform -chdir=infrastructure/services validate
```
