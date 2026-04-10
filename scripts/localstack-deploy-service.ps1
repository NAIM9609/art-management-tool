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
if (-not $PSBoundParameters.ContainsKey('Region') -and $env:AWS_REGION_CUSTOM) { $Region = $env:AWS_REGION_CUSTOM }
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

# Handler paths match the esbuild bundled output: dist/handlers/<handler>.handler.<export>
# These also match the Terraform handler definitions for consistency.
$handlers = @{
  'audit-service-get-entity-history' = 'dist/handlers/audit.handler.getEntityHistory'
  'audit-service-get-user-activity' = 'dist/handlers/audit.handler.getUserActivity'
  'audit-service-get-activity-by-date' = 'dist/handlers/audit.handler.getActivityByDate'

  'cart-service-get-cart' = 'dist/handlers/cart.handler.getCart'
  'cart-service-add-item' = 'dist/handlers/cart.handler.addItem'
  'cart-service-update-quantity' = 'dist/handlers/cart.handler.updateQuantity'
  'cart-service-remove-item' = 'dist/handlers/cart.handler.removeItem'
  'cart-service-clear-cart' = 'dist/handlers/cart.handler.clearCart'
  'cart-service-apply-discount' = 'dist/handlers/cart.handler.applyDiscount'
  'cart-service-remove-discount' = 'dist/handlers/cart.handler.removeDiscount'

  'content-service-list-personaggi' = 'dist/handlers/personaggi.handler.listPersonaggi'
  'content-service-get-personaggio' = 'dist/handlers/personaggi.handler.getPersonaggio'
  'content-service-create-personaggio' = 'dist/handlers/personaggi.handler.createPersonaggio'
  'content-service-update-personaggio' = 'dist/handlers/personaggi.handler.updatePersonaggio'
  'content-service-delete-personaggio' = 'dist/handlers/personaggi.handler.deletePersonaggio'
  'content-service-get-personaggio-upload-url' = 'dist/handlers/personaggi.handler.uploadImage'
  'content-service-list-fumetti' = 'dist/handlers/fumetti.handler.listFumetti'
  'content-service-get-fumetto' = 'dist/handlers/fumetti.handler.getFumetto'
  'content-service-create-fumetto' = 'dist/handlers/fumetti.handler.createFumetto'
  'content-service-update-fumetto' = 'dist/handlers/fumetti.handler.updateFumetto'
  'content-service-delete-fumetto' = 'dist/handlers/fumetti.handler.deleteFumetto'
  'content-service-get-fumetto-upload-url' = 'dist/handlers/fumetti.handler.uploadPage'

  'discount-service-validate-code' = 'dist/handlers/discount.handler.validateCode'
  'discount-service-list-discounts' = 'dist/handlers/discount.handler.listDiscounts'
  'discount-service-get-discount' = 'dist/handlers/discount.handler.getDiscount'
  'discount-service-create-discount' = 'dist/handlers/discount.handler.createDiscount'
  'discount-service-update-discount' = 'dist/handlers/discount.handler.updateDiscount'
  'discount-service-delete-discount' = 'dist/handlers/discount.handler.deleteDiscount'
  'discount-service-get-stats' = 'dist/handlers/discount.handler.getStats'

  'integration-service-etsy-initiate-oauth' = 'dist/handlers/etsy.handler.initiateOAuth'
  'integration-service-etsy-handle-callback' = 'dist/handlers/etsy.handler.handleCallback'
  'integration-service-etsy-sync-products' = 'dist/handlers/etsy.handler.syncProducts'
  'integration-service-etsy-sync-inventory' = 'dist/handlers/etsy.handler.syncInventory'
  'integration-service-etsy-sync-orders' = 'dist/handlers/etsy.handler.syncOrders'
  'integration-service-etsy-webhook' = 'dist/handlers/etsy.handler.handleWebhook'
  'integration-service-etsy-scheduled-sync' = 'dist/handlers/etsy.handler.scheduledSync'

  'notification-service-list-notifications' = 'dist/handlers/notification.handler.listNotifications'
  'notification-service-mark-as-read' = 'dist/handlers/notification.handler.markAsRead'
  'notification-service-mark-all-read' = 'dist/handlers/notification.handler.markAllAsRead'
  'notification-service-delete-notification' = 'dist/handlers/notification.handler.deleteNotification'

  'order-service-create-order' = 'dist/handlers/order.handler.createOrder'
  'order-service-get-order' = 'dist/handlers/order.handler.getOrder'
  'order-service-get-customer-orders' = 'dist/handlers/order.handler.getCustomerOrders'
  'order-service-list-orders' = 'dist/handlers/order.handler.listOrders'
  'order-service-update-status' = 'dist/handlers/order.handler.updateOrderStatus'
  'order-service-process-payment' = 'dist/handlers/order.handler.processPayment'
  'order-service-webhook' = 'dist/handlers/order.handler.webhookHandler'

  'product-service-list-products' = 'dist/handlers/product.handler.listProducts'
  'product-service-get-product' = 'dist/handlers/product.handler.getProduct'
  'product-service-create-product' = 'dist/handlers/product.handler.createProduct'
  'product-service-update-product' = 'dist/handlers/product.handler.updateProduct'
  'product-service-delete-product' = 'dist/handlers/product.handler.deleteProduct'
  'product-service-list-categories' = 'dist/handlers/category.handler.listCategories'
  'product-service-get-category' = 'dist/handlers/category.handler.getCategory'
  'product-service-create-category' = 'dist/handlers/category.handler.createCategory'
  'product-service-update-category' = 'dist/handlers/category.handler.updateCategory'
  'product-service-delete-category' = 'dist/handlers/category.handler.deleteCategory'
  'product-service-list-variants' = 'dist/handlers/variant.handler.listVariants'
  'product-service-create-variant' = 'dist/handlers/variant.handler.createVariant'
  'product-service-update-variant' = 'dist/handlers/variant.handler.updateVariant'
  'product-service-update-stock' = 'dist/handlers/variant.handler.updateStock'
  'product-service-get-upload-url' = 'dist/handlers/image.handler.getUploadUrl'
  'product-service-list-images' = 'dist/handlers/image.handler.listImages'
  'product-service-delete-image' = 'dist/handlers/image.handler.deleteImage'
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
  & npm i --prefix $backendDir
  if ($LASTEXITCODE -ne 0) { throw 'npm i failed' }
}

if (-not $SkipBuild) {
  Write-Info "Running esbuild bundler for $ServiceName-service"
  & node (Join-Path $backendDir 'esbuild.lambda.mjs') $ServiceName
  if ($LASTEXITCODE -ne 0) { throw 'esbuild Lambda bundle failed' }
}

$distDir = Join-Path $backendDir (Join-Path 'dist' (Join-Path 'lambda' "$ServiceName-service"))
if (-not (Test-Path $distDir)) {
  if ($SkipBuild) {
    throw "Dist folder not found at $distDir. Remove -SkipBuild or run a build first."
  }
  throw "Dist folder not found at $distDir after build."
}

# With esbuild bundling, @aws-sdk is externalised — we still need a layer
# for the AWS SDK packages that the Lambda runtime provides.  However,
# LocalStack's Node.js Lambda runtime already includes @aws-sdk, so the
# layer is only needed for any NON-aws-sdk production dependencies that
# esbuild could not bundle (e.g. native addons).  Since all current deps
# are pure JS and are bundled by esbuild, we create a minimal layer with
# just @aws-sdk from node_modules.

$packageDir = Join-Path $env:TEMP "localstack-lambda-package-$ServiceName-$PID"
$zipPath = Join-Path $env:TEMP "localstack-lambda-$ServiceName-$PID.zip"
$layerPackageDir = Join-Path $env:TEMP "localstack-layer-package-$ServiceName-$PID"
$layerZipPath = Join-Path $env:TEMP "localstack-layer-$ServiceName-$PID.zip"

if (Test-Path $packageDir) { Remove-Item $packageDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
if (Test-Path $layerPackageDir) { Remove-Item $layerPackageDir -Recurse -Force }
if (Test-Path $layerZipPath) { Remove-Item $layerZipPath -Force }

Write-Step 'Creating @aws-sdk dependency layer'
$awsSdkNodeModules = Join-Path $layerPackageDir 'nodejs' 'node_modules'
New-Item -ItemType Directory -Path $awsSdkNodeModules -Force | Out-Null

# Copy only @aws-sdk and @smithy (its runtime dependency) into the layer
$backendNodeModules = Join-Path $backendDir 'node_modules'
foreach ($prefix in @('@aws-sdk', '@smithy')) {
  $srcDir = Join-Path $backendNodeModules $prefix
  if (Test-Path $srcDir) {
    Copy-Item $srcDir -Destination (Join-Path $awsSdkNodeModules $prefix) -Recurse -Force
  }
}

Compress-Archive -Path (Join-Path $layerPackageDir '*') -DestinationPath $layerZipPath -Force

$layerName = "$ProjectName-$Environment-aws-sdk"
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

Write-Step 'Creating function package (self-contained esbuild bundle)'
New-Item -ItemType Directory -Path $packageDir | Out-Null

# Copy the bundled output — already contains dist/handlers/*.handler.js
Copy-Item (Join-Path $distDir '*') -Destination $packageDir -Recurse -Force

Compress-Archive -Path (Join-Path $packageDir '*') -DestinationPath $zipPath -Force
Write-Ok "Package created: $zipPath"

$roleArn = "arn:aws:iam::000000000000:role/$ProjectName-$Environment-local-lambda-role"
$runtime = $runtimes[$ServiceName]
$tableName = $tables[$ServiceName]
$envVars = "Variables={DYNAMODB_TABLE_NAME=$tableName,AWS_REGION_CUSTOM=$Region,AWS_REGION_NAME=$Region,AWS_ENDPOINT_URL=$Endpoint,ENVIRONMENT=$Environment,S3_BUCKET_NAME=$Bucket,CDN_URL=$Endpoint/$Bucket,JWT_SECRET=local-dev-secret,CORS_ALLOWED_ORIGINS=http://localhost:3000,PAYMENT_PROVIDER=mock,RATE_LIMIT_ENABLED=false,SCHEDULER_ENABLED=false,CONTENT_TABLE_NAME=content,PRODUCTS_TABLE_NAME=products,ORDERS_TABLE_NAME=orders,CARTS_TABLE_NAME=carts,DISCOUNTS_TABLE_NAME=discount-codes,AUDIT_TABLE_NAME=audit-logs,NOTIFICATIONS_TABLE_NAME=notifications,ETSY_TOKENS_TABLE_NAME=etsy-oauth-tokens}"

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
