/**
 * LookbookSectionPanel — Renders a canonical lookbook section with
 * image content, curation filters, populate CTA, and blockers.
 * Includes Reset Section and Regenerate Clean actions.
 * Driven entirely by canonical section keys.
 */
import { useState } from 'react';
import { ChevronRight, RotateCcw, Sparkles as SparklesIcon, Trash2, Filter, Star, Archive, XCircle, Zap, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ImageSelectorGrid } from '@/components/images/ImageSelectorGrid';
import { useLookbookSectionContent } from '@/hooks/useLookbookSectionContent';
import type { LookbookSection, CanonicalSectionKey } from '@/hooks/useLookbookSections';
import { SECTION_UPSTREAM_MAP } from '@/hooks/useLookbookSections';
import { useSectionConvergence } from '@/hooks/useSectionConvergence';
import { usePremiumReconciliation } from '@/hooks/usePremiumReconciliation';
import { isPremiumSection } from '@/lib/images/premiumQualityGate';
import { User, Globe, Sun, Layers, Sparkles, Image as ImageIcon, AlertCircle } from 'lucide-react';
import type { CurationState } from '@/lib/images/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ICON_MAP: Record<string, React.ElementType> = {
  User, Globe, Sun, Layers, Sparkles, Image: ImageIcon,
};

type CurationFilter = CurationState | 'all' | 'working';

interface LookbookSectionPanelProps {
  projectId: string;
  section: LookbookSection;
  onPopulate?: (sectionKey: CanonicalSectionKey) => void;
  isPopulating?: boolean;
  onResetSection?: (sectionKey: CanonicalSectionKey) => void;
  isResettingSection?: boolean;
  onRegenerateClean?: (sectionKey: CanonicalSectionKey) => void;
  isRegeneratingSection?: boolean;
}

export function LookbookSectionPanel({
  projectId,
  section,
  onPopulate,
  isPopulating,
  onResetSection,
  isResettingSection,
  onRegenerateClean,
  isRegeneratingSection,
}: LookbookSectionPanelProps) {
  const sectionKey = section.section_key as CanonicalSectionKey;
  const upstream = SECTION_UPSTREAM_MAP[sectionKey];
  const IconComp = upstream ? ICON_MAP[upstream.icon] || Globe : Globe;

  const [filter, setFilter] = useState<CurationFilter>('working');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showConvergeConfirm, setShowConvergeConfirm] = useState<'keepPrimary' | 'rejectAll' | 'autoPrune' | null>(null);
  const { images, total, isLoading, blockers, hasHeroAnchor, heroAnchorId, heroAnchorInjected } = useLookbookSectionContent(
    projectId,
    sectionKey,
    { curationFilter: filter === 'all' ? 'all' : filter === 'working' ? 'working' : filter, pageSize: 12 },
  );

  const { keepPrimaryOnly, rejectAllCandidates, archiveOlderGenerations, autoPruneSection, scoreSectionPreview, busy: convergenceBusy } = useSectionConvergence(projectId);
  const { reconcile, reconciling } = usePremiumReconciliation(projectId);
  const [lastScoringWarnings, setLastScoringWarnings] = useState<string[]>([]);

  const hasImages = images.length > 0;
  const isEmpty = section.section_status === 'empty_but_bootstrapped' || section.section_status === 'repaired';
  const [open, setOpen] = useState(!hasImages || section.section_status !== 'fully_populated');

  const activeCount = images.filter(i => i.curation_state === 'active').length;
  const candidateCount = images.filter(i => i.curation_state === 'candidate').length;
  const archivedCount = images.filter(i => i.curation_state === 'archived').length;
  const primaryCount = images.filter(i => i.is_primary).length;
  const nonPrimaryActiveCount = images.filter(i => !i.is_primary && (i.curation_state === 'active' || i.curation_state === 'candidate')).length;
  const hasBlockers = blockers.length > 0 && !hasImages;

  const isBusy = isPopulating || isResettingSection || isRegeneratingSection || convergenceBusy || reconciling;
  const isPremium = isPremiumSection(sectionKey);

  const statusBadge = () => {
    if (isResettingSection) return <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 animate-pulse">Resetting…</Badge>;
    if (isRegeneratingSection) return <Badge variant="outline" className="text-[10px] text-primary border-primary/30 animate-pulse">Regenerating…</Badge>;
    if (hasImages && activeCount > 0) return <Badge variant="default" className="text-[10px] bg-primary/15 text-primary border-0">{activeCount} active</Badge>;
    if (hasImages) return <Badge variant="secondary" className="text-[10px]">{total} images</Badge>;
    if (isEmpty) return <Badge variant="outline" className="text-[10px] text-muted-foreground">Empty</Badge>;
    return null;
  };

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors text-left group border border-border/50">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <IconComp className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{section.section_label}</span>
              {statusBadge()}
            </div>
            {upstream && !hasImages && (
              <span className="text-[10px] text-muted-foreground">{upstream.sources[0]}</span>
            )}
            {hasImages && (
              <div className="flex items-center gap-1.5 mt-0.5">
                {candidateCount > 0 && <span className="text-[10px] text-muted-foreground">{candidateCount} candidates</span>}
                {archivedCount > 0 && <span className="text-[10px] text-muted-foreground/50">{archivedCount} archived</span>}
              </div>
            )}
          </div>
          <ChevronRight className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )} />
        </CollapsibleTrigger>

        <CollapsibleContent className="px-3 pb-3 pt-2">
          {/* Section actions bar */}
          {(hasImages || onResetSection || onRegenerateClean) && (
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1 flex-wrap">
                {hasImages && (['working', 'active', 'candidate', 'archived', 'all'] as CurationFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize',
                      filter === f ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f === 'working' ? 'Working' : f}
                    {f === 'active' && activeCount > 0 && ` (${activeCount})`}
                    {f === 'candidate' && candidateCount > 0 && ` (${candidateCount})`}
                    {f === 'archived' && archivedCount > 0 && ` (${archivedCount})`}
                    {f === 'working' && ` (${activeCount + candidateCount})`}
                  </button>
                ))}
              </div>

              {/* Section management dropdown */}
              {(onResetSection || onRegenerateClean || hasImages) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                      disabled={isBusy}
                    >
                      Section Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {onPopulate && (
                      <DropdownMenuItem
                        onClick={() => onPopulate(sectionKey)}
                        disabled={isBusy}
                        className="text-xs gap-2"
                      >
                        <SparklesIcon className="h-3 w-3" />
                        {upstream?.populateCta || 'Populate Section'}
                      </DropdownMenuItem>
                    )}
                    {onRegenerateClean && (
                      <DropdownMenuItem
                        onClick={() => onRegenerateClean(sectionKey)}
                        disabled={isBusy}
                        className="text-xs gap-2"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Regenerate Clean
                      </DropdownMenuItem>
                    )}

                    {/* Convergence controls */}
                    {hasImages && nonPrimaryActiveCount > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setShowConvergeConfirm('autoPrune')}
                          disabled={isBusy}
                          className="text-xs gap-2 font-medium"
                        >
                          <Zap className="h-3 w-3" />
                          Auto-Prune Section
                        </DropdownMenuItem>
                        {primaryCount > 0 && (
                          <DropdownMenuItem
                            onClick={() => setShowConvergeConfirm('keepPrimary')}
                            disabled={isBusy}
                            className="text-xs gap-2"
                          >
                            <Star className="h-3 w-3" />
                            Keep Primary Only
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => archiveOlderGenerations(sectionKey)}
                          disabled={isBusy}
                          className="text-xs gap-2"
                        >
                          <Archive className="h-3 w-3" />
                          Archive Older Generations
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setShowConvergeConfirm('rejectAll')}
                          disabled={isBusy}
                          className="text-xs gap-2 text-destructive focus:text-destructive"
                        >
                          <XCircle className="h-3 w-3" />
                          Reject All Non-Primary
                        </DropdownMenuItem>
                      </>
                    )}

                    {/* Premium reconciliation action */}
                    {isPremium && hasImages && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => reconcile()}
                          disabled={isBusy}
                          className="text-xs gap-2"
                        >
                          <Shield className="h-3 w-3" />
                          Reconcile Premium Governance
                        </DropdownMenuItem>
                      </>
                    )}

                    {onResetSection && hasImages && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setShowResetConfirm(true)}
                          disabled={isBusy}
                          className="text-xs gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                          Reset Section
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}

          {!hasImages && !isLoading ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4">
              {upstream && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Feeds from:</p>
                  <ul className="space-y-1">
                    {upstream.sources.map((src, i) => (
                      <li key={i} className="text-xs text-muted-foreground/80 flex items-start gap-1.5">
                        <span className="text-primary/60 mt-0.5">•</span>
                        {src}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasBlockers && (
                <div className="mb-3 rounded-md bg-destructive/5 border border-destructive/20 p-2.5">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1 mb-1">
                    <AlertCircle className="h-3 w-3" /> Upstream blockers
                  </p>
                  {blockers.map((b, i) => (
                    <p key={i} className="text-[11px] text-destructive/80 ml-4">{b.message}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                {onPopulate && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs gap-1.5"
                    onClick={(e) => { e.stopPropagation(); onPopulate(sectionKey); }}
                    disabled={isBusy}
                  >
                    {upstream?.populateCta || 'Populate Section'}
                  </Button>
                )}
                {onRegenerateClean && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1.5"
                    onClick={(e) => { e.stopPropagation(); onRegenerateClean(sectionKey); }}
                    disabled={isBusy}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Regenerate Clean
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <ImageSelectorGrid
              projectId={projectId}
              images={images}
              isLoading={isLoading}
              emptyLabel={`No ${section.section_label.toLowerCase()} images yet`}
              showShotTypes
              showCurationControls
              enableCompare
              showProvenance
            />
          )}
          {/* Scoring diagnostics warnings */}
          {lastScoringWarnings.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-200/50 bg-amber-50/30 dark:bg-amber-950/20 p-2">
              <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 mb-1">Section Diagnostics</p>
              {lastScoringWarnings.slice(0, 5).map((w, i) => (
                <p key={i} className="text-[10px] text-amber-600/80 dark:text-amber-500/80">{w}</p>
              ))}
              {lastScoringWarnings.length > 5 && (
                <p className="text-[10px] text-amber-600/60 dark:text-amber-500/60">+ {lastScoringWarnings.length - 5} more</p>
              )}
              <button
                className="text-[9px] text-amber-600/60 dark:text-amber-500/60 hover:text-amber-700 mt-1 underline"
                onClick={() => setLastScoringWarnings([])}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Hero Anchor Contract diagnostics */}
          {(sectionKey === 'hero_frames' || sectionKey === 'poster_directions') && hasImages && (
            <div className="mt-2 rounded-md border border-border/30 bg-muted/10 px-3 py-2 flex items-center gap-3">
              <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Anchor</span>
              {hasHeroAnchor ? (
                <>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono bg-primary/5 text-primary border-primary/20">
                    {heroAnchorId?.slice(0, 8)}
                  </Badge>
                  {heroAnchorInjected && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-green-500/10 text-green-600 border-green-500/20">
                      injected
                    </Badge>
                  )}
                </>
              ) : (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground border-border/40">
                  none — fail-closed
                </Badge>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Reset confirmation dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {section.section_label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive all {total} images in this section. They will be moved to the archive
              and will no longer appear in active workflows or downstream builds.
              <br /><br />
              Archived images remain available in the archive filter for historical reference
              but will not be used in lookbook builds or canonical resolution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onResetSection?.(sectionKey);
                setShowResetConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset Section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convergence confirmation dialog */}
      <AlertDialog open={!!showConvergeConfirm} onOpenChange={(open) => !open && setShowConvergeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {showConvergeConfirm === 'keepPrimary'
                ? `Keep Primary Only — ${section.section_label}`
                : showConvergeConfirm === 'autoPrune'
                  ? `Auto-Prune — ${section.section_label}`
                  : `Reject All Non-Primary — ${section.section_label}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {showConvergeConfirm === 'keepPrimary'
                ? `This will archive ${nonPrimaryActiveCount} non-primary candidate${nonPrimaryActiveCount !== 1 ? 's' : ''} in this section only. The primary image will remain active. Archived images stay accessible via the archive filter.`
                : showConvergeConfirm === 'autoPrune'
                  ? `Canonical scoring engine will rank all candidates using section-specific criteria (orientation, resolution, recency, section relevance, lane compliance, duplication penalties). The strongest images survive; weaker ones are archived. Primary is always preserved.`
                  : `This will reject ${nonPrimaryActiveCount} non-primary candidate${nonPrimaryActiveCount !== 1 ? 's' : ''} from active review in this section only. ${primaryCount > 0 ? 'The primary image will be preserved.' : 'No primary is set — all candidates will be rejected.'} Rejected images remain in the archive for reference.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (showConvergeConfirm === 'keepPrimary') {
                  keepPrimaryOnly(sectionKey);
                } else if (showConvergeConfirm === 'autoPrune') {
                  const result = await autoPruneSection(sectionKey);
                  if (result.scoring?.diagnostics.warnings.length) {
                    setLastScoringWarnings(result.scoring.diagnostics.warnings);
                  }
                } else {
                  rejectAllCandidates(sectionKey);
                }
                setShowConvergeConfirm(null);
              }}
              className={showConvergeConfirm === 'rejectAll' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {showConvergeConfirm === 'keepPrimary' ? 'Keep Primary Only' : showConvergeConfirm === 'autoPrune' ? 'Auto-Prune' : 'Reject All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
