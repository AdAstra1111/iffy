// Error capture utility — logs errors to window.__IFFY_ERRORS__ for diagnostics
// Accessible from the console on any device

window.__IFFY_ERRORS__ = window.__IFFY_ERRORS__ || [];

// ── React 18 removeChild race guard ────────────────────────────────────
// In React 18, when a portal component's container is removed from the DOM
// during commit phase (e.g., Suspense resolution, sibling portal cleanup, or
// a rapid open/close cycle), React may call Node.removeChild on a node that
// is no longer a child of the intended parent. The browser throws:
//
//   NotFoundError: Failed to execute 'removeChild' on 'Node'
//
// This is a React 18 runtime issue, not a component bug. The SafeRouteBoundary
// catches the error and retries, but the retry itself can trigger the SAME race
// (re-creating portals during recovery), causing a loop.
//
// FIX: Wrap Node.prototype.removeChild to gracefully handle the NotFoundError
// case. When the child is not found, the DOM state is already what React
// wanted (the node is not a child), so the operation is a no-op. We log a
// diagnostic trace but never throw — the error is fundamentally harmless
// because it means the DOM cleanup already happened.
//
// This zero-cost fix prevents thousands of error boundary recoveries and the
// cascade of portal re-creation that follows each recovery.
(function() {
  // Only patch once
  if ((Node.prototype as any).__removeChildPatched) return;
  (Node.prototype as any).__removeChildPatched = true;

  const origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child: Node) {
    // Fast path: normal case — child exists, removeChild succeeds
    if (child.parentNode === this) {
      return origRemoveChild.call(this, child);
    }
    // Slow path: child is already orphaned. This is the React 18 portal
    // race — the container was removed from the DOM before React could
    // unmount the children. The DOM is already in the desired state
    // (child is not attached to this parent), so we log a diagnostic
    // trace and skip the operation.
    const err = new Error('removeChild race (harmless — DOM already in desired state)');
    console.warn('[removeChild-safe] Parent hasChild:', this.hasChildNodes?.());
    console.warn('[removeChild-safe] Child parentNode:', child.parentNode);
    console.warn('[removeChild-safe] Stack:', err.stack?.split('\n').slice(1, 6).join('\n'));
    return child; // Return the child node as removeChild normally does
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
