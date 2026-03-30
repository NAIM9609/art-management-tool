#!/usr/bin/env bash
# localstack-invoke.sh — Invoke a LocalStack Lambda function and print response
set -euo pipefail

usage() {
  echo "Usage: $(basename "$0") <function-name> [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -p, --payload JSON        Inline JSON payload (default: {})"
  echo "  -f, --payload-file FILE   Payload file path"
  echo "  --endpoint URL            LocalStack endpoint (default: http://localhost:4566)"
  echo "  --region REGION           AWS region (default: us-east-1)"
  echo "  -h, --help                Show help"
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  exit 0
fi

FUNCTION_NAME="$1"
shift

PAYLOAD='{}'
PAYLOAD_FILE=''
AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
AWS_REGION="${AWS_REGION:-us-east-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--payload) PAYLOAD="$2"; shift 2 ;;
    -f|--payload-file) PAYLOAD_FILE="$2"; shift 2 ;;
    --endpoint) AWS_ENDPOINT_URL="$2"; shift 2 ;;
    --region) AWS_REGION="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if command -v awslocal >/dev/null 2>&1; then
  AWS_CMD=(awslocal)
elif command -v aws >/dev/null 2>&1; then
  export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
  export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
  export AWS_DEFAULT_REGION="$AWS_REGION"
  AWS_CMD=(aws --endpoint-url "$AWS_ENDPOINT_URL" --region "$AWS_REGION")
else
  echo "Neither 'awslocal' nor 'aws' command is available" >&2
  exit 1
fi

OUTPUT_FILE="/tmp/localstack-invoke-${RANDOM}.json"

if [[ -n "$PAYLOAD_FILE" ]]; then
  "${AWS_CMD[@]}" lambda invoke \
    --function-name "$FUNCTION_NAME" \
    --cli-binary-format raw-in-base64-out \
    --payload "fileb://${PAYLOAD_FILE}" \
    "$OUTPUT_FILE" >/dev/null
else
  "${AWS_CMD[@]}" lambda invoke \
    --function-name "$FUNCTION_NAME" \
    --cli-binary-format raw-in-base64-out \
    --payload "$PAYLOAD" \
    "$OUTPUT_FILE" >/dev/null
fi

cat "$OUTPUT_FILE"
rm -f "$OUTPUT_FILE"
