/**
 * Edge Function: evaluate-visual-governance
 *
 * Reads the same Supabase tables as the frontend pipelineStatusResolver
 * and writes governance snapshots to project_visual_stage_governance.
 *
 * This function ONLY writes governance state. It does NOT trigger any
 * visual generation, auto-run, or invoke any other edge function.
 *
 * POST /evaluate-visual-governance
 * Body: { projectId: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveStageGovernance,
  computeSourceSnapshotHash,
  type PipelineInputs,
  type StaleRiskTimestamps,
} from "./governanceResolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const projectId = body?.projectId as string | undefined;

    if (!projectId) {
      return jsonRes({ error: "projectId is required" }, 400);
    }

    // ── Query all data sources in parallel ──

    const [
      { data: canonRow },
      { data: canonLocations },
      { data: styleRow },
      { data: locationAtoms },
      { data: chars },
      { data: castRows },
      { data: aiActorIds },
      { data: aiActors },
      { data: hfImages },
      { data: pdSets },
      { data: lbSections },
      { data: posterCount },
      { data: cbVersion },
      staleRiskResults,
    ] = await Promise.all([
      // 1. project_canon — canon_json content
      supabase
        .from("project_canon")
        .select("canon_json, updated_at")
        .eq("project_id", projectId)
        .maybeSingle(),

      // 2. Locations from canon_json -> locations array
      supabase
        .from("project_canon")
        .select("canon_json->locations")
        .eq("project_id", projectId)
        .maybeSingle(),

      // 3. project_visual_style
      supabase
        .from("project_visual_style")
        .select("is_complete, updated_at")
        .eq("project_id", projectId)
        .maybeSingle(),

      // 4. Location atoms fallback (vertical drama)
      supabase
        .from("atoms")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("atom_type", "location"),

      // 5. project_characters
      supabase
        .from("project_characters")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId),

      // 6. project_ai_cast
      supabase
        .from("project_ai_cast")
        .select("character_key, ai_actor_id, updated_at")
        .eq("project_id", projectId),

      // 7. ai_actor IDs for completeness check
      supabase
        .from("project_ai_cast")
        .select("ai_actor_id")
        .eq("project_id", projectId)
        .not("ai_actor_id", "is", null),

      // 8. ai_actors for anchor coverage/coherence
      supabase
        .from("ai_actors")
        .select("id, anchor_coverage_status, anchor_coherence_status"),

      // 9. project_images (hero frames)
      supabase
        .from("project_images")
        .select("id, role, is_primary, curation_state, created_at")
        .eq("project_id", projectId)
        .eq("asset_group", "hero_frame")
        .eq("generation_purpose", "hero_frame")
        .eq("is_active", true),

      // 11. visual_sets (production design)
      supabase
        .from("visual_sets")
        .select("id, domain, status, target_name, updated_at")
        .eq("project_id", projectId)
        .like("domain", "production_design_%")
        .neq("status", "archived"),

      // 12. lookbook_sections
      supabase
        .from("lookbook_sections")
        .select("id, section_status, updated_at")
        .eq("project_id", projectId),

      // 13. poster_candidates
      supabase
        .from("poster_candidates")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", "candidate"),

      // 14. concept_brief_versions
      supabase
        .from("concept_brief_versions")
        .select("version_number")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false })
        .limit(1),

      // 15. Stale-risk timestamps (parallel sub-queries)
      fetchStaleRiskTimestamps(supabase, projectId),
    ]);

    // ── Build PipelineInputs ──

    // Canon analysis
    const canonJson = (canonRow as any)?.canon_json ?? null;
    const hasCanon = !!canonJson && Object.keys(canonJson).length > 0;

    // Locations
    let locations: any[] = (canonLocations as any)?.locations ?? [];
    if (!Array.isArray(locations)) locations = [];
    const locationAtomCount = (locationAtoms as any)?.length ?? 0;
    const hasLocations = locations.length > 0 || locationAtomCount > 0;
    const locationCount = locations.length || locationAtomCount;

    // Visual style
    const styleProfile = styleRow as any;
    const hasVisualStyle = !!styleProfile;
    const visualStyleComplete = styleProfile?.is_complete ?? false;

    // Cast state
    const totalChars = (chars as any)?.length ?? 0;
    const castList = (castRows as any[]) ?? [];
    let lockedCharacters = castList.length;
    let totalCharacters = totalChars;

    // Vertical drama fallback: if no project_characters, check character atoms
    if (totalCharacters === 0) {
      const { data: charAtoms, count: atomCount } = await supabase
        .from("atoms")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("atom_type", "character");
      totalCharacters = atomCount ?? 0;

      const { data: completedAtoms } = await supabase
        .from("atoms")
        .select("id")
        .eq("project_id", projectId)
        .eq("atom_type", "character")
        .in("generation_status", ["completed", "complete"]);
      lockedCharacters = completedAtoms?.length ?? 0;
    }

    // ── Character identity readiness ──
    // Character atoms complete?
    const characterAtomsReady =
      totalCharacters > 0 && lockedCharacters > 0 && lockedCharacters >= totalCharacters;

    // Visual DNA present (direct query to avoid batch issues)
    const { data: dnaRows } = await supabase
      .from("character_visual_dna")
      .select("id")
      .eq("project_id", projectId)
      .eq("is_current", true);
    const visualDnaCount = (dnaRows as any[])?.length ?? 0;
    const hasVisualDNA = visualDnaCount > 0;

    // Actor bindings (project_ai_cast with ai_actor_id)
    const boundActorCount = castList.filter((c: any) => c.ai_actor_id).length;
    const hasActorBindings = boundActorCount > 0;

    // ── Actor anchor readiness (separate from castComplete) ──
    let actorAnchorsComplete = false;
    if (boundActorCount > 0) {
      const actorIds = castList
        .map((c: any) => c.ai_actor_id)
        .filter(Boolean);
      if (actorIds.length > 0) {
        const { data: actors } = await supabase
          .from("ai_actors")
          .select("id, anchor_coverage_status, anchor_coherence_status")
          .in("id", actorIds);
        actorAnchorsComplete = (actors ?? []).every(
          (a: any) =>
            a.anchor_coverage_status === "complete" &&
            a.anchor_coherence_status === "coherent",
        );
      }
    }

    // castComplete = character identity readiness (atoms + visual_dna)
    const castComplete = characterAtomsReady && hasVisualDNA;

    // Hero Frames state
    const images = (hfImages as any[]) ?? [];
    const heroFrameTotal = images.length;
    const heroFrameApproved = images.filter(
      (i: any) => i.curation_state === "active",
    ).length;
    const heroFramePrimaryApproved = images.some(
      (i: any) =>
        i.role === "hero_primary" &&
        i.is_primary &&
        i.curation_state === "active",
    );

    // Production Design state
    const sets = (pdSets as any[]) ?? [];
    const topLocationCount = Math.min(locationCount, 4);
    const pdTotalFamilies = topLocationCount * 2 + 2;

    // Count canonical sets
    const canonicalDomains = new Set([
      "production_design_location",
      "production_design_atmosphere",
    ]);
    const canonicalGlobalTargets: Record<string, string> = {
      production_design_texture: "Surface Language",
      production_design_motif: "Production Motifs",
    };

    let pdCreated = 0;
    let pdLocked = 0;
    for (const s of sets) {
      const isCanonical =
        canonicalDomains.has(s.domain) ||
        (canonicalGlobalTargets[s.domain] &&
          s.target_name === canonicalGlobalTargets[s.domain]);
      if (!isCanonical) continue;
      pdCreated++;
      if (s.status === "locked") pdLocked++;
    }
    const pdAllLocked = pdLocked >= pdTotalFamilies && pdTotalFamilies > 0;

    // Visual Language (derived from visual style)
    const visualLanguageApproved = visualStyleComplete;

    // Lookbook state
    const sections = (lbSections as any[]) ?? [];
    const lookbookExists = sections.some(
      (s: any) => s.section_status !== "empty_but_bootstrapped",
    );
    const lookbookStale = false; // Basic: no staleness detection from lookbook itself

    // Poster state
    const posterCandidateCount = (posterCount as any)?.count ?? 0;

    // Concept Brief state
    const cbRows = (cbVersion as any[]) ?? [];
    const conceptBriefVersion = cbRows[0]?.version_number ?? 0;

    // Stale-risk timestamps
    const staleRiskTimestamps: StaleRiskTimestamps | undefined =
      staleRiskResults ?? undefined;

    // ── Build PipelineInputs ──
    const inputs: PipelineInputs = {
      hasCanon,
      hasLocations,
      locationCount,
      hasVisualStyle,
      visualStyleComplete,
      totalCharacters,
      lockedCharacters,
      castComplete,
      hasVisualDNA,
      boundActorCount,
      hasActorBindings,
      actorAnchorsComplete,
      heroFrameTotal,
      heroFrameApproved,
      heroFramePrimaryApproved,
      pdTotalFamilies,
      pdLockedFamilies: pdLocked,
      pdCreatedFamilies: pdCreated,
      pdAllLocked,
      visualLanguageApproved,
      lookbookExists,
      lookbookStale,
      posterCandidateCount,
      conceptBriefVersion,
      staleRiskTimestamps,
    };

    // ── Resolve governance ──
    // Fetch previous governance state for hash comparison
    const { data: prevRows } = await supabase
      .from('project_visual_stage_governance')
      .select('source_snapshot_hash')
      .eq('project_id', projectId)
      .limit(1);
    const previousHash = (prevRows as any[])?.[0]?.source_snapshot_hash ?? null;

    const governance = await resolveStageGovernance(inputs, previousHash);

    // ── Compute source snapshot hash ──
    const sourceSnapshotHash = await computeSourceSnapshotHash(inputs);

    // ── Upsert into project_visual_stage_governance ──
    const now = new Date().toISOString();
    const upsertPromises = governance.map((g) =>
      supabase
        .from("project_visual_stage_governance")
        .upsert(
          {
            project_id: projectId,
            stage_id: g.stage_id,
            computed_status: g.computed_status,
            eligibility_state: g.eligibility_state,
            stale_risk: g.stale_risk,
            blocker_codes: g.blocker_codes,
            provenance_json: g.provenance_json,
            last_evaluated_at: now,
            source_snapshot_hash: sourceSnapshotHash,
          },
          {
            onConflict: "project_id, stage_id",
            ignoreDuplicates: false,
          },
        )
        .select("id, stage_id, computed_status")
        .single(),
    );

    const upsertResults = await Promise.all(upsertPromises);
    const errors = upsertResults
      .filter((r) => r.error)
      .map((r) => ({ stage_id: "unknown", error: r.error?.message }));

    // ── Return the full governance snapshot ──
    return jsonRes({
      project_id: projectId,
      evaluated_at: now,
      source_snapshot_hash: sourceSnapshotHash,
      stages: governance,
      upsert_errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: message }, 500);
  }
});

/**
 * Fetch stale-risk timestamps from all relevant tables in parallel.
 * Mirrors the frontend staleRiskQuery logic.
 */
async function fetchStaleRiskTimestamps(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
): Promise<StaleRiskTimestamps | null> {
  try {
    const [
      { data: sourceDoc },
      { data: canonRow },
      { data: styleRow },
      { data: castRows },
      { data: hfRow },
      { data: pdRow },
      { data: lbRow },
      { data: posterRow },
    ] = await Promise.all([
      supabase
        .from("project_documents")
        .select("updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("project_canon")
        .select("updated_at")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("project_visual_style")
        .select("updated_at")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase
        .from("project_ai_cast")
        .select("updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("project_images")
        .select("created_at")
        .eq("project_id", projectId)
        .eq("asset_group", "hero_frame")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("visual_sets")
        .select("updated_at")
        .eq("project_id", projectId)
        .like("domain", "production_design_%")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("lookbook_sections")
        .select("updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("poster_candidates")
        .select("created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      sourceDocUpdatedAt: (sourceDoc as any)?.updated_at ?? undefined,
      canonUpdatedAt: (canonRow as any)?.updated_at ?? undefined,
      visualStyleUpdatedAt: (styleRow as any)?.updated_at ?? undefined,
      castUpdatedAt: (castRows as any)?.updated_at ?? undefined,
      heroFrameGeneratedAt: (hfRow as any)?.created_at ?? undefined,
      pdUpdatedAt: (pdRow as any)?.updated_at ?? undefined,
      lookbookGeneratedAt: (lbRow as any)?.updated_at ?? undefined,
      posterGeneratedAt: (posterRow as any)?.created_at ?? undefined,
    };
  } catch (_err) {
    // If any timestamp query fails, return null (stale-risk will be skipped)
    return null;
  }
}