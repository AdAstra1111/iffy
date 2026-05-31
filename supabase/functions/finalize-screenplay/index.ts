// @ts-nocheck
/**
 * finalize-screenplay — Deterministic Screenplay Finalization Pass.
 *
 * Converts raw assembled screenplay output into canonical screenplay format.
 *
 * Pipeline position:
 *   Feature Script → FINALIZE → Production Draft → Story Ingestion → ...
 *
 * Rules:
 *   - Deterministic only — NO LLM calls, NO rewrites, NO story changes
 *   - Normalizes presentation and canonical identifiers only
 *   - Strips HTML, normalizes names/ages, formats dialogue properly
 *   - Preserves ALL content (scenes, dialogue, action)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const body = await req.json();
    const { projectId, versionId } = body;
    if (!projectId || !versionId) {
      return jsonRes({ error: "projectId and versionId required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── 1. Load feature script plaintext ──
    const { data: ver, error: verErr } = await sb
      .from("project_document_versions")
      .select("id, document_id, version_number, plaintext, meta_json")
      .eq("id", versionId)
      .single();

    if (verErr || !ver) {
      return jsonRes({ error: "Version not found" }, 404);
    }

    let text = ver.plaintext || "";
    if (!text || text.length < 100) {
      return jsonRes({ error: "Feature script too short or empty" }, 400);
    }

    const originalLength = text.length;
    const auditBefore: Record<string, number> = {};

    // ── 2. Load canonical characters from canon_json ──
    const { data: canon } = await sb
      .from("project_canon")
      .select("canon_json")
      .eq("project_id", projectId)
      .maybeSingle();

    const canonChars: Array<{ name: string; role?: string; age_range?: string }> =
      canon?.canon_json?.characters || [];

    // Build canonical name map: lowercase name → canonical form
    const canonicalNames: Record<string, string> = {};
    const canonicalAges: Record<string, string> = {};
    for (const c of canonChars) {
      const baseName = c.name || "";
      if (baseName) {
        // Full name
        canonicalNames[baseName.toLowerCase()] = baseName;
        canonicalAges[baseName.toLowerCase()] = c.age_range || "";
        // First name only (for matching in dialogue)
        const first = baseName.split(" ")[0];
        if (first) {
          canonicalNames[first.toLowerCase()] = baseName;
        }
      }
    }

    // ── 3. Apply transformations ──

    // Audit counters
    const audit: Record<string, number> = { centerTags: 0, nameFixed: 0, ageFixed: 0 };

    // 3a. Strip <center> tags and format dialogue cues properly
    // Pattern: <center>CHARACTER NAME</center>dialogue text
    // Becomes: properly formatted screenplay dialogue
    const centerRe = /<center>\s*([^<]+?)\s*<\/center>\s*/gi;
    audit.centerTags = (text.match(/<center>/gi) || []).length;
    text = text.replace(centerRe, (match, name) => {
      return name.trim().toUpperCase() + "\n";
    });

    // 3b. Also handle cases where </center> appears without opening (orphan)
    const closeCenterRe = /<\/center>\s*/gi;
    audit.orphanClose = (text.match(/<\/center>/gi) || []).length;

    // 3c. Normalize character cues — ensure they're uppercase and properly spaced
    // This handles cues like "Marcus" → "MARCUS" in dialogue positions
    // A dialogue cue is on its own line, not a slugline (INT./EXT.), not action
    // We target lines that look like character names before dialogue

    // 3d. Normalize character names in dialogue cues against canon
    // For each canonical character, find dialogue cues using non-canonical variants
    // and replace with canonical full name
    for (const [lowerName, canonName] of Object.entries(canonicalNames)) {
      if (!canonName) continue;
      const canonFirst = canonName.split(" ")[0];
      if (!canonFirst || canonFirst.toLowerCase() === lowerName) continue;

      // Replace the first-name-only cue with full name
      const cueRe = new RegExp(`^\\s*${canonFirst}\\s*$`, "gim");
      text = text.replace(cueRe, (match) => {
        audit.nameFixed++;
        return "    " + canonName.toUpperCase();
      });
    }

    // 3e. Normalize age references in character intros
    // E.g., "Marcus (40s)" → match canon age
    for (const [lowerName, canonAge] of Object.entries(canonicalAges)) {
      if (!canonAge) continue;
      const canonFirstName = lowerName.includes(" ")
        ? lowerName.split(" ")[0]
        : lowerName;
      // Find character intros like "CHARACTER (40s)" or "(40s)" after name
      const ageRe = new RegExp(
        `(${canonFirstName})\\s*\\((\\d+)s\\)`,
        "gi",
      );
      text = text.replace(ageRe, (match, name, age) => {
        if (age + "s" !== canonAge) {
          audit.ageFixed++;
          return `${name} (${canonAge})`;
        }
        return match;
      });
    }

    // 3f. Clean up extra whitespace
    // Remove multiple blank lines (keep max 2)
    text = text.replace(/\n{3,}/g, "\n\n");
    // Ensure sluglines are separated
    text = text.replace(/\n(INT\.|EXT\.)/g, "\n\n$1");
    // Trim
    text = text.trim();

    const finalLength = text.length;
    const sceneCount = (text.match(/^(INT\.|EXT\.)/gm) || []).length;

    // ── 4. Persist finalized version ──
    await sb
      .from("project_document_versions")
      .update({
        plaintext: text,
        status: "draft",
        meta_json: {
          ...(ver.meta_json || {}),
          finalized: true,
          finalized_at: new Date().toISOString(),
          finalization: {
            original_length: originalLength,
            final_length: finalLength,
            center_tags_removed: audit.centerTags,
            names_normalized: audit.nameFixed,
            ages_normalized: audit.ageFixed,
            scenes_final: sceneCount,
          },
        },
      })
      .eq("id", versionId);

    return jsonRes({
      success: true,
      version_id: versionId,
      original_length: originalLength,
      final_length: finalLength,
      scenes: sceneCount,
      transformations: audit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonRes({ error: message }, 500);
  }
});
