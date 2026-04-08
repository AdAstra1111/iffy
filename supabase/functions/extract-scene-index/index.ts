/**
 * extract-scene-index — Scene Index builder.
 *
 * PRIMARY PATH: Reads from canonical scene_graph_* tables.
 * FALLBACK PATH: When scene_graph is empty, parses scenes directly
 * from script documents (production_draft, episode_script, season_script, etc.)
 *
 * The fallback extracts scene structure, characters, and locations using
 * deterministic regex parsing — no LLM calls.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Parse character names from scene text using ALL-CAPS dialogue attribution */
function extractCharacters(text: string): string[] {
  const chars = new Set<string>();
  // Match dialogue headers: CHARACTER_NAME (optional parenthetical)
  const dialoguePattern = /^([A-Z][A-Z' ]{1,30})\s*$/gm;
  // Also match "CHARACTER_NAME\n(parenthetical)\nDialogue" pattern
  const dialoguePattern2 = /^([A-Z][A-Z' ]{1,30})\s*\n\s*\(/gm;

  const stopWords = new Set([
    'SCENE', 'INT', 'EXT', 'COLD', 'OPEN', 'CUT', 'FADE', 'SMASH',
    'LATER', 'CONTINUOUS', 'DAY', 'NIGHT', 'DAWN', 'DUSK', 'MORNING',
    'EVENING', 'SUNSET', 'SUNRISE', 'THE', 'END', 'TITLE', 'CARD',
    'SUPER', 'INTERCUT', 'FLASHBACK', 'MONTAGE', 'SERIES', 'BEGIN',
    'RESUME', 'BACK', 'MATCH', 'JUMP', 'TIME', 'DISSOLVE', 'WIPE',
    'EPISODE', 'DURATION', 'TEASER', 'ACT', 'PREVIOUSLY',
    'COLD OPEN', 'EPISODE END', 'END CREDITS', 'TITLE CARD',
    'CONTINUED', 'MORE', 'BEAT', 'PAUSE', 'CONT', 'PRE',
    'CLOSE', 'WIDE', 'ANGLE', 'SHOT', 'REVEAL', 'PAN', 'ZOOM',
  ]);

  for (const pattern of [dialoguePattern, dialoguePattern2]) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      // Filter out scene directions and short words
      if (name.length >= 3 && !stopWords.has(name) && !/^\d/.test(name)) {
        const words = name.split(/\s+/);
        if (words.length <= 3) {
          const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
          // Check multi-word stop phrases
          const upperNorm = name.toUpperCase();
          if (!stopWords.has(upperNorm) && !words.every(w => stopWords.has(w))) {
            chars.add(normalized);
          }
        }
      }
    }
  }

  // Also extract from "CHARACTER does something" narrative lines
  // e.g., "LEILA slips out" or "GABRIEL's eyes"
  const narrativePattern = /\b([A-Z][A-Z]{2,20})(?:'[A-Z]*)?(?:\s+(?:is|was|has|does|looks|turns|walks|stands|sits|runs|grabs|pulls|pushes|opens|closes|enters|exits|says|whispers|shouts|smiles|laughs|cries|nods|shakes|stares|watches|holds|takes|gives|puts|picks|drops|throws|catches|reaches|leans|steps|moves|stops|starts|begins|continues|appears|disappears|wakes|sleeps))/gm;
  let match;
  while ((match = narrativePattern.exec(text)) !== null) {
    const name = match[1].toLowerCase().trim();
    if (name.length >= 3 && !stopWords.has(match[1])) {
      chars.add(name);
    }
  }

  return [...chars];
}

/** Parse location from slugline */
function parseLocation(slugline: string): string | null {
  const locMatch = slugline.match(
    /(?:INT\.|EXT\.|I\/E\.|INT\/EXT\.?)\s*(.+?)(?:\s*[-–—]\s*(?:DAY|NIGHT|DAWN|DUSK|LATER|CONTINUOUS|MORNING|EVENING|SUNSET|SUNRISE).*)?$/i
  );
  if (locMatch) {
    return locMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
  }
  return null;
}

/** Split script text into scenes */
function parseScenes(text: string): Array<{ sceneNumber: number; title: string; slugline: string; body: string; locationKey: string | null }> {
  // Match patterns like "SCENE 1 — DESCRIPTION" or "COLD OPEN" or "INT./EXT. LOCATION"
  const scenePattern = /(?:^|\n)(?:(?:SCENE\s+(\d+)\s*[-–—:]\s*(.+?))|(?:(COLD OPEN|TEASER|EPILOGUE|END CREDITS)[\s\n])|(?:((?:INT|EXT|I\/E|INT\/EXT)\.?\s+.+?(?:\s*[-–—]\s*(?:DAY|NIGHT|DAWN|DUSK|LATER|CONTINUOUS|MORNING|EVENING|SUNSET|SUNRISE).*?)?)))\s*\n/gi;

  const splits: Array<{ index: number; title: string; slugline: string }> = [];
  let match;

  while ((match = scenePattern.exec(text)) !== null) {
    const rawNum = match[1] ? match[1] : '';
    const title = match[2]?.trim() || match[3]?.trim() || match[4]?.trim() || (rawNum ? `Scene ${rawNum}` : 'Scene');
    const slugline = match[4]?.trim() || match[2]?.trim() || title;

    splits.push({
      index: match.index,
      title,
      slugline,
    });
  }

  const scenes: Array<{ sceneNumber: number; title: string; slugline: string; body: string; locationKey: string | null }> = [];

  for (let i = 0; i < splits.length; i++) {
    const start = splits[i].index;
    const end = i + 1 < splits.length ? splits[i + 1].index : text.length;
    const body = text.substring(start, end);

    // Use global sequential numbering to avoid duplicates across episodes
    scenes.push({
      sceneNumber: i + 1,
      title: splits[i].title,
      slugline: splits[i].slugline,
      body,
      locationKey: parseLocation(splits[i].slugline),
    });
  }

  return scenes;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const internalToken = req.headers.get('x-internal-token');

    // ── Internal service bypass ──────────────────────────────────────────────
    const INTERNAL_TOKEN = Deno.env.get('INTERNAL_SERVICE_TOKEN') ?? '';
    const isInternal = !!(
      INTERNAL_TOKEN && internalToken && internalToken === INTERNAL_TOKEN
    );

    if (!authHeader && !isInternal) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let userId: string | null = null;

    if (isInternal) {
      // Internal call: use service role key, no user context needed
      userId = null;
    } else {
      // External call: validate user JWT and build user-scoped client
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: authErr } = await anonClient.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { project_id } = body;

    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[extract-scene-index] Starting for project ${project_id}`);

    // ── 1. Try PRIMARY PATH: canonical scene_graph ───────────────────────────
    const { data: sceneOrder, error: orderErr } = await supabase
      .from('scene_graph_order')
      .select('scene_id, order_key, is_active')
      .eq('project_id', project_id)
      .eq('is_active', true)
      .order('order_key', { ascending: true });

    if (orderErr) throw new Error(`Failed to fetch scene order: ${orderErr.message}`);

    const hasSceneGraph = sceneOrder && sceneOrder.length > 0;

    let sceneEntries: any[] = [];

    if (hasSceneGraph) {
      // ── PRIMARY PATH: Build from scene_graph ───────────────────────────────
      console.log(`[extract-scene-index] Using scene_graph path (${sceneOrder.length} scenes)`);

      const { data: sceneRows, error: sceneErr } = await supabase
        .from('scene_graph_scenes')
        .select('id, scene_key')
        .eq('project_id', project_id)
        .is('deprecated_at', null);
      if (sceneErr) throw new Error(`Failed to fetch scenes: ${sceneErr.message}`);

      const activeSceneIds = new Set((sceneRows || []).map((s: any) => s.id));
      const orderedSceneIds = sceneOrder.map((s: any) => s.scene_id);
      const orderMismatch = orderedSceneIds.filter((id: string) => !activeSceneIds.has(id));

      if (orderMismatch.length > 0) {
        return new Response(JSON.stringify({
          error: 'scene_graph_integrity_failure',
          message: `${orderMismatch.length} ordered scene(s) have no active scene row.`,
          orphan_ids: orderMismatch,
        }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: versions, error: verErr } = await supabase
        .from('scene_graph_versions')
        .select('scene_id, slugline, location, characters_present, summary, version_number')
        .in('scene_id', orderedSceneIds)
        .order('version_number', { ascending: false });
      if (verErr) throw new Error(`Failed to fetch scene versions: ${verErr.message}`);

      const latestVersionMap = new Map<string, any>();
      for (const v of (versions || [])) {
        if (!latestVersionMap.has(v.scene_id)) {
          latestVersionMap.set(v.scene_id, v);
        }
      }

      const { data: visualSets } = await supabase
        .from('visual_sets')
        .select('character_key, state_key')
        .eq('project_id', project_id)
        .eq('domain', 'character_costume_look')
        .neq('status', 'archived');

      const characterStatesMap = new Map<string, Set<string>>();
      for (const vs of (visualSets || [])) {
        if (!vs.character_key || !vs.state_key) continue;
        if (!characterStatesMap.has(vs.character_key)) {
          characterStatesMap.set(vs.character_key, new Set());
        }
        characterStatesMap.get(vs.character_key)!.add(vs.state_key);
      }

      const validationErrors: string[] = [];

      for (let i = 0; i < sceneOrder.length; i++) {
        const so = sceneOrder[i];
        const ver = latestVersionMap.get(so.scene_id);
        const sceneNum = i + 1;

        if (!ver) {
          // Non-fatal: scene in order but no version yet — skip this scene,
          // do NOT fail-closed and block the whole index build.
          console.warn(`[extract-scene-index] Scene ${sceneNum} (${so.scene_id}): no version found — skipping`);
          continue;
        }
        if (!ver.slugline || ver.slugline.trim().length === 0) {
          // Non-fatal warning: slugline is nice-to-have, not required.
          console.warn(`[extract-scene-index] Scene ${sceneNum}: slugline empty — using fallback title`);
        }
        const rawChars: string[] = Array.isArray(ver.characters_present) ? ver.characters_present : [];
        if (rawChars.length === 0) {
          console.warn(`[extract-scene-index] Scene ${sceneNum}: characters_present empty`);
        }

        const characterKeys = rawChars
          .map((c: string) => c.toLowerCase().trim().replace(/\s+/g, ' '))
          .filter((c: string) => c.length > 0);

        let locationKey: string | null = null;
        if (ver.slugline) {
          locationKey = parseLocation(ver.slugline);
        }

        const wardrobeStateMap: Record<string, string> = {};
        for (const ck of characterKeys) {
          const knownStates = characterStatesMap.get(ck);
          wardrobeStateMap[ck] = knownStates && knownStates.size > 0
            ? [...knownStates].sort()[0]
            : 'unknown';
        }

        sceneEntries.push({
          project_id,
          scene_number: sceneNum,
          title: ver.slugline || `Scene ${sceneNum}`,
          source_doc_type: 'script',
          source_ref: {
            scene_id: so.scene_id,
            order_key: so.order_key,
                      },
          location_key: locationKey,
          character_keys: characterKeys,
          wardrobe_state_map: wardrobeStateMap,
        });
      }

      // Log any non-fatal warnings collected during processing
      if (validationErrors.length > 0) {
        console.warn(`[extract-scene-index] ${validationErrors.length} non-fatal issues:`, validationErrors);
      }

    } else {
      // ── FALLBACK PATH: Parse from script documents ─────────────────────────
      console.log(`[extract-scene-index] Scene graph empty — falling back to script document parsing`);

      const scriptDocTypes = [
        'season_script', 'season_master_script', 'production_draft',
        'episode_script', 'script',
      ];

      // Find the best available script document with content
      const { data: scriptDocs, error: docErr } = await supabase
        .from('project_documents')
        .select('id, doc_type')
        .eq('project_id', project_id)
        .in('doc_type', scriptDocTypes);

      if (docErr) throw new Error(`Failed to fetch script docs: ${docErr.message}`);

      if (!scriptDocs || scriptDocs.length === 0) {
        return new Response(JSON.stringify({
          error: 'no_script_documents',
          message: 'No scene graph and no script documents found. Upload a script first.',
        }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get current versions with text, pick the longest
      const docIds = scriptDocs.map((d: any) => d.id);
      const { data: versions, error: verErr } = await supabase
        .from('project_document_versions')
        .select('id, document_id, plaintext')
        .in('document_id', docIds)
        .eq('is_current', true)
        .not('plaintext', 'is', null);

      if (verErr) throw new Error(`Failed to fetch doc versions: ${verErr.message}`);

      // Pick the version with the most text
      const sorted = (versions || [])
        .filter((v: any) => v.plaintext && v.plaintext.length > 100)
        .sort((a: any, b: any) => (b.plaintext?.length || 0) - (a.plaintext?.length || 0));

      if (sorted.length === 0) {
        return new Response(JSON.stringify({
          error: 'no_script_text',
          message: 'Script documents found but no extracted text. Run document extraction first.',
        }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const bestScript = sorted[0];
      const scriptText: string = bestScript.plaintext;
      console.log(`[extract-scene-index] Parsing script text (${scriptText.length} chars) from doc version ${bestScript.id}`);

      // Parse scenes from text
      const parsedScenes = parseScenes(scriptText);

      if (parsedScenes.length === 0) {
        return new Response(JSON.stringify({
          error: 'no_scenes_parsed',
          message: 'Could not parse any scenes from script text. Check script formatting.',
        }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[extract-scene-index] Parsed ${parsedScenes.length} scenes from script`);

      // Fetch wardrobe states
      const { data: visualSets } = await supabase
        .from('visual_sets')
        .select('character_key, state_key')
        .eq('project_id', project_id)
        .eq('domain', 'character_costume_look')
        .neq('status', 'archived');

      const characterStatesMap = new Map<string, Set<string>>();
      for (const vs of (visualSets || [])) {
        if (!vs.character_key || !vs.state_key) continue;
        if (!characterStatesMap.has(vs.character_key)) {
          characterStatesMap.set(vs.character_key, new Set());
        }
        characterStatesMap.get(vs.character_key)!.add(vs.state_key);
      }

      // Build scene entries
      for (const scene of parsedScenes) {
        const characters = extractCharacters(scene.body);

        const wardrobeStateMap: Record<string, string> = {};
        for (const ck of characters) {
          const knownStates = characterStatesMap.get(ck);
          wardrobeStateMap[ck] = knownStates && knownStates.size > 0
            ? [...knownStates].sort()[0]
            : 'unknown';
        }

        sceneEntries.push({
          project_id,
          scene_number: scene.sceneNumber,
          title: scene.title,
          source_doc_type: 'script',
          source_ref: {
            source: 'script_fallback',
            document_version_id: bestScript.id,
          },
          location_key: scene.locationKey,
          character_keys: characters,
          wardrobe_state_map: wardrobeStateMap,
        });
      }
    }

    if (sceneEntries.length === 0) {
      return new Response(JSON.stringify({
        error: 'scene_index_empty',
        message: 'No scene entries could be built from available data.',
      }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Atomic write ─────────────────────────────────────────────────────────
    const { error: delErr } = await supabase
      .from('scene_index')
      .delete()
      .eq('project_id', project_id);
    if (delErr) throw new Error(`Failed to clear scene index: ${delErr.message}`);

    const { error: insertErr } = await supabase
      .from('scene_index')
      .insert(sceneEntries);
    if (insertErr) throw new Error(`Failed to insert scene index: ${insertErr.message}`);

    const source = hasSceneGraph ? 'scene_graph' : 'script_fallback';
    console.log(`[extract-scene-index] Built ${sceneEntries.length} entries via ${source}`);

    return new Response(JSON.stringify({
      success: true,
      source,
      count: sceneEntries.length,
      scenes: sceneEntries,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[extract-scene-index] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
