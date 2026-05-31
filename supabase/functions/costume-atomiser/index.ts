// @ts-nocheck
/**
 * costume-atomiser — Phase 5
 *
 * Extracts costume entities from character atoms and generates
 * rich production-ready costume atoms via OpenRouter MiniMax M2.7.
 *
 * Actions:
 *   extract      — create pending costume atom stubs from completed character atoms
 *   generate     — LLM-generate attributes for pending costume atoms (background)
 *   status       — return all costume atoms for project
 *   reset_failed — reset failed/running atoms back to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAtomiserRepository } from "../_shared/atomiser-repository.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Costume-related keywords used to detect clothing references in script text
const COSTUME_KEYWORDS = [
  "wears", "wearing", "wear", "dressed in", "dressed as", "puts on", "put on",
  "clad in", "clothed in", "donning", "donned", "sports", "sporting",
  "in a", "in an", "in his", "in her", "in their",
  "outfitted in", "attired in", "adorned in",
];

function makeAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function makeRepository() {
  return createAtomiserRepository({
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    supabaseKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  });
}

function makeStubAttributes(charName: string, charId: string) {
  return {
    characterName: charName,
    characterId: charId,
    primaryOutfit: "",
    eraAlignment: "",
    silhouette: "",
    dominantColors: [],
    fabricAndTexture: [],
    keyPieces: [],
    characterSignal: "",
    condition: "",
    distinctiveElements: [],
    fitAndMovement: "",
    associatedLocations: [],
    associatedCharacters: [],
    wardrobeEvolution: [],
    alternateOutfits: [],
    productionComplexity: "moderate",
    wardrobeRequirements: [],
    specialConsiderations: [],
    wigOrHairSystem: "",
    makeupRequirements: [],
    referenceImageTerms: [],
    costumeBudgetEstimate: "",
    confidence: 0,
    readinessBadge: "foundation",
    generationStatus: "pending",
  };
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Extract costume references from script text.
 * Looks for patterns like "wears a [clothing]", "dressed in [clothing]", etc.
 * Returns array of { character, costume, excerpt } objects.
 */
function extractCostumeRefs(text: string): { character: string; costume: string; excerpt: string }[] {
  const results: { character: string; costume: string; excerpt: string }[] = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    
    // Try each keyword
    for (const kw of COSTUME_KEYWORDS) {
      const idx = lower.indexOf(kw);
      if (idx === -1) continue;
      
      // Extract the clothing description: text after the keyword until punctuation or end
      const after = line.substring(idx + kw.length).trim();
      const endMatch = after.match(/^(.+?)[.;:!?]/);
      const costumeText = endMatch ? endMatch[1].trim() : after;
      if (!costumeText || costumeText.length < 3 || costumeText.length > 100) continue;
      
      // Try to identify the character — look at previous lines for an ALL-CAPS name
      let character = "Unknown";
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const prevLine = lines[j].trim();
        if (/^[A-Z][A-Z\s.]{2,30}$/.test(prevLine) && !prevLine.includes('INT.') && !prevLine.includes('EXT.')) {
          character = prevLine.replace(/\./g, '').trim();
          break;
        }
      }
      
      // Avoid duplicates (same character + similar costume)
      const key = `${character}:${costumeText.substring(0, 20)}`;
      if (results.some(r => `${r.character}:${r.costume.substring(0, 20)}` === key)) continue;
      
      results.push({
        character,
        costume: costumeText,
        excerpt: line.trim().substring(0, 200),
      });
    }
  }
  
  return results;
}



/**
 * Convert a flat atom row to CanonEmission format for repository upsert.
 * Domain mapping: D1 (costume) / C1 (upstream)
 */
function toCanonEmission(row: Record<string, unknown>): import("../_shared/atomiser-repository.ts").CanonEmission {
  const attrs = (row.attributes as Record<string, unknown>) || {};
  return {
    entity_key: (row.canonical_name as string) || "",
    canon_object: attrs,
    provenance: {
      source_type: "extracted",
      confidence_score: (row.confidence as number) || 0.5,
      reasoning: ["extracted_from_script_reference"],
      pcp_dependencies: ["profession_map", "genre", "climate", "period"],
    },
    cdg_context: {
      node_id: "D1",
      staleness: "FRESH",
      upstream_node: "C1",
      regeneration_count: 0,
    },
    ics_metadata: [],
    generated_at: (row.created_at as string) || new Date().toISOString(),
    generated_by: "costume_atomiser_extract",
    entity_id: (row.entity_id as string) || null,
    priority: (row.priority as number) || 50,
    readiness_state: (row.readiness_state as string) || "stub",
    generation_status: (row.generation_status as string) || "pending",
  };
}

async function handleExtract(projectId: string) {
  const admin = makeAdminClient();
  const repo = makeRepository();
  
  // 1. Get script content — try scene_graph_versions first, then season_script
  let allText = "";
  
  const { data: sceneVersions } = await admin
    .from("scene_graph_versions")
    .select("content")
    .eq("project_id", projectId)
    .limit(500);
  
  if (sceneVersions && sceneVersions.length > 0) {
    allText = sceneVersions.map((sv: any) => sv.content || "").join("\n");
    console.log(`[costume-atomiser] Scanning ${sceneVersions.length} scenes for costume refs`);
  } else {
    // Fallback: try season_script (vertical drama)
    const { data: ssDocs } = await admin
      .from("project_documents")
      .select("id, latest_version_id")
      .eq("project_id", projectId)
      .eq("doc_type", "season_script");
    
    if (ssDocs && ssDocs.length > 0 && ssDocs[0].latest_version_id) {
      const { data: version } = await admin
        .from("project_document_versions")
        .select("plaintext")
        .eq("id", ssDocs[0].latest_version_id)
        .single();
      if (version?.plaintext) {
        allText = version.plaintext;
        console.log(`[costume-atomiser] Scanning season_script for costume refs`);
      }
    }
  }
  
  if (!allText || allText.length < 100) {
    return { created: 0, message: "No script content found. Upload a script first." };
  }
  
  // 2. Extract costume references
  const refs = extractCostumeRefs(allText);
  console.log(`[costume-atomiser] Found ${refs.length} costume references in script`);
  
  if (refs.length === 0) {
    return { created: 0, message: "No explicit costume references found in script. Costumes will be handled by AI actor system." };
  }
  
  // 3. Get existing costume atoms to avoid duplicates
  const { data: existingCostumes } = await admin
    .from("atoms")
    .select("canonical_name")
    .eq("project_id", projectId)
    .eq("atom_type", "costume");
  
  const existingNames = new Set((existingCostumes || []).map((a: any) => a.canonical_name.toUpperCase()));
  
  // 4. Build costume atoms — one per reference  
  const now = new Date().toISOString();
  const toInsert: any[] = [];
  let canonicalNames = new Set<string>();
  
  for (const ref of refs) {
    // Create a canonical name like "Elara — Chef Whites" or "Liam — Lab Coat"
    const costumeName = ref.costume.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    const canonicalName = `${ref.character} — ${costumeName}`;
    
    if (existingNames.has(canonicalName.toUpperCase())) continue;
    if (canonicalNames.has(canonicalName)) continue; // dedupe within this batch
    canonicalNames.add(canonicalName);
    
    toInsert.push({
      project_id: projectId,
      atom_type: "costume",
      entity_id: null,
      canonical_name: canonicalName,
      priority: 60,
      confidence: 0,
      readiness_state: "stub",
      generation_status: "pending",
      attributes: {
        characterName: ref.character,
        characterId: null,
        primaryOutfit: costumeName,
        sourceExcerpt: ref.excerpt,
        sourceChar: ref.character,
        eraAlignment: "",
        silhouette: "",
        dominantColors: [],
        fabricAndTexture: [],
        keyPieces: [],
        characterSignal: "",
        condition: "",
        distinctiveElements: [],
        fitAndMovement: "",
        associatedLocations: [],
        associatedCharacters: [],
        wardrobeEvolution: [],
        alternateOutfits: [],
        productionComplexity: "moderate",
        wardrobeRequirements: [],
        specialConsiderations: [],
        wigOrHairSystem: "",
        makeupRequirements: [],
        referenceImageTerms: [],
        costumeBudgetEstimate: "",
        confidence: 0,
        readinessBadge: "foundation",
        generationStatus: "pending",
      },
      created_at: now,
      updated_at: now,
    });
  }
  
  if (toInsert.length === 0) {
    return { created: 0, message: "All costume references already have atoms" };
  }
  
  // 5. Insert in batches
  let totalCreated = 0;
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    const batchEmissions = batch.map(toCanonEmission);
    const result = await repo.upsertAtoms(projectId, batchEmissions, "costume");
    if (!result.success) {
      console.error("Insert batch error:", result.errors.join(", "));
      throw new Error(`Failed to insert costume atom batch: ${result.errors.join(", ")}`);
    }
    totalCreated += result.inserted_count;
  }
  
  console.log(`Created ${totalCreated} costume atoms from script references`);
  return { created: totalCreated, message: `${totalCreated} costume canon atoms extracted from script` };
}

async function handleStatus(projectId: string) {
  const admin = makeAdminClient();
  const repo = makeRepository();

  const { data: atoms, error } = await admin
    .from("atoms")
    .select("*")
    .eq("project_id", projectId)
    .eq("atom_type", "costume")
    .order("canonical_name", { ascending: true });

  if (error) throw new Error(`Failed to load costume atoms: ${error.message}`);

  return { atoms: atoms || [], count: atoms?.length || 0 };
}

async function handleResetFailed(projectId: string) {
  const admin = makeAdminClient();
  const repo = makeRepository();

  const count = await repo.bulkUpdateAtomsByStatus(projectId, "costume", ["failed", "running"], { generation_status: "pending" });

  return { reset: count || 0 };
}

async function handleGenerate(projectId: string) {
  const admin = makeAdminClient();
  const repo = makeRepository();

  // Get pending costume atoms
  const { data: pendingAtoms, error: fetchErr } = await admin
    .from("atoms")
    .select("id, entity_id, canonical_name, attributes")
    .eq("project_id", projectId)
    .eq("atom_type", "costume")
    .eq("generation_status", "pending");

  if (fetchErr) throw new Error(`Failed to fetch pending atoms: ${fetchErr.message}`);
  if (!pendingAtoms || pendingAtoms.length === 0) {
    return { spawned: false, message: "No pending costume atoms to generate" };
  }

  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) throw new Error("OPENROUTER_API_KEY not configured");

  // Mark all as running immediately
  const atomIds = pendingAtoms.map((a) => a.id);
  await repo.bulkUpdateAtomsByIds(projectId, atomIds, { generation_status: "running" });

  // Background generation
  // @ts-ignore — EdgeRuntime is Deno Deploy global
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(
    (async () => {
      for (const atom of pendingAtoms) {
        try {
          const charName = (atom.attributes as any)?.sourceChar || 
            (atom.attributes as any)?.characterName || 
            atom.canonical_name.split(' — ')[0] || 
            atom.canonical_name.replace(" — Primary Costume", "");
          const costumeName = (atom.attributes as any)?.primaryOutfit || atom.canonical_name.split(' — ').slice(1).join(' — ') || "Costume";
          console.log(`Generating costume atom: ${costumeName} for ${charName}`);

          // Check if this entity is a non-character type — log as warn, not error
          let entityType: string | null = null;
          if (atom.entity_id) {
            const { data: entityRow } = await admin
              .from("narrative_entities")
              .select("entity_type")
              .eq("id", atom.entity_id)
              .maybeSingle();
            if (entityRow?.entity_type && entityRow.entity_type !== "character") {
              entityType = entityRow.entity_type;
              console.warn(`[costume-atomiser] entity ${atom.entity_id} is type "${entityType}" — generating costume for non-character entity (this is expected for creatures, animals, etc.)`);
            }
          }

          // Get associated character atom for physical description
          let characterAtomDescription = "";
          let characterArcSummary = "";

          if (atom.entity_id && !entityType) {
            const { data: charAtom } = await admin
              .from("atoms")
              .select("attributes")
              .eq("project_id", projectId)
              .eq("atom_type", "character")
              .eq("entity_id", atom.entity_id)
              .in("generation_status", ["completed", "complete"])
              .maybeSingle();

            if (charAtom?.attributes) {
              const ca = charAtom.attributes as any;
              const parts: string[] = [];
              if (ca.age_estimate || ca.age) parts.push(`Age: ${ca.age_estimate || ca.age}`);
              if (ca.build) parts.push(`Build: ${ca.build}`);
              if (ca.height_estimate) parts.push(`Height: ${ca.height_estimate}`);
              if (ca.skin_tone) parts.push(`Skin tone: ${ca.skin_tone}`);
              if (ca.hair) parts.push(`Hair: ${ca.hair}`);
              if (ca.eyes) parts.push(`Eyes: ${ca.eyes}`);
              if (ca.physical_markings) {
                const markings = Array.isArray(ca.physical_markings)
                  ? ca.physical_markings.join(", ")
                  : String(ca.physical_markings);
                if (markings) parts.push(`Physical markings: ${markings}`);
              }
              if (ca.distinctive_features) parts.push(`Distinctive features: ${ca.distinctive_features}`);
              if (ca.physical_description) parts.push(`Physical description: ${ca.physical_description}`);
              if (ca.wardrobe_notes) parts.push(`Wardrobe notes: ${ca.wardrobe_notes}`);
              if (ca.cultural_context) parts.push(`Cultural context: ${ca.cultural_context}`);
              if (ca.movement_gait) parts.push(`Movement/Gait: ${ca.movement_gait}`);
              characterAtomDescription = parts.join("\n");
              characterArcSummary = ca.wardrobe_notes || "";
            }
          }

          // Get scene contexts where this character appears
          let sceneContexts: string[] = [];
          let associatedLocations: string[] = [];
          let sceneCount = 0;

          if (atom.entity_id) {
            const { data: charLinks } = await admin
              .from("narrative_scene_entity_links")
              .select("scene_id")
              .eq("project_id", projectId)
              .eq("entity_id", atom.entity_id)
              .eq("relation_type", "character_present")
              .limit(100);

            const linkedSceneIds = (charLinks || []).map((l) => l.scene_id);
            sceneCount = linkedSceneIds.length;

            if (linkedSceneIds.length > 0) {
              const { data: sceneVersions } = await admin
                .from("scene_graph_versions")
                .select("scene_id, slugline, summary, content, tension_delta")
                .eq("project_id", projectId)
                .in("scene_id", linkedSceneIds.slice(0, 100))
                .order("tension_delta", { ascending: false })
                .limit(10);

              for (const sv of sceneVersions || []) {
                const excerpt = (sv.summary || sv.content || "").substring(0, 300);
                sceneContexts.push(`[${sv.slugline || "SCENE"}] (tension: ${sv.tension_delta || 0}) — ${excerpt}`);
              }

              // Get location names from these scenes
              const sceneIdsForLoc = linkedSceneIds.slice(0, 30);
              const { data: locLinks } = await admin
                .from("narrative_scene_entity_links")
                .select("entity_id")
                .eq("project_id", projectId)
                .eq("relation_type", "location_present")
                .in("scene_id", sceneIdsForLoc);

              if (locLinks && locLinks.length > 0) {
                const locEntityIds = [...new Set(locLinks.map((l) => l.entity_id))];
                const { data: locEntities } = await admin
                  .from("narrative_entities")
                  .select("canonical_name")
                  .in("id", locEntityIds.slice(0, 10));

                associatedLocations = (locEntities || []).map((e) => e.canonical_name);
              }
            }
          }

          // Get character relations for contrast/similarity context
          let relations: string[] = [];
          if (atom.entity_id) {
            const { data: relRows } = await admin
              .from("narrative_entity_relations")
              .select("target_entity_id, relation_type")
              .eq("project_id", projectId)
              .eq("source_entity_id", atom.entity_id)
              .limit(10);

            if (relRows && relRows.length > 0) {
              const relEntityIds = relRows.map((r) => r.target_entity_id);
              const { data: relEntities } = await admin
                .from("narrative_entities")
                .select("id, canonical_name")
                .in("id", relEntityIds);

              const entityNameMap = new Map((relEntities || []).map((e) => [e.id, e.canonical_name]));
              relations = relRows.map((r) => `${entityNameMap.get(r.target_entity_id) || "Unknown"} (${r.relation_type})`);
            }
          }

          

          // ── CPIE Inference Integration ──
          // Fetch deterministic CPIE results for this character (REQUIRED)
          // HARD PATH: CPIE must return non-empty or generation fails
          const cpieUrl = Deno.env.get("CPIE_ENDPOINT_URL");
          if (!cpieUrl) {
            throw new Error("CPIE_ENDPOINT_URL not configured — CPIE is required for atomiser costume");
          }
          
          // Get PCP context for CPIE inference
          const { data: pcpRow } = await admin
            .from("project_context_profiles")
            .select("profile")
            .eq("project_id", projectId)
            .maybeSingle();

          if (!pcpRow?.profile) {
            throw new Error("PCP profile not found — cannot run CPIE inference for costume");
          }

          const pcp = (pcpRow.profile as any).categories || pcpRow.profile;
          const cpieCtx = {
            project_id: projectId,
            genre: pcp.project_identity?.genre?.value || pcp.genre || ["unknown"],
            period: pcp.temporal_context?.period?.value || pcp.period || "contemporary",
            climate: pcp.geographic_context?.climate?.value || pcp.climate || "temperate",
            technology_level: pcp.technology_context?.level?.value || pcp.technology_level || "contemporary",
            culture: pcp.cultural_context?.dominant_cultures?.value || pcp.culture || ["Western"],
            profession_map: pcp.professional_context?.profession_map?.value || pcp.profession_map || {},
            pcp_resolution_timestamp: new Date().toISOString(),
          };

          const cpieResponse = await fetch(cpieUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pcp: cpieCtx, domains: ["wardrobe"] }),
          });

          if (!cpieResponse.ok) {
            throw new Error(`CPIE endpoint returned ${cpieResponse.status}: cannot generate costume atom`);
          }

          const cpieResult = await cpieResponse.json();
          const entityResults = cpieResult.domains?.wardrobe || [];
          
          // Find inferences for this entity
          let cpieInferences: Array<{field: string; value: string; confidence: number; reasoning: string[]; registry_anchor_id: string; pcp_dependencies: string[]; generated_at: string; generated_by: string}> = [];
          const charEntityKey = Object.keys(cpieCtx.profession_map).find(
            k => cpieCtx.profession_map[k]?.character_name?.toLowerCase() === charName.toLowerCase()
          );
          if (charEntityKey) {
            const charResult = entityResults.find((r: any) => r.entity_key === charEntityKey);
            if (charResult?.inferences) {
              cpieInferences = charResult.inferences.map((inf: any) => ({
                field: inf.field, value: inf.value,
                confidence: inf.confidence_score, reasoning: inf.reasoning,

                registry_anchor_id: inf.registry_anchor_id,

                pcp_dependencies: inf.pcp_dependencies,

                generated_at: inf.generated_at,

                generated_by: inf.generated_by,

                }));
            }
          }
          // Fallback: use first available result
          if (cpieInferences.length === 0 && entityResults.length > 0) {
            cpieInferences = entityResults[0].inferences.map((inf: any) => ({
              field: inf.field, value: inf.value,
              confidence: inf.confidence_score, reasoning: inf.reasoning,

              registry_anchor_id: inf.registry_anchor_id,

              pcp_dependencies: inf.pcp_dependencies,

              generated_at: inf.generated_at,

              generated_by: inf.generated_by,

              }));
          }

          // HARD REQUIREMENT: CPIE must return inferences
          if (cpieInferences.length === 0) {
            throw new Error(`CPIE returned no inferences for costume generation — generation blocked`);
          }

          const cpieContext = cpieInferences.length > 0
            ? cpieInferences.map(i => `  - ${i.field}: ${i.value} (confidence: ${i.confidence}, reasoning: ${i.reasoning.join(", ")})`).join("\n")
            : "  (no CPIE data available)";
const prompt = `You are a costume designer and character visual analyst. ENHANCEMENT MODE — Core decisions have been made by CPIE.

DETERMINISTIC CPIE INFERENCES (must use):
${cpieContext}

YOUR ROLE: Generate detailed production notes, fabric descriptions, weathering details, and styling nuances for the items above. Do NOT override the CPIE-determined values — enhance them.

CHARACTER: ${charName}
SPECIFIC COSTUME: ${costumeName}
CHARACTER PHYSICAL PROFILE:
${characterAtomDescription || "No physical profile available — infer from character name and story context."}
CHARACTER ARC: ${characterArcSummary || "Unknown"}
SCENE COUNT: ${sceneCount}

ASSOCIATED CHARACTERS (for contrast/similarity): ${relations.length > 0 ? relations.join(", ") : "unknown"}
ASSOCIATED LOCATIONS (era/setting context): ${associatedLocations.length > 0 ? associatedLocations.join(", ") : "unknown"}

SCENE CONTEXTS (wardrobe cues):
${sceneContexts.length > 0 ? sceneContexts.join("\n\n") : "No scene context available — infer from character name and story world context."}

Generate a complete CostumeAtomAttributes JSON object. Use the CPIE inferences above as GROUND TRUTH for core decisions (era alignment, silhouette, primary outfit). Add ENHANCEMENT DETAILS for:
1. FABRIC & TEXTURE — specific materials, weaves, finishes
2. KEY PIECES — the 3-5 statement items that define the look
3. PRODUCTION REQUIREMENTS — how hard to build/rent/source
4. WARDROBE EVOLUTION — how the costume changes across acts
5. STYLING DETAIL — accessories, distressing, fit notes

IMPORTANT: Keep the CPIE-inferred values. The primaryOutfit, eraAlignment, and silhouette should ALIGN WITH the CPIE values above.

Output ONLY a valid JSON object (no markdown, no commentary) with ALL of the following fields:
- characterName (string — use: "${charName}")
- characterId (string — use: "${atom.entity_id || ''}")
- primaryOutfit (string — must align with CPIE inferences)
- eraAlignment (string — must align with CPIE inferences)
- silhouette (string — must align with CPIE inferences)
- dominantColors (array of 2-4 colors)
- fabricAndTexture (array of 3-5 fabric details)
- keyPieces (array of 3-5 statement pieces)
- characterSignal (string — what does the costume communicate about this character?)
- condition (string — pristine/worn/deliberately distressed)
- distinctiveElements (array of 3-5 unique details)
- fitAndMovement (string — tailored power/flowing ease/restricted)
- associatedLocations (array of location names)
- associatedCharacters (array of character names with similar/contrasting aesthetic)
- wardrobeEvolution (array of objects with fields: act, description, trigger — only if costume changes meaningfully, else empty array)
- alternateOutfits (array of objects with fields: sceneSlugline, description, reasonForChange — only if multiple distinct outfits, else empty array)
- productionComplexity (string: "simple" / "moderate" / "complex")
- wardrobeRequirements (array of sourcing/fabrication needs)
- specialConsiderations (array of production flags: stunts, weather, quick changes)
- wigOrHairSystem (string — if applicable, else empty string)
- makeupRequirements (array — if applicable, else empty array)
- referenceImageTerms (array of 3-5 mood board search terms)
- costumeBudgetEstimate (string — e.g. "$200-500 rental", "$1500 custom build")
- confidence (number 0.0-1.0 — base on CPIE confidence + detail availability)
- readinessBadge (string: "foundation" / "rich" / "verified")
- generationStatus (string: "completed") Generate a production-ready costume atom for the following specific costume.\n\nCHARACTER: ${charName}\nSPECIFIC COSTUME: ${costumeName}\nCHARACTER PHYSICAL PROFILE:
${characterAtomDescription || "No physical profile available — infer from character name and story context."}
CHARACTER ARC: ${characterArcSummary || "Unknown"}
SCENE COUNT: ${sceneCount}

ASSOCIATED CHARACTERS (for contrast/similarity): ${relations.length > 0 ? relations.join(", ") : "unknown"}
ASSOCIATED LOCATIONS (era/setting context): ${associatedLocations.length > 0 ? associatedLocations.join(", ") : "unknown"}

SCENE CONTEXTS (wardrobe cues):
${sceneContexts.length > 0 ? sceneContexts.join("\n\n") : "No scene context available — infer from character name and story world context."}

Generate a complete CostumeAtomAttributes JSON object. Focus on:
1. SILHOUETTE + ERA ALIGNMENT — what era/style does this outfit signal?
2. PRIMARY OUTFIT DESCRIPTION — specific enough to build from
3. KEY PIECES — the 3-5 statement items that define the look
4. CHARACTER SIGNAL — what does the costume COMMUNICATE about this person?
5. WARDROBE EVOLUTION — how does the costume change across acts (if at all)?
6. PRODUCTION REQUIREMENTS — how hard to build/rent?

Output ONLY a valid JSON object (no markdown, no commentary) with ALL of the following fields:
- characterName (string — use: "${charName}")
- characterId (string — use: "${atom.entity_id || ''}")
- primaryOutfit (string — 2-3 sentence description)
- eraAlignment (string — e.g. "1940s gangster", "contemporary military")
- silhouette (string — e.g. "broad-shouldered power suit", "slouchy streetwear")
- dominantColors (array of 2-4 colors)
- fabricAndTexture (array of 3-5 fabric details)
- keyPieces (array of 3-5 statement pieces)
- characterSignal (string — what does the costume communicate about this character?)
- condition (string — pristine/worn/deliberately distressed)
- distinctiveElements (array of 3-5 unique details)
- fitAndMovement (string — tailored power/flowing ease/restricted)
- associatedLocations (array of location names)
- associatedCharacters (array of character names with similar/contrasting aesthetic)
- wardrobeEvolution (array of objects with fields: act, description, trigger — only if costume changes meaningfully, else empty array)
- alternateOutfits (array of objects with fields: sceneSlugline, description, reasonForChange — only if multiple distinct outfits, else empty array)
- productionComplexity (string: "simple" / "moderate" / "complex")
- wardrobeRequirements (array of sourcing/fabrication needs)
- specialConsiderations (array of production flags: stunts, weather, quick changes)
- wigOrHairSystem (string — if applicable, else empty string)
- makeupRequirements (array — if applicable, else empty array)
- referenceImageTerms (array of 3-5 mood board search terms)
- costumeBudgetEstimate (string — e.g. "$200-500 rental", "$1500 custom build")
- confidence (number 0.0-1.0)
- readinessBadge (string: "foundation" / "rich" / "verified")
- generationStatus (string: "completed")

confidence should reflect how much visual and narrative information was available to ground the generation.`;

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://iffy-analysis.vercel.app",
              "X-Title": "IFFY Costume Atomiser",
            },
            body: JSON.stringify({
              model: "minimax/minimax-m2.7",
              messages: [
                {
                  role: "user",
                  content: prompt,
                },
              ],
              temperature: 0.7,
              max_tokens: 2000,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error(`OpenRouter error for ${charName}:`, response.status, errText);
            await repo.updateAtom(projectId, atom.id, {
                generation_status: "failed",
                updated_at: new Date().toISOString(),
              });
            continue;
          }

          const aiData = await response.json();
          const rawContent = aiData.choices?.[0]?.message?.content || "";

          // Parse JSON from response
          let generatedAttrs: Record<string, any> = {};
          try {
            const cleaned = rawContent
              .replace(/^```json\s*/i, "")
              .replace(/^```\s*/i, "")
              .replace(/```\s*$/i, "")
              .trim();
            generatedAttrs = JSON.parse(cleaned);
          } catch (parseErr) {
            console.error(`Failed to parse JSON for ${charName}:`, parseErr, "Raw:", rawContent.substring(0, 200));
            await repo.updateAtom(projectId, atom.id, {
                generation_status: "failed",
                updated_at: new Date().toISOString(),
              });
            continue;
          }

          // Ensure required fields
          const finalAttributes = {
            ...generatedAttrs,
            characterName: charName,
            characterId: atom.entity_id || "",
            generationStatus: "completed",
          };

          

          // Merge CPIE provenance into atom
          if (cpieInferences.length > 0) {
            finalAttributes.cpie_inferences_used = cpieInferences.length;
            finalAttributes._provenance = {
              source_type: "inferred",
              confidence_score: Math.min(...cpieInferences.map(i => i.confidence)),
              reasoning: cpieInferences.map(i => `field=${i.field} value="${i.value}" anchor=${i.registry_anchor_id} confidence=${i.confidence}`),
              pcp_dependencies: [...new Set(cpieInferences.flatMap(i => i.pcp_dependencies))],
            };
            finalAttributes._ics_metadata = cpieInferences.map(i => ({
              field_name: i.field,
              filled_by: "inferred",
              confidence_at_creation: i.confidence,
              registry_anchor_id: i.registry_anchor_id,
            }));
            finalAttributes._generated_by = cpieInferences[0].generated_by;
            finalAttributes._generated_at = cpieInferences[0].generated_at;
          }
          finalAttributes.generated_from_cpie = true;
const updateErr = await repo.updateAtom(projectId, atom.id, {
              generation_status: "complete",
              readiness_state: "generated",
              confidence: Math.round((generatedAttrs.confidence || 0.5) * 100),
              attributes: finalAttributes,
              updated_at: new Date().toISOString(),
            });

          if (updateErr) {
            console.error(`Failed to update atom ${atom.id}:`, updateErr);
          } else {
            console.log(`✓ Generated: ${charName} — Primary Costume`);
          }
        } catch (atomErr: any) {
          const errMsg = atomErr?.message || String(atomErr);
          console.error(`Error processing atom ${atom.id} (${atom.canonical_name}):`, errMsg);
          await repo.updateAtom(projectId, atom.id, {
              generation_status: "failed",
              attributes: { ...(atom.attributes as any || {}), _error: errMsg },
              updated_at: new Date().toISOString(),
            });
        }
      }

      console.log(`Costume atomiser generation complete for ${pendingAtoms.length} atoms`);
    })()
  );

  return { spawned: true, count: pendingAtoms.length };
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, project_id: projectId } = body;

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "Missing project_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing action. Use: extract | generate | status | reset_failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`costume-atomiser: action=${action} project=${projectId}`);

    let result: any;

    switch (action) {
      case "extract":
        result = await handleExtract(projectId);
        break;
      case "generate":
        result = await handleGenerate(projectId);
        break;
      case "status":
        result = await handleStatus(projectId);
        break;
      case "reset_failed":
        result = await handleResetFailed(projectId);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Use: extract | generate | status | reset_failed` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("costume-atomiser error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
