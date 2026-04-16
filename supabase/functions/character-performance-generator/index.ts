/**
 * character-performance-generator — Phase 4.2
 *
 * Takes a CharacterAgentOutput (from character-agent-engine) and calls
 * MiniMax M2 to generate structured in-character performance notes.
 *
 * Input:  CharacterAgentOutput (JSON)
 * Output: { performanceNote, emotionalObjective, physicalReaction, unspokenThoughts, dramaticIrony? }
 *         dramaticIrony only for protagonist characters
 *
 * Auth: user token or service role
 * LLM:   MiniMax M2 (openrouter/minimax/minimax-m2.7)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MODEL = "minimax/minimax-m2.7";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CharacterAgentOutput {
  characterId: string;
  sceneId: string;
  projectId: string;
  characterName: string;
  isProtagonist: boolean;
  emotionalState: string;
  emotionalArc: string;
  tensionLevel: number;
  relationshipContext: string;
  thematicTags: string[];
  alliesInScene: string[];
  antagonistsInScene: string[];
  neutralInScene: string[];
  protagonistId: string;
  protagonistName: string;
  emotionalBeat: string;
  sceneNumber: string | null;
}

interface PerformanceOutput {
  ok: true;
  characterId: string;
  sceneId: string;
  characterName: string;
  performanceNote: string;
  emotionalObjective: string;
  physicalReaction: string;
  unspokenThoughts: string;
  dramaticIrony?: string;
  castingColour?: string;
  modelUsed: string;
  tokensUsed: number;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildUserPrompt(ctx: CharacterAgentOutput): string {
  // Top 3 allies and antagonists (by co-occurrence confidence — already sorted by relation-graph-engine)
  const topAllies = ctx.alliesInScene.slice(0, 3);
  const topAntags = ctx.antagonistsInScene.slice(0, 3);

  const tensionLabel =
    ctx.tensionLevel >= 8 ? "CRITICAL" :
    ctx.tensionLevel >= 6 ? "HIGH" :
    ctx.tensionLevel >= 4 ? "MODERATE" : "LOW";

  let p = `ROLE: ${ctx.characterName}${ctx.isProtagonist ? " (PROTAGONIST)" : ""}\n`;
  p += `SCENE: ${ctx.sceneNumber ?? ctx.sceneId}\n`;
  p += `BEAT: ${ctx.emotionalBeat}\n`;
  p += `STATE: ${ctx.emotionalState} | ARC: ${ctx.emotionalArc} | TENSION: ${ctx.tensionLevel}/10 (${tensionLabel})\n`;

  if (topAllies.length) p += `ALLIES: ${topAllies.join(", ")}\n`;
  if (topAntags.length) p += `ANTAGONISTS: ${topAntags.join(", ")}\n`;
  if (ctx.thematicTags.length) p += `THEMES: ${ctx.thematicTags.slice(0, 3).join(", ")}\n`;

  p += `\nOutput valid JSON with ALL of: performanceNote, emotionalObjective, physicalReaction, unspokenThoughts`;
  if (ctx.isProtagonist) p += `, dramaticIrony`;
  p += `, castingColour.\n`;
  p += `Keep each value under 40 words. Be specific, use the character's voice.`;

  return p;
}

// ── OpenRouter call ────────────────────────────────────────────────────────────

async function callMiniMax(
  systemPrompt: string,
  userPrompt: string,
  openRouterKey: string
): Promise<{ content: string; tokens: number }> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1200,
      thoughts_enabled: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax API error ${res.status}: ${text}`);
  }

  const json = await res.json() as {
    choices: Array<{ message: { content: string | null } }>;
    usage: { total_tokens: number };
  };

  return {
    content: json.choices[0]?.message?.content || "{}",
    tokens: json.usage?.total_tokens || 0,
  };
}

// ── JSON parser ────────────────────────────────────────────────────────────────

function parsePerformanceOutput(raw: string): Record<string, unknown> {
  // Strip markdown fences
  let s = raw.replace(/^```json\s*/i, "").replace(/^```\s*/im, "").replace(/\s*```$/im, "").trim();

  // Try direct parse
  try { return JSON.parse(s); } catch (_) {}

  // Find first { and last }
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  if (open !== -1 && close > open) {
    try { return JSON.parse(s.slice(open, close + 1)); } catch (_) {}
  }

  // Find any {...} block
  const match = s.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }

  return {};
}

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const client = authHeader.startsWith("Bearer eyJ")
      ? createClient(supabaseUrl, authHeader.replace("Bearer ", ""))
      : createClient(supabaseUrl, serviceRoleKey);

    const ctx: CharacterAgentOutput = await req.json();

    if (!ctx.characterId || !ctx.sceneId) {
      throw new Error("characterId and sceneId required");
    }

    const systemPrompt = `${ctx.characterName} is a film character. Output ONLY valid JSON — no prose, no explanation, no markdown fences.`;
    const userPrompt = buildUserPrompt(ctx);

    const { content, tokens } = await callMiniMax(systemPrompt, userPrompt, openRouterKey);
    const parsed = parsePerformanceOutput(content);

    const output: PerformanceOutput = {
      ok: true,
      characterId: ctx.characterId,
      sceneId: ctx.sceneId,
      characterName: ctx.characterName,
      performanceNote: typeof parsed.performanceNote === "string" ? parsed.performanceNote : "",
      emotionalObjective: typeof parsed.emotionalObjective === "string" ? parsed.emotionalObjective : "",
      physicalReaction: typeof parsed.physicalReaction === "string" ? parsed.physicalReaction : "",
      unspokenThoughts: typeof parsed.unspokenThoughts === "string" ? parsed.unspokenThoughts : "",
      dramaticIrony: ctx.isProtagonist && typeof parsed.dramaticIrony === "string"
        ? parsed.dramaticIrony
        : undefined,
      castingColour: typeof parsed.castingColour === "string" ? parsed.castingColour : undefined,
      modelUsed: MODEL,
      tokensUsed: tokens,
    };

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
