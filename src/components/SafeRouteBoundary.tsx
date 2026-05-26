import React from 'react';

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
    setTimeout(() => {
      this.setState({ hasError: false, error: null });
    }, 500);
  }

  render() {
    if (this.state.hasError) {
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
