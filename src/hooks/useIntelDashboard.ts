/**
 * useIntelDashboard — dashboard-level intelligence summary data.
 *
 * Fetches intel pipeline run history and event data for high-level overview.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface IntelDashboardData {
  recentRuns: number
  totalEvents: number
  activePolicies: number
  lastRunAt: string | null
  engineSummary: Record<string, { ok: number; fail: number }>
}

export function useIntelDashboard() {
  return useQuery({
    queryKey: ['intel-dashboard'],
    queryFn: async (): Promise<IntelDashboardData> => {
      // Fetch recent intel pipeline runs
      const { data: runs, error: runsError } = await supabase
        .from('intel_pipeline_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (runsError) {
        console.warn('Intel dashboard runs error:', runsError)
      }

      // Fetch intel events
      const { data: events, error: eventsError } = await supabase
        .from('intel_events')
        .select('id', { count: 'exact', head: true })
        .limit(1)

      if (eventsError) {
        console.warn('Intel events count error:', eventsError)
      }

      const safeRuns = Array.isArray(runs) ? runs : []
      const engineSummary: Record<string, { ok: number; fail: number }> = {}

      for (const run of safeRuns) {
        const name = run.engine_name || 'unknown'
        if (!engineSummary[name]) engineSummary[name] = { ok: 0, fail: 0 }
        if (run.ok) engineSummary[name].ok++
        else engineSummary[name].fail++
      }

      return {
        recentRuns: safeRuns.length,
        totalEvents: events?.length ?? 0,
        activePolicies: 0,
        lastRunAt: safeRuns.length > 0 ? safeRuns[0].created_at : null,
        engineSummary,
      }
    },
    staleTime: 60_000,
  })
}