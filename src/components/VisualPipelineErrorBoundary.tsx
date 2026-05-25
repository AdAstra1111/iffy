/**
 * VisualPipelineErrorBoundary — Catches errors from lazy-loaded pipeline components.
 *
 * Wraps the outer <Suspense> in VisualProductionPipeline so that if any
 * lazy-loaded stage content (CastingPipeline, ProductionDesign, LookBookPage)
 * throws during load or render, the user sees a recoverable fallback instead
 * of a white screen crash.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[VisualPipelineErrorBoundary] Pipeline stage crashed:', error, info);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
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