import { useState, useCallback, useEffect } from 'react';
import { isOutputDocType } from '@/config/documentLadders';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DeliverableType, DevelopmentBehavior, ConvergenceStatus } from '@/lib/dev-os-config';
import { computeConvergenceStatus } from '@/lib/dev-os-config';
import { invalidateDevEngine } from '@/lib/invalidateDevEngine';
import { finalizeDevEngineOperation } from '@/lib/finalizeDevEngineOperation';
import { useDocumentRuntimeBinding } from '@/lib/versionBinding/useDocumentRuntimeBinding';
import type { ResolverVersion } from '@/lib/versionBinding/documentRuntimeBindingResolver';

// ── Types ──

export interface DevDocument {
  id: string;
  project_id: string;
  title: string;
  doc_type: string;
  source: string;
  file_name: string;
  file_path: string;
  plaintext: string | null;
  extracted_text: string | null;
  created_at: string;
}

export interface DevVersion {
  id: string;
  document_id: string;
  version_number: number;
  label: string | null;
  plaintext: string;
  created_by: string;
  created_at: string;
  parent_version_id: string | null;
  change_summary: string | null;
  approval_status: string;
}

export interface DevRun {
  id: string;
  project_id: string;
  document_id: string;
  version_id: string;
  run_type: string;
  production_type: string;
  strategic_priority: string;
  development_stage: string;
  analysis_mode: string;
  output_json: any;
  created_at: string;
}

export interface ConvergencePoint {
  id: string;
  creative_score: number;
  greenlight_score: number;
  gap: number;
  allowed_gap: number;
  convergence_status: string;
  trajectory: string | null;
  created_at: string;
}

export interface DriftEvent {
  id: string;
  project_id: string;
  document_version_id: string;
  drift_level: 'none' | 'moderate' | 'major';
  drift_items: Array<{ field: string; similarity: number; inherited: string; current: string }>;
  acknowledged: boolean;
  resolved: boolean;
  resolution_type: string | null;
  created_at: string;
}

// ── API helper ──

// Concurrency limiter — prevents Chrome 6-connection-per-host exhaustion
// when 20+ hooks call dev-engine-v2 simultaneously on page load.
const ENGINE_V2_MAX_CONCURRENT = 3;
let engineV2InFlight = 0;
const engineV2Queue: (() => void)[] = [];

// Polling pause flag — set when ERR_INSUFFICIENT_RESOURCES is detected
// to stop aggressive polling until the next explicit user action.
let engineV2PollingPaused = false;
export function resumeEngineV2Polling() { engineV2PollingPaused = false; }
export function isEngineV2PollingPaused() { return engineV2PollingPaused; }

// Poll interval — returns false (stop polling) when resource exhaustion is detected
function pollInterval(): number | false { return engineV2PollingPaused ? false : 10_000; }

// Single-flight guard — prevents duplicate in-flight calls for the same
// (action, documentId, versionId) tuple. When the same request is already
// in-flight, subsequent attempts are silently blocked with an IEL warning.
const inFlightCalls = new Map<string, Promise<any>>();

function makeFlightKey(action: string, extra: Record<string, any>): string {
  // Include projectId to scope per-project
  const docId = extra.documentId || extra.document_id || '';
  const verId = extra.versionId || extra.version_id || '';
  return `${action}:${docId}:${verId}`;
}

async function acquireEngineV2Slot(): Promise<void> {
  if (engineV2InFlight < ENGINE_V2_MAX_CONCURRENT) { engineV2InFlight++; return; }
  return new Promise<void>(r => engineV2Queue.push(() => { engineV2InFlight++; r(); }));
}
function releaseEngineV2Slot(): void {
  engineV2InFlight--;
  const next = engineV2Queue.shift();
  if (next) next();
}

export async function callEngineV2(action: string, extra: Record<string, any> = {}) {
  // ── Single-flight guard ─────────────────────────────────────────
  // Prevent duplicate in-flight calls for the same (action, docId, verId)
  const flightKey = makeFlightKey(action, extra);
  const existing = inFlightCalls.get(flightKey);
  if (existing) {
    console.warn(
      `[dev-engine-v2][IEL] dev_engine_v2_mutation_blocked_duplicate { action: "${action}", flight_key: "${flightKey}" }`,
    );
    console.log(`[FINALIZE] duplicate_mutation_blocked action="${action}" — returning existing promise`);
    return existing;
  }

  // Create the promise and register it before actual work starts
  const promise = (async () => {
  await acquireEngineV2Slot();
  try {
    const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const resp = await fetch(`https://hdfderbphdobomkdjypc.supabase.co/functions/v1/dev-engine-v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...extra }),
  });

  // ── IEL: Hardened JSON boundary — never pass HTML/non-JSON to .json() ──
  const contentType = resp.headers.get('content-type') || '';
  const raw = await resp.text();
  let result: any;

  if (!contentType.includes('application/json')) {
    const isHtml = raw.trimStart().startsWith('<!') || raw.includes('<html');
    const errorCode = isHtml ? 'HTML_RESPONSE' : 'NON_JSON_RESPONSE';
    console.error(`[dev-engine-v2][IEL] non_json_response_detected { status: ${resp.status}, content_type: "${contentType}", action: "${action}", error_code: "${errorCode}" }`);
    if (resp.status === 502 || resp.status === 504) {
      throw new Error('The backend service timed out. Please try again in a moment.');
    }
    throw new Error(`Unexpected response from engine (${resp.status}). Please retry.`);
  }

  try {
    result = JSON.parse(raw);
  } catch {
    console.error(`[dev-engine-v2][IEL] json_parse_failed { status: ${resp.status}, action: "${action}", body_prefix: "${raw.slice(0, 200)}" }`);
    throw new Error('Engine returned malformed data. Please retry.');
  }

  if (resp.status === 401) throw new Error('AI authentication failed — API key may be expired. Please check your workspace settings or contact support.');
  if (resp.status === 402) throw new Error('AI credits exhausted. Please add funds to your workspace under Settings → Usage.');
  if (resp.status === 429) throw new Error('Rate limit reached. Please try again in a moment.');
  if (!resp.ok) {
    // Surface needsPipeline so callers can detect and redirect to chunked pipeline
    if (result.needsPipeline) {
      const errMsg = typeof result?.error === 'string' ? result.error : 'Document too long for single-pass rewrite';
      const err = new Error(errMsg);
      (err as any).needsPipeline = true;
      (err as any).charCount = result.charCount;
      throw err;
    }
    const errMsg = typeof result?.error === 'string' ? result.error : 'Engine error';
    // Detect resource exhaustion and pause polling
    if (errMsg.includes('ERR_INSUFFICIENT_RESOURCES') || errMsg.includes('insufficient resources')) {
      engineV2PollingPaused = true;
      console.warn(`[dev-engine-v2][IEL] polling_paused resource_exhausted { action: \"${action}\" }`);
    }
    throw new Error(errMsg);
  }
  // Stale version — surface as a user-friendly error rather than a blank screen
  if (result.stale_version) throw new Error('The selected version no longer exists. Please re-select your document and try again.');
  return result;
  } finally {
    releaseEngineV2Slot();
  }
  })();

  // Register the in-flight promise and remove when done
  inFlightCalls.set(flightKey, promise);
  promise.finally(() => inFlightCalls.delete(flightKey)).catch(() => {});
  return promise;
}

// ── Hook ──

export function useDevEngineV2(projectId: string | undefined) {
  const qc = useQueryClient();

  // Documents for project
  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ['dev-v2-docs', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('project_documents')
        .select('id, project_id, title, doc_type, source, file_name, file_path, plaintext, extracted_text, created_at, doc_role')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // ⚠️ TRIPWIRE: Output docs (market_sheet, visual_project_bible, vertical_market_sheet,
      // deck, trailer_script) are NON-LADDER but MUST remain visible in Documents tray.
      // Do NOT reintroduce a doc_role-only gate that would exclude them.
      // Canonical authority: isOutputDocType() from @/config/documentLadders
      const SEED_PACK_TYPES = new Set(['project_overview', 'creative_brief', 'market_positioning', 'canon', 'nec']);
      const allDocs = (data || []) as DevDocument[];
      return allDocs.filter(d => {
        if (SEED_PACK_TYPES.has(d.doc_type)) return true;
        // Canonical output docs always pass — they are non-ladder but tray-visible
        if (isOutputDocType(d.doc_type)) return true;
        const role = (d as any).doc_role || 'creative_primary';
        return ['creative_primary', 'creative_supporting', 'derived_output'].includes(role);
      });
    },
    enabled: !!projectId,
    refetchInterval: pollInterval,
  });

  // Approved version map: doc_id -> version_id (one approved per doc)
  const { data: approvedVersionMap = {} } = useQuery({
    queryKey: ['dev-v2-approved', projectId],
    queryFn: async () => {
      if (!projectId) return {};
      const docIds = documents.map(d => d.id);
      if (docIds.length === 0) return {};
      const { data, error } = await (supabase as any)
        .from('project_document_versions')
        .select('id, document_id, created_at')
        .in('document_id', docIds)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const v of data || []) {
        map[v.document_id] = v.id;
      }
      return map;
    },
    enabled: !!projectId && documents.length > 0,
    refetchInterval: pollInterval,
  });

  // Versions for selected document
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const { data: versions = [], isLoading: versionsLoading } = useQuery({
    queryKey: ['dev-v2-versions', selectedDocId],
    queryFn: async () => {
      if (!selectedDocId) return [];
      const { data, error } = await (supabase as any)
        .from('project_document_versions')
        .select('*')
        .eq('document_id', selectedDocId)
        .order('version_number', { ascending: true });
      if (error) throw error;
      const rows = (data || []) as DevVersion[];
      return rows;
    },
    enabled: !!selectedDocId,
    staleTime: 0,
    refetchInterval: pollInterval,
  });

  // Runs for selected version
  const { data: runs = [] } = useQuery({
    queryKey: ['dev-v2-runs', selectedVersionId],
    queryFn: async () => {
      if (!selectedVersionId) return [];
      const { data, error } = await (supabase as any)
        .from('development_runs')
        .select('*')
        .eq('version_id', selectedVersionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as DevRun[];
    },
    enabled: !!selectedVersionId,
    refetchInterval: pollInterval,
  });

  // All runs for document (for history across versions)
  const { data: allDocRuns = [] } = useQuery({
    queryKey: ['dev-v2-doc-runs', selectedDocId],
    queryFn: async () => {
      if (!selectedDocId) return [];
      const { data, error } = await (supabase as any)
        .from('development_runs')
        .select('*')
        .eq('document_id', selectedDocId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as DevRun[];
    },
    enabled: !!selectedDocId,
    refetchInterval: pollInterval,
  });

  // Convergence history — scoped to selected version when available, else document
  const { data: convergenceHistory = [] } = useQuery({
    queryKey: ['dev-v2-convergence', selectedDocId, selectedVersionId],
    queryFn: async () => {
      if (!selectedDocId) return [];
      let query = (supabase as any)
        .from('dev_engine_convergence_history')
        .select('*')
        .eq('document_id', selectedDocId);
      if (selectedVersionId) {
        query = query.eq('version_id', selectedVersionId);
      }
      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as ConvergencePoint[];
    },
    enabled: !!selectedDocId,
    refetchInterval: pollInterval,
  });

  // ── Stage Readiness (SR) — latest CONVERGENCE run for selected version ──
  // convergence-engine writes run_type='CONVERGENCE' to development_runs with stage_readiness in output_json.
  // This is the canonical SR source. Do NOT compute SR in dev-engine-v2 or frontend.
  const { data: convergenceRuns = [] } = useQuery({
    queryKey: ['dev-v2-sr-convergence', selectedVersionId],
    queryFn: async () => {
      if (!selectedVersionId) return [];
      const { data, error } = await (supabase as any)
        .from('development_runs')
        .select('*')
        .eq('version_id', selectedVersionId)
        .eq('run_type', 'CONVERGENCE')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedVersionId,
    refetchInterval: pollInterval,
  });

  const latestConvergence = convergenceRuns[0]?.output_json || null;

  // Drift events for selected version
  const { data: driftEvents = [], refetch: refetchDrift } = useQuery({
    queryKey: ['dev-v2-drift', selectedVersionId],
    queryFn: async () => {
      if (!selectedVersionId) return [];
      const { data, error } = await (supabase as any)
        .from('document_drift_events')
        .select('*')
        .eq('document_version_id', selectedVersionId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DriftEvent[];
    },
    enabled: !!selectedVersionId,
    refetchInterval: pollInterval,
  });

  const latestDrift = driftEvents.length > 0 ? driftEvents[0] : null;

  /**
   * Targeted invalidation for dev-engine-v2 mutations.
   * Was: blanket predicate-based invalidateDevEngine with deep:true
   * which triggered ALL dev-v2-* queries to refetch on every mutation.
   * Now: only invalidates the specific keys affected by each operation,
   * preventing cascading refetches that can trigger repeat mutations.
   */
  function invalidateAll(action?: string, docId?: string | null, versionId?: string | null) {
    const dId = docId ?? selectedDocId;
    const vId = versionId ?? selectedVersionId;

    switch (action) {
      case 'analyze':
      case 'notes':
        // Analysis/notes affect runs, convergence — NOT versions or docs
        if (vId) qc.invalidateQueries({ queryKey: ['dev-v2-runs', vId] });
        if (dId) qc.invalidateQueries({ queryKey: ['dev-v2-doc-runs', dId] });
        qc.invalidateQueries({ queryKey: ['dev-v2-convergence', dId, vId] });
        // Do NOT invalidate dev-v2-versions — analysis doesn't change version data
        // Invalidate notes and decision display panels so they refresh after generation
        qc.invalidateQueries({ queryKey: ['project-notes', projectId] });
        qc.invalidateQueries({ queryKey: ['decisions', projectId] });
        qc.invalidateQueries({ queryKey: ['decision-events', projectId] });
        break;

      case 'rewrite':
        // Rewrite creates new versions
        if (dId) qc.invalidateQueries({ queryKey: ['dev-v2-versions', dId] });
        if (vId) qc.invalidateQueries({ queryKey: ['dev-v2-runs', vId] });
        qc.invalidateQueries({ queryKey: ['dev-v2-convergence', dId, vId] });
        // Rewrites can resolve notes and decisions — refresh display panels
        qc.invalidateQueries({ queryKey: ['project-notes', projectId] });
        qc.invalidateQueries({ queryKey: ['decisions', projectId] });
        qc.invalidateQueries({ queryKey: ['decision-events', projectId] });
        break;

      case 'convert':
        // Convert creates new documents + versions
        qc.invalidateQueries({ queryKey: ['dev-v2-docs', projectId] });
        if (dId) qc.invalidateQueries({ queryKey: ['dev-v2-versions', dId] });
        if (vId) qc.invalidateQueries({ queryKey: ['dev-v2-runs', vId] });
        break;

      case 'create-paste':
        // Create-paste adds a new document + version
        qc.invalidateQueries({ queryKey: ['dev-v2-docs', projectId] });
        if (dId) qc.invalidateQueries({ queryKey: ['dev-v2-versions', dId] });
        break;

      case 'beat-sheet-to-script':
        qc.invalidateQueries({ queryKey: ['dev-v2-docs', projectId] });
        if (dId) qc.invalidateQueries({ queryKey: ['dev-v2-versions', dId] });
        if (vId) qc.invalidateQueries({ queryKey: ['dev-v2-runs', vId] });
        break;

      case 'drift-acknowledge':
      case 'drift-resolve':
        if (vId) qc.invalidateQueries({ queryKey: ['dev-v2-drift', vId] });
        if (vId) qc.invalidateQueries({ queryKey: ['dev-v2-runs', vId] });
        break;

      case 'delete-version':
        if (dId) qc.invalidateQueries({ queryKey: ['dev-v2-versions', dId] });
        break;

      case 'delete-document':
        qc.invalidateQueries({ queryKey: ['dev-v2-docs', projectId] });
        break;

      default:
        // Fallback: minimal invalidation for unclassified actions
        if (vId) qc.invalidateQueries({ queryKey: ['dev-v2-runs', vId] });
        if (dId) qc.invalidateQueries({ queryKey: ['dev-v2-versions', dId] });
        break;
    }

    // Always invalidate seed-pack if projectId is available
    qc.invalidateQueries({ queryKey: ['seed-pack-versions', projectId] });
  }

  // Select document → auto-select latest version
  const selectDocument = useCallback((docId: string) => {
    setSelectedDocId(docId);
    setSelectedVersionId(null);
  }, []);

  // ── Mutations ──

  // Resolve versionId at call time: prefer explicit selection, fall back to latest version from DB
  // If no version exists at all, auto-create one from the document's extracted_text/plaintext
  async function resolveVersionId() {
    if (selectedVersionId) return selectedVersionId;
    if (versions.length > 0) return versions[versions.length - 1].id;
    // If versions haven't loaded yet, fetch directly
    if (selectedDocId) {
      const { data } = await (supabase as any)
        .from('project_document_versions')
        .select('id')
        .eq('document_id', selectedDocId)
        .order('version_number', { ascending: false })
        .limit(1);
      if (data && data.length > 0) return data[0].id as string;

      // No versions exist — auto-create v1 from document text
      const doc = documents.find(d => d.id === selectedDocId);
      const text = doc?.extracted_text || doc?.plaintext || '';
      if (!text) return null;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: newVersion, error } = await (supabase as any)
        .from('project_document_versions')
        .insert({
          document_id: selectedDocId,
          version_number: 1,
          label: 'v1 (auto)',
          plaintext: text,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error || !newVersion) return null;
      setSelectedVersionId(newVersion.id);
      qc.invalidateQueries({ queryKey: ['dev-v2-versions', selectedDocId] });
      return newVersion.id as string;
    }
    return null;
  }

  const analyze = useMutation({
    retry: false,
    mutationFn: async (params: { productionType?: string; strategicPriority?: string; developmentStage?: string; analysisMode?: string; previousVersionId?: string; deliverableType?: DeliverableType; developmentBehavior?: DevelopmentBehavior; format?: string; episodeTargetDurationSeconds?: number; episode_target_duration_min_seconds?: number; episode_target_duration_max_seconds?: number; maxContextChars?: number; includeDocumentIds?: string[] }) => {
      if (!selectedDocId || !documents.find(d => d.id === selectedDocId)) throw new Error('Document not found — please select a valid document');
      // Re-verify document still exists in DB (guards against stale cache after deletion)
      const { data: docCheck } = await (supabase as any).from('project_documents').select('id').eq('id', selectedDocId).maybeSingle();
      if (!docCheck) throw new Error('Document no longer exists — it may have been deleted');
      const vid = await resolveVersionId();
      if (!vid) throw new Error('No version found — please select a document first');
      return callEngineV2('analyze', { projectId, documentId: selectedDocId, versionId: vid, ...params });
    },
    onSuccess: (data) => {
      setIsRefreshing(true);
      finalizeDevEngineOperation({
        qc, projectId,
        currentDocId: selectedDocId,
        setSelectedDocId: selectDocument,
        setSelectedVersionId,
        onComplete: () => setIsRefreshing(false),
        result: {
          success: true,
          projectId: projectId!,
          documentId: selectedDocId!,
          documentType: selectedDocType!,
          versionId: selectedVersionId,
          status: 'completed',
          operationType: 'analyze',
          updatedAt: data?.run?.created_at || new Date().toISOString(),
        },
      });
    },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  const generateNotes = useMutation({
    retry: false,
    mutationFn: async (analysisJson?: any) => {
      const vid = await resolveVersionId();
      return callEngineV2('notes', { projectId, documentId: selectedDocId, versionId: vid, analysisJson });
    },
    onSuccess: (data) => {
      setIsRefreshing(true);
      finalizeDevEngineOperation({
        qc, projectId,
        currentDocId: selectedDocId,
        setSelectedDocId: selectDocument,
        setSelectedVersionId,
        onComplete: () => setIsRefreshing(false),
        result: {
          success: true,
          projectId: projectId!,
          documentId: selectedDocId!,
          documentType: selectedDocType!,
          versionId: selectedVersionId,
          status: 'completed',
          operationType: 'notes',
          updatedAt: data?.run?.created_at || new Date().toISOString(),
        },
        toastMessage: 'Notes generated',
      });
    },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  const rewrite = useMutation({
    retry: false,
    mutationFn: async (params: { approvedNotes: any[]; protectItems?: string[]; targetDocType?: string; deliverableType?: string; developmentBehavior?: string; format?: string; selectedOptions?: any[]; globalDirections?: any[] }) => {
      const vid = await resolveVersionId();
      return callEngineV2('rewrite', { projectId, documentId: selectedDocId, versionId: vid, ...params });
    },
    onSuccess: (data) => {
      setIsRefreshing(true);
      // Optimistic cache update for immediate version list freshness
      if (data.newVersion) {
        qc.setQueryData(['dev-v2-versions', selectedDocId], (old: any) => {
          if (!Array.isArray(old)) return old;
          const exists = old.some((v: any) => v.id === data.newVersion.id);
          if (exists) return old;
          return [...old, data.newVersion];
        });
      }
      finalizeDevEngineOperation({
        qc, projectId,
        currentDocId: selectedDocId,
        setSelectedDocId: selectDocument,
        setSelectedVersionId,
        onComplete: () => setIsRefreshing(false),
        result: {
          success: true,
          projectId: projectId!,
          documentId: selectedDocId!,
          documentType: selectedDocType!,
          versionId: data.newVersion?.id,
          status: 'completed',
          operationType: 'rewrite',
          updatedAt: data.newVersion?.created_at || new Date().toISOString(),
        },
      });
    },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  const convert = useMutation({
    retry: false,
    mutationFn: async (params: { targetOutput: string; protectItems?: string[] }) => {
      const vid = await resolveVersionId();
      return callEngineV2('convert', { projectId, documentId: selectedDocId, versionId: vid, ...params });
    },
    onSuccess: (data) => {
      setIsRefreshing(true);
      if (data.newDoc) {
        selectDocument(data.newDoc.id);
      }
      finalizeDevEngineOperation({
        qc, projectId,
        currentDocId: selectedDocId,
        setSelectedDocId: selectDocument,
        setSelectedVersionId,
        onComplete: () => setIsRefreshing(false),
        result: {
          success: true,
          projectId: projectId!,
          documentId: data.newDoc?.id ?? selectedDocId!,
          documentType: data.newDoc?.doc_type ?? selectedDocType!,
          versionId: data.newVersion?.id,
          status: 'completed',
          operationType: 'convert',
          updatedAt: data.newVersion?.created_at || new Date().toISOString(),
        },
        toastMessage: `Converted to ${data.newDoc?.doc_type || 'new format'}`,
      });
    },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  const beatSheetToScript = useMutation({
    retry: false,
    mutationFn: async (params: { episodeNumber: number; seasonEpisodeCount?: number }) => {
      const vid = await resolveVersionId();
      if (!vid) throw new Error('No version found — select a document first');
      return callEngineV2('beat-sheet-to-script', { projectId, documentId: selectedDocId, versionId: vid, ...params });
    },
    onSuccess: (data) => {
      setIsRefreshing(true);
      const status = data.script_format_validation?.status;
      const regenAttempted = data.script_format_validation?.regen_attempted;
      let toastMsg: string | null = null;
      if (status === 'SCRIPT_FORMAT_INVALID' && regenAttempted) {
        toastMsg = `Episode ${data.episode_number} script generated — auto-regen attempted but format still needs review`;
      } else if (status === 'SCRIPT_FORMAT_INVALID') {
        toastMsg = `Episode ${data.episode_number} generated but needs rewrite — format validation failed`;
      } else if (regenAttempted) {
        toastMsg = `Episode ${data.episode_number} script created (auto-corrected on first pass)`;
      } else {
        toastMsg = `Episode ${data.episode_number} script created`;
      }
      if (data.newDoc) {
        selectDocument(data.newDoc.id);
      }
      finalizeDevEngineOperation({
        qc, projectId,
        currentDocId: selectedDocId,
        setSelectedDocId: selectDocument,
        setSelectedVersionId,
        onComplete: () => setIsRefreshing(false),
        result: {
          success: true,
          projectId: projectId!,
          documentId: data.newDoc?.id ?? selectedDocId!,
          documentType: selectedDocType!,
          versionId: data.newVersion?.id,
          status: 'completed',
          operationType: 'beat-sheet-to-script',
          updatedAt: data.newVersion?.created_at || new Date().toISOString(),
        },
        toastMessage: toastMsg,
      });
    },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  const createPaste = useMutation({
    retry: false,
    mutationFn: (params: { title: string; docType: string; text: string }) =>
      callEngineV2('create-paste', { projectId, ...params }),
    onSuccess: (data) => {
      setIsRefreshing(true);
      if (data.document) {
        selectDocument(data.document.id);
      }
      finalizeDevEngineOperation({
        qc, projectId,
        currentDocId: selectedDocId,
        setSelectedDocId: selectDocument,
        setSelectedVersionId,
        onComplete: () => setIsRefreshing(false),
        result: {
          success: true,
          projectId: projectId!,
          documentId: data.document?.id,
          documentType: data.document?.doc_type || 'other',
          versionId: data.version?.id,
          status: 'completed',
          operationType: 'create-paste',
          updatedAt: data.version?.created_at || new Date().toISOString(),
        },
        toastMessage: 'Document created',
      });
    },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  const deleteVersion = useMutation({
    retry: false,
    mutationFn: async (versionId: string) => {
      const { data, error } = await (supabase as any).rpc('safe_delete_version', {
        p_version_id: versionId,
      });
      if (error) throw error;
      return { deletedId: versionId, result: data };
    },
    onSuccess: ({ deletedId }) => {
      toast.success('Version deleted');
      if (selectedVersionId === deletedId) {
        const remaining = versions.filter(v => v.id !== deletedId);
        const next = remaining[remaining.length - 1] ?? null;
        setSelectedVersionId(next ? next.id : null);
      }
      invalidateAll('delete-version');
    },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  const deleteDocument = useMutation({
    retry: false,
    mutationFn: async (docId: string) => {
      if (selectedDocId === docId) {
        setSelectedDocId(null);
        setSelectedVersionId(null);
      }

      const { data: docVersions, error: versionsErr } = await (supabase as any)
        .from('project_document_versions')
        .select('id')
        .eq('document_id', docId);
      if (versionsErr) throw versionsErr;

      const versionIds = (docVersions || []).map((v: { id: string }) => v.id);

      await (supabase as any).from('development_runs').delete().eq('document_id', docId);
      await (supabase as any).from('dev_engine_convergence_history').delete().eq('document_id', docId);

      if (versionIds.length > 0) {
        const { error: chunksErr } = await (supabase as any)
          .from('project_document_chunks')
          .delete()
          .in('version_id', versionIds);
        if (chunksErr) throw chunksErr;
      }

      const { error: clearLatestErr } = await (supabase as any)
        .from('project_documents')
        .update({ latest_version_id: null })
        .eq('id', docId);
      if (clearLatestErr) throw clearLatestErr;

      const { error: deleteVersionsErr } = await (supabase as any)
        .from('project_document_versions')
        .delete()
        .eq('document_id', docId);
      if (deleteVersionsErr) throw deleteVersionsErr;

      const { error } = await (supabase as any).from('project_documents').delete().eq('id', docId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Document deleted');
      invalidateAll('delete-document');
    },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  // Drift resolution mutations
  const acknowledgeDrift = useMutation({
    retry: false,
    mutationFn: async (driftEventId: string) =>
      callEngineV2('drift-acknowledge', { driftEventId }),
    onSuccess: () => { toast.success('Drift acknowledged'); invalidateAll('drift-acknowledge'); },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  const resolveDrift = useMutation({
    retry: false,
    mutationFn: async (params: { driftEventId: string; resolutionType: 'accept_drift' | 'intentional_pivot' | 'reseed'; versionId?: string }) =>
      callEngineV2('drift-resolve', params),
    onSuccess: () => { toast.success('Drift resolved'); invalidateAll('drift-resolve'); refetchDrift(); },
    onError: (e: any) => toast.error(typeof e?.message === 'string' ? e.message : 'Operation failed'),
  });

  // Derived
  const selectedDoc = documents.find(d => d.id === selectedDocId) || null;
  const selectedDocType = selectedDoc?.doc_type || null;
  const selectedVersion = versions.find(v => v.id === selectedVersionId) || (versions.length > 0 ? versions[versions.length - 1] : null);

  // ── DocumentRuntimeBinding Resolver ──
  // Replaces manual currentVersion derivation, auto-select logic, and approvedVersionMap queries
  const {
    authoritativeVersionId,
    promotionGateVersionId,
    effectiveVersionId: bindingEffectiveVersionId,
    render,
    pipeline: pipelineBinding,
    assertEligible,
  } = useDocumentRuntimeBinding(selectedDocType, versions, selectedVersionId);

  // Derive the "current" version from render binding (prefers authoritative, fallback to selected, fallback to latest)
  const currentVersion = render?.versionId || null;

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-select version when versions load (uses render binding for consistent selection)
  useEffect(() => {
    if (selectedDocId && !selectedVersionId && render?.versionId) {
      setSelectedVersionId(render.versionId);
    }
  }, [selectedDocId, selectedVersionId, render?.versionId]);

  // Latest analysis for selected version
  const latestAnalysis = (runs ?? []).filter(r => r.run_type === 'ANALYZE').pop()?.output_json || null;
  // Notes: use allDocRuns filtered by version_id to get notes scoped to the selected version.
  // Without version_id filter, notes from other versions incorrectly appear/disappear.
  const latestNotes = (allDocRuns ?? []).filter(r =>
    r.run_type === 'NOTES' && r.version_id === selectedVersionId
  ).pop()?.output_json || null;

  const isLoading = analyze.isPending || generateNotes.isPending || rewrite.isPending || convert.isPending || createPaste.isPending || beatSheetToScript.isPending || isRefreshing;

  // Behavior-aware convergence
  const rewriteCount = (allDocRuns ?? []).filter(r => r.run_type === 'REWRITE').length;
  const currentBehavior: DevelopmentBehavior = (latestAnalysis?.development_behavior as DevelopmentBehavior) || 'market';

  const blockersRemaining = latestAnalysis?.convergence?.blockers_remaining ?? latestAnalysis?.blocking_issues?.length ?? null;

  const convergenceStatus: ConvergenceStatus = computeConvergenceStatus(
    latestAnalysis?.ci_score ?? null,
    latestAnalysis?.gp_score ?? null,
    latestAnalysis?.gap ?? null,
    latestAnalysis?.allowed_gap ?? 25,
    currentBehavior,
    rewriteCount,
    blockersRemaining,
  );

  const isConverged = convergenceStatus === 'Converged';

  // ── INSTRUMENTATION: Log version state on every render ──
  console.log(
    `[FINALIZE] hook render selectedVersionId="${selectedVersionId?.slice(0,12)||"null"}" ` +
    `authoritativeVersionId="${authoritativeVersionId?.slice(0,12)||"null"}" ` +
    `effectiveVersionId="${bindingEffectiveVersionId?.slice(0,12)||"null"}" ` +
    `selectedDocId="${selectedDocId?.slice(0,12)||"null"}"`
  );

  // ── UNIVERSAL NULL GUARDS ──
  // Defensive wrapping: ensure all returned arrays/objects are NEVER undefined.
  // This eliminates all downstream Cannot read properties of undefined crashes
  // across the entire component tree, regardless of loading state or new code added.
  const _documents: DevDocument[] = (documents as DevDocument[]) ?? ([] as DevDocument[]);
  const _approvedVersionMap: Record<string, string> = (approvedVersionMap as Record<string, string>) ?? {};
  const _versions: any[] = (versions as any[]) ?? [];
  const _runs: DevRun[] = (runs as DevRun[]) ?? [];
  const _allDocRuns: DevRun[] = (allDocRuns as DevRun[]) ?? [];
  const _convergenceHistory: ConvergencePoint[] = (convergenceHistory as ConvergencePoint[]) ?? [];
  const _driftEvents: DriftEvent[] = (driftEvents as DriftEvent[]) ?? [];

  return {
    documents: _documents, docsLoading, versions: _versions, versionsLoading,
    selectedDoc, selectedVersion, selectedDocId, selectedVersionId,
    selectDocument, setSelectedVersionId,
    runs: _runs, allDocRuns: _allDocRuns, convergenceHistory: _convergenceHistory,
    latestAnalysis, latestNotes, latestConvergence, isConverged, convergenceStatus, isLoading,
    analyze, generateNotes, rewrite, convert, createPaste, deleteDocument, deleteVersion, beatSheetToScript,
    // Drift
    driftEvents: _driftEvents, latestDrift, acknowledgeDrift, resolveDrift,
    // Approval
    approvedVersionMap: _approvedVersionMap,
  };
}
