/**
 * useDialogueAtoms — hook for dialogue atom lifecycle
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
const FUNC_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dialogue-atomiser`;

export interface DialogueAtom {
  id: string; project_id: string; atom_type: 'dialogue'; entity_id: string | null;
  canonical_name: string;
  generation_status: 'pending' | 'generating' | 'completed' | 'complete' | 'failed';
  readiness_state: string; priority: number; confidence: number | null;
  attributes: DialogueAtomAttributes | null; created_at: string; updated_at: string;
}
export interface DialogueAtomAttributes {
  characterName: string; characterId: string; speechRegister: string; vocabularyComplexity: string;
  sentenceStructure: string; accentGuidance: string; dialectMarkers: string[];
  signaturePhrases: string[]; verbalTics: string[]; speechTempo: string;
  emotionalRange: string; subtextCapability: string; expositionStyle: string;
  dialogueTags: string[]; sampleLines: string[]; audiencePerception: string;
  castingDirection: string; dialogueWeakness: string;
  confidence: number; readinessBadge: 'foundation' | 'rich' | 'verified'; generationStatus: string;
}
interface UseDialogueAtomsOptions { projectId: string; enabled?: boolean; }
interface UseDialogueAtomsReturn {
  atoms: DialogueAtom[]; isLoading: boolean; isRefreshing: boolean;
  lastUpdated: Date | null; error: string | null;
  extract: () => Promise<any>; generate: () => Promise<any>;
  resetFailed: () => Promise<any>; refetch: () => Promise<void>;
}
async function call(action: string, projectId: string): Promise<any> {
  const { data: { session: { access_token: token = '' } = {} } = {} } = await supabase.auth.getSession();
  const resp = await fetch(FUNC_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, project_id: projectId }) });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error || `dialogue-atomiser ${action} failed: HTTP ${resp.status}`);
  if (json?.error) throw new Error(json.error);
  return json;
}
export function useDialogueAtoms({ projectId, enabled = true }: UseDialogueAtomsOptions): UseDialogueAtomsReturn {
  const [atoms, setAtoms] = useState<DialogueAtom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchStatus = useCallback(async () => {
    try { const data = await call('status', projectId); setAtoms(data.atoms || []); setLastUpdated(new Date()); setError(null); return data.atoms || []; }
    catch (err: any) { setError(err.message); return []; }
  }, [projectId]);
  const stopPoll = useCallback(() => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } }, []);
  const startPoll = useCallback((delayMs = 5000) => {
    stopPoll();
    const tick = async () => { setIsRefreshing(true); const current = await fetchStatus(); setIsRefreshing(false); if (current.some((a: DialogueAtom) => a.generation_status === 'pending' || a.generation_status === 'generating')) { pollTimer.current = setTimeout(tick, delayMs); } else { setIsGenerating(false); } };
    pollTimer.current = setTimeout(tick, delayMs);
  }, [fetchStatus, stopPoll]);
  useEffect(() => { if (!enabled || !projectId) return; setIsLoading(true); fetchStatus().then(current => { setIsLoading(false); if (current.some((a: DialogueAtom) => a.generation_status === 'pending' || a.generation_status === 'generating')) startPoll(5000); }); return () => stopPoll(); }, [enabled, projectId, fetchStatus, startPoll, stopPoll]);
  const extract = useCallback(async () => { setIsExtracting(true); setError(null); try { const data = await call('extract', projectId); await fetchStatus(); setIsExtracting(false); return data; } catch (err: any) { setError(err.message); setIsExtracting(false); return null; } }, [projectId, fetchStatus]);
  const generate = useCallback(async () => { setIsGenerating(true); setError(null); try { const data = await call('generate', projectId); startPoll(5000); return data; } catch (err: any) { setError(err.message); setIsGenerating(false); return null; } }, [projectId, startPoll]);
  const resetFailed = useCallback(async () => { setError(null); try { const data = await call('reset_failed', projectId); await fetchStatus(); return data; } catch (err: any) { setError(err.message); return null; } }, [projectId, fetchStatus]);
  const refetch = useCallback(async () => { setIsRefreshing(true); await fetchStatus(); setIsRefreshing(false); }, [fetchStatus]);
  return { atoms, isLoading, isRefreshing, isExtracting, isGenerating, lastUpdated, error, extract, generate, resetFailed, refetch };
}
