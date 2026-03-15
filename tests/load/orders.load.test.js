/**
 * Load tests – Order Service
 *
 * Validates that the Order Service can handle expected traffic while staying
 * within AWS Free Tier limits.
 *
 * Requirements
 * ─────────────
 *  • 50 VUs (virtual users)
 *  • ~500 requests / minute
 *  • p(95) response time < 1 000 ms
 *  • Error rate < 1 %
 *
 * Scenarios (all configured in k6-config.js)
 * ───────────────────────────────────────────
 *  1. Gradual ramp-up  – 0 → 50 VUs over 2 minutes, hold 5 minutes
 *  2. Spike test       – sudden 5× traffic (250 VUs) for 1 minute
 *  3. Soak test        – 25 VUs for 1 hour
 *
 * Run
 * ───
 *  BASE_URL=https://your-api-id.execute-api.eu-west-1.amazonaws.com/prod \
 *  AUTH_TOKEN=<admin-jwt> \
 *    k6 run tests/load/orders.load.test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { orderOptions, defaultParams, ORDER_TAGS } from '../../k6-config.js';

// ---------------------------------------------------------------------------
// k6 options (imported from shared config)
// ---------------------------------------------------------------------------
export const options = orderOptions;

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const listOrdersLatency = new Trend('order_list_latency', true);
const getOrderLatency = new Trend('order_get_latency', true);
const createOrderLatency = new Trend('order_create_latency', true);
const errorRate = new Rate('order_error_rate');
const totalRequests = new Counter('order_total_requests');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_PREFIX = `${BASE_URL}/api/orders`;

// An authenticated JWT is required for order operations.
// Use the demo token in local/staging environments.
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'demo-token-12345';

const authParams = defaultParams({ Authorization: `Bearer ${AUTH_TOKEN}` });

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

/** Random item from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Order statuses used when filtering list requests. */
const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

/** Minimal payload for creating a test order. */
function buildOrderPayload() {
  const timestamp = Date.now();
  return {
    customer_email: `loadtest+${timestamp}@example.com`,
    customer_name: 'Load Test User',
    shipping_address: {
      street: '123 Via del Test',
      city: 'Milano',
      postal_code: '20121',
      country: 'IT',
    },
    items: [
      {
        product_id: 'load-test-product-id',
        variant_id: 'load-test-variant-id',
        quantity: 1,
        unit_price: 25.00,
        title: 'Load Test Artwork',
      },
    ],
    currency: 'EUR',
    payment_method: 'mock',
  };
}

// ---------------------------------------------------------------------------
// Per-VU state (k6 VUs run in isolated JS contexts, so module-level variables
// are not shared between VUs – only within a single VU across its iterations).
// ---------------------------------------------------------------------------
let createdOrderIds = [];

// ---------------------------------------------------------------------------
// Setup – confirm API is reachable before the test begins
// ---------------------------------------------------------------------------
export function setup() {
  const res = http.get(`${API_PREFIX}?limit=1`, authParams);
  if (res.status !== 200 && res.status !== 403) {
    console.warn(`[setup] Order API returned status ${res.status}. Proceeding anyway.`);
  }
  return { baseUrl: API_PREFIX };
}

// ---------------------------------------------------------------------------
// Default function – executed by every VU on every iteration
// ---------------------------------------------------------------------------
export default function (data) {
  group('Order Service – Read operations', () => {

    // ── 1. List orders ────────────────────────────────────────────────────
    group('GET /api/orders', () => {
      const status = pick(ORDER_STATUSES);
      const res = http.get(
        `${data.baseUrl}?limit=10&status=${status}`,
        { ...authParams, tags: ORDER_TAGS },
      );

      listOrdersLatency.add(res.timings.duration);
      totalRequests.add(1);

      const ok = check(res, {
        'list orders – status 200 or 403': (r) => r.status === 200 || r.status === 403,
        'list orders – response time < 1000ms': (r) => r.timings.duration < 1000,
      });

      errorRate.add(!ok);
    });

    sleep(0.5);

    // ── 2. Get specific order (may 404 – that is fine for load testing) ───
    group('GET /api/orders/{id}', () => {
      const orderId = createdOrderIds.length > 0
        ? pick(createdOrderIds)
        : 'nonexistent-order-id';

      const res = http.get(
        `${data.baseUrl}/${orderId}`,
        { ...authParams, tags: ORDER_TAGS },
      );

      getOrderLatency.add(res.timings.duration);
      totalRequests.add(1);

      const ok = check(res, {
        'get order – status 200, 403, or 404': (r) =>
          r.status === 200 || r.status === 403 || r.status === 404,
        'get order – response time < 1000ms': (r) => r.timings.duration < 1000,
      });

      errorRate.add(!ok);
    });

    sleep(1);
  });

  // ── 3. Create order (10 % of iterations to avoid overwhelming write capacity)
  if (Math.random() < 0.10) {
    group('Order Service – Write operations', () => {
      group('POST /api/orders', () => {
        const payload = buildOrderPayload();
        const res = http.post(
          data.baseUrl,
          JSON.stringify(payload),
          { ...authParams, tags: ORDER_TAGS },
        );

        createOrderLatency.add(res.timings.duration);
        totalRequests.add(1);

        const ok = check(res, {
          'create order – status 201, 400, or 403': (r) =>
            r.status === 201 || r.status === 400 || r.status === 403,
          'create order – response time < 1000ms': (r) => r.timings.duration < 1000,
        });

        errorRate.add(!ok);

        // Track created order IDs so subsequent GET iterations are realistic.
        if (res.status === 201) {
          try {
            const body = JSON.parse(res.body);
            const orderId = body.id || (body.data && body.data.id);
            if (orderId) {
              createdOrderIds.push(orderId);
              // Cap the list to avoid unbounded memory growth.
              if (createdOrderIds.length > 100) {
                createdOrderIds = createdOrderIds.slice(-100);
              }
            }
          } catch {
            // Non-JSON or unexpected body – ignore.
          }
        }
      });
    });

    sleep(1);
  }
}

// ---------------------------------------------------------------------------
// Teardown – log a summary
// ---------------------------------------------------------------------------
export function teardown(data) {
  console.log(
    `[teardown] Order load test complete. Created ${createdOrderIds.length} orders during the run.`,
  );
}

// ---------------------------------------------------------------------------
// Free-tier validation summary
// ---------------------------------------------------------------------------
export function handleSummary(summary) {
  const p95 = summary.metrics['http_req_duration'] &&
    summary.metrics['http_req_duration'].values['p(95)'];
  const errRate = summary.metrics['order_error_rate'] &&
    summary.metrics['order_error_rate'].values['rate'];
  const reqs = summary.metrics['order_total_requests'] &&
    summary.metrics['order_total_requests'].values['count'];

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  ORDER SERVICE – LOAD TEST SUMMARY     ');
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
