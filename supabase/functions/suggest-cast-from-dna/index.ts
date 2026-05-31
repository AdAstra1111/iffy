// @ts-nocheck
/**
 * suggest-cast-from-dna — Auto-creates cast suggestions from Visual DNA.
 *
 * Creates project_ai_cast records with status='suggested' for characters
 * that have Visual DNA but no cast entry yet.
 *
 * CONSTITUTIONAL RULES:
 * 1. NEL may create project_ai_cast (status='suggested') automatically.
 * 2. NEL may NOT create ai_actors automatically.
 * 3. AI Actor creation requires explicit approval (approve-cast-suggestion).
 * 4. No automatic completion, no automatic approval, no automatic cast locking.
 *
 * Feature gate: ENABLE_CAST_SUGGESTIONS (default: false)
 *
 * See: cast-hero-frame-architecture-revision-v2-2026-05-31.md
 *   Implementation Order: Step 3
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SuggestCastInput {
  project_id: string;
  character_name?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Feature gate
  const enabled = Deno.env.get("ENABLE_CAST_SUGGESTIONS") || "false";
  if (enabled !== "true") {
    console.log("[suggest-cast-from-dna] Feature disabled (ENABLE_CAST_SUGGESTIONS != true)");
    return new Response(
      JSON.stringify({ ok: false, skipped: true, reason: "Feature disabled" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }

  try {
    const input: SuggestCastInput = await req.json();
    const { project_id, character_name } = input;

    if (!project_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "project_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = createClient(supabaseUrl, supabaseKey);

    // Determine which characters have Visual DNA
    let characters: { character_name: string; id?: string; role_category?: string }[] = [];

    // First try project_characters (uses correct actual column names)
    const { data: projectChars } = await sb
      .from("project_characters")
      .select("id, character_name, role_category")
      .eq("project_id", project_id);

    if (projectChars && projectChars.length > 0) {
      characters = projectChars.map((c: any) => ({
        character_name: c.character_name,
        id: c.id,
        role_category: c.role_category,
      }));
    } else {
      // Fallback: distinct names from character_visual_dna
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
          .map((n: string) => ({ character_name: n }));
      }
    }

    if (character_name) {
      characters = characters.filter((c) => c.character_name === character_name);
    }

    if (characters.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, suggestions_created: 0, message: "No characters found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    let suggestionsCreated = 0;
    const results: any[] = [];

    for (const char of characters) {
      // Check for existing cast entry using character_key
      const { data: existingRecords } = await sb
        .from("project_ai_cast")
        .select("id, ai_actor_id")
        .eq("project_id", project_id)
        .eq("character_key", char.character_name)
        .limit(1);
      const existing = existingRecords || [];

      // Skip if cast entry already exists (has an ai_actor_id means approved)
      if (existing.length > 0) {
        console.log(`[suggest-cast-from-dna] Cast entry already exists for ${char.character_name}, skipping`);
        results.push({ character: char.character_name, status: "skipped", existing: existing[0].ai_actor_id ? "complete" : "in_progress" });
        continue;
      }

      // Get billing order from role_category
      const billingOrder = char.role_category === "protagonist" ? 1
        : char.role_category === "antagonist" ? 2
        : char.role_category === "supporting" ? 3
        : 10;

      // Get visual DNA reference
      const { data: dna } = await sb
        .from("character_visual_dna")
        .select("id")
        .eq("project_id", project_id)
        .eq("character_name", char.character_name)
        .order("version_number", { ascending: false })
        .limit(1);

      const visualDnaId = dna?.[0]?.id || null;

      // Create cast suggestion record
      // ai_actor_id is NOT NULL — use sentinel UUID (00000000-0000-0000-0000-000000000000)
      // for suggested records. Real actor assignment happens in approve-cast-suggestion.
      const castRecord: any = {
        project_id,
        character_key: char.character_name,
        ai_actor_id: "00000000-0000-0000-0000-000000000000",
      };

      const { data: inserted, error: insertError } = await sb
        .from("project_ai_cast")
        .insert(castRecord)
        .select("id")
        .single();

      if (insertError) {
        console.error(`[suggest-cast-from-dna] Error for ${char.character_name}:`, insertError);
        results.push({ character: char.character_name, status: "error", error: insertError.message });
      } else {
        suggestionsCreated++;
        results.push({ character: char.character_name, status: "suggested", cast_id: inserted.id });
        console.log(`[suggest-cast-from-dna] Created cast suggestion for ${char.character_name}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        suggestions_created: suggestionsCreated,
        total_characters: characters.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("[suggest-cast-from-dna] Fatal error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});