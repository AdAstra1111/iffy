import { useEffect, useState } from 'react';

export default function ErrorsPage() {
  const [errors, setErrors] = useState<any[]>([]);

  useEffect(() => {
    const stored = (window as any).__IFFY_ERRORS__ || [];
    setErrors(stored);
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '13px', background: '#111', color: '#0f0', minHeight: '100vh' }}>
      <h2 style={{ color: '#0f0' }}>🔧 IFFY Error Buffer</h2>
      <p>{errors.length} errors captured</p>
      <button onClick={() => setErrors((window as any).__IFFY_ERRORS__ || [])} style={{ padding: '8px 16px', margin: '8px 4px' }}>
        Refresh
      </button>
      <button onClick={() => { (window as any).__IFFY_ERRORS__ = []; setErrors([]); }} style={{ padding: '8px 16px', margin: '8px 4px' }}>
        Clear
      </button>
      <hr style={{ borderColor: '#333' }} />
      {errors.length === 0 ? (
        <p style={{ color: '#080' }}>No errors yet. Buffer is clean.</p>
      ) : (
        errors.map((e, i) => (
          <div key={i} style={{ marginBottom: '16px', border: '1px solid #333', padding: '12px', borderRadius: '4px' }}>
            <div style={{ color: '#f80' }}>[{e.type}] {e.timestamp}</div>
            <div style={{ color: '#fff' }}>{e.message}</div>
            {e.details && (
              <pre style={{ color: '#aaa', fontSize: '11px', overflow: 'auto', maxHeight: '200px', background: '#0a0', padding: '8px' }}>
                {JSON.stringify(e.details, null, 2)}
              </pre>
            )}
            {e.url && <div style={{ color: '#666', fontSize: '11px' }}>URL: {e.url}</div>}
          </div>
        ))
      )}
      <hr style={{ borderColor: '#333' }} />
      <a href="/" style={{ color: '#08f' }}>← Back to App</a>
    </div>
  );
}
