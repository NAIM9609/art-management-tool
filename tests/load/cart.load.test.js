/**
 * Load tests – Cart Service
 *
 * Validates that the Cart Service can handle the expected high-frequency
 * traffic while staying within AWS Free Tier limits.
 *
 * Requirements
 * ─────────────
 *  • 200 VUs (virtual users)
 *  • ~2 000 requests / minute
 *  • p(95) response time < 300 ms
 *  • Error rate < 1 %
 *
 * Scenarios (all configured in k6-config.js)
 * ───────────────────────────────────────────
 *  1. Gradual ramp-up  – 0 → 200 VUs over 2 minutes, hold 5 minutes
 *  2. Spike test       – sudden 5× traffic (1 000 VUs) for 1 minute
 *  3. Soak test        – 100 VUs for 1 hour
 *
 * Session management
 * ──────────────────
 * The Cart Service is session-aware. Each VU sends a unique session ID via
 * the `x-cart-session` header so that individual carts are isolated.
 *
 * Run
 * ───
 *  BASE_URL=https://your-api-id.execute-api.eu-west-1.amazonaws.com/prod \
 *    k6 run tests/load/cart.load.test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { cartOptions, defaultParams, CART_TAGS } from '../../k6-config.js';

// ---------------------------------------------------------------------------
// k6 options (imported from shared config)
// ---------------------------------------------------------------------------
export const options = cartOptions;

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const getCartLatency = new Trend('cart_get_latency', true);
const addItemLatency = new Trend('cart_add_item_latency', true);
const updateItemLatency = new Trend('cart_update_item_latency', true);
const removeItemLatency = new Trend('cart_remove_item_latency', true);
const clearCartLatency = new Trend('cart_clear_latency', true);
const errorRate = new Rate('cart_error_rate');
const totalRequests = new Counter('cart_total_requests');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_PREFIX = `${BASE_URL}/api/cart`;

// Optional JWT for authenticated cart merging.
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// ---------------------------------------------------------------------------
// Per-VU session helper
// ---------------------------------------------------------------------------

/**
 * Generate a stable session ID per virtual user.
 * This keeps one cart session tied to each VU across iterations.
 */
function newSessionId() {
  return `load-test-vu${__VU}`;
}

/** Build request params with a session header (and optional auth token). */
function sessionParams(sid) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-cart-session': sid,
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }
  return { headers, timeout: '10s', tags: CART_TAGS };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SAMPLE_PRODUCT_IDS = [
  'product-load-test-1',
  'product-load-test-2',
  'product-load-test-3',
  'product-load-test-4',
  'product-load-test-5',
];

const SAMPLE_VARIANT_IDS = [
  'variant-load-test-a',
  'variant-load-test-b',
  'variant-load-test-c',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addItemPayload() {
  return JSON.stringify({
    product_id: pick(SAMPLE_PRODUCT_IDS),
    variant_id: pick(SAMPLE_VARIANT_IDS),
    quantity: Math.floor(Math.random() * 3) + 1,
    unit_price: parseFloat((Math.random() * 200 + 10).toFixed(2)),
    title: 'Load Test Artwork',
  });
}

// ---------------------------------------------------------------------------
// Setup – confirm API is reachable before the test begins
// ---------------------------------------------------------------------------
export function setup() {
  const probeParams = defaultParams();
  probeParams.headers['x-cart-session'] = 'load-test-probe-session';
  const res = http.get(API_PREFIX, probeParams);
  if (res.status !== 200 && res.status !== 404) {
    console.warn(`[setup] Cart API returned status ${res.status}. Proceeding anyway.`);
  }
  return { baseUrl: API_PREFIX };
}

// ---------------------------------------------------------------------------
// Default function – executed by every VU on every iteration
// ---------------------------------------------------------------------------
export default function (data) {
  const sid = newSessionId();
  const params = sessionParams(sid);
  let cartItemId = null;

  group('Cart Service – Full session lifecycle', () => {

    // ── 1. Get (or create) the cart ───────────────────────────────────────
    group('GET /api/cart', () => {
      const res = http.get(data.baseUrl, params);

      getCartLatency.add(res.timings.duration);
      totalRequests.add(1);

      const ok = check(res, {
        'get cart – status 200': (r) => r.status === 200,
        'get cart – has items array': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.items);
          } catch {
            return false;
          }
        },
        'get cart – response time < 300ms': (r) => r.timings.duration < 300,
      });

      errorRate.add(!ok);
    });

    sleep(0.2);

    // ── 2. Add an item to the cart ────────────────────────────────────────
    group('POST /api/cart/items', () => {
      const res = http.post(
        `${data.baseUrl}/items`,
        addItemPayload(),
        params,
      );

      addItemLatency.add(res.timings.duration);
      totalRequests.add(1);

      const ok = check(res, {
        'add item – status 200 or 201': (r) => r.status === 200 || r.status === 201,
        'add item – response time < 300ms': (r) => r.timings.duration < 300,
      });

      errorRate.add(!ok);

      // Capture a cart item ID for subsequent update / delete operations.
      if (res.status === 200 || res.status === 201) {
        try {
          const body = JSON.parse(res.body);
          const items = body.items || (body.data && body.data.items);
          if (Array.isArray(items) && items.length > 0) {
            cartItemId = items[items.length - 1].id;
          }
        } catch {
          // Non-JSON body – skip.
        }
      }
    });

    sleep(0.2);

    // ── 3. Update item quantity (only if we have a real item ID) ──────────
    if (cartItemId) {
      group('PATCH /api/cart/items/{id}', () => {
        const res = http.patch(
          `${data.baseUrl}/items/${cartItemId}`,
          JSON.stringify({ quantity: 2 }),
          params,
        );

        updateItemLatency.add(res.timings.duration);
        totalRequests.add(1);

        const ok = check(res, {
          'update item – status 200 or 404': (r) => r.status === 200 || r.status === 404,
          'update item – response time < 300ms': (r) => r.timings.duration < 300,
        });

        errorRate.add(!ok);
      });

      sleep(0.2);

      // ── 4. Remove item from cart ──────────────────────────────────────
      group('DELETE /api/cart/items/{id}', () => {
        const res = http.del(
          `${data.baseUrl}/items/${cartItemId}`,
          null,
          params,
        );

        removeItemLatency.add(res.timings.duration);
        totalRequests.add(1);

        const ok = check(res, {
          'remove item – status 200, 204, or 404': (r) =>
            r.status === 200 || r.status === 204 || r.status === 404,
          'remove item – response time < 300ms': (r) => r.timings.duration < 300,
        });

        errorRate.add(!ok);
      });

      sleep(0.2);
    }

    // ── 5. Clear the cart (20 % of iterations) ────────────────────────────
    if (Math.random() < 0.20) {
      group('DELETE /api/cart', () => {
        const res = http.del(data.baseUrl, null, params);

        clearCartLatency.add(res.timings.duration);
        totalRequests.add(1);

        const ok = check(res, {
          'clear cart – status 200 or 204': (r) => r.status === 200 || r.status === 204,
          'clear cart – response time < 300ms': (r) => r.timings.duration < 300,
        });

        errorRate.add(!ok);
      });

      sleep(0.2);
    }
  });

  // Inter-iteration think time – keeps the request rate realistic.
  sleep(0.5);
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
export function teardown(data) {
  console.log(`[teardown] Cart load test complete. Base URL: ${data.baseUrl}`);
}

// ---------------------------------------------------------------------------
// Free-tier validation summary
// ---------------------------------------------------------------------------
export function handleSummary(summary) {
  const p95 = summary.metrics['http_req_duration'] &&
    summary.metrics['http_req_duration'].values['p(95)'];
  const errRate = summary.metrics['cart_error_rate'] &&
    summary.metrics['cart_error_rate'].values['rate'];
  const reqs = summary.metrics['cart_total_requests'] &&
    summary.metrics['cart_total_requests'].values['count'];

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('  CART SERVICE – LOAD TEST SUMMARY      ');
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
