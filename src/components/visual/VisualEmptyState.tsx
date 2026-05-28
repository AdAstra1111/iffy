/**
 * VisualEmptyState — Empty state display with icon, title, description, and optional CTA.
 *
 * Variants: default (centered card) and compact (inline).
 *
 * Usage:
 *   <VisualEmptyState
 *     icon={<Image className="h-8 w-8" />}
 *     title="No images yet"
 *     description="Upload your first image to get started."
 *     action={<Button onClick={...}>Upload</Button>}
 *   />
 */
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface VisualEmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function VisualEmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: VisualEmptyStateProps) {
  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 py-3 px-2 text-sm text-muted-foreground',
          className,
        )}
        role="status"
        aria-label={title}
      >
        {icon && <span className="shrink-0 text-muted-foreground/60">{icon}</span>}
        <span className="font-medium">{title}</span>
        {description && <span className="text-muted-foreground/70">— {description}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className,
      )}
      role="status"
      aria-label={title}
    >
      {icon && (
        <div className="mb-4 flex items-center justify-center h-12 w-12 rounded-full bg-muted/50">
          <div className="text-muted-foreground/50">{icon}</div>
        </div>
      )}
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground max-w-xs mb-4">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}