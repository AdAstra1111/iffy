import type { PackageAdapter, GenerationResult, GenerationIntent } from './AdapterTypes'

export const packageAdapter: PackageAdapter = {
  async getPackageItems(): Promise<{ type: string; status: string }[]> {
    return []
  },

  async generateItem(_type: string, _intent: GenerationIntent): Promise<GenerationResult> {
    return { id: '', status: 'pending' }
  },
}