// Generation intent — creative intention, NOT technical parameters
export interface GenerationIntent {
  type: 'new_angle' | 'new_lighting' | 'new_outfit' | 'regenerate' | 'custom'
  description?: string  // free text description of what to generate
}

// Generic result type
export interface GenerationResult {
  id: string
  status: 'completed' | 'pending' | 'failed'
  error?: string
}

// Generic entity type
export interface VisualEntity {
  id: string
  name: string
  type: 'character' | 'location' | 'costume' | 'style' | 'lookbook' | 'poster'
  primaryImage?: string
  status: 'empty' | 'has_images' | 'approved'
}

// Image type
export interface VisualImage {
  id: string
  url: string
  entityType: string
  entityId: string
  status: 'pending' | 'approved' | 'rejected'
  isPrimary: boolean
  metadata?: Record<string, unknown>
}

// Style profile
export interface StyleProfile {
  colorPalette: string[]
  lighting: string
  cameraLanguage: string
  texture: string
}

// Casting types
export interface CastingStatus {
  characterId: string
  characterName: string
  status: 'uncast' | 'candidates' | 'shortlisted' | 'approved'
  boundActorId?: string
  candidateCount: number
}

export interface ActorCandidate {
  id: string
  name: string
  headshotUrl?: string
  matchScore: number
  specialties: string[]
}

// Document types
export interface LadderDocument {
  id: string
  stage: string
  title: string
  status: 'not_started' | 'generating' | 'complete' | 'approved'
  qualityScore?: number
}

// Adapter interface definitions — these are the contracts
export interface DocLadderAdapter {
  getLadder(format: string): LadderDocument[]
  getCurrentDoc(): LadderDocument | null
  generateDoc(intent: GenerationIntent): Promise<GenerationResult>
  approveDoc(docId: string): Promise<void>
}

export interface VisualAdapter {
  getEntities(type: string): Promise<VisualEntity[]>
  getEntityImages(type: string, id: string): Promise<VisualImage[]>
  generateImage(entityType: string, entityId: string, intent: GenerationIntent): Promise<GenerationResult>
  approveImage(imageId: string): Promise<void>
  setPrimaryImage(entityType: string, entityId: string, imageId: string): Promise<void>
  getStyleProfile(): Promise<StyleProfile>
}

export interface CastAdapter {
  getCastingStatus(): Promise<CastingStatus[]>
  getCandidates(characterId: string): Promise<ActorCandidate[]>
  shortlistActor(characterId: string, actorId: string): Promise<void>
  approveCasting(characterId: string, actorId: string): Promise<void>
}

export interface ProduceAdapter {
  getAssetStatus(): Promise<Record<string, 'not_started' | 'in_progress' | 'complete'>>
  generateAsset(type: string, params?: Record<string, unknown>): Promise<GenerationResult>
}

export interface PackageAdapter {
  getPackageItems(): Promise<{ type: string; status: string }[]>
  generateItem(type: string, intent: GenerationIntent): Promise<GenerationResult>
}

export interface DeliverAdapter {
  getExportTypes(): Promise<{ format: string; available: boolean }[]>
  exportProject(format: string): Promise<GenerationResult>
}

export interface IntelligenceAdapter {
  getInsights(context: string): Promise<{ insights: string[] }>
}

// Combined adapter registry
export interface Adapters {
  docLadder: DocLadderAdapter
  visual: VisualAdapter
  cast: CastAdapter
  produce: ProduceAdapter
  package: PackageAdapter
  deliver: DeliverAdapter
  intelligence: IntelligenceAdapter
}