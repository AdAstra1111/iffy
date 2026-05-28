import React from 'react'
import type { VisualImage } from '@/lib/adapters/AdapterTypes'

interface VisualGridProps {
  images: VisualImage[]
  entityName?: string
  onSelect: (image: VisualImage) => void
  onApprove: (imageId: string) => void
  onSetPrimary: (imageId: string) => void
  onDelete?: (imageId: string) => void
  isGenerating?: boolean
  onGenerate?: () => void
  isLoading?: boolean
}

// ── Skeleton Card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="aspect-[3/4] rounded-lg bg-muted animate-pulse flex flex-col overflow-hidden">
      <div className="flex-1 bg-muted-foreground/5" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-16 bg-muted-foreground/10 rounded" />
        <div className="h-3 w-24 bg-muted-foreground/10 rounded" />
      </div>
    </div>
  )
}

// ── Image Card ────────────────────────────────────────────────────────────────

function ImageCard({
  image,
  onSelect,
  onApprove,
  onSetPrimary,
  onDelete,
}: {
  image: VisualImage
  onSelect: (img: VisualImage) => void
  onApprove: (id: string) => void
  onSetPrimary: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const [hovering, setHovering] = React.useState(false)

  const isApproved = image.status === 'approved'
  const isPrimary = image.isPrimary

  return (
    <div
      className="relative group rounded-lg overflow-hidden border border-border bg-card cursor-pointer transition-all duration-150 hover:ring-2 hover:ring-primary/30 hover:shadow-md"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={() => onSelect(image)}
    >
      {/* Image thumbnail */}
      <div className="aspect-[3/4] bg-muted relative overflow-hidden">
        {image.url ? (
          <img
            src={image.url}
            alt={`Entity image`}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Status badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {isApproved && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/80 text-white text-xs font-medium backdrop-blur-sm">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approved
            </span>
          )}
          {isPrimary && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/80 text-white text-xs font-medium backdrop-blur-sm">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Primary
            </span>
          )}
          {!isApproved && !isPrimary && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground text-xs font-medium backdrop-blur-sm">
              Pending
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      {hovering && (
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center gap-1.5 p-3 transition-opacity">
          {!isApproved && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onApprove(image.id)
              }}
              className="flex-1 px-2 py-1.5 rounded-md bg-green-600/80 hover:bg-green-600 text-white text-xs font-medium transition-colors"
              title="Approve image"
            >
              Approve
            </button>
          )}
          {!isPrimary && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSetPrimary(image.id)
              }}
              className="flex-1 px-2 py-1.5 rounded-md bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-medium transition-colors"
              title="Set as primary"
            >
              Set Primary
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(image.id)
              }}
              className="px-2 py-1.5 rounded-md bg-destructive/80 hover:bg-destructive text-destructive-foreground text-xs font-medium transition-colors"
              title="Delete image"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Image info */}
      <div className="p-2.5 border-t border-border/50">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground truncate">
            {image.metadata?.width && image.metadata?.height
              ? `${image.metadata.width}×${image.metadata.height}`
              : 'Image'}
          </span>
          <span className="text-xs text-muted-foreground capitalize">
            {image.status}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Generate Button Card ─────────────────────────────────────────────────────

function GenerateCard({
  isGenerating,
  onClick,
}: {
  isGenerating: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={isGenerating}
      className={`
        aspect-[3/4] rounded-lg border-2 border-dashed border-muted-foreground/30
        flex flex-col items-center justify-center gap-2
        transition-all duration-150
        ${
          isGenerating
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
        }
      `}
    >
      {isGenerating ? (
        <>
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs text-muted-foreground">Generating…</span>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="text-xs text-muted-foreground">New</span>
        </>
      )}
    </button>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onGenerate }: { onGenerate?: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-muted-foreground mb-1">
        No images yet
      </h3>
      <p className="text-sm text-muted-foreground/70 mb-4">
        Generate your first one.
      </p>
      {onGenerate && (
        <button
          onClick={onGenerate}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Generate Image
        </button>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

const VisualGrid: React.FC<VisualGridProps> = ({
  images,
  entityName,
  onSelect,
  onApprove,
  onSetPrimary,
  onDelete,
  isGenerating = false,
  onGenerate,
  isLoading = false,
}) => {
  // Loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  // Empty state
  if (images.length === 0 && !isGenerating) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <EmptyState onGenerate={onGenerate} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {images.map((image) => (
        <ImageCard
          key={image.id}
          image={image}
          onSelect={onSelect}
          onApprove={onApprove}
          onSetPrimary={onSetPrimary}
          onDelete={onDelete}
        />
      ))}
      {onGenerate && (
        <GenerateCard isGenerating={isGenerating} onClick={onGenerate} />
      )}
      {entityName && (
        <div className="col-span-full mt-2 text-xs text-muted-foreground/50 text-right">
          Showing {images.length} image{images.length !== 1 ? 's' : ''} for {entityName}
        </div>
      )}
    </div>
  )
}

export default VisualGrid