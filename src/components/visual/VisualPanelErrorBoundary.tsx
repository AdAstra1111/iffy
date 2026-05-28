/**
 * VisualPanelErrorBoundary — Per-panel error boundary, compact, no auto-recovery.
 *
 * Catches rendering errors inside a single panel and shows a contained error state
 * without collapsing the page. Logs panel context for debugging.
 *
 * Distinct from VisualPipelineErrorBoundary (page-level w/ recovery) and ErrorBoundary
 * (generic w/ reset) — this boundary is per-panel, compact, and DOES NOT attempt
 * automatic recovery.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  children: ReactNode;
  /** Human-friendly label identifying which panel crashed. */
  panelLabel?: string;
  /** Optional custom fallback override. */
  fallback?: ReactNode;
  compact?: boolean;
  className?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class VisualPanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.panelLabel || 'unknown panel';
    console.error(`[VisualPanelErrorBoundary] Panel "${label}" crashed:`, error);
    console.error(`[VisualPanelErrorBoundary] Component stack:`, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const label = this.props.panelLabel || 'Panel error';
      const message = this.state.error?.message || 'An unexpected error occurred.';

      if (this.props.compact) {
        return (
          <div
            className={cn(
              'flex items-center gap-2 p-3 rounded-md border border-destructive/20 bg-destructive/5 text-sm',
              this.props.className,
            )}
            role="alert"
          >
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-destructive">{label}</p>
              <p className="text-[11px] text-muted-foreground truncate">{message}</p>
            </div>
          </div>
        );
      }

      return (
        <div
          className={cn(
            'flex flex-col items-center justify-center py-8 px-4 text-center',
            this.props.className,
          )}
          role="alert"
        >
          <AlertTriangle className="h-6 w-6 text-destructive mb-2" />
          <h4 className="text-sm font-medium text-foreground mb-1">{label}</h4>
          <p className="text-xs text-muted-foreground max-w-xs">{message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}