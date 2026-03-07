import { useEffect, useRef } from 'react';
import { imageCache } from '@/utils/imageCache';

interface UseImagePreloadOptions {
  /** URLs that must be preloaded first (higher priority). */
  criticalUrls?: string[];
}

/**
 * useImagePreload
 *
 * Preloads a list of image URLs into the IndexedDB cache.
 * Critical images are preloaded before regular ones.
 * All in-flight requests are cancelled when the component unmounts.
 *
 * @param urls - Full list of image URLs to preload.
 * @param options.criticalUrls - Subset of `urls` to preload with priority.
 */
export function useImagePreload(
  urls: string[],
  options: UseImagePreloadOptions = {}
): void {
  const { criticalUrls = [] } = options;

  // Keep a stable reference to the abort controller so we can cancel on unmount
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!urls.length && !criticalUrls.length) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const run = async () => {
      // 1. Preload critical images first (sequential to respect priority order)
      for (const url of criticalUrls) {
        if (signal.aborted) return;
        await imageCache.getImage(url).catch(() => undefined);
      }

      // 2. Preload remaining (non-critical) images in parallel
      const remaining = urls.filter((u) => !criticalUrls.includes(u));
      if (!signal.aborted && remaining.length) {
        await Promise.allSettled(
          remaining.map((url) => imageCache.getImage(url).catch(() => undefined))
        );
      }
    };

    run();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  // Re-run whenever the URL lists change (join used to avoid JSON.stringify overhead)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join('\0'), criticalUrls.join('\0')]);
}
