/**
 * esbuild Lambda Bundler
 *
 * Bundles each Lambda handler into a self-contained JS file with all
 * dependencies inlined (shared services, repositories, DynamoDB wrappers,
 * auth, types, etc.).  After bundling, the handler file at e.g.
 *
 *   dist/lambda/<service>/dist/handlers/<handler>.handler.js
 *
 * can be zipped and deployed directly — no node_modules layer needed
 * (except for @aws-sdk/* which is provided by the Lambda runtime).
 *
 * Usage:
 *   node esbuild.lambda.mjs                  # build all services
 *   node esbuild.lambda.mjs product          # build one service
 *   node esbuild.lambda.mjs product cart     # build multiple
 */

import { build } from 'esbuild';
import { readdirSync, existsSync } from 'fs';
import { resolve, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ── Service → handler entry-point mapping ──────────────────────────────────
// Each key is a service directory name under backend/services/.
// Each value is an array of handler TS files relative to the service src/.

const SERVICE_HANDLERS = {
  'product-service': [
    'src/handlers/product.handler.ts',
    'src/handlers/category.handler.ts',
    'src/handlers/variant.handler.ts',
    'src/handlers/image.handler.ts',
    'src/handlers/health.handler.ts',
  ],
  'cart-service': [
    'src/handlers/cart.handler.ts',
  ],
  'order-service': [
    'src/handlers/order.handler.ts',
  ],
  'audit-service': [
    'src/handlers/audit.handler.ts',
  ],
  'content-service': [
    'src/handlers/fumetti.handler.ts',
    'src/handlers/personaggi.handler.ts',
    'src/handlers/upload.handler.ts',
  ],
  'discount-service': [
    'src/handlers/discount.handler.ts',
  ],
  'notification-service': [
    'src/handlers/notification.handler.ts',
  ],
  'integration-service': [
    'src/handlers/etsy.handler.ts',
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveEntryPoints(serviceName) {
  const serviceDir = resolve(__dirname, 'services', serviceName);
  if (!existsSync(serviceDir)) {
    throw new Error(`Service directory not found: ${serviceDir}`);
  }

  return SERVICE_HANDLERS[serviceName].map((handlerPath) => {
    const fullPath = resolve(serviceDir, handlerPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Handler not found: ${fullPath}`);
    }
    return fullPath;
  });
}

/**
 * Bundle a single service.
 *
 * Output structure (matching Terraform handler paths):
 *   dist/lambda/<service>/dist/handlers/<handler>.handler.js
 *
 * Terraform handler value:  dist/handlers/<handler>.handler.<exportName>
 * e.g. dist/handlers/product.handler.listProducts
 */
async function bundleService(serviceName) {
  const entryPoints = resolveEntryPoints(serviceName);
  const outdir = resolve(__dirname, 'dist', 'lambda', serviceName);

  console.log(`\n⚡ Bundling ${serviceName} (${entryPoints.length} handlers)…`);

  await build({
    entryPoints,
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outdir: join(outdir, 'dist', 'handlers'),
    sourcemap: true,
    minify: false, // keep readable for debugging Lambda issues
    treeShaking: true,

    // @aws-sdk is pre-installed in the Lambda Node.js 18/20 runtime.
    // Externalising it avoids bundling ~2 MB per function.
    external: ['@aws-sdk/*'],

    // Treat each handler file as a separate entry point so each Lambda
    // function gets its own self-contained bundle.
    splitting: false,

    // Log level for build diagnostics
    logLevel: 'info',
  });

  console.log(`✅ ${serviceName} → ${outdir}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Normalise service names: accept "product" or "product-service"
  let serviceNames;
  if (args.length > 0) {
    serviceNames = args.map((arg) => {
      const normalised = SERVICE_HANDLERS[arg]
        ? arg
        : (arg.endsWith('-service') ? arg : `${arg}-service`);
      if (!SERVICE_HANDLERS[normalised]) {
        console.error(`Unknown service: ${arg}`);
        console.error(`Available: ${Object.keys(SERVICE_HANDLERS).join(', ')}`);
        process.exit(1);
      }
      return normalised;
    });
  } else {
    serviceNames = Object.keys(SERVICE_HANDLERS);
  }

  console.log(`Building Lambda bundles for: ${serviceNames.join(', ')}`);

  for (const svc of serviceNames) {
    await bundleService(svc);
  }

  console.log('\n🎉 All Lambda bundles ready.\n');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
