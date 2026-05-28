import type { CastAdapter, CastingStatus, ActorCandidate, GenerationResult } from './AdapterTypes'

export const castAdapter: CastAdapter = {
  async getCastingStatus(): Promise<CastingStatus[]> {
    return []
  },

  async getCandidates(_characterId: string): Promise<ActorCandidate[]> {
    return []
  },

  async shortlistActor(_characterId: string, _actorId: string): Promise<void> {
    // stub — no-op
  },

  async approveCasting(_characterId: string, _actorId: string): Promise<void> {
    // stub — no-op
  },
}