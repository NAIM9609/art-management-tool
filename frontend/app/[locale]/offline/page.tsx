'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

export default function OfflinePage() {
  const router = useRouter();
  const locale = useLocale();
  const [isOnline, setIsOnline] = useState<boolean>(false);

  const copy = locale === 'it'
    ? {
        title: 'Sei Offline',
        description:
          'Sembra che la connessione internet sia assente. Controlla la rete e riprova.',
        restored: 'Connessione ripristinata! Reindirizzamento…',
        waiting: 'In attesa di connessione…',
        tryAgain: 'Riprova',
      }
    : {
        title: "You're Offline",
        description:
          "It looks like you've lost your internet connection. Please check your network and try again.",
        restored: 'Connection restored! Redirecting…',
        waiting: 'Waiting for connection…',
        tryAgain: 'Try Again',
      };

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
        {copy.title}
      </h1>

      <p style={{ fontSize: '1.1rem', marginBottom: '2rem', opacity: 0.8, maxWidth: '400px' }}>
        {copy.description}
      </p>

      {isOnline ? (
        <p style={{ color: '#4ade80', marginBottom: '1rem' }}>{`✓ ${copy.restored}`}</p>
      ) : (
        <p style={{ color: '#facc15', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {copy.waiting}
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
        {copy.tryAgain}
      </button>
    </div>
  );
}
