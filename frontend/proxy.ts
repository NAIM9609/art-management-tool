import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './src/i18n/routing';

const intlProxy = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/personaggi/') ||
    pathname.startsWith('/fumetti/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|json|txt|xml|pdf)$/i)
  ) {
    return;
  }

  return intlProxy(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};