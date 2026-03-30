import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
 
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Use 'export' for static deployment (Amplify, S3), 'standalone' for Docker/Node.js
const isExportMode = process.env.NEXT_OUTPUT_MODE === 'export';

const nextConfig: NextConfig = {
  output: isExportMode ? 'export' : 'standalone',
  distDir: '.next',
  devIndicators: false,
  // Static export requires trailing slashes for proper index.html generation
  ...(isExportMode ? { trailingSlash: true } : {}),
  // Disattiva controlli TypeScript durante la build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configure image domains
  images: {
    // Static export cannot use Next.js image optimization
    ...(isExportMode ? { unoptimized: true } : {}),
    formats: ['image/avif', 'image/webp'],
    // Keep domains for backward compatibility with host validation in some
    // Next.js runtime paths; remotePatterns remains the primary allow-list.
    domains: ['localhost'],
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
        // LocalStack S3 — used in development (CDN_URL=http://localhost:4566/<bucket>)
        protocol: 'http',
        hostname: 'localhost',
        port: '4566',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  
  // Rewrites and headers are only supported in standalone/server mode
  ...(isExportMode ? {} : {
    // Proxy API requests to backend to avoid CORS issues
    async rewrites() {
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
  }),
};

export default withNextIntl(nextConfig);
