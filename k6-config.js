/**
 * k6 Shared Configuration
 *
 * Centralises thresholds, scenario helpers, and free-tier guard-rails that are
 * reused by every load-test script.
 *
 * Usage (in a test file):
 *   import { productOptions, orderOptions, cartOptions, makeScenarios } from '../../k6-config.js';
 */

// ---------------------------------------------------------------------------
// Free-tier monthly budget constants
// ---------------------------------------------------------------------------

/**
 * AWS Free Tier limits used to derive per-run budgets.
 *  - Lambda:   1 000 000 invocations / month  (leave 10 % headroom → 900 000)
 *  - DynamoDB: 25 RCU + 25 WCU provisioned;
 *              on-demand free tier: 200 M read-requests, 200 M write-requests / month
 *              We target ≤ 20 RCU / WCU consumed during a single test run.
 */
export const FREE_TIER = {
  maxMonthlyLambdaInvocations: 900_000,
  maxDynamoDBRCU: 20,
  maxDynamoDBWCU: 20,
};

// ---------------------------------------------------------------------------
// Scenario factory
// ---------------------------------------------------------------------------

/**
 * Build the four canonical test scenarios for a given service.
 *
 * @param {object} params
 * @param {number} params.maxVUs          - Maximum virtual-user count.
 * @param {number} params.rampUpSeconds   - Time (s) to ramp from 0 → maxVUs (default 120).
 * @param {number} params.sustainSeconds  - Time (s) to hold maxVUs (default 300).
 * @param {number} params.soakVUs         - VU count for the 1-hour soak (default maxVUs/2).
 * @param {number} params.soakSeconds     - Duration (s) of the soak test (default 3600).
 * @returns {object} k6 scenarios object.
 */
export function makeScenarios({
  maxVUs,
  rampUpSeconds = 120,
  sustainSeconds = 300,
  soakVUs = Math.ceil(maxVUs / 2),
  soakSeconds = 3600,
}) {
  return {
    /**
     * Gradual ramp-up: 0 → maxVUs over rampUpSeconds, then hold for sustainSeconds.
     */
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: `${rampUpSeconds}s`, target: maxVUs },
        { duration: `${sustainSeconds}s`, target: maxVUs },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
      tags: { scenario: 'ramp_up' },
    },

    /**
     * Spike test: instant 5× traffic for 1 minute, then back to baseline.
     */
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: maxVUs * 5 },
        { duration: '60s', target: maxVUs * 5 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
      startTime: `${rampUpSeconds + sustainSeconds + 60}s`,
      tags: { scenario: 'spike' },
    },

    /**
     * Soak test: 50 % of max VUs for soakSeconds (default 1 hour).
     */
    soak: {
      executor: 'ramping-vus',
      startVUs: soakVUs,
      stages: [
        { duration: `${soakSeconds}s`, target: soakVUs },
        { duration: '60s', target: 0 },
      ],
      gracefulRampDown: '30s',
      startTime: `${rampUpSeconds + sustainSeconds + 200}s`,
      tags: { scenario: 'soak' },
    },
  };
}

// ---------------------------------------------------------------------------
// Per-service options
// ---------------------------------------------------------------------------

/**
 * Product Service k6 options.
 *  - 100 VUs, ~1 000 req/min
 *  - p(95) < 500 ms, 0 % errors
 */
export const productOptions = {
  scenarios: makeScenarios({ maxVUs: 100 }),
  thresholds: {
    http_req_duration: ['p(50)<200', 'p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>16'], // ≥ 1 000 req/min ÷ 60
  },
};

/**
 * Order Service k6 options.
 *  - 50 VUs, ~500 req/min
 *  - p(95) < 1 000 ms, 0 % errors
 */
export const orderOptions = {
  scenarios: makeScenarios({ maxVUs: 50 }),
  thresholds: {
    http_req_duration: ['p(50)<400', 'p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>8'], // ≥ 500 req/min ÷ 60
  },
};

/**
 * Cart Service k6 options.
 *  - 200 VUs, ~2 000 req/min
 *  - p(95) < 300 ms, 0 % errors
 */
export const cartOptions = {
  scenarios: makeScenarios({ maxVUs: 200 }),
  thresholds: {
    http_req_duration: ['p(50)<100', 'p(95)<300', 'p(99)<600'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>33'], // ≥ 2 000 req/min ÷ 60
  },
};

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

/**
 * Tags applied to every request so results can be filtered by service.
 */
export const PRODUCT_TAGS = { service: 'product' };
export const ORDER_TAGS = { service: 'order' };
export const CART_TAGS = { service: 'cart' };

/**
 * Helper: build a JSON body string and the matching Content-Type header.
 */
export function jsonBody(payload) {
  return {
    body: JSON.stringify(payload),
    params: { headers: { 'Content-Type': 'application/json' } },
  };
}

/**
 * Default request parameters (headers shared by all services).
 */
export function defaultParams(extraHeaders = {}) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
    timeout: '10s',
  };
}
