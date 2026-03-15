/**
 * Unit tests for analytics utilities.
 */

import {
  AnalyticsTracker,
  isDoNotTrack,
  stripPII,
  sanitizeEvent,
  type AnalyticsEvent,
} from './analytics';

// ---------------------------------------------------------------------------
// isDoNotTrack
// ---------------------------------------------------------------------------

describe('isDoNotTrack', () => {
  const originalDoNotTrack = Object.getOwnPropertyDescriptor(navigator, 'doNotTrack');

  afterEach(() => {
    // Restore the original property after each test
    if (originalDoNotTrack) {
      Object.defineProperty(navigator, 'doNotTrack', originalDoNotTrack);
    }
  });

  it('returns false when DNT is "0"', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    expect(isDoNotTrack()).toBe(false);
  });

  it('returns true when DNT is "1"', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    expect(isDoNotTrack()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stripPII
// ---------------------------------------------------------------------------

describe('stripPII', () => {
  it('removes email addresses', () => {
    expect(stripPII('user@example.com')).toBe('[redacted]');
    expect(stripPII('Contact us at support@test.org for help')).toBe(
      'Contact us at [redacted] for help'
    );
  });

  it('does not alter strings without PII', () => {
    expect(stripPII('blue hoodie')).toBe('blue hoodie');
    expect(stripPII('order #12345')).toBe('order #12345');
  });
});

// ---------------------------------------------------------------------------
// sanitizeEvent
// ---------------------------------------------------------------------------

describe('sanitizeEvent', () => {
  it('strips PII from search queries', () => {
    const event: AnalyticsEvent = { type: 'search', query: 'user@example.com hoodie', resultCount: 3 };
    const safe = sanitizeEvent(event);
    expect((safe as typeof event).query).toBe('[redacted] hoodie');
  });

  it('strips PII from product_view productName', () => {
    const event: AnalyticsEvent = {
      type: 'product_view',
      productId: 'p1',
      productName: 'user@example.com special edition',
      price: 9.99,
    };
    const safe = sanitizeEvent(event);
    expect((safe as typeof event).productName).toBe('[redacted] special edition');
  });

  it('strips PII from add_to_cart productName', () => {
    const event: AnalyticsEvent = {
      type: 'add_to_cart',
      productId: 'p2',
      productName: 'Special user@test.com tee',
      quantity: 1,
      price: 19.99,
    };
    const safe = sanitizeEvent(event);
    expect((safe as typeof event).productName).toBe('Special [redacted] tee');
  });

  it('does not mutate the original event', () => {
    const event: AnalyticsEvent = { type: 'search', query: 'admin@example.com', resultCount: 0 };
    sanitizeEvent(event);
    expect(event.query).toBe('admin@example.com');
  });
});

// ---------------------------------------------------------------------------
// AnalyticsTracker
// ---------------------------------------------------------------------------

describe('AnalyticsTracker', () => {
  let tracker: AnalyticsTracker;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    tracker = new AnalyticsTracker();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not call fetch when Do-Not-Track is active', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    tracker.configure({ customEndpointUrl: 'https://analytics.example.com/events' });
    tracker.trackSearch({ query: 'art print', resultCount: 5 });
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
  });

  it('posts to the custom endpoint when configured', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    tracker.configure({ customEndpointUrl: 'https://analytics.example.com/events' });
    tracker.trackSearch({ query: 'art print', resultCount: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://analytics.example.com/events',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event.type).toBe('search');
    expect(body.event.query).toBe('art print');
  });

  it('sanitizes PII before posting to custom endpoint', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    tracker.configure({ customEndpointUrl: 'https://analytics.example.com/events' });
    tracker.trackSearch({ query: 'user@example.com art print', resultCount: 2 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event.query).toBe('[redacted] art print');
  });

  it('trackProductView sends the correct event type', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    tracker.configure({ customEndpointUrl: 'https://analytics.example.com/events' });
    tracker.trackProductView({ productId: 'p1', productName: 'Red Hoodie', price: 29.99 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event.type).toBe('product_view');
    expect(body.event.productId).toBe('p1');
  });

  it('trackAddToCart sends the correct event type', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    tracker.configure({ customEndpointUrl: 'https://analytics.example.com/events' });
    tracker.trackAddToCart({ productId: 'p2', productName: 'Blue Tee', quantity: 2, price: 19.99 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event.type).toBe('add_to_cart');
    expect(body.event.quantity).toBe(2);
  });

  it('trackCheckoutInitiated sends the correct event type', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    tracker.configure({ customEndpointUrl: 'https://analytics.example.com/events' });
    tracker.trackCheckoutInitiated({ cartTotal: 59.98, itemCount: 2 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event.type).toBe('checkout_initiated');
  });

  it('trackOrderCompleted sends the correct event type', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    tracker.configure({ customEndpointUrl: 'https://analytics.example.com/events' });
    tracker.trackOrderCompleted({ orderId: 'ord-123', total: 59.98, itemCount: 2 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event.type).toBe('order_completed');
    expect(body.event.orderId).toBe('ord-123');
  });

  it('does not throw when no customEndpointUrl is configured', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true });
    tracker.configure({});
    expect(() => tracker.trackSearch({ query: 'test', resultCount: 0 })).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
