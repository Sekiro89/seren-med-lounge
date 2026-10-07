'use client';

/** Last resort when the root layout itself fails; no design-system imports, inline styles only. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7f9fa',
          color: '#0f172a',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: '#475569', fontSize: 14 }}>Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              height: 40,
              padding: '0 20px',
              border: 0,
              borderRadius: 8,
              background: '#12706f',
              color: '#fff',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
