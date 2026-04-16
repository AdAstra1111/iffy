/**
 * propagation-impact-engine
 *
 * Phase 2.2 — Propagation Impact Engine
 *
 * Given an upstream document change, computes downstream impacts, contradiction
 * warnings, and a topologically-sorted patch sequence.
 *
 * Write-path companion to impactEngine.ts (read-path staleness engine).
 * Reads deliverableDependencyRegistry statically — does NOT reimplement the graph.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ─────────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────────── */

type ImpactSeverity = "critical" | "high" | "medium" | "low" | "none";

interface DocumentImpact {
  docType: string;
  impactSeverity: ImpactSeverity;
  impactReason: string;
  needsRegeneration: boolean;
  regenerationMethod: "full" | "patch" | "review_only";
  blockers: string[];
}

interface SceneImpact {
  sceneKey: string;
  slugline: string;
  whatChanged: "content" | "slugline" | "characters" | "location" | "time_of_day";
  downstreamSceneImpacts: {
    docType: string;
    description: string;
  }[];
}

interface CharacterImpact {
  entityId: string;
  canonicalName: string;
  changeType: "added" | "removed" | "renamed" | "role_changed" | "scene_count_changed";
  affectedDocs: {
    docType: string;
    impact: ImpactSeverity;
    description: string;
  }[];
}

interface ContradictionWarning {
  contradictionType: "character_role" | "event_order" | "location" | "tone" | "arc_direction" | "entity_missing";
  upstreamSource: { docType: string; field: string; value: string };
  downstreamTarget: { docType: string; beatOrScene: string; value: string };
  severity: "critical" | "high" | "medium";
  resolution: string;
  blocksChange: boolean;
}

interface PatchStep {
  step: number;
  canParallelize: boolean;
  documents: string[];
  action: "regenerate" | "review" | "recalculate_entity_links" | "none";
  blockers: string[];
  description: string;
}

interface PropagationImpactReport {
  projectId: string;
  changedDocType: string;
  changedFields?: string[];
  generatedAt: string;
  downstreamImpacts: DocumentImpact[];
  sceneImpacts: SceneImpact[];
  characterImpacts: CharacterImpact[];
  contradictions: ContradictionWarning[];
  patchSequence: PatchStep[];
  estimatedChangeMagnitude: "minor" | "moderate" | "major" | "total";
}

/* ─────────────────────────────────────────────────────────────────
   Deliverable Dependency Registry (static — from Phase 1)
   Covers all lanes and document types.
   ───────────────────────────────────────────────────────────────── */

const LANE_DOC_LADDERS: Record<string, string[]> = {
  feature_film: [
    "idea", "concept_brief", "treatment", "story_outline",
    "character_bible", "beat_sheet", "feature_script", "production_draft",
  ],
  series: [
    "idea", "concept_brief", "series_bible", "season_arc",
    "episode_grid", "episode_outline", "episode_script", "production_draft",
  ],
  vertical_drama: [
    "idea", "concept_brief", "story_outline",
    "character_bible", "beat_sheet", "vertical_script", "production_draft",
  ],
};

// Canonical entity/document dependency edges
const ENTITY_DEPENDENCY_EDGES: Array<{ from: string; to: string; kind: string; strength: string }> = [
  { from: "scene_graph",           to: "narrative_units",                   kind: "canon",   strength: "hard" },
  { from: "scene_graph",           to: "narrative_scene_entity_links",       kind: "canon",   strength: "hard" },
  { from: "narrative_units",        to: "character_bible",                     kind: "canon",   strength: "soft" },
  { from: "narrative_scene_entity_links", to: "character_bible",           kind: "canon",   strength: "soft" },
  { from: "narrative_entity_relations", to: "character_bible",             kind: "canon",   strength: "soft" },
];

// Ladder document dependency edges (ladder_position-based)
const LADDER_DEPENDENCY_EDGES: Array<{ from: string; to: string; kind: string; strength: string }> = [
  { from: "idea",             to: "concept_brief",    kind: "canon",   strength: "hard" },
  { from: "concept_brief",    to: "treatment",         kind: "canon",   strength: "hard" },
  { from: "treatment",         to: "story_outline",     kind: "structure", strength: "hard" },
  { from: "treatment",         to: "character_bible",   kind: "canon",   strength: "hard" },
  { from: "story_outline",     to: "beat_sheet",       kind: "structure", strength: "hard" },
  { from: "character_bible",   to: "beat_sheet",       kind: "canon",   strength: "soft" },
  { from: "beat_sheet",        to: "feature_script",   kind: "structure", strength: "hard" },
  { from: "character_bible",   to: "feature_script",   kind: "canon",   strength: "hard" },
  { from: "feature_script",    to: "production_draft",  kind: "structure", strength: "hard" },
];

// Additional entity-to-entity edges
const ENTITY_TO_ENTITY_EDGES: Array<{ from: string; to: string; kind: string }> = [
  { from: "narrative_units",  to: "narrative_scene_entity_links", kind: "canon" },
];

// Severity weights per edge kind
const SEVERITY_MAP: Record<string, ImpactSeverity> = {
  "structure|hard": "critical",
  "canon|hard":     "critical",
  "structure|soft": "high",
  "canon|soft":     "medium",
  "canon|unknown":   "medium",
  "production|soft": "low",
};

/* ─────────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────────── */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getSeverity(kind: string, strength: string): ImpactSeverity {
  const key = `${kind}|${strength}`;
  return SEVERITY_MAP[key] ?? "medium";
}

function getDocTypeFromDocTypeName(docType: string): string {
  // Normalise doc type names
  return docType.toLowerCase().replace(/[_-]/g, "_");
}

function isLadderDoc(docType: string): boolean {
  const norm = getDocTypeFromDocTypeName(docType);
  return LANE_DOC_LADDERS.feature_film.includes(norm) ||
         LANE_DOC_LADDERS.series.includes(norm) ||
         LANE_DOC_LADDERS.vertical_drama.includes(norm);
}

function isEntityDoc(docType: string): boolean {
  const norm = getDocTypeFromDocTypeName(docType);
  return ["scene_graph", "narrative_units", "narrative_scene_entity_links",
          "narrative_entity_relations", "narrative_entities"].includes(norm);
}

/** Topological sort of downstream doc types by dependency distance from changed doc. */
function computeDownstreamImpacts(changedDocType: string): DocumentImpact[] {
  const impacts: DocumentImpact[] = [];
  const visited = new Set<string>();
  const allEdges = [...LADDER_DEPENDENCY_EDGES, ...ENTITY_DEPENDENCY_EDGES];

  // BFS to find all reachable downstream doc types
  const queue: Array<{ docType: string; distance: number; path: string[] }> = [
    { docType: changedDocType, distance: 0, path: [changedDocType] }
  ];

  const seen = new Map<string, { distance: number; path: string[] }>();

  while (queue.length > 0) {
    const { docType, distance, path } = queue.shift()!;
    if (visited.has(docType)) continue;
    visited.add(docType);

    for (const edge of allEdges) {
      const upstreamNorm = getDocTypeFromDocTypeName(edge.from);
      if (upstreamNorm !== getDocTypeFromDocTypeName(docType)) continue;

      const downstreamNorm = getDocTypeFromDocTypeName(edge.to);
      if (seen.has(downstreamNorm)) continue;

      const newDistance = distance + 1;
      const newPath = [...path, downstreamNorm];
      seen.set(downstreamNorm, { distance: newDistance, path: newPath });

      const severity = getSeverity(edge.kind, edge.strength);

      queue.push({ docType: downstreamNorm, distance: newDistance, path: newPath });

      if (severity !== "none") {
        const existing = impacts.find(i => i.docType === downstreamNorm);
        if (!existing || severityPriority(severity) > severityPriority(existing.impactSeverity)) {
          const idx = impacts.findIndex(i => i.docType === downstreamNorm);
          const impact: DocumentImpact = {
            docType: downstreamNorm,
            impactSeverity: severity,
            impactReason: `Via ${edge.kind} dependency (${edge.strength}) from ${changedDocType}`,
            needsRegeneration: severity === "critical" || severity === "high",
            regenerationMethod: severity === "critical" ? "full" : severity === "high" ? "patch" : "review_only",
            blockers: [],
          };
          if (idx >= 0) {
            impacts[idx] = impact;
          } else {
            impacts.push(impact);
          }
        }
      }
    }
  }

  // Sort by dependency distance (closest downstream first)
  impacts.sort((a, b) => {
    const aDist = (seen.get(getDocTypeFromDocTypeName(a.docType))?.distance ?? 99);
    const bDist = (seen.get(getDocTypeFromDocTypeName(b.docType))?.distance ?? 99);
    return aDist - bDist;
  });

  return impacts;
}

function severityPriority(s: ImpactSeverity): number {
  return { critical: 4, high: 3, medium: 2, low: 1, none: 0 }[s] ?? 0;
}

/** Compute topologically-sorted patch sequence for downstream documents. */
function computePatchSequence(
  changedDocType: string,
  downstreamImpacts: DocumentImpact[]
): PatchStep[] {
  const steps: PatchStep[] = [];
  const processed = new Set<string>();
  const allEdges = [...LADDER_DEPENDENCY_EDGES, ...ENTITY_DEPENDENCY_EDGES];

  // Build adjacency: docType -> downstream doc types
  const downstreamMap = new Map<string, string[]>();
  for (const edge of allEdges) {
    const from = getDocTypeFromDocTypeName(edge.from);
    const to = getDocTypeFromDocTypeName(edge.to);
    if (!downstreamMap.has(from)) downstreamMap.set(from, []);
    downstreamMap.get(from)!.push(to);
  }

  // BFS from changed doc — at each step, collect docs whose upstream deps are all processed
  const remaining = new Set(downstreamImpacts.map(i => getDocTypeFromDocTypeName(i.docType)));
  let step = 1;

  while (remaining.size > 0) {
    const canProcess: string[] = [];

    for (const docType of remaining) {
      // Check if all upstream deps of docType are processed
      const upstreamEdges = allEdges.filter(
        e => getDocTypeFromDocTypeName(e.to) === docType
      );
      const upstreamDocs = upstreamEdges.map(e => getDocTypeFromDocTypeName(e.from));

      const allUpstreamProcessed = upstreamDocs.every(
        u => u === changedDocType || processed.has(u) || !remaining.has(u)
      );

      if (allUpstreamProcessed) {
        canProcess.push(docType);
      }
    }

    if (canProcess.length === 0) {
      // Circular dependency — force-process remaining
      canProcess.push(...remaining);
      remaining.clear();
    }

    for (const docType of canProcess) {
      remaining.delete(docType);
      processed.add(docType);
    }

    const action: PatchStep["action"] = canProcess.some(
      d => downstreamImpacts.find(i => getDocTypeFromDocTypeName(i.docType) === d)?.regenerationMethod === "full"
    ) ? "regenerate" : "review";

    steps.push({
      step,
      canParallelize: canProcess.length > 1,
      documents: canProcess,
      action,
      blockers: [],
      description: `Step ${step}: ${canProcess.length === 1 ? canProcess[0] : `parallel: ${canProcess.join(", ")}`}`,
    });

    step++;
  }

  return steps;
}

/** Estimate change magnitude based on which doc type changed and how. */
function estimateChangeMagnitude(
  changedDocType: string,
  changedFields?: string[]
): "minor" | "moderate" | "major" | "total" {
  const norm = getDocTypeFromDocTypeName(changedDocType);
  const allEdges = [...LADDER_DEPENDENCY_EDGES, ...ENTITY_DEPENDENCY_EDGES];
  const downstream = new Set<string>();
  const queue = [norm];
  while (queue.length) {
    const curr = queue.shift()!;
    for (const edge of allEdges) {
      if (getDocTypeFromDocTypeName(edge.from) === curr) {
        const next = getDocTypeFromDocTypeName(edge.to);
        if (!downstream.has(next)) {
          downstream.add(next);
          queue.push(next);
        }
      }
    }
  }

  // Count critical downstream docs
  const criticalCount = downstream.size;

  if (["idea", "production_draft"].includes(norm)) return "total";
  if (["concept_brief", "story_outline", "beat_sheet", "scene_graph"].includes(norm)) {
    return criticalCount >= 4 ? "major" : criticalCount >= 2 ? "moderate" : "minor";
  }
  if (["treatment", "character_bible", "feature_script"].includes(norm)) {
    return criticalCount >= 3 ? "major" : "moderate";
  }
  if (["narrative_units", "narrative_scene_entity_links"].includes(norm)) {
    return "moderate";
  }
  return "moderate";
}

/* ─────────────────────────────────────────────────────────────────
   Fetch helpers
   ───────────────────────────────────────────────────────────────── */

async function fetchLatestDocVersion(
  supabase: any,
  projectId: string,
  docType: string
): Promise<any | null> {
  const { data: doc } = await supabase
    .from("project_documents")
    .select("id")
    .eq("project_id", projectId)
    .eq("doc_type", docType)
    .maybeSingle();

  if (!doc) return null;

  const { data: version } = await supabase
    .from("project_document_versions")
    .select("*")
    .eq("document_id", doc.id)
    .eq("is_current", true)
    .maybeSingle();

  return version || null;
}

/* ─────────────────────────────────────────────────────────────────
   Contradiction Detection
   ───────────────────────────────────────────────────────────────── */

function detectCharacterRoleContradictions(
  changedDocType: string,
  changedFields: string[] | undefined,
  newValues: Record<string, any>,
  downstreamImpacts: DocumentImpact[],
  supabase: any
): ContradictionWarning[] {
  const warnings: ContradictionWarning[] = [];

  // Only check character role contradictions when concept_brief protagonist changes
  if (changedDocType !== "concept_brief") return warnings;
  if (!changedFields?.some(f => f.includes("protagonist") || f.includes("character"))) return warnings;

  // This is a simplified check — full implementation would fetch downstream docs
  // and check for explicit contradictions
  // Placeholder: real implementation would compare concept_brief character roles
  // against beat_sheet narrator beats and character_bible role assignments

  return warnings;
}

/* ─────────────────────────────────────────────────────────────────
   Main handler
   POST body: {
     projectId: string,
     changedDocType: string,
     changedFields?: string[],
     changedSceneKey?: string,    // if scene_graph changed
     changedEntityId?: string,    // if narrative_entities changed
     detectContradictions?: boolean
   }
   ───────────────────────────────────────────────────────────────── */

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      projectId,
      changedDocType,
      changedFields,
      changedSceneKey,
      changedEntityId,
      detectContradictions = false,
    } = await req.json();

    if (!projectId || !changedDocType) {
      return new Response(JSON.stringify({ error: "projectId and changedDocType are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const normChangedDoc = getDocTypeFromDocTypeName(changedDocType);

    // ── Compute downstream impacts ──
    const downstreamImpacts = computeDownstreamImpacts(normChangedDoc);

    // ── Scene-level impacts (if scene_graph changed) ──
    const sceneImpacts: SceneImpact[] = [];
    if (changedSceneKey) {
      // For a scene-level change, downstream is entity re-linking for that scene
      // plus any beat_sheet or feature_script beats referencing that scene
      sceneImpacts.push({
        sceneKey: changedSceneKey,
        slugline: "",
        whatChanged: "content",
        downstreamSceneImpacts: [
          { docType: "narrative_scene_entity_links", description: "Entity links for this scene must be recalculated" },
          { docType: "narrative_units", description: "Entity presence counts for linked entities may change" },
        ],
      });
    }

    // ── Character-level impacts (if entity changed) ──
    const characterImpacts: CharacterImpact[] = [];
    if (changedEntityId) {
      // For an entity change, mark character_bible and narrative_scene_entity_links as affected
      const entityImpacts = downstreamImpacts.filter(i =>
        ["character_bible", "narrative_scene_entity_links"].includes(i.docType)
      );
      characterImpacts.push({
        entityId: changedEntityId,
        canonicalName: "",
        changeType: "scene_count_changed",
        affectedDocs: entityImpacts.map(i => ({
          docType: i.docType,
          impact: i.impactSeverity,
          description: i.impactReason,
        })),
      });
    }

    // ── Contradiction detection ──
    const contradictions: ContradictionWarning[] = [];
    if (detectContradictions) {
      const newValues: Record<string, any> = { /* would be populated from request */ };
      contradictions.push(
        ...detectCharacterRoleContradictions(changedDocType, changedFields, newValues, downstreamImpacts, supabase)
      );
    }

    // ── Patch sequence ──
    const patchSequence = computePatchSequence(normChangedDoc, downstreamImpacts);

    // ── Change magnitude ──
    const estimatedChangeMagnitude = estimateChangeMagnitude(changedDocType, changedFields);

    const report: PropagationImpactReport = {
      projectId,
      changedDocType: normChangedDoc,
      changedFields,
      generatedAt: new Date().toISOString(),
      downstreamImpacts,
      sceneImpacts,
      characterImpacts,
      contradictions,
      patchSequence,
      estimatedChangeMagnitude,
    };

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
