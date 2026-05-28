import React, { useState, useRef, useEffect } from 'react'
import type { GenerationIntent } from '@/lib/adapters/AdapterTypes'

interface GenerationControlsProps {
  onGenerate: (intent: GenerationIntent) => void
  isGenerating: boolean
  disabled?: boolean
}

const GENERATION_OPTIONS: { type: GenerationIntent['type']; label: string }[] = [
  { type: 'new_angle', label: 'New Angle' },
  { type: 'new_lighting', label: 'New Lighting' },
  { type: 'new_outfit', label: 'New Outfit' },
  { type: 'custom', label: 'Custom Description' },
]

const GenerationControls: React.FC<GenerationControlsProps> = ({
  onGenerate,
  isGenerating,
  disabled = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [customText, setCustomText] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  const handleGenerate = (type: GenerationIntent['type']) => {
    setDropdownOpen(false)
    if (type === 'custom') {
      setShowCustomInput(true)
      return
    }
    onGenerate({ type })
  }

  const handleCustomSubmit = () => {
    if (!customText.trim()) return
    onGenerate({ type: 'custom', description: customText.trim() })
    setCustomText('')
    setShowCustomInput(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        {/* Main Generate button */}
        <button
          onClick={() => handleGenerate('new_angle')}
          disabled={disabled || isGenerating}
          className={`
            inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            transition-all duration-150
            ${
              isGenerating
                ? 'bg-primary/50 text-primary-foreground cursor-wait'
                : disabled
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]'
            }
          `}
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Generate
            </>
          )}
        </button>

        {/* Dropdown trigger */}
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          disabled={disabled || isGenerating}
          className={`
            p-2 rounded-lg border border-border text-muted-foreground
            hover:bg-muted transition-colors
            ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title="More generation options"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown menu */}
      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg z-30 overflow-hidden">
          {GENERATION_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => handleGenerate(opt.type)}
              className="w-full text-left px-3 py-2.5 text-sm text-popover-foreground hover:bg-muted transition-colors flex items-center gap-2"
            >
              {opt.type === 'new_angle' && (
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                </svg>
              )}
              {opt.type === 'new_lighting' && (
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
              {opt.type === 'new_outfit' && (
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              )}
              {opt.type === 'custom' && (
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Custom description input */}
      {showCustomInput && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-border bg-popover shadow-lg z-30 p-3">
          <textarea
            autoFocus
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Describe what you want to generate…"
            className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleCustomSubmit()
              }
              if (e.key === 'Escape') setShowCustomInput(false)
            }}
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={() => {
                setShowCustomInput(false)
                setCustomText('')
              }}
              className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCustomSubmit}
              disabled={!customText.trim()}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Generate
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GenerationControls