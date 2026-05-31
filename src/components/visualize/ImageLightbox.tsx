/**
 * ImageLightbox — Full-screen image viewer for hero frames.
 *
 * Responsive, keyboard-navigable lightbox with:
 * - Zoom (pinch/scroll)
 * - Next/Previous navigation
 * - Image metadata
 * - Download button
 * - Close on escape/click-outside
 */
import React, { useCallback, useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, Info } from 'lucide-react'

export interface LightboxImage {
  id: string
  imageUrl: string | null
  label: string
  subtitle?: string
  role?: string
  isPrimary?: boolean
  createdAt?: string
  promptUsed?: string
}

interface ImageLightboxProps {
  images: LightboxImage[]
  initialIndex?: number
  onClose: () => void
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({
  images,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoomed, setZoomed] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  const current = images[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < images.length - 1
  const isValidImage = current?.imageUrl && current.imageUrl !== ''

  // Keyboard handlers
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          if (hasPrev) setCurrentIndex((i) => i - 1)
          break
        case 'ArrowRight':
          if (hasNext) setCurrentIndex((i) => i + 1)
          break
        case 'z':
          setZoomed((z) => !z)
          break
      }
    },
    [onClose, hasPrev, hasNext],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    setImgLoaded(false)
    setZoomed(false)
    setShowInfo(false)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown, currentIndex])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Image lightbox"
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm text-white/70 font-medium truncate">
            {current.label}
          </span>
          {current.isPrimary && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold uppercase tracking-wider">
              Primary
            </span>
          )}
          <span className="text-xs text-white/40">
            {currentIndex + 1} / {images.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isValidImage && (
            <>
              <button
                onClick={() => setZoomed((z) => !z)}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title={zoomed ? 'Zoom out (Z)' : 'Zoom in (Z)'}
              >
                {zoomed ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setShowInfo((s) => !s)}
                className={`p-2 rounded-lg transition-colors ${showInfo ? 'text-white bg-white/15' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                title="Image info"
              >
                <Info className="w-4 h-4" />
              </button>
              <a
                href={current.imageUrl!}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
            </>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors ml-2"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Image area ── */}
      <div className="flex-1 flex items-center justify-center relative min-h-0 p-4">
        {/* Left arrow */}
        {hasPrev && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCurrentIndex((i) => i - 1)
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-all opacity-60 hover:opacity-100"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Image */}
        <div
          className={`
            relative flex items-center justify-center transition-all duration-200
            ${zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}
            max-w-full max-h-full
          `}
          onClick={() => setZoomed((z) => !z)}
        >
          {isValidImage ? (
            <>
              {!imgLoaded && (
                <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse" />
              )}
              <img
                src={current.imageUrl!}
                alt={current.label}
                onLoad={() => setImgLoaded(true)}
                className={`
                  transition-all duration-300 rounded-lg shadow-2xl
                  ${zoomed ? 'max-w-none max-h-none scale-[2] origin-center' : 'max-w-full max-h-[80vh] object-contain'}
                  ${imgLoaded ? 'opacity-100' : 'opacity-0 absolute'}
                `}
                style={{
                  maxWidth: zoomed ? 'none' : '100%',
                  maxHeight: zoomed ? 'none' : '80vh',
                }}
              />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/30">
              <div className="w-24 h-24 rounded-2xl bg-white/5 flex items-center justify-center">
                <ImageIcon className="w-10 h-10" />
              </div>
              <p className="text-sm">No image available</p>
            </div>
          )}
        </div>

        {/* Right arrow */}
        {hasNext && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setCurrentIndex((i) => i + 1)
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-all opacity-60 hover:opacity-100"
            aria-label="Next image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* ── Info panel (slide-up) ── */}
      {showInfo && current && (
        <div className="bg-black/80 backdrop-blur-md border-t border-white/5 px-6 py-4 max-h-[40vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
          <div className="max-w-2xl mx-auto space-y-3">
            <h3 className="text-sm font-semibold text-white/80">Image Details</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-white/40">Role</span>
                <p className="text-white/70">{current.role || 'hero'}</p>
              </div>
              <div>
                <span className="text-white/40">Primary</span>
                <p className="text-white/70">{current.isPrimary ? 'Yes' : 'No'}</p>
              </div>
              {current.createdAt && (
                <div>
                  <span className="text-white/40">Created</span>
                  <p className="text-white/70">
                    {new Date(current.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              )}
              {current.subtitle && (
                <div className="col-span-2">
                  <span className="text-white/40">Entity</span>
                  <p className="text-white/70">{current.subtitle}</p>
                </div>
              )}
            </div>
            {current.promptUsed && (
              <div>
                <span className="text-xs text-white/40">Prompt</span>
                <p className="text-xs text-white/50 mt-1 italic leading-relaxed line-clamp-3">
                  {current.promptUsed}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Thumbnail strip ── */}
      {images.length > 1 && (
        <div className="bg-black/60 backdrop-blur-sm border-t border-white/5 px-4 py-2">
          <div className="flex gap-2 overflow-x-auto justify-center">
            {images.map((img, idx) => (
              <button
                key={img.id || idx}
                onClick={() => setCurrentIndex(idx)}
                className={`
                  flex-shrink-0 w-14 h-10 rounded-md overflow-hidden border-2 transition-all duration-150
                  ${idx === currentIndex ? 'border-white/60 ring-1 ring-white/20' : 'border-transparent hover:border-white/20'}
                `}
              >
                {img.imageUrl ? (
                  <img
                    src={img.imageUrl}
                    alt={img.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center">
                    <span className="text-[8px] text-white/20">—</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

export default ImageLightbox
