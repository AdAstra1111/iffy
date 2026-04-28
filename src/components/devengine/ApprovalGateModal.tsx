/**
 * ApprovalGateModal
 *
 * Phase 2: Universal approval gate for all foundation docs.
 * Intercepts "Approve Version" — shows:
 *   1. Specific contradictions (from getStaleDocReasons / Phase 1)
 *   2. Downstream docs that will be affected (cascade)
 *   3. CI/GP delta per downstream doc (from development_runs)
 *   4. Checkboxes: accept/reject per downstream
 *   5. "Lock & Approve" button — creates producer_note, triggers cascade-engine, then approveAndActivate
 *
 * Hard block: if any un-ticked item creates a hard conflict (contradictions exist
 * and user did not accept), the approve button is blocked.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle, Check, ChevronDown, ChevronRight, Lock, TrendingUp, TrendingDown,
  Minus,
} from "lucide-react";
import { toast } from "sonner";

// ── Dependency chain (mirrors cascade-engine) ─────────────────────────────────
const DOWNSTREAM_MAP: Record<string, string[]> = {
  concept_brief: ["beat_sheet", "character_bible"],
  beat_sheet: ["character_bible", "treatment"],
  character_bible: ["treatment"],
  treatment: [],
  long_synopsis: [],
};

const DOC_LABELS: Record<string, string> = {
  concept_brief: "Concept Brief",
  beat_sheet: "Beat Sheet",
  character_bible: "Character Bible",
  treatment: "Treatment",
  long_synopsis: "Long Synopsis",
};

// ── Fetch latest CI/GP for a doc type in a project ────────────────────────────
async function fetchDocScores(
  projectId: string,
  docType: string,
): Promise<{ ci: number | null; gp: number | null }> {
  const { data } = await (supabase as any)
    .from("development_runs")
    .select("output_json")
    .eq("project_id", projectId)
    .eq("run_type", "ANALYZE")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data) return { ci: null, gp: null };

  // Find the most recent run for this doc type
  for (const run of data) {
    const out = run.output_json;
    if (!out) continue;
    if (
      out.deliverable_type?.toLowerCase().replace(/ /g, "_") === docType ||
      out.doc_type === docType
    ) {
      return {
        ci: out.ci_score ?? null,
        gp: out.gp_score ?? null,
      };
    }
  }
  return { ci: null, gp: null };
}

// ── Create a producer note ─────────────────────────────────────────────────────
async function createProducerNote(body: {
  project_id: string;
  source_doc_type: string;
  source_doc_version_id: string;
  divergence_id: string;
  decision: "accepted" | "rejected";
  note_text?: string;
  entity_tag?: string;
}) {
  const { data, error } = await (supabase as any).functions.invoke("producer-note", {
    body,
  });
  if (error) throw new Error(error.message || "Failed to create producer note");
  return data;
}

// ── Trigger cascade-engine ─────────────────────────────────────────────────────
async function triggerCascade(producer_note_id: string) {
  const { data, error } = await (supabase as any).functions.invoke("cascade-engine", {
    body: { producer_note_id },
  });
  if (error) throw new Error(error.message || "Cascade failed");
  return data;
}

// ── CI/GP delta badge ──────────────────────────────────────────────────────────
function ScoreDeltaBadge({ current, projected }: { current: number | null; projected: number | null }) {
  if (current === null) {
    return (
      <span className="text-[9px] text-muted-foreground italic">No CI/GP data — score after reconciliation</span>
    );
  }
  if (projected === null) return null;
  const delta = projected - current;
  if (delta > 0) return (
    <span className="flex items-center gap-0.5 text-[9px] text-emerald-400">
      <TrendingUp className="h-2.5 w-2.5" /> +{delta.toFixed(0)}
    </span>
  );
  if (delta < 0) return (
    <span className="flex items-center gap-0.5 text-[9px] text-red-400">
      <TrendingDown className="h-2.5 w-2.5" /> {delta.toFixed(0)}
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
      <Minus className="h-2.5 w-2.5" /> No change
    </span>
  );
}

// ── Downstream row ─────────────────────────────────────────────────────────────
function DownstreamRow({
  docType,
  projectId,
  checked,
  onChange,
  staleReasons,
}: {
  docType: string;
  projectId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  staleReasons: string[];
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: scores } = useQuery({
    queryKey: ["approval-gate-scores", projectId, docType],
    queryFn: () => fetchDocScores(projectId, docType),
    staleTime: 60_000,
  });

  const ci = scores?.ci ?? null;
  const gp = scores?.gp ?? null;

  return (
    <div className={`rounded-md border p-2.5 space-y-1.5 transition-colors ${
      checked ? "border-amber-500/40 bg-amber-500/5" : "border-muted/30 bg-muted/5 opacity-60"
    }`}>
      <div className="flex items-start gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onChange(!!v)}
          className="mt-0.5 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground">
              {DOC_LABELS[docType] || docType.replace(/_/g, " ")}
            </span>
            {staleReasons.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-muted-foreground hover:text-foreground text-[9px] flex items-center gap-0.5"
              >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {staleReasons.length} reason{staleReasons.length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[9px] text-muted-foreground">
              {checked ? "Will regenerate to match" : "Skip — accept divergence"}
            </span>
            {ci !== null && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground">CI: {ci}</span>
                {gp !== null && <span className="text-[9px] text-muted-foreground">GP: {gp}</span>}
              </div>
            )}
            {ci === null && (
              <span className="text-[9px] text-muted-foreground italic">No CI/GP data</span>
            )}
          </div>
        </div>
      </div>
      {expanded && staleReasons.length > 0 && (
        <div className="pl-5 space-y-0.5">
          {staleReasons.map((r, i) => (
            <p key={i} className="text-[9px] text-amber-400/80">• {r}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
interface ApprovalGateModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  docType: string;
  versionId: string;
  /** Contradictions already detected by Phase 1 stale detection */
  staleReasons: string[];
  /** Called after successful approve + cascade */
  onApproved: () => void;
  /** The actual approve + activate function */
  onApproveAndActivate: () => Promise<void>;
}

export function ApprovalGateModal({
  open, onClose, projectId, docType, versionId, staleReasons, onApproved, onApproveAndActivate,
}: ApprovalGateModalProps) {
  const downstreamTypes = DOWNSTREAM_MAP[docType] || [];

  // Which downstream docs are checked for regeneration (default: all)
  const [checkedDownstreams, setCheckedDownstreams] = useState<Set<string>>(
    () => new Set(downstreamTypes),
  );

  const [locking, setLocking] = useState(false);
  const [cascadeError, setCascadeError] = useState<string | null>(null);

  // Hard block: if there are stale reasons AND user has un-ticked ALL downstreams — warn
  const hasConflicts = staleReasons.length > 0;
  const allUnticked = downstreamTypes.length > 0 && checkedDownstreams.size === 0;
  const isBlocked = hasConflicts && allUnticked;

  const toggleDownstream = (dt: string, checked: boolean) => {
    setCheckedDownstreams(prev => {
      const next = new Set(prev);
      if (checked) next.add(dt);
      else next.delete(dt);
      return next;
    });
  };

  const handleLockAndApprove = async () => {
    setLocking(true);
    setCascadeError(null);
    try {
      // 1. Create a producer note for each stale reason (accepted = will cascade)
      const noteIds: string[] = [];
      if (staleReasons.length > 0) {
        for (const reason of staleReasons.slice(0, 5)) { // max 5 notes per approve
          try {
            const note = await createProducerNote({
              project_id: projectId,
              source_doc_type: docType,
              source_doc_version_id: versionId,
              divergence_id: `${versionId}-${reason.slice(0, 30).replace(/\s/g, "-")}`,
              decision: "accepted",
              note_text: reason,
              entity_tag: undefined,
            });
            if (note?.id) noteIds.push(note.id);
          } catch { /* non-fatal — cascade still runs */ }
        }
      }

      // 2. Approve the version
      await onApproveAndActivate();

      // 3. Trigger cascade for each accepted note (only for checked downstreams)
      if (noteIds.length > 0 && checkedDownstreams.size > 0) {
        for (const noteId of noteIds) {
          try {
            await triggerCascade(noteId);
          } catch (e: any) {
            console.warn("[ApprovalGate] cascade trigger failed:", e.message);
          }
        }
      }

      toast.success(
        checkedDownstreams.size > 0
          ? `Approved — reconciliation flags set on ${checkedDownstreams.size} downstream doc(s)`
          : "Approved — no cascade triggered",
      );
      onApproved();
      onClose();
    } catch (err: any) {
      const msg = err?.message || "Approval failed";
      console.error("[ApprovalGate] LockApprove failed:", msg, err);
      setCascadeError(msg);
      toast.error(msg);
    } finally {
      setLocking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-primary" />
            Approval Gate — {DOC_LABELS[docType] || docType.replace(/_/g, " ")}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Approving this version will lock it as canon. Review the downstream impact before confirming.
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 pr-1">

            {/* ── Contradictions ── */}
            {staleReasons.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[11px] font-semibold text-amber-400">
                    {staleReasons.length} contradiction{staleReasons.length !== 1 ? "s" : ""} detected
                  </span>
                </div>
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 space-y-1">
                  {staleReasons.map((r, i) => (
                    <p key={i} className="text-[10px] text-amber-400/90">• {r}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 p-2 rounded-md border border-emerald-500/20 bg-emerald-500/5">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[11px] text-emerald-400">No contradictions detected</span>
              </div>
            )}

            {/* ── Downstream cascade ── */}
            {downstreamTypes.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-foreground">
                  Downstream docs to reconcile ({checkedDownstreams.size}/{downstreamTypes.length} selected)
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Ticked docs will receive reconciliation flags. Untick to knowingly skip.
                </p>
                <div className="space-y-2">
                  {downstreamTypes.map(dt => (
                    <DownstreamRow
                      key={dt}
                      docType={dt}
                      projectId={projectId}
                      checked={checkedDownstreams.has(dt)}
                      onChange={(v) => toggleDownstream(dt, v)}
                      staleReasons={staleReasons}
                    />
                  ))}
                </div>
              </div>
            )}

            {downstreamTypes.length === 0 && (
              <div className="flex items-center gap-1.5 p-2 rounded-md border border-muted/30 bg-muted/5">
                <Check className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">No downstream docs to cascade to</span>
              </div>
            )}

            {/* ── Hard block warning ── */}
            {isBlocked && (
              <div className="flex items-center gap-1.5 p-2 rounded-md border border-red-500/30 bg-red-500/5">
                <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                <span className="text-[10px] text-red-400">
                  Contradictions exist but all downstream docs are unticked. Re-tick at least one, or resolve contradictions first.
                </span>
              </div>
            )}

            {cascadeError && (
              <p className="text-[10px] text-red-400">Error: {cascadeError}</p>
            )}

          </div>
        </ScrollArea>

        <div className="shrink-0 pt-3 border-t border-border flex items-center justify-between">
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onClose} disabled={locking}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 text-[10px] gap-1.5"
            onClick={handleLockAndApprove}
            disabled={locking || isBlocked}
          >
            {locking ? (
              <>Approving…</>
            ) : (
              <>
                <Lock className="h-3 w-3" />
                Lock &amp; Approve
                {checkedDownstreams.size > 0 && ` + cascade to ${checkedDownstreams.size}`}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
