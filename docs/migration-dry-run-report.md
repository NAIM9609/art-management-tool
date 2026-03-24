# Migration Dry Run – Findings Report

**Task:** 11.2 Data Migration Dry Run  
**Environment:** Staging (LocalStack + PostgreSQL)  
**Date:** YYYY-MM-DD

---

## Overview

This document records the outcome of the complete PostgreSQL → DynamoDB data migration
dry run executed in the staging environment.  The dry run covers all six phases defined
in Task 11.2 and serves as the basis for the production migration go/no-go decision.

---

## 1. Staging Environment Setup

| Component | Details |
|-----------|---------|
| PostgreSQL | postgres:16-alpine, seeded with test data covering all entity types |
| DynamoDB | LocalStack 3.8.1 with single-table design (PK/SK + GSI1/GSI2/GSI3) |
| Lambda functions | Deployed via `scripts/setup-staging.sh --deploy-lambdas` for end-to-end API testing |
| Table name | `art-management-tool-staging-art-management` |

### Setup procedure

```bash
# 1a. Clone production PostgreSQL to staging
#     Note: backup must be created with `pg_dump -Fc` (custom format) for pg_restore.
./scripts/setup-staging.sh \
  --environment staging \
  --staging-db-host <staging-rds-host> \
  --staging-db-name art_management_staging \
  --pg-backup backups/prod-backup.dump

# 1b. For a fully automated dry run (CI), use the workflow:
#     .github/workflows/data-migration-dry-run.yml
```

---

## 2. Migration Execution

### Procedure

```bash
# Pre-migration backup (safety net)
cd backend
ROLLBACK_MODE=backup DYNAMODB_TABLE_NAME=art-management-tool-staging-art-management \
  npm run rollback:migration

# Run migration (timed)
time DYNAMODB_TABLE_NAME=art-management-tool-staging-art-management \
  npm run migrate:production
```

### Migration summary

| Entity | Records migrated | Notes |
|--------|-----------------|-------|
| Categories | — | — |
| Products | — | — |
| ProductVariants | — | — |
| ProductImages | — | — |
| Product-Category links | — | — |
| Personaggi | — | — |
| Fumetti | — | — |
| DiscountCodes | — | — |
| Carts | — | — |
| CartItems | — | — |
| Orders | — | — |
| OrderItems | — | — |
| Notifications | — | — |
| AuditLogs | — | — |
| EtsyOAuthTokens | — | — |
| EtsyProducts | — | — |
| EtsyReceipts | — | — |
| EtsySyncConfigs | — | — |
| **TOTAL** | **—** | — |

> **Migration duration:** < 10 minutes target  
> Populate the table above from the migration script's console output.

---

## 3. Validation Results

```bash
DYNAMODB_TABLE_NAME=art-management-tool-staging-art-management \
  npm run validate:migration
```

### Record counts

| Entity | PostgreSQL | DynamoDB | Match |
|--------|-----------|---------|-------|
| Categories | — | — | — |
| Products | — | — | — |
| … | | | |

### Spot-check results

A random sample of 5 records per entity was retrieved from DynamoDB and compared
against the source PostgreSQL row.

- **Fields verified:** id, slug, created_at, updated_at, deleted_at, all entity-specific columns
- **Outcome:** All spot checks passed / N issues found (see Issues section)

### Relationship checks

| Check | Result |
|-------|--------|
| Every OrderItem references a known Order | — |
| Every CartItem references a known Cart | — |
| Every ProductImage references a known Product | — |
| Every ProductVariant references a known Product | — |

### Query checks

| Query | Result |
|-------|--------|
| GSI1 – status index scan | — |
| GSI2 – slug index lookup | — |
| GSI3 – email/customer index scan | — |

---

## 4. Performance Test

k6 load tests were run against the staging API Gateway endpoints.

```bash
# Run all three load-test scenarios
BASE_URL=https://<staging-api-id>.execute-api.eu-north-1.amazonaws.com/staging \
  k6 run tests/load/products.load.test.js

BASE_URL=https://<staging-api-id>.execute-api.eu-north-1.amazonaws.com/staging \
  k6 run tests/load/orders.load.test.js

BASE_URL=https://<staging-api-id>.execute-api.eu-north-1.amazonaws.com/staging \
  k6 run tests/load/cart.load.test.js
```

### Results

| Service | p(50) | p(95) | p(99) | Error rate | Target |
|---------|-------|-------|-------|-----------|--------|
| Product | — ms | — ms | — ms | — % | p(95) < 500 ms, err < 1 % |
| Order | — ms | — ms | — ms | — % | p(95) < 1000 ms, err < 1 % |
| Cart | — ms | — ms | — ms | — % | p(95) < 300 ms, err < 1 % |

### Free-tier guard-rails

| Metric | Limit | Observed | Status |
|--------|-------|---------|--------|
| Lambda invocations | 900 000 / month | — | — |
| DynamoDB RCU consumed | ≤ 20 per run | — | — |
| DynamoDB WCU consumed | ≤ 20 per run | — | — |

---

## 5. Rollback Test

### Procedure

```bash
# Clear DynamoDB (simulate failed migration)
ROLLBACK_MODE=clear \
ROLLBACK_CONFIRM_CLEAR=true \
DYNAMODB_TABLE_NAME=art-management-tool-staging-art-management \
  npm run rollback:migration

# Restore PostgreSQL from backup
ROLLBACK_MODE=restore \
DYNAMODB_TABLE_NAME=art-management-tool-staging-art-management \
  npm run rollback:migration
```

### Rollback verification

| Check | Result |
|-------|--------|
| DynamoDB table cleared | — |
| PostgreSQL restore completed without errors | — |
| Record counts match pre-migration baseline | — |
| Application queries return correct results | — |

---

## 6. Issues Encountered

_Document any issues found during the dry run here._

| # | Severity | Description | Root cause | Solution applied |
|---|----------|-------------|-----------|-----------------|
| — | — | — | — | — |

---

## 7. Final Checklist

### Acceptance criteria

- [ ] Migration completes successfully (exit code 0, all entities migrated)
- [ ] All data validated (record counts match, spot checks pass, relationships intact)
- [ ] Performance acceptable (p(95) within per-service thresholds, error rate < 1 %)
- [ ] Rollback tested (DynamoDB cleared, PostgreSQL restored, data integrity confirmed)
- [ ] No data loss (record counts match before and after rollback)
- [ ] Documented for production (this report completed and signed off)

### Pre-production checklist

- [ ] Staging dry run completed without errors
- [ ] Migration duration measured and within 10-minute target
- [ ] All API endpoints smoke-tested against migrated data
- [ ] Rollback procedure verified end-to-end
- [ ] Pre-migration PostgreSQL backup confirmed readable
- [ ] Production DynamoDB table name confirmed in environment variables
- [ ] Production Lambda environment variables updated (`DYNAMODB_TABLE_NAME`, `AWS_REGION`)
- [ ] Change-freeze window scheduled with stakeholders
- [ ] On-call contacts notified

---

## 8. Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineer | | | |
| Lead / Reviewer | | | |

---

_Generated by Task 11.2: Data Migration Dry Run.  
Update the placeholder values (`—`) with actual measurements before sign-off._
