import type { IntelligenceAdapter } from './AdapterTypes'

export const intelligenceAdapter: IntelligenceAdapter = {
  async getInsights(_context: string): Promise<{ insights: string[] }> {
    return { insights: [] }
  },
}