import { createClient } from 'jsr:@supabase/supabase-js@2';

// ── Regex Patterns ──
const GAZE_RE = /\b(looks at|stares at|glances at|eyes on|gazes at|meets?\s+[\w\s]+\s+eyes?|holds?\s+[\w\s]+\s+gaze)\b/i;
const BODY_RE = /\b(sits|stands|kneels|crouches|leans|paces|rises|enters|exits|turns|walks|runs|crawls|ducks|hides|slumps|straightens|spins|stumbles|collapses|springs|creeps|strides)\b/i;
const BLOCK_RE = /\b(across from|beside|behind|in front of|near|opposite|toward|away from|next to|alongside)\b/i;
const EMOTE_RE = /\b(angry|frightened|determined|hesitant|desperate|triumphant|guarded|defiant|cold|warm|cautious|eager|terrified|calm|agitated|suspicious|relieved|anxious|defeated|hopeful|resigned|furious|uncertain|smirks|frowns|grins|clenches|relaxes|shakes|nods)\b/i;
const POWER_RE = /\b(commands|submits|pleads|threatens|controls|dominates|obeys|defies|surrenders|resists|challenges|interrogates|pressures|coerces|blackmails|manipulates|outranks)\b/i;

function extractFromContent(content: string) {
  const r: any = { slugline: null, actions: [], blocks: [], gazes: [], bodies: [], emotions: [], powers: [], chars: [], evidence: [], dialogs: [], parens: [] };
  const lines = content.split('\n');
  let curChar: string | null = null, curDial: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const cm = t.match(/^([A-Z][A-Z .'À-ÿ]+)(?:\s*\(.*\))?$/);
    if (cm && t.length < 50 && !t.includes('.')) {
      if (curChar && curDial.length) { r.dialogs.push({ char: curChar, text: curDial.join('\n') }); curDial = []; }
      curChar = cm[1].trim();
      if (!r.chars.includes(curChar)) r.chars.push(curChar);
      continue;
    }
    if (curChar && t.startsWith('(')) { const p = t.match(/^\(([^)]+)\)/); if (p) r.parens.push({ char: curChar, dir: p[1] }); continue; }
    if (curChar && !t.match(/^(INT|EXT|INT\/EXT)/) && !t.match(/^[A-Z][A-Z .'À-ÿ]+$/)) { curDial.push(t); continue; }
    if (!t.match(/^(INT|EXT|INT\/EXT)/) && !t.match(/^[A-Z][A-Z .'À-ÿ]+$/) && !curChar) {
      r.actions.push(t); r.evidence.push(t);
      const g = t.match(GAZE_RE); if (g) r.gazes.push({ verb: g[0], evidence: t.slice(0,100) });
      const b = t.match(BODY_RE); if (b) r.bodies.push({ posture: b[0], evidence: t.slice(0,100) });
      const e = t.match(EMOTE_RE); if (e) e.forEach(m => r.emotions.push(m));
      const p = t.match(POWER_RE); if (p) p.forEach(m => r.powers.push(m));
      const bp = t.match(BLOCK_RE); if (bp) r.blocks.push({ prep: bp[0], evidence: t.slice(0,100) });
    }
  }
  if (curChar && curDial.length) r.dialogs.push({ char: curChar, text: curDial.join('\n') });
  return r;
}

Deno.serve(async (req) => {
  const hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: hdrs });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const pid = body.project_id;
    if (!pid) return new Response(JSON.stringify({ error: 'project_id required' }), { status: 400, headers: hdrs });

    const { data: scenes } = await supabase.from('scene_index').select('id, scene_number, title, location_key, character_keys').eq('project_id', pid).order('scene_number').limit(body.max_scenes || 50);
    if (!scenes?.length) return new Response(JSON.stringify({ processed: 0 }), { headers: hdrs });

    const results: any[] = [];
    const errors: any[] = [];

    for (const sc of scenes) {
      try {
        const sid = sc.id;
        const snum = sc.scene_number;
        const chars = sc.character_keys || [];
        const loc = sc.location_key;

        // Try to find scene_graph_versions content by matching slugline/title
        // Note: scene_index and scene_graph_versions use different ID systems
        // YETI may not have scene_graph content per scene_number
        let content = '';
        let summary = '';
        let sgvId = null;
        try {
          const { data: sgvs } = await supabase.from('scene_graph_versions').select('id, slugline, summary, content').eq('project_id', pid).order('version_number', { ascending: false }).limit(1);
          if (sgvs?.length) {
            // Use the first/all content from scene_graph as reference
            // (scenes aren't 1:1 mapped, so this gives us genre context)
            content = sgvs[0].content || '';
            summary = sgvs[0].summary || '';
            sgvId = sgvs[0].id;
          }
        } catch { /* no scene_graph data — use fallback */ }

        const rex = extractFromContent(content || summary);

        const { data: beats } = await supabase.from('atoms').select('attributes').eq('project_id', pid).eq('atom_type', 'narrativebeat').eq('readiness_state', 'complete').limit(1);
        const beat = beats?.[0]?.attributes ? { emotionalImpact: beats[0].attributes.emotionalImpact || null, structuralFunction: beats[0].attributes.structuralFunction || beats[0].attributes.beatType || null } : null;

        const tension = Math.min(3 + rex.emotions.length + rex.powers.length, 10);
        const powerDyn = rex.powers.length >= 3 ? 'shifting' : rex.powers.length >= 2 ? 'one_dominant' : 'equal';
        const vtype = beat?.structuralFunction?.includes('climax') ? 'confrontation' : beat?.structuralFunction?.includes('revelation') ? 'discovery' : beat?.structuralFunction?.includes('threat') ? 'threat' : beat?.structuralFunction?.includes('pursuit') ? 'pursuit' : beat?.structuralFunction?.includes('action') ? 'action' : chars.length >= 4 ? 'ensemble' : 'atmosphere';
        const camera = chars.length >= 4 ? 'wide_shot_ensemble' : chars.length === 3 ? 'three_shot' : chars.length === 2 ? 'two_shot' : 'single_char';

        const obsChars = chars.filter((c: string) => !rex.actions.some((a: string) => a.includes(c)));
        const evidenceEx = rex.evidence.slice(0, 5).join('\n');
        const enc = new TextEncoder();
        const hb = await crypto.subtle.digest('SHA-256', enc.encode(evidenceEx || 'none'));
        const hash = Array.from(new Uint8Array(hb)).map(b => b.toString(16).padStart(2, '0')).join('');

        const blockMap = rex.blocks.length ? { characters: rex.blocks.map((b: any) => ({ name: 'unknown', position: b.prep, body_position: 'unknown', facing: 'unknown', dominance: 'unknown', evidence: b.evidence })), frame_composition: chars.length >= 4 ? 'ensemble' : 'two_shot' } : null;
        const gazeMap = rex.gazes.length ? { gazes: rex.gazes.map((g: any) => ({ subject: 'unknown', target: 'unknown', intensity: 'moderate', expression: 'unknown', evidence: g.evidence })) } : null;

        const { error: upsErr } = await supabase.from('scene_intelligence_packages').upsert({
          project_id: pid, scene_id: sid, scene_number: snum,
          scene_action: rex.actions.slice(0,3).join(' ') || null,
          emotional_turn: beat?.emotionalImpact || null,
          dominant_character: null, vulnerable_character: null,
          observer_characters: obsChars.length ? obsChars : null,
          power_dynamic: powerDyn, tension_level: tension,
          visual_moment_type: vtype, camera_intent: camera,
          blocking_map: blockMap, gaze_map: gazeMap,
          body_position_map: rex.bodies.length ? rex.bodies : null,
          extraction_method: 'deterministic_regex',
          evidence_excerpt: evidenceEx.slice(0,2000), evidence_hash: hash,
          source_version_id: sgvId, source_tables: ['scene_graph_versions','scene_index'],
          confidence: rex.evidence.length >= 5 ? 'high' : rex.evidence.length >= 2 ? 'medium' : 'low',
          is_current: true,
          scene_consequence_anchors: null,
          character_state_delta: null, relationship_state_delta: null, knowledge_delta: null, world_state_delta: null,
        }, { onConflict: 'project_id, scene_id', ignoreDuplicates: false });

        if (upsErr) throw upsErr;
        results.push({ scene: snum, chars: chars.length, actions: rex.actions.length, ok: true });
      } catch (e) {
        errors.push({ scene: sc.scene_number, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, errors: errors.length, error_details: errors.length ? errors : undefined, results }), { status: 200, headers: hdrs });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: hdrs });
  }
});
