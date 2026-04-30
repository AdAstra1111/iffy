/**
 * NDG v1 — Unified Narrative Dependency Graph (Project Layer)
 *
 * Pure TypeScript projection layer over existing DB surfaces.
 * Read-only. No DB queries. No AI inference. No schema drift.
 *
 * ────────────────────────────────────────────────────────────────
 * LAYER POSITION:
 *
 *   Canon → Spine → Entities → Narrative Units → Scenes
 *     → NDG (THIS MODULE)
 *       → Rewrite Planning / Scene Risk / UI consumers
 *
 * This module receives pre-loaded raw data and projects it
 * into a unified node/edge graph. It does not query the DB directly.
 *
 * ────────────────────────────────────────────────────────────────
 * NODE TYPES (4):
 *
 *   spine_axis     — virtual: 9 canonical axes from SPINE_AXES
 *   narrative_unit — from narrative_units; anchored by unit_key
 *   narrative_entity — from narrative_entities; anchored by entity_key
 *   scene          — from scene_graph_scenes; anchored by scene_key
 *
 * EDGE TYPES (6 deterministic):
 *
 *   axis_downstream_of_axis  — from NARRATIVE_DEPENDENCY_EDGES (canonical registry, 10 edges)
 *   unit_covers_axis         — unit.unit_type = axis_key (field mapping, deterministic)
 *   entity_relates_to_entity — from narrative_entity_relations (explicit DB relation)
 *   scene_linked_to_axis     — from scene_spine_links (explicit DB link, axis_key field)
 *   scene_contains_entity    — from narrative_scene_entity_links (explicit DB link)
 *   unit_impacts_scene       — derived: stale/contradicted unit → axis → scenes at that axis
 *                              (NDG propagation + scene_spine_links lookup)
 *
 * ────────────────────────────────────────────────────────────────
 * IDENTITY SAFETY:
 *   All node IDs anchor to stable system keys:
 *   - spine_axis: axis_key (e.g. "story_engine")
 *   - narrative_unit: unit_key (e.g. "ebc4b926::protagonist_arc")
 *   - narrative_entity: entity_key (e.g. "CHAR_ELARA_VANCE")
 *   - scene: scene_key (e.g. "SCENE_001")
 *
 * DETERMINISM:
 *   Same input data → same graph. All edges derived from explicit
 *   DB fields or canonical registry. No fuzzy inference.
 *
 * FAIL-CLOSED:
 *   Any edge that cannot be grounded in evidence is not emitted.
 *   Missing axis_key, entity_key, or scene_key → edge skipped.
 */
import { NARRATIVE_DEPENDENCY_EDGES, getDownstreamAxes, } from "./narrativeDependencyGraph.ts";
import { SPINE_AXES, AXIS_METADATA } from "./narrativeSpine.ts";
// ── Graph Builder ──────────────────────────────────────────────────────────
/**
 * Builds the full NDG v1 project graph from pre-loaded raw data.
 *
 * Pure function — no side effects, no DB access, no AI inference.
 * Deterministic: same input → same output.
 */
export function buildNDGProjectGraph(data) {
    const nodes = [];
    const edges = [];
    // ── Node Layer 1: spine_axis (virtual, from registry) ─────────────────
    const axisNodeIds = new Set();
    for (const axis of SPINE_AXES) {
        const meta = AXIS_METADATA[axis];
        nodes.push({
            node_id: axis,
            node_type: "spine_axis",
            label: meta.label,
            meta: {
                class: meta.class,
                severity: meta.severity,
                description: meta.description,
            },
        });
        axisNodeIds.add(axis);
    }
    // ── Node Layer 2: narrative_unit ───────────────────────────────────────
    const unitNodeIds = new Set();
    const unitAxisMap = new Map(); // unit_key → axis (unit_type)
    for (const unit of data.narrative_units) {
        const axisValue = unit.unit_type; // e.g. "protagonist_arc"
        nodes.push({
            node_id: unit.unit_key,
            node_type: "narrative_unit",
            label: `${axisValue} (${unit.source_doc_type})`,
            meta: {
                unit_type: unit.unit_type,
                status: unit.status,
                confidence: unit.confidence,
                source_doc_type: unit.source_doc_type,
                source_doc_version_id: unit.source_doc_version_id,
                spine_value: unit.payload_json?.spine_value ?? null,
                verbatim_verified: unit.payload_json?.verbatim_quote_verified ?? null,
                contradiction_note: unit.payload_json?.contradiction_note ?? null,
                at_risk: unit.status === "stale" || unit.status === "contradicted",
            },
        });
        unitNodeIds.add(unit.unit_key);
        unitAxisMap.set(unit.unit_key, axisValue);
    }
    // ── Node Layer 3: narrative_entity ────────────────────────────────────
    const entityNodeIds = new Set();
    const entityIdToKey = new Map(); // db id → entity_key
    for (const entity of data.narrative_entities) {
        nodes.push({
            node_id: entity.entity_key,
            node_type: "narrative_entity",
            label: entity.canonical_name,
            meta: {
                entity_type: entity.entity_type,
                source_kind: entity.source_kind,
                status: entity.status,
            },
        });
        entityNodeIds.add(entity.entity_key);
        entityIdToKey.set(entity.id, entity.entity_key);
    }
    // ── Node Layer 4: scene ───────────────────────────────────────────────
    // Only include active (non-deprecated) scenes
    const sceneNodeIds = new Set();
    const sceneIdToKey = new Map(); // db id → scene_key
    for (const scene of data.scenes) {
        if (scene.deprecated_at)
            continue;
        nodes.push({
            node_id: scene.scene_key,
            node_type: "scene",
            label: scene.scene_key,
            meta: { scene_id: scene.id },
        });
        sceneNodeIds.add(scene.scene_key);
        sceneIdToKey.set(scene.id, scene.scene_key);
    }
    // Also map from scene_spine_links rows that carry scene_key directly
    for (const link of data.scene_spine_links) {
        if (link.scene_key && !sceneIdToKey.has(link.scene_id)) {
            sceneIdToKey.set(link.scene_id, link.scene_key);
        }
    }
    for (const link of data.scene_entity_links) {
        if (link.scene_key && !sceneIdToKey.has(link.scene_id)) {
            sceneIdToKey.set(link.scene_id, link.scene_key);
        }
    }
    // ── Edge Type 1: axis_downstream_of_axis (canonical registry) ─────────
    for (const dep of NARRATIVE_DEPENDENCY_EDGES) {
        if (!axisNodeIds.has(dep.from) || !axisNodeIds.has(dep.to))
            continue;
        edges.push({
            edge_id: `axis_downstream_of_axis:${dep.from}→${dep.to}`,
            edge_type: "axis_downstream_of_axis",
            from_id: dep.from,
            to_id: dep.to,
            derivation: "canonical_registry",
            meta: {
                dependency_type: dep.dependency_type,
                note: dep.note,
            },
        });
    }
    // ── Edge Type 2: unit_covers_axis (unit_type field mapping) ───────────
    for (const unit of data.narrative_units) {
        const axis = unit.unit_type;
        if (!axisNodeIds.has(axis))
            continue; // axis not in registry → skip
        if (!unitNodeIds.has(unit.unit_key))
            continue;
        edges.push({
            edge_id: `unit_covers_axis:${unit.unit_key}→${axis}`,
            edge_type: "unit_covers_axis",
            from_id: unit.unit_key,
            to_id: axis,
            derivation: "unit_type_field",
            meta: {
                status: unit.status,
                source_doc_type: unit.source_doc_type,
            },
        });
    }
    // ── Edge Type 3: entity_relates_to_entity (narrative_entity_relations) ─
    for (const rel of data.entity_relations) {
        const fromKey = entityIdToKey.get(rel.source_entity_id);
        const toKey = rel.target_entity_id ? entityIdToKey.get(rel.target_entity_id) : null;
        if (!fromKey || !entityNodeIds.has(fromKey))
            continue;
        if (toKey && !entityNodeIds.has(toKey))
            continue;
        edges.push({
            edge_id: `entity_relates_to_entity:${fromKey}→${toKey ?? "null"}`,
            edge_type: "entity_relates_to_entity",
            from_id: fromKey,
            to_id: toKey ?? fromKey, // self-reference if no target (e.g. drives_arc)
            derivation: "db_relation",
            meta: {
                relation_type: rel.relation_type,
                source_kind: rel.source_kind,
            },
        });
    }
    // ── Edge Type 4: scene_linked_to_axis (scene_spine_links) ─────────────
    for (const link of data.scene_spine_links) {
        if (!link.axis_key)
            continue;
        const sceneKey = sceneIdToKey.get(link.scene_id) ?? link.scene_key;
        if (!sceneKey || !axisNodeIds.has(link.axis_key))
            continue;
        edges.push({
            edge_id: `scene_linked_to_axis:${sceneKey}→${link.axis_key}`,
            edge_type: "scene_linked_to_axis",
            from_id: sceneKey,
            to_id: link.axis_key,
            derivation: "db_spine_link",
            meta: {},
        });
    }
    // ── Edge Type 5: scene_contains_entity (narrative_scene_entity_links) ──
    const seenEntityEdges = new Set();
    for (const link of data.scene_entity_links) {
        const sceneKey = sceneIdToKey.get(link.scene_id) ?? link.scene_key;
        const entityKey = entityIdToKey.get(link.entity_id);
        if (!sceneKey || !entityKey)
            continue;
        if (!entityNodeIds.has(entityKey))
            continue;
        const edgeId = `scene_contains_entity:${sceneKey}→${entityKey}`;
        if (seenEntityEdges.has(edgeId))
            continue; // dedupe
        seenEntityEdges.add(edgeId);
        edges.push({
            edge_id: edgeId,
            edge_type: "scene_contains_entity",
            from_id: sceneKey,
            to_id: entityKey,
            derivation: "db_entity_link",
            meta: {
                relation_type: link.relation_type,
                confidence: link.confidence,
            },
        });
    }
    // ── Edge Type 6: unit_impacts_scene (NDG propagation — derived) ────────
    // For stale/contradicted units: unit → affected downstream axes → scenes
    const atRiskUnitRows = data.narrative_units.filter(u => u.status === "stale" || u.status === "contradicted");
    // Build axis → scene_key[] map from scene_spine_links
    const axisToSceneKeys = new Map();
    for (const link of data.scene_spine_links) {
        if (!link.axis_key)
            continue;
        const sk = sceneIdToKey.get(link.scene_id) ?? link.scene_key;
        if (!sk)
            continue;
        if (!axisToSceneKeys.has(link.axis_key))
            axisToSceneKeys.set(link.axis_key, []);
        axisToSceneKeys.get(link.axis_key).push(sk);
    }
    const atRiskScenes = [];
    const atRiskAxesSeen = new Set();
    const impactEdgeSeen = new Set();
    for (const unit of atRiskUnitRows) {
        const directAxis = unit.unit_type;
        const reason = unit.status === "contradicted"
            ? (unit.payload_json?.contradiction_note || "contradiction detected")
            : "stale — needs revalidation";
        // Direct: scenes linked to this axis
        const directScenes = axisToSceneKeys.get(directAxis) ?? [];
        for (const sk of directScenes) {
            atRiskAxesSeen.add(directAxis);
            const existing = atRiskScenes.find(r => r.scene_key === sk);
            if (!existing) {
                atRiskScenes.push({ scene_key: sk, axis: directAxis, reason, risk_source: "direct" });
            }
            const edgeId = `unit_impacts_scene:${unit.unit_key}→${sk}`;
            if (!impactEdgeSeen.has(edgeId)) {
                impactEdgeSeen.add(edgeId);
                edges.push({
                    edge_id: edgeId,
                    edge_type: "unit_impacts_scene",
                    from_id: unit.unit_key,
                    to_id: sk,
                    derivation: "ndg_propagation",
                    meta: { risk_source: "direct", axis: directAxis, reason },
                });
            }
        }
        // Propagated: downstream axes of the direct axis
        const downstreamAxes = getDownstreamAxes(directAxis);
        for (const downAxis of downstreamAxes) {
            const propagatedScenes = axisToSceneKeys.get(downAxis) ?? [];
            for (const sk of propagatedScenes) {
                atRiskAxesSeen.add(downAxis);
                const propagatedReason = `downstream of ${directAxis} (${reason})`;
                const existing = atRiskScenes.find(r => r.scene_key === sk);
                if (!existing) {
                    atRiskScenes.push({ scene_key: sk, axis: downAxis, reason: propagatedReason, risk_source: "propagated" });
                }
                const edgeId = `unit_impacts_scene:${unit.unit_key}→${sk}(propagated)`;
                if (!impactEdgeSeen.has(edgeId)) {
                    impactEdgeSeen.add(edgeId);
                    edges.push({
                        edge_id: edgeId,
                        edge_type: "unit_impacts_scene",
                        from_id: unit.unit_key,
                        to_id: sk,
                        derivation: "ndg_propagation",
                        meta: { risk_source: "propagated", via_axis: downAxis, source_axis: directAxis, reason: propagatedReason },
                    });
                }
            }
        }
    }
    // ── Node Layer 5: section (NDG v2 — from deliverableSectionRegistry) ──
    // Deterministic: section nodes are emitted from registry definitions +
    // presence flags. No inference. Fail-closed: no sections input → no nodes.
    const sectionNodeIds = new Set();
    if (data.sections && data.sections.length > 0) {
        for (const sec of data.sections) {
            const nodeId = `section:${sec.doc_type}:${sec.section_key}`;
            const violationCount = sec.violation_keys?.length ?? 0;
            nodes.push({
                node_id: nodeId,
                node_type: "section",
                label: sec.label,
                meta: {
                    doc_type: sec.doc_type,
                    section_key: sec.section_key,
                    repair_mode: sec.repair_mode,
                    order: sec.order,
                    present: sec.present,
                    violation_count: violationCount,
                    ...(violationCount > 0 ? { violation_keys: sec.violation_keys } : {}),
                },
            });
            sectionNodeIds.add(nodeId);
        }
    }
    // ── Edge Type 7: violation_targets_section (NDG v2) ────────────────────
    // Emitted when a section has violation_keys. Uses stable virtual source IDs
    // following the same deterministic pattern as other NDG edges.
    // Source is a stable violation reference; target is the section node.
    if (data.sections) {
        for (const sec of data.sections) {
            if (!sec.violation_keys || sec.violation_keys.length === 0)
                continue;
            const sectionNodeId = `section:${sec.doc_type}:${sec.section_key}`;
            if (!sectionNodeIds.has(sectionNodeId))
                continue;
            for (const vk of sec.violation_keys) {
                const edgeId = `violation_targets_section:${vk}→${sectionNodeId}`;
                edges.push({
                    edge_id: edgeId,
                    edge_type: "violation_targets_section",
                    from_id: vk,
                    to_id: sectionNodeId,
                    derivation: "section_registry",
                    meta: { doc_type: sec.doc_type, section_key: sec.section_key },
                });
            }
        }
    }
    // ── Assemble meta ──────────────────────────────────────────────────────
    const nodeCountsByType = {};
    for (const n of nodes) {
        nodeCountsByType[n.node_type] = (nodeCountsByType[n.node_type] ?? 0) + 1;
    }
    const edgeCountsByType = {};
    for (const e of edges) {
        edgeCountsByType[e.edge_type] = (edgeCountsByType[e.edge_type] ?? 0) + 1;
    }
    atRiskScenes.sort((a, b) => a.scene_key.localeCompare(b.scene_key));
    const meta = {
        node_count: nodes.length,
        edge_count: edges.length,
        node_counts_by_type: nodeCountsByType,
        edge_counts_by_type: edgeCountsByType,
        at_risk_scene_count: atRiskScenes.length,
        at_risk_axes: [...atRiskAxesSeen],
        at_risk_scenes: atRiskScenes,
    };
    return { nodes, edges, meta };
}
/**
 * Returns a compact diagnostic summary of the graph (for logging / API response).
 * Does not include the full node/edge arrays.
 */
export function summariseNDGGraph(graph) {
    return {
        node_count: graph.meta.node_count,
        edge_count: graph.meta.edge_count,
        node_counts_by_type: graph.meta.node_counts_by_type,
        edge_counts_by_type: graph.meta.edge_counts_by_type,
        at_risk_scene_count: graph.meta.at_risk_scene_count,
        at_risk_axes: graph.meta.at_risk_axes,
        at_risk_scenes: graph.meta.at_risk_scenes,
    };
}
