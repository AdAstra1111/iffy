/**
 * LookBookPage — Section-driven visual pitch deck engine.
 * Route: /projects/:id/lookbook
 * Canonical lookbook_sections are the authoritative runtime model.
 * Workspace is always accessible and is the default authoring mode.
 * 
 * PIPELINE: All builds (manual + auto-complete) go through runLookbookPipeline.
 * This page does NOT contain orchestration logic — it calls the pipeline.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Loader2, BookOpen, RefreshCw, AlertTriangle, Wrench, AlertCircle, Sparkles, Zap,
} from 'lucide-react';
import { useLookbookStaleness } from '@/hooks/useLookbookStaleness';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FramingStrategyPanel } from '@/components/framing/FramingStrategyPanel';
import { LookBookViewer } from '@/components/lookbook/LookBookViewer';
import { LookbookSectionPanel } from '@/components/lookbook/LookbookSectionPanel';
import { useProjectBranding } from '@/hooks/useProjectBranding';
import { useProject } from '@/hooks/useProjects';
import { useLookbookSections, type CanonicalSectionKey } from '@/hooks/useLookbookSections';
import { useSectionReset } from '@/hooks/useSectionReset';
import { useLookbookStaleCleanup } from '@/hooks/useLookbookStaleCleanup';
import { useLookbookAutoRebuild } from '@/hooks/useLookbookAutoRebuild';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { LookBookData } from '@/lib/lookbook/types';
import type { QAResult } from '@/lib/lookbook/pipeline/types';
import type { LayoutFamilyKey } from '@/lib/lookbook/lookbookLayoutFamilies';
import { VisualCanonResetPanel } from '@/components/images/VisualCanonResetPanel';
import { LookbookRebuildHistoryStrip } from '@/components/images/LookbookRebuildHistoryStrip';
import { LookbookTriggerDiagnosticsStrip } from '@/components/images/LookbookTriggerDiagnosticsStrip';
import { runLookbookPipeline } from '@/lib/lookbook/pipeline/runLookbookPipeline';
import type { PipelineMode, PipelineProgress } from '@/lib/lookbook/pipeline/types';
import { sectionKeyToEdgeFunctionSection, sectionKeyToAssetGroup } from '@/lib/lookbook/pipeline/lookbookSlotRegistry';
import { LookbookPipelineProgress } from '@/components/lookbook/LookbookPipelineProgress';
import { LookbookQASummary } from '@/components/lookbook/LookbookQASummary';
import { StyleLockPanel } from '@/components/lookbook/StyleLockPanel';

type LookbookMode = 'workspace' | 'viewer';

export default function LookBookPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { project, isLoading: projectLoading } = useProject(projectId);
  const { data: branding } = useProjectBranding(projectId);
  const [lookBookData, setLookBookData] = useState<LookBookData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [autoCompleting, setAutoCompleting] = useState(false);
  const [populatingSection, setPopulatingSection] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<LookbookMode>('workspace');
  const [lookbookBuildEpoch, setLookbookBuildEpoch] = useState(0);
  const [rebuildHistoryEpoch, setRebuildHistoryEpoch] = useState(0);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [qaResult, setQaResult] = useState<QAResult | null>(null);
  const consumedAutoBuildKeyRef = useRef<string | null>(null);

  // ── Staleness detection ──
  const staleness = useLookbookStaleness(projectId, lookbookBuildEpoch);

  // ── Auto-rebuild orchestration ──
  const autoRebuild = useLookbookAutoRebuild(projectId, {
    onRebuildComplete: (result) => {
      setRebuildHistoryEpoch(e => e + 1);
      if (result.executionStatus === 'completed' || result.executionStatus === 'completed_with_unresolved') {
        // Invalidate caches so next lookbook build uses fresh data
        invalidateImageCaches();
        setLookBookData(null);
        setQaResult(null);
      }
    },
  });

  const {
    sections,
    isLoading: sectionsLoading,
    isBootstrapped,
    structureStatus,
    bootstrap,
    isBootstrapping,
    bootstrapFailed,
    updateSectionStatus,
  } = useLookbookSections(projectId);

  const {
    resetSection,
    regenerateClean,
    resettingSection,
    regeneratingSection,
  } = useSectionReset(projectId || '');

  // ── Stale cleanup (existing canonical path) ──
  const { cleaning, cleanupAllSections } = useLookbookStaleCleanup(projectId);

  useEffect(() => {
    if (!sectionsLoading && !isBootstrapped && projectId && !isBootstrapping && !bootstrapFailed) {
      bootstrap();
    }
  }, [sectionsLoading, isBootstrapped, projectId, isBootstrapping, bootstrapFailed, bootstrap]);

  useEffect(() => {
    console.info('[LookBookPage] render_state', {
      component: 'LookBookPage',
      route: location.pathname,
      projectIdPresent: !!projectId,
      sectionsCount: sections.length,
      structureStatus,
      viewMode,
      viewerDataPresent: !!lookBookData,
      buildEpoch: lookbookBuildEpoch,
    });
  }, [location.pathname, projectId, sections.length, structureStatus, viewMode, lookBookData, lookbookBuildEpoch]);

  /**
   * Invalidate all react-query caches that could hold stale image data.
   * This ensures the next build resolves fresh images from DB.
   */
  const invalidateImageCaches = useCallback(() => {
    if (!projectId) return;
    // Invalidate workspace section content caches (20-min staleTime)
    queryClient.invalidateQueries({ queryKey: ['lookbook-section-content', projectId] });
    // Invalidate any project-images caches
    queryClient.invalidateQueries({ queryKey: ['project-images', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project-images-paginated', projectId] });
    console.log('[LookBookPage] ✓ invalidated all image caches for fresh build');
  }, [projectId, queryClient]);

  // Use a ref for the previous slides so handleGenerate doesn't depend on lookBookData
  const prevSlidesRef = useRef<LookBookData['slides'] | null>(null);
  const prevResolvedIdsRef = useRef<string[] | null>(null);

  // Keep ref in sync
  useEffect(() => {
    prevSlidesRef.current = lookBookData?.slides ?? null;
  }, [lookBookData]);

  /**
   * Build LookBook via canonical pipeline.
   * Mode: 'fresh_build' (default) or 'reuse_recovery' (auto-complete).
   */
  const handleGenerate = useCallback(async (mode: PipelineMode = 'fresh_build') => {
    if (!projectId) return;
    setGenerating(true);
    setPipelineProgress(null);
    try {
      invalidateImageCaches();

      const result = await runLookbookPipeline({
        projectId,
        mode,
        companyName: branding?.companyName || null,
        companyLogoUrl: branding?.companyLogoUrl || null,
        previousSlides: prevSlidesRef.current,
        onProgress: (p) => setPipelineProgress(p),
      });

      // Log provenance for debugging
      const pf = result.shotListPreflight;
      console.log('[LookBookPage] ✓ Pipeline complete', {
        buildId: result.data.buildId,
        slideCount: result.data.slides.length,
        totalImageRefs: result.data.totalImageRefs,
        durationMs: result.durationMs,
        qaPublishable: result.qa.publishable,
        qaGrade: result.qa.qualityGrade,
        stages: result.stages.map(s => `${s.stage}:${s.status}`).join(' '),
        shotListPreflight: pf ? `${pf.status} (auto=${pf.auto_generated})` : 'none',
      });

      // Shot list preflight feedback
      if (pf) {
        if (pf.status === 'generated') {
          toast.info('Shot list auto-generated from script', { duration: 4000 });
        } else if (pf.status === 'failed') {
          toast.warning('Shot list generation failed — using fallback mode', { duration: 5000 });
        }
      }

      setLookBookData(result.data);
      setQaResult(result.qa);
      console.log('[LookBookPage] qaResult bound to state', { grade: result.qa.qualityGrade, diagCount: result.qa.diagnostics?.length ?? 0 });
      setLookbookBuildEpoch(Date.now());

      // Change detection
      const newIds = result.data.resolvedImageIds || [];
      const prevIds = prevResolvedIdsRef.current || [];
      const changed = newIds.length !== prevIds.length || newIds.some((id, i) => id !== prevIds[i]);
      prevResolvedIdsRef.current = newIds;

      if (changed || !prevIds.length) {
        toast.success(`Look Book built (${result.data.totalImageRefs || 0} images resolved)`);
      } else {
        toast.info(
          'Look Book rebuilt — same images as before. Approve new images or generate fresh ones to change the deck.',
          { duration: 6000 },
        );
      }

      // Quality feedback
      const grade = result.qa.qualityGrade;
      if (grade === 'incomplete') {
        const errorDiags = result.qa.diagnostics?.filter(d => d.severity === 'error') || [];
        toast.error(`Deck quality: incomplete — ${errorDiags.length} critical issue(s) found`, { duration: 6000 });
      } else if (grade === 'exportable') {
        toast.warning(`Deck quality: exportable but not production-grade — review diagnostics`, { duration: 5000 });
      } else if (!result.qa.publishable && result.qa.unresolvedSlides.length > 0) {
        toast.warning(`${result.qa.unresolvedSlides.length} slides have unresolved images`, { duration: 5000 });
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate Look Book');
    } finally {
      setGenerating(false);
      setPipelineProgress(null);
    }
  }, [projectId, branding, invalidateImageCaches]);

  useEffect(() => {
    const routeState = location.state as { mode?: LookbookMode; autoBuild?: boolean; buildKey?: string } | null;
    if (!routeState) return;

    if (routeState.mode === 'viewer' && viewMode !== 'viewer') {
      setViewMode('viewer');
    }

    if (routeState.autoBuild && routeState.buildKey && consumedAutoBuildKeyRef.current !== routeState.buildKey && !generating) {
      consumedAutoBuildKeyRef.current = routeState.buildKey;
      handleGenerate().finally(() => {
        navigate(location.pathname, { replace: true });
      });
    }
  }, [location.state, location.pathname, viewMode, generating, handleGenerate, navigate]);

  // Auto-rebuild when switching to viewer — always fetch fresh data
  // This ensures approved/synced images are reflected immediately
  useEffect(() => {
    if (viewMode === 'viewer' && !generating && projectId) {
      handleGenerate();
    }
    // Only trigger on viewMode change, not on handleGenerate identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, projectId]);

  // Persist layout-family override into canonical lookbook data via slide_id
  const handleSlideLayoutOverride = useCallback((slideId: string, familyKey: LayoutFamilyKey | null) => {
    setLookBookData(prev => {
      if (!prev) return prev;
      const updatedSlides = prev.slides.map(slide => {
        if (slide.slide_id !== slideId) return slide;
        if (familyKey === null) {
          // Reset to auto — clear user decisions
          return {
            ...slide,
            user_decisions: { ...slide.user_decisions, layout_family: null },
            layoutFamilyOverride: null,
            layoutFamilyOverrideSource: null,
            layoutFamilyEffective: slide.layoutFamily || 'landscape_standard',
          };
        }
        return {
          ...slide,
          user_decisions: { ...slide.user_decisions, layout_family: familyKey },
          layoutFamilyOverride: familyKey,
          layoutFamilyOverrideSource: 'user' as const,
          layoutFamilyEffective: familyKey,
        };
      });
      return { ...prev, slides: updatedSlides };
    });
  }, []);

  const handleExportPDF = useCallback(async () => {
    if (!lookBookData || !projectId) return;

    // ── Fail-closed: filter out fully unresolved slides before export ──
    const exportableSlides = lookBookData.slides.filter(s => s._resolutionStatus !== 'unresolved');
    const excludedCount = lookBookData.slides.length - exportableSlides.length;
    if (excludedCount > 0) {
      toast.warning(`${excludedCount} unresolved slide(s) excluded from export`);
    }
    if (exportableSlides.length === 0) {
      toast.error('No resolved slides to export');
      return;
    }

    const exportData = { ...lookBookData, slides: exportableSlides };

    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-lookbook-pdf', {
        body: { projectId, lookBookData: exportData },
      });
      if (error) throw error;

      const jobId = data?.job_id;
      if (!jobId) throw new Error('No job ID returned');

      toast.info('PDF export started — generating in background…');

      // Poll for completion
      const pollJob = async (): Promise<string> => {
        const { data: job, error: pollErr } = await supabase
          .from('export_jobs')
          .select('status, progress, signed_url, error')
          .eq('id', jobId)
          .single();

        if (pollErr) throw new Error(pollErr.message);
        if (job.status === 'completed' && job.signed_url) return job.signed_url;
        if (job.status === 'failed') throw new Error(job.error || 'Export failed');

        await new Promise(r => setTimeout(r, 2000));
        return pollJob();
      };

      const signedUrl = await pollJob();
      window.open(signedUrl, '_blank');
      toast.success('PDF exported');
    } catch (e: any) {
      toast.error(e.message || 'PDF export failed');
    } finally {
      setExporting(false);
    }
  }, [lookBookData, projectId]);

  const handlePopulate = useCallback(async (sectionKey: CanonicalSectionKey) => {
    if (!projectId) return;
    setPopulatingSection(sectionKey);
    try {
      const { data, error } = await supabase.functions.invoke('generate-lookbook-image', {
        body: {
          project_id: projectId,
          section: sectionKeyToEdgeFunctionSection(sectionKey),
          count: 4,
          asset_group: sectionKeyToAssetGroup(sectionKey),
          pack_mode: true,
        },
      });
      if (error) throw error;
      const results = data?.results || [];
      const successCount = results.filter((r: any) => r.status === 'ready').length;
      if (successCount > 0) {
        toast.success(`Generated ${successCount} images for ${sectionKey.replace(/_/g, ' ')}`);
        await updateSectionStatus(sectionKey, { section_status: 'partially_populated' });
        invalidateImageCaches();
        setLookBookData(null);
        setQaResult(null);
      } else {
        toast.info('No images generated — check upstream prerequisites');
      }
    } catch (e: any) {
      toast.error(e.message || `Failed to populate ${sectionKey}`);
    } finally {
      setPopulatingSection(null);
    }
  }, [projectId, updateSectionStatus, invalidateImageCaches]);

  const handleResetSection = useCallback(async (sectionKey: CanonicalSectionKey) => {
    const result = await resetSection(sectionKey);
    if (result && result.archivedCount > 0) {
      setLookBookData(null);
      setQaResult(null);
    }
  }, [resetSection]);

  const handleRegenerateClean = useCallback(async (sectionKey: CanonicalSectionKey) => {
    await regenerateClean(sectionKey);
    setLookBookData(null);
    setQaResult(null);
  }, [regenerateClean]);

  /**
   * Auto Complete LookBook — runs pipeline in reuse_recovery mode.
   */
  const handleAutoComplete = useCallback(async () => {
    if (!projectId || !lookBookData) {
      toast.error('Build the LookBook first, then auto-complete');
      return;
    }
    setAutoCompleting(true);
    try {
      await handleGenerate('reuse_recovery');
      toast.success('Auto-complete finished — review the deck in Viewer');
    } catch (e: any) {
      toast.error(e.message || 'Auto-complete failed');
    } finally {
      setAutoCompleting(false);
    }
  }, [projectId, lookBookData, handleGenerate]);

  /**
   * Fresh from scratch — generates everything from zero.
   */
  const handleFreshFromScratch = useCallback(async () => {
    if (!projectId) return;
    setAutoCompleting(true);
    try {
      await handleGenerate('fresh_from_scratch');
      toast.success('Fresh generation complete — review the deck in Viewer');
      setViewMode('viewer');
    } catch (e: any) {
      toast.error(e.message || 'Fresh generation failed');
    } finally {
      setAutoCompleting(false);
    }
  }, [projectId, handleGenerate]);

  if (projectLoading || sectionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const populatedCount = sections.filter(s => s.section_status !== 'empty_but_bootstrapped').length;
  const viewerAvailable = !!lookBookData;
  const isViewerMode = viewMode === 'viewer';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Toolbar — always shrink-0 ── */}
      <div className="px-4 py-2 border-b border-border bg-card/50 shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">
            {isViewerMode ? 'Look Book Presentation' : 'Look Book Workspace'}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {structureStatus === 'fully_populated' ? 'Complete' :
             structureStatus === 'partially_populated' ? `${populatedCount}/${sections.length} sections` :
             structureStatus === 'empty_but_bootstrapped' ? 'Ready' : 'Needs Setup'}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {structureStatus === 'invalid_structure' && (
            <Button size="sm" variant="destructive" className="gap-1 text-xs h-7" onClick={bootstrap} disabled={isBootstrapping}>
              {isBootstrapping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
              Rebuild Structure
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => handleGenerate()} disabled={generating || autoCompleting}>
            {generating && !autoCompleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
            Build
          </Button>
          <Button size="sm" variant="default" className="gap-1 text-xs h-7" onClick={handleFreshFromScratch} disabled={autoCompleting || generating}>
            {autoCompleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Auto Generate
          </Button>
        </div>
      </div>

      {/* ── Pipeline progress ── */}
      {(generating || autoCompleting) && pipelineProgress && (
        <div className="px-4 py-2 border-b border-border bg-card/30 shrink-0">
          <LookbookPipelineProgress progress={pipelineProgress} />
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {structureStatus === 'invalid_structure' && (
          <div className="mx-4 mt-3 mb-0 rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2 shrink-0">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Lookbook structure missing or incomplete</p>
              <p className="text-xs text-destructive/70 mt-0.5">
                Click "Rebuild Structure" to create the canonical section scaffolding.
              </p>
            </div>
          </div>
        )}

        {/* ── Staleness banner ── */}
        {staleness.isStale && (
          <div className="mx-4 mt-3 mb-0 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">LookBook is out of date</p>
                <p className="text-xs text-muted-foreground">
                  {staleness.staleReasons.length > 0
                    ? staleness.staleReasons.slice(0, 3).join(' • ')
                    : 'Canonical truth has changed since your last build. Rebuild to refresh.'}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 shrink-0 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" onClick={() => handleGenerate()} disabled={generating}>
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Rebuild Now
            </Button>
          </div>
        )}

        {projectId && (
          <Collapsible className="mx-4 mt-3 mb-0 shrink-0">
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1">
              <Wrench className="h-3 w-3" />
              <span>Advanced Tools</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <LookbookTriggerDiagnosticsStrip
                diagnostics={autoRebuild.diagnostics}
                evaluating={autoRebuild.evaluating}
                rebuilding={autoRebuild.rebuilding}
                onLaunchRebuild={() => {
                  autoRebuild.launchRebuild({ triggerSource: 'auto_run' }).then(result => {
                    if (result) {
                      const { executionStatus, rebuildResult } = result;
                      const modeLabel = rebuildResult.mode === 'PRESERVE_PRIMARIES_FULL_CANON_REBUILD' ? 'Preserve' : 'Reset';
                      if (executionStatus === 'completed') {
                        const fallbackNote = rebuildResult.fallbackMatchCount > 0
                          ? ` (${rebuildResult.fallbackMatchCount} fallback matches — improvable)`
                          : '';
                        toast.success(`${modeLabel} auto-rebuild: ${rebuildResult.attachedWinnerCount} winners from ${rebuildResult.totalSlots} slots${fallbackNote}`);
                      } else if (executionStatus === 'completed_with_unresolved') {
                        const fallbackNote = rebuildResult.fallbackMatchCount > 0
                          ? `, ${rebuildResult.fallbackMatchCount} fallback matches (improvable)`
                          : '';
                        toast.warning(`${modeLabel} auto-rebuild: ${rebuildResult.unresolvedSlots} unresolved of ${rebuildResult.totalSlots} slots${fallbackNote}`);
                      } else if (executionStatus === 'no_op') {
                        toast.info('No weak slots — no rebuild performed');
                      } else if (executionStatus === 'failed') {
                        toast.error(`Auto-rebuild failed: ${result.failureMessage || 'Unknown error'}`);
                      }
                    }
                  });
                }}
              />
              <VisualCanonResetPanel
                projectId={projectId}
                onLookbookRebuild={async () => {
                  await handleGenerate();
                  setRebuildHistoryEpoch(e => e + 1);
                  autoRebuild.reevaluate();
                }}
              />
              <LookbookRebuildHistoryStrip
                projectId={projectId}
                refreshEpoch={rebuildHistoryEpoch}
              />
              {lookBookData && (
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleAutoComplete} disabled={autoCompleting || generating}>
                  {autoCompleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Auto Complete Deck
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={cleaning}
                onClick={() => cleanupAllSections()}
                className="text-xs"
              >
                {cleaning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wrench className="h-3 w-3 mr-1" />}
                Cleanup Stale
              </Button>
            </CollapsibleContent>
          </Collapsible>
        )}

        <Tabs
          value={viewMode}
          onValueChange={(value) => setViewMode(value as LookbookMode)}
          className="flex-1 min-h-0 flex flex-col px-4 pt-3"
        >
          <TabsList className="mb-3 shrink-0">
            <TabsTrigger value="workspace">Sections</TabsTrigger>
            <TabsTrigger value="viewer" className="relative">
              Viewer
              {staleness.isStale && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Workspace: scrollable content ── */}
          <TabsContent value="workspace" className="mt-0 flex-1 min-h-0 overflow-y-auto pb-4 data-[state=active]:flex data-[state=active]:flex-col">
            {sections.length > 0 ? (
              <div className="space-y-1.5">
                {projectId && <StyleLockPanel projectId={projectId} />}
                {sections.map(section => (
                  <LookbookSectionPanel
                    key={section.id}
                    projectId={projectId!}
                    section={section}
                    onPopulate={handlePopulate}
                    isPopulating={populatingSection === section.section_key}
                    onResetSection={handleResetSection}
                    isResettingSection={resettingSection === section.section_key}
                    onRegenerateClean={handleRegenerateClean}
                    isRegeneratingSection={regeneratingSection === section.section_key}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
                <p className="text-sm text-foreground mb-1">No lookbook sections found.</p>
                <p className="text-xs text-muted-foreground mb-4">Bootstrap the canonical structure to enter the section workspace.</p>
                <Button size="sm" variant="outline" onClick={bootstrap} disabled={isBootstrapping}>
                  {isBootstrapping ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Bootstrap Structure
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── Viewer: flex-fill, no scroll ── */}
          <TabsContent value="viewer" className="mt-0 flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
            {viewerAvailable ? (
              <div className="flex flex-col flex-1 min-h-0 rounded-lg border border-border bg-card/40 overflow-hidden">
                {qaResult ? (
                  <div className="px-4 py-2 border-b border-border bg-card/30 shrink-0">
                    <LookbookQASummary qa={qaResult} />
                  </div>
                ) : (
                  <div className="px-3 py-2 border-b border-border bg-muted/10 shrink-0">
                    <p className="text-[10px] text-muted-foreground">No QA summary available — build the lookbook to see quality diagnostics.</p>
                  </div>
                )}
                {projectId && (
                  <div className="px-4 py-3 border-b border-border bg-card/50 shrink-0">
                    <FramingStrategyPanel projectId={projectId} contentType="lookbook" compact />
                  </div>
                )}
                <LookBookViewer
                  data={lookBookData!}
                  onExportPDF={handleExportPDF}
                  isExporting={exporting}
                  className="flex-1 min-h-0"
                  onSlideLayoutOverride={handleSlideLayoutOverride}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
                <p className="text-sm text-foreground mb-1">No built lookbook yet.</p>
                <p className="text-xs text-muted-foreground mb-4">Build the lookbook from the canonical workspace sections first.</p>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => handleGenerate()} disabled={generating}>
                  {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Build Look Book
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
