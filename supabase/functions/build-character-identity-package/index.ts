// @ts-nocheck
/**
 * build-character-identity-package — Assembles Character Identity Packages from Visual DNA.
 *
 * The Character Identity Package (CIP) is the stable visual identity artifact
 * for each character. It represents THE CHARACTER, not THE ACTOR.
 *
 * Constitutional rule: CIP answers "What does this character look like
 * inside the story world?" — NOT "Who is portraying this character?"
 *
 * CIP = Visual DNA + Wardrobe State + Production Design Context
 *
 * Consumers: Hero Frames, Lookbooks, Posters, Storyboards, Visual Units, VPB
 * Non-consumers: AI Actors, Voice systems, Motion systems, Video systems
 *
 * Feature gate: ENABLE_CIP_PIPELINE (default: false)
 *
 * See: cast-hero-frame-architecture-revision-v2-2026-05-31.md
 *   Constitutional Rule: CIP represents THE CHARACTER, not THE ACTOR
 *   Asset Classification: CIP outputs are character_production assets
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BuildCIPInput {
  project_id: string;
  character_name?: string;
  character_id?: string;
  mode?: "build_missing" | "refresh_all" | "single";
}

interface CIPRecord {
  face_traits: any[];
  age_range: string;
  ethnicity: any[];
  body_traits: any[];
  silhouette: string;
  visual_descriptors: any[];
  wardrobe_signals: any[];
  appearance_constraints: any[];
  style_guidance: any[];
  evidence: Record<string, any>;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Feature gate
  const enabled = Deno.env.get("ENABLE_CIP_PIPELINE") || "false";
  if (enabled !== "true") {
    console.log("[build-character-identity-package] Feature disabled (ENABLE_CIP_PIPELINE != true)");
    return new Response(
      JSON.stringify({ ok: false, skipped: true, reason: "Feature disabled: ENABLE_CIP_PIPELINE" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }

  try {
    const input: BuildCIPInput = await req.json();
    const { project_id, character_name, character_id, mode = "build_missing" } = input;

    if (!project_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "project_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Build Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    // Determine which characters to process
    let characters: { name: string; id?: string }[] = [];

    if (character_name) {
      characters.push({ name: character_name, id: character_id });
    } else {
      // Fetch all characters from project_characters or character_visual_dna
      const { data: chars } = await sb
        .from("project_characters")
        .select("id, name")
        .eq("project_id", project_id);
      
      if (chars && chars.length > 0) {
        characters = chars.map((c: any) => ({ name: c.name, id: c.id }));
      } else {
        // Fallback: get distinct character names from character_visual_dna
        const { data: dnaNames } = await sb
          .from("character_visual_dna")
          .select("character_name")
          .eq("project_id", project_id)
          .order("character_name");
        
        if (dnaNames && dnaNames.length > 0) {
          const seen = new Set<string>();
          characters = dnaNames
            .map((d: any) => d.character_name)
            .filter((n: string) => { const u = n.toLowerCase(); if (seen.has(u)) return false; seen.add(u); return true; })
            .map((n: string) => ({ name: n }));
        }
      }
    }

    if (characters.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, packages_created: 0, message: "No characters found for project" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    let packagesCreated = 0;
    const results: any[] = [];

    for (const char of characters) {
      // Skip if mode is build_missing and package already exists
      if (mode === "build_missing") {
        const { data: existing } = await sb
          .from("character_identity_packages")
          .select("id")
          .eq("project_id", project_id)
          .eq("character_name", char.name)
          .eq("is_current", true)
          .limit(1);
        
        if (existing && existing.length > 0) {
          console.log(`[build-character-identity-package] CIP already exists for ${char.name}, skipping`);
          continue;
        }
      }

      // 1. Fetch visual DNA
      const { data: dnaRecords } = await sb
        .from("character_visual_dna")
        .select("*")
        .eq("project_id", project_id)
        .eq("character_name", char.name)
        .order("version_number", { ascending: false })
        .limit(1);

      if (!dnaRecords || dnaRecords.length === 0) {
        console.log(`[build-character-identity-package] No visual DNA for ${char.name}, skipping`);
        continue;
      }

      const dna = dnaRecords[0];

      // 2. Extract guidance from visual DNA
      const packageData: CIPRecord = extractIdentityFromDNA(dna);

      // 3. Fetch wardrobe profile (enrichment)
      const { data: wardrobe } = await sb
        .from("character_wardrobe_profiles")
        .select("*")
        .eq("project_id", project_id)
        .eq("character_name", char.name)
        .eq("is_current", true)
        .limit(1);

      if (wardrobe && wardrobe.length > 0) {
        enrichFromWardrobe(packageData, wardrobe[0]);
      }

      // 4. Fetch production design world rules (enrichment)
      const { data: worldRules } = await sb
        .from("pd_world_rules")
        .select("*")
        .eq("project_id", project_id)
        .limit(5);

      if (worldRules && worldRules.length > 0) {
        enrichFromWorldRules(packageData, worldRules);
      }

      // 5. Build evidence provenance
      packageData.evidence = {
        visual_dna_id: dna.id,
        visual_dna_version: dna.version_number || 1,
        visual_dna_generated_at: dna.created_at,
        wardrobe_profile_id: wardrobe?.[0]?.id || null,
        wardrobe_version: wardrobe?.[0]?.profile_version || null,
        sources: [
          { type: "character_visual_dna", id: dna.id, field: "inferred_guidance" },
        ],
      };
      if (wardrobe?.[0]?.id) {
        packageData.evidence.sources.push({
          type: "character_wardrobe_profiles",
          id: wardrobe[0].id,
          field: "profile_data",
        });
      }

      // 6. Determine version number
      let nextVersion = 1;
      const { data: existingVersions } = await sb
        .from("character_identity_packages")
        .select("version_number")
        .eq("project_id", project_id)
        .eq("character_name", char.name)
        .order("version_number", { ascending: false })
        .limit(1);

      if (existingVersions && existingVersions.length > 0) {
        nextVersion = existingVersions[0].version_number + 1;
        // Mark previous versions as not current
        await sb
          .from("character_identity_packages")
          .update({ is_current: false })
          .eq("project_id", project_id)
          .eq("character_name", char.name)
          .eq("is_current", true);
      }

      // 7. Insert CIP
      const { data: inserted, error: insertError } = await sb
        .from("character_identity_packages")
        .insert({
          project_id,
          character_id: char.id || null,
          character_name: char.name,
          visual_dna_id: dna.id,
          face_traits: packageData.face_traits,
          age_range: packageData.age_range,
          ethnicity: packageData.ethnicity,
          body_traits: packageData.body_traits,
          silhouette: packageData.silhouette,
          visual_descriptors: packageData.visual_descriptors,
          wardrobe_signals: packageData.wardrobe_signals,
          appearance_constraints: packageData.appearance_constraints,
          style_guidance: packageData.style_guidance,
          asset_class: "character_production",
          evidence: packageData.evidence,
          generated_by: "build-character-identity-package",
          version_number: nextVersion,
          is_current: true,
          enabled: true,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error(`[build-character-identity-package] Error inserting CIP for ${char.name}:`, insertError);
        results.push({ character: char.name, status: "error", error: insertError.message });
      } else {
        packagesCreated++;
        results.push({ character: char.name, status: "created", cip_id: inserted.id, version: nextVersion });
        console.log(`[build-character-identity-package] Created CIP v${nextVersion} for ${char.name}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        packages_created: packagesCreated,
        total_characters_processed: characters.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[build-character-identity-package] Fatal error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

/**
 * Extract identity data from character_visual_dna inferred_guidance.
 * Structures raw guidance arrays into CIP fields.
 */
function extractIdentityFromDNA(dna: any): CIPRecord {
  const guidance = dna.inferred_guidance || [];
  
  const faceTraits: any[] = [];
  const bodyTraits: any[] = [];
  const visualDescriptors: any[] = [];
  let ageRange = "";
  const ethnicity: any[] = [];

  for (const g of guidance) {
    const category = (g.category || "").toLowerCase();
    const trait = {
      trait: g.label || g.value || "",
      confidence: g.confidence || "medium",
      source: g.source || "visual_dna",
      category: category,
    };

    if (category.includes("face") || category.includes("facial")) {
      faceTraits.push(trait);
    } else if (category.includes("body") || category.includes("physique") || category.includes("build")) {
      bodyTraits.push(trait);
    } else if (category.includes("age")) {
      ageRange = g.value || g.label || "";
    } else if (category.includes("ethnic") || category.includes("race")) {
      ethnicity.push(trait);
    } else if (category.includes("appearance") || category.includes("hair") || category.includes("eye")) {
      visualDescriptors.push(trait);
    } else {
      visualDescriptors.push(trait);
    }
  }

  // Extract silhouette from narrative_markers if available
  let silhouette = "";
  const markers = dna.narrative_markers || [];
  for (const m of markers) {
    if (typeof m === "string" && (m.includes("tall") || m.includes("silhouette") || m.includes("build"))) {
      silhouette = m;
      break;
    }
  }

  return {
    face_traits: faceTraits,
    age_range: ageRange,
    ethnicity: ethnicity,
    body_traits: bodyTraits,
    silhouette: silhouette || dna.silhouette || "",
    visual_descriptors: visualDescriptors,
    wardrobe_signals: [],
    appearance_constraints: [],
    style_guidance: [],
    evidence: {},
  };
}

/**
 * Enrich CIP from wardrobe profile data.
 */
function enrichFromWardrobe(pkg: CIPRecord, wardrobe: any): void {
  const profile = wardrobe.profile_data || wardrobe.wardrobe_data || {};
  
  // Extract wardrobe signals
  if (profile.garments && Array.isArray(profile.garments)) {
    pkg.wardrobe_signals = profile.garments.map((g: any) => ({
      garment: g.name || g.type || g.garment || "",
      primary: g.primary || false,
      color: g.color || "",
      era: g.era || "",
      state: g.state || g.wardrobe_state || "",
    }));
  } else if (profile.states && Array.isArray(profile.states)) {
    pkg.wardrobe_signals = profile.states.map((s: any) => ({
      garment: s.label || s.name || "",
      primary: s.is_primary || s.primary || false,
      color: s.color || "",
      era: s.era || "",
      state: s.state_key || "",
    }));
  }

  // Extract appearance constraints
  if (profile.constraints && Array.isArray(profile.constraints)) {
    pkg.appearance_constraints = profile.constraints;
  }
}

/**
 * Enrich CIP style guidance from production design world rules.
 */
function enrichFromWorldRules(pkg: CIPRecord, rules: any[]): void {
  for (const rule of rules) {
    if (rule.visual_language) {
      const lang = rule.visual_language;
      if (typeof lang === "string") {
        pkg.style_guidance.push({ guidance: lang, source: "pd_world_rules", rule_id: rule.id });
      } else if (typeof lang === "object") {
        for (const key of Object.keys(lang)) {
          pkg.style_guidance.push({ guidance: `${key}: ${lang[key]}`, source: "pd_world_rules", rule_id: rule.id });
        }
      }
    }
    if (rule.style_reference) {
      pkg.style_guidance.push({ guidance: rule.style_reference, source: "pd_world_rules", rule_id: rule.id });
    }
  }
}