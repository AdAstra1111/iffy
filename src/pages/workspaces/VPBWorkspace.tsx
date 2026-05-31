/**
 * VPBWorkspace — Visual Production Bible Workspace.
 *
 * Full workspace for viewing, navigating, and regenerating the VPB.
 * Renders the deterministic markdown output from vpb-export.
 * 14-section sidebar navigation with status indicators.
 * Export, regenerate, responsive layout.
 *
 * Architecture-Strict:
 *   No LLM. No inference. Pure markdown rendering over deterministic assembly.
 */
import React, { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  BookOpen, FileText, Palette, Users, MapPin, Shirt,
  Image, Clapperboard, LayoutGrid, Shield, HardDrive,
  ArrowLeft, RefreshCw, Download, ChevronRight,
  CheckCircle2, AlertTriangle, Clock, XCircle, Loader2,
  Film,
} from 'lucide-react'
import {
  useVisualProductionBible,
  VPB_SECTION_LABELS,
  VPB_SECTION_KEYS,
  extractSectionMarkdown,
} from '@/hooks/useVisualProductionBible'
// ── Icon map for sections ────────────────────────────────────────────────

const SECTION_ICONS: Record<string, React.ElementType> = {
  projectOverview: BookOpen,
  visualLanguage: Palette,
  visualStyle: Film,
  productionDesign: LayoutGrid,
  characters: Users,
  cast: Users,
  locations: MapPin,
  wardrobe: Shirt,
  heroFrames: Image,
  posters: Clapperboard,
  lookbookSections: BookOpen,
  sceneBreakdown: FileText,
  governance: Shield,
  assetInventory: HardDrive,
}

// ── Helpers ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'populated':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
    case 'empty':
      return <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />
    case 'in_progress':
    case 'commenced':
      return <Clock className="w-3.5 h-3.5 text-amber-400" />
    case 'blocked':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
    default:
      return <div className="w-3.5 h-3.5 rounded-full bg-muted-foreground/20" />
  }
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ── Markdown Renderer ────────────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null

  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeContent = ''
  let codeLang = ''
  let inTable = false
  let tableRows: string[] = []

  const flushTable = () => {
    if (tableRows.length > 0) {
      const headers = tableRows[0].split('|').filter((c) => c.trim()).map((c) => c.trim())
      const dataRows = tableRows.slice(2).map((r) => r.split('|').filter((c) => c.trim()).map((c) => c.trim()))
      if (headers.length > 0) {
        elements.push(
          <div key={`table-${elements.length}`} className="overflow-x-auto mb-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="border border-border/30 px-3 py-1.5 bg-muted/20 text-left font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-border/30 px-3 py-1 text-muted-foreground/80">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    }
    tableRows = []
    inTable = false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block handling
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="text-xs bg-muted/10 p-3 rounded-lg mb-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-[50vh] overflow-y-auto">
            <code>{codeContent}</code>
          </pre>
        )
        codeContent = ''
        codeLang = ''
        inCodeBlock = false
      } else {
        flushTable()
        inCodeBlock = true
        codeLang = line.slice(3).trim()
      }
      continue
    }
    if (inCodeBlock) {
      codeContent += (codeContent ? '\n' : '') + line
      continue
    }

    // Table handling
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) inTable = true
      tableRows.push(line)
      continue
    }
    if (inTable) {
      flushTable()
    }

    // Skip the separator line
    if (line.includes('|---') || line === '---') continue

    // Skip empty lines after heading
    if (line.trim() === '' && (i === 0 || lines[i - 1]?.startsWith('#'))) continue

    // Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-sm font-semibold text-foreground/80 mt-5 mb-2">
          {line.replace('### ', '')}
        </h3>
      )
      continue
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-base font-semibold text-foreground mt-6 mb-3 pb-1 border-b border-border/20">
          {line.replace('## ', '')}
        </h2>
      )
      continue
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-lg font-bold text-foreground mt-4 mb-3">
          {line.replace('# ', '')}
        </h1>
      )
      continue
    }

    // Bold markers like **Key:** Value
    if (line.startsWith('**') && line.includes('**:')) {
      const colonIdx = line.indexOf('**:')
      const key = line.slice(2, colonIdx)
      const value = line.slice(colonIdx + 3).trim()
      elements.push(
        <div key={`meta-${i}`} className="flex items-start gap-2 text-sm mb-1.5">
          <span className="text-muted-foreground/60 font-medium whitespace-nowrap">{key}:</span>
          <span className="text-muted-foreground/80">{value}</span>
        </div>
      )
      continue
    }

    // Inline bold
    const boldMatch = line.match(/^\*\*(.+?)\*\*$/)
    if (boldMatch) {
      elements.push(
        <p key={`p-${i}`} className="text-sm font-medium text-foreground/80 mb-2">
          {boldMatch[1]}
        </p>
      )
      continue
    }

    // Bullet list
    if (line.startsWith('- ')) {
      elements.push(
        <li key={`li-${i}`} className="text-sm text-muted-foreground/80 ml-4 mb-0.5 list-disc">
          {line.replace(/^- /, '').replace(/^-\s*/, '')}
        </li>
      )
      continue
    }

    // Regular paragraph
    if (line.trim()) {
      // Clean up ** markers
      const cleaned = line.replace(/\*\*/g, '')
      elements.push(
        <p key={`p-${i}`} className="text-sm text-muted-foreground/80 mb-2">
          {cleaned}
        </p>
      )
    }
  }

  // Flush remaining code block or table
  if (inCodeBlock && codeContent) {
    elements.push(
      <pre key="code-end" className="text-xs bg-muted/10 p-3 rounded-lg mb-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-[50vh] overflow-y-auto">
        <code>{codeContent}</code>
      </pre>
    )
  }
  if (inTable) flushTable()

  return <div className="space-y-1">{elements}</div>
}

// ── VPBWorkspace ─────────────────────────────────────────────────────────

const VPBWorkspace: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const {
    exportResult,
    isLoading,
    isGenerating,
    error,
    currentSection,
    sectionStatuses,
    markdown,
    versionNumber,
    setCurrentSection,
    regenerate,
    refresh,
  } = useVisualProductionBible({ projectId })

  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Extract current section markdown
  const sectionContent = useMemo(() => {
    if (!markdown) return ''
    const label = VPB_SECTION_LABELS[currentSection] || currentSection
    return extractSectionMarkdown(markdown, label)
  }, [markdown, currentSection])

  // Handle export
  const handleExport = async () => {
    if (!markdown) return
    setExporting(true)
    setShowExportMenu(false)
    try {
      const projectTitle = markdown.match(/\*\*Project:\*\* (.+)/)?.[1] || 'vpb'
      const blob = new Blob([markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vpb-${projectTitle.replace(/[^a-zA-Z0-9]/g, '_')}-v${versionNumber || 1}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('VPB exported as Markdown')
    } catch (err: any) {
      toast.error(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleCopyAll = async () => {
    if (!markdown) return
    setShowExportMenu(false)
    try {
      await navigator.clipboard.writeText(markdown)
      toast.success('VPB content copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  // Handle regenerate
  const handleRegenerate = async () => {
    if (isGenerating) return
    toast.info('Generating VPB...')
    await regenerate()
    toast.success('VPB regenerated')
  }

  // Status counts
  const populatedCount = sectionStatuses.filter((s) => s.status === 'populated').length
  const emptyCount = sectionStatuses.filter((s) => s.status === 'empty').length

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/visualize`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Visualize
          </Link>
          <div className="w-px h-5 bg-border/40" />
          <h1 className="text-base font-semibold">Visual Production Bible</h1>
          {versionNumber && (
            <span className="text-xs text-muted-foreground/50 px-2 py-0.5 rounded-full bg-muted/30">
              v{versionNumber}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status summary */}
          {exportResult && (
            <span className="text-xs text-muted-foreground/50 hidden sm:block">
              {populatedCount}/{sectionStatuses.length} sections populated
            </span>
          )}

          {/* Refresh button */}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Regenerate button */}
          <button
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Regenerate
              </>
            )}
          </button>

          {/* Export button */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!exportResult || exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-sm text-muted-foreground/80 hover:text-foreground hover:bg-muted/20 transition-colors disabled:opacity-40"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Export
            </button>

            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border/40 bg-card shadow-lg backdrop-blur-sm z-20 py-1">
                <button
                  onClick={handleExport}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
                >
                  Download as .md
                </button>
                <button
                  onClick={handleCopyAll}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
                >
                  Copy all to clipboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body: Sidebar + Content ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar — section navigation */}
        <div className="w-52 flex-shrink-0 border-r border-border/30 overflow-y-auto bg-muted/5 hidden md:block">
          <div className="py-2">
            {sectionStatuses.map((s) => {
              const Icon = SECTION_ICONS[s.section] || BookOpen
              const isActive = currentSection === s.section
              return (
                <button
                  key={s.section}
                  onClick={() => setCurrentSection(s.section)}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-all duration-100
                    ${isActive
                      ? 'bg-primary/10 text-primary border-r-2 border-primary'
                      : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/20'
                    }
                  `}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 truncate">{s.label}</span>
                  <StatusIcon status={s.status} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Mobile section selector */}
        <div className="md:hidden px-4 py-2 border-b border-border/20">
          <select
            value={currentSection}
            onChange={(e) => setCurrentSection(e.target.value)}
            className="w-full text-sm bg-muted/30 border border-border/30 rounded-lg px-3 py-2"
          >
            {sectionStatuses.map((s) => (
              <option key={s.section} value={s.section}>
                {s.label} {s.status === 'populated' ? '✓' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
            {/* Section header */}
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-lg font-semibold">
                {VPB_SECTION_LABELS[currentSection] || currentSection}
              </h2>
              {versionNumber && (
                <span className="text-xs text-muted-foreground/50">
                  v{versionNumber} · {exportResult ? formatDate('') : ''}
                </span>
              )}
              {sectionStatuses.find((s) => s.section === currentSection)?.status === 'populated' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  Populated
                </span>
              )}
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-muted/20 animate-pulse" />
                ))}
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <AlertTriangle className="w-8 h-8 text-red-400" />
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={refresh}
                  className="text-sm text-primary hover:underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* No VPB state */}
            {!isLoading && !error && !exportResult && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <BookOpen className="w-12 h-12 text-muted-foreground/20" />
                <h3 className="text-base font-medium">No Visual Production Bible yet</h3>
                <p className="text-sm text-muted-foreground/60 text-center max-w-md">
                  The VPB is a deterministic assembly of all visual production data —
                  characters, cast, locations, hero frames, and more.
                  Generate one to get started.
                </p>
                <button
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 mt-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Generate VPB
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Section content — rendered markdown */}
            {!isLoading && !error && sectionContent && (
              <div className="min-h-[40vh]">
                <MarkdownRenderer content={sectionContent} />
              </div>
            )}

            {/* Empty section */}
            {!isLoading && !error && exportResult && !sectionContent && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <p className="text-sm text-muted-foreground/50">No content in this section</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Full VPB preview (expandable footer) ── */}
      {markdown && (
        <div className="border-t border-border/20 bg-muted/5">
          <details className="group px-4 py-2">
            <summary className="flex items-center gap-1.5 text-xs text-muted-foreground/40 cursor-pointer hover:text-muted-foreground/60 transition-colors">
              <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
              Full VPB preview ({exportResult?.sectionCount || '?'} sections, {exportResult?.versionNumber ? `v${exportResult.versionNumber}` : ''})
            </summary>
            <div className="mt-2 max-h-[30vh] overflow-y-auto text-[10px] text-muted-foreground/30 font-mono leading-relaxed whitespace-pre-wrap border border-border/20 rounded-lg p-3 bg-background/50">
              {markdown.slice(0, 5000)}
              {markdown.length > 5000 && (
                <p className="text-muted-foreground/20 mt-2">... ({markdown.length - 5000} more chars) ...</p>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

export default VPBWorkspace
