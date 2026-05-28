/**
 * useMarketIntelligence — fetches market intelligence data for the overlay.
 *
 * Wraps existing market data from Supabase (market_buyers, territory_costs, etc.)
 * into a unified hook compatible with the intelligence adapter.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface MarketIntelligenceItem {
  id: string
  type: 'buyer' | 'territory' | 'signal' | 'festival'
  label: string
  description?: string
  source: string
  relevance?: number
  metadata?: Record<string, unknown>
}

export function useMarketIntelligence(projectId?: string) {
  return useQuery({
    queryKey: ['market-intelligence', projectId],
    queryFn: async () => {
      const items: MarketIntelligenceItem[] = []

      // Fetch active buyers
      const { data: buyers } = await supabase
        .from('market_buyers')
        .select('*')
        .eq('status', 'active')
        .limit(20)

      if (buyers) {
        buyers.forEach((b: any) => {
          items.push({
            id: `buyer-${b.id}`,
            type: 'buyer',
            label: b.name || b.buyer_name || 'Unknown Buyer',
            description: b.notes || b.description || undefined,
            source: 'Market Buyers',
            relevance: b.match_score || undefined,
            metadata: { regions: b.regions, genres: b.genres },
          })
        })
      }

      return items
    },
    staleTime: 60_000,
    enabled: !!projectId,
  })
}

export function useMarketIntelligenceData() {
  return useQuery({
    queryKey: ['market-intelligence-all'],
    queryFn: async () => {
      const items: MarketIntelligenceItem[] = []

      // Fetch active buyers
      const { data: buyers } = await supabase
        .from('market_buyers')
        .select('*')
        .eq('status', 'active')
        .limit(20)

      if (buyers) {
        buyers.forEach((b: any) => {
          items.push({
            id: `buyer-${b.id}`,
            type: 'buyer',
            label: b.name || b.buyer_name || 'Unknown Buyer',
            description: b.notes || b.description || undefined,
            source: 'Market Buyers',
            relevance: b.match_score || undefined,
            metadata: { regions: b.regions, genres: b.genres },
          })
        })
      }

      return items
    },
    staleTime: 60_000,
  })
}