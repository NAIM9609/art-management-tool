param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$FunctionName,

  [string]$Payload,
  [string]$PayloadFile,
  [string]$Endpoint,
  [string]$Region
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Payload)) { $Payload = '{}' }

if ([string]::IsNullOrWhiteSpace($Endpoint)) {
  $Endpoint = if ($env:AWS_ENDPOINT_URL) { $env:AWS_ENDPOINT_URL } else { 'http://localhost:4566' }
}

if ([string]::IsNullOrWhiteSpace($Region)) {
  $Region = if ($env:AWS_REGION_CUSTOM) { $env:AWS_REGION_CUSTOM } else { 'us-east-1' }
}

function Test-Command([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

$useAwslocal = Test-Command 'awslocal'
if (-not $useAwslocal -and -not (Test-Command 'aws')) {
  throw "Neither awslocal nor aws command is available"
}

if (-not $useAwslocal) {
  if (-not $env:AWS_ACCESS_KEY_ID) { $env:AWS_ACCESS_KEY_ID = 'test' }
  if (-not $env:AWS_SECRET_ACCESS_KEY) { $env:AWS_SECRET_ACCESS_KEY = 'test' }
  $env:AWS_DEFAULT_REGION = $Region
}

$outputFile = Join-Path $env:TEMP ("localstack-invoke-{0}.json" -f $PID)
if (Test-Path $outputFile) { Remove-Item $outputFile -Force }

if ($PayloadFile) {
  if (-not (Test-Path $PayloadFile)) {
    throw "Payload file not found: $PayloadFile"
  }
  if ($useAwslocal) {
    & awslocal lambda invoke --function-name $FunctionName --cli-binary-format raw-in-base64-out --payload ("fileb://{0}" -f $PayloadFile) $outputFile *> $null
  } else {
    & aws --endpoint-url $Endpoint --region $Region lambda invoke --function-name $FunctionName --cli-binary-format raw-in-base64-out --payload ("fileb://{0}" -f $PayloadFile) $outputFile *> $null
  }
} else {
  if ($useAwslocal) {
    & awslocal lambda invoke --function-name $FunctionName --cli-binary-format raw-in-base64-out --payload $Payload $outputFile *> $null
  } else {
    & aws --endpoint-url $Endpoint --region $Region lambda invoke --function-name $FunctionName --cli-binary-format raw-in-base64-out --payload $Payload $outputFile *> $null
  }
}

if ($LASTEXITCODE -ne 0) {
  throw "Lambda invoke failed for $FunctionName"
}

Get-Content $outputFile -Raw
Remove-Item $outputFile -Force
