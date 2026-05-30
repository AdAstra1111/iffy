// @ts-nocheck
/**
 * atom-index-backfill — Phase 2: Back-Extraction
 *
 * Reads existing project documents and populates the atom dependency index.
 * No existing content is modified. This is pure READ → WRITE to atoms table.
 *
 * Constitutional rules:
 * - Documents remain truth. Atoms are derivative indexes.
 * - Each atom records origin_doc_id or structured source reference.
 * - Forbidden attribute keys (pressure, energy, etc.) are rejected by DB trigger.
 * - SHADOW data in attributes.shadow.* is ignored by invalidation.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  APPROVED_ATOM_TYPES,
  type ApprovedAtomType,
  type AtomRecord,
  type AtomDependency,
  ATOM_TO_DOC_DEPENDENCIES,
  validateAtomPreWrite,
  guardAtomBoundary,
} from "../_shared/atomDependencyIndex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function makeClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── LLM EXTRACTION ──

async function extractAtomsFromText(
  text: string,
  atomType: ApprovedAtomType,
  entityContext: { name: string; id?: string }
): Promise<AtomRecord[]> {
  const systemPrompt = `You are a narrative atom extractor. Extract ${atomType.replace(/_/g, " ")} facts from the given text.

Rules:
1. Extract ONLY explicitly stated facts. Do not infer.
2. Each atom must have a direct textual basis.
3. Return a JSON array of { canonical_name, text, confidence }.
4. confidence must be 0.0-1.0 based on how explicitly the text states this.
5. If no facts of this type exist, return empty array [].
6. NEVER include pressure, energy, force, or predicted choice in output.`;

  const userPrompt = `Entity: ${entityContext.name}
Text:
${text.slice(0, 15000)}

Extract ${atomType.replace(/_/g, " ")} atoms as JSON array:`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY") || ""}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[atom-backfill] LLM extraction failed: ${response.status} ${errText.slice(0, 300)}`);
      return [];
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response (handle markdown-wrapped JSON)
    const jsonMatch = content.match(/```(?:json)?\n?([\s\S]*?)```/) || content.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
    const parsed = JSON.parse(jsonStr.trim());

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: any) => item.text && item.text.length > 3)
      .map((item: any) => ({
        project_id: "",
        atom_type: atomType,
        entity_id: entityContext.id,
        canonical_name: item.canonical_name || item.text.slice(0, 100),
        confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
        attributes: {
          text: item.text,
          confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
          source: `${entityContext.name} character bible`,
        },
      }));
  } catch (err) {
    console.error(`[atom-backfill] LLM error: ${err?.message}`);
    return [];
  }
}

// ── STRUCTURED EXTRACTION (non-LLM) ──

function extractWorldRulesFromCanon(canonJson: any): AtomRecord[] {
  if (!canonJson) return [];
  const atoms: AtomRecord[] = [];

  const worldRules = canonJson.world_rules || canonJson.worldRules || [];
  if (Array.isArray(worldRules)) {
    for (const rule of worldRules) {
      const text = typeof rule === "string" ? rule : rule.text || rule.description || rule.rule || "";
      if (text && text.length > 3) {
        atoms.push({
          project_id: "",
          atom_type: "world_rule",
          canonical_name: text.slice(0, 100),
          confidence: 0.95,
          attributes: {
            text,
            confidence: 0.95,
            source: "canon_json.world_rules",
          },
        });
      }
    }
  }

  // Also extract character relationships from canon
  const relationships = canonJson.relationships || [];
  if (Array.isArray(relationships)) {
    for (const rel of relationships) {
      const text = rel.description || rel.nature || `${rel.character_a || ""} × ${rel.character_b || ""}: ${rel.type || ""}`;
      if (text && text.length > 3) {
        atoms.push({
          project_id: "",
          atom_type: "character_relationship",
          entity_id: rel.character_a_id || rel.character_id,
          canonical_name: text.slice(0, 100),
          confidence: 0.9,
          attributes: {
            text,
            confidence: 0.9,
            source: "canon_json.relationships",
          },
        });
      }
    }
  }

  return atoms;
}

function extractLocationFacts(locations: any[]): AtomRecord[] {
  if (!locations || !Array.isArray(locations)) return [];

  return locations
    .filter((loc) => loc.canonical_name || loc.name)
    .map((loc) => {
      const text = [
        loc.description,
        loc.geography ? `Geography: ${loc.geography}` : "",
        loc.location_type ? `Type: ${loc.location_type}` : "",
        loc.interior_or_exterior ? `Setting: ${loc.interior_or_exterior}` : "",
      ]
        .filter(Boolean)
        .join(". ");

      return {
        project_id: "",
        atom_type: "location_fact" as ApprovedAtomType,
        entity_id: loc.id,
        canonical_name: loc.canonical_name || loc.name || "Unknown Location",
        confidence: 0.95,
        attributes: {
          text: text || loc.canonical_name || loc.name,
          confidence: 0.95,
          source: `canon_locations:${loc.canonical_name || loc.name}`,
        },
      };
    });
}

function extractTimelineEvents(scenes: any[]): AtomRecord[] {
  if (!scenes || !Array.isArray(scenes)) return [];

  return scenes
    .filter((s) => s.slugline || s.summary)
    .map((s) => ({
      project_id: "",
      atom_type: "timeline_event" as ApprovedAtomType,
      scene_id: s.scene_id || s.id,
      canonical_name: s.slugline || s.summary?.slice(0, 100) || "Unknown Scene",
      confidence: 0.9,
      attributes: {
        text: `${s.slugline || "Scene"}: ${s.summary || ""}`.trim(),
        confidence: 0.9,
        source: "scene_graph_versions",
        time_of_day: s.time_of_day || undefined,
        act: s.metadata?.act || s.act || undefined,
      },
    }));
}

// ── ATOM WRITER ──

async function writeAtoms(
  admin: any,
  projectId: string,
  atoms: AtomRecord[],
  projectDocId?: string
): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];
  let written = 0;

  for (const atom of atoms) {
    atom.project_id = projectId;

    // Validate
    const guard = guardAtomBoundary(atom);
    if (!guard.passed) {
      errors.push(`Atom ${atom.canonical_name}: ${guard.reason}`);
      continue;
    }

    const preWrite = validateAtomPreWrite(atom);
    if (!preWrite.valid) {
      errors.push(`Atom ${atom.canonical_name}: ${preWrite.errors.join("; ")}`);
      continue;
    }

    const { error } = await admin.from("atoms").insert({
      project_id: atom.project_id,
      atom_type: atom.atom_type,
      entity_id: atom.entity_id || null,
      scene_id: atom.scene_id || null,
      origin_doc_id: projectDocId || null,
      canonical_name: atom.canonical_name,
      priority: atom.priority || 50,
      confidence: atom.confidence ?? 0.5,
      readiness_state: "extracted",
      narrative_role: atom.narrative_role || "active_agent",
      attributes: atom.attributes,
    });

    if (error) {
      errors.push(`DB insert failed for ${atom.canonical_name}: ${error.message}`);
    } else {
      written++;
    }
  }

  return { written, errors };
}

// ── DEPENDENCY WRITER ──

async function writeDependencies(
  admin: any,
  projectId: string,
  atomAtoms: { atom_type: ApprovedAtomType; ids: string[] }[]
): Promise<number> {
  let written = 0;

  for (const { atom_type, ids } of atomAtoms) {
    const deps = ATOM_TO_DOC_DEPENDENCIES[atom_type];
    if (!deps) continue;

    for (const atomId of ids) {
      for (const dep of deps) {
        const { error } = await admin.from("atom_dependencies").upsert(
          {
            atom_id: atomId,
            project_id: projectId,
            affected_doc_type: dep.doc_type,
            dependency_type: dep.dependency_type,
            affected_scope: dep.affected_scope,
          },
          { onConflict: "atom_id, affected_doc_type" }
        );

        if (!error) written++;
      }
    }
  }

  return written;
}

// ── EXTRACTION PIPELINES ──

async function extractCharacterBibleAtoms(
  admin: any,
  projectId: string
): Promise<{ atoms: AtomRecord[]; counts: Record<string, number> }> {
  const counts: Record<string, number> = {
    character_goal: 0,
    character_fear: 0,
    character_secret: 0,
    character_relationship: 0,
    character_backstory_event: 0,
  };
  const allAtoms: AtomRecord[] = [];

  // Get latest character bible version
  const { data: cbDoc } = await admin
    .from("project_documents")
    .select("id, latest_version_id")
    .eq("project_id", projectId)
    .eq("doc_type", "character_bible")
    .maybeSingle();

  if (!cbDoc?.latest_version_id) {
    console.log("[atom-backfill] No character bible found — skipping character atoms");
    return { atoms: allAtoms, counts };
  }

  const { data: cbVersion } = await admin
    .from("project_document_versions")
    .select("plaintext, id")
    .eq("id", cbDoc.latest_version_id)
    .maybeSingle();

  if (!cbVersion?.plaintext || cbVersion.plaintext.length < 50) {
    console.log("[atom-backfill] Character bible too short — skipping LLM extraction");
    return { atoms: allAtoms, counts };
  }

  // Try to identify individual characters in the text
  const charNameMatch = cbVersion.plaintext.match(/##\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
  const charNames = charNameMatch
    ? [...new Set(charNameMatch.map((m) => m.replace(/^##\s+/, "").trim()))].filter(Boolean)
    : ["Protagonist"];

  for (const charName of charNames.slice(0, 5)) {
    // Extract each atom type for this character
    for (const atomType of ["character_goal", "character_fear", "character_secret", "character_backstory_event"] as ApprovedAtomType[]) {
      const extracted = await extractAtomsFromText(cbVersion.plaintext, atomType, { name: charName });
      for (const atom of extracted) {
        atom.origin_doc_id = cbVersion.id;
        atom.attributes.source = `character_bible v${cbDoc.latest_version_id}`;
      }
      allAtoms.push(...extracted);
      counts[atomType] += extracted.length;
    }

    // Extract relationships
    const relText = cbVersion.plaintext;
    const rels = await extractAtomsFromText(relText, "character_relationship", { name: charName });
    for (const rel of rels) {
      rel.origin_doc_id = cbVersion.id;
      rel.attributes.source = `character_bible v${cbDoc.latest_version_id}`;
    }
    allAtoms.push(...rels);
    counts.character_relationship += rels.length;
  }

  return { atoms: allAtoms, counts };
}

async function extractCanonAtoms(
  admin: any,
  projectId: string
): Promise<{ atoms: AtomRecord[]; counts: Record<string, number> }> {
  const counts: Record<string, number> = { world_rule: 0, character_relationship: 0 };
  const allAtoms: AtomRecord[] = [];

  const { data: canon } = await admin
    .from("project_canon")
    .select("canon_json")
    .eq("project_id", projectId)
    .maybeSingle();

  if (canon?.canon_json) {
    const worldRules = extractWorldRulesFromCanon(canon.canon_json);
    for (const rule of worldRules) {
      rule.attributes.source = "canon_json";
    }
    allAtoms.push(...worldRules);
    counts.world_rule = worldRules.filter((a) => a.atom_type === "world_rule").length;
    counts.character_relationship = worldRules.filter((a) => a.atom_type === "character_relationship").length;
  }

  return { atoms: allAtoms, counts };
}

async function extractLocationAtoms(
  admin: any,
  projectId: string
): Promise<{ atoms: AtomRecord[]; count: number }> {
  const { data: locations } = await admin
    .from("canon_locations")
    .select("*")
    .eq("project_id", projectId)
    .eq("active", true);

  const atoms = extractLocationFacts(locations || []);
  return { atoms, count: atoms.length };
}

async function extractSceneAtoms(
  admin: any,
  projectId: string
): Promise<{ atoms: AtomRecord[]; count: number }> {
  // Get latest scene graph version for each scene
  const { data: scenes } = await admin
    .from("scene_graph_scenes")
    .select("id, scene_key, slugline")
    .eq("project_id", projectId)
    .limit(100);

  if (!scenes || scenes.length === 0) return { atoms: [], count: 0 };

  // Get the latest version for each scene
  const sceneIds = scenes.map((s) => s.id);
  const { data: versions } = await admin
    .from("scene_graph_versions")
    .select("scene_id, slugline, summary, time_of_day, location, metadata")
    .in("scene_id", sceneIds)
    .order("version_number", { ascending: false })
    .limit(sceneIds.length);

  // Deduplicate — get latest version per scene
  const versionMap = new Map();
  for (const v of versions || []) {
    if (!versionMap.has(v.scene_id)) {
      versionMap.set(v.scene_id, v);
    }
  }

  const uniqueVersions = [...versionMap.values()];
  const timelineAtoms = extractTimelineEvents(uniqueVersions);

  // Also extract location facts from scene locations
  const locationFacts: AtomRecord[] = [];
  const seenLocations = new Set<string>();
  for (const v of uniqueVersions) {
    if (v.location && !seenLocations.has(v.location)) {
      seenLocations.add(v.location);
      locationFacts.push({
        project_id: "",
        atom_type: "location_fact",
        entity_id: v.scene_id,
        canonical_name: v.location,
        confidence: 0.85,
        attributes: {
          text: `Location: ${v.location}${v.time_of_day ? ` — ${v.time_of_day}` : ""}`,
          confidence: 0.85,
          source: "scene_graph_versions",
          display_only: true,
        },
      });
    }
  }

  return { atoms: [...timelineAtoms, ...locationFacts], count: timelineAtoms.length + locationFacts.length };
}

// ── MAIN HANDLER ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { projectId, mode = "full" } = await req.json();
    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = makeClient();
    const summary: Record<string, any> = { project_id: projectId, mode };

    // Phase: Clear existing atoms for this project (clean backfill)
    if (mode === "full" || mode === "clear") {
      await admin.from("atom_dependencies").delete().eq("project_id", projectId);
      await admin.from("atoms").delete().eq("project_id", projectId);
      if (mode === "clear") {
        return new Response(
          JSON.stringify({ success: true, message: "Atoms cleared for project", projectId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 1. Extract from Character Bible (LLM needed)
    console.log("[atom-backfill] Extracting character bible atoms...");
    const cbResult = await extractCharacterBibleAtoms(admin, projectId);
    const cbWritten = await writeAtoms(admin, projectId, cbResult.atoms);

    // 2. Extract from project_canon (structured)
    console.log("[atom-backfill] Extracting canon atoms...");
    const canonResult = await extractCanonAtoms(admin, projectId);
    const canonWritten = await writeAtoms(admin, projectId, canonResult.atoms);

    // 3. Extract from canon_locations (structured)
    console.log("[atom-backfill] Extracting location atoms...");
    const locResult = await extractLocationAtoms(admin, projectId);
    const locWritten = await writeAtoms(admin, projectId, locResult.atoms);

    // 4. Extract from scene graph (structured)
    console.log("[atom-backfill] Extracting scene atoms...");
    const sceneResult = await extractSceneAtoms(admin, projectId);
    const sceneWritten = await writeAtoms(admin, projectId, sceneResult.atoms);

    // 5. Write dependencies
    console.log("[atom-backfill] Writing dependencies...");
    // Fetch all atoms we just wrote to build dependencies
    const { data: allAtoms } = await admin
      .from("atoms")
      .select("id, atom_type")
      .eq("project_id", projectId);

    const typeGroups: Record<string, string[]> = {};
    for (const atom of allAtoms || []) {
      if (!typeGroups[atom.atom_type]) typeGroups[atom.atom_type] = [];
      typeGroups[atom.atom_type].push(atom.id);
    }

    const depEntries = Object.entries(typeGroups).map(([atom_type, ids]) => ({
      atom_type: atom_type as ApprovedAtomType,
      ids,
    }));
    const depsWritten = await writeDependencies(admin, projectId, depEntries);

    // Summary
    summary.extraction = {
      character_bible: { atoms_extracted: cbResult.atoms.length, ...cbResult.counts, errors: cbWritten.errors.length },
      canon: { atoms_extracted: canonResult.atoms.length, ...canonResult.counts, errors: canonWritten.errors.length },
      locations: { atoms_extracted: locResult.count, errors: locWritten.errors.length },
      scene_graph: { atoms_extracted: sceneResult.count, errors: sceneWritten.errors.length },
    };
    summary.total_atoms = cbResult.atoms.length + canonResult.atoms.length + locResult.count + sceneResult.count;
    summary.total_dependencies = depsWritten;
    summary.total_errors = cbWritten.errors.length + canonWritten.errors.length + locWritten.errors.length + sceneWritten.errors.length;

    console.log("[atom-backfill] Complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[atom-backfill] Fatal error:", err?.message);
    return new Response(
      JSON.stringify({ error: err?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
