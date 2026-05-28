import React from 'react';

/**
 * PDEErrorBoundary — silent-recovery error boundary for the Project Development Engine.
 *
 * The PDE has a persistent hook-order violation (#310) triggered by Supabase auth
 * recovery → React Query cache update cycles. This boundary catches the error
 * silently and lets the user continue on the page by re-rendering just the PDE
 * content area, not the entire route.
 *
 * Falls back to a compact inline error message rather than a full-screen crash.
 */
interface PDEErrorBoundaryProps {
  children: React.ReactNode;
}
interface PDEErrorBoundaryState {
  hasError: boolean;
}
export class PDEErrorBoundary extends React.Component<
  PDEErrorBoundaryProps,
  PDEErrorBoundaryState
> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: PDEErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): PDEErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Only silently recover hook-order violations
    const isHookOrderError =
      error.message?.includes('Minified React error #310') ||
      error.message?.includes('Rendered fewer hooks') ||
      error.message?.includes('Rendered more hooks');

    if (isHookOrderError) {
      console.warn('[PDEErrorBoundary] Hook-order violation — auto-recovering in 1.5s');
      this.retryTimer = setTimeout(() => {
        this.setState({ hasError: false });
      }, 1500);
    } else {
      // For other errors, re-throw to the parent SafeRouteBoundary
      throw error;
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center">
          <p className="text-sm text-muted-foreground">
            A temporary rendering issue occurred. The page will recover automatically...
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 text-xs text-primary underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}