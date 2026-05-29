// @ts-nocheck
/**
 * extract-audience-effects — Audience Effect Extraction Edge Function
 * 
 * Extracts structured audience effects from a content chunk using LLM analysis.
 * Part of PPE Phase 0A: Audience Effect Extraction.
 * 
 * POST /extract-audience-effects
 * Input:  { chunk_id }
 * Process:
 *   1. Load chunk content + context from project_document_chunks
 *   2. Call LLM with extraction prompt (PPE-041 Task 2)
 *   3. Parse structured JSON response
 *   4. Compute composite confidence
 *   5. Store in meta_json
 *   6. Log to pipeline_transitions
 * Output: { success, chunk_id, effects_count, avg_confidence }
 * 
 * Prompt version: v1.0.0
 * Model: google/gemini-2.5-flash
 * Retry policy: max 2 retries, 500ms backoff, skip chunk on 2nd failure
 * Timeout: 30s per chunk (45s LLM call timeout)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveGateway, callLLM, MODELS, extractJSON } from "../_shared/llm.ts";
import { emitTransition, TRANSITION_EVENTS } from "../_shared/transitionLedger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Configuration ──

const EXTRACTION_VERSION = "1.0.0";
const PROMPT_VERSION = "1.0.0";
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 500;
const LLM_TIMEOUT_MS = 45000;

// ── Validation ──

interface AudienceEffect {
  dimension_key: string;
  target: string;
  target_type: string;
  val: string;
  contribution: number;
  model_confidence: number;
  evidence_excerpt: string;
}

interface ExtractionResult {
  effects: AudienceEffect[];
  extraction_summary: {
    total_effects: number;
    dimensions_affected: string[];
    overall_confidence: number;
  };
}

function validateExtraction(data: any): data is ExtractionResult {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.effects)) return false;
  if (!data.extraction_summary || typeof data.extraction_summary !== "object") return false;

  for (const effect of data.effects) {
    if (typeof effect.dimension_key !== "string") return false;
    if (typeof effect.target !== "string") return false;
    if (typeof effect.target_type !== "string") return false;
    if (typeof effect.val !== "string") return false;
    if (typeof effect.contribution !== "number") return false;
    if (effect.contribution < -1.0 || effect.contribution > 1.0) return false;
    if (typeof effect.model_confidence !== "number") return false;
    if (effect.model_confidence < 0 || effect.model_confidence > 1.0) return false;
    if (typeof effect.evidence_excerpt !== "string") return false;
  }
  return true;
}

// ── Composite Confidence Computation ──

function computeCompositeConfidence(effect: AudienceEffect, chunkContext: { charCount: number; hasContent: boolean }): {
  model_confidence: number;
  context_confidence: number;
  extraction_confidence: number;
  final_confidence: number;
} {
  // Factor 1: model_confidence — LLM's own assessment
  const modelConf = effect.model_confidence;

  // Factor 2: context_confidence — based on chunk quality
  let contextConf = 0.8; // baseline
  if (!chunkContext.hasContent) contextConf -= 0.3;
  if (chunkContext.charCount < 50) contextConf -= 0.2;
  if (chunkContext.charCount > 5000) contextConf -= 0.1; // very long chunks may lose focus
  contextConf = Math.max(0.1, Math.min(1.0, contextConf));

  // Factor 3: extraction_confidence — based on extraction characteristics
  let extractionConf = 0.9; // baseline
  // Very extreme contributions may be less reliable
  if (Math.abs(effect.contribution) > 0.9) extractionConf -= 0.1;
  if (Math.abs(effect.contribution) < 0.1) extractionConf -= 0.15; // too weak to be meaningful
  extractionConf = Math.max(0.1, Math.min(1.0, extractionConf));

  // Factor 4: final_confidence — weighted composite
  const finalConf = Math.round(
    (modelConf * 0.4 + contextConf * 0.25 + extractionConf * 0.35) * 100
  ) / 100;

  return {
    model_confidence: Math.round(modelConf * 100) / 100,
    context_confidence: Math.round(contextConf * 100) / 100,
    extraction_confidence: Math.round(extractionConf * 100) / 100,
    final_confidence: Math.max(0, Math.min(1.0, finalConf)),
  };
}

// ── Extraction Prompt (PPE-041 Task 2) ──

function buildExtractionPrompt(chunkContent: string, docType: string, chunkIndex: number): string {
  return `You are analyzing a narrative text chunk to extract audience effects. For each beat/narrative unit in the chunk, determine how it affects the audience across the following 10 dimensions:

DIMENSIONS:
1. emotional_journey — The emotional arc (joy, sorrow, fear, hope)
2. character_empathy — How much the audience empathizes with characters
3. tension_suspense — Level of dramatic tension and suspense
4. thematic_resonance — Clarity and power of thematic content
5. pacing_momentum — Narrative pacing and forward momentum
6. character_arc_coherence — Coherence of character development
7. plot_clarity — How clearly the plot is communicated
8. genre_contract — Adherence to genre expectations
9. prediction_outcome — Surprise vs expected outcomes
10. immersion — Audience immersion and believability

CHUNK CONTEXT:
Document type: ${docType}
Chunk index: ${chunkIndex}

CHUNK CONTENT:
${chunkContent}

INSTRUCTIONS:
Analyze the chunk and identify every distinct audience effect. Each effect captures how a specific beat/narrative unit CHANGES the audience's experience along one dimension.

For each effect, provide:
- dimension_key: One of the 10 dimensions above
- target: The character, plot point, theme, or element being affected
- target_type: One of "character", "plot_point", "theme", "setting", "relationship", "conflict", "reveal", "pacing_element"
- val: The specific value or state (e.g., "hope_increases", "tension_peaks", "empathy_established")
- contribution: How much this beat changes the audience's perception on a scale of -1.0 to 1.0
  - Positive = strengthens the dimension (e.g., more empathy, higher tension)
  - Negative = weakens the dimension (e.g., less immersion, lower tension)
  - 0 = no change
- model_confidence: How confident you are that this effect is real, 0.0 to 1.0
- evidence_excerpt: A short phrase from the text that supports this effect

Include an extraction_summary with:
- total_effects: count
- dimensions_affected: array of dimension_keys present
- overall_confidence: your overall confidence in this extraction, 0.0 to 1.0

Return ONLY valid JSON. No markdown. No commentary. Start with {.

CRITICAL: Extract CONTRIBUTION signals — how this beat CHANGES audience state, not the absolute state itself. If a beat doesn't change anything along a dimension, don't include it. Include only effects you have textual evidence for.`;
}

// ── Main Handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chunk_id } = await req.json();
    if (!chunk_id) {
      return new Response(JSON.stringify({ error: "chunk_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── 1. Load chunk content ──

    const { data: chunk, error: chunkErr } = await sb
      .from("project_document_chunks")
      .select("id, document_id, chunk_index, chunk_key, content, meta_json, char_count, status")
      .eq("id", chunk_id)
      .single();

    if (chunkErr || !chunk) {
      return new Response(JSON.stringify({
        success: false,
        error: "CHUNK_NOT_FOUND",
        message: `Chunk ${chunk_id} not found: ${chunkErr?.message || "unknown"}`,
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip chunks with no content
    if (!chunk.content || chunk.content.trim().length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "EMPTY_CONTENT",
        message: `Chunk ${chunk_id} has no content — skipping`,
        chunk_id,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing human override (must persist across re-extractions)
    // If human_validation says 'correct' with no corrections, skip re-extraction
    const existingMeta = (chunk.meta_json || {}) as Record<string, any>;
    const existingHumanVal = existingMeta.audience_extraction?.human_validation || {};
    if (existingHumanVal?.status === "correct" && existingHumanVal?.validated_by) {
      return new Response(JSON.stringify({
        success: true,
        chunk_id,
        effects_count: existingMeta.audience_extraction?.effects?.length || 0,
        avg_confidence: existingMeta.audience_extraction?.avg_confidence || 0,
        skipped: true,
        reason: "Already validated as correct — skipping re-extraction to preserve override",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get document info for doc_type context
    const { data: doc } = await sb
      .from("project_documents")
      .select("id, doc_type, project_id")
      .eq("id", chunk.document_id)
      .single();

    const docType = doc?.doc_type || "unknown";
    const projectId = doc?.project_id || null;

    // ── 2. Call LLM with extraction prompt ──

    const gateway = resolveGateway();
    const extractionPrompt = buildExtractionPrompt(
      chunk.content,
      docType,
      chunk.chunk_index
    );

    let extractionData: ExtractionResult | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.log(`[extract-audience-effects] Retry ${attempt}/${MAX_RETRIES} for chunk ${chunk_id}`);
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * Math.pow(2, attempt - 1)));
      }

      try {
        const result = await callLLM({
          apiKey: gateway.apiKey,
          model: MODELS.BALANCED, // gemini-2.5-flash
          system: "You are a narrative analysis engine. Extract audience effects from narrative text. Return ONLY valid JSON.",
          user: extractionPrompt,
          temperature: 0.1,
          maxTokens: 4000,
          timeoutMs: LLM_TIMEOUT_MS,
          retries: 1, // internal LLM retry
        });

        const parsed = JSON.parse(extractJSON(result.content));

        if (validateExtraction(parsed)) {
          extractionData = parsed;
          break;
        } else {
          lastError = "SCHEMA_VALIDATION_FAILED";
          console.error(`[extract-audience-effects] Schema validation failed on attempt ${attempt + 1} for chunk ${chunk_id}`);
        }
      } catch (err: any) {
        lastError = err?.message || "LLM_CALL_FAILED";
        console.error(`[extract-audience-effects] LLM error on attempt ${attempt + 1} for chunk ${chunk_id}: ${lastError}`);
      }
    }

    if (!extractionData) {
      // Log extraction failure
      if (projectId) {
        await emitTransition(sb, {
          projectId,
          eventType: TRANSITION_EVENTS.EXTRACTION_FAILED,
          eventDomain: "patching",
          status: "failed",
          docType,
          previousState: {},
          resultingState: { chunk_id, error: lastError, attempts: MAX_RETRIES + 1 },
          trigger: "extract-audience-effects",
        }).catch((e) => console.warn(`[extract-audience-effects] Failed to emit transition: ${e.message}`));
      }

      return new Response(JSON.stringify({
        success: false,
        error: "EXTRACTION_FAILED",
        message: `Failed to extract audience effects after ${MAX_RETRIES + 1} attempts`,
        chunk_id,
        last_error: lastError,
      }), {
        status: 200, // return 200 so the caller can handle gracefully
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Compute composite confidence per effect ──

    const chunkContext = {
      charCount: chunk.char_count || chunk.content.length,
      hasContent: chunk.content.trim().length > 0,
    };

    const enrichedEffects = extractionData.effects.map((effect) => {
      const confidence = computeCompositeConfidence(effect, chunkContext);
      return {
        ...effect,
        ...confidence,
        extraction_version: EXTRACTION_VERSION,
        prompt_version: PROMPT_VERSION,
        model: MODELS.BALANCED,
        timestamp: new Date().toISOString(),
      };
    });

    const avgConfidence = enrichedEffects.length > 0
      ? Math.round(
          (enrichedEffects.reduce((sum, e) => sum + e.final_confidence, 0) / enrichedEffects.length) * 100
        ) / 100
      : 0;

    // ── 4. Build extraction payload ──

    // Preserve any existing human_validation from previous extractions
    const existingValidation = existingMeta.audience_extraction?.human_validation || {};

    const extractionPayload = {
      audience_effects: enrichedEffects,
      extraction_version: EXTRACTION_VERSION,
      prompt_version: PROMPT_VERSION,
      model: MODELS.BALANCED,
      extraction_timestamp: new Date().toISOString(),
      avg_confidence: avgConfidence,
      effect_count: enrichedEffects.length,
      human_validation: existingValidation,
    };

    // ── 5. Store in audience_state_snapshots ──

    const { error: insertErr } = await sb
      .from("audience_state_snapshots")
      .upsert({
        project_id: projectId,
        document_id: chunk.document_id,
        chunk_id: chunk.id,
        version_id: null, // not version-specific in extraction phase
        audience_effects: enrichedEffects,
        extraction_version: EXTRACTION_VERSION,
        prompt_version: PROMPT_VERSION,
        model: MODELS.BALANCED,
        extraction_timestamp: extractionPayload.extraction_timestamp,
        avg_confidence: avgConfidence,
        effect_count: enrichedEffects.length,
        human_validation: existingValidation,
      }, {
        onConflict: "project_id, chunk_id, version_id",
        ignoreDuplicates: false,
      });

    if (insertErr) {
      console.error(`[extract-audience-effects] Failed to store snapshot for chunk ${chunk_id}: ${insertErr.message}`);
    }

    // Also update chunk meta_json for backward compatibility / quick access
    const { error: metaErr } = await sb
      .from("project_document_chunks")
      .update({
        meta_json: {
          ...existingMeta,
          audience_extraction: extractionPayload,
        },
      })
      .eq("id", chunk_id);

    if (metaErr) {
      console.warn(`[extract-audience-effects] Failed to update chunk meta_json: ${metaErr.message}`);
    }

    // ── 6. Log to pipeline_transitions ──

    if (projectId) {
      await emitTransition(sb, {
        projectId,
        eventType: TRANSITION_EVENTS.EXTRACTION_COMPLETED,
        eventDomain: "patching",
        status: "completed",
        docType,
        previousState: {},
        resultingState: {
          chunk_id,
          effects_count: enrichedEffects.length,
          avg_confidence: avgConfidence,
          dimensions: [...new Set(enrichedEffects.map((e) => e.dimension_key))],
        },
        trigger: "extract-audience-effects",
      }).catch((e) => console.warn(`[extract-audience-effects] Failed to emit transition: ${e.message}`));
    }

    return new Response(JSON.stringify({
      success: true,
      chunk_id,
      effects_count: enrichedEffects.length,
      avg_confidence: avgConfidence,
      dimensions_affected: [...new Set(enrichedEffects.map((e) => e.dimension_key))],
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[extract-audience-effects] Unhandled error: ${err?.message || err}`);

    return new Response(JSON.stringify({
      success: false,
      error: "INTERNAL_ERROR",
      message: err?.message || "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});