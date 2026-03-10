/**
 * Performance monitoring utilities.
 *
 * Tracks Web Vitals, custom metrics (API/image response times, cache hit rate,
 * page load time) and error reports (uncaught errors, API errors, console errors).
 * All data can be forwarded to an external analytics sink via `setSendCallback`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebVitalName = 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'FCP' | 'INP';
export type MetricRating = 'good' | 'needs-improvement' | 'poor';

export interface WebVitalMetric {
  name: WebVitalName;
  value: number;
  rating: MetricRating;
  navigationType?: string;
  id?: string;
}

export type MetricUnit = 'ms' | 'bytes' | 'percent' | 'count';

export interface CustomMetric {
  name: string;
  value: number;
  unit: MetricUnit;
  labels?: Record<string, string>;
  timestamp: number;
}

export type ErrorType = 'uncaught' | 'api' | 'console';

export interface ErrorReport {
  type: ErrorType;
  message: string;
  stack?: string;
  url?: string;
  timestamp: number;
  labels?: Record<string, string>;
}

export type PerformancePayload =
  | { kind: 'web_vital'; metric: WebVitalMetric }
  | { kind: 'custom_metric'; metric: CustomMetric }
  | { kind: 'error'; report: ErrorReport };

export type SendCallback = (payload: PerformancePayload) => void;

// ---------------------------------------------------------------------------
// Web Vital rating thresholds (aligned with Google CrUX)
// ---------------------------------------------------------------------------

const THRESHOLDS: Record<WebVitalName, [number, number]> = {
  LCP:  [2500, 4000],
  FID:  [100,  300],
  CLS:  [0.1,  0.25],
  TTFB: [800,  1800],
  FCP:  [1800, 3000],
  INP:  [200,  500],
};

function rateMetric(name: WebVitalName, value: number): MetricRating {
  const [good, poor] = THRESHOLDS[name];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

// ---------------------------------------------------------------------------
// PerformanceMonitor class
// ---------------------------------------------------------------------------

class PerformanceMonitor {
  private sendCallback?: SendCallback;
  private cacheHits = 0;
  private cacheMisses = 0;
  private errorTracking = false;
  private originalConsoleError?: typeof console.error;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /** Register a callback that receives every performance payload for external delivery. */
  setSendCallback(cb: SendCallback): void {
    this.sendCallback = cb;
  }

  // ---------------------------------------------------------------------------
  // Web Vitals
  // ---------------------------------------------------------------------------

  /**
   * Report a Web Vital metric.  Call this inside `useReportWebVitals` or
   * any PerformanceObserver-based collector.
   */
  reportWebVital(metric: WebVitalMetric): void {
    const enriched: WebVitalMetric = {
      ...metric,
      rating: rateMetric(metric.name, metric.value),
    };
    this.send({ kind: 'web_vital', metric: enriched });
  }

  // ---------------------------------------------------------------------------
  // Custom metrics
  // ---------------------------------------------------------------------------

  /** Record how long an API request to `endpoint` took (in milliseconds). */
  recordApiResponseTime(endpoint: string, durationMs: number): void {
    this.send({
      kind: 'custom_metric',
      metric: {
        name: 'api_response_time',
        value: durationMs,
        unit: 'ms',
        labels: { endpoint },
        timestamp: Date.now(),
      },
    });
  }

  /** Record how long an image at `url` took to load (in milliseconds). */
  recordImageLoadTime(url: string, durationMs: number): void {
    this.send({
      kind: 'custom_metric',
      metric: {
        name: 'image_load_time',
        value: durationMs,
        unit: 'ms',
        labels: { url },
        timestamp: Date.now(),
      },
    });
  }

  /** Increment the image-cache hit counter. */
  recordCacheHit(): void {
    this.cacheHits += 1;
  }

  /** Increment the image-cache miss counter. */
  recordCacheMiss(): void {
    this.cacheMisses += 1;
  }

  /** Return the cache hit rate as a value between 0 and 1. */
  getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total === 0 ? 0 : this.cacheHits / total;
  }

  /** Record page load time for the given route. */
  recordPageLoadTime(route: string, durationMs: number): void {
    this.send({
      kind: 'custom_metric',
      metric: {
        name: 'page_load_time',
        value: durationMs,
        unit: 'ms',
        labels: { route },
        timestamp: Date.now(),
      },
    });
  }

  /** Flush the current cache hit rate as a custom metric. */
  flushCacheHitRate(): void {
    this.send({
      kind: 'custom_metric',
      metric: {
        name: 'cache_hit_rate',
        value: this.getCacheHitRate(),
        unit: 'percent',
        timestamp: Date.now(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Error tracking
  // ---------------------------------------------------------------------------

  /** Report an error directly. */
  trackError(report: ErrorReport): void {
    this.send({ kind: 'error', report });
  }

  /**
   * Attach global error handlers for uncaught exceptions, unhandled promise
   * rejections and console.error calls.  Safe to call multiple times (no-ops
   * after the first call).
   */
  setupErrorTracking(): void {
    if (typeof window === 'undefined' || this.errorTracking) return;
    this.errorTracking = true;

    window.addEventListener('error', (event: ErrorEvent) => {
      this.trackError({
        type: 'uncaught',
        message: event.message || 'Unknown error',
        stack: event.error?.stack,
        url: event.filename,
        timestamp: Date.now(),
      });
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      this.trackError({
        type: 'uncaught',
        message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection'),
        stack: reason instanceof Error ? reason.stack : undefined,
        timestamp: Date.now(),
      });
    });

    // Wrap console.error to capture errors logged this way.
    // The arrow function captures `this` from the enclosing method scope.
    this.originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      this.originalConsoleError!(...args);
      const message = args
        .map((a) => (a instanceof Error ? a.message : String(a ?? '')))
        .join(' ');
      this.trackError({
        type: 'console',
        message,
        timestamp: Date.now(),
      });
    };
  }

  /** Remove global error handlers and restore original console.error. */
  teardownErrorTracking(): void {
    if (!this.errorTracking) return;
    this.errorTracking = false;
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
      this.originalConsoleError = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private send(payload: PerformancePayload): void {
    this.sendCallback?.(payload);
  }
}

export const performanceMonitor = new PerformanceMonitor();
export { PerformanceMonitor, rateMetric };
