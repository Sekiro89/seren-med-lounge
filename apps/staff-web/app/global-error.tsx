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
          background: '#f6f7f9',
          color: '#0b0d12',
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: '#5b5e66', fontSize: 14 }}>Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              height: 40,
              padding: '0 20px',
              border: 0,
              borderRadius: 2,
              background: '#1f4fd8',
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
