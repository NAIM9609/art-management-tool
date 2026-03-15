/**
 * Analytics event tracking utilities.
 *
 * Supports Google Analytics 4, AWS CloudWatch RUM and a configurable custom
 * endpoint.  Privacy controls: honours the Do-Not-Track header and strips PII
 * before every event is dispatched.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductViewEvent {
  type: 'product_view';
  productId: string;
  productName: string;
  price: number;
  category?: string;
}

export interface AddToCartEvent {
  type: 'add_to_cart';
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface CheckoutInitiatedEvent {
  type: 'checkout_initiated';
  cartTotal: number;
  itemCount: number;
}

export interface OrderCompletedEvent {
  type: 'order_completed';
  orderId: string;
  total: number;
  itemCount: number;
}

export interface SearchEvent {
  type: 'search';
  query: string;
  resultCount: number;
}

export interface WebVitalEvent {
  type: 'web_vital';
  name: string;
  value: number;
  rating: string;
}

export type AnalyticsEvent =
  | ProductViewEvent
  | AddToCartEvent
  | CheckoutInitiatedEvent
  | OrderCompletedEvent
  | SearchEvent
  | WebVitalEvent;

export interface AnalyticsConfig {
  /** Google Analytics 4 Measurement ID (e.g. "G-XXXXXXXXXX"). Optional. */
  ga4MeasurementId?: string;
  /** URL of a custom aggregation endpoint that accepts POST requests. Optional. */
  customEndpointUrl?: string;
}

// ---------------------------------------------------------------------------
// Privacy helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the browser signals the user has opted out of tracking
 * via the Do-Not-Track or Global Privacy Control headers.
 */
export function isDoNotTrack(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Standard DNT
  if (navigator.doNotTrack === '1') return true;
  // Legacy IE / Edge
  if ((navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack === '1') return true;
  // Global Privacy Control (GPC)
  if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true) return true;
  return false;
}

/** Regex for common PII patterns (email, phone). */
const PII_PATTERN = /\b[\w.+-]+@[\w-]+\.\w{2,}\b|\b\d[\d\s()+.-]{6,}\d\b/g;

/**
 * Removes potential PII from a string value.
 * Replaces email addresses and phone-like patterns with a placeholder.
 */
export function stripPII(value: string): string {
  return value.replace(PII_PATTERN, '[redacted]');
}

/**
 * Sanitize an analytics event by stripping PII from string fields.
 * Returns a new event object – the original is never mutated.
 */
export function sanitizeEvent(event: AnalyticsEvent): AnalyticsEvent {
  if (event.type === 'search') {
    return { ...event, query: stripPII(event.query) };
  }
  if (event.type === 'product_view') {
    return { ...event, productName: stripPII(event.productName) };
  }
  if (event.type === 'add_to_cart') {
    return { ...event, productName: stripPII(event.productName) };
  }
  return event;
}

// ---------------------------------------------------------------------------
// Destination adapters
// ---------------------------------------------------------------------------

/**
 * Send an event to Google Analytics 4 via the gtag function.
 * No-ops when `window.gtag` is not present.
 */
function sendToGA4(event: AnalyticsEvent, measurementId?: string): void {
  if (typeof window === 'undefined') return;
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== 'function') return;
  if (measurementId) {
    gtag('config', measurementId);
  }
  gtag('event', event.type, { ...event, type: undefined });
}

/**
 * Send an event to AWS CloudWatch RUM via the cwr function.
 * No-ops when the CloudWatch RUM client is not present.
 */
function sendToCloudWatch(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  const cwr = (window as Window & { cwr?: (command: string, payload: unknown) => void }).cwr;
  if (typeof cwr !== 'function') return;
  cwr('recordEvent', { type: event.type, data: { ...event, type: undefined } });
}

/**
 * POST an event to a custom aggregation endpoint.
 * Failures are silently ignored so tracking never breaks the user experience.
 */
function sendToCustomEndpoint(event: AnalyticsEvent, url: string): void {
  if (typeof fetch === 'undefined') return;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, timestamp: Date.now() }),
    // Keep-alive lets the request complete even when the page unloads
    keepalive: true,
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// AnalyticsTracker class
// ---------------------------------------------------------------------------

class AnalyticsTracker {
  private config: AnalyticsConfig = {};

  /** Configure destination endpoints. Call once during app initialisation. */
  configure(config: AnalyticsConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Track an analytics event.
   *
   * No-ops silently when Do-Not-Track is active.
   * Strips PII before dispatching to any destination.
   */
  track(event: AnalyticsEvent): void {
    if (isDoNotTrack()) return;

    const safe = sanitizeEvent(event);

    sendToGA4(safe, this.config.ga4MeasurementId);
    sendToCloudWatch(safe);

    if (this.config.customEndpointUrl) {
      sendToCustomEndpoint(safe, this.config.customEndpointUrl);
    }
  }

  // ---------------------------------------------------------------------------
  // Convenience helpers
  // ---------------------------------------------------------------------------

  trackProductView(params: Omit<ProductViewEvent, 'type'>): void {
    this.track({ type: 'product_view', ...params });
  }

  trackAddToCart(params: Omit<AddToCartEvent, 'type'>): void {
    this.track({ type: 'add_to_cart', ...params });
  }

  trackCheckoutInitiated(params: Omit<CheckoutInitiatedEvent, 'type'>): void {
    this.track({ type: 'checkout_initiated', ...params });
  }

  trackOrderCompleted(params: Omit<OrderCompletedEvent, 'type'>): void {
    this.track({ type: 'order_completed', ...params });
  }

  trackSearch(params: Omit<SearchEvent, 'type'>): void {
    this.track({ type: 'search', ...params });
  }
}

export const analyticsTracker = new AnalyticsTracker();
export { AnalyticsTracker };
