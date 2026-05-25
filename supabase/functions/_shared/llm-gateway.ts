// @ts-nocheck
/**
 * llm-gateway.ts — Unified AI call layer for all IFFY edge functions.
 *
 * Features:
 * - Retry with exponential backoff (3 attempts on 429/500/503)
 * - Hard 55-second timeout (leaves 5s for response processing within 60s function limit)
 * - Model fallback chain (PRO → BALANCED → FAST)
 * - Structured logging to llm_call_logs table
 * - Token-count tracking per project per day
 *
 * Usage:
 *   import { callAI } from "../_shared/llm-gateway.ts";
 *   const result = await callAI(supabase, projectId, "you are...", "user message", "PRO");
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ──

const GATEWAY_URL = "https://openrouter.ai/api/v1/chat/completions";

const MODELS = {
  PRO: "google/gemini-2.5-pro",
  BALANCED: "google/gemini-2.5-flash",
  FAST: "google/gemini-2.5-flash",
  FAST_LITE: "google/gemini-2.5-flash-lite",
  FLASH_IMAGE: "google/gemini-2.5-flash-image",
  PRO_IMAGE: "google/gemini-3-pro-image-preview",
};

/** Fallback chain: if PRO fails, try BALANCED, then FAST */
const FALLBACK_CHAIN = {
  PRO: ["BALANCED", "FAST"],
  BALANCED: ["FAST"],
  FAST: [],
  FAST_LITE: [],
  FLASH_IMAGE: [],
  PRO_IMAGE: [],
};

const TIMEOUT_MS = 55_000;
const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

// ── Types ──

export interface CallAIResult {
  content: string;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  retries: number;
}

// ── Core ──

/**
 * Call an AI model with retry, timeout, and fallback.
 *
 * @param supabase - Supabase client (for logging)
 * @param projectId - Project ID (for token tracking)
 * @param systemPrompt - System message
 * @param userPrompt - User message
 * @param tier - Model tier: "PRO" | "BALANCED" | "FAST" | "FAST_LITE"
 * @returns CallAIResult with content + metadata
 */
export async function callAI(
  supabase: any,
  projectId: string | null,
  systemPrompt: string,
  userPrompt: string,
  tier: keyof typeof MODELS = "BALANCED",
  callerId?: string,
): Promise<CallAIResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  // Try primary model first, then fallback chain
  const modelsToTry = [tier, ...FALLBACK_CHAIN[tier]];
  let lastError: Error | null = null;

  for (const modelKey of modelsToTry) {
    const model = MODELS[modelKey];
    if (!model) continue;

    try {
      return await attemptCall(supabase, projectId, apiKey, model, systemPrompt, userPrompt, callerId);
    } catch (err: any) {
      lastError = err;
      console.warn(`[llm-gateway] Model ${model} failed: ${err.message}. Trying fallback...`);
      // Log the failure
      try {
        await logCall(supabase, projectId, model, "fallback", 0, 0, err.message, callerId);
      } catch { /* non-fatal */ }
    }
  }

  throw lastError || new Error("All models exhausted");
}

async function attemptCall(
  supabase: any,
  projectId: string | null,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  callerId?: string,
): Promise<CallAIResult> {
  const startTime = Date.now();
  let retries = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const resp = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://iffy-analysis.vercel.app",
          "X-Title": "IFFY",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 16000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (RETRYABLE_STATUSES.has(resp.status) && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        retries++;
        console.warn(`[llm-gateway] ${model} returned ${resp.status}, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`AI call failed (${resp.status}): ${errText.substring(0, 200)}`);
      }

      const data = await resp.json();
      const latencyMs = Date.now() - startTime;
      const content = data.choices?.[0]?.message?.content || "";
      const usage = data.usage || {};

      // Log success
      try {
        await logCall(supabase, projectId, model, "success", usage.prompt_tokens || 0, usage.completion_tokens || 0, null, callerId);
      } catch { /* non-fatal */ }

      return {
        content,
        model,
        latencyMs,
        tokensIn: usage.prompt_tokens || 0,
        tokensOut: usage.completion_tokens || 0,
        retries,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === "AbortError") {
        if (attempt < MAX_RETRIES) {
          retries++;
          console.warn(`[llm-gateway] ${model} timed out (${TIMEOUT_MS}ms), retry ${attempt + 1}/${MAX_RETRIES}`);
          continue;
        }
        throw new Error(`AI call timed out after ${TIMEOUT_MS}ms and ${MAX_RETRIES} retries`);
      }

      if (attempt < MAX_RETRIES) {
        retries++;
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[llm-gateway] ${model} error: ${err.message}, retry ${attempt + 1}/${MAX_RETRIES}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw err;
    }
  }

  throw new Error(`Exhausted ${MAX_RETRIES} retries for ${model}`);
}

// ── Logging ──

async function logCall(
  supabase: any,
  projectId: string | null,
  model: string,
  status: string,
  tokensIn: number,
  tokensOut: number,
  errorMessage: string | null,
  callerId?: string,
): Promise<void> {
  if (!supabase || !projectId) return;
  try {
    await supabase.from("llm_call_logs").insert({
      project_id: projectId,
      model,
      status,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      error_message: errorMessage,
      caller_id: callerId || "unknown",
      duration_ms: null, // caller can update after
    });
  } catch (err) {
    console.warn("[llm-gateway] Failed to log call:", err?.message);
  }
}

// ── JSON Parsing Helper ──

/**
 * Parse JSON from AI response with cleanup.
 */
export function parseJSON(raw: string): any {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Safely parse JSON, returning null on failure.
 */
export function tryParseJSON(raw: string): any | null {
  try {
    return parseJSON(raw);
  } catch {
    return null;
  }
}