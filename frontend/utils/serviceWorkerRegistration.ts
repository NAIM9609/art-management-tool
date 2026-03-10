const SW_PATH = '/sw.js';

export type ServiceWorkerConfig = {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
};

/**
 * Register the service worker. Safe to call on every page load;
 * the browser deduplicates registrations.
 */
export function register(config?: ServiceWorkerConfig): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') return;

  window.addEventListener('load', () => {
    registerValidSW(SW_PATH, config);
  });
}

async function registerValidSW(
  swUrl: string,
  config?: ServiceWorkerConfig
): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: '/',
    });

    registration.onupdatefound = () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.onstatechange = () => {
        if (installingWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // A new version is available; notify the caller
            console.log('[SW] New content is available. Please refresh.');
            config?.onUpdate?.(registration);
          } else {
            // First install: content is now cached for offline use
            console.log('[SW] Content is cached for offline use.');
            config?.onSuccess?.(registration);
          }
        }
      };
    };
  } catch (error) {
    console.error('[SW] Error during service worker registration:', error);
  }
}

/**
 * Unregister any active service worker (useful for testing or disabling PWA).
 */
export function unregister(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch((error) => console.error('[SW] Unregister error:', error.message));
}

/**
 * Queue a cart mutation for background sync when the user is offline.
 * The service worker will replay the request once connectivity is restored.
 */
export function queueCartUpdate(payload: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}): void {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !navigator.serviceWorker.controller
  ) {
    return;
  }

  navigator.serviceWorker.controller.postMessage({
    type: 'QUEUE_CART_UPDATE',
    payload,
  });
}

/**
 * Tell the waiting service worker to take control immediately (skip waiting).
 * Call this when the user acknowledges a "new version available" notification.
 */
export function skipWaiting(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.ready.then((registration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  });
}
