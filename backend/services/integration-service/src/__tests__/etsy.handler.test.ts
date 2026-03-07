/**
 * Unit tests for Etsy Integration Lambda Handlers
 */

// Set environment variables before any imports
process.env.JWT_SECRET = 'test-secret';
process.env.ETSY_CLIENT_ID = 'test-client-id';
process.env.ETSY_CLIENT_SECRET = 'test-client-secret';
process.env.ETSY_REDIRECT_URI = 'https://example.com/api/integrations/etsy/callback';
process.env.ETSY_WEBHOOK_SECRET = 'test-webhook-secret';

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock saveToken and getToken so tests don't touch real DynamoDB
const mockSaveToken = jest.fn().mockResolvedValue(undefined);
const mockGetToken = jest.fn().mockResolvedValue(null);

jest.mock('../tokenStore', () => ({
  saveToken: (...args: unknown[]) => mockSaveToken(...args),
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  initiateOAuth,
  handleCallback,
  refreshToken,
  syncProducts,
  syncInventory,
  syncOrders,
  handleWebhook,
  scheduledSync,
} from '../handlers/etsy.handler';
import { APIGatewayProxyEvent } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    headers: {},
    queryStringParameters: null,
    pathParameters: null,
    body: null,
    ...overrides,
  };
}

function makeAuthEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  const token = jwt.sign({ id: 1, username: 'artadmin' }, 'test-secret');
  return makeEvent({
    headers: { authorization: `Bearer ${token}` },
    ...overrides,
  });
}

function makeDemoAuthEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return makeEvent({
    headers: { authorization: 'Bearer demo-token-12345' },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// initiateOAuth
// ---------------------------------------------------------------------------

describe('initiateOAuth', () => {
  it('returns 302 redirect with Location header when config is present', async () => {
    const result = await initiateOAuth(makeEvent());
    expect(result.statusCode).toBe(302);
    expect(result.headers?.Location).toContain('etsy.com/oauth/connect');
    expect(result.headers?.Location).toContain('client_id=test-client-id');
  });

  it('returns 503 when ETSY_CLIENT_ID is missing', async () => {
    const original = process.env.ETSY_CLIENT_ID;
    delete process.env.ETSY_CLIENT_ID;
    const result = await initiateOAuth(makeEvent());
    expect(result.statusCode).toBe(503);
    process.env.ETSY_CLIENT_ID = original;
  });

  it('returns 503 when ETSY_REDIRECT_URI is missing', async () => {
    const original = process.env.ETSY_REDIRECT_URI;
    delete process.env.ETSY_REDIRECT_URI;
    const result = await initiateOAuth(makeEvent());
    expect(result.statusCode).toBe(503);
    process.env.ETSY_REDIRECT_URI = original;
  });

  it('includes state parameter in the redirect URL', async () => {
    const result = await initiateOAuth(makeEvent());
    expect(result.headers?.Location).toContain('state=');
    const body = JSON.parse(result.body) as { state: string };
    expect(typeof body.state).toBe('string');
    expect(body.state.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// handleCallback
// ---------------------------------------------------------------------------

describe('handleCallback', () => {
  beforeEach(() => {
    mockSaveToken.mockClear();
    mockFetch.mockClear();
  });

  it('returns 400 when OAuth error is present', async () => {
    const result = await handleCallback(
      makeEvent({ queryStringParameters: { error: 'access_denied', error_description: 'User denied' } })
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({ error: 'User denied' });
  });

  it('returns 400 when authorization code is missing', async () => {
    const result = await handleCallback(makeEvent({ queryStringParameters: {} }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({ error: 'Missing authorization code' });
  });

  it('exchanges code for tokens and saves them', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'at-123',
        refresh_token: 'rt-456',
        expires_in: 3600,
        shop_id: 'shop-789',
      }),
    });

    const result = await handleCallback(
      makeEvent({ queryStringParameters: { code: 'auth-code-abc', state: 'random-state' } })
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { shopId: string };
    expect(body.shopId).toBe('shop-789');
    expect(mockSaveToken).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 'shop-789', accessToken: 'at-123' })
    );
  });

  it('returns an error when token exchange fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const result = await handleCallback(
      makeEvent({ queryStringParameters: { code: 'bad-code' } })
    );
    expect(result.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('falls back to shop_id query param when not in token response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'at-001',
        refresh_token: 'rt-002',
        expires_in: 3600,
      }),
    });

    const result = await handleCallback(
      makeEvent({ queryStringParameters: { code: 'code-xyz', shop_id: 'shop-fallback' } })
    );

    expect(result.statusCode).toBe(200);
    expect(mockSaveToken).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 'shop-fallback' })
    );
  });
});

// ---------------------------------------------------------------------------
// refreshToken
// ---------------------------------------------------------------------------

describe('refreshToken', () => {
  beforeEach(() => {
    mockGetToken.mockClear();
    mockSaveToken.mockClear();
    mockFetch.mockClear();
  });

  it('throws when no token found for shopId', async () => {
    mockGetToken.mockResolvedValueOnce(null);
    await expect(refreshToken('shop-missing')).rejects.toThrow('Token not found for shop shop-missing');
  });

  it('fetches new tokens and saves them', async () => {
    mockGetToken.mockResolvedValueOnce({
      shopId: 'shop-abc',
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      expiresAt: Date.now() - 1000,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-at',
        refresh_token: 'new-rt',
        expires_in: 3600,
      }),
    });

    const result = await refreshToken('shop-abc');
    expect(result.accessToken).toBe('new-at');
    expect(result.refreshToken).toBe('new-rt');
    expect(mockSaveToken).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'new-at' }));
  });
});

// ---------------------------------------------------------------------------
// syncProducts
// ---------------------------------------------------------------------------

describe('syncProducts', () => {
  beforeEach(() => {
    mockGetToken.mockClear();
    mockFetch.mockClear();
  });

  it('returns 401 when not authenticated', async () => {
    const result = await syncProducts(makeEvent({ httpMethod: 'POST' }));
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when shop_id is missing', async () => {
    const result = await syncProducts(makeDemoAuthEvent({ httpMethod: 'POST' }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({ error: 'shop_id is required' });
  });

  it('returns sync result for valid request via query param', async () => {
    mockGetToken.mockResolvedValueOnce({
      shopId: 'shop-1',
      accessToken: 'token-1',
      refreshToken: 'rt-1',
      expiresAt: Date.now() + 3600_000,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ listing_id: 1 }, { listing_id: 2 }], count: 2 }),
    });

    const result = await syncProducts(
      makeDemoAuthEvent({ httpMethod: 'POST', queryStringParameters: { shop_id: 'shop-1' } })
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { syncedCount: number };
    expect(body.syncedCount).toBe(2);
  });

  it('reads shop_id from JSON body', async () => {
    mockGetToken.mockResolvedValueOnce({
      shopId: 'shop-body',
      accessToken: 'token-body',
      refreshToken: 'rt-body',
      expiresAt: Date.now() + 3600_000,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], count: 0 }),
    });

    const result = await syncProducts(
      makeDemoAuthEvent({ httpMethod: 'POST', body: JSON.stringify({ shop_id: 'shop-body' }) })
    );
    expect(result.statusCode).toBe(200);
  });

  it('accepts JWT auth header', async () => {
    mockGetToken.mockResolvedValueOnce({
      shopId: 'shop-jwt',
      accessToken: 'token-jwt',
      refreshToken: 'rt-jwt',
      expiresAt: Date.now() + 3600_000,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 5 }),
    });

    const result = await syncProducts(
      makeAuthEvent({ httpMethod: 'POST', queryStringParameters: { shop_id: 'shop-jwt' } })
    );
    expect(result.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// syncInventory
// ---------------------------------------------------------------------------

describe('syncInventory', () => {
  beforeEach(() => {
    mockGetToken.mockClear();
    mockFetch.mockClear();
  });

  it('returns 401 when not authenticated', async () => {
    const result = await syncInventory(makeEvent({ httpMethod: 'POST' }));
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when shop_id is missing', async () => {
    const result = await syncInventory(makeDemoAuthEvent({ httpMethod: 'POST' }));
    expect(result.statusCode).toBe(400);
  });

  it('fetches inventory for each listing', async () => {
    mockGetToken.mockResolvedValueOnce({
      shopId: 'shop-2',
      accessToken: 'token-2',
      refreshToken: 'rt-2',
      expiresAt: Date.now() + 3600_000,
    });
    // First call: listings
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ listing_id: 10 }, { listing_id: 20 }] }),
    });
    // Two inventory calls
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ products: [] }),
    });

    const result = await syncInventory(
      makeDemoAuthEvent({ httpMethod: 'POST', queryStringParameters: { shop_id: 'shop-2' } })
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { syncedCount: number };
    expect(body.syncedCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// syncOrders
// ---------------------------------------------------------------------------

describe('syncOrders', () => {
  beforeEach(() => {
    mockGetToken.mockClear();
    mockFetch.mockClear();
  });

  it('returns 401 when not authenticated', async () => {
    const result = await syncOrders(makeEvent({ httpMethod: 'POST' }));
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when shop_id is missing', async () => {
    const result = await syncOrders(makeDemoAuthEvent({ httpMethod: 'POST' }));
    expect(result.statusCode).toBe(400);
  });

  it('returns sync result with count', async () => {
    mockGetToken.mockResolvedValueOnce({
      shopId: 'shop-3',
      accessToken: 'token-3',
      refreshToken: 'rt-3',
      expiresAt: Date.now() + 3600_000,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ receipt_id: 100 }], count: 1 }),
    });

    const result = await syncOrders(
      makeDemoAuthEvent({ httpMethod: 'POST', queryStringParameters: { shop_id: 'shop-3' } })
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { syncedCount: number };
    expect(body.syncedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// handleWebhook
// ---------------------------------------------------------------------------

describe('handleWebhook', () => {
  function sign(payload: string): string {
    return crypto.createHmac('sha256', 'test-webhook-secret').update(payload).digest('hex');
  }

  it('returns 401 when signature is missing and secret is configured', async () => {
    const result = await handleWebhook(
      makeEvent({ httpMethod: 'POST', body: JSON.stringify({ event_type: 'LISTING_ACTIVE' }) })
    );
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when signature is invalid', async () => {
    const body = JSON.stringify({ event_type: 'LISTING_ACTIVE' });
    const result = await handleWebhook(
      makeEvent({
        httpMethod: 'POST',
        headers: { 'x-etsy-signature': 'bad-sig' },
        body,
      })
    );
    expect(result.statusCode).toBe(401);
  });

  it('processes valid webhook with correct signature', async () => {
    const payload = JSON.stringify({ event_type: 'RECEIPT_PAYMENT_COMPLETE', shop_id: 'shop-wh' });
    const sig = sign(payload);

    const result = await handleWebhook(
      makeEvent({
        httpMethod: 'POST',
        headers: { 'x-etsy-signature': sig },
        body: payload,
      })
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { received: boolean; eventType: string };
    expect(body.received).toBe(true);
    expect(body.eventType).toBe('RECEIPT_PAYMENT_COMPLETE');
  });

  it('returns 400 for invalid JSON body', async () => {
    const badBody = 'not-json';
    const sig = sign(badBody);
    const result = await handleWebhook(
      makeEvent({
        httpMethod: 'POST',
        headers: { 'x-etsy-signature': sig },
        body: badBody,
      })
    );
    expect(result.statusCode).toBe(400);
  });

  it('skips signature check when ETSY_WEBHOOK_SECRET is not set', async () => {
    const original = process.env.ETSY_WEBHOOK_SECRET;
    delete process.env.ETSY_WEBHOOK_SECRET;

    const result = await handleWebhook(
      makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ event_type: 'SHOP_UPDATED', shop_id: 'shop-x' }),
      })
    );
    expect(result.statusCode).toBe(200);

    process.env.ETSY_WEBHOOK_SECRET = original;
  });
});

// ---------------------------------------------------------------------------
// scheduledSync
// ---------------------------------------------------------------------------

describe('scheduledSync', () => {
  beforeEach(() => {
    mockGetToken.mockClear();
    mockFetch.mockClear();
  });

  it('completes without error when no shop IDs are configured', async () => {
    const original = process.env.ETSY_SHOP_IDS;
    delete process.env.ETSY_SHOP_IDS;
    await expect(scheduledSync({})).resolves.toBeUndefined();
    process.env.ETSY_SHOP_IDS = original;
  });

  it('syncs all three types for each configured shop', async () => {
    process.env.ETSY_SHOP_IDS = 'shop-s1,shop-s2';

    // For each shop: getToken + products fetch + listings fetch + per-listing inventory + orders fetch
    // shop-s1
    mockGetToken
      .mockResolvedValueOnce({ shopId: 'shop-s1', accessToken: 'tok-s1', refreshToken: 'rt-s1', expiresAt: Date.now() + 3600_000 })
      .mockResolvedValueOnce({ shopId: 'shop-s2', accessToken: 'tok-s2', refreshToken: 'rt-s2', expiresAt: Date.now() + 3600_000 });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], count: 0 }),
    });

    await expect(scheduledSync({ source: 'aws.events' })).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalled();

    delete process.env.ETSY_SHOP_IDS;
  });

  it('continues syncing remaining shops when one fails', async () => {
    process.env.ETSY_SHOP_IDS = 'shop-fail,shop-ok';

    mockGetToken
      .mockResolvedValueOnce(null) // shop-fail has no token → error
      .mockResolvedValueOnce({ shopId: 'shop-ok', accessToken: 'tok-ok', refreshToken: 'rt-ok', expiresAt: Date.now() + 3600_000 });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], count: 0 }),
    });

    await expect(scheduledSync({})).resolves.toBeUndefined();

    delete process.env.ETSY_SHOP_IDS;
  });
});

// ---------------------------------------------------------------------------
// Auth middleware (requireAuth)
// ---------------------------------------------------------------------------

describe('Auth middleware (requireAuth)', () => {
  it('accepts demo-token-12345', async () => {
    const result = await syncProducts(
      makeEvent({
        httpMethod: 'POST',
        headers: { authorization: 'Bearer demo-token-12345' },
        queryStringParameters: { shop_id: 'x' },
      })
    );
    // Will fail at getToken (returns null) → 500 or 400, but NOT 401
    expect(result.statusCode).not.toBe(401);
  });

  it('returns 401 for missing Authorization header', async () => {
    const result = await syncProducts(makeEvent({ httpMethod: 'POST' }));
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for malformed Authorization header', async () => {
    const result = await syncProducts(
      makeEvent({ httpMethod: 'POST', headers: { authorization: 'Token bad' } })
    );
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 for expired JWT', async () => {
    const expired = jwt.sign({ id: 1, username: 'artadmin' }, 'test-secret', { expiresIn: -1 });
    const result = await syncProducts(
      makeEvent({ httpMethod: 'POST', headers: { authorization: `Bearer ${expired}` } })
    );
    expect(result.statusCode).toBe(401);
  });

  it('accepts lowercase authorization header', async () => {
    mockGetToken.mockResolvedValueOnce({
      shopId: 'shop-lc',
      accessToken: 'tok-lc',
      refreshToken: 'rt-lc',
      expiresAt: Date.now() + 3600_000,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 0 }),
    });

    const token = jwt.sign({ id: 1, username: 'artadmin' }, 'test-secret');
    const result = await syncProducts(
      makeEvent({
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${token}` },
        queryStringParameters: { shop_id: 'shop-lc' },
      })
    );
    expect(result.statusCode).toBe(200);
  });
});
