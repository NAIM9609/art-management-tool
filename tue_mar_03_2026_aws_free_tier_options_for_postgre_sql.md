
## **PHASE 4: API Layer (Lambda Handlers)**

## **PHASE 5: Infrastructure & Deployment**

### **Task 5.1: Create Terraform for Product Service Lambda**

**Objective:** Create Terraform configuration for Product Service infrastructure.

**Files to Create:**
- `infrastructure/services/product-service.tf`
- `infrastructure/services/product-service-api.tf`

**Requirements:**
```hcl
# Create Terraform for Product Service:

1. Lambda Functions (one per handler):
   - product-service-list-products
   - product-service-get-product
   - product-service-create-product
   - product-service-update-product
   - product-service-delete-product
   - product-service-list-categories
   - product-service-get-category
   - product-service-create-category
   - product-service-update-category
   - product-service-delete-category

2. IAM Role:
   - DynamoDB read/write permissions
   - S3 read/write for product images
   - CloudWatch Logs permissions

3. API Gateway Routes:
   - GET /api/products -> list-products
   - GET /api/products/{slug} -> get-product
   - POST /api/products -> create-product
   - PUT /api/products/{id} -> update-product
   - DELETE /api/products/{id} -> delete-product
   - (Similar for categories, variants, images)

4. Environment Variables:
   - DYNAMODB_TABLE_NAME
   - S3_BUCKET_NAME
   - CDN_URL
   - AWS_REGION

5. Lambda Configuration:
   - Runtime: nodejs18.x
   - Timeout: 10 seconds (list), 5 seconds (CRUD)
   - Memory: 256MB (can optimize later)
   - Reserved concurrency: 10 (prevent runaway costs)

6. Outputs:
   - Lambda function ARNs
   - API endpoint URL
```

**Acceptance Criteria:**
- [ ] terraform plan succeeds
- [ ] All Lambda functions created
- [ ] API Gateway routes configured
- [ ] IAM permissions minimal (least privilege)
- [ ] Environment variables set
- [ ] Outputs available

---

### **Task 5.2: Create Terraform for Order Service Lambda**

**Objective:** Create Terraform for Order Service.

**Files to Create:**
- `infrastructure/services/order-service.tf`
- `infrastructure/services/order-service-api.tf`

**Requirements:**
```hcl
# Similar to Product Service, create:

1. Lambda Functions:
   - order-service-create-order
   - order-service-get-order
   - order-service-list-orders
   - order-service-update-status
   - order-service-process-payment

2. Additional Permissions:
   - SES (for order emails - optional)
   - SNS (for notifications - optional)

3. API Routes:
   - POST /api/orders
   - GET /api/orders/{orderNumber}
   - GET /api/admin/orders
   - PATCH /api/admin/orders/{id}/status
   - POST /api/orders/{id}/payment
```

**Acceptance Criteria:**
- [ ] Same as Product Service
- [ ] Payment webhook configured

---

### **Task 5.3: Create Terraform for Cart Service Lambda**

**Objective:** Create Terraform for Cart Service.

**Files to Create:**
- `infrastructure/services/cart-service.tf`
- `infrastructure/services/cart-service-api.tf`

**Requirements:**
```hcl
# Create Cart Service infrastructure:

1. Lambda Functions:
   - cart-service-get-cart
   - cart-service-add-item
   - cart-service-update-quantity
   - cart-service-remove-item
   - cart-service-clear-cart
   - cart-service-apply-discount

2. API Routes:
   - GET /api/cart
   - POST /api/cart/items
   - PATCH /api/cart/items/{id}
   - DELETE /api/cart/items/{id}
   - DELETE /api/cart
   - POST /api/cart/discount
```

**Acceptance Criteria:**
- [ ] Same as other services

---

### **Task 5.4: Create Terraform for Content Service Lambda**

**Objective:** Create Terraform for Content Service (Personaggi, Fumetti).

**Files to Create:**
- `infrastructure/services/content-service.tf`
- `infrastructure/services/content-service-api.tf`

**Requirements:**
```hcl
# Create Content Service infrastructure:

1. Lambda Functions:
   - content-service-list-personaggi
   - content-service-get-personaggio
   - content-service-create-personaggio
   - content-service-update-personaggio
   - content-service-delete-personaggio
   - content-service-list-fumetti
   - content-service-get-fumetto
   - content-service-create-fumetto
   - content-service-update-fumetto
   - content-service-delete-fumetto

2. S3 Permissions:
   - Upload to personaggi/ folder
   - Upload to fumetti/ folder

3. API Routes:
   - /api/personaggi/*
   - /api/fumetti/*
```

**Acceptance Criteria:**
- [ ] Same as other services

---

### **Task 5.5: Create Terraform for Discount, Notification, Audit Services**

**Objective:** Create Terraform for remaining services.

**Files to Create:**
- `infrastructure/services/discount-service.tf`
- `infrastructure/services/notification-service.tf`
- `infrastructure/services/audit-service.tf`

**Requirements:**
```hcl
# Create infrastructure for:

1. Discount Service
2. Notification Service
3. Audit Service

(Similar structure to previous services)
```

**Acceptance Criteria:**
- [ ] All services have infrastructure
- [ ] API routes configured
- [ ] Permissions set

---

### **Task 5.6: Create Integration Service Lambda (Etsy)**

**Objective:** Create Lambda handlers and infrastructure for Etsy integration.

**Files to Create:**
- `backend/services/integration-service/src/handlers/etsy.handler.ts`
- `infrastructure/services/integration-service.tf`

**Requirements:**
```typescript
// Create Etsy integration handlers:

1. OAuth Handlers:
   - initiateOAuth(event) -> GET /api/integrations/etsy/auth
   - handleCallback(event) -> GET /api/integrations/etsy/callback
   - refreshToken(shopId)

2. Sync Handlers:
   - syncProducts(event) -> POST /api/admin/integrations/etsy/sync/products
   - syncInventory(event) -> POST /api/admin/integrations/etsy/sync/inventory
   - syncOrders(event) -> POST /api/admin/integrations/etsy/sync/orders

3. Webhook Handler:
   - handleWebhook(event) -> POST /api/webhooks/etsy

4. Scheduled Sync (optional):
   - EventBridge rule to trigger sync daily
```

**Acceptance Criteria:**
- [ ] OAuth flow working
- [ ] Sync handlers implemented
- [ ] Webhook handling working
- [ ] Scheduled sync configured (optional)

---

### **Task 5.7: Create Monitoring & Cost Alerts**

**Objective:** Set up CloudWatch monitoring and cost alerts.

**Files to Create:**
- `infrastructure/monitoring.tf`
- `infrastructure/alarms.tf`

**Requirements:**
```hcl
# Create monitoring infrastructure:

1. CloudWatch Dashboards:
   - DynamoDB consumed capacity (read/write)
   - Lambda invocations by service
   - Lambda errors by service
   - Lambda duration (p50, p99)
   - API Gateway requests
   - API Gateway 4xx/5xx errors
   - CloudFront data transfer

2. CloudWatch Alarms:
   - DynamoDB consumed capacity > 20 RCU/WCU (approaching free tier)
   - Lambda invocations > 900K/month (90% of free tier)
   - Lambda errors > 1% error rate
   - API Gateway 5xx errors > 5%
   - CloudFront data transfer > 45GB/month

3. SNS Topic:
   - Email notifications for alarms
   - Subscribe admin email

4. Cost Allocation Tags:
   - Service: product-service, order-service, etc.
   - Environment: production
   - Project: art-management
```

**Acceptance Criteria:**
- [ ] Dashboard created and visible
- [ ] All alarms configured
- [ ] SNS topic created
- [ ] Email notifications working
- [ ] Tags applied to all resources

---

## **PHASE 6: Data Migration**

### **Task 6.1: Create PostgreSQL to DynamoDB Migration Script**

**Objective:** Create script to migrate all data from PostgreSQL to DynamoDB.

**Files to Create:**
- `backend/scripts/migrate-to-dynamodb.ts`
- `backend/scripts/validate-migration.ts`
- `backend/scripts/rollback-migration.ts`

**Requirements:**
```typescript
// Create migration script:

1. Migration Order (respect foreign keys):
   - Categories (no dependencies)
   - Products
   - ProductVariants
   - ProductImages
   - Product-Category links
   - Personaggi
   - Fumetti
   - DiscountCodes
   - Carts
   - CartItems
   - Orders
   - OrderItems
   - Notifications
   - AuditLogs
   - Etsy data (tokens, products, receipts, config)

2. For each entity:
   - Fetch all from PostgreSQL (including soft-deleted)
   - Transform to DynamoDB format
   - Batch write to DynamoDB (25 items at a time)
   - Log progress
   - Handle errors

3. Preserve:
   - IDs (use same IDs)
   - Timestamps (created_at, updated_at, deleted_at)
   - Relationships
   - Soft deletes

4. Validation after migration:
   - Count records in both databases
   - Spot-check random records
   - Verify relationships
   - Test queries

5. Rollback capability:
   - Backup PostgreSQL before migration
   - Script to restore if needed
   - Script to clear DynamoDB if needed
```

**Acceptance Criteria:**
- [ ] All entities migrated
- [ ] Record counts match
- [ ] Spot checks pass
- [ ] Relationships intact
- [ ] Timestamps preserved
- [ ] Soft deletes preserved
- [ ] Migration completes < 10 minutes
- [ ] Rollback script tested

**Testing:**
```bash
# Test migration
npm run migrate:test  # Against DynamoDB Local

# Run production migration
npm run migrate:production

# Validate
npm run validate:migration

# Rollback if needed
npm run rollback:migration
```

---

## **PHASE 7: Frontend Optimizations**

### **Task 7.1: Create Frontend Image Cache Manager**

**Objective:** Implement IndexedDB-based image caching in frontend.

**Files to Create:**
- `frontend/utils/imageCache.ts`
- `frontend/components/OptimizedImage.tsx`
- `frontend/hooks/useImagePreload.ts`

**Requirements:**
```typescript
// Create ImageCacheManager class:

1. Methods:
   - init() - Initialize IndexedDB
   - getImage(url) - Get from cache or fetch
   - cacheImage(url, blob, etag) - Store in cache
   - clearOldCache() - Delete expired entries
   - preloadImages(urls[]) - Preload critical images
   - getCacheSize() - Calculate total cache size
   - clearCache() - Clear all cached images

2. Configuration:
   - Max cache size: 50MB
   - Cache duration: 7 days
   - IndexedDB database: 'art-management-image-cache'
   - Store: 'images'

3. OptimizedImage Component:
   - Props: src, alt, className, width, height
   - Use imageCache.getImage()
   - Show loading skeleton while loading
   - Lazy load with Intersection Observer
   - Support WebP/AVIF with Accept header

4. useImagePreload Hook:
   - Preload images on route change
   - Priority queue for critical images
   - Cancel preload on unmount

5. Cache Strategy:
   - Cache on first load
   - Serve from cache on subsequent loads
   - Revalidate with ETag
   - Update cache if ETag changed
```

**Acceptance Criteria:**
- [ ] IndexedDB initialized correctly
- [ ] Images cached on first load
- [ ] Subsequent loads from cache (no network)
- [ ] Cache cleared after 7 days
- [ ] Cache size limited to 50MB
- [ ] OptimizedImage component working
- [ ] Lazy loading working
- [ ] WebP/AVIF support working
- [ ] Unit tests for cache manager

---

### **Task 7.2: Update Frontend to Use OptimizedImage**

**Objective:** Replace all `<img>` tags with `<OptimizedImage>` component.

**Files to Modify:**
- `frontend/app/[locale]/shop/page.tsx`
- `frontend/app/[locale]/shop/[slug]/page.tsx`
- `frontend/app/[locale]/personaggi/page.tsx`
- `frontend/app/[locale]/personaggi/[id]/page.tsx`
- `frontend/app/[locale]/fumetti/page.tsx`
- `frontend/components/ProductCard.tsx`
- `frontend/components/PersonaggioCard.tsx`
- (All other components with images)

**Requirements:**
```typescript
// Replace all image rendering:

1. Find all <img> tags
2. Replace with <OptimizedImage>
3. Add loading="lazy"
4. Add proper alt text
5. Add width/height for layout stability

6. Preload critical images:
   - Hero images
   - Above-the-fold product images
   - Navigation icons

7. Update next.config.ts:
   - Configure image domains
   - Enable WebP/AVIF optimization
```

**Acceptance Criteria:**
- [ ] All images using OptimizedImage
- [ ] No layout shift on image load
- [ ] Lazy loading working
- [ ] Cache working (verify in DevTools)
- [ ] Page load time improved
- [ ] No console errors

---

### **Task 7.3: Update Frontend API Client for New Backend**

**Objective:** Update frontend API services to work with Lambda backend.

**Files to Modify:**
- `frontend/services/ShopAPIService.ts`
- `frontend/services/PersonaggiAPIService.ts`
- `frontend/services/FumettiAPIService.ts`
- `frontend/services/DiscountAPIService.ts`
- `frontend/services/CategoryAPIService.ts`

**Requirements

## @NAIM9609

sorry but from part 7 and so on is missing

## Copilot

# **Agent Task Breakdown - CONTINUATION**

## **PHASE 7: Frontend Optimizations (Continued)**

### **Task 7.3: Update Frontend API Client for New Backend**

**Objective:** Update frontend API services to work with Lambda backend.

**Files to Modify:**
- `frontend/services/ShopAPIService.ts`
- `frontend/services/PersonaggiAPIService.ts`
- `frontend/services/FumettiAPIService.ts`
- `frontend/services/DiscountAPIService.ts`
- `frontend/services/CategoryAPIService.ts`

**Requirements:**
```typescript
// Update API services:

1. Update base URL to API Gateway endpoint:
   - Use environment variable: NEXT_PUBLIC_API_URL
   - Example: https://xxxxx.execute-api.eu-west-1.amazonaws.com/prod

2. Handle pagination with lastEvaluatedKey:
   - Old: page numbers
   - New: lastEvaluatedKey tokens
   - Update getAllProducts(), getAllPersonaggi(), etc.

3. Update error handling:
   - Lambda returns different error format
   - Handle API Gateway errors (400, 401, 403, 404, 500)

4. Add retry logic:
   - Retry on 5xx errors (max 3 attempts)
   - Exponential backoff

5. Add request/response logging:
   - Log API calls in development
   - Track performance metrics

6. Cache API responses:
   - Use SWR or React Query
   - Cache products for 5 minutes
   - Cache personaggi/fumetti for 10 minutes
   - Invalidate on mutations

7. Update methods:
   ShopAPIService:
   - getAllProducts({ status, limit, lastKey })
   - getProductBySlug(slug)
   - searchProducts(term, { limit, lastKey })
   
   PersonaggiAPIService:
   - getAllPersonaggi() - no pagination (small dataset)
   - getPersonaggio(id)
   
   DiscountAPIService:
   - validateDiscount(code, cartTotal)
```

**Acceptance Criteria:**
- [ ] All API calls work with new backend
- [ ] Pagination working with tokens
- [ ] Error handling comprehensive
- [ ] Retry logic working
- [ ] Response caching implemented
- [ ] No breaking changes to components
- [ ] Integration tests pass

---

### **Task 7.4: Implement Service Worker for Offline Support**

**Objective:** Create service worker for offline caching and PWA support.

**Files to Create:**
- `frontend/public/sw.js`
- `frontend/utils/serviceWorkerRegistration.ts`
- `frontend/app/manifest.json`

**Requirements:**
```javascript
// Service Worker features:

1. Cache Strategies:
   - API responses: Network-first, fallback to cache
   - Images: Cache-first (already handled by imageCache)
   - Static assets: Cache-first
   - HTML: Network-first

2. Background Sync:
   - Queue cart updates when offline
   - Sync when connection restored

3. Precache:
   - App shell (layout, navigation)
   - Critical CSS/JS
   - Logo and icons

4. Cache Management:
   - Max cache age: 7 days
   - Max cache size: 100MB
   - Clear old caches on update

5. Offline Fallback:
   - Show offline page when no connection
   - Queue mutations for later

6. PWA Manifest:
   - App name, icons, colors
   - Display: standalone
   - Start URL: /
```

**Acceptance Criteria:**
- [ ] Service worker registered
- [ ] Offline page working
- [ ] API cache working
- [ ] Background sync working
- [ ] PWA installable
- [ ] Cache cleared on app update

---

### **Task 7.5: Add Performance Monitoring**

**Objective:** Implement performance monitoring and analytics.

**Files to Create:**
- `frontend/utils/performance.ts`
- `frontend/utils/analytics.ts`
- `frontend/components/PerformanceMonitor.tsx`

**Requirements:**
```typescript
// Performance monitoring:

1. Web Vitals:
   - Track LCP (Largest Contentful Paint)
   - Track FID (First Input Delay)
   - Track CLS (Cumulative Layout Shift)
   - Track TTFB (Time to First Byte)
   - Send to analytics

2. Custom Metrics:
   - API response times
   - Image load times
   - Cache hit rate
   - Page load time by route

3. Error Tracking:
   - Track uncaught errors
   - Track API errors
   - Track console errors
   - Send error reports

4. Analytics Events:
   - Product views
   - Add to cart
   - Checkout initiated
   - Order completed
   - Search queries

5. Send to:
   - Google Analytics 4 (optional)
   - CloudWatch RUM (AWS)
   - Custom endpoint for aggregation

6. Privacy:
   - Respect Do Not Track
   - No PII in events
   - GDPR compliant
```

**Acceptance Criteria:**
- [ ] Web Vitals tracked
- [ ] Custom metrics tracked
- [ ] Errors reported
- [ ] Analytics events firing
- [ ] Privacy controls working
- [ ] CloudWatch RUM integrated

---

## **PHASE 8: Testing & Quality Assurance**

### **Task 8.1: Create Integration Tests for Product Service**

**Objective:** Create comprehensive integration tests for Product Service.

**Files to Create:**
- `backend/services/product-service/src/__tests__/integration/product.integration.test.ts`
- `backend/services/product-service/src/__tests__/integration/variant.integration.test.ts`
- `backend/services/product-service/src/__tests__/integration/category.integration.test.ts`

**Requirements:**
```typescript
// Integration tests using DynamoDB Local:

1. Setup:
   - Start DynamoDB Local before tests
   - Create test table
   - Seed test data
   - Clean up after tests

2. Product Tests:
   - Create product with variants and images
   - Get product by slug
   - List products with pagination
   - Update product
   - Soft delete product
   - Search products

3. Variant Tests:
   - Create variant
   - Update stock atomically
   - Prevent stock below 0
   - Batch create variants

4. Category Tests:
   - Create category hierarchy
   - Get child categories
   - Add product to category
   - Query products by category

5. Edge Cases:
   - Duplicate slug
   - Invalid product ID
   - Soft-deleted products not returned
   - Pagination edge cases
   - Concurrent stock updates

6. Performance Tests:
   - Batch create 100 products < 5 seconds
   - Query 1000 products < 2 seconds
   - Batch get 100 items < 1 second
```

**Acceptance Criteria:**
- [ ] All CRUD operations tested
- [ ] Relationships tested
- [ ] Edge cases covered
- [ ] Performance benchmarks met
- [ ] Tests run in CI/CD
- [ ] Coverage > 85%

---

### **Task 8.2: Create Integration Tests for Order Service**

**Objective:** Create integration tests for Order Service.

**Files to Create:**
- `backend/services/order-service/src/__tests__/integration/order.integration.test.ts`

**Requirements:**
```typescript
// Order Service integration tests:

1. Order Creation:
   - Create order with items
   - Stock decremented atomically
   - Order number generated correctly
   - Totals calculated correctly

2. Order Queries:
   - Get order by order number
   - Get orders by customer email
   - Get orders by status
   - Pagination working

3. Order Updates:
   - Update status
   - Process payment
   - Add tracking number

4. Edge Cases:
   - Insufficient stock
   - Invalid discount code
   - Concurrent order creation
   - Transaction rollback

5. Performance:
   - Create order < 500ms
   - Query orders < 200ms
```

**Acceptance Criteria:**
- [ ] All scenarios tested
- [ ] Transactions working correctly
- [ ] Stock management tested
- [ ] Performance benchmarks met
- [ ] Coverage > 85%

---

### **Task 8.3: Create Integration Tests for Cart Service**

**Objective:** Create integration tests for Cart Service.

**Files to Create:**
- `backend/services/cart-service/src/__tests__/integration/cart.integration.test.ts`

**Requirements:**
```typescript
// Cart Service integration tests:

1. Cart Operations:
   - Create cart
   - Add items
   - Update quantity
   - Remove items
   - Clear cart

2. Cart Merge:
   - Merge session cart into user cart
   - Handle duplicate items
   - Preserve quantities

3. Discount:
   - Apply valid discount
   - Reject invalid discount
   - Calculate discount correctly

4. TTL:
   - Cart expires after 30 days
   - TTL refreshed on activity

5. Stock Validation:
   - Cannot add more than available stock
   - Stock checked on add/update
```

**Acceptance Criteria:**
- [ ] All cart operations tested
- [ ] Merge logic tested
- [ ] Discount validation tested
- [ ] TTL tested
- [ ] Coverage > 85%

---

### **Task 8.4: Create E2E Tests for Frontend**

**Objective:** Create end-to-end tests for critical user flows.

**Files to Create:**
- `frontend/e2e/shop.spec.ts`
- `frontend/e2e/cart.spec.ts`
- `frontend/e2e/checkout.spec.ts`
- `frontend/e2e/personaggi.spec.ts`
- `playwright.config.ts`

**Requirements:**
```typescript
// E2E tests using Playwright:

1. Shop Flow:
   - Browse products
   - View product details
   - Search products
   - Filter by category
   - Pagination

2. Cart Flow:
   - Add product to cart
   - Update quantity
   - Remove item
   - Apply discount code
   - View cart totals

3. Checkout Flow:
   - Enter shipping info
   - Enter billing info
   - Select payment method
   - Complete order
   - View order confirmation

4. Personaggi Flow:
   - View all personaggi
   - View personaggio details
   - Image gallery navigation

5. Admin Flow (optional):
   - Login
   - Create product
   - Update product
   - Delete product

6. Performance:
   - Page load < 3 seconds
   - Navigation < 1 second
   - Image load < 2 seconds
```

**Acceptance Criteria:**
- [ ] All critical flows tested
- [ ] Tests run in CI/CD
- [ ] Screenshots on failure
- [ ] Video recording on failure
- [ ] Performance assertions pass
- [ ] Cross-browser tested (Chrome, Firefox, Safari)

---

### **Task 8.5: Create Load Tests**

**Objective:** Create load tests to verify system can handle traffic within free tier.

**Files to Create:**
- `tests/load/products.load.test.js`
- `tests/load/orders.load.test.js`
- `tests/load/cart.load.test.js`
- `k6-config.js`

**Requirements:**
```javascript
// Load tests using k6:

1. Product Service:
   - 100 VUs (virtual users)
   - 1000 requests/minute
   - 95% < 500ms response time
   - 0% error rate

2. Order Service:
   - 50 VUs
   - 500 requests/minute
   - 95% < 1000ms
   - 0% error rate

3. Cart Service:
   - 200 VUs
   - 2000 requests/minute
   - 95% < 300ms
   - 0% error rate

4. Test Scenarios:
   - Gradual ramp-up (0 to max VUs in 2 minutes)
   - Sustained load (5 minutes at max)
   - Spike test (sudden 5x traffic)
   - Soak test (1 hour at 50% load)

5. Metrics:
   - Response times (p50, p95, p99)
   - Throughput (req/s)
   - Error rate
   - DynamoDB consumed capacity
   - Lambda concurrent executions

6. Free Tier Validation:
   - Ensure < 900K Lambda invocations/month
   - Ensure < 20 RCU/WCU on DynamoDB
   - Monitor costs during test
```

**Acceptance Criteria:**
- [ ] Load tests pass performance benchmarks
- [ ] No errors under load
- [ ] Free tier limits not exceeded
- [ ] Auto-scaling working correctly
- [ ] Load test results documented

---

### **Task 8.6: Create Security Tests**

**Objective:** Create security tests for API endpoints.

**Files to Create:**
- `tests/security/authentication.test.ts`
- `tests/security/authorization.test.ts`
- `tests/security/input-validation.test.ts`
- `tests/security/sql-injection.test.ts`

**Requirements:**
```typescript
// Security tests:

1. Authentication Tests:
   - Admin endpoints require valid JWT
   - Invalid JWT rejected
   - Expired JWT rejected
   - Missing JWT rejected

2. Authorization Tests:
   - Regular users cannot access admin endpoints
   - Users can only access their own data
   - Role-based access control working

3. Input Validation:
   - XSS attacks blocked
   - SQL injection blocked (N/A for DynamoDB)
   - NoSQL injection blocked
   - Path traversal blocked
   - File upload validation

4. Rate Limiting:
   - API rate limits enforced
   - Brute force protection
   - DDoS protection

5. Data Sanitization:
   - HTML escaped in responses
   - JavaScript escaped
   - SQL escaped (if any)

6. HTTPS:
   - All endpoints HTTPS only
   - Secure cookies
   - HSTS headers

7. OWASP Top 10:
   - Test for common vulnerabilities
   - Broken authentication
   - Sensitive data exposure
   - XXE attacks
   - Security misconfiguration
```

**Acceptance Criteria:**
- [ ] All security tests pass
- [ ] No vulnerabilities found
- [ ] OWASP Top 10 covered
- [ ] Penetration test passed (optional)
- [ ] Security audit passed (optional)

---

## **PHASE 9: Deployment & DevOps**

### **Task 9.1: Create CI/CD Pipeline**

**Objective:** Set up GitHub Actions for automated testing and deployment.

**Files to Create:**
- `.github/workflows/test.yml`
- `.github/workflows/deploy-infrastructure.yml`
- `.github/workflows/deploy-product-service.yml`
- `.github/workflows/deploy-order-service.yml`
- `.github/workflows/deploy-cart-service.yml`
- `.github/workflows/deploy-content-service.yml`
- `.github/workflows/deploy-discount-service.yml`
- `.github/workflows/deploy-notification-service.yml`
- `.github/workflows/deploy-audit-service.yml`
- `.github/workflows/deploy-integration-service.yml`

**Requirements:**
```yaml
# CI/CD Pipeline:

1. Test Workflow (on every PR):
   - Checkout code
   - Setup Node.js 18
   - Install dependencies
   - Run linter (ESLint)
   - Run type checking (TypeScript)
   - Run unit tests
   - Run integration tests
   - Upload coverage to Codecov
   - Fail PR if < 80% coverage

2. Infrastructure Deployment (manual trigger):
   - Checkout code
   - Setup Terraform
   - terraform init
   - terraform plan
   - Require approval
   - terraform apply
   - Output endpoint URLs

3. Service Deployment Workflows (on merge to main):
   - Checkout code
   - Install dependencies
   - Build service (npm run build)
   - Run tests
   - Package Lambda (zip)
   - Upload to S3
   - Update Lambda function code
   - Run smoke tests
   - Rollback on failure

4. Deployment Order:
   - Infrastructure first
   - Services in parallel (independent)
   - Frontend last (after API stable)

5. Secrets Management:
   - Store in GitHub Secrets:
     - AWS_ACCESS_KEY_ID
     - AWS_SECRET_ACCESS_KEY
     - JWT_SECRET
     - ETSY_API_KEY
     - ETSY_API_SECRET
   - Never commit secrets to repo

6. Environments:
   - Development (auto-deploy on PR merge)
   - Staging (manual deploy)
   - Production (manual deploy with approval)

7. Notifications:
   - Slack notification on deployment
   - Email on deployment failure
```

**Acceptance Criteria:**
- [ ] All workflows created
- [ ] Tests run automatically on PR
- [ ] Deployment requires approval
- [ ] Secrets stored securely
- [ ] Rollback working
- [ ] Notifications working
- [ ] Blue/green deployment (optional)

---

### **Task 9.2: Create Deployment Scripts**

**Objective:** Create helper scripts for manual deployment.

**Files to Create:**
- `scripts/deploy-all.sh`
- `scripts/deploy-service.sh`
- `scripts/deploy-infrastructure.sh`
- `scripts/rollback.sh`
- `scripts/logs.sh`

**Requirements:**
```bash
# Deployment scripts:

1. deploy-all.sh:
   - Deploy infrastructure
   - Deploy all services
   - Run smoke tests
   - Display endpoints

2. deploy-service.sh <service-name>:
   - Build specific service
   - Package Lambda
   - Update Lambda function
   - Run service-specific tests

3. deploy-infrastructure.sh:
   - terraform init
   - terraform plan
   - Ask for confirmation
   - terraform apply
   - Save outputs

4. rollback.sh <service-name> <version>:
   - Get previous Lambda version
   - Update Lambda to previous version
   - Verify rollback

5. logs.sh <service-name>:
   - Tail CloudWatch logs
   - Filter by log level
   - Follow mode

6. smoke-test.sh:
   - Test all API endpoints
   - Verify responses
   - Report failures

Usage:
./scripts/deploy-service.sh product
./scripts/rollback.sh product v123
./scripts/logs.sh product --follow
```

**Acceptance Criteria:**
- [ ] All scripts executable
- [ ] Error handling in scripts
- [ ] Progress indicators
- [ ] Color-coded output
- [ ] Confirmation prompts for destructive actions
- [ ] Documentation in README

---

### **Task 9.3: Create Database Backup & Restore Scripts**

**Objective:** Create scripts for DynamoDB backup and restore.

**Files to Create:**
- `scripts/backup-dynamodb.sh`
- `scripts/restore-dynamodb.sh`
- `scripts/export-to-s3.sh`
- `scripts/validate-backup.sh`

**Requirements:**
```bash
# Backup scripts:

1. backup-dynamodb.sh:
   - Create on-demand backup
   - Name: ArtManagementTable-YYYY-MM-DD-HH-MM
   - Tag with timestamp
   - Store backup ARN
   - Verify backup completion

2. restore-dynamodb.sh <backup-arn>:
   - Create new table from backup
   - Restore GSIs
   - Verify data integrity
   - Switch traffic to new table (manual)

3. export-to-s3.sh:
   - Export DynamoDB to S3 (JSON format)
   - Compress with gzip
   - Store in s3://backups/dynamodb/YYYY/MM/DD/
   - Set lifecycle policy (delete after 90 days)

4. validate-backup.sh <backup-arn>:
   - Restore to temp table
   - Count records
   - Spot-check data
   - Delete temp table

5. Automated Backups:
   - Point-in-time recovery enabled (35 days)
   - Daily on-demand backup (EventBridge + Lambda)
   - Weekly export to S3
   - Monthly archive to Glacier

Usage:
./scripts/backup-dynamodb.sh
./scripts/restore-dynamodb.sh arn:aws:dynamodb:...
./scripts/validate-backup.sh arn:aws:dynamodb:...
```

**Acceptance Criteria:**
- [ ] Backups created successfully
- [ ] Restore working correctly
- [ ] Validation script working
- [ ] Automated backups scheduled
- [ ] Backup retention configured
- [ ] S3 lifecycle policies set

---

### **Task 9.4: Create Health Check & Monitoring Dashboard**

**Objective:** Create health check endpoints and monitoring dashboard.

**Files to Create:**
- `backend/services/product-service/src/handlers/health.handler.ts`
- `backend/shared/utils/health-check.ts`
- `infrastructure/health-checks.tf`
- `dashboards/cloudwatch-dashboard.json`

**Requirements:**
```typescript
// Health check system:

1. Health Check Endpoints (each service):
   - GET /health
   - Returns:
     {
       status: "healthy" | "degraded" | "unhealthy",
       service: "product-service",
       version: "1.0.0",
       timestamp: "2026-02-10T12:00:00Z",
       checks: {
         dynamodb: "healthy",
         s3: "healthy",
         external_api: "degraded"
       },
       uptime: 86400
     }

2. Health Check Logic:
   - DynamoDB: Query test item
   - S3: List bucket (if service uses S3)
   - External APIs: Ping endpoint
   - Memory: Check available memory
   - Timeout: 5 seconds max

3. Route 53 Health Checks:
   - Monitor /health endpoint
   - Check interval: 30 seconds
   - Failure threshold: 3
   - Send SNS notification on failure

4. CloudWatch Dashboard:
   - Service health status
   - API Gateway metrics
   - Lambda metrics
   - DynamoDB metrics
   - Error rates
   - Latency graphs

5. Synthetic Monitoring:
   - CloudWatch Synthetics canary
   - Test critical user flows every 5 minutes
   - Alert on failures
```

**Acceptance Criteria:**
- [ ] Health endpoints implemented for all services
- [ ] Route 53 health checks configured
- [ ] CloudWatch dashboard created
- [ ] Canary tests running
- [ ] Alerts configured
- [ ] Health status visible in dashboard

---

## **PHASE 10: Documentation & Handoff**

### **Task 10.1: Create Architecture Documentation**

**Objective:** Document the complete system architecture.

**Files to Create:**
- `docs/ARCHITECTURE.md`
- `docs/DYNAMODB_SCHEMA.md`
- `docs/API_REFERENCE.md`
- `docs/DEPLOYMENT.md`
- `docs/diagrams/architecture.png`
- `docs/diagrams/data-model.png`
- `docs/diagrams/deployment.png`

**Requirements:**
```markdown
# Architecture Documentation:

1. ARCHITECTURE.md:
   - System overview
   - Microservices architecture
   - Tech stack
   - AWS services used
   - Data flow diagrams
   - Request lifecycle
   - Caching strategy
   - Security architecture

2. DYNAMODB_SCHEMA.md:
   - Table structure
   - Primary key design
   - GSI design
   - Access patterns
   - Query examples
   - Cost optimization strategies
   - Single-table design rationale

3. API_REFERENCE.md:
   - All API endpoints
   - Request/response formats
   - Authentication
   - Error codes
   - Rate limits
   - Pagination
   - Examples with curl

4. DEPLOYMENT.md:
   - Prerequisites
   - Environment setup
   - Deployment steps
   - Rollback procedures
   - Troubleshooting
   - CI/CD pipeline

5. Diagrams:
   - Architecture diagram (draw.io)
   - Data model (ER diagram)
   - Deployment diagram
   - Sequence diagrams for critical flows
```

**Acceptance Criteria:**
- [ ] All documentation complete
- [ ] Diagrams created and embedded
- [ ] Code examples tested
- [ ] Links working
- [ ] Reviewed by team
- [ ] Published to docs site (optional)

---

### **Task 10.2: Create Developer Guide**

**Objective:** Create guide for developers working on the project.

**Files to Create:**
- `docs/DEVELOPER_GUIDE.md`
- `docs/CONTRIBUTING.md`
- `docs/CODING_STANDARDS.md`
- `docs/TESTING_GUIDE.md`

**Requirements:**
```markdown
# Developer Guide:

1. DEVELOPER_GUIDE.md:
   - Local development setup
   - Running locally (DynamoDB Local)
   - Environment variables
   - Directory structure
   - Adding new features
   - Debugging tips
   - Common issues

2. CONTRIBUTING.md:
   - How to contribute
   - PR process
   - Code review checklist
   - Branching strategy (Git Flow)
   - Commit message format
   - Issue templates

3. CODING_STANDARDS.md:
   - TypeScript style guide
   - Naming conventions
   - File organization
   - Error handling patterns
   - Logging standards
   - Security best practices

4. TESTING_GUIDE.md:
   - Writing unit tests
   - Writing integration tests
   - Writing E2E tests
   - Running tests locally
   - Mocking DynamoDB
   - Test data management
   - Coverage requirements
```

**Acceptance Criteria:**
- [ ] All guides complete
- [ ] Examples included
- [ ] Reviewed by developers
- [ ] Easy to follow
- [ ] Up to date

---

### **Task 10.3: Create Operations Runbook**

**Objective:** Create runbook for operations and troubleshooting.

**Files to Create:**
- `docs/OPERATIONS_RUNBOOK.md`
- `docs/TROUBLESHOOTING.md`
- `docs/MONITORING.md`
- `docs/INCIDENT_RESPONSE.md`

**Requirements:**
```markdown
# Operations Runbook:

1. OPERATIONS_RUNBOOK.md:
   - Daily operations checklist
   - Weekly maintenance tasks
   - Monthly reviews
   - Scaling procedures
   - Backup verification
   - Cost monitoring

2. TROUBLESHOOTING.md:
   - Common issues and solutions
   - Lambda timeout issues
   - DynamoDB throttling
   - API Gateway errors
   - S3 upload failures
   - Diagnostic commands
   - Log analysis

3. MONITORING.md:
   - Metrics to monitor
   - Alert thresholds
   - Dashboard usage
   - Log analysis tools
   - Cost monitoring tools
   - Performance baselines

4. INCIDENT_RESPONSE.md:
   - Incident severity levels
   - Response procedures
   - Escalation path
   - Communication plan
   - Post-incident review
   - Root cause analysis template
```

**Acceptance Criteria:**
- [ ] Runbook complete
- [ ] Troubleshooting scenarios documented
- [ ] Tested procedures
- [ ] Contact information updated
- [ ] Reviewed by ops team

---

### **Task 10.4: Create Cost Optimization Guide**

**Objective:** Document cost optimization strategies and monitoring.

**Files to Create:**
- `docs/COST_OPTIMIZATION.md`
- `docs/FREE_TIER_MONITORING.md`
- `scripts/cost-report.sh`

**Requirements:**
```markdown
# Cost Optimization Guide:

1. COST_OPTIMIZATION.md:
   - AWS Free Tier limits
   - Current usage vs limits
   - Cost optimization strategies:
     - DynamoDB on-demand vs provisioned
     - Lambda memory optimization
     - CloudFront cache settings
     - S3 lifecycle policies
     - Reserved concurrency settings
   - Cost allocation tags
   - Budget alerts

2. FREE_TIER_MONITORING.md:
   - How to check free tier usage
   - Billing dashboard setup
   - Cost Explorer queries
   - CloudWatch metrics for costs
   - Automated cost reports
   - Alert configuration

3. cost-report.sh:
   - Query AWS Cost Explorer
   - Show costs by service
   - Compare to free tier limits
   - Show trending
   - Export to CSV

4. Cost Projection:
   - Monthly cost estimate
   - Yearly cost estimate
   - Growth scenarios
   - Breaking point (when free tier exceeded)
```

**Acceptance Criteria:**
- [ ] All cost optimization strategies documented
- [ ] Free tier monitoring setup
- [ ] Cost report script working
- [ ] Budget alerts configured
- [ ] Team trained on cost monitoring

---

### **Task 10.5: Create Migration Playbook**

**Objective:** Document the complete migration process.

**Files to Create:**
- `docs/MIGRATION_PLAYBOOK.md`
- `docs/MIGRATION_CHECKLIST.md`
- `docs/ROLLBACK_PLAN.md`
- `docs/POST_MIGRATION_VALIDATION.md`

**Requirements:**
```markdown
# Migration Playbook:

1. MIGRATION_PLAYBOOK.md:
   - Pre-migration checklist
   - Step-by-step migration guide
   - Estimated timeline
   - Team responsibilities
   - Communication plan
   - Backup procedures
   - Testing procedures
   - Go-live plan

2. MIGRATION_CHECKLIST.md:
   □ Backup PostgreSQL database
   □ Deploy DynamoDB infrastructure
   □ Deploy Lambda functions
   □ Run migration script
   □ Validate data migration
   □ Deploy frontend changes
   □ Update DNS (if needed)
   □ Test all critical flows
   □ Monitor for 24 hours
   □ Decommission old infrastructure

3. ROLLBACK_PLAN.md:
   - Rollback triggers (when to rollback)
   - Rollback procedures
   - Data sync back to PostgreSQL
   - DNS revert
   - Communication plan
   - Timeline

4. POST_MIGRATION_VALIDATION.md:
   - Data integrity checks
   - Functionality tests
   - Performance benchmarks
   - Cost verification
   - User acceptance testing
   - Monitoring validation
```

**Acceptance Criteria:**
- [ ] Playbook complete and detailed
- [ ] Checklist covers all steps
- [ ] Rollback plan tested
- [ ] Validation criteria defined
- [ ] Team reviewed and approved

---

### **Task 10.6: Create README and Getting Started**

**Objective:** Update project README with new architecture.

**Files to Modify:**
- `README.md`
- `backend/README.md`
- `frontend/README.md`
- `infrastructure/README.md`

**Requirements:**
```markdown
# README.md updates:

1. Project Overview:
   - Brief description
   - Architecture (serverless, microservices)
   - Tech stack
   - Features

2. Quick Start:
   - Prerequisites
   - Installation steps
   - Running locally
   - Running tests
   - Deployment

3. Project Structure:
   backend/
     services/
       product-service/
       order-service/
       cart-service/
       ...
     shared/
   frontend/
   infrastructure/
   docs/
   scripts/

4. Environment Variables:
   - List all required env vars
   - Example .env file
   - How to get values

5. Development:
   - Local setup with DynamoDB Local
   - Running services locally
   - Debugging
   - Testing

6. Deployment:
   - Prerequisites (AWS account, Terraform)
   - Deployment commands
   - CI/CD pipeline

7. Contributing:
   - Link to CONTRIBUTING.md
   - PR process
   - Code standards

8. License:
   - MIT License

9. Links:
   - Documentation
   - API Reference
   - Issue Tracker
   - Changelog
```

**Acceptance Criteria:**
- [ ] README comprehensive
- [ ] Quick start working
- [ ] All links functional
- [ ] Screenshots included
- [ ] Badges added (build status, coverage)
- [ ] Table of contents

---

## **PHASE 11: Final Validation & Go-Live**

### **Task 11.1: Run Full System Test**

**Objective:** Execute complete system test before go-live.

**Files to Create:**
- `tests/system/full-system-test.ts`
- `tests/system/smoke-test.ts`

**Requirements:**
```typescript
// Full system test:

1. Test all services:
   - Product service (CRUD, search, pagination)
   - Order service (create, query, update)
   - Cart service (add, update, remove, discount)
   - Content service (personaggi, fumetti)
   - Discount service (validate, usage)
   - Notification service (create, read)
   - Audit service (log, query)
   - Integration service (Etsy sync)

2. Test all integrations:
   - Frontend → API Gateway
   - Lambda → DynamoDB
   - Lambda → S3
   - S3 → CloudFront
   - Etsy API integration
   - Email notifications

3. Test all user flows:
   - Browse products
   - Add to cart
   - Apply discount
   - Checkout
   - Order confirmation
   - View personaggi
   - Admin operations

4. Performance validation:
   - All endpoints < target latency
   - No errors
   - DynamoDB within limits
   - Lambda within limits
   - CloudFront working

5. Security validation:
   - HTTPS only
   - Auth working
   - CORS configured
   - CSP headers
   - No exposed secrets

6. Smoke test (quick health check):
   - All services responding
   - All health endpoints green
   - Critical flows working
```

**Acceptance Criteria:**
- [ ] All tests passing
- [ ] No errors in logs
- [ ] Performance targets met
- [ ] Security checks passed
- [ ] Smoke test < 5 minutes
- [ ] Results documented

---

### **Task 11.2: Data Migration Dry Run**

**Objective:** Execute complete data migration in staging environment.

**Requirements:**
```typescript
// Migration dry run:

1. Setup staging environment:
   - Clone production PostgreSQL to staging
   - Deploy DynamoDB staging table
   - Deploy Lambda staging functions

2. Run migration:
   - Execute migration script
   - Time the migration
   - Log all operations
   - Capture any errors

3. Validate migration:
   - Run validation script
   - Compare record counts
   - Spot-check data integrity
   - Test queries
   - Test all API endpoints

4. Performance test:
   - Run load tests against staging
   - Verify within limits

5. Rollback test:
   - Execute rollback procedure
   - Verify PostgreSQL restored
   - Verify data integrity

6. Document findings:
   - Migration duration
   - Issues encountered
   - Solutions applied
   - Final checklist updates
```

**Acceptance Criteria:**
- [ ] Migration completes successfully
- [ ] All data validated
- [ ] Performance acceptable
- [ ] Rollback tested
- [ ] No data loss
- [ ] Documented for production

---

### **Task 11.3: Production Migration Execution**

**Objective:** Execute production migration.

**Requirements:**
```bash
# Production migration:

1. Pre-migration:
   □ Announce maintenance window
   □ Enable maintenance mode on frontend
   □ Backup PostgreSQL database
   □ Verify backups valid
   □ Team on standby

2. Migration:
   □ Start migration script
   □ Monitor progress
   □ Log all operations
   □ Handle any errors

3. Validation:
   □ Run validation script
   □ Verify record counts
   □ Test critical flows
   □ Check API endpoints
   □ Review logs

4. Cutover:
   □ Update frontend API URL
   □ Deploy frontend changes
   □ Update DNS if needed
   □ Disable maintenance mode
   □ Announce completion

5. Post-migration:
   □ Monitor for 24 hours
   □ Watch error rates
   □ Watch performance
   □ Watch costs
   □ Be ready to rollback

6. Cleanup:
   □ Keep PostgreSQL backup for 30 days
   □ Document lessons learned
   □ Update runbooks
```

**Acceptance Criteria:**
- [ ] Migration successful
- [ ] Zero data loss
- [ ] All systems operational
- [ ] Users can access site
- [ ] No critical errors
- [ ] Performance acceptable
- [ ] Costs within budget

---

### **Task 11.4: Post-Migration Monitoring**

**Objective:** Monitor system for 7 days post-migration.

**Requirements:**
```markdown
# Monitoring plan:

1. Day 1 (24 hours):
   - Monitor every hour
   - Check error rates
   - Check performance
   - Check costs
   - Check user reports
   - Be ready for immediate rollback

2. Day 2-3:
   - Monitor every 4 hours
   - Review logs
   - Review metrics
   - Address any issues

3. Day 4-7:
   - Monitor daily
   - Review weekly summary
   - Optimize as needed
   - Document findings

4. Metrics to monitor:
   - API response times
   - Error rates
   - DynamoDB consumed capacity
   - Lambda invocations
   - CloudFront requests
   - S3 storage
   - User complaints
   - Revenue impact

5. Alerts to watch:
   - Any critical alerts
   - Cost alerts
   - Performance degradation
   - Error spikes

6. Actions:
   - Document all issues
   - Apply fixes immediately
   - Update runbooks
   - Communicate with stakeholders
```

**Acceptance Criteria:**
- [ ] No critical issues
- [ ] Performance stable
- [ ] Costs within budget
- [ ] User satisfaction maintained
- [ ] All monitoring in place
- [ ] Ready for BAU operations

---

### **Task 11.5: Knowledge Transfer & Training**

**Objective:** Train team on new architecture.

**Requirements:**
```markdown
# Training plan:

1. Architecture Overview Session (2 hours):
   - Serverless architecture
   - Microservices design
   - DynamoDB data model
   - Lambda functions
   - API Gateway
   - S3 + CloudFront

2. Operations Training (2 hours):
   - Deployment procedures
   - Monitoring dashboards
   - Log analysis
   - Troubleshooting
   - Backup/restore
   - Cost monitoring

3. Development Training (3 hours):
   - Local development setup
   - Adding new features
   - Testing procedures
   - CI/CD pipeline
   - Code review process
   - Best practices

4. Hands-on Workshop (2 hours):
   - Deploy a service
   - Make a change
   - Run tests
   - Deploy to production
   - Rollback
   - Troubleshoot issue

5. Documentation:
   - Provide access to all docs
   - Share training materials
   - Record sessions
   - Create Q&A document

6. Ongoing Support:
   - Weekly office hours
   - Slack channel for questions
   - Pair programming sessions
   - Code reviews
```

**Acceptance Criteria:**
- [ ] All team members trained
- [ ] Training materials created
- [ ] Sessions recorded
- [ ] Q&A document started
- [ ] Team confident with new system
- [ ] Support channel active

---

### **Task 11.6: Final Sign-off & Handover**

**Objective:** Get final approval and complete handover.

**Requirements:**
```markdown
# Final sign-off:

1. Stakeholder Demo:
   - Show working system
   - Demo all features
   - Show monitoring
   - Show cost savings
   - Answer questions

2. Documentation Handover:
   - Architecture docs
   - API reference
   - Operations runbook
   - Developer guide
   - Migration playbook
   - All diagrams

3. Access Handover:
   - AWS account access
   - GitHub repository
   - CI/CD pipelines
   - Monitoring dashboards
   - Documentation sites

4. Sign-off Checklist:
   □ All requirements met
   □ All tests passing
   □ Performance acceptable
   □ Costs within budget
   □ Security validated
   □ Team trained
   □ Documentation complete
   □ Monitoring active
   □ Support plan in place

5. Post-handover:
   - 30-day support period
   - Weekly check-ins
   - Address any issues
   - Final report
```

**Acceptance Criteria:**
- [ ] Stakeholder approval received
- [ ] All documentation delivered
- [ ] All access transferred
- [ ] Sign-off checklist complete
- [ ] Support plan agreed
- [ ] Final report submitted

---

## **Summary: Complete Agent Task List**

**Total Tasks: 60+**

### **Phase 1: Foundation** (4 tasks)
- 1.1-1.4: DynamoDB Client, S3 Client, DynamoDB Infrastructure, S3+CloudFront Infrastructure

### **Phase 2: Repository Layer** (13 tasks)
- 2.1-2.13: All entity repositories (Product, Variant, Image, Category, Order, OrderItem, Cart, CartItem, Personaggio, Fumetto, DiscountCode, Notification, AuditLog, Etsy)

### **Phase 3: Service Layer** (5 tasks)
- 3.1-3.5: Service layer refactoring (Product, Order, Cart, Notification, Audit)

### **Phase 4: API Layer** (7 tasks)
- 4.1-4.7: Lambda handlers for all services

### **Phase 5: Infrastructure** (7 tasks)
- 5.1-5.7: Terraform for all services + monitoring

### **Phase 6: Data Migration** (1 task)
- 6.1: Migration script

### **Phase 7: Frontend Optimizations** (5 tasks)
- 7.1-7.5: Image caching, service worker, performance monitoring

### **Phase 8: Testing** (6 tasks)
- 8.1-8.6: Integration tests, E2E tests, load tests, security tests

### **Phase 9: DevOps** (4 tasks)
- 9.1-9.4: CI/CD, deployment scripts, backups, health checks

### **Phase 10: Documentation** (6 tasks)
- 10.1-10.6: Architecture docs, developer guide, operations runbook, cost guide, migration playbook, README

### **Phase 11: Go-Live** (6 tasks)
- 11.1-11.6: System test, migration dry run, production migration, monitoring, training, sign-off

---

**Each task can be assigned to a coding agent independently with clear success criteria! 🚀**
