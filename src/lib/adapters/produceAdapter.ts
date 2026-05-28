import type { ProduceAdapter, GenerationResult } from './AdapterTypes'

export const produceAdapter: ProduceAdapter = {
  async getAssetStatus(): Promise<Record<string, 'not_started' | 'in_progress' | 'complete'>> {
    return {}
  },

  async generateAsset(
    _type: string,
    _params?: Record<string, unknown>,
  ): Promise<GenerationResult> {
    return { id: '', status: 'pending' }
  },
}