import type {
  VisualAdapter,
  VisualEntity,
  VisualImage,
  GenerationResult,
  GenerationIntent,
  StyleProfile,
} from './AdapterTypes'

export const visualAdapter: VisualAdapter = {
  async getEntities(_type: string): Promise<VisualEntity[]> {
    return []
  },

  async getEntityImages(_type: string, _id: string): Promise<VisualImage[]> {
    return []
  },

  async generateImage(
    _entityType: string,
    _entityId: string,
    _intent: GenerationIntent,
  ): Promise<GenerationResult> {
    return { id: '', status: 'pending' }
  },

  async approveImage(_imageId: string): Promise<void> {
    // stub — no-op
  },

  async setPrimaryImage(_entityType: string, _entityId: string, _imageId: string): Promise<void> {
    // stub — no-op
  },

  async getStyleProfile(): Promise<StyleProfile> {
    return {
      colorPalette: [],
      lighting: '',
      cameraLanguage: '',
      texture: '',
    }
  },
}