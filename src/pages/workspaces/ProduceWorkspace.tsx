/**
 * ProduceWorkspace — Full workspace for production asset management.
 *
 * Tabs: Storyboards | Shot List | Trailers | Audio
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  [Storyboards] [Shot List] [Trailers] [Audio]              │
 * ├───────────────────────────────┬─────────────────────────────┤
 * │                               │  Canon Context Rail         │
 * │  Asset Tab Content            │                             │
 * │  (embeds existing views       │  ─────────────────────────  │
 * │   via hooks/data)             │  Asset Readiness            │
 * │                               │  ✓ Storyboards              │
 * │                               │  ○ Shot List                │
 * │                               │  ○ Trailers                 │
 * │                               │  ○ Audio                    │
 * └───────────────────────────────┴─────────────────────────────┘
 * │ [Open in Classic View]                                      │
 * └─────────────────────────────────────────────────────────────┘
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ExternalLink, Film, Camera, Clapperboard, Music, CheckCircle2, Circle, Loader2, AlertCircle, Users, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

import { useProject } from '@/hooks/useProjects'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { useProjectCanon } from '@/hooks/useProjectCanon'
import { useShotList } from '@/hooks/useShotList'
import { useStoryboards } from '@/hooks/useStoryboards'
import { useBlueprints } from '@/lib/trailerPipeline/useTrailerPipeline'
import { useAudioAssets } from '@/lib/trailerPipeline/audioHooks'
import { produceAdapter } from '@/lib/adapters/produceAdapter'
import { supabase } from '@/integrations/supabase/client'
import { useExpertMode } from '@/hooks/useExpertMode'

import { VisualSkeleton } from '@/components/visual/VisualSkeleton'
import { VisualEmptyState } from '@/components/visual/VisualEmptyState'

// ── Expert mode panel (lazy-loaded, never fetched when expert mode disabled) ──
const ExpertProducePanel = React.lazy(() => import('@/components/produce/ExpertProducePanel'))

// ── Asset type labels ──────────────────────────────────────────────────────

const ASSET_TYPES = ['storyboards', 'shot_list', 'trailers', 'audio'] as const
type AssetType = (typeof ASSET_TYPES)[number]

const ASSET_META: Record<AssetType, { label: string; icon: React.ElementType }> = {
  storyboards: { label: 'Storyboards', icon: Film },
  shot_list: { label: 'Shot List', icon: Camera },
  trailers: { label: 'Trailers', icon: Clapperboard },
  audio: { label: 'Audio', icon: Music },
}

// ── Main Workspace ─────────────────────────────────────────────────────────

const ProduceWorkspace: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const flagEnabled = useFeatureFlag('NEW_WORKSPACE_PRODUCE')
  const expertMode = useExpertMode()

  // ── Project context ────────────────────────────────────────────────────
  const { project, isLoading: projectLoading } = useProject(projectId)
  const [activeTab, setActiveTab] = useState<AssetType>('storyboards')

  // ── Asset readiness ────────────────────────────────────────────────────
  const [assetStatus, setAssetStatus] = useState<Record<string, string> | null>(null)
  const [assetStatusLoading, setAssetStatusLoading] = useState(true)

  // ── Canon ──────────────────────────────────────────────────────────────
  useProjectCanon(projectId)

  // ── Data for each tab ──────────────────────────────────────────────────
  // Shot List
  const { shotLists, items: shotItems, listsLoading, itemsLoading } = useShotList(projectId)

  // Get first shot list ID for storyboard queries
  const firstShotListId = shotLists.length > 0 ? shotLists[0].id : undefined

  // Storyboards — uses first shot list ID if available
  const { boards, isLoading: boardsLoading } = useStoryboards(projectId, firstShotListId)

  // Trailers
  const { data: blueprints, isLoading: blueprintsLoading } = useBlueprints(projectId)

  // Audio
  const { data: audioAssetsData, isLoading: audioLoading } = useAudioAssets(projectId)

  // ── Canon data (sidebar) ───────────────────────────────────────────────
  const [characters, setCharacters] = useState<Array<{ name: string; role?: string }>>([])
  const [locations, setLocations] = useState<Array<{ name: string }>>([])
  const [canonLoading, setCanonLoading] = useState(false)

  useEffect(() => {
    if (!projectId) return

    let cancelled = false
    setCanonLoading(true)

    supabase
      .from('project_canon')
      .select('canon_json')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setCanonLoading(false)
        if (error || !data?.canon_json) {
          setCharacters([])
          setLocations([])
          return
        }
        const canon = data.canon_json as any
        setCharacters(
          (canon.characters || []).map((c: any) => ({
            name: c.name || 'Unnamed',
            role: c.role,
          })),
        )
        setLocations(
          (canon.locations || []).map((l: any) => ({
            name: typeof l === 'string' ? l : l.name || 'Unknown',
          })),
        )
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  // ── Load asset status ──────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    setAssetStatusLoading(true)
    produceAdapter.getAssetStatus(projectId).then((status) => {
      setAssetStatus(status)
      setAssetStatusLoading(false)
    })
  }, [projectId])

  // ── Sidebar collapsed state ────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // If flag is disabled
  if (!flagEnabled) {
    return null
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (projectLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Loading project...</p>
      </div>
    )
  }

  // ── No project ─────────────────────────────────────────────────────────
  if (!project && !projectLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <p className="text-sm text-muted-foreground">Project not found</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* ── Tab Bar ───────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-muted/10 px-6">
        <div className="flex items-center gap-1">
          {ASSET_TYPES.map((type) => {
            const meta = ASSET_META[type]
            const Icon = meta.icon
            const status = assetStatus?.[type]
            const isActive = activeTab === type
            return (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-4 w-4" />
                {meta.label}
                {status && status !== 'not_started' && (
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      status === 'complete' ? 'bg-emerald-500' : 'bg-amber-500',
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main content area ─────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tab content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'storyboards' && (
            <StoryboardsTab
              boards={boards}
              isLoading={boardsLoading}
              projectId={projectId!}
            />
          )}
          {activeTab === 'shot_list' && (
            <ShotListTab
              shotLists={shotLists}
              items={shotItems}
              listsLoading={listsLoading}
              itemsLoading={itemsLoading}
              projectId={projectId!}
            />
          )}
          {activeTab === 'trailers' && (
            <TrailersTab
              blueprints={blueprints || []}
              isLoading={blueprintsLoading}
              projectId={projectId!}
            />
          )}
          {activeTab === 'audio' && (
            <AudioTab
              audioAssets={audioAssetsData?.assets || []}
              isLoading={audioLoading}
              projectId={projectId!}
            />
          )}
        </div>

        {/* ── Right sidebar — canon context + asset readiness ─────────── */}
        <div
          className={cn(
            'border-l border-border/30 bg-muted/5 transition-all duration-200 overflow-y-auto',
            sidebarCollapsed ? 'w-10' : 'w-64',
          )}
        >
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {!sidebarCollapsed && (
            <div className="px-4 pb-4 space-y-6">
              {/* ── Asset Readiness ──────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Asset Readiness
                </h3>
                {assetStatusLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-6 bg-muted/30 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {ASSET_TYPES.map((type) => {
                      const meta = ASSET_META[type]
                      const Icon = meta.icon
                      const status = assetStatus?.[type] || 'not_started'
                      return (
                        <div
                          key={type}
                          className="flex items-center gap-2 text-xs py-1"
                        >
                          {status === 'complete' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : status === 'in_progress' ? (
                            <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin shrink-0" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                          )}
                          <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground truncate">
                            {meta.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── Divider ──────────────────────────────────────────── */}
              <div className="border-t border-border/20" />

              {/* ── Canon Context ─────────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  Characters
                </h3>
                {canonLoading ? (
                  <div className="space-y-1.5">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-5 bg-muted/20 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : characters.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/60 italic">
                    No canon characters
                  </p>
                ) : (
                  <div className="space-y-1">
                    {characters.slice(0, 8).map((char) => (
                      <div
                        key={char.name}
                        className="text-[11px] text-muted-foreground truncate"
                        title={char.role ? `${char.name} — ${char.role}` : char.name}
                      >
                        {char.name}
                      </div>
                    ))}
                    {characters.length > 8 && (
                      <div className="text-[10px] text-muted-foreground/50">
                        +{characters.length - 8} more
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Locations ──────────────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  Locations
                </h3>
                {canonLoading ? (
                  <div className="space-y-1.5">
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-5 bg-muted/20 rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : locations.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/60 italic">
                    No canon locations
                  </p>
                ) : (
                  <div className="space-y-1">
                    {locations.slice(0, 5).map((loc) => (
                      <div
                        key={loc.name}
                        className="text-[11px] text-muted-foreground truncate"
                      >
                        {loc.name}
                      </div>
                    ))}
                    {locations.length > 5 && (
                      <div className="text-[10px] text-muted-foreground/50">
                        +{locations.length - 5} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Legacy fallback link ──────────────────────────────────────── */}
      <div className="border-t border-border/20 px-6 py-2 bg-muted/5">
        <Link
          to={`/projects/${projectId}/development`}
          className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors inline-flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          Open in Classic View
        </Link>
      </div>

      {/* Expert mode metadata panel */}
      {expertMode && (
        <Suspense fallback={null}>
          <ExpertProducePanel projectId={projectId!} />
        </Suspense>
      )}
    </div>
  )
}

// ── Tab: Storyboards ───────────────────────────────────────────────────────

function StoryboardsTab({
  boards,
  isLoading,
  projectId,
}: {
  boards: any[]
  isLoading: boolean
  projectId: string
}) {
  if (isLoading) {
    return (
      <div className="p-6">
        <VisualSkeleton variant="card" count={4} />
      </div>
    )
  }

  if (boards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <VisualEmptyState
          icon={<Film className="h-8 w-8" />}
          title="No storyboard panels yet"
          description="Create a shot list first to generate storyboards."
          action={
            <Link
              to={`/projects/${projectId}/storyboards`}
              className="text-xs text-primary hover:underline mt-2 inline-block"
            >
              Open full Storyboards page
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          {boards.length} panel{boards.length !== 1 ? 's' : ''}
        </h2>
        <Link
          to={`/projects/${projectId}/storyboards`}
          className="text-xs text-primary hover:underline"
        >
          View full page →
        </Link>
      </div>

      {/* Mini strip view */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {boards.slice(0, 12).map((board: any) => (
          <div
            key={board.id}
            className="rounded-lg border border-border bg-card p-2 space-y-1.5"
          >
            <div className="aspect-video rounded bg-muted/30 flex items-center justify-center overflow-hidden">
              <Film className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                SC {board.scene_number} / {board.shot_number}
              </span>
              {board.locked && (
                <span className="text-[8px] text-muted-foreground">🔒</span>
              )}
            </div>
          </div>
        ))}
        {boards.length > 12 && (
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3 flex items-center justify-center">
            <Link
              to={`/projects/${projectId}/storyboards`}
              className="text-xs text-primary hover:underline"
            >
              +{boards.length - 12} more
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Shot List ─────────────────────────────────────────────────────────

function ShotListTab({
  shotLists,
  items,
  listsLoading,
  itemsLoading,
  projectId,
}: {
  shotLists: any[]
  items: any[]
  listsLoading: boolean
  itemsLoading: boolean
  projectId: string
}) {
  if (listsLoading) {
    return (
      <div className="p-6">
        <VisualSkeleton variant="table-row" count={5} />
      </div>
    )
  }

  if (shotLists.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <VisualEmptyState
          icon={<Camera className="h-8 w-8" />}
          title="No shot lists yet"
          description="Generate one from a script document in the Development Engine."
          action={
            <Link
              to={`/projects/${projectId}/shot-list`}
              className="text-xs text-primary hover:underline mt-2 inline-block"
            >
              Open full Shot List page
            </Link>
          }
        />
      </div>
    )
  }

  const activeList = shotLists[0]

  if (itemsLoading) {
    return (
      <div className="p-6">
        <VisualSkeleton variant="table-row" count={6} />
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium">{activeList.name}</h2>
          <p className="text-xs text-muted-foreground">
            {items.length} shots
          </p>
        </div>
        <Link
          to={`/projects/${projectId}/shot-list`}
          className="text-xs text-primary hover:underline"
        >
          View full page →
        </Link>
      </div>

      {/* Mini table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[60px_80px_1fr_80px] gap-1 px-3 py-1.5 text-[9px] text-muted-foreground font-medium uppercase tracking-wider bg-muted/20">
          <span>Scene</span>
          <span>Type</span>
          <span>Action</span>
          <span>Camera</span>
        </div>
        {items.slice(0, 15).map((item: any) => (
          <div
            key={item.id}
            className="grid grid-cols-[60px_80px_1fr_80px] gap-1 px-3 py-1.5 text-xs border-t border-border/30 hover:bg-muted/20 transition-colors"
          >
            <span className="text-muted-foreground">{item.scene_number}</span>
            <span className="font-mono text-[10px]">{item.shot_type}</span>
            <span className="truncate text-muted-foreground">
              {item.action}
            </span>
            <span className="text-muted-foreground text-[10px]">
              {item.camera_movement}
            </span>
          </div>
        ))}
        {items.length > 15 && (
          <div className="px-3 py-2 text-[10px] text-muted-foreground/60 border-t border-border/30 text-center">
            +{items.length - 15} more shots
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab: Trailers ──────────────────────────────────────────────────────────

function TrailersTab({
  blueprints,
  isLoading,
  projectId,
}: {
  blueprints: any[]
  isLoading: boolean
  projectId: string
}) {
  if (isLoading) {
    return (
      <div className="p-6">
        <VisualSkeleton variant="card" count={3} />
      </div>
    )
  }

  if (!blueprints || blueprints.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <VisualEmptyState
          icon={<Clapperboard className="h-8 w-8" />}
          title="No trailer plans yet"
          description="Create a trailer blueprint in the Trailer Intelligence pipeline."
          action={
            <Link
              to={`/projects/${projectId}/trailer?tab=blueprints`}
              className="text-xs text-primary hover:underline mt-2 inline-block"
            >
              Open Trailer Hub
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          {blueprints.length} blueprint{blueprints.length !== 1 ? 's' : ''}
        </h2>
        <Link
          to={`/projects/${projectId}/trailer?tab=blueprints`}
          className="text-xs text-primary hover:underline"
        >
          Open Trailer Hub →
        </Link>
      </div>

      <div className="space-y-2">
        {blueprints.map((bp: any) => (
          <div
            key={bp.id}
            className="rounded-lg border border-border bg-card p-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">{bp.name || bp.title || 'Unnamed blueprint'}</p>
              <p className="text-xs text-muted-foreground">
                Arc: {bp.arc_type || 'Unknown'} · Status: {bp.status || 'draft'}
              </p>
            </div>
            <Link
              to={`/projects/${projectId}/trailer?tab=blueprints`}
              className="text-xs text-primary hover:underline"
            >
              View
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Audio ─────────────────────────────────────────────────────────────

function AudioTab({
  audioAssets,
  isLoading,
  projectId,
}: {
  audioAssets: any[]
  isLoading: boolean
  projectId: string
}) {
  if (isLoading) {
    return (
      <div className="p-6">
        <VisualSkeleton variant="card" count={2} />
      </div>
    )
  }

  if (audioAssets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <VisualEmptyState
          icon={<Music className="h-8 w-8" />}
          title="No audio assets yet"
          description="Generate audio in the Trailer Timeline Studio or use Audio Export."
          action={
            <Link
              to={`/projects/${projectId}/audio-export`}
              className="text-xs text-primary hover:underline mt-2 inline-block"
            >
              Open Audio Export
            </Link>
          }
        />
      </div>
    )
  }

  // Group by kind
  const musicBeds = audioAssets.filter((a: any) => a.kind === 'music_bed')
  const sfxAssets = audioAssets.filter((a: any) => a.kind === 'sfx')
  const mixAssets = audioAssets.filter((a: any) => a.kind === 'mix_master' || a.kind === 'mix')

  return (
    <div className="p-6 overflow-y-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          {audioAssets.length} audio asset{audioAssets.length !== 1 ? 's' : ''}
        </h2>
        <Link
          to={`/projects/${projectId}/audio-export`}
          className="text-xs text-primary hover:underline"
        >
          Open Audio Export →
        </Link>
      </div>

      {/* Music beds */}
      {musicBeds.length > 0 && (
        <div>
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Music Beds ({musicBeds.length})
          </h3>
          <div className="space-y-1.5">
            {musicBeds.map((asset: any) => (
              <div
                key={asset.id}
                className="rounded border border-border/50 bg-card p-2 flex items-center justify-between"
              >
                <span className="text-xs truncate">{asset.name || asset.storage_path || 'Untitled'}</span>
                <span className="text-[10px] text-muted-foreground">🎵</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SFX */}
      {sfxAssets.length > 0 && (
        <div>
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Sound Effects ({sfxAssets.length})
          </h3>
          <div className="space-y-1.5">
            {sfxAssets.map((asset: any) => (
              <div
                key={asset.id}
                className="rounded border border-border/50 bg-card p-2 flex items-center justify-between"
              >
                <span className="text-xs truncate">{asset.name || asset.storage_path || 'Untitled'}</span>
                <span className="text-[10px] text-muted-foreground">🔊</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mix masters */}
      {mixAssets.length > 0 && (
        <div>
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Mix Masters ({mixAssets.length})
          </h3>
          <div className="space-y-1.5">
            {mixAssets.map((asset: any) => (
              <div
                key={asset.id}
                className="rounded border border-border/50 bg-card p-2 flex items-center justify-between"
              >
                <span className="text-xs truncate">{asset.name || 'Mix'}</span>
                <span className="text-[10px] text-muted-foreground">🎛️</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Link to full page */}
      <div className="pt-2">
        <Link
          to={`/projects/${projectId}/trailer?tab=assemble`}
          className="text-xs text-primary hover:underline"
        >
          Manage audio in Trailer Timeline Studio →
        </Link>
      </div>
    </div>
  )
}

// ── Chevron icons (re-imported to avoid conflict) ─────────────────────────

function ChevronLeft(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export default ProduceWorkspace