import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
 
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  distDir: '.next',
  devIndicators: false,
  // Disattiva controlli TypeScript durante la build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configure image domains
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'giorgiopriviteralab.com',
        port: '8080',
        pathname: '/uploads/**',
      },
      {
        protocol: 'http',
        hostname: 'giorgiopriviteralab.com',
        port: '3000',
        pathname: '/uploads/**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  
  // Proxy API requests to backend to avoid CORS issues
  async rewrites() {
    // Use BACKEND_URL for server-side rewrites (available in Docker as 'http://backend:8080')
    // Fallback to localhost for local development, or production URL if specified
    const backendUrl = 
      process.env.BACKEND_URL || 
      process.env.NEXT_PUBLIC_API_URL || 
      (process.env.NODE_ENV === 'production' 
        ? 'http://giorgiopriviteralab.com:8080' 
        : 'http://localhost:8080');
    
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${backendUrl}/health`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
  
  // Remove strict-origin-when-cross-origin in development
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
