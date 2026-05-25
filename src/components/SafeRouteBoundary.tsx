import React from 'react';

interface SafeRouteBoundaryProps {
  children: React.ReactNode;
}

interface SafeRouteBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that catches transient React DOM reconciliation errors
 * (e.g., Suspense + portal "removeChild" race conditions in React 18)
 * and recovers gracefully instead of crashing the page.
 */
export class SafeRouteBoundary extends React.Component<
  SafeRouteBoundaryProps,
  SafeRouteBoundaryState
> {
  constructor(props: SafeRouteBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SafeRouteBoundaryState {
    // Catch ALL errors during route transitions — the Suspense + portal
    // race condition in React 18 can throw "removeChild" even on clean
    // component trees during Suspense fallback transitions.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error for debugging but don't crash the page
    console.warn(
      '[SafeRouteBoundary] Recovered from render error during route transition:',
      error.message,
    );
    // Auto-recover after a short delay — the race condition is transient
    setTimeout(() => {
      this.setState({ hasError: false, error: null });
    }, 500);
  }

  render() {
    if (this.state.hasError) {
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