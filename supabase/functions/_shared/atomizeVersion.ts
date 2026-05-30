/**
 * atomizeVersion.ts — Phase 3 & 5: On-Generation Atomization + Staleness
 *
 * Called as post-processing step after generate-document writes a new version.
 * Non-blocking — extraction failure does NOT invalidate the document.
 * Extracted atoms REPLACE previous atoms for that origin_doc_id.
 *
 * Constitutional rules:
 * - Non-blocking: document validity does NOT depend on atom extraction
 * - Replace semantics: new atoms replace old ones for the same origin
 * - SHADOW ignored: attributes.shadow.* not read by staleness logic
 * - One-hop only: staleness stops at directly derived documents
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type ApprovedAtomType,
  type AtomRecord,
  type AtomDependency,
  type StalenessFlag,
  ATOM_TO_DOC_DEPENDENCIES,
  guardAtomBoundary,
  validateAtomPreWrite,
  computeStalenessFlags,
} from "./atomDependencyIndex.ts";

// ── PUBLIC API ──

export interface AtomizationResult {
  atoms_extracted: number;
  atoms_written: number;
  dependencies_written: number;
  staleness_flags_generated: number;
  errors: string[];
}

/**
 * Main entry point — atomize a newly generated document version.
 * Called AFTER document write, BEFORE response return.
 * Non-blocking: catches all errors and reports them without throwing.
 */
export async function atomizeVersion(
  supabase: any,
  projectId: string,
  docType: string,
  versionId: string,
  plaintext: string
): Promise<AtomizationResult> {
  const result: AtomizationResult = {
    atoms_extracted: 0,
    atoms_written: 0,
    dependencies_written: 0,
    staleness_flags_generated: 0,
    errors: [],
  };

  try {
    // Skip empty documents
    if (!plaintext || plaintext.trim().length < 50) {
      return result;
    }

    // Determine which atom types to extract based on doc type
    const atomTypesToExtract = getAtomTypesForDocType(docType);
    if (atomTypesToExtract.length === 0) {
      return result; // No relevant atoms for this doc type
    }

    // 1. DELETE previous atoms for this origin
    const { error: deleteErr } = await supabase
      .from("atoms")
      .delete()
      .eq("origin_doc_id", versionId);

    if (deleteErr) {
      result.errors.push(`Failed to clear previous atoms: ${deleteErr.message}`);
      // Continue anyway — stale atoms are better than no atoms
    }

    // 2. Extract atoms from plaintext
    const extractedAtoms: AtomRecord[] = [];
    for (const atomType of atomTypesToExtract) {
      const atoms = await extractAtomsForDocType(plaintext, atomType, docType, versionId);
      extractedAtoms.push(...atoms);
    }

    result.atoms_extracted = extractedAtoms.length;

    // 3. Write new atoms
    for (const atom of extractedAtoms) {
      atom.project_id = projectId;
      atom.origin_doc_id = versionId;

      const guard = guardAtomBoundary(atom);
      if (!guard.passed) {
        result.errors.push(`Boundary guard rejected: ${atom.canonical_name} — ${guard.reason}`);
        continue;
      }

      const preWrite = validateAtomPreWrite(atom);
      if (!preWrite.valid) {
        result.errors.push(`Validation failed: ${preWrite.errors.join("; ")}`);
        continue;
      }

      const { error: insertErr } = await supabase.from("atoms").insert({
        project_id: atom.project_id,
        atom_type: atom.atom_type,
        entity_id: atom.entity_id || null,
        scene_id: atom.scene_id || null,
        origin_doc_id: atom.origin_doc_id,
        canonical_name: atom.canonical_name,
        priority: atom.priority || 50,
        confidence: atom.confidence ?? 0.5,
        readiness_state: "extracted",
        narrative_role: atom.narrative_role || "active_agent",
        attributes: atom.attributes,
      });

      if (insertErr) {
        result.errors.push(`Insert failed: ${insertErr.message}`);
      } else {
        result.atoms_written++;
      }
    }

    // 4. Write dependencies for new atoms
    const { data: newAtoms } = await supabase
      .from("atoms")
      .select("id, atom_type")
      .eq("origin_doc_id", versionId);

    if (newAtoms && newAtoms.length > 0) {
      for (const atom of newAtoms) {
        const deps = ATOM_TO_DOC_DEPENDENCIES[atom.atom_type as ApprovedAtomType];
        if (!deps) continue;

        for (const dep of deps) {
          const { error: depErr } = await supabase.from("atom_dependencies").upsert(
            {
              atom_id: atom.id,
              project_id: projectId,
              affected_doc_type: dep.doc_type,
              dependency_type: dep.dependency_type,
              affected_scope: dep.affected_scope,
            },
            { onConflict: "atom_id, affected_doc_type" }
          );

          if (!depErr) result.dependencies_written++;
        }
      }
    }

    // 5. Generate staleness flags if atoms changed meaningfully
    // (Compare with previous atoms for the same entity/type — if old atoms existed)
    const { data: prevAtoms } = await supabase
      .from("atoms")
      .select("id, atom_type, canonical_name, attributes, entity_id")
      .eq("project_id", projectId)
      .neq("origin_doc_id", versionId);

    if (prevAtoms && prevAtoms.length > 0) {
      const prevAtomMap = new Map<string, any>();
      for (const pa of prevAtoms) {
        const key = `${pa.atom_type}:${pa.entity_id || pa.canonical_name}`;
        prevAtomMap.set(key, pa);
      }

      for (const newAtom of newAtoms || []) {
        const key = `${newAtom.atom_type}:${newAtom.entity_id || newAtom.canonical_name}`;
        const prevAtom = prevAtomMap.get(key);
        if (prevAtom) {
          // Check if the text actually changed
          const prevText = prevAtom.attributes?.text || "";
          const newAttr = newAtom.attributes || {};
          if (prevText !== newAttr.text) {
            const flags = computeStalenessFlags(
              {
                project_id: projectId,
                atom_type: newAtom.atom_type as ApprovedAtomType,
                canonical_name: newAtom.canonical_name,
                attributes: newAttr,
              } as AtomRecord,
              {
                project_id: projectId,
                atom_type: prevAtom.atom_type as ApprovedAtomType,
                canonical_name: prevAtom.canonical_name,
                attributes: prevAtom.attributes || {},
              } as AtomRecord
            );

            if (flags.length > 0) {
              result.staleness_flags_generated += await writeStalenessFlags(
                supabase,
                projectId,
                newAtom.id,
                flags
              );
            }
          }
        }
      }
    }

    return result;
  } catch (err: any) {
    result.errors.push(`Atomization failed (non-blocking): ${err?.message || "Unknown error"}`);
    return result;
  }
}

// ── HELPERS ──

function getAtomTypesForDocType(docType: string): ApprovedAtomType[] {
  const map: Record<string, ApprovedAtomType[]> = {
    character_bible: [
      "character_goal",
      "character_fear",
      "character_secret",
      "character_relationship",
      "character_backstory_event",
    ],
    story_outline: ["character_goal", "character_secret", "timeline_event"],
    treatment: ["character_goal", "character_fear", "character_relationship", "character_backstory_event", "world_rule"],
    beat_sheet: ["character_goal", "character_secret", "timeline_event"],
    feature_script: ["character_goal", "character_fear", "character_secret", "character_relationship", "timeline_event", "location_fact"],
    production_draft: ["character_goal", "character_fear", "character_secret", "character_relationship", "timeline_event", "location_fact"],
    format_rules: ["world_rule"],
  };

  return map[docType] || [];
}

async function extractAtomsForDocType(
  text: string,
  atomType: ApprovedAtomType,
  docType: string,
  versionId: string
): Promise<AtomRecord[]> {
  // For structured extraction patterns, extract in-line
  // This avoids LLM calls on every generation by using regex patterns
  const atoms: AtomRecord[] = [];
  const lines = text.split("\n");

  switch (atomType) {
    case "character_goal": {
      // Look for "wants to", "goal is", "seeks", aims" patterns
      const goalPatterns = [
        /wants to [^.!?]+[.!?]/gi,
        /goal (?:is|of) [^.!?]+[.!?]/gi,
        /seeks? to [^.!?]+[.!?]/gi,
        /aims? to [^.!?]+[.!?]/gi,
        /determined to [^.!?]+[.!?]/gi,
      ];
      for (const pattern of goalPatterns) {
        for (const match of text.matchAll(pattern)) {
          atoms.push({
            project_id: "",
            atom_type: "character_goal",
            canonical_name: match[0].slice(0, 100),
            confidence: 0.7,
            attributes: {
              text: match[0],
              confidence: 0.7,
              source: `${docType} generation`,
            },
          });
        }
      }
      break;
    }

    case "character_fear": {
      const fearPatterns = [
        /fears? (?:that|the|being|losing)[^.!?]+[.!?]/gi,
        /afraid (?:of|that)[^.!?]+[.!?]/gi,
        /terrified (?:of|that)[^.!?]+[.!?]/gi,
        /dreads?[^.!?]+[.!?]/gi,
      ];
      for (const pattern of fearPatterns) {
        for (const match of text.matchAll(pattern)) {
          atoms.push({
            project_id: "",
            atom_type: "character_fear",
            canonical_name: match[0].slice(0, 100),
            confidence: 0.7,
            attributes: {
              text: match[0],
              confidence: 0.7,
              source: `${docType} generation`,
            },
          });
        }
      }
      break;
    }

    case "character_secret": {
      const secretPatterns = [
        /secret(?:ly)? [^.!?]+[.!?]/gi,
        /hides? (?:the|their|a)[^.!?]+[.!?]/gi,
        /conceals?[^.!?]+[.!?]/gi,
        /doesn'?t know[^.!?]+[.!?]/gi,
        /keeps? (?:hidden|secret)[^.!?]+[.!?]/gi,
      ];
      for (const pattern of secretPatterns) {
        for (const match of text.matchAll(pattern)) {
          atoms.push({
            project_id: "",
            atom_type: "character_secret",
            canonical_name: match[0].slice(0, 100),
            confidence: 0.6,
            attributes: {
              text: match[0],
              confidence: 0.6,
              source: `${docType} generation`,
              display_only: true, // Secrets are often inferred, not explicit
            },
          });
        }
      }
      break;
    }

    case "character_relationship": {
      // Look for "X and Y" relationship descriptions
      const relPatterns = [
        /(?:is|are) (?:in |in a )?(?:relationship|allied|married|partners|enemies|rivals|friends)[^.!?]*/gi,
        /relationship (?:between|with)[^.!?]+[.!?]/gi,
        /(?:works?|fight|teams?|joined?) (?:with|alongside|against)[^.!?]+[.!?]/gi,
      ];
      for (const pattern of relPatterns) {
        for (const match of text.matchAll(pattern)) {
          atoms.push({
            project_id: "",
            atom_type: "character_relationship",
            canonical_name: match[0].slice(0, 100),
            confidence: 0.6,
            attributes: {
              text: match[0],
              confidence: 0.6,
              source: `${docType} generation`,
              display_only: true,
            },
          });
        }
      }
      break;
    }

    case "character_backstory_event": {
      const backstoryPatterns = [
        /(?:before|prior to|in the past|once|formerly|previously)[^.!?]+[.!?]/gi,
        /backstory[^.!?]+[.!?]/gi,
        /was (?:once|formerly|previously)[^.!?]+[.!?]/gi,
        /years? (?:ago|earlier|before)[^.!?]+[.!?]/gi,
        /grew up[^.!?]+[.!?]/gi,
      ];
      for (const pattern of backstoryPatterns) {
        for (const match of text.matchAll(pattern)) {
          atoms.push({
            project_id: "",
            atom_type: "character_backstory_event",
            canonical_name: match[0].slice(0, 100),
            confidence: 0.65,
            attributes: {
              text: match[0],
              confidence: 0.65,
              source: `${docType} generation`,
            },
          });
        }
      }
      break;
    }

    case "world_rule": {
      const worldRulePatterns = [
        /(?:rule|law|principle)[^.!?]+(?:is|are|states)[^.!?]+[.!?]/gi,
        /in this world[^.!?]+[.!?]/gi,
        /the (?:world|universe|realm)[^.!?]+(?:has|is|operates|functions)[^.!?]+[.!?]/gi,
        /magic[^.!?]+(?:works|exists|can|cannot)[^.!?]+[.!?]/gi,
        /technology[^.!?]+(?:is limited to|does not|enables)[^.!?]+[.!?]/gi,
      ];
      for (const pattern of worldRulePatterns) {
        for (const match of text.matchAll(pattern)) {
          atoms.push({
            project_id: "",
            atom_type: "world_rule",
            canonical_name: match[0].slice(0, 100),
            confidence: 0.7,
            attributes: {
              text: match[0],
              confidence: 0.7,
              source: `${docType} generation`,
            },
          });
        }
      }
      break;
    }

    case "timeline_event": {
      // Look for temporal markers
      const timelinePatterns = [
        /(?:scene|act|chapter)\s+\d+[^.!?]*/gi,
        /(?:meanwhile|later|earlier|previously|then|afterwards)[^.!?]+[.!?]/gi,
      ];
      for (const pattern of timelinePatterns) {
        for (const match of text.matchAll(pattern)) {
          atoms.push({
            project_id: "",
            atom_type: "timeline_event",
            canonical_name: match[0].slice(0, 100),
            confidence: 0.6,
            attributes: {
              text: match[0],
              confidence: 0.6,
              source: `${docType} generation`,
              display_only: true,
            },
          });
        }
      }
      break;
    }

    case "location_fact": {
      const locPatterns = [
        /(?:location|setting|place|world)[^.!?]+(?:is|was|has|features)[^.!?]+[.!?]/gi,
        /set in[^.!?]+[.!?]/gi,
        /takes place[^.!?]+[.!?]/gi,
      ];
      for (const pattern of locPatterns) {
        for (const match of text.matchAll(pattern)) {
          atoms.push({
            project_id: "",
            atom_type: "location_fact",
            canonical_name: match[0].slice(0, 100),
            confidence: 0.6,
            attributes: {
              text: match[0],
              confidence: 0.6,
              source: `${docType} generation`,
              display_only: true,
            },
          });
        }
      }
      break;
    }
  }

  return atoms;
}

async function writeStalenessFlags(
  supabase: any,
  projectId: string,
  changedAtomId: string,
  flags: StalenessFlag[]
): Promise<number> {
  let written = 0;

  for (const flag of flags) {
    // Resolve the affected document ID
    const { data: doc } = await supabase
      .from("project_documents")
      .select("id")
      .eq("project_id", projectId)
      .eq("doc_type", flag.doc_type)
      .maybeSingle();

    if (!doc) continue;

    const { error } = await supabase.from("atom_staleness_flags").insert({
      project_id: projectId,
      affected_document_id: doc.id,
      affected_doc_type: flag.doc_type,
      changed_atom_id: changedAtomId,
      changed_atom_type: flag.changed_atom_type,
      changed_atom_text: flag.changed_atom_text,
      changed_atom_entity: flag.changed_atom_entity,
      origin_source: flag.origin_source,
      dependency_type: flag.dependency_type,
      affected_scope: flag.affected_scope,
      stale_reason: flag.stale_reason,
      suggested_action: flag.suggested_action,
      status: "active",
    });

    if (!error) written++;
  }

  return written;
}
