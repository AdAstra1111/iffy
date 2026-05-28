/**
 * CastWorkspace — Full workspace for character casting.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────┐
 * │ ┌─ Character List ──┐ ┌─ Main Content ────────────┐ │
 * │ │                   │ │                           │ │
 * │ │ Nora     ● BOUND  │ │ Candidate Grid            │ │
 * │ │ Arthur   ○        │ │ for selected character    │ │
 * │ │ Hae Sung ○        │ │ ┌────┐ ┌────┐ ┌────┐    │ │
 * │ │                   │ │ │A1  │ │A2  │ │A3  │    │ │
 * │ └───────────────────┘ │ └────┘ └────┘ └────┘    │ │
 * │                       │                           │ │
 * │                       └───────────────────────────┘ │
 * │  Legacy: "Open in Classic View"                    │
 * └───────────────────────────────────────────────────┘
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, BarChart3, CheckCircle2, Users, UserCheck, Clock } from 'lucide-react'
import { toast } from 'sonner'

import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { supabase } from '@/integrations/supabase/client'
import { castAdapter } from '@/lib/adapters/castAdapter'

import CharacterCastingList from '@/components/cast/CharacterCastingList'
import CandidateGrid from '@/components/cast/CandidateGrid'
import ActorDetail from '@/components/cast/ActorDetail'
import BindingControls from '@/components/cast/BindingControls'

import type { CastingStatus, ActorCandidate } from '@/lib/adapters/AdapterTypes'
import type { ActorProfile } from '@/components/cast/ActorDetail'

// ── Query keys ───────────────────────────────────────────────────────────────

const QK = {
  castingStatus: (pid: string) => ['cast-workspace-status', pid] as const,
  candidates: (cid: string, pid: string) => ['cast-workspace-candidates', cid, pid] as const,
  actorProfile: (aid: string) => ['cast-workspace-actor-profile', aid] as const,
}

// ── Main Workspace ───────────────────────────────────────────────────────────

const CastWorkspace: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const flagEnabled = useFeatureFlag('NEW_WORKSPACE_CAST')
  const qc = useQueryClient()

  // ── Local state ────────────────────────────────────────────────────────
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null)
  const [isActioning, setIsActioning] = useState(false)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  // ── Feature flag guard ─────────────────────────────────────────────────
  if (!flagEnabled) {
    return <LegacyFallback />
  }

  // ── Fetch casting statuses ─────────────────────────────────────────────
  const {
    data: statuses = [],
    isLoading: statusesLoading,
    error: statusesError,
  } = useQuery({
    queryKey: QK.castingStatus(projectId || ''),
    queryFn: () => castAdapter.getCastingStatus(projectId!),
    enabled: !!projectId,
  })

  // ── Fetch candidates for selected character ────────────────────────────
  const selectedStatus = useMemo(
    () => statuses.find((s) => s.characterId === selectedCharacterId) || null,
    [statuses, selectedCharacterId],
  )

  const {
    data: candidates = [],
    isLoading: candidatesLoading,
  } = useQuery({
    queryKey: QK.candidates(selectedCharacterId || '', projectId || ''),
    queryFn: () => castAdapter.getCandidates(selectedCharacterId!, projectId!),
    enabled: !!selectedCharacterId && !!projectId,
  })

  // ── Resolve actor profiles from candidates + supabase ──────────────────
  const actorProfileMap = useMemo(() => {
    const map = new Map<string, ActorProfile>()
    for (const c of candidates) {
      map.set(c.id, {
        id: c.id,
        name: c.name,
        description: '',
        tags: c.specialties,
        headshotUrl: c.headshotUrl,
        portfolioImages: undefined,
        matchBreakdown: {
          genreFit: c.matchScore,
          roleTypeFit: Math.round(c.matchScore * 0.85),
          descriptionStrength: Math.round(c.matchScore * 0.7),
        },
      })
    }
    return map
  }, [candidates])

  // ── Fetch full actor profiles when actor selected ──────────────────────
  const {
    data: actorProfile,
    isLoading: actorLoading,
    error: actorError,
  } = useQuery({
    queryKey: QK.actorProfile(selectedActorId || ''),
    queryFn: async () => {
      if (!selectedActorId) return null
      const { data } = await (supabase as any)
        .from('ai_actors')
        .select(`
          id,
          name,
          description,
          tags,
          roster_ready,
          approved_version_id,
          ai_actor_versions!ai_actor_versions_actor_id_fkey(
            id,
            version_number,
            ai_actor_assets(
              asset_type,
              public_url,
              storage_path,
              meta_json
            )
          )
        `)
        .eq('id', selectedActorId)
        .maybeSingle()

      if (!data) return null

      // Build profile from actor data
      const actorData = data as any
      const versions = actorData.ai_actor_versions || []
      const assets = versions.flatMap((v: any) => v.ai_actor_assets || [])

      let headshotUrl: string | undefined
      const portfolioImages: string[] = []

      for (const asset of assets) {
        const url = asset.public_url || asset.storage_path
        if (!url) continue
        const assetType = (asset.asset_type || '').toLowerCase()
        const metaShotType = ((asset.meta_json as any)?.shot_type || '').toLowerCase()

        if (
          assetType === 'reference_headshot' ||
          metaShotType === 'identity_headshot' ||
          metaShotType === 'headshot'
        ) {
          if (!headshotUrl) headshotUrl = url
          else portfolioImages.push(url)
        } else {
          portfolioImages.push(url)
        }
      }

      const baseProfile = actorProfileMap.get(selectedActorId)
      const matchBreakdown = baseProfile?.matchBreakdown || {
        genreFit: 0,
        roleTypeFit: 0,
        descriptionStrength: 0,
      }

      return {
        id: actorData.id,
        name: actorData.name,
        description: actorData.description || '',
        tags: actorData.tags || [],
        headshotUrl,
        portfolioImages: portfolioImages.length > 0 ? portfolioImages.slice(0, 12) : undefined,
        matchBreakdown,
        rosterReady: actorData.roster_ready || false,
      } as ActorProfile
    },
    enabled: !!selectedActorId,
  })

  // ── Actor detail getter for ActorDetail component ──────────────────────
  const getActor = useCallback(
    (actorId: string): ActorProfile | null => {
      return actorProfile || actorProfileMap.get(actorId) || null
    },
    [actorProfile, actorProfileMap],
  )

  // ── Resolve shortlisted actor IDs ──────────────────────────────────────
  const shortlistedActorIds = useMemo(() => {
    // Check candidates that are shortlisted (check from existing data via query)
    return new Set<string>()
  }, [])

  // ── Computed values for binding controls ──────────────────────────────
  const selectedBindingState = useMemo((): 'uncast' | 'shortlisted' | 'approved' => {
    if (!selectedStatus) return 'uncast'
    if (selectedStatus.status === 'approved') return 'approved'
    if (selectedStatus.status === 'shortlisted') return 'shortlisted'
    return 'uncast'
  }, [selectedStatus])

  const selectedActorName = useMemo(() => {
    if (!selectedActorId) return null
    const actor = actorProfileMap.get(selectedActorId)
    if (actor) return actor.name
    if (actorProfile) return actorProfile.name
    return null
  }, [selectedActorId, actorProfileMap, actorProfile])

  // ── Check actor library count ──────────────────────────────────────────
  const { data: actorCount = 0 } = useQuery({
    queryKey: ['ai-actors-count'],
    queryFn: async () => {
      const { supabase: sb } = await import('@/integrations/supabase/client')
      const { data: session } = await (sb as any).auth.getSession()
      const userId = session?.session?.user?.id
      if (!userId) return 0
      const { count } = await (sb as any)
        .from('ai_actors')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      return count || 0
    },
    staleTime: 60_000,
  })

  // ── Actions ────────────────────────────────────────────────────────────

  const handleShortlist = useCallback(async () => {
    if (!selectedCharacterId || !selectedActorId || !projectId) return
    setIsActioning(true)
    setActionInProgress('shortlist')
    try {
      await castAdapter.shortlistActor(selectedCharacterId, selectedActorId, projectId)
      toast.success('Actor shortlisted')
      qc.invalidateQueries({ queryKey: QK.castingStatus(projectId) })
      qc.invalidateQueries({ queryKey: QK.candidates(selectedCharacterId, projectId) })
    } catch (err: any) {
      toast.error(err.message || 'Failed to shortlist actor')
    } finally {
      setIsActioning(false)
      setActionInProgress(null)
    }
  }, [selectedCharacterId, selectedActorId, projectId, qc])

  const handleApprove = useCallback(async () => {
    if (!selectedCharacterId || !selectedActorId || !projectId) return
    setIsActioning(true)
    setActionInProgress('approve')
    try {
      await castAdapter.approveCasting(selectedCharacterId, selectedActorId, projectId)
      toast.success('Casting approved!')
      qc.invalidateQueries({ queryKey: QK.castingStatus(projectId) })
      qc.invalidateQueries({ queryKey: QK.candidates(selectedCharacterId, projectId) })
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve casting')
    } finally {
      setIsActioning(false)
      setActionInProgress(null)
    }
  }, [selectedCharacterId, selectedActorId, projectId, qc])

  const handleRemoveShortlist = useCallback(async () => {
    if (!selectedCharacterId || !selectedActorId || !projectId) return
    setIsActioning(true)
    setActionInProgress('remove')
    try {
      await castAdapter.removeShortlist(selectedCharacterId, selectedActorId, projectId)
      toast.success('Removed from shortlist')
      setSelectedActorId(null)
      qc.invalidateQueries({ queryKey: QK.castingStatus(projectId) })
      qc.invalidateQueries({ queryKey: QK.candidates(selectedCharacterId, projectId) })
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove from shortlist')
    } finally {
      setIsActioning(false)
      setActionInProgress(null)
    }
  }, [selectedCharacterId, selectedActorId, projectId, qc])

  const handleCandidateShortlist = useCallback(
    (actorId: string) => {
      setSelectedActorId(actorId)
      // Auto-trigger shortlist
      if (selectedCharacterId && projectId) {
        setIsActioning(true)
        setActionInProgress('shortlist')
        castAdapter
          .shortlistActor(selectedCharacterId, actorId, projectId)
          .then(() => {
            toast.success('Actor shortlisted')
            qc.invalidateQueries({ queryKey: QK.castingStatus(projectId) })
            qc.invalidateQueries({ queryKey: QK.candidates(selectedCharacterId, projectId) })
          })
          .catch((err) => toast.error(err.message || 'Failed to shortlist actor'))
          .finally(() => {
            setIsActioning(false)
            setActionInProgress(null)
          })
      }
    },
    [selectedCharacterId, projectId, qc],
  )

  const handleCandidateApprove = useCallback(
    (actorId: string) => {
      setSelectedActorId(actorId)
      if (selectedCharacterId && projectId) {
        setIsActioning(true)
        setActionInProgress('approve')
        castAdapter
          .approveCasting(selectedCharacterId, actorId, projectId)
          .then(() => {
            toast.success('Casting approved!')
            qc.invalidateQueries({ queryKey: QK.castingStatus(projectId) })
            qc.invalidateQueries({ queryKey: QK.candidates(selectedCharacterId, projectId) })
          })
          .catch((err) => toast.error(err.message || 'Failed to approve casting'))
          .finally(() => {
            setIsActioning(false)
            setActionInProgress(null)
          })
      }
    },
    [selectedCharacterId, projectId, qc],
  )

  // ── Reset selected actor when character changes ────────────────────────
  useEffect(() => {
    setSelectedActorId(null)
  }, [selectedCharacterId])

  // ── Completion stats for overview ──────────────────────────────────────
  const stats = useMemo(() => {
    const total = statuses.length
    const approved = statuses.filter((s) => s.status === 'approved').length
    const shortlisted = statuses.filter((s) => s.status === 'shortlisted').length
    const candidatesReady = statuses.filter((s) => s.status === 'candidates').length
    const uncast = statuses.filter((s) => s.status === 'uncast').length
    return { total, approved, shortlisted, candidatesReady, uncast }
  }, [statuses])

  // ── Handle selection from character list ───────────────────────────────
  const handleSelectCharacter = useCallback(
    (characterId: string) => {
      setSelectedCharacterId((prev) => (prev === characterId ? null : characterId))
    },
    [],
  )

  // ── Render ─────────────────────────────────────────────────────────────
  const mainContent = selectedCharacterId ? (
    // Character selected → candidates + detail
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Candidate grid */}
      <div className="flex-1 min-w-0">
        <CandidateGrid
          candidates={candidates}
          onShortlist={handleCandidateShortlist}
          onApprove={handleCandidateApprove}
          isLoading={candidatesLoading}
          shortlistedActorIds={shortlistedActorIds}
          approvedActorId={selectedStatus?.boundActorId || null}
          hasActorsInLibrary={actorCount > 0}
        />
      </div>

      {/* Right side: Actor detail + binding controls */}
      <div className="w-full lg:w-72 flex-shrink-0 space-y-4">
        <ActorDetail
          actorId={selectedActorId}
          getActor={getActor}
          isLoading={actorLoading}
          error={actorError ? 'Failed to load' : null}
        />
        {selectedActorId && (
          <BindingControls
            characterName={selectedStatus?.characterName || ''}
            actorName={selectedActorName}
            bindingState={selectedBindingState}
            onShortlist={handleShortlist}
            onApprove={handleApprove}
            onRemove={handleRemoveShortlist}
            isActioning={isActioning}
          />
        )}
      </div>
    </div>
  ) : (
    // No character selected → overview stats
    <CastOverview
      stats={stats}
      isLoading={statusesLoading}
      error={statusesError ? 'Failed to load casting status' : null}
    />
  )

  return (
    <div className="flex flex-col min-h-[60vh]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cast</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cast AI actors for every character. Browse the actor library, review matches, and lock your cast.
          </p>
        </div>
        <Link
          to={`/projects/${projectId}/casting`}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in Classic View
        </Link>
      </div>

      {/* Main layout */}
      <div className="flex flex-col md:flex-row gap-6 flex-1">
        {/* Left rail — character list */}
        <div className="w-full md:w-64 flex-shrink-0">
          <CharacterCastingList
            statuses={statuses}
            onSelect={handleSelectCharacter}
            selectedId={selectedCharacterId}
            isLoading={statusesLoading}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {mainContent}
        </div>
      </div>
    </div>
  )
}

// ── Overview Stats ────────────────────────────────────────────────────────────

interface OverviewStats {
  total: number
  approved: number
  shortlisted: number
  candidatesReady: number
  uncast: number
}

const CastOverview: React.FC<{
  stats: OverviewStats
  isLoading: boolean
  error: string | null
}> = ({ stats, isLoading, error }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="animate-pulse text-muted-foreground">Loading cast overview...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  const completionPct = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Completion bar */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Casting Completion</h3>
          <span className="text-2xl font-bold tabular-nums">{completionPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden flex">
          {stats.approved > 0 && (
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${(stats.approved / stats.total) * 100}%` }}
              title={`${stats.approved} approved`}
            />
          )}
          {stats.shortlisted > 0 && (
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${(stats.shortlisted / stats.total) * 100}%` }}
              title={`${stats.shortlisted} shortlisted`}
            />
          )}
          {stats.candidatesReady > 0 && (
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${(stats.candidatesReady / stats.total) * 100}%` }}
              title={`${stats.candidatesReady} candidates`}
            />
          )}
          {stats.uncast > 0 && (
            <div
              className="h-full bg-muted-foreground/20 transition-all"
              style={{ width: `${(stats.uncast / stats.total) * 100}%` }}
              title={`${stats.uncast} uncast`}
            />
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Approved"
          value={stats.approved}
          total={stats.total}
          color="text-green-400"
          bgColor="bg-green-500/10"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Shortlisted"
          value={stats.shortlisted}
          total={stats.total}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Candidates"
          value={stats.candidatesReady}
          total={stats.total}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          icon={<UserCheck className="w-5 h-5" />}
          label="Uncast"
          value={stats.uncast}
          total={stats.total}
          color="text-muted-foreground"
          bgColor="bg-muted"
        />
      </div>

      {/* Prompt */}
      <p className="text-sm text-muted-foreground text-center pt-4">
        Select a character from the left to view candidates and manage casting.
      </p>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  icon: React.ReactNode
  label: string
  value: number
  total: number
  color: string
  bgColor: string
}> = ({ icon, label, value, total, color, bgColor }) => (
  <div className="p-4 rounded-xl border border-border bg-card">
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
        <div className="text-xs text-muted-foreground">
          {label}{total > 0 && <span className="ml-1">· {Math.round((value / total) * 100)}%</span>}
        </div>
      </div>
    </div>
  </div>
)

// ── Legacy Fallback ───────────────────────────────────────────────────────────

const LegacyFallback: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <h1 className="text-3xl font-bold mb-4">Cast workspace — classic view</h1>
      <p className="text-muted-foreground max-w-lg text-lg mb-6">
        The new Cast workspace is disabled. Redirecting to the classic Casting Pipeline.
      </p>
      <Link
        to={`/projects/${id}/casting`}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Open Classic Casting
      </Link>
    </div>
  )
}

export default CastWorkspace