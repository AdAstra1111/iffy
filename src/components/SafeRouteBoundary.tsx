import React from 'react';

/** Module-level ref to prevent concurrent recovery across error boundaries. */
export const recoveryInFlightRef = { current: false };

interface SafeRouteBoundaryProps {
  children: React.ReactNode;
}

interface SafeRouteBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const MAX_RECOVERY_ATTEMPTS = 2;

/**
 * Error boundary that catches transient React DOM reconciliation errors
 * (e.g., Suspense + portal "removeChild" race conditions in React 18)
 * and recovers gracefully instead of crashing the page.
 *
 * Guards against infinite recovery loops — after MAX_RECOVERY_ATTEMPTS,
 * it shows a permanent error message requiring a manual refresh.
 */
export class SafeRouteBoundary extends React.Component<
  SafeRouteBoundaryProps,
  SafeRouteBoundaryState
> {
  private recoveryAttempts = 0;

  constructor(props: SafeRouteBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SafeRouteBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Detect "useAuth must be used within AuthProvider" — permanent provider error, never retry
    const isProviderError = error.message?.includes('useAuth must be used within AuthProvider');
    if (isProviderError) {
      console.error(
        '[SafeRouteBoundary] Provider error — component rendered outside AuthProvider. This is a developer bug.',
        error,
      );
      this.setState({ hasError: true, error });
      return;
    }

    // Detect React hook-order violation (#310) — permanent developer error, never retry
    const isHookOrderError = error.message?.includes('Rendered fewer hooks') ||
      error.message?.includes('Rendered more hooks') ||
      error.message?.includes('Minified React error #310');
    if (isHookOrderError) {
      console.error(
        '[SafeRouteBoundary] Hook-order violation detected — permanent error. This is a developer bug, not a transient route error.',
        error,
      );
      this.setState({ hasError: true, error });
      return;
    }

    // Detect stale chunk / new deployment — show permanent error with refresh
    const isStaleChunkError = error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Importing a module script failed') ||
      error.message?.includes('Loading chunk');
    if (isStaleChunkError) {
      console.warn('[SafeRouteBoundary] Stale chunk detected (new deployment) — showing refresh prompt');
      this.setState({ hasError: true, error });
      return;
    }

    // Guard: prevent concurrent recovery if another boundary is already recovering
    if (recoveryInFlightRef.current) {
      console.warn('[SafeRouteBoundary] Recovery already in flight — skipping concurrent recovery');
      return;
    }

    this.recoveryAttempts++;

    console.warn(
      `[SafeRouteBoundary] Recovered from render error during route transition (attempt ${this.recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}):`,
      error.message,
    );

    // Stop retrying after max attempts — prevents infinite loop on persistent errors
    if (this.recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
      console.error(
        `[SafeRouteBoundary] Max recovery attempts (${MAX_RECOVERY_ATTEMPTS}) reached. Showing permanent error. Refresh the page to retry.`,
        error,
      );
      return;
    }

    // Auto-recover after a short delay — the race condition is transient
    recoveryInFlightRef.current = true;
    setTimeout(() => {
      recoveryInFlightRef.current = false;
      this.setState({ hasError: false, error: null });
    }, 500);
  }

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || '';

      // Hook-order violation — show developer error
      const isHookOrder = errMsg.includes('Rendered fewer hooks') ||
        errMsg.includes('Rendered more hooks') ||
        errMsg.includes('Minified React error #310');
      
      // Provider error — component outside AuthProvider
      const isProviderError = errMsg.includes('useAuth must be used within AuthProvider');
      
      // Stale chunk — show new version message
      const isStaleChunk = errMsg.includes('Failed to fetch dynamically imported module') ||
        errMsg.includes('Importing a module script failed') ||
        errMsg.includes('Loading chunk');

      if (isHookOrder || isProviderError) {
        return (
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center space-y-3 p-8 max-w-md">
              <div className="h-8 w-8 rounded-md bg-destructive mx-auto flex items-center justify-center text-destructive-foreground text-lg font-bold">!</div>
              <h2 className="text-lg font-semibold">Internal error</h2>
              <p className="text-sm text-muted-foreground">
                A rendering error occurred. This is a developer bug.
                Please refresh the app to continue.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90"
              >
                Refresh page
              </button>
            </div>
          </div>
        );
      }

      if (isStaleChunk) {
        return (
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center space-y-3 p-8 max-w-md">
              <div className="h-8 w-8 rounded-md bg-purple-600 mx-auto flex items-center justify-center text-white text-lg font-bold">✦</div>
              <h2 className="text-lg font-semibold">New version deployed</h2>
              <p className="text-sm text-muted-foreground">
                A new version of IFFY has been deployed. Refresh to see the latest.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90"
              >
                Refresh
              </button>
            </div>
          </div>
        );
      }

      if (this.recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
        return (
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center space-y-3 p-8 max-w-md">
              <div className="h-8 w-8 rounded-md bg-destructive mx-auto" />
              <h2 className="text-lg font-semibold">Route render failed</h2>
              <p className="text-sm text-muted-foreground">
                A persistent error occurred while rendering this page.
                Please refresh the app to continue.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90"
              >
                Refresh page
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-3 p-8">
            <div className="h-8 w-8 rounded-md bg-primary animate-pulse mx-auto" />
            <p className="text-sm text-muted-foreground">Recovering…</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
