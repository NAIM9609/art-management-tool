'use client';

import { useEffect } from 'react';
import { register } from '@/utils/serviceWorkerRegistration';

/**
 * Registers the service worker once the page has loaded.
 * This is a client-only component with no visible output.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    register({
      onSuccess: () => {
        console.log('[SW] App is ready for offline use.');
      },
      onUpdate: () => {
        console.log('[SW] A new version of the app is available.');
      },
    });
  }, []);

  return null;
}
