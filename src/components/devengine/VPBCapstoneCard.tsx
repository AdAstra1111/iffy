/**
 * VPBCapstoneCard — Visual Project Bible capstone status block and convergence UI.
 *
 * Surfaces VPB as the visual development capstone with:
 * - Status truth derived from real data
 * - Convergence evaluation display
 * - User shepherding decisions
 * - Open/generate actions
 *
 * IEL: Status is deterministic. No force-accept bypass for blocked VPB.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  BookOpen, ChevronRight, AlertTriangle, CheckCircle2,
  Eye, RefreshCw, Loader2, Shield, Plus,
} from 'lucide-react';
import {
  evaluateVPBConvergence,
  resolveVPBStatus,
  SHEPHERDING_DOMAIN_LABELS,
  type ShepherdingDecision,
  type ShepherdingDomain,
  type VPBStatus,
  type VPBConvergenceResult,
} from '@/lib/visual/vpbConvergence';

interface VPBCapstoneCardProps {
  projectId: string;
  /** Whether a VPB document exists in project_documents */
  vpbExists: boolean;
  /** VPB metadata from the assembled result (if exists) */
  vpbMeta?: {
    sections_present: number;
    sections_total: number;
    character_count: number;
    location_count: number;
    asset_count: number;
    enrichment_applied: boolean;
    assembled_at: string | null;
  };
  visualCanonAvailable: boolean;
  /** Callback to open the VPB in the document viewer */
  onOpenVPB?: () => void;
  /** Callback to generate/regenerate the VPB */
  onGenerateVPB?: () => void;
  isGenerating?: boolean;
}

const STATUS_CONFIG: Record<VPBStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  missing: { label: 'Not Generated', color: 'text-muted-foreground', icon: BookOpen },
  assembling: { label: 'Assembling…', color: 'text-amber-400', icon: Loader2 },
  assembled_unreviewed: { label: 'Assembled — Unreviewed', color: 'text-blue-400', icon: Eye },
  converging: { label: 'Converging…', color: 'text-amber-400', icon: Loader2 },
  converged: { label: 'Converged', color: 'text-emerald-400', icon: CheckCircle2 },
  blocked: { label: 'Blocked', color: 'text-destructive', icon: AlertTriangle },
  approved_for_visual_pipeline: { label: 'Approved', color: 'text-emerald-400', icon: Shield },
};

export function VPBCapstoneCard({
  projectId,
  vpbExists,
  vpbMeta,
  visualCanonAvailable,
  onOpenVPB,
  onGenerateVPB,
  isGenerating,
}: VPBCapstoneCardProps) {
  const [shepherdingDecisions, setShepherdingDecisions] = useState<ShepherdingDecision[]>([]);
  const [newDomain, setNewDomain] = useState<ShepherdingDomain>('world_visual_direction');
  const [newDecisionText, setNewDecisionText] = useState('');
  const [showShepherdingForm, setShowShepherdingForm] = useState(false);

  // Evaluate convergence
  const convergence = useMemo<VPBConvergenceResult | null>(() => {
    if (!vpbExists || !vpbMeta) return null;
    return evaluateVPBConvergence({
      sections_present: vpbMeta.sections_present,
      sections_total: vpbMeta.sections_total,
      character_count: vpbMeta.character_count,
      location_count: vpbMeta.location_count,
      asset_count: vpbMeta.asset_count,
      enrichment_applied: vpbMeta.enrichment_applied,
      visual_canon_available: visualCanonAvailable,
      shepherding_decisions: shepherdingDecisions,
    });
  }, [vpbExists, vpbMeta, visualCanonAvailable, shepherdingDecisions]);

  // Resolve status
  const statusReport = useMemo(() => {
    return resolveVPBStatus({
      document_exists: vpbExists,
      sections_present: vpbMeta?.sections_present ?? 0,
      sections_total: vpbMeta?.sections_total ?? 12,
      character_count: vpbMeta?.character_count ?? 0,
      location_count: vpbMeta?.location_count ?? 0,
      asset_count: vpbMeta?.asset_count ?? 0,
      last_assembled_at: vpbMeta?.assembled_at ?? null,
      convergence_result: convergence,
      visual_canon_available: visualCanonAvailable,
      enrichment_applied: vpbMeta?.enrichment_applied ?? false,
    });
  }, [vpbExists, vpbMeta, convergence, visualCanonAvailable]);

  const statusCfg = STATUS_CONFIG[statusReport.status];
  const StatusIcon = statusCfg.icon;

  const addShepherdingDecision = () => {
    if (!newDecisionText.trim()) return;
    const decision: ShepherdingDecision = {
      id: crypto.randomUUID(),
      domain: newDomain,
      decision_text: newDecisionText.trim(),
      decided_at: new Date().toISOString(),
      decided_by: null,
      is_active: true,
    };
    setShepherdingDecisions(prev => [...prev, decision]);
    setNewDecisionText('');
    setShowShepherdingForm(false);
  };

  const toggleDecision = (id: string) => {
    setShepherdingDecisions(prev =>
      prev.map(d => d.id === id ? { ...d, is_active: !d.is_active } : d)
    );
  };

  return (
    <Card className="border-primary/20 bg-card/80">
      <CardHeader className="py-2.5 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            Visual Project Bible
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 py-0 ${statusCfg.color}`}
            >
              <StatusIcon className={`h-2.5 w-2.5 mr-0.5 ${statusReport.status === 'assembling' || statusReport.status === 'converging' ? 'animate-spin' : ''}`} />
              {statusCfg.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-3">
        {/* Status Summary */}
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="text-center">
            <div className="text-muted-foreground">Characters</div>
            <div className="font-medium">{statusReport.character_count}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Locations</div>
            <div className="font-medium">{statusReport.location_count}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">Assets</div>
            <div className="font-medium">{statusReport.asset_count}</div>
          </div>
        </div>

        {/* Convergence Score */}
        {convergence && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Convergence</span>
              <span className={`font-medium ${
                convergence.verdict === 'pass' ? 'text-emerald-400' :
                convergence.verdict === 'blocked' ? 'text-destructive' :
                'text-amber-400'
              }`}>
                {convergence.score}/100 — {convergence.verdict}
              </span>
            </div>
            <Progress value={convergence.score} className="h-1.5" />

            {/* Dimension breakdown */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground">
              {Object.entries(convergence.dimensions).map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span>{key.replace(/_/g, ' ')}</span>
                  <span className="font-mono">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blockers */}
        {statusReport.blockers.length > 0 && (
          <div className="space-y-1">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Blockers ({statusReport.blockers.length})
            </div>
            {statusReport.blockers.map((b, i) => (
              <div key={i} className={`text-[10px] p-1.5 rounded border ${
                b.severity === 'hard'
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
              }`}>
                <div className="font-medium">{b.blocker_class.replace(/_/g, ' ')}</div>
                <div className="text-[9px] opacity-80">{b.detail}</div>
              </div>
            ))}
          </div>
        )}

        {/* Shepherding Decisions */}
        <Collapsible>
          <CollapsibleTrigger className="w-full flex items-center gap-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
            <ChevronRight className="h-3 w-3 transition-transform data-[state=open]:rotate-90" />
            Visual Direction Decisions ({shepherdingDecisions.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 mt-1.5">
            {shepherdingDecisions.map(d => (
              <div
                key={d.id}
                className={`text-[10px] p-1.5 rounded border cursor-pointer transition-colors ${
                  d.is_active
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border/40 bg-muted/20 opacity-60'
                }`}
                onClick={() => toggleDecision(d.id)}
              >
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[8px] px-1 py-0">
                    {SHEPHERDING_DOMAIN_LABELS[d.domain]}
                  </Badge>
                  <span className="text-[8px] text-muted-foreground">
                    {d.is_active ? 'active' : 'inactive'}
                  </span>
                </div>
                <div className="mt-0.5">{d.decision_text}</div>
              </div>
            ))}

            {showShepherdingForm ? (
              <div className="space-y-1.5 p-2 rounded border border-primary/20 bg-primary/5">
                <Select value={newDomain} onValueChange={v => setNewDomain(v as ShepherdingDomain)}>
                  <SelectTrigger className="h-6 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SHEPHERDING_DOMAIN_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-[10px]">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newDecisionText}
                  onChange={e => setNewDecisionText(e.target.value)}
                  placeholder="e.g. Ground the project in prestige thriller realism"
                  className="h-6 text-[10px]"
                  onKeyDown={e => e.key === 'Enter' && addShepherdingDecision()}
                />
                <div className="flex gap-1">
                  <Button size="sm" className="h-5 text-[9px] px-2" onClick={addShepherdingDecision}>
                    Add
                  </Button>
                  <Button size="sm" variant="ghost" className="h-5 text-[9px] px-2" onClick={() => setShowShepherdingForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[9px] px-2 gap-0.5 w-full"
                onClick={() => setShowShepherdingForm(true)}
              >
                <Plus className="h-2.5 w-2.5" /> Add Direction Decision
              </Button>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Actions */}
        <div className="flex gap-1.5">
          {vpbExists && onOpenVPB && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 gap-1 flex-1"
              onClick={onOpenVPB}
            >
              <Eye className="h-3 w-3" /> View
            </Button>
          )}
          {onGenerateVPB && (
            <Button
              size="sm"
              variant={vpbExists ? 'outline' : 'default'}
              className="h-6 text-[10px] px-2 gap-1 flex-1"
              onClick={onGenerateVPB}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : vpbExists ? (
                <RefreshCw className="h-3 w-3" />
              ) : (
                <BookOpen className="h-3 w-3" />
              )}
              {vpbExists ? 'Reassemble' : 'Generate'}
            </Button>
          )}
        </div>

        {/* Source truth readiness */}
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
          {statusReport.source_truth_ready ? (
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
          )}
          Source truth: {statusReport.source_truth_ready ? 'ready' : 'incomplete'}
        </div>
      </CardContent>
    </Card>
  );
}
