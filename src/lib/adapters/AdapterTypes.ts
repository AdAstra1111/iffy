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
  type: 'character' | 'location' | 'costume' | 'style' | 'lookbook' | 'poster' | 'all'
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
  getLadder(format: string, projectId?: string): LadderDocument[]
  getCurrentDoc(projectId?: string): LadderDocument | null
  generateDoc(intent: GenerationIntent, projectId?: string): Promise<GenerationResult>
  approveDoc(docId: string, projectId?: string): Promise<void>
}

export interface VisualAdapter {
  getEntities(type: string, projectId: string): Promise<VisualEntity[]>
  getEntityImages(type: string, id: string, projectId: string): Promise<VisualImage[]>
  getAllHeroFrames?(projectId: string): Promise<VisualImage[]>
  generateImage(entityType: string, entityId: string, intent: GenerationIntent, projectId: string): Promise<GenerationResult>
  approveImage(imageId: string): Promise<void>
  setPrimaryImage(entityType: string, entityId: string, imageId: string, projectId: string): Promise<void>
  getStyleProfile(projectId: string): Promise<StyleProfile>
}

export interface CastAdapter {
  getCastingStatus(projectId: string): Promise<CastingStatus[]>
  getCandidates(characterId: string, projectId: string): Promise<ActorCandidate[]>
  shortlistActor(characterId: string, actorId: string, projectId: string): Promise<void>
  approveCasting(characterId: string, actorId: string, projectId: string): Promise<void>
  removeShortlist(characterId: string, actorId: string, projectId: string): Promise<void>
}

export interface ProduceAdapter {
  getAssetStatus(): Promise<Record<string, 'not_started' | 'in_progress' | 'complete'>>
  generateAsset(type: string, params?: Record<string, unknown>): Promise<GenerationResult>
}

export interface PackageAdapter {
  getPackageItems(projectId: string): Promise<{ type: string; status: string }[]>
  generateItem(type: string, intent: GenerationIntent, projectId: string): Promise<GenerationResult>
}

export interface DeliverAdapter {
  getExportTypes(projectId: string): Promise<ExportTypeInfo[]>
  exportProject(format: string, projectId: string): Promise<GenerationResult>
}

export interface ExportTypeInfo {
  format: string
  label: string
  icon: string
  description: string
  available: boolean
  estimatedSize: string | null
}

// ── Intelligence Overlay Types ──────────────────────────────────────────────

export type InsightCategory = 'trends' | 'market' | 'financing' | 'reports'

export interface InsightCardData {
  id: string
  title: string
  text: string
  relevance: number          // 0–100, mapped to subtle indicator
  sourceIcon: string         // emoji or lucide icon name
  sourceLabel: string
  category: InsightCategory
  supportingData?: Record<string, unknown>
}

export interface IntelligenceAdapter {
  getInsights(context: string, data?: {
    trends?: unknown[]
    marketData?: unknown[]
    dashboardData?: unknown
    reports?: unknown[]
    project?: { format?: string; genres?: string[]; budget_range?: string }
  }): InsightCardData[]
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