/**
 * Edge Function: extract-scene-intelligence v1.2
 *
 * Reads scene data from existing IFFY sources, runs layered extraction
 * (regex → inference → LLM), and writes Scene Intelligence Packages.
 *
 * Idempotent. Non-destructive. Regenerable.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractFromContent } from '../_shared/sceneIntelligence/regexExtractor.ts';
import { inferNarrativeFields, type NarrativeBeatInfo, type CharacterAtomInfo } from '../_shared/sceneIntelligence/inferenceEngine.ts';
import { interpretWithLLM, type LLMInterpretationResult } from '../_shared/sceneIntelligence/llmInterpreter.ts';
import { generateAnchors } from '../_shared/sceneIntelligence/anchorGenerator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface ExtractInput {
  project_id: string;
  scene_number?: number;
  batch?: boolean;
  max_scenes?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body: ExtractInput = await req.json();
    const projectId = body.project_id;
    if (!projectId) return jsonRes({ error: 'project_id is required' }, 400);

    const apiKey = Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('OPENAI_API_KEY');
    const gatewayUrl = 'https://openrouter.ai/api/v1/chat/completions';

    // Fetch all scenes
    const { data: scenes, error: scenesErr } = await supabase
      .from('scene_index')
      .select('id, scene_number, title, location_key, character_keys')
      .eq('project_id', projectId)
      .order('scene_number', { ascending: true });

    if (scenesErr) return jsonRes({ error: scenesErr.message }, 500);
    if (!scenes?.length) return jsonRes({ scenes_processed: 0, packages_created: 0 });

    // Filter to single scene if requested
    const targetScenes = body.scene_number
      ? scenes.filter(s => s.scene_number === body.scene_number)
      : scenes.slice(0, body.max_scenes || 100);

    const results = [];
    const errors = [];

    for (const scene of targetScenes) {
      try {
        const pkg = await extractSceneIntelligence(supabase, projectId, scene, apiKey || '', gatewayUrl);
        if (pkg) results.push({ scene_number: scene.scene_number, package_id: pkg.id, confidence: pkg.confidence });
      } catch (err) {
        errors.push({ scene_number: scene.scene_number, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return jsonRes({
      project_id: projectId,
      scenes_processed: results.length,
      packages_created: results.length,
      errors: errors.length,
      error_details: errors.length > 0 ? errors : undefined,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: message }, 500);
  }
});

async function extractSceneIntelligence(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  scene: { id: string; scene_number: number; title: string; location_key: string; character_keys: string[] },
  apiKey: string,
  gatewayUrl: string,
) {
  const { id: sceneId, scene_number: sceneNumber, title, location_key: locationKey, character_keys: characterKeys } = scene;

  // ── Step 1: Fetch scene_graph_versions ──
  const { data: sgv } = await supabase
    .from('scene_graph_versions')
    .select('id, slugline, summary, content, beats, scene_roles, purpose, time_of_day, characters_present')
    .eq('project_id', projectId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const content = sgv?.content || '';
  const summary = sgv?.summary || '';

  // ── Step 2: Fetch narrativebeat atoms ──
  const { data: beatAtoms } = await supabase
    .from('atoms')
    .select('attributes, narrative_role')
    .eq('project_id', projectId)
    .eq('atom_type', 'narrativebeat')
    .eq('readiness_state', 'complete');

  const narrativeBeat: NarrativeBeatInfo | null = beatAtoms?.length
    ? extractNarrativeBeatInfo(beatAtoms[0])
    : null;

  // ── Step 3: Fetch character atoms for this scene's characters ──
  const { data: charAtoms } = await supabase
    .from('atoms')
    .select('entity_name, attributes')
    .eq('project_id', projectId)
    .eq('atom_type', 'character')
    .in('entity_name', characterKeys)
    .limit(20);

  const characterAtoms: CharacterAtomInfo[] = (charAtoms || []).map(a => ({
    character_name: a.entity_name,
    goals: extractGoals(a.attributes),
    fears: extractFears(a.attributes),
    secrets: extractSecrets(a.attributes),
  }));

  // ── Step 4: Layer 1 — Regex extraction ──
  const regexResult = extractFromContent(content || summary || '');

  // ── Step 5: Layer 2 — Inference from atoms ──
  const inference = inferNarrativeFields(regexResult, characterKeys, narrativeBeat, characterAtoms);

  // ── Step 6: Layer 3 — LLM interpretation ──
  let llmResult: LLMInterpretationResult = {
    scene_objective: null,
    scene_consequence: null,
    scene_consequence_significance: null,
    dramatic_question: null,
    subtext_summary: null,
    scene_conflict: null,
    residue_created: null,
  };

  if (apiKey && (content || summary)) {
    try {
      llmResult = await interpretWithLLM({
        sceneNumber,
        title,
        locationKey,
        characterKeys,
        content,
        summary,
        actionLines: regexResult.scene_action,
        dialogueBlocks: regexResult.dialogue_blocks.map(d => `${d.character}: ${d.text}`),
        emotionalMarkers: regexResult.emotional_markers.map(e => `${e.character}: ${e.emotion}`),
        narrativeBeat: narrativeBeat ? {
          emotionalImpact: narrativeBeat.emotionalImpact,
          structuralFunction: narrativeBeat.structuralFunction,
        } : undefined,
      }, apiKey, gatewayUrl);
    } catch (e) {
      console.warn(`[Scene ${sceneNumber}] LLM fallback: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Step 7: Generate dependency anchors ──
  const consequence = llmResult.scene_consequence?.value || inference.emotional_turn || '';
  const anchors = generateAnchors(consequence, characterKeys, locationKey);

  // ── Step 8: Determine significance ──
  const significance = llmResult.scene_consequence_significance?.value as 'minor' | 'moderate' | 'major' | 'critical' | null || null;

  // ── Step 9: Build blocking/gaze maps from regex ──
  const blockingMap = regexResult.blocking_entries.length > 0 ? {
    characters: regexResult.blocking_entries.map(b => ({
      name: b.character,
      position_in_frame: b.position,
      body_position: b.body_posture,
      facing: 'unknown',
      dominance: 'unknown',
      evidence: b.evidence,
    })),
    frame_composition: characterKeys.length >= 4 ? 'ensemble' : characterKeys.length === 2 ? 'two_shot' : 'single',
    distance_between: 'unstated',
  } : null;

  const gazeMap = regexResult.gaze_entries.length > 0 ? {
    gazes: regexResult.gaze_entries.map(g => ({
      subject: g.subject,
      target: g.target,
      intensity: g.intensity,
      expression: 'unknown',
      evidence: g.evidence,
    })),
    eye_lines: null,
  } : null;

  // ── Step 10: Assemble evidence ──
  const allEvidence = regexResult.evidence_lines;
  const evidenceExcerpt = allEvidence.slice(0, 5).join('\n');
  const evidenceHash = await sha256(evidenceExcerpt);

  // ── Step 11: Source tables used ──
  const sourceTables = ['scene_graph_versions', 'scene_index'];
  if (beatAtoms?.length) sourceTables.push('atoms#narrativebeat');
  if (charAtoms?.length) sourceTables.push('atoms#character');

  // ── Step 12: Compute aggregate confidence ──
  const confidences = [inference.confidence];
  if (llmResult.scene_consequence?.confidence) confidences.push(llmResult.scene_consequence.confidence as 'high' | 'medium' | 'low');
  const aggregateConfidence = computeAggregateConfidence(confidences);

  // ── Step 13: Upsert ──
  const packageRow = {
    project_id: projectId,
    scene_id: sceneId,
    scene_number: sceneNumber,
    scene_action: regexResult.scene_action.slice(0, 3).join(' ') || null,
    scene_objective: llmResult.scene_objective?.value || null,
    scene_conflict: llmResult.scene_conflict?.value || null,
    dramatic_question: llmResult.dramatic_question?.value || null,
    scene_consequence: llmResult.scene_consequence?.value || null,
    scene_consequence_significance: significance,
    scene_consequence_anchors: anchors.length > 0 ? anchors : null,
    emotional_turn: inference.emotional_turn || llmResult.residue_created?.value || null,
    dominant_character: inference.dominant_character || null,
    vulnerable_character: inference.vulnerable_character || null,
    observer_characters: inference.observer_characters.length > 0 ? inference.observer_characters : null,
    power_dynamic: inference.power_dynamic || null,
    tension_level: inference.tension_level || null,
    character_intentions: null,
    subtext_summary: llmResult.subtext_summary?.value || null,
    residue_created: llmResult.residue_created?.value || null,
    blocking_map: blockingMap as any,
    gaze_map: gazeMap as any,
    body_position_map: regexResult.body_entries.length > 0 ? regexResult.body_entries : null,
    attention_map: null,
    camera_intent: inference.camera_intent || null,
    visual_moment_type: inference.visual_moment_type || null,
    performance_direction: inference.performance_direction || null,
    character_state_delta: null,
    relationship_state_delta: null,
    knowledge_delta: null,
    world_state_delta: null,
    evidence_excerpt: evidenceExcerpt.substring(0, 2000) || null,
    evidence_hash: evidenceHash,
    extraction_method: apiKey ? 'ai_interp' : 'deterministic_regex',
    source_version_id: sgv?.id || null,
    source_tables: sourceTables,
    confidence: aggregateConfidence,
    is_current: true,
    created_by: null,
  };

  const { data: upserted, error: upsertErr } = await supabase
    .from('scene_intelligence_packages')
    .upsert(packageRow, { onConflict: 'project_id, scene_id', ignoreDuplicates: false })
    .select('id, confidence')
    .single();

  if (upsertErr) throw upsertErr;
  return upserted as { id: string; confidence: string };
}

// ── Helper functions ────────────────────────────────────────────────────────

function extractNarrativeBeatInfo(atom: any): NarrativeBeatInfo {
  const attrs = atom?.attributes || {};
  return {
    emotionalImpact: attrs.emotionalImpact || null,
    structuralFunction: attrs.structuralFunction || attrs.beatType || null,
    narrativeMomentum: attrs.narrativeMomentum || null,
    charactersInvolved: attrs.charactersInvolved || [],
  };
}

function extractGoals(attributes: any): string[] {
  if (!attributes) return [];
  const goals = attributes.goals || attributes.objectives || attributes.motivations;
  return Array.isArray(goals) ? goals : goals ? [goals] : [];
}

function extractFears(attributes: any): string[] {
  if (!attributes) return [];
  const fears = attributes.fears || attributes.vulnerabilities;
  return Array.isArray(fears) ? fears : fears ? [fears] : [];
}

function extractSecrets(attributes: any): string[] {
  if (!attributes) return [];
  const secrets = attributes.secrets || attributes.hidden_agenda;
  return Array.isArray(secrets) ? secrets : secrets ? [secrets] : [];
}

function computeAggregateConfidence(confidences: string[]): 'high' | 'medium' | 'low' {
  if (confidences.every(c => c === 'high')) return 'high';
  if (confidences.some(c => c === 'high') || confidences.every(c => c !== 'low')) return 'medium';
  return 'low';
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Deno serve
function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      return jsonRes({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });
}
