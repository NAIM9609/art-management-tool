'use client';

import { useEffect, useRef, useState } from 'react';
import { imageCache } from '@/utils/imageCache';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}

/**
 * OptimizedImage
 *
 * Lazy-loads images using an IntersectionObserver and serves them from the
 * IndexedDB image cache managed by `imageCache`.  A skeleton placeholder is
 * shown while the image is loading.
 */
export default function OptimizedImage({
  src,
  alt,
  className = '',
  width,
  height,
}: OptimizedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const revokableUrl = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(false);
        const url = await imageCache.getImage(src);
        if (!cancelled) {
          // Revoke any previously created object URL to avoid memory leaks
          if (revokableUrl.current) {
            URL.revokeObjectURL(revokableUrl.current);
          }
          revokableUrl.current = url;
          setObjectUrl(url);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [src]);

  // Revoke object URL on component unmount to free memory.
  // The primary effect only revokes the *previous* URL when src changes;
  // this effect handles the final cleanup when the component is removed.
  useEffect(() => {
    return () => {
      if (revokableUrl.current) {
        URL.revokeObjectURL(revokableUrl.current);
        revokableUrl.current = null;
      }
    };
  }, []);

  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div ref={containerRef} style={style} className={className}>
      {loading && !error && (
        <div
          className="animate-pulse bg-gray-200 rounded"
          style={{ width: '100%', height: height ?? 200 }}
          aria-hidden="true"
        />
      )}
      {error && (
        <div
          className="flex items-center justify-center bg-gray-100 text-gray-400 rounded"
          style={{ width: '100%', height: height ?? 200 }}
          role="img"
          aria-label={alt}
        >
          <span>Failed to load image</span>
        </div>
      )}
      {objectUrl && !error && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={objectUrl}
          alt={alt}
          width={width}
          height={height}
          className={loading ? 'hidden' : ''}
          onLoad={() => setLoading(false)}
          style={{ maxWidth: '100%' }}
        />
      )}
    </div>
  );
}
