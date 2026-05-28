/**
 * DocumentViewer — Document content viewer with comfortable reading layout.
 *
 * - Fetches document content from project_documents table
 * - Renders in serif typography at comfortable reading width
 * - Loading skeleton, empty state, error state
 * - Top bar with document title, stage name, quality score
 */
import React, { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { FileText, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DocumentViewerProps {
  docId: string | null
  projectId: string
}

interface DocData {
  id: string
  title: string
  doc_type: string
  plaintext: string | null
  extracted_text: string | null
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea / Logline',
  concept_brief: 'Concept Brief',
  treatment: 'Treatment',
  story_outline: 'Story Outline',
  character_bible: 'Character Bible',
  beat_sheet: 'Beat Sheet',
  feature_script: 'Script',
  episode_script: 'Episode Script',
  season_script: 'Season Script',
  production_draft: 'Production Draft',
  documentary_outline: 'Documentary Outline',
}

function getStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Skeleton loader ─────────────────────────────────────────────────────────

function ViewerSkeleton() {
  return (
    <div className="space-y-4 p-6 animate-pulse">
      <div className="h-6 bg-muted rounded w-1/3" />
      <div className="h-4 bg-muted rounded w-1/4" />
      <div className="space-y-2 mt-6">
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-5/6" />
        <div className="h-4 bg-muted rounded w-4/5" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-5/6" />
        <div className="h-4 bg-muted rounded w-2/3" />
        <div className="h-4 bg-muted rounded w-4/5" />
        <div className="h-4 bg-muted rounded w-5/6" />
        <div className="h-4 bg-muted rounded w-3/4" />
      </div>
    </div>
  )
}

// ── Empty state ─────────────────────────────────────────────────────────────

function EmptyViewer() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
      <FileText className="w-12 h-12 text-muted-foreground/40 mb-4" />
      <p className="text-lg text-muted-foreground font-medium">
        Select a document to view
      </p>
      <p className="text-sm text-muted-foreground/60 mt-1">
        Click a stage on the ladder above to see its content
      </p>
    </div>
  )
}

// ── Error state ─────────────────────────────────────────────────────────────

function ViewerError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
      <AlertCircle className="w-10 h-10 text-destructive/60 mb-3" />
      <p className="text-sm text-destructive font-medium">Failed to load document</p>
      <p className="text-xs text-muted-foreground mt-1">{message}</p>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

const DocumentViewer: React.FC<DocumentViewerProps> = ({ docId, projectId }) => {
  const [doc, setDoc] = useState<DocData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!docId) {
      setDoc(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('project_documents')
      .select('id, title, doc_type, plaintext, extracted_text')
      .eq('id', docId)
      .eq('project_id', projectId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return
        setLoading(false)
        if (err) {
          setError(err.message)
          return
        }
        if (!data) {
          setError('Document not found')
          return
        }
        setDoc(data as DocData)
      })

    return () => { cancelled = true }
  }, [docId, projectId])

  // Empty state
  if (!docId) return <EmptyViewer />

  // Loading state
  if (loading) return <ViewerSkeleton />

  // Error state
  if (error) return <ViewerError message={error} />
  if (!doc) return <ViewerError message="Document not found" />

  // Content
  const content = doc.plaintext || doc.extracted_text || ''
  const stageName = getStageLabel(doc.doc_type)

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold truncate">{doc.title}</h2>
          <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full whitespace-nowrap">
            {stageName}
          </span>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {content ? (
          <div className="max-w-3xl mx-auto px-8 py-6">
            <div
              className={cn(
                'prose prose-sm dark:prose-invert max-w-none',
                'font-serif leading-relaxed text-foreground/90',
              )}
              style={{ fontFamily: "'Georgia', 'Palatino Linotype', 'Book Antiqua', serif" }}
            >
              {/* Render plaintext as paragraphs */}
              {content.split('\n\n').map((paragraph, i) => (
                <p key={i} className="mb-4 text-[15px] leading-7">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No content available for this document
          </div>
        )}
      </div>
    </div>
  )
}

export default DocumentViewer