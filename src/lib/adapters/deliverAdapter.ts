/**
 * deliverAdapter — Real implementation for Deliver workspace MVP.
 *
 * Routes export requests to the correct existing export function for each format:
 * - pdf / fdx:  src/lib/document-export.ts + src/lib/fdx-export.ts
 * - ics:        src/lib/ics-export.ts
 * - xls:        src/lib/xls-export.ts
 * - share_pack: Handled at the component level via useSharePack hook
 */
import type { DeliverAdapter, GenerationResult, ExportTypeInfo } from './AdapterTypes'
import { supabase } from '@/integrations/supabase/client'
import { downloadDocument } from '@/lib/document-export'
import { downloadFDX, exportVersionAsFDX } from '@/lib/fdx-export'
import { generateMultiEventICS, downloadICS } from '@/lib/ics-export'
import { exportBudgetXLSX } from '@/lib/xls-export'

// ── Available export formats ────────────────────────────────────────────────

const AVAILABLE_EXPORTS: ExportTypeInfo[] = [
  {
    format: 'pdf',
    label: 'PDF Script',
    icon: '📄',
    description: 'Professional screenplay PDF with IFFY branding',
    available: true,
    estimatedSize: '~250 KB',
  },
  {
    format: 'fdx',
    label: 'FDX Export',
    icon: '📄',
    description: 'Final Draft compatible format (.fdx)',
    available: true,
    estimatedSize: '~50 KB',
  },
  {
    format: 'ics',
    label: 'ICS Calendar',
    icon: '📄',
    description: 'Project deadlines and meetings as .ics',
    available: true,
    estimatedSize: '~2 KB',
  },
  {
    format: 'xls',
    label: 'XLS Budget',
    icon: '📊',
    description: 'Budget Top Sheet (.xlsx)',
    available: true,
    estimatedSize: '~15 KB',
  },
  {
    format: 'share_pack',
    label: 'Share Pack',
    icon: '📦',
    description: 'Generate a shareable link with selected documents',
    available: true,
    estimatedSize: null,
  },
]

// ── Data helpers ─────────────────────────────────────────────────────────────

async function fetchProjectTitle(projectId: string): Promise<string> {
  const { data } = await (supabase as any)
    .from('projects')
    .select('title')
    .eq('id', projectId)
    .maybeSingle()
  return (data as any)?.title || 'Project'
}

async function fetchLatestScriptContent(projectId: string): Promise<{ text: string; title: string } | null> {
  // Fetch the latest screenplay document
  const { data: docs } = await (supabase as any)
    .from('project_documents')
    .select('id, title')
    .eq('project_id', projectId)
    .in('doc_type', ['feature_script', 'episode_script', 'season_script', 'script'])
    .order('created_at', { ascending: false })
    .limit(1)

  const doc = (docs as any[])?.[0]
  if (!doc) return null

  // Fetch the latest version content
  const { data: versions } = await (supabase as any)
    .from('project_document_versions')
    .select('plaintext')
    .eq('document_id', doc.id)
    .order('version_number', { ascending: false })
    .limit(1)

  const text = (versions as any[])?.[0]?.plaintext
  if (!text) return null

  return { text, title: doc.title || 'Script' }
}

async function fetchDeadlines(projectId: string): Promise<Array<{ label: string; due_date: string; notes?: string }>> {
  const { data } = await (supabase as any)
    .from('project_deadlines')
    .select('label, due_date, notes')
    .eq('project_id', projectId)
    .order('due_date', { ascending: true })

  return (data as any[]) || []
}

async function fetchBudgetData(projectId: string, projectTitle: string) {
  const { data: budgets } = await (supabase as any)
    .from('project_budgets')
    .select('id, label')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)

  const budget = (budgets as any[])?.[0]
  if (!budget) return null

  const { data: lines } = await (supabase as any)
    .from('project_budget_lines')
    .select('*')
    .eq('budget_id', budget.id)
    .order('sort_order', { ascending: true })

  const budgetLines = (lines as any[]) || []
  const totalAmount = budgetLines.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0)

  return {
    projectTitle,
    budgetLabel: budget.label,
    currency: 'USD',
    lines: budgetLines.map((l: any) => ({
      id: l.id,
      budget_id: l.budget_id,
      category: l.category,
      line_name: l.line_name,
      amount: Number(l.amount || 0),
      sort_order: l.sort_order,
      notes: l.notes,
    })),
    totalAmount,
  }
}

// ── Adapter Implementation ───────────────────────────────────────────────────

export const deliverAdapter: DeliverAdapter = {
  async getExportTypes(projectId: string): Promise<ExportTypeInfo[]> {
    try {
      // Check what data is actually available for this project
      const [script, deadlines, budget] = await Promise.all([
        fetchLatestScriptContent(projectId),
        fetchDeadlines(projectId),
        fetchBudgetData(projectId, ''),
      ])

      return AVAILABLE_EXPORTS.map((info) => {
        switch (info.format) {
          case 'pdf':
          case 'fdx':
            return { ...info, available: !!script }
          case 'ics':
            return { ...info, available: deadlines.length > 0 }
          case 'xls':
            return { ...info, available: !!budget }
          case 'share_pack':
            return { ...info, available: true } // always available; user picks content
          default:
            return info
        }
      })
    } catch {
      // On error, return defaults — assume all available (graceful degradation)
      return AVAILABLE_EXPORTS
    }
  },

  async exportProject(format: string, projectId: string): Promise<GenerationResult> {
    try {
      switch (format) {
        case 'pdf': {
          const content = await fetchLatestScriptContent(projectId)
          if (!content) throw new Error('No screenplay content available for export')
          downloadDocument(content.text, content.title, 'pdf')
          return { id: 'script-pdf', status: 'completed' }
        }

        case 'fdx': {
          const content = await fetchLatestScriptContent(projectId)
          if (!content) throw new Error('No screenplay content available for export')
          const fdxContent = exportVersionAsFDX(content.text, content.title)
          downloadFDX(fdxContent, content.title)
          return { id: 'script-fdx', status: 'completed' }
        }

        case 'ics': {
          const deadlines = await fetchDeadlines(projectId)
          if (deadlines.length === 0) throw new Error('No deadlines to export')
          const events = deadlines.map((d) => ({
            title: `⏰ ${d.label}`,
            description: d.notes || '',
            startDate: new Date(d.due_date),
          }))
          const icsContent = generateMultiEventICS(events)
          downloadICS(icsContent, `iffy-deadlines-${projectId.slice(0, 8)}`)
          return { id: 'calendar-ics', status: 'completed' }
        }

        case 'xls': {
          const projectTitle = await fetchProjectTitle(projectId)
          const budgetData = await fetchBudgetData(projectId, projectTitle)
          if (!budgetData) throw new Error('No budget data available for export')
          exportBudgetXLSX(budgetData)
          return { id: 'budget-xls', status: 'completed' }
        }

        default:
          return { id: format, status: 'failed', error: `Unknown export format: ${format}` }
      }
    } catch (err: any) {
      console.error(`[deliverAdapter] exportProject(${format}) failed:`, err)
      return { id: format, status: 'failed', error: err.message || 'Export failed' }
    }
  },
}