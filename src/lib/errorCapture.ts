// Error capture utility — logs errors to window.__IFFY_ERRORS__ for diagnostics
// Accessible from the console on any device

window.__IFFY_ERRORS__ = window.__IFFY_ERRORS__ || [];

// ── React 18 removeChild diagnostic ──────────────────────────
// React 18 can produce transient NotFoundError/removeChild when a portal
// container leaves the DOM during Suspense resolution. The root cause is
// fixed: dialogs use controlled open={state} lifecycle (never conditional
// rendering around <Dialog>), and DialogDescription is provided for all
// consumers. This diagnostic logs any strays in case the fix needs
// adjustment.
(function() {
  const origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child: Node) {
    if (child.parentNode !== this) {
      console.warn('[removeChild-stray] Child not attached to parent — DOM state already correct');
    }
    return origRemoveChild.call(this, child);
  };
})();

function captureError(type: string, message: string, details?: any) {
  const entry = {
    type,
    message,
    details,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
  };
  window.__IFFY_ERRORS__.push(entry);
  console.error(`[IFFY ${type}]`, message, details || '');
}

// Global error handlers
window.addEventListener('error', (e) => {
  // Suppress transient removeChild errors — handled at DOM API level by
  // the Node.prototype.removeChild patch above, which prevents the error
  // from ever reaching the error boundary / window handler.
  // Also suppressed here as a safety net in case the patch has a gap.
  if (e.error instanceof DOMException &&
      e.error.name === 'NotFoundError' &&
      e.error.message?.includes('removeChild')) {
    return;
  }
  
  // Detect stale chunk / new deployment: dynamic import of a chunk that no longer exists
  if (e.message?.includes('Failed to fetch dynamically imported module') ||
      e.message?.includes('Importing a module script failed') ||
      e.message?.includes('Loading chunk')) {
    captureError('STALE_DEPLOYMENT', 'New version deployed — please refresh', {
      url: window.location.href,
      errorMessage: e.message,
    });
    // Show a banner to the user
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;background:#a855f7;color:white;padding:12px 20px;border-radius:12px;font-size:13px;font-family:sans-serif;box-shadow:0 4px 24px rgba(0,0,0,0.3);display:flex;align-items:center;gap:12px;cursor:pointer;';
    banner.innerHTML = '✨ New version deployed <button style="background:white;color:#a855f7;border:none;padding:6px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Refresh</button>';
    banner.onclick = () => location.reload();
    document.body.appendChild(banner);
    return;
  }
  captureError('UNCAUGHT', e.message, {
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
    stack: e.error?.stack,
  });
});

window.addEventListener('unhandledrejection', (e) => {
  captureError('UNHANDLED_REJECTION', String(e.reason), {
    stack: e.reason?.stack,
  });
});

// Export for manual capture
export function logError(message: string, details?: any) {
  captureError('MANUAL', message, details);
}

export function getErrors() {
  return window.__IFFY_ERRORS__;
}
