param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('audit', 'cart', 'content', 'discount', 'integration', 'notification', 'order', 'product')]
  [string]$ServiceName,

  [string]$Environment = 'dev',
  [string]$Endpoint = 'http://localhost:4566',
  [string]$Region = 'us-east-1',
  [string]$ProjectName = 'art-management-tool',
  [string]$Bucket = 'art-images-dev',
  [Alias('skip-build')]
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $PSBoundParameters.ContainsKey('Environment') -and $env:ENVIRONMENT) { $Environment = $env:ENVIRONMENT }
if (-not $PSBoundParameters.ContainsKey('Endpoint') -and $env:AWS_ENDPOINT_URL) { $Endpoint = $env:AWS_ENDPOINT_URL }
if (-not $PSBoundParameters.ContainsKey('Region') -and $env:AWS_REGION) { $Region = $env:AWS_REGION }
if (-not $PSBoundParameters.ContainsKey('ProjectName') -and $env:PROJECT_NAME) { $ProjectName = $env:PROJECT_NAME }
if (-not $PSBoundParameters.ContainsKey('Bucket') -and $env:S3_BUCKET_NAME) { $Bucket = $env:S3_BUCKET_NAME }

function Write-Info([string]$Message) { Write-Host "[INFO]  $Message" -ForegroundColor Blue }
function Write-Ok([string]$Message) { Write-Host "[OK]    $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[WARN]  $Message" -ForegroundColor Yellow }
function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }

$serviceFunctions = @{
  audit        = @('audit-service-get-entity-history', 'audit-service-get-user-activity', 'audit-service-get-activity-by-date')
  cart         = @('cart-service-get-cart', 'cart-service-add-item', 'cart-service-update-quantity', 'cart-service-remove-item', 'cart-service-clear-cart', 'cart-service-apply-discount', 'cart-service-remove-discount')
  content      = @('content-service-list-personaggi', 'content-service-get-personaggio', 'content-service-create-personaggio', 'content-service-update-personaggio', 'content-service-delete-personaggio', 'content-service-get-personaggio-upload-url', 'content-service-list-fumetti', 'content-service-get-fumetto', 'content-service-create-fumetto', 'content-service-update-fumetto', 'content-service-delete-fumetto', 'content-service-get-fumetto-upload-url')
  discount     = @('discount-service-validate-code', 'discount-service-list-discounts', 'discount-service-get-discount', 'discount-service-create-discount', 'discount-service-update-discount', 'discount-service-delete-discount', 'discount-service-get-stats')
  integration  = @('integration-service-etsy-initiate-oauth', 'integration-service-etsy-handle-callback', 'integration-service-etsy-sync-products', 'integration-service-etsy-sync-inventory', 'integration-service-etsy-sync-orders', 'integration-service-etsy-webhook', 'integration-service-etsy-scheduled-sync')
  notification = @('notification-service-list-notifications', 'notification-service-mark-as-read', 'notification-service-mark-all-read', 'notification-service-delete-notification')
  order        = @('order-service-create-order', 'order-service-get-order', 'order-service-get-customer-orders', 'order-service-list-orders', 'order-service-update-status', 'order-service-process-payment', 'order-service-webhook')
  product      = @('product-service-list-products', 'product-service-get-product', 'product-service-create-product', 'product-service-update-product', 'product-service-delete-product', 'product-service-list-categories', 'product-service-get-category', 'product-service-create-category', 'product-service-update-category', 'product-service-delete-category', 'product-service-list-variants', 'product-service-create-variant', 'product-service-update-variant', 'product-service-update-stock', 'product-service-get-upload-url', 'product-service-list-images', 'product-service-delete-image')
}

$handlers = @{
  'audit-service-get-entity-history' = 'dist/services/audit-service/src/handlers/audit.handler.getEntityHistory'
  'audit-service-get-user-activity' = 'dist/services/audit-service/src/handlers/audit.handler.getUserActivity'
  'audit-service-get-activity-by-date' = 'dist/services/audit-service/src/handlers/audit.handler.getActivityByDate'

  'cart-service-get-cart' = 'dist/services/cart-service/src/handlers/cart.handler.getCart'
  'cart-service-add-item' = 'dist/services/cart-service/src/handlers/cart.handler.addItem'
  'cart-service-update-quantity' = 'dist/services/cart-service/src/handlers/cart.handler.updateQuantity'
  'cart-service-remove-item' = 'dist/services/cart-service/src/handlers/cart.handler.removeItem'
  'cart-service-clear-cart' = 'dist/services/cart-service/src/handlers/cart.handler.clearCart'
  'cart-service-apply-discount' = 'dist/services/cart-service/src/handlers/cart.handler.applyDiscount'
  'cart-service-remove-discount' = 'dist/services/cart-service/src/handlers/cart.handler.removeDiscount'

  'content-service-list-personaggi' = 'dist/services/content-service/src/handlers/personaggi.handler.listPersonaggi'
  'content-service-get-personaggio' = 'dist/services/content-service/src/handlers/personaggi.handler.getPersonaggio'
  'content-service-create-personaggio' = 'dist/services/content-service/src/handlers/personaggi.handler.createPersonaggio'
  'content-service-update-personaggio' = 'dist/services/content-service/src/handlers/personaggi.handler.updatePersonaggio'
  'content-service-delete-personaggio' = 'dist/services/content-service/src/handlers/personaggi.handler.deletePersonaggio'
  'content-service-get-personaggio-upload-url' = 'dist/services/content-service/src/handlers/personaggi.handler.uploadImage'
  'content-service-list-fumetti' = 'dist/services/content-service/src/handlers/fumetti.handler.listFumetti'
  'content-service-get-fumetto' = 'dist/services/content-service/src/handlers/fumetti.handler.getFumetto'
  'content-service-create-fumetto' = 'dist/services/content-service/src/handlers/fumetti.handler.createFumetto'
  'content-service-update-fumetto' = 'dist/services/content-service/src/handlers/fumetti.handler.updateFumetto'
  'content-service-delete-fumetto' = 'dist/services/content-service/src/handlers/fumetti.handler.deleteFumetto'
  'content-service-get-fumetto-upload-url' = 'dist/services/content-service/src/handlers/fumetti.handler.uploadPage'

  'discount-service-validate-code' = 'dist/services/discount-service/src/handlers/discount.handler.validateCode'
  'discount-service-list-discounts' = 'dist/services/discount-service/src/handlers/discount.handler.listDiscounts'
  'discount-service-get-discount' = 'dist/services/discount-service/src/handlers/discount.handler.getDiscount'
  'discount-service-create-discount' = 'dist/services/discount-service/src/handlers/discount.handler.createDiscount'
  'discount-service-update-discount' = 'dist/services/discount-service/src/handlers/discount.handler.updateDiscount'
  'discount-service-delete-discount' = 'dist/services/discount-service/src/handlers/discount.handler.deleteDiscount'
  'discount-service-get-stats' = 'dist/services/discount-service/src/handlers/discount.handler.getStats'

  'integration-service-etsy-initiate-oauth' = 'dist/services/integration-service/src/handlers/etsy.handler.initiateOAuth'
  'integration-service-etsy-handle-callback' = 'dist/services/integration-service/src/handlers/etsy.handler.handleCallback'
  'integration-service-etsy-sync-products' = 'dist/services/integration-service/src/handlers/etsy.handler.syncProducts'
  'integration-service-etsy-sync-inventory' = 'dist/services/integration-service/src/handlers/etsy.handler.syncInventory'
  'integration-service-etsy-sync-orders' = 'dist/services/integration-service/src/handlers/etsy.handler.syncOrders'
  'integration-service-etsy-webhook' = 'dist/services/integration-service/src/handlers/etsy.handler.handleWebhook'
  'integration-service-etsy-scheduled-sync' = 'dist/services/integration-service/src/handlers/etsy.handler.scheduledSync'

  'notification-service-list-notifications' = 'dist/services/notification-service/src/handlers/notification.handler.listNotifications'
  'notification-service-mark-as-read' = 'dist/services/notification-service/src/handlers/notification.handler.markAsRead'
  'notification-service-mark-all-read' = 'dist/services/notification-service/src/handlers/notification.handler.markAllAsRead'
  'notification-service-delete-notification' = 'dist/services/notification-service/src/handlers/notification.handler.deleteNotification'

  'order-service-create-order' = 'dist/services/order-service/src/handlers/order.handler.createOrder'
  'order-service-get-order' = 'dist/services/order-service/src/handlers/order.handler.getOrder'
  'order-service-get-customer-orders' = 'dist/services/order-service/src/handlers/order.handler.getCustomerOrders'
  'order-service-list-orders' = 'dist/services/order-service/src/handlers/order.handler.listOrders'
  'order-service-update-status' = 'dist/services/order-service/src/handlers/order.handler.updateOrderStatus'
  'order-service-process-payment' = 'dist/services/order-service/src/handlers/order.handler.processPayment'
  'order-service-webhook' = 'dist/services/order-service/src/handlers/order.handler.webhookHandler'

  'product-service-list-products' = 'dist/services/product-service/src/handlers/product.handler.listProducts'
  'product-service-get-product' = 'dist/services/product-service/src/handlers/product.handler.getProduct'
  'product-service-create-product' = 'dist/services/product-service/src/handlers/product.handler.createProduct'
  'product-service-update-product' = 'dist/services/product-service/src/handlers/product.handler.updateProduct'
  'product-service-delete-product' = 'dist/services/product-service/src/handlers/product.handler.deleteProduct'
  'product-service-list-categories' = 'dist/services/product-service/src/handlers/category.handler.listCategories'
  'product-service-get-category' = 'dist/services/product-service/src/handlers/category.handler.getCategory'
  'product-service-create-category' = 'dist/services/product-service/src/handlers/category.handler.createCategory'
  'product-service-update-category' = 'dist/services/product-service/src/handlers/category.handler.updateCategory'
  'product-service-delete-category' = 'dist/services/product-service/src/handlers/category.handler.deleteCategory'
  'product-service-list-variants' = 'dist/services/product-service/src/handlers/variant.handler.listVariants'
  'product-service-create-variant' = 'dist/services/product-service/src/handlers/variant.handler.createVariant'
  'product-service-update-variant' = 'dist/services/product-service/src/handlers/variant.handler.updateVariant'
  'product-service-update-stock' = 'dist/services/product-service/src/handlers/variant.handler.updateStock'
  'product-service-get-upload-url' = 'dist/services/product-service/src/handlers/image.handler.getUploadUrl'
  'product-service-list-images' = 'dist/services/product-service/src/handlers/image.handler.listImages'
  'product-service-delete-image' = 'dist/services/product-service/src/handlers/image.handler.deleteImage'
}

$runtimes = @{
  audit = 'nodejs18.x'
  cart = 'nodejs20.x'
  content = 'nodejs18.x'
  discount = 'nodejs18.x'
  integration = 'nodejs18.x'
  notification = 'nodejs18.x'
  order = 'nodejs18.x'
  product = 'nodejs18.x'
}

$tables = @{
  audit = 'audit-logs'
  cart = 'carts'
  content = 'content'
  discount = 'discount-codes'
  integration = 'etsy-oauth-tokens'
  notification = 'notifications'
  order = 'orders'
  product = 'products'
}

function Test-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command 'node')) { throw 'node command not found' }
if (-not (Test-Command 'npm')) { throw 'npm command not found' }

$useAwslocal = Test-Command 'awslocal'
if (-not $useAwslocal -and -not (Test-Command 'aws')) {
  throw "Neither awslocal nor aws command is available"
}

if (-not $useAwslocal) {
  if (-not $env:AWS_ACCESS_KEY_ID) { $env:AWS_ACCESS_KEY_ID = 'test' }
  if (-not $env:AWS_SECRET_ACCESS_KEY) { $env:AWS_SECRET_ACCESS_KEY = 'test' }
  $env:AWS_DEFAULT_REGION = $Region
}

function Invoke-Aws {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )
  if ($useAwslocal) {
    & awslocal @Args
  } else {
    & aws --endpoint-url $Endpoint --region $Region @Args
  }
  if ($LASTEXITCODE -ne 0) {
    throw "AWS command failed: $($Args -join ' ')"
  }
}

function Invoke-AwsCapture {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $output = if ($useAwslocal) {
    & awslocal @Args
  } else {
    & aws --endpoint-url $Endpoint --region $Region @Args
  }

  if ($LASTEXITCODE -ne 0) {
    throw "AWS command failed: $($Args -join ' ')"
  }

  return $output
}

function Test-LambdaExists {
  param([string]$FunctionName)
  if ($useAwslocal) {
    & awslocal lambda get-function --function-name $FunctionName *> $null
  } else {
    & aws --endpoint-url $Endpoint --region $Region lambda get-function --function-name $FunctionName *> $null
  }
  return ($LASTEXITCODE -eq 0)
}

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$backendDir = Join-Path $repoRoot 'backend'
$serviceDir = Join-Path $backendDir (Join-Path 'services' "$ServiceName-service")

if (-not (Test-Path $serviceDir)) {
  throw "Service directory not found: $serviceDir"
}

Write-Step "Preparing build for $ServiceName-service"
if (-not (Test-Path (Join-Path $backendDir 'node_modules'))) {
  Write-Info "Installing backend dependencies"
  & npm ci --prefix $backendDir
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
}

if (-not $SkipBuild) {
  $tempBuildTsconfig = Join-Path $serviceDir 'tsconfig.localstack.build.json'
  @"
{
  "extends": "./tsconfig.json",
  "exclude": [
    "src/**/__tests__/**",
    "src/**/*.test.ts",
    "src/**/*.spec.ts"
  ]
}
"@ | Set-Content -Path $tempBuildTsconfig -Encoding UTF8

  try {
    & npx --prefix $backendDir tsc -p $tempBuildTsconfig --outDir (Join-Path $serviceDir 'dist')
  }
  finally {
    if (Test-Path $tempBuildTsconfig) {
      Remove-Item $tempBuildTsconfig -Force
    }
  }

  if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed' }
}

$distDir = Join-Path $serviceDir 'dist'
if (-not (Test-Path $distDir)) {
  if ($SkipBuild) {
    throw "Dist folder not found at $distDir. Remove -SkipBuild or run a build first."
  }
  throw "Dist folder not found at $distDir after build."
}

$layerPackageDir = Join-Path $env:TEMP "localstack-layer-package-$ServiceName-$PID"
$layerZipPath = Join-Path $env:TEMP "localstack-layer-$ServiceName-$PID.zip"
$packageDir = Join-Path $env:TEMP "localstack-lambda-package-$ServiceName-$PID"
$zipPath = Join-Path $env:TEMP "localstack-lambda-$ServiceName-$PID.zip"

if (Test-Path $layerPackageDir) { Remove-Item $layerPackageDir -Recurse -Force }
if (Test-Path $layerZipPath) { Remove-Item $layerZipPath -Force }
if (Test-Path $packageDir) { Remove-Item $packageDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Write-Step 'Creating shared dependency layer'
New-Item -ItemType Directory -Path (Join-Path $layerPackageDir 'nodejs') -Force | Out-Null
Copy-Item (Join-Path $backendDir 'node_modules') -Destination (Join-Path $layerPackageDir 'nodejs\node_modules') -Recurse -Force
Compress-Archive -Path (Join-Path $layerPackageDir '*') -DestinationPath $layerZipPath -Force

$layerName = "$ProjectName-$Environment-node-deps"
$layerArn = (Invoke-AwsCapture @(
  'lambda', 'publish-layer-version',
  '--layer-name', $layerName,
  '--zip-file', "fileb://$layerZipPath",
  '--compatible-runtimes', 'nodejs18.x', 'nodejs20.x',
  '--query', 'LayerVersionArn',
  '--output', 'text'
) | Select-Object -Last 1).Trim()

if (-not $layerArn) {
  throw 'Failed to publish LocalStack dependency layer.'
}

Write-Ok "Layer published: $layerArn"

Write-Step 'Creating function package'
New-Item -ItemType Directory -Path $packageDir | Out-Null

Copy-Item $distDir -Destination (Join-Path $packageDir 'dist') -Recurse -Force

Compress-Archive -Path (Join-Path $packageDir '*') -DestinationPath $zipPath -Force
Write-Ok "Package created: $zipPath"

$roleArn = "arn:aws:iam::000000000000:role/$ProjectName-$Environment-local-lambda-role"
$runtime = $runtimes[$ServiceName]
$tableName = $tables[$ServiceName]
$envVars = "Variables={DYNAMODB_TABLE_NAME=$tableName,AWS_REGION=$Region,AWS_REGION_NAME=$Region,AWS_ENDPOINT_URL=$Endpoint,ENVIRONMENT=$Environment,S3_BUCKET_NAME=$Bucket,CDN_URL=$Endpoint/$Bucket,JWT_SECRET=local-dev-secret,CORS_ALLOWED_ORIGINS=http://localhost:3000,PAYMENT_PROVIDER=mock,RATE_LIMIT_ENABLED=false,SCHEDULER_ENABLED=false,CONTENT_TABLE_NAME=content,PRODUCTS_TABLE_NAME=products,ORDERS_TABLE_NAME=orders,CARTS_TABLE_NAME=carts,DISCOUNTS_TABLE_NAME=discount-codes,AUDIT_TABLE_NAME=audit-logs,NOTIFICATIONS_TABLE_NAME=notifications,ETSY_TOKENS_TABLE_NAME=etsy-oauth-tokens}"

Write-Step 'Deploying Lambda functions to LocalStack'

foreach ($fnSuffix in $serviceFunctions[$ServiceName]) {
  $functionName = "$ProjectName-$Environment-$fnSuffix"
  $handler = $handlers[$fnSuffix]
  if (-not $handler) {
    throw "Missing handler mapping for $fnSuffix"
  }

  if (Test-LambdaExists -FunctionName $functionName) {
    Write-Info "Updating $functionName"
    Invoke-Aws @('lambda', 'update-function-code', '--function-name', $functionName, '--zip-file', "fileb://$zipPath")
    Invoke-Aws @('lambda', 'update-function-configuration', '--function-name', $functionName, '--handler', $handler, '--runtime', $runtime, '--timeout', '30', '--memory-size', '256', '--layers', $layerArn, '--environment', $envVars)
  } else {
    Write-Info "Creating $functionName"
    Invoke-Aws @('lambda', 'create-function', '--function-name', $functionName, '--runtime', $runtime, '--role', $roleArn, '--handler', $handler, '--timeout', '30', '--memory-size', '256', '--layers', $layerArn, '--zip-file', "fileb://$zipPath", '--environment', $envVars)
  }

  Write-Ok "$functionName ready"
}

if (Test-Path $layerPackageDir) { Remove-Item $layerPackageDir -Recurse -Force }
if (Test-Path $layerZipPath) { Remove-Item $layerZipPath -Force }
if (Test-Path $packageDir) { Remove-Item $packageDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Write-Ok "LocalStack deployment completed for service: $ServiceName"
