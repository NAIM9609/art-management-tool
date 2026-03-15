'use client';

/**
 * PerformanceMonitor
 *
 * A client-side-only React component that:
 * - Reports Web Vitals via the Next.js `useReportWebVitals` hook.
 * - Sets up global error tracking (uncaught exceptions, console.error) on mount.
 * - Wires Web Vital payloads to the analytics tracker.
 * - Tears down error tracking on unmount to prevent listener leaks in tests.
 *
 * Renders nothing to the DOM.
 */

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/vitals';

import { performanceMonitor, type WebVitalName } from '@/utils/performance';
import { analyticsTracker } from '@/utils/analytics';

export interface PerformanceMonitorProps {
  /** Google Analytics 4 Measurement ID. Optional. */
  ga4MeasurementId?: string;
  /** URL of a custom aggregation endpoint. Optional. */
  customEndpointUrl?: string;
}

export default function PerformanceMonitor({
  ga4MeasurementId,
  customEndpointUrl,
}: PerformanceMonitorProps) {
  // Wire destinations once (idempotent – replaces config on each render if
  // props change, which is fine because no queued events are lost).
  useEffect(() => {
    analyticsTracker.configure({ ga4MeasurementId, customEndpointUrl });
  }, [ga4MeasurementId, customEndpointUrl]);

  // Forward Web Vitals to the analytics tracker.
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
    const name = metric.name as WebVitalName;
    performanceMonitor.reportWebVital({
      name,
      value: metric.value,
      navigationType: metric.navigationType,
      id: metric.id,
    });
  });

  return null;
}
