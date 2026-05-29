// @ts-nocheck
/**
 * attribute-state — Audience State Attribution Edge Function
 * 
 * Attributes a desired audience state change to specific beats/chunks
 * by querying extracted audience effects. Deterministic — no LLM calls.
 * 
 * Part of PPE Phase 0A: Audience Effect Extraction.
 * 
 * POST /attribute-state
 * Input:  { project_id, state_delta: { dimension_key, target, desired_val } }
 * Process:
 *   1. Parse state_delta (dim + target + desired value)
 *   2. Query audience_state_snapshots for effects matching dim + target
 *   3. Sum contributions to get current total
 *   4. Return ranked list of contributing beats
 * Output: { contributions: [{unit_key, dim, val, contribution, confidence}], total }
 * 
 * Deterministic — no LLM calls.
 * Timeout: 10s
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Validation ──

interface StateDelta {
  dimension_key: string;
  target: string;          // character, plot point, etc.
  desired_val: string;     // desired state value
  target_type?: string;    // optional filter
  min_confidence?: number; // optional confidence threshold (default 0.6)
}

interface Contribution {
  chunk_id: string;
  dimension_key: string;
  target: string;
  target_type: string;
  val: string;
  contribution: number;
  final_confidence: number;
  evidence_excerpt: string;
  unit_key?: string;
}

interface AttributionResult {
  contributions: Contribution[];
  total_contribution: number;
  contribution_count: number;
  dimension_key: string;
  target: string;
  desired_val: string;
}

// ── Known audience dimension keys (validated against registry) ──

const KNOWN_DIMENSIONS = new Set([
  "emotional_journey",
  "character_empathy",
  "tension_suspense",
  "thematic_resonance",
  "pacing_momentum",
  "character_arc_coherence",
  "plot_clarity",
  "genre_contract",
  "prediction_outcome",
  "immersion",
]);

// ── Main Handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { project_id, state_delta } = body;

    if (!project_id || !state_delta) {
      return new Response(JSON.stringify({
        error: "project_id and state_delta are required",
        hint: "state_delta: { dimension_key, target, desired_val, min_confidence? }",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { dimension_key, target, desired_val, target_type, min_confidence = 0.6 } = state_delta as StateDelta;

    if (!dimension_key || !target || !desired_val) {
      return new Response(JSON.stringify({
        error: "state_delta must include dimension_key, target, and desired_val",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate dimension_key against known dimensions
    if (!KNOWN_DIMENSIONS.has(dimension_key)) {
      return new Response(JSON.stringify({
        error: `Unknown dimension_key: "${dimension_key}". Must be one of: ${[...KNOWN_DIMENSIONS].join(", ")}`,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (min_confidence < 0 || min_confidence > 1.0) {
      return new Response(JSON.stringify({
        error: "min_confidence must be between 0 and 1.0",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── 1. Query audience_state_snapshots for this project ──

    let query = sb
      .from("audience_state_snapshots")
      .select("chunk_id, audience_effects, avg_confidence")
      .eq("project_id", project_id);

    const { data: snapshots, error: snapErr } = await query;

    if (snapErr) {
      console.error(`[attribute-state] Query failed: ${snapErr.message}`);
      return new Response(JSON.stringify({
        error: "QUERY_FAILED",
        message: snapErr.message,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!snapshots || snapshots.length === 0) {
      return new Response(JSON.stringify({
        contributions: [],
        total_contribution: 0,
        contribution_count: 0,
        dimension_key,
        target,
        desired_val,
        message: "No audience state snapshots found for this project. Run extract-audience-effects first.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Filter effects matching dimension + target ──

    const contributions: Contribution[] = [];

    for (const snapshot of snapshots) {
      const effects = (snapshot.audience_effects || []) as any[];
      const chunkId = snapshot.chunk_id;

      for (const effect of effects) {
        // Must match dimension_key
        if (effect.dimension_key !== dimension_key) continue;

        // Must match target (case-insensitive substring match)
        const effectTarget = (effect.target || "").toLowerCase();
        const queryTarget = target.toLowerCase();
        if (!effectTarget.includes(queryTarget) && !queryTarget.includes(effectTarget)) continue;

        // Apply confidence threshold
        const finalConf = effect.final_confidence ?? effect.model_confidence ?? 0.5;
        if (finalConf < min_confidence) continue;

        // Apply optional target_type filter
        if (target_type && effect.target_type !== target_type) continue;

        contributions.push({
          chunk_id: chunkId,
          dimension_key: effect.dimension_key,
          target: effect.target,
          target_type: effect.target_type || "unknown",
          val: effect.val,
          contribution: effect.contribution,
          final_confidence: finalConf,
          evidence_excerpt: effect.evidence_excerpt || "",
          unit_key: effect.unit_key || null,
        });
      }
    }

    // ── 3. Rank by contribution magnitude (descending) ──

    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    // ── 4. Compute total ──

    const totalContribution = Math.round(
      contributions.reduce((sum, c) => sum + c.contribution, 0) * 100
    ) / 100;

    const result: AttributionResult = {
      contributions,
      total_contribution: totalContribution,
      contribution_count: contributions.length,
      dimension_key,
      target,
      desired_val,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[attribute-state] Unhandled error: ${err?.message || err}`);

    return new Response(JSON.stringify({
      error: "INTERNAL_ERROR",
      message: err?.message || "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});