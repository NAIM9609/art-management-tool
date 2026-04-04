#!/usr/bin/env bash
# localstack-deploy-all.sh — Deploy all Lambda services to LocalStack
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SERVICES=(audit cart content discount integration notification order product)

for service in "${SERVICES[@]}"; do
  echo ""
  echo "=== Deploying ${service} ==="
  "$SCRIPT_DIR/localstack-deploy-service.sh" "$service" "$@"
done

echo ""
echo "All services deployed to LocalStack."
