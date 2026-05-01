import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Loader2, AlertCircle, ChevronRight, ChevronDown, RotateCcw, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

interface Beat {
  id: string;         // e.g. "1", "2", "3"
  name: string;       // e.g. "Opening Image"
  act: string;        // e.g. "Act One"
  turningPoint: boolean;
  turningPointLabel: string;
  scene: string;       // e.g. "Scene 1 — The Opening"
  description: string;
  structuralPurpose: string;
  protagonistState: string;
  emotionalShift: string;
  raw: string;        // full markdown block for this beat
}

interface Act {
  name: string;
  beats: Beat[];
}

interface BeatRewritePanelProps {
  projectId: string;
  documentId: string;
  versionId: string;
  version: { plaintext?: string };
  approvedNotes: any[];
  protectItems: string[];
  onComplete?: (newVersionId: string) => void;
  onApplyAllStart?: () => void;
  onApplyAllDone?: () => void;
}

// ── Parser ───────────────────────────────────────────────────────────────────

function parseBeatSheet(plaintext: string): Act[] {
  // ── JSON MODE: detect and parse { "beats": [...] } format ──
  try {
    const trimmed = plaintext.trim();
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      if (parsed && Array.isArray(parsed.beats) && parsed.beats.length > 0) {
        const actGroups: Record<string, any[]> = {};
        for (const beat of parsed.beats) {
          const act = beat.act_affiliation || beat.act || 'ACT 1';
          if (!actGroups[act]) actGroups[act] = [];
          actGroups[act].push(beat);
        }
        const actOrder = ['act_1', 'act_2a', 'act_2b', 'act_2', 'act_3', 'act_4'];
        const sortedActNames = Object.keys(actGroups).sort((a, b) => {
          const ai = actOrder.indexOf(a.toLowerCase());
          const bi = actOrder.indexOf(b.toLowerCase());
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        const acts: Act[] = sortedActNames.map(actName => {
          const beats: Beat[] = (actGroups[actName] || []).map((b: any, i: number) => ({
            id: String(b.number || b.id || i + 1),
            name: b.name || `Beat ${i + 1}`,
            act: b.act_affiliation || b.act || actName,
            turningPoint: !!(b.turning_point || b.turningPoint),
            turningPointLabel: String(b.turning_point || b.turningPoint || 'No'),
            scene: b.scene || b.location || '',
            description: b.description || b.desc || b.beat_description || JSON.stringify(b),
            structuralPurpose: b.structural_purpose || b.structuralPurpose || '',
            protagonistState: b.protagonist_state || b.protagonistState || '',
            emotionalShift: b.emotional_shift || b.emotionalShift || '',
            raw: JSON.stringify(b, null, 2),
          }));
          const label = actName.replace(/^act_/i, 'ACT ').replace(/_/g, ' ').trim();
          return { name: label, beats };
        });
        console.log('[BeatRewritePanel] JSON parse: ' + acts.length + ' acts, ' + (acts.reduce((s, a) => s + a.beats.length, 0)) + ' beats');
        return acts;
      }
    }
  } catch (e) { /* Fall through to markdown parser */ }

  // ── ITEM NUMBER FORMAT: "ITEM N: Name\n  Field: Value" (output by reverse-engineer-script) ──
  {
    const itemPattern = /^ITEM\s+(\d+):\s*(.+)/i;
    const fieldPattern = /^\s{2,}(\w[\w\s]*?):\s*(.+)/;
    const lines = plaintext.split('\n');
    const itemBuffer: { id: string; name: string; act: string; turningPoint: boolean; turningPointLabel: string; scene: string; description: string; structuralPurpose: string; protagonistState: string; emotionalShift: string; raw: string }[] = [];
    let currentItem: Partial<typeof itemBuffer[0]> | null = null;
    let currentRawLines: string[] = [];

    for (const line of lines) {
      const itemMatch = line.match(itemPattern);
      if (itemMatch) {
        if (currentItem && currentRawLines.length > 0) {
          const raw = currentRawLines.join('\n');
          itemBuffer.push({
            id: currentItem.id || String(itemBuffer.length + 1),
            name: currentItem.name || `Beat ${itemBuffer.length + 1}`,
            act: currentItem.act || 'ACT 1',
            turningPoint: currentItem.turningPoint || false,
            turningPointLabel: currentItem.turningPointLabel || 'No',
            scene: currentItem.scene || '',
            description: currentItem.description || raw,
            structuralPurpose: currentItem.structuralPurpose || '',
            protagonistState: currentItem.protagonistState || '',
            emotionalShift: currentItem.emotionalShift || '',
            raw,
          });
        }
        currentItem = { id: itemMatch[1], name: itemMatch[2].trim() };
        currentRawLines = [line];
        continue;
      }
      if (currentRawLines.length > 0) currentRawLines.push(line);
      const fieldMatch = line.match(fieldPattern);
      if (fieldMatch && currentItem) {
        const [, key, val] = fieldMatch;
        const k = key.trim().toLowerCase();
        const v = val.trim();
        if (k === 'act affiliation' || k === 'act') currentItem.act = v;
        else if (k === 'turning point') { currentItem.turningPoint = !/no/i.test(v); currentItem.turningPointLabel = v; }
        else if (k === 'scene' || k === 'location') currentItem.scene = v;
        else if (k === 'description' || k === 'what happens') currentItem.description = v;
        else if (k === 'structural purpose') currentItem.structuralPurpose = v;
        else if (k === 'protagonist state') currentItem.protagonistState = v;
        else if (k === 'emotional shift') currentItem.emotionalShift = v;
      }
    }
    if (currentItem && currentRawLines.length > 0) {
      const raw = currentRawLines.join('\n');
      itemBuffer.push({
        id: currentItem.id || String(itemBuffer.length + 1),
        name: currentItem.name || `Beat ${itemBuffer.length + 1}`,
        act: currentItem.act || 'ACT 1',
        turningPoint: currentItem.turningPoint || false,
        turningPointLabel: currentItem.turningPointLabel || 'No',
        scene: currentItem.scene || '',
        description: currentItem.description || raw,
        structuralPurpose: currentItem.structuralPurpose || '',
        protagonistState: currentItem.protagonistState || '',
        emotionalShift: currentItem.emotionalShift || '',
        raw,
      });
    }

    if (itemBuffer.length > 0) {
      const actGroups: Record<string, typeof itemBuffer[]> = {};
      for (const beat of itemBuffer) {
        const actKey = (beat.act || 'ACT 1').toUpperCase();
        if (!actGroups[actKey]) actGroups[actKey] = [];
        actGroups[actKey].push(beat);
      }
      const actOrder = ['ACT_1', 'ACT_2A', 'ACT_2B', 'ACT_2', 'ACT_3', 'ACT_4'];
      const sortedActNames = Object.keys(actGroups).sort((a, b) => {
        const ai = actOrder.indexOf(a.toUpperCase().replace(' ', '_'));
        const bi = actOrder.indexOf(b.toUpperCase().replace(' ', '_'));
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi;
      });
      const acts: Act[] = sortedActNames.map(actName => ({
        name: actName.replace(/^ACT_/i, 'ACT ').replace(/_/g, ' '),
        beats: (actGroups[actName] || []).map((b, i) => ({
          id: String(b.id || i + 1),
          name: b.name,
          act: b.act,
          turningPoint: b.turningPoint,
          turningPointLabel: b.turningPointLabel,
          scene: b.scene,
          description: b.description,
          structuralPurpose: b.structuralPurpose,
          protagonistState: b.protagonistState,
          emotionalShift: b.emotionalShift,
          raw: b.raw,
        })),
      }));
      console.log('[BeatRewritePanel] ITEM format parse: ' + acts.length + ' acts, ' + itemBuffer.length + ' beats');
      return acts;
    }
  }


  // ── MARKDOWN MODE: existing parser for markdown-formatted beat sheets ──
  const lines = plaintext.split('\n');
  const acts: Act[] = [];
  let currentAct: Act | null = null;
  let currentBeatLines: string[] = [];
  let currentBeatMeta: Partial<Beat> = {};

  function flushBeat() {
    if (!currentAct || currentBeatLines.length === 0) return;
    const raw = currentBeatLines.join('\n').trim();
    if (!raw) return;

    // Extract fields from markdown blocks
    const actMatch     = raw.match(/\*\*Act:\*\*\s*(.+)/i);
    const tpMatch      = raw.match(/\*\*Turning point:\*\*\s*(.+)/i);
    const sceneMatch   = raw.match(/\*\*Scene:\*\*\s*(.+)/i);
    const nameMatch    = raw.match(/^#{1,3}\s+Beat\s+\d+[:\s]+(.+)/i);
    const descMatch    = raw.match(/\*\*What happens:\*\*\s*([\s\S]*?)(?=\*\*|$)/i);
    const spMatch      = raw.match(/\*\*Structural purpose:\*\*\s*(.+)/i);
    const psMatch     = raw.match(/\*\*Protagonist state:\*\*\s*(.+)/i);
    const esMatch     = raw.match(/\*\*Emotional shift:\*\*\s*(.+)/i);

    const beat: Beat = {
      id:               currentBeatMeta.id || String(currentAct.beats.length + 1),
      name:             nameMatch ? nameMatch[1].trim() : `Beat ${currentAct.beats.length + 1}`,
      act:              actMatch ? actMatch[1].trim() : currentAct.name,
      turningPoint:     tpMatch ? !/no/i.test(tpMatch[1]) : false,
      turningPointLabel: tpMatch ? tpMatch[1].trim() : 'No',
      scene:            sceneMatch ? sceneMatch[1].trim() : '',
      description:       descMatch ? descMatch[1].trim() : raw,
      structuralPurpose: spMatch ? spMatch[1].trim() : '',
      protagonistState:  psMatch ? psMatch[1].trim() : '',
      emotionalShift:    esMatch ? esMatch[1].trim() : '',
      raw,
    };
    currentAct.beats.push(beat);
    currentBeatLines = [];
    currentBeatMeta = {};
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Act header: ## Act One, ## Act TwoA, etc.
    const actMatch = trimmed.match(/^##\s+Act\s+(\w+[\w\s]*)$/i);
    if (actMatch) {
      flushBeat();
      if (currentAct) acts.push(currentAct);
      currentAct = { name: `Act ${actMatch[1]}`, beats: [] };
      continue;
    }

    // Beat header: ## Beat 1: Name, ### Beat 2: Name
    const beatMatch = trimmed.match(/^#{1,3}\s+Beat\s+(\d+)[:\s]+\s*(.+)/i);
    if (beatMatch) {
      flushBeat(); // flush previous beat before starting new one
      currentBeatMeta = { id: beatMatch[1], name: beatMatch[2].trim() };
      currentBeatLines = [line];
      continue;
    }

    if (currentBeatLines.length > 0 || Object.keys(currentBeatMeta).length > 0) {
      // Bug 1 fix: accumulate beat content after header
      currentBeatLines.push(line);
    }
  }

  flushBeat();
  if (currentAct) acts.push(currentAct);
  return acts;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'done':    return <Badge variant="default"   className="bg-green-600 text-xs gap-1"><CheckCircle2 className="h-3 w-3"/>Done</Badge>;
    case 'running': return <Badge variant="default"   className="bg-blue-600 text-xs gap-1 animate-pulse"><Loader2 className="h-3 w-3 animate-spin"/>Running</Badge>;
    case 'failed':  return <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="h-3 w-3"/>Failed</Badge>;
    case 'queued':  return <Badge variant="secondary"  className="text-xs gap-1"><Loader2 className="h-3 w-3"/>Queued</Badge>;
    default:        return <Badge variant="outline"   className="text-xs">{status || 'idle'}</Badge>;
  }
}

function BeatRow({ beat, onRewrite, status }: { beat: Beat; onRewrite: () => void; status: string }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded hover:bg-muted/50 transition-colors group">
      <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{beat.id}.</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{beat.name}</span>
          {beat.turningPoint && (
            <Badge variant="destructive" className="text-[10px] px-1 py-0">
              {beat.turningPointLabel}
            </Badge>
          )}
        </div>
        {beat.scene && (
          <p className="text-xs text-muted-foreground truncate">{beat.scene}</p>
        )}
      </div>
      <StatusBadge status={status} />
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1 shrink-0"
        onClick={onRewrite}
        disabled={status === 'running' || status === 'queued'}
      >
        <RotateCcw className="h-3 w-3"/>
        Rewrite
      </Button>
    </div>
  );
}

function RewriteModal({
  beat,
  projectId,
  documentId,
  versionId,
  approvedNotes,
  onClose,
  onDone,
}: {
  beat: Beat;
  projectId: string;
  documentId: string;
  versionId: string;
  approvedNotes: any[];
  onClose: () => void;
  onDone: (newVersionId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [upstreamContext, setUpstreamContext] = useState<string>('');
  const [loadingContext, setLoadingContext] = useState(true);
  const [error, setError] = useState<string>('');

  // Fetch upstream context: Story Outline scene + Character Bible
  useEffect(() => {
    async function loadContext() {
      if (!beat.scene) {
        setLoadingContext(false);
        return;
      }
      try {
        // Find Story Outline document
        const { data: soDoc } = await supabase
          .from('project_documents')
          .select('id')
          .eq('project_id', projectId)
          .eq('doc_type', 'story_outline')
          .maybeSingle();

        let context = '';
        if (soDoc) {
          const { data: soVersion } = await supabase
            .from('project_document_versions')
            .select('plaintext')
            .eq('document_id', soDoc.id)
            .eq('is_current', true)
            .maybeSingle();
          if (soVersion?.plaintext) {
            // Find the scene matching beat.scene
            const sceneMatch = soVersion.plaintext.match(
              new RegExp(`(##\\s+Scene\\s+\\d+.*?)(?=##\\s+Scene\\s+\\d+|$)`, 'i')
            );
            context = sceneMatch ? sceneMatch[1] : soVersion.plaintext.slice(0, 800);
          }
        }
        setUpstreamContext(context || '(No Story Outline context available)');
      } catch {
        setUpstreamContext('(Could not load upstream context)');
      } finally {
        setLoadingContext(false);
      }
    }
    loadContext();
  }, [beat.scene, projectId, supabase]);

  const handleRewrite = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const resp = await fetch(`/api/supabase-proxy/functions/v1/dev-engine-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: 'beat-rewrite',
          projectId,
          documentId,
          versionId,
          beatId: beat.id,
          approvedNotes: approvedNotes.filter(n => !beat.id || String(n.target_beat_id) === String(beat.id)),
          protectItems: [],
        }),
      });
      const result = await resp.json();
      if (!resp.ok || result.error) throw new Error(result.error || 'Beat rewrite failed');
      toast.success('Beat rewritten successfully');
      onDone(result.versionId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Rewrite failed');
    } finally {
      setLoading(false);
    }
  };

  // Filter notes that target this specific beat
  const beatNotes = approvedNotes.filter(n => !n.target_beat_id || String(n.target_beat_id) === String(beat.id));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Rewrite Beat {beat.id}: {beat.name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          {/* Beat content */}
          <div className="flex flex-col gap-2 min-h-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{beat.act}</Badge>
              {beat.turningPoint && (
                <Badge variant="destructive" className="text-xs">{beat.turningPointLabel}</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{beat.scene}</div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2 pr-2">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Description</div>
                  <p className="text-xs leading-relaxed">{beat.description}</p>
                </div>
                {beat.structuralPurpose && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Structural Purpose</div>
                    <p className="text-xs leading-relaxed">{beat.structuralPurpose}</p>
                  </div>
                )}
                {beat.protagonistState && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Protagonist State</div>
                    <p className="text-xs leading-relaxed">{beat.protagonistState}</p>
                  </div>
                )}
                {beat.emotionalShift && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Emotional Shift</div>
                    <p className="text-xs leading-relaxed">{beat.emotionalShift}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Upstream context */}
          <div className="flex flex-col gap-2 min-h-0 border-l pl-3">
            <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground shrink-0">
              <Info className="h-3 w-3"/>Story Outline Context
            </div>
            {loadingContext ? (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground"/>
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0">
                <pre className="text-xs whitespace-pre-wrap leading-relaxed pr-2">
                  {upstreamContext}
                </pre>
              </ScrollArea>
            )}

            {beatNotes.length > 0 && (
              <div className="border-t pt-2 mt-auto shrink-0">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Notes for this beat</div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {beatNotes.map((note: any, i: number) => (
                    <div key={i} className="text-xs bg-muted/50 rounded p-1.5">
                      <span className="font-medium">{note.category}: </span>
                      {note.note || note.description}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 rounded p-2">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleRewrite}
            disabled={loading}
            className="gap-1"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin"/> : <RotateCcw className="h-3 w-3"/>}
            Rewrite Beat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function BeatRewritePanel({
  projectId, documentId, versionId, version, approvedNotes, protectItems, onComplete, onApplyAllStart, onApplyAllDone,
}: BeatRewritePanelProps) {
  const [expandedActs, setExpandedActs] = useState<Set<string>>(new Set());
  const [rewriteTarget, setRewriteTarget] = useState<Beat | null>(null);
  const [beatStatuses, setBeatStatuses] = useState<Record<string, string>>({});
  const [rewriteDoneVersion, setRewriteDoneVersion] = useState<string | null>(null);
  const [batchRewriteActive, setBatchRewriteActive] = useState(false);

  const plaintext = version?.plaintext || '';
  const acts = useMemo(() => parseBeatSheet(plaintext), [plaintext]);

  // Auto-expand all acts on mount
  useEffect(() => {
    setExpandedActs(new Set(acts.map(a => a.name)));
  }, [acts]);

  const toggleAct = (actName: string) => {
    setExpandedActs(prev => {
      const next = new Set(prev);
      if (next.has(actName)) next.delete(actName);
      else next.add(actName);
      return next;
    });
  };

  const totalBeats = acts.reduce((sum, act) => sum + act.beats.length, 0);

  const handleRewriteDone = (newVersionId: string) => {
    setBeatStatuses({});
    setRewriteDoneVersion(newVersionId);
    onComplete?.(newVersionId);
  };

  const handleApplyAll = async () => {
    const allBeats = acts.flatMap(a => a.beats);
    if (allBeats.length === 0) return;
    onApplyAllStart?.();
    setBatchRewriteActive(true);
    setBeatStatuses(Object.fromEntries(allBeats.map(b => [b.id, 'queued'])));

    let latestVid = versionId;
    for (const beat of allBeats) {
      setBeatStatuses(prev => ({ ...prev, [beat.id]: 'running' }));
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const resp = await fetch(`/api/supabase-proxy/functions/v1/dev-engine-v2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            action: 'beat-rewrite',
            projectId,
            documentId,
            versionId: latestVid,
            beatId: beat.id,
            approvedNotes: approvedNotes.filter(n => !n.target_beat_id || String(n.target_beat_id) === String(beat.id)),
            protectItems: protectItems || [],
          }),
        });
        const result = await resp.json();
        if (result.success && result.versionId) {
          latestVid = result.versionId;
          setBeatStatuses(prev => ({ ...prev, [beat.id]: 'done' }));
        } else {
          setBeatStatuses(prev => ({ ...prev, [beat.id]: 'failed' }));
        }
      } catch {
        setBeatStatuses(prev => ({ ...prev, [beat.id]: 'failed' }));
      }
    }

    setBatchRewriteActive(false);
    onApplyAllDone?.();
    if (latestVid !== versionId) onComplete?.(latestVid);
  };

  if (!plaintext) {
    return (
      <Card className="m-4">
        <CardContent className="p-4 text-sm text-muted-foreground">
          No beat sheet content available.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Beat Sheet</h3>
          <p className="text-xs text-muted-foreground">{totalBeats} beats across {acts.length} acts</p>
          <Button
            size="sm"
            variant="default"
            className="mt-2 w-full gap-1.5"
            onClick={handleApplyAll}
            disabled={batchRewriteActive || acts.length === 0}
          >
            {batchRewriteActive
              ? <Loader2 className="h-3 w-3 animate-spin"/>
              : <Sparkles className="h-3 w-3"/>}
            {batchRewriteActive ? `Processing ${totalBeats} beats...` : 'Apply All Notes & Decisions'}
          </Button>
        </div>
        {rewriteDoneVersion && (
          <Badge variant="default" className="bg-green-600 gap-1 text-xs">
            <CheckCircle2 className="h-3 w-3"/>New version created
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="p-2">
          {acts.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No acts found in beat sheet.</p>
          ) : (
            acts.map(act => (
              <div key={act.name}>
                {/* Act header */}
                <button
                  className="flex items-center gap-1 w-full px-2 py-1.5 hover:bg-muted/50 rounded text-left transition-colors"
                  onClick={() => toggleAct(act.name)}
                >
                  {expandedActs.has(act.name)
                    ? <ChevronDown className="h-3 w-3 shrink-0 transition-transform rotate-90"/>
                    : <ChevronRight className="h-3 w-3 shrink-0 transition-transform"/>}
                  <span className="text-xs font-semibold uppercase tracking-wide">{act.name}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{act.beats.length} beats</Badge>
                </button>

                {/* Beats under this act */}
                {expandedActs.has(act.name) && (
                  <div className="ml-4 border-l pl-2 space-y-0.5">
                    {act.beats.map(beat => (
                      <BeatRow
                        key={beat.id}
                        beat={beat}
                        status={beatStatuses[beat.id] || 'idle'}
                        onRewrite={() => setRewriteTarget(beat)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Rewrite modal */}
      {rewriteTarget && (
        <RewriteModal
          beat={rewriteTarget}
          projectId={projectId}
          documentId={documentId}
          versionId={versionId}
          approvedNotes={approvedNotes}
          onClose={() => setRewriteTarget(null)}
          onDone={handleRewriteDone}
        />
      )}
    </div>
  );
}
// BEATRWP INCLUDED
