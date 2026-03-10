// Common API utilities for authentication and fetch operations

// ==================== Cache ====================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const apiCache = new Map<string, CacheEntry<unknown>>();

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
  apiCache.set(key, { data, expiresAt: Date.now() + ttlMs });
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

async function parseErrorResponse(response: Response): Promise<string> {
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

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const startTime = Date.now();
    try {
      logDev(
        `${options.method || 'GET'} ${url}${attempt > 1 ? ` (attempt ${attempt}/${retries})` : ''}`
      );

      const response = await fetch(url, options);
      const elapsed = Date.now() - startTime;

      logDev(`${options.method || 'GET'} ${url} → ${response.status} (${elapsed}ms)`);

      // Don't retry on client errors (4xx) or when retries are exhausted
      if (response.status < 500 || attempt === retries) {
        return response;
      }

      // Retry on 5xx with exponential backoff: 1s, 2s, 4s
      const delay = backoffMs(attempt);
      logDev(`Retrying in ${delay}ms (status ${response.status})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      const elapsed = Date.now() - startTime;
      logDev(`${options.method || 'GET'} ${url} → network error (${elapsed}ms)`, error);

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

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || '';
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

  const fullUrl = `${getApiBaseUrl()}${url}`;
  const response = await fetchWithRetry(fullUrl, { ...options, headers });

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(`HTTP ${response.status}: ${errorMessage}`);
  }

  return response.json();
}

export async function uploadFile(
  url: string,
  formData: FormData,
  useAuth = true
): Promise<Response> {
  const headers: HeadersInit = useAuth ? getAuthHeaders() : {};
  const fullUrl = `${getApiBaseUrl()}${url}`;

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
