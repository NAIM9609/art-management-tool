/**
 * Etsy Integration Lambda Handlers
 *
 * OAuth endpoints (public – no auth required):
 *   GET  /api/integrations/etsy/auth       -> initiateOAuth
 *   GET  /api/integrations/etsy/callback   -> handleCallback
 *
 * Admin sync endpoints (require auth):
 *   POST /api/admin/integrations/etsy/sync/products   -> syncProducts
 *   POST /api/admin/integrations/etsy/sync/inventory  -> syncInventory
 *   POST /api/admin/integrations/etsy/sync/orders     -> syncOrders
 *
 * Webhook endpoint (verified via HMAC signature):
 *   POST /api/webhooks/etsy -> handleWebhook
 *
 * Scheduled sync (EventBridge):
 *   Invoked daily by EventBridge – calls syncProducts, syncInventory, syncOrders
 */

import crypto from 'crypto';
import { requireAuth, AuthError } from '../auth';
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  successResponse,
  errorResponse,
} from '../types';
import {
  EtsyTokenRecord,
  saveToken,
  getToken,
  saveOAuthState,
  getOAuthState,
  deleteOAuthState,
} from '../tokenStore';

// ---------------------------------------------------------------------------
// Environment / config helpers
// ---------------------------------------------------------------------------

function getEtsyConfig() {
  return {
    clientId: process.env.ETSY_CLIENT_ID || '',
    clientSecret: process.env.ETSY_CLIENT_SECRET || '',
    redirectUri: process.env.ETSY_REDIRECT_URI || '',
    webhookSecret: process.env.ETSY_WEBHOOK_SECRET || '',
    apiBaseUrl: 'https://api.etsy.com/v3',
    oauthBaseUrl: 'https://www.etsy.com/oauth',
  };
}

function getRuntimeEnvironment(): string {
  return (process.env.NODE_ENV || process.env.ENVIRONMENT || '').toLowerCase();
}

function isDevelopmentLikeEnvironment(): boolean {
  const runtimeEnvironment = getRuntimeEnvironment();
  return runtimeEnvironment === 'development'
    || runtimeEnvironment === 'dev'
    || runtimeEnvironment === 'test';
}

function isMissingEtsyCredentialsError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No Etsy credentials found for shop');
}

class IntegrationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'IntegrationError';
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Shared error handler
// ---------------------------------------------------------------------------

function handleError(error: unknown): APIGatewayProxyResult {
  if (error instanceof AuthError) {
    return errorResponse(error.message, error.statusCode);
  }
  if (error instanceof IntegrationError) {
    return errorResponse(error.message, error.statusCode);
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('not found')) {
      return errorResponse(error.message, 404);
    }
    if (message.includes('invalid') || message.includes('required') || message.includes('missing')) {
      return errorResponse(error.message, 400);
    }
    if (message.includes('unauthorized') || message.includes('forbidden')) {
      return errorResponse(error.message, 403);
    }
  }
  console.error('Unhandled error:', error);
  return errorResponse('Internal server error', 500);
}

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

function buildAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
  const scopes = [
    'listings_r',
    'listings_w',
    'listings_d',
    'transactions_r',
    'inventory_r',
    'inventory_w',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  });

  return `https://www.etsy.com/oauth/connect?${params.toString()}`;
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number; shop_id?: string }> {
  const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Etsy token exchange failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    shop_id?: string;
  }>;
}

async function fetchNewAccessToken(
  refreshTokenValue: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue,
    }).toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Etsy token refresh failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

// ---------------------------------------------------------------------------
// Etsy API helpers
// ---------------------------------------------------------------------------

async function etsyGet(path: string, accessToken: string): Promise<unknown> {
  const config = getEtsyConfig();
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': config.clientId,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Etsy API error (${response.status}): ${body}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// 1. OAuth – initiateOAuth
//    GET /api/integrations/etsy/auth
// ---------------------------------------------------------------------------

export async function initiateOAuth(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const config = getEtsyConfig();

    if (!config.clientId) {
      return errorResponse('Etsy integration is not configured', 503);
    }

    if (!config.redirectUri) {
      return errorResponse('Etsy redirect URI is not configured', 503);
    }

    const state = generateState();
    await saveOAuthState({
      state,
      // 10-minute validity window for callback state verification.
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    const authUrl = buildAuthorizationUrl(config.clientId, config.redirectUri, state);

    return {
      statusCode: 302,
      headers: {
        Location: authUrl,
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ redirectUrl: authUrl, state }),
    };
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// 2. OAuth – handleCallback
//    GET /api/integrations/etsy/callback
// ---------------------------------------------------------------------------

export async function handleCallback(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const qs = event.queryStringParameters || {};
    const { code, state, error: oauthError, error_description } = qs;

    if (oauthError) {
      return errorResponse(error_description || oauthError, 400);
    }

    if (!code) {
      return errorResponse('Missing authorization code', 400);
    }

    if (!state) {
      return errorResponse('Missing OAuth state', 400);
    }

    const storedState = await getOAuthState(state);
    if (!storedState || storedState.expiresAt < Date.now()) {
      return errorResponse('Invalid or expired OAuth state', 400);
    }

    const config = getEtsyConfig();

    if (!config.clientId || !config.clientSecret) {
      return errorResponse('Etsy integration is not configured', 503);
    }

    const tokens = await exchangeCodeForTokens(
      code,
      config.redirectUri,
      config.clientId,
      config.clientSecret
    );

    const shopId = tokens.shop_id || qs.shop_id;
    if (!shopId) {
      return errorResponse('Missing Etsy shop_id', 400);
    }
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    await saveToken({
      shopId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });

    // One-time use callback state; remove after successful token persistence.
    await deleteOAuthState(state);

    return successResponse({
      message: 'Etsy OAuth completed successfully',
      shopId,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// 3. OAuth – refreshToken
//    Called internally (not directly via API Gateway)
// ---------------------------------------------------------------------------

export async function refreshToken(shopId: string): Promise<EtsyTokenRecord> {
  const existing = await getToken(shopId);

  if (!existing) {
    throw new Error(`Token not found for shop ${shopId}`);
  }

  const config = getEtsyConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error('Etsy integration is not configured');
  }

  const tokens = await fetchNewAccessToken(
    existing.refreshToken,
    config.clientId,
    config.clientSecret
  );

  const expiresAt = Date.now() + tokens.expires_in * 1000;
  const updated: EtsyTokenRecord = {
    shopId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  };

  await saveToken(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Helper: get a valid access token, refreshing if expired
// ---------------------------------------------------------------------------

async function getValidAccessToken(shopId: string): Promise<string> {
  let record = await getToken(shopId);

  if (!record) {
    throw new IntegrationError(
      `No Etsy credentials found for shop ${shopId}. Complete OAuth first.`,
      404
    );
  }

  // Refresh if the token expires within the next 60 seconds
  if (record.expiresAt - Date.now() < 60_000) {
    record = await refreshToken(shopId);
  }

  return record.accessToken;
}

// ---------------------------------------------------------------------------
// Helper: extract shop_id from query string or JSON body
// ---------------------------------------------------------------------------

function extractShopId(event: APIGatewayProxyEvent): string | undefined {
  const qs = event.queryStringParameters || {};
  if (qs.shop_id) {
    return qs.shop_id;
  }
  if (event.body) {
    try {
      return (JSON.parse(event.body) as Record<string, string>).shop_id;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function getInventorySyncConcurrency(): number {
  const parsed = parseInt(process.env.ETSY_SYNC_CONCURRENCY || '5', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 5;
  }
  return Math.min(parsed, 20);
}

async function syncInventoryListings(
  listings: Array<{ listing_id: number }>,
  accessToken: string,
  concurrency: number
): Promise<number> {
  if (listings.length === 0) {
    return 0;
  }

  let nextIndex = 0;
  let syncedCount = 0;

  const worker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= listings.length) {
        return;
      }

      const listing = listings[current];
      await etsyGet(`/application/listings/${listing.listing_id}/inventory`, accessToken);
      syncedCount += 1;
    }
  };

  const workerCount = Math.min(concurrency, listings.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return syncedCount;
}

// ---------------------------------------------------------------------------
// 4. Sync – syncProducts
//    POST /api/admin/integrations/etsy/sync/products
// ---------------------------------------------------------------------------

export async function syncProducts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const shopId = extractShopId(event);

    if (!shopId) {
      return errorResponse('shop_id is required', 400);
    }

    const accessToken = await getValidAccessToken(shopId);

    const data = await etsyGet(`/application/shops/${shopId}/listings/active`, accessToken) as {
      results?: unknown[];
      count?: number;
    };

    const count = data?.count ?? (data?.results?.length ?? 0);

    return successResponse({
      message: 'Etsy products sync completed',
      shopId,
      syncedCount: count,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// 5. Sync – syncInventory
//    POST /api/admin/integrations/etsy/sync/inventory
// ---------------------------------------------------------------------------

export async function syncInventory(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const shopId = extractShopId(event);

    if (!shopId) {
      return errorResponse('shop_id is required', 400);
    }

    const accessToken = await getValidAccessToken(shopId);

    // Fetch active listings to retrieve inventory for each
    const listingsData = await etsyGet(
      `/application/shops/${shopId}/listings/active?includes=inventory`,
      accessToken
    ) as { results?: Array<{ listing_id: number }> };

    const listings = listingsData?.results ?? [];
    const syncedCount = await syncInventoryListings(
      listings,
      accessToken,
      getInventorySyncConcurrency()
    );

    return successResponse({
      message: 'Etsy inventory sync completed',
      shopId,
      syncedCount,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// 6. Sync – syncOrders
//    POST /api/admin/integrations/etsy/sync/orders
// ---------------------------------------------------------------------------

export async function syncOrders(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    requireAuth(event);

    const shopId = extractShopId(event);

    if (!shopId) {
      return errorResponse('shop_id is required', 400);
    }

    const accessToken = await getValidAccessToken(shopId);

    const data = await etsyGet(
      `/application/shops/${shopId}/receipts?was_paid=true&was_shipped=false`,
      accessToken
    ) as { results?: unknown[]; count?: number };

    const count = data?.count ?? (data?.results?.length ?? 0);

    return successResponse({
      message: 'Etsy orders sync completed',
      shopId,
      syncedCount: count,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// 7. Webhook – handleWebhook
//    POST /api/webhooks/etsy
// ---------------------------------------------------------------------------

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  // Use timingSafeEqual to prevent timing attacks
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

export async function handleWebhook(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const config = getEtsyConfig();

    const headers = event.headers || {};
    const signature =
      headers['x-etsy-signature'] ||
      headers['X-Etsy-Signature'] ||
      '';

    const rawBody = event.body || '';
    const isDevOrTestEnv = isDevelopmentLikeEnvironment();

    if (!config.webhookSecret) {
      if (!isDevOrTestEnv) {
        console.error(
          '[integration-service] ETSY_WEBHOOK_SECRET is missing; refusing webhooks in non-dev environment.'
        );
        return errorResponse('Etsy webhook configuration error', 503);
      }
      console.warn(
        '[integration-service] ETSY_WEBHOOK_SECRET is unset; signature verification skipped in dev/test.'
      );
    }

    if (config.webhookSecret && !verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
      return errorResponse('Invalid webhook signature', 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return errorResponse('Invalid JSON payload', 400);
    }

    const eventType = (payload.event_type as string) || (payload.type as string) || 'unknown';
    const shopId = (payload.shop_id as string) || '';

    console.log(`[integration-service] Etsy webhook received: type=${eventType} shop=${shopId}`);

    switch (eventType) {
      case 'RECEIPT_PAYMENT_COMPLETE':
      case 'RECEIPT_SHIPPED':
        // Order-related events – trigger order sync
        console.log(`[integration-service] Order event for shop ${shopId}: ${eventType}`);
        break;

      case 'LISTING_ACTIVE':
      case 'LISTING_INACTIVE':
      case 'LISTING_DELETED':
        // Listing / product events – trigger product sync
        console.log(`[integration-service] Listing event for shop ${shopId}: ${eventType}`);
        break;

      case 'SHOP_UPDATED':
        console.log(`[integration-service] Shop updated: ${shopId}`);
        break;

      default:
        console.log(`[integration-service] Unhandled webhook event type: ${eventType}`);
    }

    return successResponse({ received: true, eventType });
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// 8. Scheduled sync (EventBridge)
//    Triggered daily – runs all three sync operations for all connected shops
// ---------------------------------------------------------------------------

export interface ScheduledEvent {
  source?: string;
  'detail-type'?: string;
  detail?: Record<string, unknown>;
}

export async function scheduledSync(event: ScheduledEvent): Promise<void> {
  console.log('[integration-service] Scheduled sync triggered', JSON.stringify(event));

  // In production, retrieve all connected shop IDs from DynamoDB and sync each one.
  // For now, read a comma-separated list from the environment if provided.
  const shopIds = (process.env.ETSY_SHOP_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (shopIds.length === 0) {
    console.log('[integration-service] No shop IDs configured for scheduled sync.');
    return;
  }

  for (const shopId of shopIds) {
    try {
      console.log(`[integration-service] Running scheduled sync for shop ${shopId}`);

      const accessToken = await getValidAccessToken(shopId);

      // Products
      await etsyGet(`/application/shops/${shopId}/listings/active`, accessToken);
      console.log(`[integration-service] Products synced for shop ${shopId}`);

      // Inventory (fetch listings then inventory per listing with bounded concurrency)
      const listingsData = await etsyGet(
        `/application/shops/${shopId}/listings/active?includes=inventory`,
        accessToken
      ) as { results?: Array<{ listing_id: number }> };
      await syncInventoryListings(
        listingsData?.results ?? [],
        accessToken,
        getInventorySyncConcurrency()
      );
      console.log(`[integration-service] Inventory synced for shop ${shopId}`);

      // Orders
      await etsyGet(
        `/application/shops/${shopId}/receipts?was_paid=true&was_shipped=false`,
        accessToken
      );
      console.log(`[integration-service] Orders synced for shop ${shopId}`);
    } catch (err) {
      if (isMissingEtsyCredentialsError(err)) {
        console.warn(
          `[integration-service] Skipping scheduled sync for shop ${shopId}: OAuth is not connected.`
        );
        continue;
      }

      // Log but continue with remaining shops
      console.error(`[integration-service] Scheduled sync failed for shop ${shopId}:`, err);
    }
  }

  console.log('[integration-service] Scheduled sync complete.');
}
