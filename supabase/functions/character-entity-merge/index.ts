/**
 * character-entity-merge — Edge function for detecting and merging duplicate character entities.
 *
 * Actions:
 *   - status:   Scan for potential duplicate characters via alias cross-references and name normalization
 *   - plan:     Generate a detailed merge plan for detected duplicate clusters
 *   - execute:  Perform the merge operations in a transaction-like order
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

// ─── Action: status ───────────────────────────────────────────────────────────

async function handleStatus(sb: any, projectId: string) {
  // 1. Fetch all active character entities for the project
  const { data: entities, error: entErr } = await sb
    .from("narrative_entities")
    .select("id, canonical_name, created_at")
    .eq("project_id", projectId)
    .eq("entity_type", "character")
    .neq("status", "deleted");

  if (entErr) throw entErr;
  if (!entities || entities.length === 0) {
    return { total_character_entities: 0, potential_duplicates: [] };
  }

  // 2. Fetch all aliases for the project
  const { data: aliases, error: aliasErr } = await sb
    .from("narrative_entity_aliases")
    .select("alias_name, canonical_entity_id")
    .eq("project_id", projectId);

  if (aliasErr) throw aliasErr;

  // Build alias lookup: alias_name -> canonical_entity_id
  const aliasToCanonical = new Map<string, string>();
  for (const a of aliases || []) {
    const key = normalizeName(a.alias_name);
    // Prefer existing; only set if not already mapped
    if (!aliasToCanonical.has(key)) {
      aliasToCanonical.set(key, a.canonical_entity_id);
    }
  }

  // Build reverse: canonical_entity_id -> set of alias names
  const canonicalAliases = new Map<string, Set<string>>();
  for (const a of aliases || []) {
    if (!canonicalAliases.has(a.canonical_entity_id)) {
      canonicalAliases.set(a.canonical_entity_id, new Set());
    }
    canonicalAliases.get(a.canonical_entity_id)!.add(normalizeName(a.alias_name));
  }

  // 3. Build entity lookup maps
  const entityById = new Map<string, any>();
  const normalizedNames = new Map<string, string[]>();
  const entityIdsByNorm = new Map<string, string[]>();

  for (const e of entities) {
    entityById.set(e.id, e);
    const norm = normalizeName(e.canonical_name);
    if (!normalizedNames.has(norm)) {
      normalizedNames.set(norm, []);
      entityIdsByNorm.set(norm, []);
    }
    normalizedNames.get(norm)!.push(e.canonical_name);
    entityIdsByNorm.get(norm)!.push(e.id);
  }

  // 4. Detect clusters
  // Algorithm:
  // a) If entity A's canonical_name (normalized) matches an alias pointing to entity B, they're the same character
  // b) Entities with the same normalized name are the same character
  // c) If two entities share an alias pointing to both (aliases map to both), they're related

  const visited = new Set<string>();
  const clusters: Array<{
    entity_ids: string[];
    names: string[];
    reason: string;
  }> = [];

  // Build adjacency: which entity IDs are connected via aliases
  // For each entity, check if its normalized name appears as an alias for another entity
  const adjacency = new Map<string, Set<string>>();
  for (const e of entities) {
    const norm = normalizeName(e.canonical_name);
    const canonicalId = aliasToCanonical.get(norm);
    if (canonicalId && canonicalId !== e.id) {
      // e's name is an alias for canonicalId
      if (!adjacency.has(e.id)) adjacency.set(e.id, new Set());
      if (!adjacency.has(canonicalId)) adjacency.set(canonicalId, new Set());
      adjacency.get(e.id)!.add(canonicalId);
      adjacency.get(canonicalId)!.add(e.id);
    }
  }

  // Also connect entities whose canonical names (normalized) appear as aliases
  // for any entity AND those aliased entities have the same normalised name
  // For each alias, check if the alias_name (normalized) matches any entity's normalized name
  for (const a of aliases || []) {
    const aliasNorm = normalizeName(a.alias_name);
    const matchingEntityIds = entityIdsByNorm.get(aliasNorm);
    if (matchingEntityIds && matchingEntityIds.length > 0) {
      for (const eid of matchingEntityIds) {
        if (eid !== a.canonical_entity_id) {
          if (!adjacency.has(eid)) adjacency.set(eid, new Set());
          if (!adjacency.has(a.canonical_entity_id)) adjacency.set(a.canonical_entity_id, new Set());
          adjacency.get(eid)!.add(a.canonical_entity_id);
          adjacency.get(a.canonical_entity_id)!.add(eid);
        }
      }
    }
  }

  // Also group by same normalized name
  for (const [norm, ids] of entityIdsByNorm) {
    if (ids.length > 1) {
      // Connect all entities with the same normalized name
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (!adjacency.has(ids[i])) adjacency.set(ids[i], new Set());
          if (!adjacency.has(ids[j])) adjacency.set(ids[j], new Set());
          adjacency.get(ids[i])!.add(ids[j]);
          adjacency.get(ids[j])!.add(ids[i]);
        }
      }
    }
  }

  // Do BFS/DFS on adjacency graph to find connected components (clusters)
  for (const e of entities) {
    if (visited.has(e.id)) continue;

    // Check if this entity has any adjacency edges = it's a potential duplicate
    // Skip singletons (no adjacency edges at all)
    const adjacencies = adjacency.get(e.id);
    if (!adjacencies || adjacencies.size === 0) continue;

    // BFS to collect the full cluster
    const clusterIds: string[] = [];
    const queue = [e.id];
    visited.add(e.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      clusterIds.push(current);
      const neighbors = adjacency.get(current);
      if (neighbors) {
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
    }

    // Construct cluster. Use original entity order to keep deterministic
    const names = clusterIds.map((id) => entityById.get(id)?.canonical_name || "").filter(Boolean);
    let reason: string;

    // Determine reason based on cluster properties
    const normCount = new Map<string, number>();
    for (const n of names) {
      const norm = normalizeName(n);
      normCount.set(norm, (normCount.get(norm) || 0) + 1);
    }
    const sameNameGroups = [...normCount.entries()].filter(([_, c]) => c > 1);
    if (sameNameGroups.length > 0) {
      reason = `Entities share the same canonical name: "${sameNameGroups[0][0]}"`;
    } else {
      reason = "Entity canonical name matches an alias of another entity";
    }

    clusters.push({
      entity_ids: clusterIds,
      names,
      reason,
    });
  }

  // 5. Enrich clusters with scene link and relation counts
  const enrichedClusters: Array<{
    cluster_id: string;
    entity_ids: string[];
    names: string[];
    reason: string;
    scene_links_count: number;
    relation_count: number;
  }> = [];

  for (const cluster of clusters) {
    // Count scene links
    const { data: sceneLinks, error: slErr } = await sb
      .from("narrative_scene_entity_links")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("entity_id", cluster.entity_ids);

    if (slErr) throw slErr;

    // Count relations (both source and target)
    const { data: relSrc, error: rsErr } = await sb
      .from("narrative_entity_relations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("source_entity_id", cluster.entity_ids);

    if (rsErr) throw rsErr;

    const { data: relTgt, error: rtErr } = await sb
      .from("narrative_entity_relations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("target_entity_id", cluster.entity_ids);

    if (rtErr) throw rtErr;

    const sceneLinksCount = typeof sceneLinks === "object" && sceneLinks !== null && "count" in sceneLinks
      ? (sceneLinks as any).count
      : 0;
    const relSrcCount = typeof relSrc === "object" && relSrc !== null && "count" in relSrc
      ? (relSrc as any).count
      : 0;
    const relTgtCount = typeof relTgt === "object" && relTgt !== null && "count" in relTgt
      ? (relTgt as any).count
      : 0;

    // Use the first entity ID as a stable cluster_id
    enrichedClusters.push({
      cluster_id: cluster.entity_ids.sort()[0],
      entity_ids: cluster.entity_ids,
      names: cluster.names,
      reason: cluster.reason,
      scene_links_count: sceneLinksCount,
      relation_count: relSrcCount + relTgtCount,
    });
  }

  // Sort by scene_links_count descending
  enrichedClusters.sort((a, b) => b.scene_links_count - a.scene_links_count);

  return {
    total_character_entities: entities.length,
    potential_duplicates: enrichedClusters,
  };
}

// ─── Action: plan ─────────────────────────────────────────────────────────────

async function handlePlan(sb: any, projectId: string) {
  // First, get status data
  const statusResult = await handleStatus(sb, projectId);
  const clusters = statusResult.potential_duplicates;

  if (!clusters || clusters.length === 0) {
    return { merges: [] };
  }

  const merges: Array<{
    canonical_entity_id: string;
    canonical_name: string;
    absorbed_entity_ids: string[];
    absorbed_names: string[];
    scene_links_to_repair: number;
    relations_to_repair: number;
    aliases_to_insert: string[];
    document_sections_to_merge: Array<{
      document_id: string;
      version_id: string;
      section_headers: string[];
    }>;
  }> = [];

  // Fetch existing aliases for alias dedup check
  const { data: allAliases, error: aliasErr } = await sb
    .from("narrative_entity_aliases")
    .select("alias_name, canonical_entity_id")
    .eq("project_id", projectId);

  if (aliasErr) throw aliasErr;

  const existingAliasNames = new Set(
    (allAliases || []).map((a: any) => normalizeName(a.alias_name))
  );

  for (const cluster of clusters) {
    if (cluster.entity_ids.length < 2) continue;

    // Gather entity details
    const { data: entityDetails, error: detErr } = await sb
      .from("narrative_entities")
      .select("id, canonical_name, created_at")
      .eq("project_id", projectId)
      .in("id", cluster.entity_ids);

    if (detErr) throw detErr;
    if (!entityDetails || entityDetails.length === 0) continue;

    // Count scene links per entity for canonical selection
    const sceneLinkCounts = new Map<string, number>();
    const relationCounts = new Map<string, number>();

    for (const eid of cluster.entity_ids) {
      const { count: slCount, error: slErr } = await sb
        .from("narrative_scene_entity_links")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("entity_id", eid);

      if (slErr) throw slErr;
      sceneLinkCounts.set(eid, slCount ?? 0);

      const { count: rsCount, error: rsErr } = await sb
        .from("narrative_entity_relations")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("source_entity_id", eid);

      if (rsErr) throw rsErr;

      const { count: rtCount, error: rtErr } = await sb
        .from("narrative_entity_relations")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("target_entity_id", eid);

      if (rtErr) throw rtErr;

      relationCounts.set(eid, (rsCount ?? 0) + (rtCount ?? 0));
    }

    // Pick canonical entity: most scene links, then longest name, then first created
    const sortedEntities = entityDetails.sort((a: any, b: any) => {
      const aLinks = sceneLinkCounts.get(a.id) ?? 0;
      const bLinks = sceneLinkCounts.get(b.id) ?? 0;
      if (bLinks !== aLinks) return bLinks - aLinks;
      if (a.canonical_name.length !== b.canonical_name.length) {
        return b.canonical_name.length - a.canonical_name.length;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const canonical = sortedEntities[0];
    const absorbedEntities = sortedEntities.slice(1);

    // Compute absorbed names that aren't already aliases
    const absorbedNames = absorbedEntities.map((e: any) => e.canonical_name);
    const aliasesToInsert: string[] = [];
    for (const name of absorbedNames) {
      const norm = normalizeName(name);
      // Check if it's already an alias
      const aliasCheck = (allAliases || []).filter(
        (a: any) => normalizeName(a.alias_name) === norm && a.canonical_entity_id === canonical.id
      );
      // Also check if name equals canonical's own name
      if (!aliasCheck.length && normalizeName(canonical.canonical_name) !== norm) {
        aliasesToInsert.push(name);
      }
    }

    // Compute scene links to repair: total scene links from absorbed entities
    let sceneLinksToRepair = 0;
    for (const ae of absorbedEntities) {
      sceneLinksToRepair += sceneLinkCounts.get(ae.id) ?? 0;
    }

    // Compute relations to repair
    let relationsToRepair = 0;
    for (const ae of absorbedEntities) {
      relationsToRepair += relationCounts.get(ae.id) ?? 0;
    }

    // Document sections to merge — collect from scene_entity_links and mentions
    // Look up which documents/scenes the absorbed entities are linked to
    const { data: absorbedLinks, error: alErr } = await sb
      .from("narrative_scene_entity_links")
      .select("scene_id")
      .eq("project_id", projectId)
      .in("entity_id", absorbedEntities.map((e: any) => e.id));

    if (alErr) throw alErr;

    // Get document info from scene_id references — we return document_id and version_id
    // from narrative_entity_mentions for absorbed entities
    const { data: mentions, error: menErr } = await sb
      .from("narrative_entity_mentions")
      .select("document_id, version_id, section_key")
      .eq("project_id", projectId)
      .in("entity_id", absorbedEntities.map((e: any) => e.id));

    if (menErr) throw menErr;

    // Group by document_id + version_id
    const docSections = new Map<string, { document_id: string; version_id: string; section_headers: Set<string> }>();
    for (const m of mentions || []) {
      const key = `${m.document_id}::${m.version_id}`;
      if (!docSections.has(key)) {
        docSections.set(key, {
          document_id: m.document_id,
          version_id: m.version_id,
          section_headers: new Set(),
        });
      }
      if (m.section_key) {
        docSections.get(key)!.section_headers.add(m.section_key);
      }
    }

    const documentSectionsToMerge = [...docSections.values()].map((ds) => ({
      document_id: ds.document_id,
      version_id: ds.version_id,
      section_headers: [...ds.section_headers],
    }));

    merges.push({
      canonical_entity_id: canonical.id,
      canonical_name: canonical.canonical_name,
      absorbed_entity_ids: absorbedEntities.map((e: any) => e.id),
      absorbed_names: absorbedNames,
      scene_links_to_repair: sceneLinksToRepair,
      relations_to_repair: relationsToRepair,
      aliases_to_insert: aliasesToInsert,
      document_sections_to_merge: documentSectionsToMerge,
    });
  }

  return { merges };
}

// ─── Action: execute ──────────────────────────────────────────────────────────

async function handleExecute(sb: any, projectId: string, merges: Array<{
  canonical_entity_id: string;
  canonical_name: string;
  absorbed_entity_ids: string[];
  absorbed_names: string[];
  scene_links_to_repair?: number;
  relations_to_repair?: number;
  aliases_to_insert?: string[];
  document_sections_to_merge?: Array<{
    document_id: string;
    version_id: string;
    section_headers: string[];
  }>;
}>) {
  let mergesCompleted = 0;
  let sceneLinksRepaired = 0;
  let relationsRepaired = 0;
  let aliasesInserted = 0;
  let entitiesDeleted = 0;
  const documentIdsToRegenerate = new Set<string>();

  for (const merge of merges) {
    const canonicalId = merge.canonical_entity_id;
    const absorbedIds = merge.absorbed_entity_ids;
    const absorbedNames = merge.absorbed_names || [];

    if (absorbedIds.length === 0) {
      mergesCompleted++;
      continue;
    }

    // Check if canonical already has scene links before the absorbed entity's link
    // to handle UNIQUE constraint on (scene_id, entity_id, relation_type)
    // For each absorbed entity's links, if canonical already has a link for the same scene+relation, delete the absorbed one
    const { data: absorbedLinks, error: alErr } = await sb
      .from("narrative_scene_entity_links")
      .select("id, scene_id, relation_type")
      .eq("project_id", projectId)
      .in("entity_id", absorbedIds);

    if (alErr) throw alErr;

    if (absorbedLinks && absorbedLinks.length > 0) {
      // Get canonical's existing links
      const { data: canonicalLinks, error: clErr } = await sb
        .from("narrative_scene_entity_links")
        .select("scene_id, relation_type")
        .eq("project_id", projectId)
        .eq("entity_id", canonicalId);

      if (clErr) throw clErr;

      // Build set of (scene_id, relation_type) that canonical already has
      const canonicalLinkKeys = new Set<string>();
      for (const cl of canonicalLinks || []) {
        canonicalLinkKeys.add(`${cl.scene_id}::${cl.relation_type || ""}`);
      }

      // Find absorbed links that would conflict
      const conflictIds: string[] = [];
      const safeLinkIds: string[] = [];
      for (const al of absorbedLinks) {
        const key = `${al.scene_id}::${al.relation_type || ""}`;
        if (canonicalLinkKeys.has(key)) {
          conflictIds.push(al.id);
        } else {
          safeLinkIds.push(al.id);
        }
      }

      // Delete conflicting links
      if (conflictIds.length > 0) {
        const { error: delErr } = await sb
          .from("narrative_scene_entity_links")
          .delete()
          .in("id", conflictIds);

        if (delErr) throw delErr;
      }

      // Update remaining absorbed links to point to canonical
      if (safeLinkIds.length > 0) {
        const { error: updErr } = await sb
          .from("narrative_scene_entity_links")
          .update({ entity_id: canonicalId })
          .in("id", safeLinkIds);

        if (updErr) throw updErr;
        sceneLinksRepaired += safeLinkIds.length;
      }

      // Count deleted conflicts as part of repaired (they were handled)
      sceneLinksRepaired += conflictIds.length;
    }

    // Step 2: UPDATE narrative_entity_relations (source)
    const { data: relSrc, error: rsErr } = await sb
      .from("narrative_entity_relations")
      .update({ source_entity_id: canonicalId })
      .eq("project_id", projectId)
      .in("source_entity_id", absorbedIds)
      .select("id");

    if (rsErr) throw rsErr;
    relationsRepaired += (relSrc || []).length;

    // Step 3: UPDATE narrative_entity_relations (target)
    const { data: relTgt, error: rtErr } = await sb
      .from("narrative_entity_relations")
      .update({ target_entity_id: canonicalId })
      .eq("project_id", projectId)
      .in("target_entity_id", absorbedIds)
      .select("id");

    if (rtErr) throw rtErr;
    relationsRepaired += (relTgt || []).length;

    // Step 4: UPDATE narrative_entity_mentions
    const { data: updatedMentions, error: upMenErr } = await sb
      .from("narrative_entity_mentions")
      .update({ entity_id: canonicalId })
      .eq("project_id", projectId)
      .in("entity_id", absorbedIds)
      .select("document_id");

    if (upMenErr) throw upMenErr;

    // Track document IDs for regeneration
    for (const m of updatedMentions || []) {
      if (m.document_id) {
        documentIdsToRegenerate.add(m.document_id);
      }
    }

    // Step 5: Delete self-referential relations where source = target after merge
    const { error: delSelfErr } = await sb
      .from("narrative_entity_relations")
      .delete()
      .eq("project_id", projectId)
      .eq("source_entity_id", canonicalId)
      .eq("target_entity_id", canonicalId);

    if (delSelfErr) throw delSelfErr;

    // Step 6: INSERT entity_aliases for absorbed names
    // Note: narrative_entity_aliases has no normalized_alias column — the UNIQUE
    // constraint is on (project_id, alias_name), not normalized_alias.
    const aliasInserts = (merge.aliases_to_insert || []).map((name) => ({
      project_id: projectId,
      canonical_entity_id: canonicalId,
      alias_name: name,
      source: "manual",
      confidence: 1.0,
    }));

    // Also add any absorbed names not in aliases_to_insert
    const aliasesToInsert = new Set(merge.aliases_to_insert || []);
    for (const name of absorbedNames) {
      if (!aliasesToInsert.has(name)) {
        const norm = normalizeName(name);
        // Skip if it's the same as the canonical name
        if (norm === normalizeName(merge.canonical_name)) continue;
        aliasInserts.push({
          project_id: projectId,
          canonical_entity_id: canonicalId,
          alias_name: name,
          source: "manual",
          confidence: 1.0,
        });
      }
    }

    if (aliasInserts.length > 0) {
      const { error: insAliasErr } = await sb
        .from("narrative_entity_aliases")
        .insert(aliasInserts);

      if (insAliasErr) throw insAliasErr;
      aliasesInserted += aliasInserts.length;
    }

    // Step 7: DELETE absorbed entities
    const { error: delEntErr } = await sb
      .from("narrative_entities")
      .delete()
      .eq("project_id", projectId)
      .in("id", absorbedIds);

    if (delEntErr) throw delEntErr;
    entitiesDeleted += absorbedIds.length;

    mergesCompleted++;
  }

  return {
    success: true,
    merges_completed: mergesCompleted,
    scene_links_repaired: sceneLinksRepaired,
    relations_repaired: relationsRepaired,
    aliases_inserted: aliasesInserted,
    entities_deleted: entitiesDeleted,
    document_ids_to_regenerate: [...documentIdsToRegenerate],
  };
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sb = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const action: string = body.action || "status";
    const projectId: string = body.projectId;

    if (!projectId) throw new Error("projectId required");

    let result: any;

    if (action === "status") {
      result = await handleStatus(sb, projectId);
    } else if (action === "plan") {
      result = await handlePlan(sb, projectId);
    } else if (action === "execute") {
      const merges = body.merges;
      if (!merges || !Array.isArray(merges) || merges.length === 0) {
        throw new Error("execute action requires a non-empty 'merges' array in request body");
      }
      result = await handleExecute(sb, projectId, merges);
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
