'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OfflinePage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState<boolean>(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      router.back();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [router]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '2rem',
        textAlign: 'center',
        color: '#ffffff',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/Logo_skull.svg"
        alt="Giorgio Privitera Lab Logo"
        style={{ width: '120px', marginBottom: '2rem', opacity: 0.8 }}
      />

      <h1
        style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          fontFamily: 'var(--font-junglefever)',
        }}
      >
        You&apos;re Offline
      </h1>

      <p style={{ fontSize: '1.1rem', marginBottom: '2rem', opacity: 0.8, maxWidth: '400px' }}>
        It looks like you&apos;ve lost your internet connection. Please check your network and try
        again.
      </p>

      {isOnline ? (
        <p style={{ color: '#4ade80', marginBottom: '1rem' }}>
          ✓ Connection restored! Redirecting…
        </p>
      ) : (
        <p style={{ color: '#facc15', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Waiting for connection…
        </p>
      )}

      <button
        onClick={() => router.back()}
        style={{
          padding: '0.75rem 2rem',
          backgroundColor: '#4f46e5',
          color: '#ffffff',
          border: 'none',
          borderRadius: '0.5rem',
          fontSize: '1rem',
          cursor: 'pointer',
          marginTop: '0.5rem',
        }}
      >
        Try Again
      </button>
    </div>
  );
}
