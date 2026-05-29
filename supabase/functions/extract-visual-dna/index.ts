// @ts-nocheck
/**
 * extract-visual-dna — Evidence-driven Character Visual DNA extraction.
 * 
 * Gathers project evidence (canon, character bible, scripts, scene descriptions)
 * and uses AI to extract structured visual traits AND binding marker candidates
 * with confidence and provenance.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveGateway, callLLM, MODELS, extractJSON } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractedTrait {
  label: string;
  category: "age" | "gender" | "build" | "face" | "hair" | "skin" | "clothing" | "posture" | "marker" | "other";
  confidence: "high" | "medium" | "low";
  evidence_source: string;
  evidence_excerpt: string;
}

interface MarkerCandidate {
  marker_type: string;
  label: string;
  body_region: string;
  laterality: "left" | "right" | "center" | "bilateral" | "unknown";
  size: "small" | "medium" | "large" | "unknown";
  visibility: "always_visible" | "contextual" | "covered" | "unknown";
  attributes: Record<string, string>;
  unresolved_fields: string[];
  confidence: "high" | "medium" | "low";
  evidence_source: string;
  evidence_excerpt: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { project_id, character_name } = await req.json();
    if (!project_id || !character_name) {
      return new Response(JSON.stringify({ error: "project_id and character_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── 1. Gather evidence from all available sources ──

    const evidenceBlocks: { source: string; text: string }[] = [];

    // A. Canon JSON (character entry)
    const { data: canon } = await sb
      .from("project_canon")
      .select("canon_json")
      .eq("project_id", project_id)
      .maybeSingle();

    if (canon?.canon_json) {
      const cj = canon.canon_json as Record<string, any>;
      
      const characters = cj.characters || [];
      const charEntry = Array.isArray(characters)
        ? characters.find((c: any) =>
            (c.name || "").toLowerCase() === character_name.toLowerCase()
          )
        : null;

      if (charEntry) {
        evidenceBlocks.push({
          source: "canon_json.character",
          text: JSON.stringify(charEntry, null, 2).slice(0, 4000),
        });
      }

      if (cj.world_rules) {
        const wr = typeof cj.world_rules === "string" ? cj.world_rules : JSON.stringify(cj.world_rules);
        evidenceBlocks.push({
          source: "canon_json.world_rules",
          text: wr.slice(0, 2000),
        });
      }

      if (cj.timeline) {
        const tl = typeof cj.timeline === "string" ? cj.timeline : JSON.stringify(cj.timeline);
        evidenceBlocks.push({
          source: "canon_json.timeline",
          text: tl.slice(0, 1500),
        });
      }
    }

    // B. Project documents — character bible, scripts, treatments
    const { data: docs } = await sb
      .from("project_documents")
      .select("id, title, doc_type, latest_version_id")
      .eq("project_id", project_id)
      .in("doc_type", [
        "character_bible",
        "screenplay",
        "treatment",
        "pilot_script",
        "episode_script",
        "series_bible",
        "outline",
        "episode_1",
      ])
      .order("doc_type")
      .limit(10);

    if (docs && docs.length > 0) {
      const versionIds = docs.map((d: any) => d.latest_version_id).filter(Boolean);

      if (versionIds.length > 0) {
        const { data: versions } = await sb
          .from("project_document_versions")
          .select("id, document_id, plaintext")
          .in("id", versionIds);

        if (versions) {
          for (const v of versions) {
            const doc = docs.find((d: any) => d.id === v.document_id);
            if (!v.plaintext) continue;
            const text = v.plaintext as string;
            
            const charRelevant = extractCharacterRelevantText(text, character_name);
            if (charRelevant.length > 50) {
              evidenceBlocks.push({
                source: `document:${doc?.doc_type || "unknown"}:${doc?.title || v.document_id}`,
                text: charRelevant.slice(0, 5000),
              });
            }
          }
        }
      }
    }

    // C. Character identity notes
    const { data: identityNotes } = await sb
      .from("character_identity_notes")
      .select("notes")
      .eq("project_id", project_id)
      .eq("character_name", character_name)
      .maybeSingle();

    if (identityNotes?.notes) {
      evidenceBlocks.push({
        source: "identity_notes",
        text: identityNotes.notes,
      });
    }

    // D. Scene graph — character descriptions from scenes
    const { data: sceneVersions } = await sb
      .from("scene_graph_versions")
      .select("content, slugline, summary")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (sceneVersions) {
      const charMentions: string[] = [];
      const nameLower = character_name.toLowerCase();
      for (const sv of sceneVersions) {
        const content = (sv.content || "") as string;
        if (content.toLowerCase().includes(nameLower)) {
          const paragraphs = content.split(/\n\n+/);
          for (const p of paragraphs) {
            if (p.toLowerCase().includes(nameLower) && p.length > 20) {
              charMentions.push(p.trim());
            }
          }
        }
      }
      if (charMentions.length > 0) {
        evidenceBlocks.push({
          source: "scene_graph",
          text: charMentions.slice(0, 15).join("\n\n").slice(0, 4000),
        });
      }
    }

    if (evidenceBlocks.length === 0) {
      return new Response(JSON.stringify({
        traits: [],
        marker_candidates: [],
        evidence_sources: [],
        message: "No evidence found for this character in the project.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. AI extraction ──

    const { apiKey } = resolveGateway();

    const evidenceText = evidenceBlocks
      .map((b, i) => `=== SOURCE ${i + 1}: ${b.source} ===\n${b.text}`)
      .join("\n\n---\n\n");

    const systemPrompt = `You are a Visual Character Analyst for film/TV production.
Your task: Extract EVERY physically renderable visual trait for "${character_name}" from the provided evidence.
ALSO identify any BINDING VISUAL MARKERS — persistent visible features that must appear in every image.

RULES:
- Extract ONLY traits visible in a photograph or rendered image
- NO psychology, motivation, personality, emotions, or narrative function
- Each trait must cite its evidence source and a brief excerpt
- Assign confidence: "high" (explicitly stated), "medium" (clearly implied), "low" (weakly suggested)

REQUIRED CATEGORIES — You MUST attempt to extract ALL of these categories for every character.
Even if the evidence is sparse, infer what you can from context and use "low" confidence:
|- Categories: age, gender, build, face, hair, skin, clothing, posture, marker, ethnicity, height, voice, social_class, role, other
||- "ethnicity" = cultural/ethnic identity, nationality, or regional appearance. Infer from: name origin, described skin tone, cultural context of setting, language used, geographic location
||- "social_class" = implied socioeconomic status from: dress quality, mannerisms described, profession, housing described, how others treat them. Examples: "working_class", "aristocratic", "impoverished", "merchant_class", "scholarly_class"
||- "role" = character archetype or narrative function. Examples: "protective_mentor", "tragic_heroine", "comic_relief", "villainous_overlord", "reluctant_sidekick", "wise_elder"
||- "voice" = vocal quality, accent, speech patterns (timbre, cadence, dialect). Infer from: described accent, speech mannerisms, cultural setting. Examples: "gravelly_baritone", "soft_whisper", "cultivated_british", "guttural_growl", "melodic_tenor"
||- "height" = height class or stature description. Infer from: described build, how they compare to others, door frames described. Examples: "tall_lanky", "short_stocky", "average_height", "imposing_stature", "diminutive"
||- Keep labels concise (2-8 words)
||- NEVER use a category name as the label value (e.g. "age" is invalid, "eyes" is invalid, "appearance" is invalid — describe what kind of age/eyes/appearance)
||- Be specific: prefer "40s weathered face" over just "age", "hazel eyes" over just "eyes"

INFERENCE GUIDELINES FOR WEAK CATEGORIES:
- ethnicity: Look for name origin (Chinese, Irish, Arabic), described skin/hair/eye traits, cultural setting (fantasy medieval Europe, futuristic Tokyo), language spoken, geographic location of story. Infer "unknown" only when absolutely no clue exists.
- social_class: Look for dress description (fine silks vs. rough wool), occupation (servant vs. lord), mannerisms, housing described, how other characters treat them. Working class implies rough hands, practical clothes. Aristocratic implies refined dress, jewelry, posture.
- voice: Look for described accent (Scottish brogue, Southern drawl), speech patterns (laconic, verbose), physical qualities (raspy, booming, whispery). Setting-appropriate default if not described: match to era/region.
- role: Infer from narrative function — who are they to the protagonist? Mentor, obstacle, ally, love interest, comic relief? What does their existence in the story serve?
- height: Infer from build description, comparison language ("towered over", "came up to his chest"), door frame references, or character type descriptions.

BINDING MARKERS (special detection):
Any trait that is a persistent physical feature (tattoo, scar, prosthetic, birthmark, wound, glasses, eyepatch, missing limb, burn, piercing) must ALSO be returned in marker_candidates.
For each marker, identify:
- body_region: where on the body (arm, face, chest, leg, etc.) or "unspecified" if unclear
- laterality: left, right, center, bilateral, or "unknown" if not stated
- unresolved_fields: list fields that need user clarification (e.g. ["laterality"] if "arm" mentioned but left/right not specified)

Return JSON:
{
  "traits": [
    {
      "label": "concise trait description",
      "category": "age|gender|build|face|hair|skin|clothing|posture|marker|other",
      "confidence": "high|medium|low",
      "evidence_source": "source identifier",
      "evidence_excerpt": "brief quote (max 80 chars)"
    }
  ],
  "marker_candidates": [
    {
      "marker_type": "tattoo|scar|wound|prosthetic|birthmark|deformity|glasses|eyepatch|missing_limb|burn|piercing|branding|accessory|other",
      "label": "descriptive label",
      "body_region": "arm|face|chest|leg|hand|back|neck|unspecified",
      "laterality": "left|right|center|bilateral|unknown",
      "size": "small|medium|large|unknown",
      "visibility": "always_visible|contextual|covered|unknown",
      "attributes": {},
      "unresolved_fields": ["laterality"],
      "confidence": "high|medium|low",
      "evidence_source": "source identifier",
      "evidence_excerpt": "brief quote (max 80 chars)"
    }
  ]
}`;

    const result = await callLLM({
      apiKey,
      model: MODELS.FAST,
      system: systemPrompt,
      user: `Extract visual traits and binding markers for "${character_name}" from this evidence:\n\n${evidenceText}`,
      temperature: 0.1,
      maxTokens: 5000,
    });

    let parsed: { traits: ExtractedTrait[]; marker_candidates: MarkerCandidate[] };
    try {
      parsed = JSON.parse(extractJSON(result.content));
    } catch {
      parsed = { traits: [], marker_candidates: [] };
    }

    // Validate and clean traits
    const validCategories = new Set(["age", "gender", "build", "face", "hair", "skin", "clothing", "posture", "marker", "ethnicity", "height", "voice", "social_class", "role", "other"]);
    const validConfidence = new Set(["high", "medium", "low"]);
    const SENSITIVE_CATEGORIES = new Set(["skin", "gender", "age"]);
    
    const cleanTraits = (parsed.traits || [])
      .filter((t: any) => t.label && validCategories.has(t.category))
      .map((t: any) => {
        let confidence = validConfidence.has(t.confidence) ? t.confidence : "low";
        if (SENSITIVE_CATEGORIES.has(t.category) && confidence === "high") {
          confidence = "medium";
        }
        return {
          label: String(t.label).slice(0, 100),
          category: t.category,
          confidence,
          evidence_source: String(t.evidence_source || "unknown").slice(0, 200),
          evidence_excerpt: String(t.evidence_excerpt || "").slice(0, 120),
        };
      });

    // Validate and clean marker candidates
    const validMarkerTypes = new Set(["tattoo", "scar", "wound", "prosthetic", "birthmark", "deformity", "glasses", "eyepatch", "missing_limb", "burn", "piercing", "branding", "accessory", "other"]);
    
    const cleanMarkers = (parsed.marker_candidates || [])
      .filter((m: any) => m.marker_type && validMarkerTypes.has(m.marker_type))
      .map((m: any) => ({
        id: `marker_${m.marker_type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        marker_type: m.marker_type,
        label: String(m.label || m.marker_type).slice(0, 100),
        body_region: String(m.body_region || "unspecified").slice(0, 50),
        laterality: ["left", "right", "center", "bilateral", "unknown"].includes(m.laterality) ? m.laterality : "unknown",
        size: ["small", "medium", "large", "unknown"].includes(m.size) ? m.size : "unknown",
        visibility: ["always_visible", "contextual", "covered", "unknown"].includes(m.visibility) ? m.visibility : "always_visible",
        attributes: m.attributes || {},
        unresolved_fields: Array.isArray(m.unresolved_fields) ? m.unresolved_fields : [],
        confidence: validConfidence.has(m.confidence) ? m.confidence : "high",
        evidence_source: String(m.evidence_source || "unknown").slice(0, 200),
        evidence_excerpt: String(m.evidence_excerpt || "").slice(0, 120),
      }));

    return new Response(JSON.stringify({
      traits: cleanTraits,
      marker_candidates: cleanMarkers,
      evidence_sources: evidenceBlocks.map(b => b.source),
      character_name,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("extract-visual-dna error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Extract text sections relevant to a specific character from a document.
 */
function extractCharacterRelevantText(fullText: string, characterName: string): string {
  const nameLower = characterName.toLowerCase();
  const firstName = characterName.split(/\s+/)[0]?.toLowerCase() || nameLower;
  const lines = fullText.split("\n");
  const relevant: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes(nameLower) || line.includes(firstName)) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 2);
      const block = lines.slice(start, end + 1).join("\n");
      if (!relevant.includes(block)) {
        relevant.push(block);
      }
    }
  }
  
  return relevant.join("\n\n---\n\n");
}
