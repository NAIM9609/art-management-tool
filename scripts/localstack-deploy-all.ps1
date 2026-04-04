param(
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

$services = @('audit', 'cart', 'content', 'discount', 'integration', 'notification', 'order', 'product')
$scriptDir = Split-Path -Parent $PSCommandPath
$deployServiceScript = Join-Path $scriptDir 'localstack-deploy-service.ps1'

foreach ($service in $services) {
  Write-Host ""
  Write-Host "=== Deploying $service ===" -ForegroundColor Cyan
  & $deployServiceScript -ServiceName $service -Environment $Environment -Endpoint $Endpoint -Region $Region -ProjectName $ProjectName -Bucket $Bucket -SkipBuild:$SkipBuild
  if ($LASTEXITCODE -ne 0) {
    throw "Deployment failed for service $service"
  }
}

Write-Host ""
Write-Host 'All services deployed to LocalStack.' -ForegroundColor Green
