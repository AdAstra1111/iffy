/**
 * VisualProductionActivatedCard — Unlocked surface when visual_locked is true.
 *
 * Canonical, deterministic card gated by production_flags.visual_locked.
 * Includes inline Visual Package Refinement workspace that is now
 * VPB-content-aware via vpbRefinementResolver.
 * Includes Audited Commit Gate for section patch persistence.
 */
import { useState, useMemo, useCallback } from 'react';
import { CheckCircle2, Palette, MapPin, Shirt, Camera, BookOpen, Eye, ChevronDown, ChevronUp, Crosshair, Layers, Sparkles, Frame, ArrowRight, PenLine, Plus, X, Shield, Play, XCircle, AlertTriangle, Save, Loader2, FileCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getVPBRefinementState, getVPBRefinementSummary, getSectionNavTarget, buildRefinementIntent, buildRefinementSessionBrief, buildRefinementHandoffPayload, buildRewriteContract, validateRewriteCandidate, applySectionPatch, type RefinementStatus, type RefinementIntent, type PatchResult, type RewriteContract } from '@/lib/visual/vpbRefinementResolver';
import { useCommitSectionPatch } from '@/hooks/useCommitSectionPatch';

const CAPABILITY_DOMAINS = [
  { key: 'character_viz', label: 'Character Visualization', icon: Eye, status: 'ready' as const },
  { key: 'wardrobe', label: 'Wardrobe & Costume System', icon: Shirt, status: 'ready' as const },
  { key: 'location_viz', label: 'Location Visual System', icon: MapPin, status: 'ready' as const },
  { key: 'lookbook', label: 'Lookbook & Visual Package', icon: BookOpen, status: 'ready' as const },
  { key: 'cinematography', label: 'Cinematography & Shot Language', icon: Camera, status: 'next' as const },
] as const;

const REFINEMENT_ICONS: Record<string, typeof Palette> = {
  visual_tone: Palette,
  world_visual_language: Layers,
  reference_frames: Frame,
  motif_consistency: Crosshair,
};

const STATUS_CONFIG: Record<RefinementStatus, { label: string; className: string }> = {
  present: { label: 'Ready', className: 'border-emerald-500/20 text-emerald-400/70' },
  thin: { label: 'Thin', className: 'border-amber-500/30 text-amber-400/70' },
  missing: { label: 'Missing', className: 'border-destructive/30 text-destructive/70' },
};

const ACTION_CONFIG: Record<'create' | 'refine', { label: string; icon: typeof Plus }> = {
  create: { label: 'Create Section', icon: Plus },
  refine: { label: 'Refine Section', icon: PenLine },
};

interface VisualProductionActivatedCardProps {
  visible: boolean;
  vpbMarkdown?: string | null;
  onScrollToSection?: (heading: string) => void;
  /** Required for commit gate — document ID of the VPB */
  documentId?: string | null;
  /** Required for commit gate — current version ID */
  versionId?: string | null;
  /** Required for commit gate — project ID */
  projectId?: string | null;
  /** Called after successful commit with new version ID */
  onVersionCommitted?: (newVersionId: string) => void;
}

export function VisualProductionActivatedCard({
  visible, vpbMarkdown = null, onScrollToSection,
  documentId, versionId, projectId, onVersionCommitted,
}: VisualProductionActivatedCardProps) {
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [activeIntent, setActiveIntent] = useState<RefinementIntent | null>(null);
  const [dryRunInput, setDryRunInput] = useState('');
  const [dryRunResult, setDryRunResult] = useState<ReturnType<typeof validateRewriteCandidate> | null>(null);
  const [patchResult, setPatchResult] = useState<PatchResult | null>(null);

  const commitMutation = useCommitSectionPatch();

  const refinementAreas = useMemo(
    () => getVPBRefinementState(vpbMarkdown ?? null),
    [vpbMarkdown],
  );

  const refinementSummary = useMemo(
    () => getVPBRefinementSummary(refinementAreas),
    [refinementAreas],
  );

  const handleGoToSection = useCallback((heading: string, navigable: boolean) => {
    if (!navigable || !onScrollToSection) return;
    onScrollToSection(heading);
  }, [onScrollToSection]);

  const handleStartRefinement = useCallback((area: typeof refinementAreas[0]) => {
    const intent = buildRefinementIntent(area);
    if (!intent) return;
    setActiveIntent(intent);
  }, []);

  const handleDismissIntent = useCallback(() => {
    setActiveIntent(null);
    setDryRunInput('');
    setDryRunResult(null);
    setPatchResult(null);
    commitMutation.reset();
  }, [commitMutation]);

  if (!visible) return null;

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-emerald-400">
          <Palette className="h-3.5 w-3.5" />
          Visual Production Track
          <Badge className="ml-auto text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-1.5 py-0">
            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
            Locked
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Visual system locked. This project's visual identity is confirmed and ready for production workflows.
        </p>

        {/* Capability domains */}
        <div className="grid grid-cols-1 gap-1">
          {CAPABILITY_DOMAINS.map(({ key, label, icon: Icon, status }) => (
            <div key={key} className="flex items-center gap-1.5 text-[10px] py-0.5">
              <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-foreground/80">{label}</span>
              <Badge variant="outline" className={`ml-auto text-[8px] px-1 py-0 ${
                status === 'ready'
                  ? 'border-emerald-500/20 text-emerald-400/70'
                  : 'border-muted-foreground/20 text-muted-foreground/50'
              }`}>
                {status === 'ready' ? 'Ready' : 'Next'}
              </Badge>
            </div>
          ))}
        </div>

        {/* Visual Package Refinement — VPB-aware */}
        <Collapsible open={refinementOpen} onOpenChange={setRefinementOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-[10px] gap-1.5 mt-1 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              <Sparkles className="h-3 w-3" />
              {refinementOpen ? 'Close' : 'Open'} Visual Package Refinement
              {refinementOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-md border border-border/50 bg-background/50 p-2.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-emerald-400" />
                <span className="text-[10px] font-medium text-foreground">Visual Package Refinement</span>
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                {vpbMarkdown
                  ? 'Refinement status derived from the locked Visual Project Bible.'
                  : 'Select the Visual Project Bible document to inspect refinement coverage.'}
              </p>

              {/* Summary strip */}
              {vpbMarkdown && (
                <div className="rounded border border-border/40 bg-muted/30 p-2 space-y-1.5">
                  <div className="flex items-center gap-3 text-[9px]">
                    <span className="text-emerald-400/80">Ready: {refinementSummary.presentCount}</span>
                    <span className="text-amber-400/80">Thin: {refinementSummary.thinCount}</span>
                    <span className="text-destructive/80">Missing: {refinementSummary.missingCount}</span>
                  </div>
                  {refinementSummary.allPresent ? (
                    <p className="text-[8px] text-emerald-400/60 italic">No immediate refinement gaps detected.</p>
                  ) : (
                    <div className="space-y-0.5">
                      <span className="text-[8px] text-muted-foreground/70 font-medium">Refinement priority:</span>
                      {refinementSummary.priorityAreas.map((area, i) => {
                        const statusCfg = STATUS_CONFIG[area.status];
                        return (
                          <div key={area.key} className="flex items-center gap-1.5 text-[8px] pl-1">
                            <span className="text-muted-foreground/50">{i + 1}.</span>
                            <span className="text-foreground/70">{area.label}</span>
                            <Badge variant="outline" className={`text-[7px] px-1 py-0 ${statusCfg.className}`}>
                              {statusCfg.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Active refinement session brief */}
              {activeIntent && (() => {
                const brief = buildRefinementSessionBrief(activeIntent, refinementAreas);
                if (!brief) return null;
                const statusCfg = STATUS_CONFIG[brief.currentStatus];
                return (
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <PenLine className="h-3 w-3 text-amber-400 shrink-0" />
                      <span className="text-[10px] text-amber-300 font-medium flex-1 truncate">
                        {brief.action === 'create' ? 'Create' : 'Refine'}: {brief.sectionLabel}
                      </span>
                      <Badge variant="outline" className={`text-[7px] px-1 py-0 ${statusCfg.className}`}>
                        {statusCfg.label}
                      </Badge>
                      <button
                        onClick={handleDismissIntent}
                        className="text-muted-foreground/50 hover:text-foreground shrink-0"
                        title="Dismiss refinement session"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-[8px] text-muted-foreground/70 space-y-0.5 pl-5">
                      <p><span className="text-muted-foreground/50">Heading:</span> {brief.sectionHeading}</p>
                      <p><span className="text-muted-foreground/50">Key:</span> {brief.sectionKey}</p>
                      <p><span className="text-muted-foreground/50">Anchor:</span> #{brief.sectionAnchor}</p>
                      <p><span className="text-muted-foreground/50">Reason:</span> {brief.reason}</p>
                      {brief.contentLength > 0 && (
                        <p><span className="text-muted-foreground/50">Content:</span> {brief.contentLength} chars</p>
                      )}
                    </div>
                    {brief.excerpt && (
                      <p className="text-[8px] text-foreground/50 italic leading-tight border-l border-amber-500/20 ml-5 pl-1.5">
                        {brief.excerpt}
                      </p>
                    )}
                    {/* Handoff payload + Rewrite contract indicators */}
                    {(() => {
                      const handoff = buildRefinementHandoffPayload(brief, vpbMarkdown ?? null);
                      if (!handoff) return null;
                      const contract = buildRewriteContract(handoff);
                      return (
                        <div className="space-y-1 ml-5">
                          <div className="rounded border border-border/30 bg-muted/20 p-1.5 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400/70 shrink-0" />
                              <span className="text-[8px] text-foreground/60 font-medium">Scoped handoff prepared</span>
                              <Badge variant="outline" className="text-[7px] px-1 py-0 border-border/30 text-muted-foreground/60">
                                {handoff.scopeRule}
                              </Badge>
                            </div>
                            <div className="text-[7px] text-muted-foreground/50 space-y-0.5 pl-4">
                              {handoff.targetSectionBody !== null && (
                                <p>Section body: {handoff.targetSectionBody.length} chars</p>
                              )}
                              {handoff.prevHeading && (
                                <p>Prev: {handoff.prevHeading}</p>
                              )}
                              {handoff.nextHeading && (
                                <p>Next: {handoff.nextHeading}</p>
                              )}
                              {!handoff.targetSectionBody && !handoff.prevHeading && !handoff.nextHeading && (
                                <p>Target section not yet present in VPB</p>
                              )}
                            </div>
                          </div>
                          {contract && (
                            <div className="rounded border border-primary/20 bg-primary/5 p-1.5 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <Shield className="h-2.5 w-2.5 text-primary/70 shrink-0" />
                                <span className="text-[8px] text-foreground/60 font-medium">Rewrite contract prepared</span>
                                <Badge variant="outline" className="text-[7px] px-1 py-0 border-primary/20 text-primary/60">
                                  {contract.scopeRule}
                                </Badge>
                              </div>
                              <div className="text-[7px] text-muted-foreground/50 space-y-0.5 pl-4">
                                <p>Target: {contract.allowedTargetHeading}</p>
                                <p>Forbidden: {contract.forbiddenMutations.length} rules</p>
                                <p>Preserve: {contract.requiredPreservation.length} rules</p>
                                <p>Validate: {contract.validationRules.length} rules</p>
                                <p>Return: single section markdown headed by target heading</p>
                              </div>
                              <div className="flex items-center gap-1.5 pt-0.5 pl-4">
                                <CheckCircle2 className="h-2 w-2 text-emerald-400/60 shrink-0" />
                                <span className="text-[7px] text-emerald-400/50">Candidate validator ready</span>
                              </div>
                              {/* Dry-run rewrite harness */}
                              <div className="mt-1.5 pt-1.5 border-t border-primary/10 pl-4 space-y-1">
                                <span className="text-[8px] text-foreground/60 font-medium">Dry-Run Validator</span>
                                <textarea
                                  value={dryRunInput}
                                  onChange={e => { setDryRunInput(e.target.value); setDryRunResult(null); setPatchResult(null); }}
                                  placeholder={`Paste candidate section markdown here...\ne.g. # ${contract.allowedTargetHeading.replace(/^# /, '')}\nYour content...`}
                                  className="w-full text-[8px] font-mono bg-background/80 border border-border/40 rounded p-1.5 min-h-[48px] max-h-[96px] resize-y placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                                  rows={3}
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      const result = validateRewriteCandidate(contract, dryRunInput);
                                      setDryRunResult(result);
                                    }}
                                    disabled={!dryRunInput.trim()}
                                    className="text-[8px] flex items-center gap-1 px-1.5 py-0.5 rounded border border-primary/20 text-primary/70 hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <Play className="h-2.5 w-2.5" />
                                    Validate
                                  </button>
                                  <span className="text-[7px] text-muted-foreground/40 italic">Validation only — no content will be applied</span>
                                </div>
                                {dryRunResult && (
                                  <div className={`rounded border p-1.5 space-y-0.5 ${
                                    dryRunResult.passed
                                      ? 'border-emerald-500/30 bg-emerald-500/5'
                                      : 'border-destructive/30 bg-destructive/5'
                                  }`}>
                                    <div className="flex items-center gap-1.5">
                                      {dryRunResult.passed ? (
                                        <>
                                          <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                                          <span className="text-[8px] text-emerald-400 font-medium">Candidate passed validation</span>
                                        </>
                                      ) : (
                                        <>
                                          <XCircle className="h-2.5 w-2.5 text-destructive shrink-0" />
                                          <span className="text-[8px] text-destructive font-medium">Candidate failed validation</span>
                                        </>
                                      )}
                                    </div>
                                    {dryRunResult.errors.length > 0 && (
                                      <div className="text-[7px] text-destructive/80 space-y-0.5 pl-4">
                                        {dryRunResult.errors.map((err, i) => (
                                          <p key={i}>• {err}</p>
                                        ))}
                                      </div>
                                    )}
                                    {dryRunResult.warnings.length > 0 && (
                                      <div className="text-[7px] text-amber-400/80 space-y-0.5 pl-4">
                                        {dryRunResult.warnings.map((w, i) => (
                                          <p key={i}><AlertTriangle className="h-2 w-2 inline mr-0.5" />{w}</p>
                                        ))}
                                      </div>
                                    )}
                                    {dryRunResult.detectedTopLevelHeadings.length > 0 && (
                                      <p className="text-[7px] text-muted-foreground/50 pl-4">
                                        Detected H1s: {dryRunResult.detectedTopLevelHeadings.join(', ')}
                                      </p>
                                    )}
                                    <p className="text-[7px] text-muted-foreground/40 italic pl-4">
                                      Dry run only — document unchanged
                                    </p>
                                    {/* Apply Patch — only when validation passed */}
                                    {dryRunResult.passed && vpbMarkdown && (
                                      <div className="pt-1 pl-4 space-y-1">
                                        <button
                                          onClick={() => {
                                            const result = applySectionPatch(vpbMarkdown, contract, dryRunInput);
                                            setPatchResult(result);
                                          }}
                                          className="text-[8px] flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-400/80 hover:bg-emerald-500/10 transition-colors"
                                        >
                                          <CheckCircle2 className="h-2.5 w-2.5" />
                                          Apply Patch (simulation)
                                        </button>
                                        <span className="text-[7px] text-muted-foreground/40 italic">No persistence — returns patched markdown only</span>
                                      </div>
                                    )}
                                    {patchResult && (
                                      <div className={`mt-1 rounded border p-1.5 space-y-0.5 ${
                                        patchResult.passed
                                          ? 'border-emerald-500/30 bg-emerald-500/5'
                                          : 'border-destructive/30 bg-destructive/5'
                                      }`}>
                                        <div className="flex items-center gap-1.5">
                                          {patchResult.passed ? (
                                            <>
                                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                                              <span className="text-[8px] text-emerald-400 font-medium">Section patched successfully</span>
                                            </>
                                          ) : (
                                            <>
                                              <XCircle className="h-2.5 w-2.5 text-destructive shrink-0" />
                                              <span className="text-[8px] text-destructive font-medium">Patch rejected</span>
                                            </>
                                          )}
                                        </div>
                                        {patchResult.errors.length > 0 && (
                                          <div className="text-[7px] text-destructive/80 space-y-0.5 pl-4">
                                            {patchResult.errors.map((err, i) => (
                                              <p key={i}>• {err}</p>
                                            ))}
                                          </div>
                                        )}
                                        {patchResult.passed && patchResult.patchedMarkdown && (
                                          <>
                                            <p className="text-[7px] text-emerald-400/60 pl-4">
                                              Output: {patchResult.patchedMarkdown.length} chars
                                            </p>
                                            {/* ─── AUDITED COMMIT GATE ─── */}
                                            {(() => {
                                              const canCommit = !!(
                                                documentId && versionId && projectId &&
                                                activeIntent && contract &&
                                                dryRunResult?.passed &&
                                                patchResult.passed && patchResult.patchedMarkdown
                                              );
                                              const isCommitting = commitMutation.isPending;
                                              const committed = commitMutation.isSuccess;
                                              const commitError = commitMutation.isError ? commitMutation.error?.message : null;

                                              return (
                                                <div className="mt-1.5 rounded border border-primary/30 bg-primary/5 p-2 space-y-1 ml-4">
                                                  <div className="flex items-center gap-1.5">
                                                    <FileCheck className="h-3 w-3 text-primary/70 shrink-0" />
                                                    <span className="text-[9px] text-foreground/70 font-medium">Audited Commit Gate</span>
                                                  </div>

                                                  <div className="text-[7px] text-muted-foreground/60 space-y-0.5 pl-4">
                                                    <p>Section: <span className="text-foreground/60">{contract.sectionLabel}</span></p>
                                                    <p>Heading: <span className="text-foreground/60">{contract.sectionHeading}</span></p>
                                                    <p>Action: <span className="text-foreground/60">{contract.action}</span></p>
                                                    <p>Scope: <span className="text-foreground/60">{contract.scopeRule}</span></p>
                                                    <p>Candidate validation: <span className="text-emerald-400/70">✓ Passed</span></p>
                                                    <p>Patch simulation: <span className="text-emerald-400/70">✓ Passed</span></p>
                                                    <p>Old length: <span className="text-foreground/60">{vpbMarkdown?.length ?? 0} chars</span></p>
                                                    <p>New length: <span className="text-foreground/60">{patchResult.patchedMarkdown!.length} chars</span></p>
                                                    <p className="text-[6px] text-muted-foreground/40 italic pt-0.5">
                                                      Committing creates a new version. The current document is not overwritten. No other sections are changed.
                                                    </p>
                                                  </div>

                                                  {committed ? (
                                                    <div className="flex items-center gap-1.5 pl-4 pt-0.5">
                                                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                                      <span className="text-[8px] text-emerald-400 font-medium">
                                                        Version v{(commitMutation.data as any)?.versionNumber} committed
                                                      </span>
                                                    </div>
                                                  ) : (
                                                    <div className="pl-4 pt-0.5 space-y-1">
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={!canCommit || isCommitting}
                                                        onClick={() => {
                                                          if (!canCommit || !documentId || !versionId || !projectId) return;
                                                          commitMutation.mutate(
                                                            {
                                                              documentId,
                                                              currentVersionId: versionId,
                                                              projectId,
                                                              patchResult,
                                                              contract,
                                                            },
                                                            {
                                                              onSuccess: (result) => {
                                                                onVersionCommitted?.(result.newVersionId);
                                                              },
                                                            },
                                                          );
                                                        }}
                                                        className="h-6 text-[8px] gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                                      >
                                                        {isCommitting ? (
                                                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                                        ) : (
                                                          <Save className="h-2.5 w-2.5" />
                                                        )}
                                                        {isCommitting ? 'Committing…' : 'Commit New Version'}
                                                      </Button>
                                                      {!canCommit && !isCommitting && (
                                                        <p className="text-[6px] text-destructive/60 italic">
                                                          Missing required context (document/version/project) for commit
                                                        </p>
                                                      )}
                                                      {commitError && (
                                                        <div className="flex items-center gap-1 text-[7px] text-destructive/80">
                                                          <XCircle className="h-2.5 w-2.5 shrink-0" />
                                                          <span>{commitError}</span>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })()}
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <p className="text-[7px] text-muted-foreground/40 italic pl-5">
                      Grounded in locked Visual Project Bible. No content has been generated or modified.
                    </p>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 gap-1.5">
                {refinementAreas.map((area) => {
                  const Icon = REFINEMENT_ICONS[area.key] || Palette;
                  const statusCfg = STATUS_CONFIG[area.status];
                  const nav = getSectionNavTarget(area);
                  const intent = buildRefinementIntent(area);
                  const actionCfg = intent ? ACTION_CONFIG[intent.action] : null;
                  const isActiveTarget = activeIntent?.sectionKey === area.key;
                  return (
                    <div key={area.key} className={`p-1.5 rounded border space-y-0.5 ${
                      isActiveTarget
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-border/30 bg-muted/20'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-[10px] font-medium text-foreground/90">{area.label}</span>
                        <Badge variant="outline" className={`text-[8px] px-1 py-0 ml-auto ${statusCfg.className}`}>
                          {statusCfg.label}
                        </Badge>
                        {onScrollToSection && vpbMarkdown && (
                          <button
                            onClick={() => handleGoToSection(nav.heading, nav.navigable)}
                            className={`text-[8px] flex items-center gap-0.5 shrink-0 ${
                              nav.navigable
                                ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                                : 'text-muted-foreground/40 cursor-not-allowed'
                            }`}
                            title={nav.actionTitle}
                            disabled={!nav.navigable}
                          >
                            <ArrowRight className="h-2.5 w-2.5" />
                            <span>{nav.actionLabel}</span>
                          </button>
                        )}
                      </div>
                      <p className="text-[8px] text-muted-foreground/70 pl-5">{area.reason}</p>
                      {area.excerpt && (
                        <p className="text-[9px] text-foreground/60 pl-5 italic leading-tight border-l border-border/40 ml-5 pl-1.5">
                          {area.excerpt}
                        </p>
                      )}
                      {/* Section-level refinement action */}
                      {actionCfg && vpbMarkdown && (
                        <div className="pl-5 pt-0.5">
                          <button
                            onClick={() => handleStartRefinement(area)}
                            disabled={isActiveTarget}
                            className={`text-[8px] flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ${
                              isActiveTarget
                                ? 'border-amber-500/20 text-amber-400/50 cursor-default'
                                : 'border-primary/20 text-primary/70 hover:bg-primary/10 hover:text-primary cursor-pointer'
                            }`}
                            title={isActiveTarget ? 'Refinement session active' : `${actionCfg.label} — ${area.sectionHeading}`}
                          >
                            <actionCfg.icon className="h-2.5 w-2.5" />
                            <span>{isActiveTarget ? 'Session active' : actionCfg.label}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[8px] text-muted-foreground/60 italic">
                Additional production domains will become available as this track matures.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
