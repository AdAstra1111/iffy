import React, { useCallback, useEffect, useRef } from 'react'
import type { VisualImage } from '@/lib/adapters/AdapterTypes'

interface ImageViewerProps {
  image: VisualImage | null
  images: VisualImage[]
  onClose: () => void
  onApprove: (imageId: string) => void
  onSetPrimary: (imageId: string) => void
  onRegenerate?: (image: VisualImage) => void
  onDelete?: (imageId: string) => void
  onNavigate?: (image: VisualImage) => void
}

const ImageViewer: React.FC<ImageViewerProps> = ({
  image,
  images,
  onClose,
  onApprove,
  onSetPrimary,
  onRegenerate,
  onDelete,
  onNavigate,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!image) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        navigateDir(-1)
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        navigateDir(1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [image, images])

  // Lock scroll
  useEffect(() => {
    if (!image) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [image])

  const navigateDir = useCallback(
    (dir: 1 | -1) => {
      if (!image || images.length <= 1) return
      const idx = images.findIndex((i) => i.id === image.id)
      if (idx === -1) return
      const nextIdx = (idx + dir + images.length) % images.length
      onNavigate?.(images[nextIdx])
    },
    [image, images, onNavigate],
  )

  if (!image) return null

  const currentIdx = images.findIndex((i) => i.id === image.id)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < images.length - 1
  const isApproved = image.status === 'approved'
  const isPrimary = image.isPrimary

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="text-white/70 text-sm">
            {currentIdx + 1} / {images.length}
          </span>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative px-16">
        {/* Left navigation */}
        {hasPrev && (
          <button
            onClick={() => navigateDir(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Previous image"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => navigateDir(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Next image"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Image */}
        {image.url ? (
          <img
            src={image.url}
            alt="Enlarged view"
            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
          />
        ) : (
          <div className="text-white/50 text-lg">No image available</div>
        )}
      </div>

      {/* Bottom bar — glassmorphism */}
      <div className="relative bg-white/5 backdrop-blur-xl border-t border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-center gap-3 flex-wrap">
          {/* Approve */}
          {!isApproved && (
            <button
              onClick={() => onApprove(image.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600/60 hover:bg-green-600 text-white text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approve
            </button>
          )}
          {isApproved && (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600/30 text-green-300 text-sm font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approved
            </span>
          )}

          {/* Set as Primary */}
          {!isPrimary && (
            <button
              onClick={() => onSetPrimary(image.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600/60 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Set as Primary
            </button>
          )}
          {isPrimary && (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600/30 text-amber-300 text-sm font-medium">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Primary
            </span>
          )}

          {/* Regenerate */}
          {onRegenerate && (
            <button
              onClick={() => onRegenerate(image)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </button>
          )}

          {/* Delete */}
          {onDelete && (
            <button
              onClick={() => onDelete(image.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600/40 hover:bg-red-600/70 text-white text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ImageViewer