// Common API utilities for authentication and fetch operations

// ==================== Cache ====================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const apiCache = new Map<string, CacheEntry<unknown>>();
const CACHE_MAX_ENTRIES = 500;

function pruneExpiredCacheEntries(): void {
  const now = Date.now();
  for (const [key, entry] of apiCache.entries()) {
    if (now > entry.expiresAt) {
      apiCache.delete(key);
    }
  }
}

function enforceCacheSizeLimit(): void {
  if (apiCache.size <= CACHE_MAX_ENTRIES) return;

  // Remove oldest entries first (Map preserves insertion order).
  const overflow = apiCache.size - CACHE_MAX_ENTRIES;
  let removed = 0;
  for (const key of apiCache.keys()) {
    apiCache.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

/** TTL constants (milliseconds) */
export const CACHE_TTL = {
  PRODUCTS: 5 * 60 * 1000,   // 5 minutes
  CONTENT: 10 * 60 * 1000,   // 10 minutes (personaggi, fumetti)
} as const;

export function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  pruneExpiredCacheEntries();
  apiCache.set(key, { data, expiresAt: Date.now() + ttlMs });
  enforceCacheSizeLimit();
}

/** Removes all cache entries whose key starts with the given prefix. */
export function invalidateCache(keyPrefix: string): void {
  for (const key of apiCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      apiCache.delete(key);
    }
  }
}

// ==================== Logging ====================

function logDev(message: string, data?: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    if (data !== undefined) {
      console.log(`[API] ${message}`, data);
    } else {
      console.log(`[API] ${message}`);
    }
  }
}

// ==================== Error Handling ====================

export async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const data = await response.json();
    // Handle Lambda/API Gateway error formats
    return (
      data.error ||
      data.message ||
      data.errorMessage ||
      `HTTP ${response.status}`
    );
  } catch {
    try {
      const text = await response.text();
      return text || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}: ${response.statusText}`;
    }
  }
}

// ==================== Retry Logic ====================

const MAX_RETRIES = 3;

/** Compute exponential back-off delay in milliseconds: 1 s, 2 s, 4 s … */
function backoffMs(attempt: number): number {
  return Math.pow(2, attempt - 1) * 1000;
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

  for (let attempt = 1; attempt <= retries; attempt++) {
    const startTime = Date.now();
    try {
      logDev(
        `${method} ${url}${attempt > 1 ? ` (attempt ${attempt}/${retries})` : ''}`
      );

      const response = await fetch(url, options);
      const elapsed = Date.now() - startTime;

      logDev(`${method} ${url} → ${response.status} (${elapsed}ms)`);

      // Don't retry on client errors (4xx)
      if (response.status < 500) {
        return response;
      }

      // Avoid retries for non-idempotent methods to prevent duplicate side effects.
      if (!isIdempotent || attempt === retries) {
        return response;
      }

      // Retry on 5xx with exponential backoff: 1s, 2s, 4s
      const delay = backoffMs(attempt);
      logDev(`Retrying in ${delay}ms (status ${response.status})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logDev(`${method} ${url} → network error (${elapsed}ms)`, error);

      if (!isIdempotent) {
        throw error;
      }

      if (attempt === retries) throw error;

      const delay = backoffMs(attempt);
      logDev(`Retrying in ${delay}ms after network error`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}

// ==================== Auth ====================

export function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type ServiceName =
  | 'product'
  | 'cart'
  | 'order'
  | 'content'
  | 'discount'
  | 'notification'
  | 'integration';

function normalizeBaseUrl(baseUrl: string | undefined): string {
  const value = baseUrl?.trim();
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function serviceFromPath(path: string): ServiceName {
  if (path.startsWith('/api/cart')) return 'cart';
  if (path.startsWith('/api/orders') || path.startsWith('/api/admin/orders') || path.startsWith('/api/webhooks/payment')) return 'order';
  if (path.startsWith('/api/personaggi') || path.startsWith('/api/fumetti') || path.startsWith('/api/upload')) return 'content';
  if (path.startsWith('/api/discounts') || path.startsWith('/api/admin/discounts')) return 'discount';
  if (path.startsWith('/api/admin/notifications')) return 'notification';
  if (path.startsWith('/api/integrations/etsy') || path.startsWith('/api/admin/integrations/etsy') || path.startsWith('/api/webhooks/etsy')) return 'integration';
  return 'product';
}

function baseUrlForService(service: ServiceName): string {
  const defaultBase = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);

  const serviceBaseMap: Record<ServiceName, string> = {
    product: normalizeBaseUrl(process.env.NEXT_PUBLIC_PRODUCT_API_URL) || defaultBase,
    cart: normalizeBaseUrl(process.env.NEXT_PUBLIC_CART_API_URL) || defaultBase,
    order: normalizeBaseUrl(process.env.NEXT_PUBLIC_ORDER_API_URL) || defaultBase,
    content: normalizeBaseUrl(process.env.NEXT_PUBLIC_CONTENT_API_URL) || defaultBase,
    discount: normalizeBaseUrl(process.env.NEXT_PUBLIC_DISCOUNT_API_URL) || defaultBase,
    notification: normalizeBaseUrl(process.env.NEXT_PUBLIC_NOTIFICATION_API_URL) || defaultBase,
    integration: normalizeBaseUrl(process.env.NEXT_PUBLIC_INTEGRATION_API_URL) || defaultBase,
  };

  const resolved = serviceBaseMap[service];
  if (!resolved) {
    throw new Error('Missing API base URL configuration. Set NEXT_PUBLIC_API_URL or service-specific NEXT_PUBLIC_*_API_URL variables.');
  }

  return resolved;
}

export function getApiBaseUrl(path = '/api/products'): string {
  return baseUrlForService(serviceFromPath(path));
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${getApiBaseUrl(path)}${path}`;
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  logDev(`parseSuccessResponse status=${response.status} content-type=${response.headers.get('content-type') || 'n/a'}`);

  // No-content successful responses are valid and should not throw JSON parse errors.
  if (response.status === 204 || response.status === 205) {
    logDev('parseSuccessResponse: no-content status, returning null');
    return null as T;
  }

  const raw = await response.text();
  logDev(`parseSuccessResponse: raw length=${raw.length}`);
  if (!raw || !raw.trim()) {
    logDev('parseSuccessResponse: empty body, returning null');
    return null as T;
  }

  try {
    const parsed = JSON.parse(raw) as T;
    logDev('parseSuccessResponse: JSON.parse succeeded');
    return parsed;
  } catch (error) {
    const contentType = response.headers.get('content-type') || '';
    logDev('parseSuccessResponse: JSON.parse failed', {
      contentType,
      error: error instanceof Error ? error.message : String(error),
      preview: raw.slice(0, 200),
    });
    if (contentType.includes('application/json')) {
      throw new Error('Invalid JSON response body');
    }

    return raw as T;
  }
}

export async function fetchWithAuth<T>(
  url: string,
  options?: RequestInit,
  useAuth = false
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (useAuth) {
    Object.assign(headers, getAuthHeaders());
  }

  const fullUrl = resolveApiUrl(url);
  logDev(`fetchWithAuth url=${fullUrl} useAuth=${useAuth}`);
  const response = await fetchWithRetry(fullUrl, { ...options, headers });
  logDev(`fetchWithAuth response status=${response.status} ok=${response.ok}`);

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    logDev('fetchWithAuth non-ok response', { errorMessage });
    throw new Error(`HTTP ${response.status}: ${errorMessage}`);
  }

  return parseSuccessResponse<T>(response);
}

export async function uploadFile(
  url: string,
  formData: FormData,
  useAuth = true
): Promise<Response> {
  const headers: HeadersInit = useAuth ? getAuthHeaders() : {};
  const fullUrl = resolveApiUrl(url);

  logDev(`POST (upload) ${fullUrl}`);

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(`HTTP ${response.status}: ${errorMessage}`);
  }

  return response;
}
