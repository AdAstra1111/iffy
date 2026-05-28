import type { DeliverAdapter, GenerationResult } from './AdapterTypes'

export const deliverAdapter: DeliverAdapter = {
  async getExportTypes(): Promise<{ format: string; available: boolean }[]> {
    return []
  },

  async exportProject(_format: string): Promise<GenerationResult> {
    return { id: '', status: 'pending' }
  },
}