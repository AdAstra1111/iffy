// @ts-nocheck
/**
 * nel-orchestrator — Narrative Extraction Layer Phase 2 (Certified).
 *
 * Orchestrates extraction pipeline from Approved Narrative Corpus to
 * Visual Production OS tables.
 *
 * CERTIFIED STAGES:
 *   1. Corpus resolution (corpus-resolver)
 *   2. Scene extraction (deterministic from screenplay plaintext)
 *   3. Narrative entity extraction (deterministic from scene data + canon)
 *   4. Character atoms (character-atomiser extract + generate)
 *   5. Location atoms (location-atomiser)
 *   6. Prop atoms (prop-atomiser)
 *   7. Vehicle atoms (vehicle-atomiser)
 *   8. Creature atoms (creature-atomiser)
 *   9. Costume atoms (costume-atomiser)
 *  10. Relationship atoms (relation-graph-engine)
 *  11. Visual DNA generation (generate-visual-dna-from-canon)
 *  12. PD canon inference (infer-pd-canon)
 *  13. Governance refresh (evaluate-visual-governance)
 *
 * Architecture-Strict: One responsibility, one owner. NEL is the single
 * constitutional bridge between Approved Narrative Corpus and Visual Production OS.
 *
 * POST /nel-orchestrator
 * Body: { projectId: string, stages?: string[], mode?: "full" | "extract_only" | "dna_only" }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── HELPERS ──────────────────────────────────────────────────────────

function normalizeEntityKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

// ── SCENE PARSING ────────────────────────────────────────────────────

interface ParsedScene {
  sceneNumber: number;
  slugline: string;
  locationKey: string | null;
  intExt: string;
  timeOfDay: string;
  body: string;
  charactersMentioned: string[];
}

function parseSlugline(line: string): { slugline: string; location: string; intExt: string; timeOfDay: string } {
  const sl = line.trim().replace(/^\d+\s*[\.\)\s]\s*/, "");
  const match = sl.match(/^(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.?)\s*(.+?)(?:\s*[-–—]\s*(.+))?$/i);
  if (match) {
    return {
      slugline: sl,
      intExt: match[1].replace(/\./g, "").replace(/\//g, "/").toUpperCase(),
      location: (match[2] || "").trim(),
      timeOfDay: (match[3] || "").trim(),
    };
  }
  return { slugline: sl, location: "", intExt: "", timeOfDay: "" };
}

function extractCharacterCues(text: string): string[] {
  const names = new Set<string>();
  const cuePattern = /^[ \t]{10,}([A-Z][A-Z\s\.\-\']{1,30})(?:\s*\(.*?\))?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = cuePattern.exec(text)) !== null) {
    const name = m[1].trim();
    const skip = /^(FADE|CUT|DISSOLVE|SMASH|INTERCUT|CONTINUED|CONT'D|THE END|TITLE|SUPER|V\.O\.|O\.S\.|BACK TO|FLASHBACK|END OF|MONTAGE|SERIES OF|BEGIN|MORE|ANGLE|CLOSE|WIDE|PAN|INSERT|TRANSITION|SCENE)$/i;
    if (!skip.test(name) && name.length > 1 && name.length < 30) {
      names.add(name);
    }
  }
  return [...names].sort();
}

function parseScenesFromText(text: string): ParsedScene[] {
  const lines = text.split("\n");
  const sluglinePattern = /^\s*(\d+\s*[\.\)\s]\s*)?(INT\.|EXT\.|INT\.\/EXT\.|INT\/EXT\.|I\/E\.?)\s/i;
  const sceneBreaks: { lineIndex: number; heading: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (sluglinePattern.test(lines[i])) {
      sceneBreaks.push({ lineIndex: i, heading: lines[i] });
    }
  }

  // Fallback: if no sluglines found, treat entire text as one scene
  if (sceneBreaks.length === 0) {
    const chars = extractCharacterCues(text);
    return [{
      sceneNumber: 1,
      slugline: "SCENE 1",
      locationKey: null,
      intExt: "",
      timeOfDay: "",
      body: text,
      charactersMentioned: chars,
    }];
  }

  const scenes: ParsedScene[] = [];
  for (let i = 0; i < sceneBreaks.length; i++) {
    const start = sceneBreaks[i].lineIndex;
    const end = i + 1 < sceneBreaks.length ? sceneBreaks[i + 1].lineIndex : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    const parsed = parseSlugline(sceneBreaks[i].heading);
    const chars = extractCharacterCues(body);

    scenes.push({
      sceneNumber: i + 1,
      slugline: sceneBreaks[i].heading.trim(),
      locationKey: parsed.location ? normalizeEntityKey(parsed.location) : null,
      intExt: parsed.intExt,
      timeOfDay: parsed.timeOfDay,
      body,
      charactersMentioned: chars,
    });
  }

  return scenes;
}

// ── ENTITY EXTRACTION ────────────────────────────────────────────────

interface ExtractedEntity {
  entityKey: string;
  canonicalName: string;
  entityType: string;
  sceneCount: number;
  evidence: string;
  confidence: number;
}

function extractEntitiesFromScenes(scenes: ParsedScene[], characterBibleText?: string): ExtractedEntity[] {
  const entityMap = new Map<string, ExtractedEntity>();
  const locationScenes = new Map<string, Set<number>>();

  // Extract characters from dialogue cues across all scenes
  const allCharacterNames = new Set<string>();
  for (const scene of scenes) {
    for (const charName of scene.charactersMentioned) {
      allCharacterNames.add(charName);
    }
  }

  // Also extract from character bible if available
  if (characterBibleText) {
    const bibleChars = extractCharacterCues(characterBibleText);
    for (const c of bibleChars) {
      allCharacterNames.add(c);
    }
  }

  // Build character entities
  for (const charName of allCharacterNames) {
    const key = normalizeEntityKey(charName);
    // Count scenes this character appears in
    const sceneNums = new Set<number>();
    for (const scene of scenes) {
      if (scene.charactersMentioned.includes(charName)) {
        sceneNums.add(scene.sceneNumber);
      }
    }
    entityMap.set(`char:${key}`, {
      entityKey: key,
      canonicalName: charName,
      entityType: "character",
      sceneCount: sceneNums.size,
      evidence: `Dialogue extraction — ${charName} appears in ${sceneNums.size} scene(s)`,
      confidence: 0.9,
    });
  }

  // Extract locations from sluglines
  for (const scene of scenes) {
    if (scene.locationKey) {
      if (!locationScenes.has(scene.locationKey)) {
        locationScenes.set(scene.locationKey, new Set());
      }
      locationScenes.get(scene.locationKey)!.add(scene.sceneNumber);
    }
  }

  // Build location entities
  for (const [locKey, sceneNums] of locationScenes) {
    // Derive a readable name from the key
    const readableName = locKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    entityMap.set(`loc:${locKey}`, {
      entityKey: locKey,
      canonicalName: readableName,
      entityType: "location",
      sceneCount: sceneNums.size,
      evidence: `Slugline extraction — appears in ${sceneNums.size} scene(s)`,
      confidence: 1.0,
    });
  }

  return [...entityMap.values()];
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────

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
    const sb = createClient(supabaseUrl, supabaseKey);
    const functionBase = `${supabaseUrl}/functions/v1`;
    const bearerToken = authHeader;

    // Default: run all stages
    const activeStages = stages || [
      "corpus", "scenes", "entities", "atoms",
      "vehicle", "creature", "costume", "relationships",
      "dna", "pd_canon", "governance",
    ];
    const pipelineMode = mode || "full";
    const results: Record<string, any> = {};
    const errors: string[] = [];
    const startTime = new Date().toISOString();
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
        return new Response(JSON.stringify({ projectId, pipelineMode, results, errors, fatal: true }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── STAGE 2: Scene Extraction (NEL canonical — no story-ingestion dependency) ──
    if (activeStages.includes("scenes") && pipelineMode !== "dna_only") {
      try {
        console.log(`[nel] Extracting scenes for ${projectId}`);
        if (!corpus) {
          throw new Error("Corpus not available — run corpus stage first");
        }

        // Get screenplay plaintext — prefer production_draft, fall back to feature_script/script
        const screenplay = corpus.screenplay;
        const screenplayText = screenplay?.plaintext;
        if (!screenplayText || screenplayText.length < 200) {
          throw new Error(`No screenplay plaintext available (length: ${screenplayText?.length || 0})`);
        }

        // Parse scenes deterministically
        const scenes = parseScenesFromText(screenplayText);
        console.log(`[nel] Parsed ${scenes.length} scenes from screenplay`);

        // Write to scene_index — idempotent upsert on (project_id, scene_number)
        // Clear existing entries for this project first, then insert fresh
        const { error: delErr } = await sb
          .from("scene_index")
          .delete()
          .eq("project_id", projectId);
        if (delErr) {
          console.warn(`[nel] scene_index delete warning: ${delErr.message}`);
        }

        const sceneRows = scenes.map((s, i) => ({
          project_id: projectId,
          scene_number: s.sceneNumber,
          title: s.slugline.substring(0, 200),
          source_doc_type: screenplay.docType || "production_draft",
          source_ref: {
            versionId: screenplay.versionId,
            docId: screenplay.docId,
            docType: screenplay.docType,
            nel_stage: "scene_extraction",
            nel_run_at: startTime,
          },
          location_key: s.locationKey,
          character_keys: s.charactersMentioned.map(c => normalizeEntityKey(c)),
          wardrobe_state_map: {},
        }));

        if (sceneRows.length > 0) {
          const { error: insErr } = await sb
            .from("scene_index")
            .insert(sceneRows);
          if (insErr) throw new Error(`scene_index insert failed: ${insErr.message}`);
        }

        results.scenes = {
          status: "complete",
          parsedCount: scenes.length,
          writtenCount: sceneRows.length,
          screenplayDocType: screenplay.docType,
          screenplayLength: screenplayText.length,
          sourceVersionId: screenplay.versionId,
        };
        console.log(`[nel] Scene extraction complete: ${scenes.length} scenes written`);
      } catch (e: any) {
        results.scenes = { status: "failed", error: e.message };
        errors.push(`scenes: ${e.message}`);
      }
    }

    // ── STAGE 3: Narrative Entity Extraction (NEL canonical) ──
    if (activeStages.includes("entities") && pipelineMode !== "dna_only") {
      try {
        console.log(`[nel] Extracting narrative entities for ${projectId}`);
        if (!corpus) {
          throw new Error("Corpus not available — run corpus stage first");
        }

        // Get screenplay text for scene parsing
        const screenplay = corpus.screenplay;
        const screenplayText = screenplay?.plaintext;
        const characterBibleText = corpus.characterBible?.plaintext;

        if (!screenplayText || screenplayText.length < 200) {
          throw new Error("No screenplay plaintext for entity extraction");
        }

        // Parse scenes to extract entities
        const scenes = parseScenesFromText(screenplayText);
        const entities = extractEntitiesFromScenes(scenes, characterBibleText);

        // Re-extract characters from character bible more precisely if available
        // Also extract props from scene body if they're mentioned with props patterns
        // For MVP: characters + locations are the primary entity types

        // Write to narrative_entities — idempotent by upsert on (project_id, entity_key)
        let writtenChars = 0;
        let writtenLocs = 0;

        for (const entity of entities) {
          const { error: upsertErr } = await sb
            .from("narrative_entities")
            .upsert({
              project_id: projectId,
              entity_key: entity.entityKey,
              canonical_name: entity.canonicalName,
              entity_type: entity.entityType,
              scene_count: entity.sceneCount,
              active: true,
              status: "active",
              meta_json: {
                confidence: entity.confidence,
                evidence: entity.evidence,
                nel_stage: "entity_extraction",
                nel_run_at: startTime,
                source: screenplay.docType || "production_draft",
              },
            }, {
              onConflict: "project_id,entity_key",
              ignoreDuplicates: false,
            });

          if (upsertErr) {
            console.warn(`[nel] entity upsert error for ${entity.entityKey}: ${upsertErr.message}`);
          } else if (entity.entityType === "character") {
            writtenChars++;
          } else {
            writtenLocs++;
          }
        }

        results.entities = {
          status: "complete",
          totalExtracted: entities.length,
          characters: writtenChars,
          locations: writtenLocs,
          source: "deterministic parsing from screenplay + character bible",
          entityKeys: entities.map(e => `${e.entityType}:${e.entityKey}`),
        };
        console.log(`[nel] Entity extraction complete: ${writtenChars} chars, ${writtenLocs} locs of ${entities.length} total`);
        console.log(`[nel] Entity keys: ${entities.map(e => `${e.entityType}:${e.entityKey}`).join(", ")}`);
      } catch (e: any) {
        results.entities = { status: "failed", error: e.message };
        errors.push(`entities: ${e.message}`);
      }
    }

    // ── STAGE 4: Character + Location + Prop Atoms ──
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

    // ── STAGE 5: Vehicle Atoms ──
    if (activeStages.includes("vehicle") && pipelineMode !== "dna_only") {
      try {
        console.log(`[nel] Extracting vehicle atoms for ${projectId}`);
        const vResp = await fetch(`${functionBase}/vehicle-atomiser`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "extract", project_id: projectId }),
        });
        const vResult = vResp.ok ? await vResp.json() : { error: await vResp.text() };
        results.vehicleAtoms = { status: vResp.ok ? "complete" : "skipped", ...vResult };
      } catch (e: any) {
        results.vehicleAtoms = { status: "failed", error: e.message };
        errors.push(`vehicle-atom: ${e.message}`);
      }
    }

    // ── STAGE 6: Creature Atoms ──
    if (activeStages.includes("creature") && pipelineMode !== "dna_only") {
      try {
        console.log(`[nel] Extracting creature atoms for ${projectId}`);
        const cResp = await fetch(`${functionBase}/creature-atomiser`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "extract", project_id: projectId }),
        });
        const cResult = cResp.ok ? await cResp.json() : { error: await cResp.text() };
        results.creatureAtoms = { status: cResp.ok ? "complete" : "skipped", ...cResult };
      } catch (e: any) {
        results.creatureAtoms = { status: "failed", error: e.message };
        errors.push(`creature-atom: ${e.message}`);
      }
    }

    // ── STAGE 7: Costume Atoms ──
    if (activeStages.includes("costume") && pipelineMode !== "dna_only") {
      try {
        console.log(`[nel] Extracting costume atoms for ${projectId}`);
        const coResp = await fetch(`${functionBase}/costume-atomiser`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "extract", project_id: projectId }),
        });
        const coResult = coResp.ok ? await coResp.json() : { error: await coResp.text() };
        results.costumeAtoms = { status: coResp.ok ? "complete" : "skipped", ...coResult };
      } catch (e: any) {
        results.costumeAtoms = { status: "failed", error: e.message };
        errors.push(`costume-atom: ${e.message}`);
      }
    }

    // ── STAGE 8: Relationship Atoms ──
    if (activeStages.includes("relationships") && pipelineMode !== "dna_only") {
      try {
        console.log(`[nel] Extracting relationship atoms for ${projectId}`);
        const rResp = await fetch(`${functionBase}/relation-graph-engine`, {
          method: "POST",
          headers: { Authorization: bearerToken, "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        const rResult = rResp.ok ? await rResp.json() : { error: await rResp.text() };
        results.relationshipAtoms = { status: rResp.ok ? "complete" : "skipped", ...rResult };
      } catch (e: any) {
        results.relationshipAtoms = { status: "failed", error: e.message };
        errors.push(`relationship-atom: ${e.message}`);
      }
    }

    // ── STAGE 9: Visual DNA Generation ──
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

    // ── STAGE 10: PD Canon Inference ──
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

    // ── STAGE 11: Governance Refresh ──
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
    const completedAt = new Date().toISOString();

    return new Response(JSON.stringify({
      projectId,
      pipelineMode,
      stagesRun: activeStages,
      results,
      errors: errors.length > 0 ? errors : null,
      fatal: false,
      startedAt: startTime,
      completedAt,
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
