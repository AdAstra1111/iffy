import type { DocLadderAdapter, GenerationResult, GenerationIntent, LadderDocument } from './AdapterTypes'

export const docLadderAdapter: DocLadderAdapter = {
  getLadder(_format: string): LadderDocument[] {
    return []
  },

  getCurrentDoc(): LadderDocument | null {
    return null
  },

  async generateDoc(_intent: GenerationIntent): Promise<GenerationResult> {
    return { id: '', status: 'pending' }
  },

  async approveDoc(_docId: string): Promise<void> {
    // stub — no-op
  },
}