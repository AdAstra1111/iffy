// @ts-nocheck
/**
 * nel-orchestrator — Narrative Extraction Layer Phase 2.
 *
 * Orchestrates extraction pipeline from Approved Narrative Corpus to
 * Visual Production OS tables.
 *
 * Pipeline order:
 *   1. Corpus resolution (calls corpus-resolver internally)
 *   2. Character atom extraction (character-atomiser extract → generate)
 *   3. Location atom extraction (location-atomiser extract → generate)
 *   4. Prop atom extraction (prop-atomiser extract)
 *   5. Visual DNA generation (generate-visual-dna-from-canon)
 *   6. PD canon inference (infer-pd-canon)
 *   7. Governance refresh (evaluate-visual-governance)
 *
 * All triggered stages record provenance and report errors.
 * No stage breaks the pipeline — errors are collected and reported.
 *
 * POST /nel-orchestrator
 * Body: { projectId: string, stages?: string[], mode?: "full" | "extract_only" | "dna_only" }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { projectId, stages, mode } = body;
    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const functionBase = `${supabaseUrl}/functions/v1`;
    const bearerToken = authHeader; // Forward auth to sub-functions

    // Default: run all stages
    const activeStages = stages || ["corpus", "atoms", "dna", "pd_canon", "governance"];
    const pipelineMode = mode || "full";
    const results: Record<string, any> = {};
    const errors: string[] = [];
    let corpus: any = null;

    // ── STAGE 1: Corpus Resolution ──
    if (activeStages.includes("corpus")) {
      try {
        console.log(`[nel] Resolving corpus for ${projectId}`);
        const cpResp = await fetch(`${functionBase}/corpus-resolver`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, includePlaintext: true }),
        });
        if (!cpResp.ok) {
          const cpErr = await cpResp.text();
          throw new Error(`Corpus resolver failed: ${cpResp.status} — ${cpErr.substring(0, 200)}`);
        }
        const cpData = await cpResp.json();
        corpus = cpData.corpus;

        results.corpus = {
          status: "complete",
          totalDocs: corpus.summary.totalDocs,
          documentTypes: corpus.summary.documentTypes,
          hasScreenplay: corpus.summary.hasScreenplay,
          screenplayLength: corpus.summary.screenplayLength,
          sceneCount: corpus.summary.sceneCount,
          entityCount: corpus.summary.entityCount,
          corpusSize: corpus.summary.corpusSize,
        };
        console.log(`[nel] Corpus resolved: ${corpus.summary.totalDocs} docs, ${corpus.summary.corpusSize} chars`);
      } catch (e: any) {
        results.corpus = { status: "failed", error: e.message };
        errors.push(`corpus: ${e.message}`);
        // Cannot proceed without corpus
        return new Response(JSON.stringify({ projectId, pipelineMode, results, errors, fatal: true }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── STAGE 2: Character + Location + Prop Atoms ──
    if (activeStages.includes("atoms") && pipelineMode !== "dna_only") {
      // Character atoms: extract
      try {
        console.log(`[nel] Extracting character atoms for ${projectId}`);
        const chResp = await fetch(`${functionBase}/character-atomiser`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "extract", project_id: projectId }),
        });
        const chResult = chResp.ok ? await chResp.json() : { error: await chResp.text() };
        results.characterAtoms = { status: chResp.ok ? "complete" : "failed", ...chResult };
        if (!chResp.ok) errors.push(`character-atom-extract: ${JSON.stringify(chResult)}`);

        // Generate (background) — fire and forget
        if (chResp.ok) {
          try {
            await fetch(`${functionBase}/character-atomiser`, {
              method: "POST",
              headers: { Authorization: bearerToken, "Content-Type": "application/json" },
              body: JSON.stringify({ action: "generate", project_id: projectId }),
            });
            results.characterAtoms.generateSpawned = true;
          } catch (genErr: any) {
            results.characterAtoms.generateError = genErr.message;
          }
        }
      } catch (e: any) {
        results.characterAtoms = { status: "failed", error: e.message };
        errors.push(`character-atom: ${e.message}`);
      }

      // Location atoms: extract
      try {
        console.log(`[nel] Extracting location atoms for ${projectId}`);
        const locResp = await fetch(`${functionBase}/location-atomiser`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "extract", project_id: projectId }),
        });
        const locResult = locResp.ok ? await locResp.json() : { error: await locResp.text() };
        results.locationAtoms = { status: locResp.ok ? "complete" : "skipped", ...locResult };
      } catch (e: any) {
        results.locationAtoms = { status: "failed", error: e.message };
        errors.push(`location-atom: ${e.message}`);
      }

      // Prop atoms: extract
      try {
        console.log(`[nel] Extracting prop atoms for ${projectId}`);
        const prResp = await fetch(`${functionBase}/prop-atomiser`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "extract", project_id: projectId }),
        });
        const prResult = prResp.ok ? await prResp.json() : { error: await prResp.text() };
        results.propAtoms = { status: prResp.ok ? "complete" : "skipped", ...prResult };
      } catch (e: any) {
        results.propAtoms = { status: "failed", error: e.message };
        errors.push(`prop-atom: ${e.message}`);
      }
    }

    // ── STAGE 3: Visual DNA Generation ──
    if (activeStages.includes("dna")) {
      try {
        console.log(`[nel] Generating visual DNA for ${projectId}`);
        const dnaResp = await fetch(`${functionBase}/generate-visual-dna-from-canon`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, target: "all_characters", mode: "generate_missing" }),
        });
        if (!dnaResp.ok) {
          const dnaErr = await dnaResp.text();
          throw new Error(dnaErr.substring(0, 300));
        }
        const dnaResult = await dnaResp.json();
        results.visualDna = {
          status: "complete",
          created: dnaResult.created || 0,
          skipped: dnaResult.skipped || 0,
          updated: dnaResult.updated || 0,
          blocked: dnaResult.blocked || 0,
          errors: dnaResult.errors || [],
        };
        if (dnaResult.errors?.length > 0) {
          errors.push(...dnaResult.errors.map((e: string) => `visual-dna: ${e}`));
        }
      } catch (e: any) {
        results.visualDna = { status: "failed", error: e.message };
        errors.push(`visual-dna: ${e.message}`);
      }
    }

    // ── STAGE 4: PD Canon Inference ──
    if (activeStages.includes("pd_canon")) {
      try {
        console.log(`[nel] Inferring PD canon for ${projectId}`);
        const pdResp = await fetch(`${functionBase}/infer-pd-canon`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, mode: "full" }),
        });
        if (!pdResp.ok) {
          const pdErr = await pdResp.text();
          throw new Error(pdErr.substring(0, 300));
        }
        const pdResult = await pdResp.json();
        results.pdCanon = { status: "complete", ...pdResult };
      } catch (e: any) {
        results.pdCanon = { status: "failed", error: e.message };
        errors.push(`pd-canon: ${e.message}`);
      }
    }

    // ── STAGE 5: Governance Refresh ──
    if (activeStages.includes("governance")) {
      try {
        console.log(`[nel] Refreshing governance for ${projectId}`);
        const govResp = await fetch(`${functionBase}/evaluate-visual-governance`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        if (!govResp.ok) {
          const govErr = await govResp.text();
          throw new Error(govErr.substring(0, 300));
        }
        const govResult = await govResp.json();
        results.governance = { status: "complete", ...govResult };
      } catch (e: any) {
        results.governance = { status: "failed", error: e.message };
        errors.push(`governance: ${e.message}`);
      }
    }

    // ── Assemble final report ──
    return new Response(JSON.stringify({
      projectId,
      pipelineMode,
      stagesRun: activeStages,
      results,
      errors: errors.length > 0 ? errors : null,
      fatal: false,
      completedAt: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[nel-orchestrator] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
