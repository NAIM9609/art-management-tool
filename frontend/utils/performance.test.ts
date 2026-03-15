/**
 * Unit tests for performance monitoring utilities.
 */

import {
  PerformanceMonitor,
  rateMetric,
  type PerformancePayload,
  type WebVitalMetric,
  type ErrorReport,
} from './performance';

// ---------------------------------------------------------------------------
// rateMetric
// ---------------------------------------------------------------------------

describe('rateMetric', () => {
  it('rates LCP as good when value <= 2500', () => {
    expect(rateMetric('LCP', 2500)).toBe('good');
    expect(rateMetric('LCP', 1000)).toBe('good');
  });

  it('rates LCP as needs-improvement between 2500 and 4000', () => {
    expect(rateMetric('LCP', 2501)).toBe('needs-improvement');
    expect(rateMetric('LCP', 3000)).toBe('needs-improvement');
  });

  it('rates LCP as poor when value > 4000', () => {
    expect(rateMetric('LCP', 4001)).toBe('poor');
    expect(rateMetric('LCP', 9000)).toBe('poor');
  });

  it('rates CLS correctly', () => {
    expect(rateMetric('CLS', 0.05)).toBe('good');
    expect(rateMetric('CLS', 0.15)).toBe('needs-improvement');
    expect(rateMetric('CLS', 0.30)).toBe('poor');
  });

  it('rates FID correctly', () => {
    expect(rateMetric('FID', 50)).toBe('good');
    expect(rateMetric('FID', 200)).toBe('needs-improvement');
    expect(rateMetric('FID', 400)).toBe('poor');
  });

  it('rates TTFB correctly', () => {
    expect(rateMetric('TTFB', 800)).toBe('good');
    expect(rateMetric('TTFB', 1200)).toBe('needs-improvement');
    expect(rateMetric('TTFB', 2000)).toBe('poor');
  });
});

// ---------------------------------------------------------------------------
// PerformanceMonitor
// ---------------------------------------------------------------------------

function makeMonitor() {
  const monitor = new PerformanceMonitor();
  const payloads: PerformancePayload[] = [];
  monitor.setSendCallback((p) => payloads.push(p));
  return { monitor, payloads };
}

describe('PerformanceMonitor.reportWebVital', () => {
  it('sends a web_vital payload with an enriched rating', () => {
    const { monitor, payloads } = makeMonitor();
    const metric: WebVitalMetric = { name: 'LCP', value: 5000 };
    monitor.reportWebVital(metric);

    expect(payloads).toHaveLength(1);
    const p = payloads[0];
    expect(p.kind).toBe('web_vital');
    if (p.kind === 'web_vital') {
      expect(p.metric.rating).toBe('poor');
      expect(p.metric.name).toBe('LCP');
      expect(p.metric.value).toBe(5000);
    }
  });
});

describe('PerformanceMonitor.recordApiResponseTime', () => {
  it('sends a custom_metric with name api_response_time', () => {
    const { monitor, payloads } = makeMonitor();
    monitor.recordApiResponseTime('/api/products', 250);

    expect(payloads).toHaveLength(1);
    const p = payloads[0];
    expect(p.kind).toBe('custom_metric');
    if (p.kind === 'custom_metric') {
      expect(p.metric.name).toBe('api_response_time');
      expect(p.metric.value).toBe(250);
      expect(p.metric.unit).toBe('ms');
      expect(p.metric.labels?.endpoint).toBe('/api/products');
    }
  });
});

describe('PerformanceMonitor.recordImageLoadTime', () => {
  it('sends a custom_metric with name image_load_time', () => {
    const { monitor, payloads } = makeMonitor();
    monitor.recordImageLoadTime('https://example.com/img.jpg', 120);

    expect(payloads).toHaveLength(1);
    const p = payloads[0];
    expect(p.kind).toBe('custom_metric');
    if (p.kind === 'custom_metric') {
      expect(p.metric.name).toBe('image_load_time');
      expect(p.metric.value).toBe(120);
      expect(p.metric.labels?.url).toBe('https://example.com/img.jpg');
    }
  });
});

describe('PerformanceMonitor cache hit rate', () => {
  it('returns 0 when no hits or misses have been recorded', () => {
    const { monitor } = makeMonitor();
    expect(monitor.getCacheHitRate()).toBe(0);
  });

  it('calculates the hit rate correctly', () => {
    const { monitor } = makeMonitor();
    monitor.recordCacheHit();
    monitor.recordCacheHit();
    monitor.recordCacheHit();
    monitor.recordCacheMiss();
    expect(monitor.getCacheHitRate()).toBeCloseTo(0.75);
  });

  it('flushCacheHitRate sends a cache_hit_rate metric', () => {
    const { monitor, payloads } = makeMonitor();
    monitor.recordCacheHit();
    monitor.recordCacheMiss();
    monitor.flushCacheHitRate();

    const p = payloads[0];
    expect(p.kind).toBe('custom_metric');
    if (p.kind === 'custom_metric') {
      expect(p.metric.name).toBe('cache_hit_rate');
      expect(p.metric.value).toBeCloseTo(50);
      expect(p.metric.unit).toBe('percent');
    }
  });
});

describe('PerformanceMonitor.recordPageLoadTime', () => {
  it('sends a page_load_time metric labelled with the route', () => {
    const { monitor, payloads } = makeMonitor();
    monitor.recordPageLoadTime('/shop', 800);

    const p = payloads[0];
    expect(p.kind).toBe('custom_metric');
    if (p.kind === 'custom_metric') {
      expect(p.metric.name).toBe('page_load_time');
      expect(p.metric.labels?.route).toBe('/shop');
    }
  });
});

describe('PerformanceMonitor.trackError', () => {
  it('sends an error payload', () => {
    const { monitor, payloads } = makeMonitor();
    const report: ErrorReport = {
      type: 'api',
      message: 'Not found',
      url: '/api/products/999',
      timestamp: Date.now(),
    };
    monitor.trackError(report);

    expect(payloads).toHaveLength(1);
    const p = payloads[0];
    expect(p.kind).toBe('error');
    if (p.kind === 'error') {
      expect(p.report.type).toBe('api');
      expect(p.report.message).toBe('Not found');
    }
  });
});

describe('PerformanceMonitor.setupErrorTracking / teardownErrorTracking', () => {
  it('is a no-op in non-browser (SSR) environments', () => {
    // window is defined in jsdom, so we temporarily remove it to simulate SSR
    const originalWindow = global.window;
    // @ts-expect-error intentional undefined for SSR simulation
    delete global.window;

    const monitor = new PerformanceMonitor();
    expect(() => monitor.setupErrorTracking()).not.toThrow();

    global.window = originalWindow;
  });

  it('restores console.error after teardown', () => {
    const monitor = new PerformanceMonitor();
    const originalConsoleError = console.error;

    monitor.setupErrorTracking();
    expect(console.error).not.toBe(originalConsoleError);

    monitor.teardownErrorTracking();
    expect(console.error).toBe(originalConsoleError);
  });

  it('does not re-attach listeners on repeated setupErrorTracking calls', () => {
    const monitor = new PerformanceMonitor();
    monitor.setupErrorTracking();
    const wrappedError = console.error;

    monitor.setupErrorTracking(); // second call should be a no-op
    expect(console.error).toBe(wrappedError);

    monitor.teardownErrorTracking();
  });

  it('removes window listeners during teardown', () => {
    const monitor = new PerformanceMonitor();
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    monitor.setupErrorTracking();
    monitor.teardownErrorTracking();

    expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'error',
      addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'error')?.[1] as EventListener
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'unhandledrejection')?.[1] as EventListener
    );
  });
});
