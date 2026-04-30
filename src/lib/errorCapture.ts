// Error capture utility — logs errors to window.__IFFY_ERRORS__ for diagnostics
// Accessible from the console on any device

window.__IFFY_ERRORS__ = window.__IFFY_ERRORS__ || [];

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
