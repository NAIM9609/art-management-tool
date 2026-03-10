'use client';

/**
 * PerformanceMonitor
 *
 * A client-side-only React component that:
 * - Reports Web Vitals via the Next.js `useReportWebVitals` hook.
 * - Sets up global error tracking (uncaught exceptions, console.error) on mount.
 * - Wires the performance monitor to the analytics tracker so every payload is
 *   forwarded to all configured analytics destinations.
 * - Tears down error tracking on unmount to prevent listener leaks in tests.
 *
 * Renders nothing to the DOM.
 */

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/vitals';

import { performanceMonitor, rateMetric, type WebVitalMetric } from '@/utils/performance';
import { analyticsTracker } from '@/utils/analytics';

export interface PerformanceMonitorProps {
  /** Google Analytics 4 Measurement ID. Optional. */
  ga4MeasurementId?: string;
  /** URL of a custom aggregation endpoint. Optional. */
  customEndpointUrl?: string;
  /** AWS CloudWatch RUM application monitor ID. Optional. */
  cloudwatchRumAppId?: string;
}

export default function PerformanceMonitor({
  ga4MeasurementId,
  customEndpointUrl,
  cloudwatchRumAppId,
}: PerformanceMonitorProps) {
  // Wire destinations once (idempotent – replaces config on each render if
  // props change, which is fine because no queued events are lost).
  useEffect(() => {
    analyticsTracker.configure({ ga4MeasurementId, customEndpointUrl, cloudwatchRumAppId });
  }, [ga4MeasurementId, customEndpointUrl, cloudwatchRumAppId]);

  // Forward all performance payloads to the analytics tracker.
  useEffect(() => {
    performanceMonitor.setSendCallback((payload) => {
      if (payload.kind === 'web_vital') {
        analyticsTracker.track({
          type: 'web_vital',
          name: payload.metric.name,
          value: payload.metric.value,
          rating: payload.metric.rating,
        });
      }
    });

    // Set up global error and console.error tracking.
    performanceMonitor.setupErrorTracking();

    return () => {
      performanceMonitor.teardownErrorTracking();
    };
  }, []);

  // Report Web Vitals emitted by the Next.js runtime.
  useReportWebVitals((metric) => {
    const name = metric.name as WebVitalMetric['name'];
    performanceMonitor.reportWebVital({
      name,
      value: metric.value,
      rating: rateMetric(name, metric.value),
      navigationType: metric.navigationType,
      id: metric.id,
    });
  });

  return null;
}
