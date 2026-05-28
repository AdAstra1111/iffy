/**
 * VisualSkeleton — Loading skeleton with 8 layout variants.
 *
 * Variants: panel, card, list, table-row, text-block, icon-badge, image-grid, form
 *
 * Usage:
 *   <VisualSkeleton variant="panel" lines={3} />
 *   <VisualSkeleton variant="card" />
 *   <VisualSkeleton variant="list" count={5} />
 */
import { cn } from '@/lib/utils';

type SkeletonVariant =
  | 'panel'
  | 'card'
  | 'list'
  | 'table-row'
  | 'text-block'
  | 'icon-badge'
  | 'image-grid'
  | 'form';

interface VisualSkeletonProps {
  variant?: SkeletonVariant;
  /** Number of repeating elements (rows, cards, items). Default: 3 */
  count?: number;
  /** Approximate lines of text. Default: 3 */
  lines?: number;
  className?: string;
}

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div className={cn('h-3 bg-muted/60 rounded animate-pulse', className)} />
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('bg-muted/40 rounded-lg animate-pulse', className)} />
  );
}

function PanelSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <SkeletonBar className="w-36" />
        <SkeletonBar className="w-20" />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} className={i === lines - 1 ? 'w-3/4' : 'w-full'} />
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border/40 p-4 space-y-3 animate-pulse">
      <SkeletonBlock className="h-32 w-full" />
      <SkeletonBar className="w-3/4" />
      <SkeletonBar className="w-1/2" />
    </div>
  );
}

function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <SkeletonBlock className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <SkeletonBar className="w-2/3" />
            <SkeletonBar className="w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-2.5 animate-pulse border-b border-border/20 last:border-0">
          <SkeletonBar className="w-16" />
          <SkeletonBar className="w-32 flex-1" />
          <SkeletonBar className="w-24" />
          <SkeletonBlock className="h-6 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

function TextBlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2 p-2 animate-pulse">
      <SkeletonBar className="w-48 h-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} className={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}

function IconBadgeSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      <SkeletonBlock className="h-5 w-5 rounded" />
      <SkeletonBar className="w-20" />
    </div>
  );
}

function ImageGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="aspect-square rounded-lg" />
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      <div className="space-y-2">
        <SkeletonBar className="w-24" />
        <SkeletonBlock className="h-9 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <SkeletonBar className="w-20" />
        <SkeletonBlock className="h-9 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <SkeletonBar className="w-28" />
        <SkeletonBlock className="h-20 w-full rounded-md" />
      </div>
      <SkeletonBlock className="h-9 w-28 rounded-md" />
    </div>
  );
}

export function VisualSkeleton({
  variant = 'panel',
  count = 3,
  lines = 3,
  className,
}: VisualSkeletonProps) {
  return (
    <div className={cn('w-full', className)} role="status" aria-label="Loading">
      {variant === 'panel' && <PanelSkeleton lines={lines} />}
      {variant === 'card' && (
        <div className={cn('grid gap-4', count > 1 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
          {Array.from({ length: count }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}
      {variant === 'list' && <ListSkeleton count={count} />}
      {variant === 'table-row' && <TableRowSkeleton count={count} />}
      {variant === 'text-block' && <TextBlockSkeleton lines={lines} />}
      {variant === 'icon-badge' && <IconBadgeSkeleton />}
      {variant === 'image-grid' && <ImageGridSkeleton count={count} />}
      {variant === 'form' && <FormSkeleton />}
      <span className="sr-only">Loading...</span>
    </div>
  );
}