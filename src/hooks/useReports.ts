/**
 * useReports — fetches project reports data for the intelligence overlay.
 *
 * Wraps existing report-generation and project-document data.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface ReportItem {
  id: string
  name: string
  type: 'csv' | 'pdf' | 'document'
  description: string
  projectId?: string
  created_at?: string
}

export function useReports(projectId?: string) {
  return useQuery({
    queryKey: ['project-reports', projectId],
    queryFn: async (): Promise<ReportItem[]> => {
      const items: ReportItem[] = []

      if (!projectId) return items

      // Check if project has documents to report on
      const { data: docs, error: docsError } = await supabase
        .from('project_documents')
        .select('id, doc_type, file_name, created_at')
        .eq('project_id', projectId)
        .limit(50)

      if (docsError) {
        console.warn('Reports docs query error:', docsError)
      }

      if (docs && docs.length > 0) {
        items.push({
          id: `report-docs-${projectId}`,
          name: 'Document Summary',
          type: 'document',
          description: `${docs.length} project documents available for reporting.`,
          projectId,
        })
      }

      return items
    },
    staleTime: 30_000,
    enabled: !!projectId,
  })
}

export function useAllReports() {
  return useQuery({
    queryKey: ['all-reports-summary'],
    queryFn: async (): Promise<ReportItem[]> => {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, title')
        .limit(20)

      if (!projects) return []

      const items: ReportItem[] = []

      for (const project of projects.slice(0, 5)) {
        items.push({
          id: `report-overview-${project.id}`,
          name: `${project.title} Overview`,
          type: 'document',
          description: `Summary report for ${project.title}.`,
          projectId: project.id,
        })
      }

      return items
    },
    staleTime: 60_000,
  })
}