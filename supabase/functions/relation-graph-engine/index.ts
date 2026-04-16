/**
 * relation-graph-engine — v2
 *
 * Calculates character co-occurrence from scene proximity AND infers semantic
 * relationship roles from beat sheet analysis.
 *
 * Pipeline position:
 *   entity_extract → sync_dialogue_characters → entity_links → relation_graph → scene_graph → beat_sheet → ...
 *
 * v1: co-occurrence only (same-scene)
 * v2 additions:
 *   - Protagonist inference from beat sheet protagonist_state fields
 *   - Semantic role inference: ally_of, antagonist_of, romantic_of, family_of
 *   - Beat-sheet-aware co-occurrence weighting
 *
 * DB Schema:
 *   narrative_entity_relations.source_entity_id → narrative_entities(id)
 *   narrative_entity_relations.target_entity_id → narrative_entities(id)
 *   Both FKs are enforced. A valid project_id FK also exists.
 *   narrative_entities.meta_json stores protagonist flag and role flags.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

interface Entity {
  id: string;
  entity_key: string;
  canonical_name: string;
  entity_type: string;
  scene_count: number;
}

interface BeatSheetBeat {
  number: number;
  name: string;
  description: string;
  protagonist_state?: string;
  emotional_shift?: string;
  dramatic_function?: string;
}

interface BeatSheet {
  beats?: BeatSheetBeat[];
  entries?: BeatSheetBeat[]; // some docs use entries
  [key: string]: unknown;
}

interface CoOccurrencePair {
  source: string;
  target: string;
  count: number;
  // Per-beat context
  conflictBeats: number;   // beats where source+target appear together and tension is high
  teamBeats: number;        // beats where source+target are both aligned (team formation, planning)
  romanticBeats: number;    // beats with romantic/intimate keywords
  familyBeats: number;      // beats with family keywords
}

/** Build name resolution map using alias table as authoritative source */
function buildNameResolutionMap(
  entities: Entity[],
  aliases: Array<{ alias_name: string; canonical_entity_id: string }>
): Map<string, string> {
  // alias_name (uppercase, stripped) → canonical entity_id
  // Priority: aliases override canonical name matching
  const map = new Map<string, string>();

  // First: add all aliases (authoritative)
  for (const a of aliases) {
    const key = a.alias_name.toUpperCase().replace(/\s*\(.*\)\s*/g, '').trim();
    if (key) map.set(key, a.canonical_entity_id);
  }

  // Then: add canonical names (as full-name fallback)
  for (const e of entities) {
    if (!map.has(e.canonical_name.toUpperCase())) {
      map.set(e.canonical_name.toUpperCase(), e.id);
    }
    // For single-word names, also register the full name (already done above)
  }

  return map;
}

/** Check if text mentions a character — word-boundary-aware, case-insensitive */
function textMentionsCharacter(text: string, nameMap: Map<string, string>): string | null {
  const upper = text.toUpperCase();
  // Try full canonical names FIRST (avoids fragment alias false matches)
  const sortedNames = [...nameMap.keys()].sort((a, b) => b.length - a.length); // longest first
  for (const name of sortedNames) {
    // Match at word boundary: not part of another word
    // The character name must be preceded by non-alpha and followed by non-alpha
    const pattern = new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`, 'i');
    if (pattern.test(text)) return nameMap.get(name)!;
  }
  return null;
}

/** Count protagonist mentions with word-boundary-aware matching */
function countProtagonistMentions(text: string, nameMap: Map<string, string>): Map<string, number> {
  const scores = new Map<string, number>();
  const upper = text.toUpperCase();
  // Sort by length descending to prioritize full names over fragments
  const sortedNames = [...nameMap.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [name, id] of sortedNames) {
    const pattern = new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`, 'i');
    if (pattern.test(text)) {
      scores.set(id, (scores.get(id) || 0) + 1);
    }
  }
  return scores;
}

/** Count how many times each character is identified as protagonist across all beats */
function inferProtagonist(
  beats: BeatSheetBeat[],
  nameMap: Map<string, string>
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const beat of beats) {
    const pState = beat.protagonist_state || '';

    // protagonist_state field: character is named as the subject of the beat
    // e.g. "Bill is a cynical, war-weary man" → Bill is protagonist
    const stateMentions = countProtagonistMentions(pState, nameMap);
    for (const [id, count] of stateMentions) {
      // protagonist_state match: weight 3 (strong narrative signal)
      scores.set(id, (scores.get(id) || 0) + count * 3);
    }

    // "The [NAME]" pattern — very strong signal
    for (const [name, id] of nameMap) {
      if (pState.includes(`The ${name}`) || pState.includes(`the ${name.toLowerCase()}`)) {
        scores.set(id, (scores.get(id) || 0) + 2);
      }
    }

    // Also scan description for "main protagonist" / "hero" language
    const desc = beat.description || '';
    if (/\b(main protagonist|central character|hero)\b/i.test(desc)) {
      const descMentions = countProtagonistMentions(desc, nameMap);
      for (const [id, count] of descMentions) {
        scores.set(id, (scores.get(id) || 0) + count * 2);
      }
    }
  }

  return scores;
}

/** Infer semantic relationship type from beat description + co-occurrence */
function inferRelationType(
  sourceName: string,
  targetName: string,
  beat: BeatSheetBeat,
  conflictKeywords: Set<string>,
  teamKeywords: Set<string>,
  romanticKeywords: Set<string>,
  familyKeywords: Set<string>
): string | null {
  const text = `${beat.name} ${beat.description} ${beat.protagonist_state || ''}`.toUpperCase();

  // Family detection: names or family keywords
  if (familyKeywords.size > 0) {
    for (const kw of familyKeywords) {
      if (text.includes(kw.toUpperCase())) return 'family_of';
    }
  }

  // Romantic detection
  if (romanticKeywords.size > 0) {
    for (const kw of romanticKeywords) {
      if (text.includes(kw.toUpperCase())) return 'romantic_of';
    }
  }

  // Conflict / antagonist detection
  if (conflictKeywords.size > 0) {
    for (const kw of conflictKeywords) {
      if (text.includes(kw.toUpperCase())) return 'antagonist_of';
    }
  }

  // Team / ally detection
  if (teamKeywords.size > 0) {
    for (const kw of teamKeywords) {
      if (text.includes(kw.toUpperCase())) return 'ally_of';
    }
  }

  return null;
}

// ── Keyword sets for semantic role inference ──────────────────────────────────

const CONFLICT_KEYWORDS = new Set([
  'ATTACK', 'BATTLE', 'BETRAY', 'CHASE', 'COMBAT', 'CONFRONT', 'CONSPIRACY',
  'DEFEAT', 'DESTROY', 'ENEMY', 'ESCAPE', 'EXECUT', 'FIGHT', 'HUNT', 'KILL',
  'MENACE', 'MURDER', 'PURSUIT', 'RAID', 'SHOOT', 'STRUGGLE', 'SURROUNDED',
  'THREAT', 'TORTURE', 'TRAP', 'TRIED', 'AMBUSH', 'VIOLENT',
]);

const TEAM_KEYWORDS = new Set([
  'ALLIANCE', 'ALLY', 'ASSIST', 'COLLABOR', 'COOPERAT', 'JOIN FORCES',
  'PARTNER', 'RECRUIT', 'SAFE HOUSE', 'SUMMMONED', 'TEAM', 'TRAIN',
  'MISSION', 'QUEST', 'EXPEDITION', 'JOURNEY', 'EXPLORE', 'SEARCH',
  'PLAN', 'DISCUSS', 'BRIEFING', 'ORDERS',
]);

const ROMANTIC_KEYWORDS = new Set([
  'KISS', 'LOVE', 'ROMANTIC', 'ATTRACTION', 'INTIMATE', 'EMBRACE',
  'PASSION', 'DESIRE', 'WOO', 'COURT', 'ENTRANCED',
]);

const FAMILY_KEYWORDS = new Set([
  'BROTHER', 'SISTER', 'SON', 'DAUGHTER', 'MOTHER', 'FATHER', 'FAMILY',
  'PARENT', 'SIBLING', 'KIN', 'RELATIVE', 'MATRIMONIAL', 'MARRIED',
]);

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { projectId } = await req.json();
    if (!projectId) throw new Error("projectId required");

    // ── Step 1: Fetch all character entities ─────────────────────────────────
    const { data: entities, error: entError } = await adminClient
      .from("narrative_entities")
      .select("id, entity_key, canonical_name, entity_type, scene_count")
      .eq("project_id", projectId)
      .eq("entity_type", "character");

    if (entError) throw new Error(`Failed to fetch entities: ${entError.message}`);
    if (!entities || entities.length === 0) {
      return new Response(JSON.stringify({ ok: true, relationsCreated: 0, message: "No character entities found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const chars = entities as Entity[];

    // ── Step 1b: Fetch aliases for name resolution ───────────────────────────
    const { data: aliasRows } = await adminClient
      .from("narrative_entity_aliases")
      .select("alias_name, canonical_entity_id")
      .eq("project_id", projectId);

    const nameMap = buildNameResolutionMap(
      chars,
      (aliasRows || []) as Array<{ alias_name: string; canonical_entity_id: string }>
    );

    // ── Step 2: Fetch beat sheet ─────────────────────────────────────────────
    // Use direct REST fetch to avoid Supabase JS client field-mapping quirks
    const beatSheetRes = await fetch(
      `${supabaseUrl}/rest/v1/rpc/fetch_latest_doc?p_project_id=${projectId}&p_doc_type=beat_sheet`,
      {
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "apikey": serviceRoleKey,
          "Content-Type": "application/json",
        },
      }
    );

    // Fallback: manual two-step query via adminClient REST
    let beatSheet: BeatSheet | null = null;
    try {
      const docRes = await adminClient
        .from("project_documents")
        .select("id")
        .eq("project_id", projectId)
        .eq("doc_type", "beat_sheet")
        .maybeSingle();

      if (docRes.data) {
        const verRes = await adminClient
          .from("project_document_versions")
          .select("plaintext")
          .eq("document_id", docRes.data.id)
          .eq("is_current", true)
          .maybeSingle();
        if (verRes.data?.plaintext) {
          try {
            beatSheet = JSON.parse(verRes.data.plaintext);
          } catch { /* not JSON */ }
        }
      }
    } catch { /* beat sheet unavailable — proceed without it */ }

    const beats: BeatSheetBeat[] = (beatSheet?.beats || beatSheet?.entries || []) as BeatSheetBeat[];

    // ── Step 3: Identify protagonist ─────────────────────────────────────────
    const protagonistScores = inferProtagonist(beats, nameMap);
    let protagonistId: string | null = null;
    let maxScore = 0;
    for (const [id, score] of protagonistScores) {
      if (score > maxScore) {
        maxScore = score;
        protagonistId = id;
      }
    }

    // Fallback: most scenes = protagonist
    if (!protagonistId) {
      let maxScenes = 0;
      for (const c of chars) {
        if (c.scene_count > maxScenes) {
          maxScenes = c.scene_count;
          protagonistId = c.id;
        }
      }
    }

    // ── Step 4: Fetch co-occurrence pairs ─────────────────────────────────────
    const { data: links, error: linksError } = await adminClient
      .from("narrative_scene_entity_links")
      .select("scene_id, entity_id")
      .eq("project_id", projectId)
      .eq("relation_type", "character_present");

    if (linksError) throw new Error(`Failed to fetch links: ${linksError.message}`);
    if (!links || links.length === 0) {
      return new Response(JSON.stringify({ ok: true, relationsCreated: 0, message: "No character links found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Deduplicate links
    const linkSet = new Set<string>();
    const dedupedLinks: { scene_id: string; entity_id: string }[] = [];
    for (const link of links as { scene_id: string; entity_id: string }[]) {
      const key = `${link.scene_id}::${link.entity_id}`;
      if (!linkSet.has(key)) {
        linkSet.add(key);
        dedupedLinks.push({ scene_id: link.scene_id, entity_id: link.entity_id });
      }
    }

    // Group by scene
    const sceneToEntities = new Map<string, Set<string>>();
    for (const link of dedupedLinks) {
      if (!sceneToEntities.has(link.scene_id)) {
        sceneToEntities.set(link.scene_id, new Set());
      }
      sceneToEntities.get(link.scene_id)!.add(link.entity_id);
    }

    // Build co-occurrence pairs with beat-context flags
    const pairMap = new Map<string, CoOccurrencePair>();
    for (const [sceneId, entityIds] of sceneToEntities) {
      const entities = [...entityIds];
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const [a, b] = entities[i] < entities[j] ? [entities[i], entities[j]] : [entities[j], entities[i]];
          const pairKey = `${a}::${b}`;
          if (!pairMap.has(pairKey)) {
            pairMap.set(pairKey, { source: a, target: b, count: 0, conflictBeats: 0, teamBeats: 0, romanticBeats: 0, familyBeats: 0 });
          }
          pairMap.get(pairKey)!.count++;
        }
      }
    }

    const totalMultiCharScenes = sceneToEntities.size;

    // ── Step 5: Beat-aware semantic enrichment ────────────────────────────────
    // For each beat, check which entity pairs appear in it
    for (const beat of beats) {
      const beatText = `${beat.name} ${beat.description} ${beat.protagonist_state || ''}`;
      // Word-boundary-aware character matching (avoids fragment false matches like "BILL" in "Klausman's")
      const mentionedChars = new Set<string>();
      for (const [name, id] of nameMap) {
        const pattern = new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`, 'i');
        if (pattern.test(beatText)) {
          mentionedChars.add(id);
        }
      }

      // ── Detect ANTAGONIST relations directly from protagonist_state ──────────
      // "Bill is disturbed by Klausman's actions" → Klausman is Bill's antagonist
      // "Bill is betrayed by Nazi infiltrators" → Nazis are Bill's antagonists
      // This runs regardless of beat-level conflict keywords (beat 4 has no ATTACK/etc)
      const pState = (beat.protagonist_state || '').toUpperCase();
      if (pState) {
        // Pattern: "NAME'S ACTIONS" / "NAME'S EXPERIMENTS" — strong antagonist signal
        const possessivePattern = /\b([A-Z][A-Z]+?)'S\s+(?:ACTIONS?|EXPERIMENTS?|WORK|PLANS?|SCHEME|ORDERS?|TREATMENT)/gi;
        let match;
        while ((match = possessivePattern.exec(pState)) !== null) {
          const threatName = match[1].trim();
          const threatId = nameMap.get(threatName);

          // Find the protagonist (subject of protagonist_state: "BILL IS...", "THE BOY IS...")
          const subjectPattern = /\b([A-Z][A-Z]+?)(?:\s+IS|\s+FEELS?|\s+BEEN|\s+BE\s+THE|BECOME)/i;
          const subjectMatch = pState.match(subjectPattern);

          if (threatId && subjectMatch) {
            const subjectName = subjectMatch[1].trim();
            const subjectId = nameMap.get(subjectName);

            if (subjectId && subjectId !== threatId) {
              // Canonical ordering: smaller id first
              const [sa, ta] = subjectId < threatId ? [subjectId, threatId] : [threatId, subjectId];
              if (pairMap.has(`${sa}::${ta}`)) {
                pairMap.get(`${sa}::${ta}`)!.conflictBeats += 2;
              }
            }
          }
        }
      }

      // Check for beat-level semantic keywords (team / romantic / family)
      let relationType: string | null = null;
      for (const kw of [...CONFLICT_KEYWORDS]) {
        if (beatText.toUpperCase().includes(kw)) { relationType = 'conflictBeats'; break; }
      }
      if (!relationType) {
        for (const kw of [...TEAM_KEYWORDS]) {
          if (beatText.toUpperCase().includes(kw)) { relationType = 'teamBeats'; break; }
        }
      }
      if (!relationType) {
        for (const kw of [...ROMANTIC_KEYWORDS]) {
          if (beatText.toUpperCase().includes(kw)) { relationType = 'romanticBeats'; break; }
        }
      }
      if (!relationType) {
        for (const kw of [...FAMILY_KEYWORDS]) {
          if (beatText.toUpperCase().includes(kw)) { relationType = 'familyBeats'; break; }
        }
      }

      // Build id→name reverse map once per beat (used in conflict resolution)
      const idToName = new Map<string, string>();
      for (const [n, id] of nameMap) idToName.set(id, n);

      if (mentionedChars.size >= 2) {
        const charList = [...mentionedChars];

        // ── TEAM beats: all co-present characters are teammates ───────────────
        if (relationType === 'teamBeats') {
          for (let i = 0; i < charList.length; i++) {
            for (let j = i + 1; j < charList.length; j++) {
              const [a, b] = charList[i] < charList[j] ? [charList[i], charList[j]] : [charList[j], charList[i]];
              if (pairMap.has(`${a}::${b}`)) pairMap.get(`${a}::${b}`)!.teamBeats++;
            }
          }
        }

        // ── CONFLICT beats: only flag as antagonist if one char's protagonist_state
        //    explicitly names the other as a threat/opponent ───────────────────
        else if (relationType === 'conflictBeats') {
          for (let i = 0; i < charList.length; i++) {
            for (let j = i + 1; j < charList.length; j++) {
              const [a, b] = charList[i] < charList[j] ? [charList[i], charList[j]] : [charList[j], charList[i]];
              if (!pairMap.has(`${a}::${b}`)) continue;
              const pair = pairMap.get(`${a}::${b}`)!;

              // Check if protagonist_state shows one character's name in context of
              // endangering/threatening the protagonist → they are antagonists
              // e.g. "deeply disturbed by Klausman's actions" → Klausman is antagonist
              // e.g. "Bill's HQ is attacked" → attackers are antagonists (but no specific name)
              const aName = idToName.get(a) || '';
              const bName = idToName.get(b) || '';

              // True antagonist signal: protagonist_state contains the OTHER character's name
              // in a possessive or action context (e.g. "Klausman's actions", "Bill's HQ attacked")
              const aThreatensB = aName && new RegExp(`${aName}'?S?\\s+(?:ACTIONS?|EXPERIMENTS?|WORK|PLANS?|SCHEME)`, 'i').test(pState);
              const bThreatensA = bName && new RegExp(`${bName}'?S?\\s+(?:ACTIONS?|EXPERIMENTS?|WORK|PLANS?|SCHEME)`, 'i').test(pState);

              if (aThreatensB || bThreatensA) {
                pair.conflictBeats++;
              }
              // Note: if no explicit threat naming, the pair is NOT flagged as antagonist
              // (they may just be co-present in a battle scene, not opposed)
            }
          }
        }

        // ── ROMANTIC / FAMILY beats: all pairs in the beat ───────────────────
        else if (relationType === 'romanticBeats') {
          for (let i = 0; i < charList.length; i++) {
            for (let j = i + 1; j < charList.length; j++) {
              const [a, b] = charList[i] < charList[j] ? [charList[i], charList[j]] : [charList[j], charList[i]];
              if (pairMap.has(`${a}::${b}`)) pairMap.get(`${a}::${b}`)!.romanticBeats++;
            }
          }
        }
        else if (relationType === 'familyBeats') {
          for (let i = 0; i < charList.length; i++) {
            for (let j = i + 1; j < charList.length; j++) {
              const [a, b] = charList[i] < charList[j] ? [charList[i], charList[j]] : [charList[j], charList[i]];
              if (pairMap.has(`${a}::${b}`)) pairMap.get(`${a}::${b}`)!.familyBeats++;
            }
          }
        }
      }
    }

    // ── Step 6: Build relation records ───────────────────────────────────────
    const relationsToInsert: Array<{
      project_id: string;
      source_entity_id: string;
      target_entity_id: string;
      relation_type: string;
      source_kind: string;
      confidence: number;
    }> = [];

    for (const [, pair] of pairMap) {
      const baseConfidence = Math.min(1.0, pair.count / totalMultiCharScenes);

      // co_occurs — always inserted
      relationsToInsert.push({
        project_id: projectId,
        source_entity_id: pair.source,
        target_entity_id: pair.target,
        relation_type: "co_occurs",
        source_kind: "relation-graph-engine:v2",
        confidence: baseConfidence,
      });

      // Semantic relations — only if beat-context warrants
      const maxSemantic = Math.max(pair.conflictBeats, pair.teamBeats, pair.romanticBeats, pair.familyBeats);
      if (maxSemantic >= 1) {
        // Semantic confidence = base confidence boosted by beat presence
        const semanticConfidence = Math.min(1.0, baseConfidence + (maxSemantic * 0.1));

        if (pair.conflictBeats === maxSemantic) {
          relationsToInsert.push({
            project_id: projectId,
            source_entity_id: pair.source,
            target_entity_id: pair.target,
            relation_type: "antagonist_of",
            source_kind: "relation-graph-engine:v2",
            confidence: semanticConfidence,
          });
        }
        if (pair.teamBeats === maxSemantic) {
          relationsToInsert.push({
            project_id: projectId,
            source_entity_id: pair.source,
            target_entity_id: pair.target,
            relation_type: "ally_of",
            source_kind: "relation-graph-engine:v2",
            confidence: semanticConfidence,
          });
        }
        if (pair.romanticBeats === maxSemantic) {
          relationsToInsert.push({
            project_id: projectId,
            source_entity_id: pair.source,
            target_entity_id: pair.target,
            relation_type: "romantic_of",
            source_kind: "relation-graph-engine:v2",
            confidence: semanticConfidence,
          });
        }
        if (pair.familyBeats === maxSemantic) {
          relationsToInsert.push({
            project_id: projectId,
            source_entity_id: pair.source,
            target_entity_id: pair.target,
            relation_type: "family_of",
            source_kind: "relation-graph-engine:v2",
            confidence: semanticConfidence,
          });
        }
      }
    }

    // ── Step 7: Update protagonist flag in narrative_entities ─────────────────
    if (protagonistId) {
      // Fetch existing meta_json and merge
      const { data: existing } = await adminClient
        .from("narrative_entities")
        .select("meta_json")
        .eq("id", protagonistId)
        .single();

      const currentMeta = (existing?.meta_json as Record<string, unknown>) || {};
      await adminClient
        .from("narrative_entities")
        .update({ meta_json: { ...currentMeta, is_protagonist: true } })
        .eq("id", protagonistId);
    }

    // ── Step 8: Clear ALL existing relations for this project ─────────────────
    // (includes v1/entity-links-engine records which have different source_kind)
    await adminClient
      .from("narrative_entity_relations")
      .delete()
      .eq("project_id", projectId);

    if (relationsToInsert.length > 0) {
      const { error: insertError } = await adminClient
        .from("narrative_entity_relations")
        .insert(relationsToInsert);

      if (insertError) throw new Error(`Failed to insert relations: ${insertError.message}`);
    }

    // ── Step 9: Mark all entities as processed by v2 ─────────────────────────
    // (no-op — source_kind on each relation record is sufficient)

    return new Response(
      JSON.stringify({
        ok: true,
        relationsCreated: relationsToInsert.length,
        scenesWithCooccurrence: totalMultiCharScenes,
        protagonistId,
        protagonistName: chars.find(c => c.id === protagonistId)?.canonical_name || null,
        relationBreakdown: {
          co_occurs: relationsToInsert.filter(r => r.relation_type === "co_occurs").length,
          ally_of: relationsToInsert.filter(r => r.relation_type === "ally_of").length,
          antagonist_of: relationsToInsert.filter(r => r.relation_type === "antagonist_of").length,
          romantic_of: relationsToInsert.filter(r => r.relation_type === "romantic_of").length,
          family_of: relationsToInsert.filter(r => r.relation_type === "family_of").length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
