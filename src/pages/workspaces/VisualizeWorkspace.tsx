import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'sonner'

import { visualAdapter } from '@/lib/adapters/visualAdapter'
import type {
  VisualEntity,
  VisualImage,
  GenerationIntent,
} from '@/lib/adapters/AdapterTypes'
import { supabase } from '@/integrations/supabase/client'

import EntityNavigation, {
  type EntityTab,
} from '@/components/visualize/EntityNavigation'
import VisualGrid from '@/components/visualize/VisualGrid'
import ImageViewer from '@/components/visualize/ImageViewer'
import GenerationControls from '@/components/visualize/GenerationControls'
import EntityDetailPanel from '@/components/visualize/EntityDetailPanel'
import { useExpertMode } from '@/hooks/useExpertMode'
import { useVisualCanonStatus } from '@/hooks/useVisualCanonStatus'

// ── Expert mode panel (lazy-loaded, never fetched when expert mode disabled) ──
const ExpertVisualizePanel = React.lazy(() => import('@/components/visualize/ExpertVisualizePanel'))

// ── Entity List Card (for the overview before entity selection) ──────────────

interface EntityListCardProps {
  entity: VisualEntity
  onClick: () => void
}

function EntityListCard({ entity, onClick }: EntityListCardProps) {
  const initials = entity.name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card
        hover:border-primary/30 hover:shadow-sm hover:bg-accent/30
        transition-all duration-150 cursor-pointer min-w-[120px]
        ${entity.status === 'approved' ? 'ring-1 ring-green-500/20' : ''}
      `}
    >
      {/* Avatar / placeholder */}
      <div
        className={`
          w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold
          ${
            entity.status === 'approved'
              ? 'bg-green-500/10 text-green-600'
              : entity.status === 'has_images'
                ? 'bg-amber-500/10 text-amber-600'
                : 'bg-muted text-muted-foreground/50'
          }
        `}
      >
        {initials}
      </div>

      {/* Name */}
      <span className="text-sm font-medium text-center truncate max-w-[100px]">
        {entity.name}
      </span>

      {/* Status indicator */}
      {entity.status === 'approved' && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 font-medium">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Approved
        </span>
      )}
      {entity.status === 'empty' && (
        <span className="text-[10px] text-muted-foreground/50">No images</span>
      )}
      {entity.status === 'has_images' && (
        <span className="text-[10px] text-amber-600">Has images</span>
      )}
    </button>
  )
}

// ── Main Workspace Component ─────────────────────────────────────────────────

const VisualizeWorkspace: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const expertMode = useExpertMode()

  // ── State ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [entities, setEntities] = useState<VisualEntity[]>([])
  const [entitiesLoading, setEntitiesLoading] = useState(true)
  const [entitiesError, setEntitiesError] = useState<string | null>(null)

  const [images, setImages] = useState<VisualImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imagesError, setImagesError] = useState<string | null>(null)

  const [selectedEntity, setSelectedEntity] = useState<VisualEntity | null>(null)
  const [selectedImage, setSelectedImage] = useState<VisualImage | null>(null)
  const [entityMetadata, setEntityMetadata] = useState<Record<string, unknown>>({})

  const [isGenerating, setIsGenerating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // ── Canon Status ──────────────────────────────────────────────────────
  const { data: canonStatus } = useVisualCanonStatus({ projectId })

  // Get entity count for a given type
  const entityCount = (type: string) =>
    entities.filter((e) => e.type === type).length

  // Tabs — always show All Hero Frames, Characters, and Locations
  const tabs: EntityTab[] = [
    { type: 'all', label: 'All Hero Frames', count: 0 },
    { type: 'character', label: 'Characters', count: entityCount('character') },
    { type: 'location', label: 'Locations', count: entityCount('location') },
  ]

  // ── Data Loading ─────────────────────────────────────────────────────

  // Load all entities (characters + locations)
  const loadEntities = useCallback(async () => {
    if (!projectId) return
    setEntitiesLoading(true)
    setEntitiesError(null)

    try {
      const [characters, locations] = await Promise.all([
        visualAdapter.getEntities('character', projectId),
        visualAdapter.getEntities('location', projectId),
      ])

      const all: VisualEntity[] = [
        ...characters.map((c) => ({ ...c, type: 'character' as const })),
        ...locations.map((l) => ({ ...l, type: 'location' as const })),
      ]

      setEntities(all)
    } catch (e: any) {
      console.error('[VisualizeWorkspace] loadEntities error:', e)
      setEntitiesError(e.message || 'Failed to load entities')
    } finally {
      setEntitiesLoading(false)
    }
  }, [projectId])

  // Load images for the selected entity
  const loadImages = useCallback(
    async (entity: VisualEntity) => {
      if (!projectId) return
      setImagesLoading(true)
      setImagesError(null)

      try {
        const entityImages = await visualAdapter.getEntityImages(
          entity.type,
          entity.id,
          projectId,
        )
        setImages(entityImages)
      } catch (e: any) {
        console.error('[VisualizeWorkspace] loadImages error:', e)
        setImagesError(e.message || 'Failed to load images')
      } finally {
        setImagesLoading(false)
      }
    },
    [projectId],
  )

  // Load entity metadata (from canon if character, from canon_locations if location)
  const loadEntityMetadata = useCallback(
    async (entity: VisualEntity) => {
      if (!projectId) return
      const meta: Record<string, unknown> = {}

      try {
        if (entity.type === 'character') {
          // Load from project_canon for character description
          const { data: canonRow } = await (supabase as any)
            .from('project_canon')
            .select('canon_json')
            .eq('project_id', projectId)
            .maybeSingle()

          if (canonRow?.canon_json?.characters) {
            const charMeta = (canonRow.canon_json as any).characters.find(
              (c: any) =>
                c.name?.toLowerCase() === entity.name.toLowerCase(),
            )
            if (charMeta) {
              meta.description = charMeta.description || charMeta.traits || ''
              meta.role = charMeta.role || ''
              meta.goals = charMeta.goals || ''
            }
          }
        } else if (entity.type === 'location') {
          // Load from canon_locations for location metadata
          const { data: locRow } = await (supabase as any)
            .from('canon_locations')
            .select('description, location_type, geography, atmosphere')
            .eq('id', entity.id)
            .maybeSingle()

          if (locRow) {
            meta.description = locRow.description || ''
            meta.locationType = locRow.location_type || ''
            meta.geography = locRow.geography || ''
            meta.atmosphere = (locRow as any).atmosphere || ''
          }
        }
      } catch (e) {
        // Non-critical — metadata is additive
        console.warn('[VisualizeWorkspace] metadata load warning:', e)
      }

      setEntityMetadata(meta)
    },
    [projectId],
  )

  // Initial load
  useEffect(() => {
    loadEntities()
  }, [loadEntities])

  // When entity is selected, load images and metadata
  useEffect(() => {
    if (!selectedEntity) {
      setImages([])
      setEntityMetadata({})
      return
    }
    loadImages(selectedEntity)
    loadEntityMetadata(selectedEntity)
  }, [selectedEntity, loadImages, loadEntityMetadata])

  // ── Actions ──────────────────────────────────────────────────────────

  const handleTabChange = (type: string) => {
    // If we're switching entity type, clear the entity selection
    if (activeTab !== type) {
      setActiveTab(type)
      setSelectedEntity(null)
      setImages([])
      setSelectedImage(null)
    }

    // Auto-select the "All Hero Frames" virtual entity when that tab is clicked
    if (type === 'all') {
      const allEntity: VisualEntity = {
        id: '__all__',
        name: 'All Hero Frames',
        type: 'all',
        status: 'has_images',
      }
      setSelectedEntity(allEntity)
    }
  }

  const handleEntitySelect = (entity: VisualEntity) => {
    setSelectedEntity(entity)
    setSelectedImage(null)

    // If we're not on the right tab, switch
    if (activeTab !== entity.type) {
      setActiveTab(entity.type)
    }
  }

  const handleGenerate = async (intent: GenerationIntent) => {
    if (!selectedEntity || !projectId) return

    setIsGenerating(true)
    try {
      const result = await visualAdapter.generateImage(
        selectedEntity.type,
        selectedEntity.id,
        intent,
        projectId,
      )

      if (result.status === 'failed') {
        toast.error(`Couldn't generate — tap to retry`, {
          action: {
            label: 'Retry',
            onClick: () => handleGenerate(intent),
          },
        })
      } else {
        toast.success('Generation started')
        // Wait a bit then refresh
        setTimeout(async () => {
          await loadImages(selectedEntity)
        }, 3000)
      }
    } catch (e: any) {
      toast.error(`Couldn't generate — tap to retry`, {
        action: {
          label: 'Retry',
          onClick: () => handleGenerate(intent),
        },
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleApprove = async (imageId: string) => {
    try {
      await visualAdapter.approveImage(imageId)
      toast.success('Image approved')
      // Refresh images
      if (selectedEntity) await loadImages(selectedEntity)
    } catch (e: any) {
      toast.error('Failed to approve image')
    }
  }

  const handleSetPrimary = async (imageId: string) => {
    if (!selectedEntity) return
    try {
      await visualAdapter.setPrimaryImage(
        selectedEntity.type,
        selectedEntity.id,
        imageId,
        projectId,
      )
      toast.success('Primary image set')
      if (selectedEntity) await loadImages(selectedEntity)
    } catch (e: any) {
      toast.error('Failed to set primary image')
    }
  }

  const handleDelete = async (imageId: string) => {
    try {
      // Get storage info first
      const { data: img } = await (supabase as any)
        .from('project_images')
        .select('storage_path, storage_bucket')
        .eq('id', imageId)
        .maybeSingle()

      // Delete storage file
      if (img?.storage_path && img?.storage_bucket) {
        await supabase.storage
          .from(img.storage_bucket)
          .remove([img.storage_path])
      }

      // Delete record
      await (supabase as any)
        .from('project_images')
        .delete()
        .eq('id', imageId)

      toast.success('Image deleted')
      if (selectedEntity) {
        await loadImages(selectedEntity)
        await loadEntities() // Refresh entity counts
      }
    } catch (e: any) {
      toast.error('Failed to delete image')
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await loadEntities()
      if (selectedEntity) {
        await loadImages(selectedEntity)
      }
    } finally {
      setRefreshing(false)
    }
  }

  // ── Determine if we're in list mode (no entity selected) ─────────────

  const showEntityList = !activeTab || !selectedEntity
  const characterEntities = entities.filter((e) => e.type === 'character')
  const locationEntities = entities.filter((e) => e.type === 'location')

  return (
    <div className="flex flex-col h-full">
      {/* ── Certification Badge ──────────────────────────────────── */}
      {canonStatus?.certified && (
        <div className="px-4 py-1.5 bg-green-950/30 border-b border-green-800/20">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-green-400">YETI V1 CANON-DRIVEN</span>
            <span className="text-muted-foreground/50">|</span>
            {canonStatus.canon_status?.identity?.active && (
              <span className="text-green-500">ID ✅</span>
            )}
            {canonStatus.canon_status?.wardrobe?.active && (
              <span className="text-green-500">WC ✅</span>
            )}
            {canonStatus.canon_status?.pd?.active && (
              <span className="text-green-500">PD ✅</span>
            )}
            <span className="text-muted-foreground/40 text-[10px] ml-auto">
              {canonStatus.certification}
            </span>
          </div>
        </div>
      )}
      {/* ── Top: Entity Navigation ─────────────────────────────── */}
      <EntityNavigation
        tabs={tabs}
        activeTab={activeTab || ''}
        onTabChange={handleTabChange}
        isLoading={entitiesLoading}
      />

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Main content area */}
        <div className="flex-1 overflow-y-auto">
          {entitiesLoading ? (
            <div className="space-y-4">
              {/* Skeleton entity list */}
              <div className="flex flex-wrap gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[120px] h-[140px] rounded-xl bg-muted animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : entitiesError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-destructive"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <p className="text-sm text-destructive">{entitiesError}</p>
              <button
                onClick={loadEntities}
                className="text-sm text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          ) : showEntityList ? (
            /* Entity List View — overview of all entities */
            <div className="space-y-8">
              {/* Characters section */}
              <section>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  Characters ({characterEntities.length})
                </h3>
                {characterEntities.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50 pl-6">
                    No characters found. Add characters to your story first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {characterEntities.map((entity) => (
                      <EntityListCard
                        key={entity.id}
                        entity={entity}
                        onClick={() => handleEntitySelect(entity)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Locations section */}
              <section>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Locations ({locationEntities.length})
                </h3>
                {locationEntities.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50 pl-6">
                    No locations found. Add locations to your story first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {locationEntities.map((entity) => (
                      <EntityListCard
                        key={entity.id}
                        entity={entity}
                        onClick={() => handleEntitySelect(entity)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            /* Visual Grid — show images for selected entity */
            <div className="space-y-4">
              {/* Entity header */}
              <div className="flex items-center justify-between">
                <div>
                  <button
                    onClick={() => setSelectedEntity(null)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    Back to{' '}
                    {selectedEntity?.type === 'character'
                      ? 'Characters'
                      : 'Locations'}
                  </button>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    {selectedEntity?.name}
                    {selectedEntity?.status === 'approved' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-medium">
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Approved
                      </span>
                    )}
                  </h2>
                </div>

                {/* Generation controls and refresh */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Refresh"
                  >
                    <svg
                      className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                  <GenerationControls
                    onGenerate={handleGenerate}
                    isGenerating={isGenerating}
                    disabled={!selectedEntity}
                  />
                </div>
              </div>

              {/* Image grid */}
              <VisualGrid
                images={images}
                entityName={selectedEntity?.name}
                onSelect={(img) => setSelectedImage(img)}
                onApprove={handleApprove}
                onSetPrimary={handleSetPrimary}
                onDelete={handleDelete}
                isGenerating={isGenerating}
                isLoading={imagesLoading}
                onGenerate={
                  selectedEntity
                    ? () => handleGenerate({ type: 'new_angle' })
                    : undefined
                }
              />

              {/* Error state for images */}
              {imagesError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-destructive text-sm">
                  <svg
                    className="w-4 h-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <span>{imagesError}</span>
                  <button
                    onClick={() =>
                      selectedEntity && loadImages(selectedEntity)
                    }
                    className="ml-auto text-xs font-medium hover:underline"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        {selectedEntity && !showEntityList && (
          <div className="w-72 shrink-0 space-y-4">
            <EntityDetailPanel
              entity={selectedEntity}
              isLoading={false}
              metadata={entityMetadata}
            />
          </div>
        )}
      </div>

      {/* ── Image Viewer (full-screen overlay) ───────────────────── */}
      {selectedImage && (
        <ImageViewer
          image={selectedImage}
          images={images}
          projectId={projectId}
          onClose={() => setSelectedImage(null)}
          onApprove={handleApprove}
          onSetPrimary={handleSetPrimary}
          onRegenerate={
            selectedEntity
              ? (img) =>
                  handleGenerate({
                    type: 'regenerate',
                    description: `Regenerate based on ${img.id}`,
                  })
              : undefined
          }
          onDelete={handleDelete}
          onNavigate={(img) => setSelectedImage(img)}
        />
      )}

      {/* ── Legacy fallback ──────────────────────────────────────── */}
      <div className="mt-4 pt-3 border-t border-border/30 text-center">
        <Link
          to={`/projects/${projectId}/visual-production`}
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Open in Classic View
        </Link>
      </div>

      {/* Expert mode metadata panel */}
      {expertMode && (
        <Suspense fallback={null}>
          <ExpertVisualizePanel projectId={projectId!} />
        </Suspense>
      )}
    </div>
  )
}

export default VisualizeWorkspace