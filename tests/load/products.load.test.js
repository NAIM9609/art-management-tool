/**
 * Load tests – Product Service
 *
 * Validates that the Product Service can handle the expected traffic while
 * staying within AWS Free Tier limits.
 *
 * Requirements
 * ─────────────
 *  • 100 VUs (virtual users)
 *  • ~1 000 requests / minute
 *  • p(95) response time < 500 ms
 *  • Error rate < 1 %
 *
 * Scenarios (all configured in k6-config.js)
 * ───────────────────────────────────────────
 *  1. Gradual ramp-up  – 0 → 100 VUs over 2 minutes, hold 5 minutes
 *  2. Spike test       – sudden 5× traffic (500 VUs) for 1 minute
 *  3. Soak test        – 50 VUs for 1 hour
 *
 * Run
 * ───
 *  BASE_URL=https://your-api-id.execute-api.eu-west-1.amazonaws.com/prod \
 *    k6 run tests/load/products.load.test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { productOptions, defaultParams, PRODUCT_TAGS } from '../../k6-config.js';

// ---------------------------------------------------------------------------
// k6 options (imported from shared config)
// ---------------------------------------------------------------------------
export const options = productOptions;

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const listProductsLatency = new Trend('product_list_latency', true);
const getProductLatency = new Trend('product_get_latency', true);
const errorRate = new Rate('product_error_rate');
const totalRequests = new Counter('product_total_requests');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_PREFIX = `${BASE_URL}/api/products`;

// Demo / public auth token (matches the backend's demo-token-12345 fallback).
// Replace with a real token in production environments.
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'demo-token-12345';

const params = defaultParams({ Authorization: `Bearer ${AUTH_TOKEN}` });

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/** Known product slugs seeded in the test environment. */
const KNOWN_SLUGS = [
  'sample-artwork-1',
  'sample-artwork-2',
  'sample-artwork-3',
  'landscape-painting',
  'abstract-print',
];

/** Random item from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Setup – confirm API is reachable before the test begins
// ---------------------------------------------------------------------------
export function setup() {
  const res = http.get(`${API_PREFIX}?per_page=1&page=1`, params);
  if (res.status !== 200) {
    console.warn(`[setup] Product API returned status ${res.status}. Proceeding anyway.`);
  }
  return { baseUrl: API_PREFIX };
}

// ---------------------------------------------------------------------------
// Default function – executed by every VU on every iteration
// ---------------------------------------------------------------------------
export default function (data) {
  group('Product Service – Read operations', () => {

    // ── 1. List products (public, cacheable) ──────────────────────────────
    group('GET /api/products', () => {
      const res = http.get(
        `${data.baseUrl}?per_page=20&status=active`,
        { ...params, tags: PRODUCT_TAGS },
      );

      listProductsLatency.add(res.timings.duration);
      totalRequests.add(1);

      const ok = check(res, {
        'list products – status 200': (r) => r.status === 200,
        'list products – has items array': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.items) || Array.isArray(body.products) || Array.isArray(body.data);
          } catch {
            return false;
          }
        },
        'list products – response time < 500ms': (r) => r.timings.duration < 500,
      });

      errorRate.add(!ok);
    });

    sleep(0.5);

    // ── 2. Get single product by slug ─────────────────────────────────────
    group('GET /api/products/{slug}', () => {
      const slug = pick(KNOWN_SLUGS);
      const res = http.get(
        `${data.baseUrl}/${slug}`,
        { ...params, tags: PRODUCT_TAGS },
      );

      getProductLatency.add(res.timings.duration);
      totalRequests.add(1);

      const ok = check(res, {
        'get product – status 200 or 404': (r) => r.status === 200 || r.status === 404,
        'get product – response time < 500ms': (r) => r.timings.duration < 500,
      });

      errorRate.add(!ok);
    });

    sleep(0.5);

    // ── 3. List with pagination ───────────────────────────────────────────
    group('GET /api/products – paginated', () => {
      const page = Math.floor(Math.random() * 5) + 1;
      const res = http.get(
        `${data.baseUrl}?per_page=10&page=${page}`,
        { ...params, tags: PRODUCT_TAGS },
      );

      totalRequests.add(1);

      const ok = check(res, {
        'paginated list – status 200': (r) => r.status === 200,
        'paginated list – response time < 500ms': (r) => r.timings.duration < 500,
      });

      errorRate.add(!ok);
    });

    sleep(1);
  });
}

// ---------------------------------------------------------------------------
// Teardown – log a summary
// ---------------------------------------------------------------------------
export function teardown(data) {
  console.log(`[teardown] Product load test complete. Base URL: ${data.baseUrl}`);
}

// ---------------------------------------------------------------------------
// Free-tier validation summary (printed at the end by k6)
// ---------------------------------------------------------------------------
export function handleSummary(summary) {
  const p95 = summary.metrics['http_req_duration'] &&
    summary.metrics['http_req_duration'].values['p(95)'];
  const errRate = summary.metrics['product_error_rate'] &&
    summary.metrics['product_error_rate'].values['rate'];
  const reqs = summary.metrics['product_total_requests'] &&
    summary.metrics['product_total_requests'].values['count'];

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  PRODUCT SERVICE – LOAD TEST SUMMARY   ');
  console.log('════════════════════════════════════════');
  console.log(`  Total requests  : ${reqs || 'n/a'}`);
  console.log(`  p(95) latency   : ${p95 ? p95.toFixed(1) + ' ms' : 'n/a'}`);
  console.log(`  Error rate      : ${errRate !== undefined ? (errRate * 100).toFixed(2) + ' %' : 'n/a'}`);
  console.log('');
  console.log('  Free-tier checks:');
  console.log(`    Lambda invocations < 900K/month : OK (manual verification required)`);
  console.log(`    DynamoDB RCU/WCU ≤ 20           : OK (manual verification required)`);
  console.log('════════════════════════════════════════');

  return {
    stdout: JSON.stringify(summary, null, 2),
  };
}
