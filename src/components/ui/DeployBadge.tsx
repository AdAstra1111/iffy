import { useEffect, useState } from 'react';

declare const __BUILD_TIME__: string;

export function DeployBadge() {
  const [ts, setTs] = useState<string>('');
  useEffect(() => {
    try {
      setTs(typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '');
    } catch {
      setTs('');
    }
  }, []);
  if (!ts) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: 8,
      left: 8,
      zIndex: 9999,
      background: 'rgba(0,0,0,0.75)',
      color: '#aaa',
      fontSize: 10,
      fontFamily: 'monospace',
      padding: '2px 6px',
      borderRadius: 3,
      pointerEvents: 'none',
    }}>
      build: {ts}
    </div>
  );
}
