/**
 * ApprovalSection — Phase 1 Approval + Producer Notes UI.
 *
 * Appears within ConvergencePanel when a foundation doc (concept_brief, etc.)
 * has divergences from stage-compare. Shows each divergence with Accept/Reject.
 * Creates locked producer_notes via the producer-note edge function.
 *
 * Phase 1 scope: concept_brief only. Extends to other doc types in later phases.
 */
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Lock,
  MessageSquare,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

interface Divergence {
  id: string;
  claim: string;
  evidence: string;
  type: "contradicted" | "extrapolated" | "unverifiable" | "confirmed";
}

interface ProducerNote {
  id: string;
  divergence_id: string;
  decision: "accepted" | "rejected";
  note_text: string | null;
  entity_tag: string | null;
  locked: boolean;
  created_at: string;
}

interface ApprovalSectionProps {
  projectId: string;
  docType: string; // "concept_brief" | "beat_sheet" | "character_bible" | "treatment"
  versionId: string;
  documentId: string;
  /** Called when any note is created/updated — lets parent invalidate queries */
  onNoteChange?: () => void;
}

// ─── Fetch divergences from stage-compare narrative_units ──────────────────────
async function fetchDivergences(
  projectId: string,
  documentId: string,
): Promise<Divergence[]> {
  const { data, error } = await supabase
    .from("narrative_units")
    .select("payload_json")
    .eq("project_id", projectId)
    .eq("unit_type", "stage_compare")
    .eq("unit_key", `stage_compare:${documentId}`)
    .maybeSingle();

  if (error || !data) return [];

  const payload = data.payload_json as {
    report?: { issues?: string[]; contradicted?: number; extrapolated?: number; unverifiable?: number };
  } | null;
  if (!payload?.report?.issues?.length) return [];

  // Phase 1: issues are flat strings. Give each a client-generated stable ID.
  return payload.report.issues.map((issue: string, index: number) => ({
    id: `div-${documentId.slice(0, 8)}-${index}`,
    claim: issue,
    evidence: "", // stage-compare doesn't provide per-issue evidence in phase 1
    type: "contradicted" as const,
  }));
}

// ─── Fetch existing producer notes for this doc version ────────────────────────
async function fetchProducerNotes(
  projectId: string,
  docType: string,
  versionId: string,
): Promise<ProducerNote[]> {
  const { data, error } = await supabase
    .from("producer_notes")
    .select("*")
    .eq("project_id", projectId)
    .eq("source_doc_type", docType)
    .eq("source_doc_version_id", versionId);

  if (error) {
    console.error("[ApprovalSection] fetchProducerNotes error:", error);
    return [];
  }
  return (data as ProducerNote[]) || [];
}

// ─── Create / upsert a producer note ──────────────────────────────────────────
async function createProducerNote(params: {
  project_id: string;
  source_doc_type: string;
  source_doc_version_id: string;
  divergence_id: string;
  decision: "accepted" | "rejected";
  note_text?: string;
  entity_tag?: string;
}): Promise<void> {
  // Phase 1: direct Supabase insert. Service role bypass handled by RLS policy.
  const sb = await import("@/integrations/supabase/client").then(m => m.supabase);
  const { error } = await sb
    .from("producer_notes")
    .upsert(
      {
        project_id: params.project_id,
        source_doc_type: params.source_doc_type,
        source_doc_version_id: params.source_doc_version_id,
        divergence_id: params.divergence_id,
        decision: params.decision,
        note_text: params.note_text ?? null,
        entity_tag: params.entity_tag ?? null,
        locked: true,
      },
      {
        onConflict: "project_id,source_doc_type,source_doc_version_id,divergence_id",
      },
    );

  if (error) throw new Error(error.message);
}

// ─── Single divergence row ──────────────────────────────────────────────────────
function DivergenceRow({
  divergence,
  existingNote,
  docType,
  versionId,
  projectId,
  onUpdate,
}: {
  divergence: Divergence;
  existingNote?: ProducerNote;
  docType: string;
  versionId: string;
  projectId: string;
  onUpdate: () => void;
}) {
  const [noteText, setNoteText] = useState(existingNote?.note_text ?? "");
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const decision = existingNote?.decision;
  const isLocked = existingNote?.locked ?? false;

  const handleDecision = async (d: "accepted" | "rejected") => {
    setSubmitting(true);
    try {
      await createProducerNote({
        project_id: projectId,
        source_doc_type: docType,
        source_doc_version_id: versionId,
        divergence_id: divergence.id,
        decision: d,
        note_text: noteText.trim() || undefined,
        entity_tag: undefined, // Phase 1: no entity tagging
      });
      toast.success(d === "accepted" ? "Divergence accepted — note locked" : "Divergence rejected");
      onUpdate();
    } catch (e: any) {
      toast.error(`Failed to save: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const severityColor =
    divergence.type === "contradicted"
      ? "border-destructive/30 bg-destructive/5"
      : divergence.type === "extrapolated"
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-muted/30 bg-muted/5";

  return (
    <div className={`rounded-md border p-2.5 space-y-2 ${severityColor}`}>
      {/* Header row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-foreground leading-snug">{divergence.claim}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground shrink-0 p-0.5"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Existing decision badge */}
      {decision && (
        <div className="flex items-center gap-1.5">
          {decision === "accepted" ? (
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
          ) : (
            <X className="h-3 w-3 text-muted-foreground" />
          )}
          <span className={`text-[9px] font-semibold uppercase tracking-wider ${
            decision === "accepted" ? "text-emerald-400" : "text-muted-foreground"
          }`}>
            {decision === "accepted" ? "Accepted" : "Rejected"}
          </span>
          {isLocked && <Lock className="h-2.5 w-2.5 text-muted-foreground" />}
          {existingNote?.note_text && (
            <MessageSquare className="h-3 w-3 text-muted-foreground ml-1" />
          )}
        </div>
      )}

      {/* Expanded: note field + action buttons */}
      {expanded && !isLocked && (
        <div className="space-y-2 pt-1 border-t border-border/30">
          <Textarea
            placeholder="Optional producer note (rationale, context…)"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={2}
            className="text-[10px] resize-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] flex-1 gap-1 text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10"
              onClick={() => handleDecision("accepted")}
              disabled={submitting}
            >
              <Check className="h-3 w-3" /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] flex-1 gap-1 text-muted-foreground border-muted/30 hover:bg-muted/10"
              onClick={() => handleDecision("rejected")}
              disabled={submitting}
            >
              <X className="h-3 w-3" /> Reject
            </Button>
          </div>
        </div>
      )}

      {/* Expanded but locked: show note */}
      {expanded && isLocked && existingNote?.note_text && (
        <div className="pt-1 border-t border-border/30">
          <p className="text-[9px] text-muted-foreground italic">"{existingNote.note_text}"</p>
        </div>
      )}
    </div>
  );
}

// ─── Main ApprovalSection component ─────────────────────────────────────────────
export function ApprovalSection({
  projectId,
  docType,
  versionId,
  documentId,
  onNoteChange,
}: ApprovalSectionProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Only show for foundation doc types in phase 1
  const phase1Types = ["concept_brief", "beat_sheet", "character_bible", "treatment"];
  if (!phase1Types.includes(docType)) return null;

  const {
    data: divergences = [],
    isLoading: divergencesLoading,
    refetch: refetchDivergences,
  } = useQuery({
    queryKey: ["approval-divergences", projectId, documentId],
    queryFn: () => fetchDivergences(projectId, documentId),
    enabled: open,
  });

  const {
    data: existingNotes = [],
    isLoading: notesLoading,
    refetch: refetchNotes,
  } = useQuery({
    queryKey: ["approval-notes", projectId, docType, versionId],
    queryFn: () => fetchProducerNotes(projectId, docType, versionId),
    enabled: open,
  });

  const handleNoteUpdate = useCallback(() => {
    refetchNotes();
    onNoteChange?.();
  }, [refetchNotes, onNoteChange]);

  // Build a map of divergence_id → note for quick lookup
  const noteMap = new Map(existingNotes.map((n) => [n.divergence_id, n]));

  const totalDivergences = divergences.length;
  const decidedCount = existingNotes.filter((n) => n.locked).length;
  const pendingCount = totalDivergences - decidedCount;
  const allDecided = totalDivergences > 0 && pendingCount === 0;

  // Phase 1 gate: only show for concept_brief
  if (docType !== "concept_brief") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-[10px] h-7 mt-1 border-primary/20 hover:border-primary/50"
        >
          <ShieldCheck className="h-3 w-3 text-primary" />
          {totalDivergences === 0
            ? "No divergences"
            : pendingCount === 0
            ? `All decided (${decidedCount})`
            : `${pendingCount} pending · ${decidedCount}/${totalDivergences} decided`}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Approval Gate — {docType.replace(/_/g, " ")}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Review each divergence from the source screenplay. Accept to lock a producer note,
            or reject to keep the original. Notes are immutable once locked.
          </p>
        </DialogHeader>

        {divergencesLoading || notesLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
            Loading…
          </div>
        ) : divergences.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Check className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium">No divergences detected</p>
            <p className="text-[11px] text-muted-foreground">
              Run stage-compare to surface issues, or all claims are confirmed against the script.
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2 pr-2">
              {divergences.map((divergence) => (
                <DivergenceRow
                  key={divergence.id}
                  divergence={divergence}
                  existingNote={noteMap.get(divergence.id)}
                  docType={docType}
                  versionId={versionId}
                  projectId={projectId}
                  onUpdate={handleNoteUpdate}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Footer status */}
        {divergences.length > 0 && (
          <div className="shrink-0 pt-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              {allDecided ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-semibold">
                    All divergences decided
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[10px] text-muted-foreground">
                    {pendingCount} of {totalDivergences} pending
                  </span>
                </>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-[10px]"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
