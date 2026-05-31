// @ts-nocheck
/**
 * corpus-resolver — Narrative Extraction Layer Phase 1.
 *
 * Assembles the Approved Narrative Corpus from project documents,
 * returning a deterministic, provenance-tracked corpus object.
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
    if (docIds.length > 0) {
      // Get the latest version per document (by version_number DESC, is_current: true priority)
      const { data: versions, error: verErr } = await sb
        .from("project_document_versions")
        .select("id, document_id, version_number, is_current, approval_status, plaintext, created_at, meta_json")
        .in("document_id", docIds)
        .order("document_id")
        .order("version_number", { ascending: false });

      if (verErr) throw new Error(`Version query failed: ${verErr.message}`);

      // Group versions by document_id, pick the best
      const versionMap = new Map<string, any[]>();
      for (const v of versions || []) {
        const arr = versionMap.get(v.document_id) || [];
        arr.push(v);
        versionMap.set(v.document_id, arr);
      }

      for (const doc of docs || []) {
        const docVersions = versionMap.get(doc.id) || [];
        // Prefer is_current=true, then highest version_number
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
          // Truncate very large plaintexts for transmission
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
        }
        if (dt === "character_bible") corpus.characterBible = entry;
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

    // ── Step 5: Load Scene Index ──
    const { data: sceneIndex } = await sb
      .from("scene_index")
      .select("id, scene_number, title, location_key, character_keys, source_doc_type, created_at")
      .eq("project_id", projectId)
      .order("scene_number", { ascending: true });
    corpus.sceneIndex = sceneIndex || [];
    corpus.summary.sceneCount = corpus.sceneIndex.length;

    // ── Step 6: Load Narrative Entities ──
    const { data: entities } = await sb
      .from("narrative_entities")
      .select("id, entity_key, canonical_name, entity_type, status, scene_count, narrative_role, meta_json")
      .eq("project_id", projectId)
      .order("entity_type", { ascending: true });
    corpus.narrativeEntities = entities || [];
    corpus.summary.entityCount = corpus.narrativeEntities.length;
    corpus.summary.entityTypes = [...new Set((entities || []).map((e: any) => e.entity_type))];

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
        source: "corpus-resolver v1",
        documentsQueried: NARRATIVE_DOC_TYPES.length,
        pdTablesQueried: pdTables.length,
        visualCanonQueried: true,
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
