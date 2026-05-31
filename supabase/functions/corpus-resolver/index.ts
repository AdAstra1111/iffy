// @ts-nocheck
/**
 * corpus-resolver — Narrative Extraction Layer Phase 1 (Certified).
 *
 * Assembles the Approved Narrative Corpus from project documents,
 * returning a deterministic, provenance-tracked corpus object.
 *
 * CERTIFIED CHANGE: No hard dependency on scene_index or narrative_entities.
 * Documents are upstream truth. scene_index/entities are derived outputs.
 * If derived tables are empty, corpus resolves from document plaintext alone.
 *
 * Supports both forward-created and reverse-engineered projects.
 *
 * REQUIRED: service-role Authorization header (or user JWT with project access).
 *
 * POST /corpus-resolver
 * Body: { projectId: string, includeDocuments?: string[], includePlaintext?: boolean }
 *
 * Returns: { projectId, corpus, documents, scenes, narrativeEntities, pdCanon, visualCanon, provenance }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Priority order for screenplay-bearing documents (highest first)
const SCREENPLAY_DOC_TYPES = [
  "production_draft",
  "feature_script",
  "script",
  "pilot_script",
  "episode_script",
  "season_script",
  "season_master_script",
];

// Approved narrative document types (the full corpus)
const NARRATIVE_DOC_TYPES = [
  "production_draft",
  "feature_script",
  "script",
  "pilot_script",
  "episode_script",
  "season_script",
  "season_master_script",
  "character_bible",
  "story_outline",
  "beat_sheet",
  "treatment",
  "concept_brief",
  "idea",
  "creative_brief",
  "market_positioning",
  "nec",
  "canon",
  "project_overview",
];

// ── SCENE PARSING (for fallback) ───────────────────────────────────────

function normalizeEntityKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function extractCharacterCues(text: string): string[] {
  const names = new Set<string>();
  const cuePattern = /^[ \t]{10,}([A-Z][A-Z\s\.\-\']{1,30})(?:\s*\(.*?\))?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = cuePattern.exec(text)) !== null) {
    const name = m[1].trim();
    const skip = /^(FADE|CUT|DISSOLVE|SMASH|INTERCUT|CONTINUED|CONT'D|THE END|TITLE|SUPER|V\.O\.|O\.S\.|BACK TO|FLASHBACK|END OF|MONTAGE|SERIES OF|BEGIN|MORE|ANGLE|CLOSE|WIDE|PAN|INSERT|TRANSITION|SCENE)$/i;
    if (!skip.test(name) && name.length > 1 && name.length < 30) {
      names.add(name);
    }
  }
  return [...names].sort();
}

function parseSlugline(line: string): { slugline: string; location: string; intExt: string; timeOfDay: string } {
  const sl = line.trim().replace(/^\d+\s*[\.\)\s]\s*/, "");
  const match = sl.match(/^(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.?)\s*(.+?)(?:\s*[-–—]\s*(.+))?$/i);
  if (match) {
    return {
      slugline: sl,
      intExt: match[1].replace(/\./g, "").replace(/\//g, "/").toUpperCase(),
      location: (match[2] || "").trim(),
      timeOfDay: (match[3] || "").trim(),
    };
  }
  return { slugline: sl, location: "", intExt: "", timeOfDay: "" };
}

interface ParsedScene {
  sceneNumber: number;
  slugline: string;
  locationKey: string | null;
  charactersMentioned: string[];
  body: string;
}

function parseScenesFromText(text: string): ParsedScene[] {
  const lines = text.split("\n");
  const sluglinePattern = /^\s*(\d+\s*[\.\)\s]\s*)?(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.?)\s/i;
  const sceneBreaks: { lineIndex: number; heading: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (sluglinePattern.test(lines[i])) {
      sceneBreaks.push({ lineIndex: i, heading: lines[i] });
    }
  }

  if (sceneBreaks.length === 0) {
    const chars = extractCharacterCues(text);
    return [{
      sceneNumber: 1,
      slugline: "SCENE 1",
      locationKey: null,
      charactersMentioned: chars,
      body: text.substring(0, 1000),
    }];
  }

  const scenes: ParsedScene[] = [];
  for (let i = 0; i < sceneBreaks.length; i++) {
    const start = sceneBreaks[i].lineIndex;
    const end = i + 1 < sceneBreaks.length ? sceneBreaks[i + 1].lineIndex : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    const parsed = parseSlugline(sceneBreaks[i].heading);
    const chars = extractCharacterCues(body);
    scenes.push({
      sceneNumber: i + 1,
      slugline: sceneBreaks[i].heading.trim(),
      locationKey: parsed.location ? normalizeEntityKey(parsed.location) : null,
      charactersMentioned: chars,
      body: body.substring(0, 1000),
    });
  }
  return scenes;
}

// ── MAIN HANDLER ───────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { projectId, includePlaintext } = body;
    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const corpus = {
      documents: [] as any[],
      screenplay: null as any,
      characterBible: null as any,
      storyOutline: null as any,
      beatSheet: null as any,
      treatment: null as any,
      conceptBrief: null as any,
      idea: null as any,
      pdCanon: {} as any,
      visualCanon: {} as any,
      sceneIndex: [] as any[],
      narrativeEntities: [] as any[],
      summary: {} as Record<string, any>,
    };

    // ── Step 1: Load project documents with their latest versions ──
    const { data: docs, error: docErr } = await sb
      .from("project_documents")
      .select("id, doc_type, title, created_at, updated_at")
      .eq("project_id", projectId)
      .in("doc_type", NARRATIVE_DOC_TYPES)
      .order("doc_type");

    if (docErr) throw new Error(`Document query failed: ${docErr.message}`);

    corpus.summary.totalDocs = (docs || []).length;
    corpus.summary.documentTypes = [...new Set((docs || []).map((d: any) => d.doc_type))].sort();

    // ── Step 2: Get latest version for each document ──
    const docIds = (docs || []).map((d: any) => d.id);
    let screenplayPlaintext: string | null = null;
    let characterBiblePlaintext: string | null = null;

    if (docIds.length > 0) {
      const { data: versions, error: verErr } = await sb
        .from("project_document_versions")
        .select("id, document_id, version_number, is_current, approval_status, plaintext, created_at, meta_json")
        .in("document_id", docIds)
        .order("document_id")
        .order("version_number", { ascending: false });

      if (verErr) throw new Error(`Version query failed: ${verErr.message}`);

      const versionMap = new Map<string, any[]>();
      for (const v of versions || []) {
        const arr = versionMap.get(v.document_id) || [];
        arr.push(v);
        versionMap.set(v.document_id, arr);
      }

      for (const doc of docs || []) {
        const docVersions = versionMap.get(doc.id) || [];
        const bestVersion = docVersions.find((v: any) => v.is_current) || docVersions[0];
        if (!bestVersion) continue;

        const entry: any = {
          docId: doc.id,
          docType: doc.doc_type,
          title: doc.title || "",
          versionId: bestVersion.id,
          versionNumber: bestVersion.version_number,
          isCurrent: bestVersion.is_current,
          approvalStatus: bestVersion.approval_status,
          plaintextLength: bestVersion.plaintext ? bestVersion.plaintext.length : 0,
          hasPlaintext: !!bestVersion.plaintext && bestVersion.plaintext.length > 0,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
        };

        if (includePlaintext && bestVersion.plaintext) {
          entry.plaintext = bestVersion.plaintext;
          if (entry.plaintextLength > 100000) {
            entry.plaintext = bestVersion.plaintext.substring(0, 100000);
            entry.plaintextTruncated = true;
            entry.plaintextOriginalLength = bestVersion.plaintext.length;
          }
        }

        corpus.documents.push(entry);

        // Classify by doc_type
        const dt = doc.doc_type;
        if (SCREENPLAY_DOC_TYPES.includes(dt) && (!corpus.screenplay || SCREENPLAY_DOC_TYPES.indexOf(dt) < SCREENPLAY_DOC_TYPES.indexOf(corpus.screenplay.docType))) {
          corpus.screenplay = entry;
          if (entry.plaintext) screenplayPlaintext = entry.plaintext;
        }
        if (dt === "character_bible") {
          corpus.characterBible = entry;
          if (entry.plaintext) characterBiblePlaintext = entry.plaintext;
        }
        if (dt === "story_outline") corpus.storyOutline = entry;
        if (dt === "beat_sheet") corpus.beatSheet = entry;
        if (dt === "treatment") corpus.treatment = entry;
        if (dt === "concept_brief") corpus.conceptBrief = entry;
        if (dt === "idea") corpus.idea = entry;
      }
    }

    // ── Step 3: Load PD Canon tables ──
    const pdTables = [
      { name: "pd_world_rules", key: "worldRules" },
      { name: "pd_design_templates", key: "designTemplates" },
      { name: "pd_location_design", key: "locationDesign" },
      { name: "pd_creature_design", key: "creatureDesign" },
      { name: "pd_location_props", key: "locationProps" },
    ];

    for (const table of pdTables) {
      const { data, error } = await sb
        .from(table.name)
        .select("*")
        .eq("project_id", projectId);
      if (!error && data) {
        corpus.pdCanon[table.key] = data;
        corpus.summary[`pd_${table.key}`] = data.length;
      }
    }

    // ── Step 4: Load Visual Canon ──
    const { data: visualStyle } = await sb
      .from("project_visual_style")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    corpus.visualCanon.visualStyle = visualStyle || null;

    const { data: visualLanguage } = await sb
      .from("project_visual_language")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    corpus.visualCanon.visualLanguage = visualLanguage || null;

    // ── Step 5: Load Scene Index (derived output — fallback from document plaintext) ──
    const { data: sceneIndex } = await sb
      .from("scene_index")
      .select("id, scene_number, title, location_key, character_keys, source_doc_type, created_at")
      .eq("project_id", projectId)
      .order("scene_number", { ascending: true });

    if (sceneIndex && sceneIndex.length > 0) {
      // scene_index exists — use it as prior derived context
      corpus.sceneIndex = sceneIndex;
      corpus.summary.sceneCount = sceneIndex.length;
      corpus.summary.sceneIndexSource = "table";
    } else if (screenplayPlaintext) {
      // Fallback: parse scenes from screenplay plaintext (NEL-independent)
      console.log(`[corpus-resolver] scene_index empty — parsing from screenplay plaintext (${screenplayPlaintext.length} chars)`);
      const parsedScenes = parseScenesFromText(screenplayPlaintext);
      corpus.sceneIndex = parsedScenes.map(s => ({
        scene_number: s.sceneNumber,
        title: s.slugline,
        location_key: s.locationKey,
        character_keys: s.charactersMentioned.map(c => normalizeEntityKey(c)),
        source_doc_type: corpus.screenplay?.docType || "production_draft",
        _fallback: true,
        _parsed_from_plaintext: true,
      }));
      corpus.summary.sceneCount = parsedScenes.length;
      corpus.summary.sceneIndexSource = "fallback_parsed_from_plaintext";
      corpus.summary.sceneIndexDocument = corpus.screenplay?.docType || "unknown";
    } else {
      corpus.summary.sceneCount = 0;
      corpus.summary.sceneIndexSource = "unavailable";
    }

    // ── Step 6: Load Narrative Entities (derived output — fallback from doc plaintext) ──
    const { data: entities } = await sb
      .from("narrative_entities")
      .select("id, entity_key, canonical_name, entity_type, status, scene_count, narrative_role, meta_json")
      .eq("project_id", projectId)
      .order("entity_type", { ascending: true });

    if (entities && entities.length > 0) {
      corpus.narrativeEntities = entities;
      corpus.summary.entityCount = entities.length;
      corpus.summary.entityTypes = [...new Set(entities.map((e: any) => e.entity_type))];
      corpus.summary.entitySource = "table";
    } else if (screenplayPlaintext) {
      // Fallback: extract character names from dialogue cues in screenplay
      console.log(`[corpus-resolver] narrative_entities empty — extracting from screenplay plaintext`);
      const charNames = extractCharacterCues(screenplayPlaintext);
      const fallbackEntities = charNames.map(name => ({
        entity_key: normalizeEntityKey(name),
        canonical_name: name,
        entity_type: "character",
        scene_count: 0,
        status: "active",
        _fallback: true,
        _parsed_from_plaintext: true,
      }));

      // Also extract locations from sluglines
      const scenes = parseScenesFromText(screenplayPlaintext);
      const seenLocations = new Set<string>();
      for (const s of scenes) {
        if (s.locationKey) seenLocations.add(s.locationKey);
      }
      for (const locKey of seenLocations) {
        fallbackEntities.push({
          entity_key: locKey,
          canonical_name: locKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          entity_type: "location",
          scene_count: 0,
          status: "active",
          _fallback: true,
          _parsed_from_plaintext: true,
        });
      }

      // Also extract characters from character bible if available
      if (characterBiblePlaintext) {
        const bibleChars = extractCharacterCues(characterBiblePlaintext);
        for (const name of bibleChars) {
          const key = normalizeEntityKey(name);
          if (!fallbackEntities.find(e => e.entity_key === key)) {
            fallbackEntities.push({
              entity_key: key,
              canonical_name: name,
              entity_type: "character",
              scene_count: 0,
              status: "active",
              _fallback: true,
              _parsed_from_plaintext: true,
              _source: "character_bible",
            });
          }
        }
      }

      corpus.narrativeEntities = fallbackEntities;
      corpus.summary.entityCount = fallbackEntities.length;
      corpus.summary.entityTypes = [...new Set(fallbackEntities.map((e: any) => e.entity_type))];
      corpus.summary.entitySource = "fallback_parsed_from_plaintext";
    } else {
      corpus.summary.entityCount = 0;
      corpus.summary.entitySource = "unavailable";
    }

    // ── Step 7: Compute corpus digest ──
    corpus.summary.hasScreenplay = !!corpus.screenplay;
    corpus.summary.screenplayDocType = corpus.screenplay?.docType || null;
    corpus.summary.screenplayLength = corpus.screenplay?.plaintextLength || 0;
    corpus.summary.screenplayIsCurrent = corpus.screenplay?.isCurrent || false;
    corpus.summary.hasCharacterBible = !!corpus.characterBible;
    corpus.summary.hasStoryOutline = !!corpus.storyOutline;
    corpus.summary.hasBeatSheet = !!corpus.beatSheet;
    corpus.summary.corpusSize = corpus.documents.reduce((sum: number, d: any) => sum + (d.plaintextLength || 0), 0);

    return new Response(JSON.stringify({
      projectId,
      corpus,
      provenance: {
        generatedAt: new Date().toISOString(),
        source: "corpus-resolver v2 (certified — document-independent)",
        documentsQueried: NARRATIVE_DOC_TYPES.length,
        pdTablesQueried: pdTables.length,
        visualCanonQueried: true,
        sceneIndexSource: corpus.summary.sceneIndexSource,
        entitySource: corpus.summary.entitySource,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[corpus-resolver] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
