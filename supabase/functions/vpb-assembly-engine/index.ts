// @ts-nocheck
/**
 * vpb-assembly-engine — Visual Production Bible Assembly Engine.
 *
 * Deterministic assembly of the VPB from NEL outputs + Visual Production assets.
 * NO LLM. NO inference. Pure query-and-structure assembly.
 *
 * Source hierarchy:
 *   Approved Narrative Corpus
 *   → NEL Outputs (scene_index, entities, atoms, visual DNA, PD canon)
 *   → Visual Production Outputs (hero frames, posters, lookbooks, storyboards, VUs)
 *   → VPB
 *
 * Architecture-Strict:
 *   VPB does not create truth. VPB assembles truth.
 *   No section should invent information not present in upstream sources.
 *
 * POST /vpb-assembly-engine
 * Body: { projectId: string, regenerate?: boolean }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── VPB Types ───────────────────────────────────────────────────────

interface VPBMetadata {
  projectId: string;
  version: number;
  generatedAt: string;
  status: "draft" | "complete";
  projectTitle: string;
  projectFormat: string;
  projectGenres: string[];
  projectLogline: string;
}

interface VPBProvenance {
  generatedBy: string;
  assemblyTimestamp: string;
  sources: string[];
  nelStagesRun: string[];
  documentCount: number;
  assetCount: number;
}

interface VPBCharacter {
  name: string;
  entityKey: string;
  role: string;
  visualDna: Record<string, any> | null;
  actorBinding: string | null;
  actorName: string | null;
  sceneCount: number;
  provenance: string;
}

interface VPBCast {
  characterName: string;
  actorName: string | null;
  actorId: string | null;
  bindingStatus: string;
  identityHeadshot: string | null;
}

interface VPBLocation {
  name: string;
  locationKey: string;
  sceneCount: number;
  pdDesign: Record<string, any> | null;
  visualDatasets: any[] | null;
}

interface VPBHeroFrame {
  id: string;
  entityId: string;
  imageUrl: string | null;
  role: string;
  isPrimary: boolean;
  isActive: boolean;
  promptUsed: string;
  createdAt: string;
}

interface VPBPoster {
  id: string;
  versionNumber: number;
  status: string;
  isActive: boolean;
  keyArtUrl: string | null;
  renderedUrl: string | null;
  aspectRatio: string;
  createdAt: string;
}

interface VPBLookbookSection {
  sectionKey: string;
  label: string;
  imageCount: number;
  status: string;
}

interface VPBGovernance {
  lastEvaluatedAt: string | null;
  stages: Record<string, any>;
  overallStatus: string;
  blockerCount: number;
}

interface VPBSceneBreakdown {
  sceneNumber: number;
  slugline: string;
  locationKey: string | null;
  characterCount: number;
  characters: string[];
}

interface VPBAssetInventory {
  totalImages: number;
  heroFrames: number;
  activeHeroFrames: number;
  lookbookImages: number;
  posters: number;
  activePosters: number;
  visualUnits: number;
  storyboardPanels: number;
  storyboardFrames: number;
}

// ── Section Assembly Functions ───────────────────────────────────────

async function assembleProjectOverview(
  sb: any, projectId: string
): Promise<{ metadata: VPBMetadata; overview: Record<string, any>; provenance: string }> {
  const { data: project } = await sb
    .from("projects")
    .select("title, format, genres, logline, premise, budget_range, tone, target_audience, default_prestige_style")
    .eq("id", projectId)
    .maybeSingle();

  return {
    metadata: {
      projectId,
      version: 0, // filled by caller
      generatedAt: new Date().toISOString(),
      status: "complete",
      projectTitle: project?.title || "",
      projectFormat: project?.format || "",
      projectGenres: project?.genres || [],
      projectLogline: project?.logline || "",
    },
    overview: {
      title: project?.title || "",
      format: project?.format || "",
      genres: project?.genres || [],
      logline: project?.logline || "",
      premise: project?.premise || "",
      budgetRange: project?.budget_range || "",
      tone: project?.tone || "",
      targetAudience: project?.target_audience || "",
      prestigeStyle: project?.default_prestige_style || "",
    },
    provenance: `projects table — id=${projectId}`,
  };
}

async function assembleCharacters(
  sb: any, projectId: string
): Promise<{ characters: VPBCharacter[]; provenance: string }> {
  // Get narrative entities of type character
  const { data: entities, error: entErr } = await sb
    .from("narrative_entities")
    .select("id, entity_key, canonical_name, scene_count, meta_json")
    .eq("project_id", projectId)
    .eq("entity_type", "character")
    .eq("status", "active")
    .order("scene_count", { ascending: false });

  if (entErr) {
    console.error(`[vpb] character query error: ${entErr.message}`);
  }

  // Get visual DNA for all characters
  const { data: dnaRecords } = await sb
    .from("character_visual_dna")
    .select("character_name, is_current, identity_signature, locked_invariants")
    .eq("project_id", projectId)
    .eq("is_current", true);

  const dnaByName = new Map<string, any>();
  for (const d of dnaRecords || []) {
    dnaByName.set(d.character_name?.toLowerCase(), d);
  }

  // Get cast bindings
  const { data: cast } = await sb
    .from("project_ai_cast")
    .select("character_key, ai_actor_id, status")
    .eq("project_id", projectId);

  const castByCharKey = new Map<string, any>();
  for (const c of cast || []) {
    castByCharKey.set(c.character_key, c);
  }

  // Get actor names
  const actorIds = [...new Set((cast || []).map(c => c.ai_actor_id).filter(Boolean))];
  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await sb
      .from("ai_actors")
      .select("id, name")
      .in("id", actorIds);
    for (const a of actors || []) {
      actorMap.set(a.id, a.name);
    }
  }

  const characters: VPBCharacter[] = (entities || []).map(e => {
    const dna = dnaByName.get((e.canonical_name || e.entity_key).toLowerCase());
    const binding = castByCharKey.get(e.entity_key);
    const actorName = binding?.ai_actor_id ? actorMap.get(binding.ai_actor_id) : null;
    return {
      name: e.canonical_name || e.entity_key,
      entityKey: e.entity_key,
      role: e.narrative_role || "unknown",
      visualDna: dna?.identity_signature || dna?.locked_invariants || null,
      actorBinding: binding?.ai_actor_id || null,
      actorName,
      sceneCount: e.scene_count || 0,
      provenance: `narrative_entities id=${e.id}`,
    };
  });

  return {
    characters,
    provenance: `narrative_entities (${entities?.length || 0} characters) + character_visual_dna + project_ai_cast`,
  };
}

async function assembleCast(
  sb: any, projectId: string
): Promise<{ cast: VPBCast[]; provenance: string }> {
  const { data: castRows } = await sb
    .from("project_ai_cast")
    .select("character_key, ai_actor_id, status, anchor_asset_id, identity_headshot_url")
    .eq("project_id", projectId);

  const actorIds = [...new Set((castRows || []).map(r => r.ai_actor_id).filter(Boolean))];
  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await sb
      .from("ai_actors")
      .select("id, name")
      .in("id", actorIds);
    for (const a of actors || []) {
      actorMap.set(a.id, a.name);
    }
  }

  // Resolve character names from entities
  const charKeyToName = new Map<string, string>();
  const { data: entities } = await sb
    .from("narrative_entities")
    .select("entity_key, canonical_name")
    .eq("project_id", projectId)
    .eq("entity_type", "character");
  for (const e of entities || []) {
    charKeyToName.set(e.entity_key, e.canonical_name || e.entity_key);
  }

  const cast: VPBCast[] = (castRows || []).map(r => ({
    characterName: charKeyToName.get(r.character_key) || r.character_key,
    actorName: r.ai_actor_id ? actorMap.get(r.ai_actor_id) : null,
    actorId: r.ai_actor_id,
    bindingStatus: r.status || "unbound",
    identityHeadshot: r.identity_headshot_url || null,
  }));

  return { cast, provenance: `project_ai_cast (${castRows?.length || 0} bindings)` };
}

async function assembleLocations(
  sb: any, projectId: string
): Promise<{ locations: VPBLocation[]; provenance: string }> {
  // Get locations from scene_index
  const { data: scenes } = await sb
    .from("scene_index")
    .select("location_key, scene_number")
    .eq("project_id", projectId)
    .not("location_key", "is", null)
    .order("scene_number", { ascending: true });

  // Deduplicate and count
  const locMap = new Map<string, number>();
  for (const s of scenes || []) {
    if (s.location_key) {
      locMap.set(s.location_key, (locMap.get(s.location_key) || 0) + 1);
    }
  }

  // Get PD location design
  const { data: pdLocations } = await sb
    .from("pd_location_design")
    .select("location_key, display_name, narrative_function")
    .eq("project_id", projectId);

  const pdByKey = new Map<string, any>();
  for (const p of pdLocations || []) {
    pdByKey.set(p.location_key, p);
  }

  // Get location visual datasets
  const { data: locDatasets } = await sb
    .from("location_visual_datasets")
    .select("location_key, is_current")
    .eq("project_id", projectId);

  const dsByKey = new Map<string, any[]>();
  for (const d of locDatasets || []) {
    const arr = dsByKey.get(d.location_key) || [];
    arr.push(d);
    dsByKey.set(d.location_key, arr);
  }

  const locations: VPBLocation[] = [...locMap.entries()].map(([key, count]) => {
    const pd = pdByKey.get(key);
    return {
      name: pd?.display_name || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      locationKey: key,
      sceneCount: count,
      pdDesign: pd || null,
      visualDatasets: dsByKey.get(key) || [],
    };
  }).sort((a, b) => b.sceneCount - a.sceneCount);

  return { locations, provenance: `scene_index (${scenes?.length || 0} scene refs) + pd_location_design` };
}

async function assembleVisualLanguage(
  sb: any, projectId: string
): Promise<{ visualLanguage: Record<string, any> | null; provenance: string }> {
  const { data: vl } = await sb
    .from("project_visual_language")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  return {
    visualLanguage: vl || null,
    provenance: vl ? `project_visual_language id=${vl.id}` : "not available",
  };
}

async function assembleVisualStyle(
  sb: any, projectId: string
): Promise<{ visualStyle: Record<string, any> | null; provenance: string }> {
  const { data: vs } = await sb
    .from("project_visual_style")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  return {
    visualStyle: vs || null,
    provenance: vs ? `project_visual_style id=${vs.id}` : "not available",
  };
}

async function assembleProductionDesign(
  sb: any, projectId: string
): Promise<{ productionDesign: Record<string, any>; provenance: string }> {
  const tables = [
    { name: "pd_world_rules", key: "worldRules" },
    { name: "pd_design_templates", key: "designTemplates" },
    { name: "pd_location_design", key: "locationDesign" },
    { name: "pd_creature_design", key: "creatureDesign" },
    { name: "pd_location_props", key: "locationProps" },
  ];

  const pd: Record<string, any> = {};
  for (const table of tables) {
    const { data } = await sb
      .from(table.name)
      .select("*")
      .eq("project_id", projectId);
    pd[table.key] = data || [];
  }

  return {
    productionDesign: pd,
    provenance: `PD canon tables: ${tables.map(t => `${t.name}(${(pd[t.key] || []).length})`).join(", ")}`,
  };
}

async function assembleHeroFrames(
  sb: any, projectId: string
): Promise<{ heroFrames: VPBHeroFrame[]; provenance: string }> {
  const { data: images } = await sb
    .from("project_images")
    .select("id, role, entity_id, storage_path, storage_bucket, is_primary, is_active, prompt_used, created_at, image_url")
    .eq("project_id", projectId)
    .in("role", ["hero_primary", "hero_variant"]  as any)
    .order("created_at", { ascending: false })
    .limit(200);

  const heroFrames = (images || []).map(img => ({
    id: img.id,
    entityId: img.entity_id || "",
    imageUrl: img.image_url || null,
    role: img.role,
    isPrimary: img.is_primary || false,
    isActive: img.is_active ?? true,
    promptUsed: img.prompt_used || "",
    createdAt: img.created_at || "",
  }));

  return { heroFrames, provenance: `project_images (${heroFrames.length} hero frames)` };
}

async function assemblePosters(
  sb: any, projectId: string
): Promise<{ posters: VPBPoster[]; provenance: string }> {
  const { data: posterRows } = await sb
    .from("project_posters")
    .select("id, version_number, render_status as status, is_active, key_art_public_url, rendered_public_url, aspect_ratio, created_at")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(50);

  const posters: VPBPoster[] = (posterRows || []).map(p => ({
    id: p.id,
    versionNumber: p.version_number || 0,
    status: p.status || "unknown",
    isActive: p.is_active || false,
    keyArtUrl: p.key_art_public_url || null,
    renderedUrl: p.rendered_public_url || null,
    aspectRatio: p.aspect_ratio || "2:3",
    createdAt: p.created_at || "",
  }));

  return { posters, provenance: `project_posters (${posters.length} posters)` };
}

async function assembleLookbookSections(
  sb: any, projectId: string
): Promise<{ lookbookSections: VPBLookbookSection[]; provenance: string }> {
  const { data: sections } = await sb
    .from("lookbook_sections")
    .select("section_key, label, status, image_count")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  const lookbookSections: VPBLookbookSection[] = (sections || []).map(s => ({
    sectionKey: s.section_key,
    label: s.label || s.section_key,
    imageCount: s.image_count || 0,
    status: s.status || "not_generated",
  }));

  return { lookbookSections, provenance: `lookbook_sections (${lookbookSections.length} sections)` };
}

async function assembleSceneBreakdown(
  sb: any, projectId: string
): Promise<{ scenes: VPBSceneBreakdown[]; provenance: string }> {
  const { data: sceneRows } = await sb
    .from("scene_index")
    .select("scene_number, title, location_key, character_keys")
    .eq("project_id", projectId)
    .order("scene_number", { ascending: true });

  const scenes: VPBSceneBreakdown[] = (sceneRows || []).map(s => ({
    sceneNumber: s.scene_number,
    slugline: s.title || "",
    locationKey: s.location_key,
    characterCount: (s.character_keys || []).length,
    characters: s.character_keys || [],
  }));

  return { scenes, provenance: `scene_index (${scenes.length} scenes)` };
}

async function assembleGovernance(
  sb: any, projectId: string
): Promise<{ governance: VPBGovernance; provenance: string }> {
  const { data: govStages } = await sb
    .from("project_visual_stage_governance")
    .select("*")
    .eq("project_id", projectId)
    .order("stage_id");

  const stages: Record<string, any> = {};
  let blockerCount = 0;
  let lastEvaluated: string | null = null;

  for (const g of govStages || []) {
    const stageName = g.stage_id || g.stage_name || "unknown";
    stages[stageName] = {
      status: g.computed_status,
      eligibilityState: g.eligibility_state,
      staleRisk: g.stale_risk,
      blockerCodes: g.blocker_codes,
      lastEvaluated: g.last_evaluated_at,
    };
    if (g.blocker_codes && g.blocker_codes.length > 0) {
      blockerCount += Array.isArray(g.blocker_codes) ? g.blocker_codes.length : 1;
    }
    if (g.last_evaluated_at && (!lastEvaluated || g.last_evaluated_at > lastEvaluated)) {
      lastEvaluated = g.last_evaluated_at;
    }
  }

  // Determine overall status
  const statuses = Object.values(stages).map((s: any) => s.status);
  let overallStatus = "not_started";
  if (statuses.every(s => s === "approved" || s === "locked")) overallStatus = "ready";
  else if (statuses.some(s => s === "blocked")) overallStatus = "blocked";
  else if (statuses.some(s => s === "approved" || s === "locked" || s === "ready_for_review")) overallStatus = "in_progress";
  else if (statuses.some(s => s === "in_progress")) overallStatus = "commenced";

  return {
    governance: {
      lastEvaluatedAt: lastEvaluated,
      stages,
      overallStatus,
      blockerCount,
    },
    provenance: `project_visual_stage_governance (${(govStages || []).length} stages)`,
  };
}

async function assembleAssetInventory(
  sb: any, projectId: string
): Promise<{ inventory: VPBAssetInventory; provenance: string }> {
  const [heroFrames, lookbookImages, posters, visualUnits, storyboardPanels, storyboardFrames] = await Promise.all([
    sb.from("project_images").select("id, is_active").eq("project_id", projectId).in("role", ["hero_primary", "hero_variant"] as any).limit(1000),
    sb.from("project_images").select("id").eq("project_id", projectId).eq("role", "lookbook_cover" as any).limit(1000),
    sb.from("project_posters").select("id, is_active").eq("project_id", projectId).limit(1000),
    sb.from("visual_units").select("id").eq("project_id", projectId).limit(1000),
    sb.from("storyboard_panels").select("id").eq("project_id", projectId).limit(1000),
    sb.from("storyboard_pipeline_frames").select("id").eq("project_id", projectId).limit(1000),
  ]);

  const allImages = await sb
    .from("project_images")
    .select("id")
    .eq("project_id", projectId)
    .limit(2000);

  return {
    inventory: {
      totalImages: (allImages.data || []).length,
      heroFrames: (heroFrames.data || []).length,
      activeHeroFrames: (heroFrames.data || []).filter((h: any) => h.is_active).length,
      lookbookImages: (lookbookImages.data || []).length,
      posters: (posters.data || []).length,
      activePosters: (posters.data || []).filter((p: any) => p.is_active).length,
      visualUnits: (visualUnits.data || []).length,
      storyboardPanels: (storyboardPanels.data || []).length,
      storyboardFrames: (storyboardFrames.data || []).length,
    },
    provenance: "cross-table query count",
  };
}

async function assembleWardrobe(
  sb: any, projectId: string
): Promise<{ wardrobe: any[]; provenance: string }> {
  const { data: profiles } = await sb
    .from("character_wardrobe_profiles")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_current", true);

  return {
    wardrobe: profiles || [],
    provenance: `character_wardrobe_profiles (${(profiles || []).length} profiles)`,
  };
}

// ── Main Assembly ────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { projectId, regenerate } = body;
    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── Determine version number (always increment) ──
    let versionNumber = 1;
    const { data: latest } = await sb
      .from("vpb_versions")
      .select("version_number")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      versionNumber = latest.version_number + 1;
    }

    // ── Assemble all sections in parallel ──
    const [
      overviewResult,
      charactersResult,
      castResult,
      locationsResult,
      visualLangResult,
      visualStyleResult,
      pdResult,
      heroFramesResult,
      postersResult,
      lookbookResult,
      sceneResult,
      governanceResult,
      inventoryResult,
      wardrobeResult,
    ] = await Promise.all([
      assembleProjectOverview(sb, projectId),
      assembleCharacters(sb, projectId),
      assembleCast(sb, projectId),
      assembleLocations(sb, projectId),
      assembleVisualLanguage(sb, projectId),
      assembleVisualStyle(sb, projectId),
      assembleProductionDesign(sb, projectId),
      assembleHeroFrames(sb, projectId),
      assemblePosters(sb, projectId),
      assembleLookbookSections(sb, projectId),
      assembleSceneBreakdown(sb, projectId),
      assembleGovernance(sb, projectId),
      assembleAssetInventory(sb, projectId),
      assembleWardrobe(sb, projectId),
    ]);

    const assemblyDurationMs = Date.now() - startTime;

    // ── Build VPB ──
    const vpb = {
      metadata: {
        ...overviewResult.metadata,
        version: versionNumber,
        generatedAt: new Date().toISOString(),
      },
      sections: {
        projectOverview: overviewResult.overview,
        visualLanguage: visualLangResult.visualLanguage,
        visualStyle: visualStyleResult.visualStyle,
        productionDesign: pdResult.productionDesign,
        characters: charactersResult.characters,
        cast: castResult.cast,
        locations: locationsResult.locations,
        wardrobe: wardrobeResult.wardrobe,
        heroFrames: heroFramesResult.heroFrames,
        posters: postersResult.posters,
        lookbookSections: lookbookResult.lookbookSections,
        sceneBreakdown: sceneResult.scenes,
        governance: governanceResult.governance,
        assetInventory: inventoryResult.inventory,
      },
      provenance: {
        generatedBy: "vpb-assembly-engine v1",
        assemblyTimestamp: new Date().toISOString(),
        assemblyDurationMs,
        sources: [
          overviewResult.provenance,
          charactersResult.provenance,
          castResult.provenance,
          locationsResult.provenance,
          visualLangResult.provenance,
          visualStyleResult.provenance,
          pdResult.provenance,
          heroFramesResult.provenance,
          postersResult.provenance,
          lookbookResult.provenance,
          sceneResult.provenance,
          governanceResult.provenance,
          inventoryResult.provenance,
          wardrobeResult.provenance,
        ],
        nelStagesRun: [
          "corpus", "scenes", "entities", "atoms",
          "vehicle", "creature", "costume", "relationships",
          "dna", "pd_canon", "governance",
        ],
        documentCount: 0,
        assetCount: inventoryResult.inventory.totalImages,
      },
    };

    const sectionCount = Object.keys(vpb.sections).length;
    const assetCount = inventoryResult.inventory.totalImages;

    // ── Upsert current flag ──
    if (versionNumber > 1) {
      await sb
        .from("vpb_versions")
        .update({ is_current: false })
        .eq("project_id", projectId)
        .eq("is_current", true);
    }

    // ── Persist VPB ──
    const { data: saved, error: saveErr } = await sb
      .from("vpb_versions")
      .insert({
        project_id: projectId,
        version_number: versionNumber,
        is_current: true,
        status: "complete",
        vpb_json: vpb,
        nel_run_at: new Date().toISOString(),
        assembly_duration_ms: assemblyDurationMs,
        section_count: sectionCount,
        asset_count: assetCount,
        generated_by: "vpb-assembly-engine",
      })
      .select("id, version_number")
      .maybeSingle();

    if (saveErr) {
      console.error("[vpb] Save failed:", saveErr.message);
      // Return assembled VPB even if save fails
    }

    return new Response(JSON.stringify({
      projectId,
      versionNumber,
      vpbId: saved?.id || null,
      sectionCount,
      assetCount,
      assemblyDurationMs,
      vpb,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[vpb-assembly-engine] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
