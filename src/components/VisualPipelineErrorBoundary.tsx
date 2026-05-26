/**
 * VisualPipelineErrorBoundary — Catches errors from lazy-loaded pipeline components.
 *
 * Wraps the outer <Suspense> in VisualProductionPipeline so that if any
 * lazy-loaded stage content (CastingPipeline, ProductionDesign, LookBookPage)
 * throws during load or render, the user sees a recoverable fallback instead
 * of a white screen crash.
 *
 * Guards against infinite recovery loops — after MAX_RECOVERY_ATTEMPTS,
 * it shows a permanent error message requiring a manual refresh.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MAX_RECOVERY_ATTEMPTS = 2;

interface Props {
  children: ReactNode;
  /** Human-friendly label for the pipeline stage that crashed. */
  stageLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class VisualPipelineErrorBoundary extends Component<Props, State> {
  private recoveryAttempts = 0;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.recoveryAttempts++;

    if (this.recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
      console.error(
        `[VisualPipelineErrorBoundary] Max recovery attempts (${MAX_RECOVERY_ATTEMPTS}) reached. Showing permanent error. Refresh the page to retry.`,
        error,
        info,
      );
      return;
    }

    console.warn(
      `[VisualPipelineErrorBoundary] Pipeline stage crashed (attempt ${this.recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}):`,
      error,
      info,
    );
  }

  private handleRetry = (): void => {
    if (this.recoveryAttempts > MAX_RECOVERY_ATTEMPTS) return;
    this.recoveryAttempts++;
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
        return (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
            <h3 className="text-base font-semibold mb-1">
              {this.props.stageLabel || 'Pipeline stage'} encountered an error
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md text-center">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Automatic recovery failed after {MAX_RECOVERY_ATTEMPTS} attempts. Please refresh the page.
            </p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh page
            </Button>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
          <h3 className="text-base font-semibold mb-1">
            {this.props.stageLabel || 'Pipeline stage'} encountered an error
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md text-center">
            {this.state.error?.message || 'An unexpected error occurred while loading this stage.'}
          </p>
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
