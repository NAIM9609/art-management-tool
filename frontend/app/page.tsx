'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Root page - redirects to the default locale.
 * In standalone mode, the middleware handles this redirect.
 * In static export mode, middleware doesn't run, so this page
 * performs a client-side redirect instead.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/it');
  }, [router]);

  return null;
}
