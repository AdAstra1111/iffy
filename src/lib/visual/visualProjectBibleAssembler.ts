/**
 * visualProjectBibleAssembler.ts — Client-side wrapper for Visual Project Bible.
 *
 * ═══ VISUAL AUTHORITY BOUNDARY ═══
 * ARCHITECTURE:
 *   This is a THIN WRAPPER. It does NOT own section-construction logic.
 *   All section assembly is delegated to visualProjectBibleCore.assembleVPBCore().
 *
 *   This wrapper is responsible ONLY for:
 *   - Adapting client-side types to the shared VPBCoreInput contract
 *   - IEL guards on raw prose (assertNoRawVisualCanonMarkdown)
 *   - Re-exporting types for backward compatibility
 *
 * FORBIDDEN:
 *   - Duplicating section assembly logic (owned by visualProjectBibleCore)
 *   - Forking output semantics or heading construction
 *   - Consuming raw visual_canon_brief prose
 *
 * See: visualProjectBibleCore.ts for the canonical assembly core.
 */

import type { VisualCanonSignals } from './visualCanonBrief';
import { assertNoRawVisualCanonMarkdown } from './visualCanonEnrichment';
import type { ProductionDesign } from '@/lib/lookbook/productionDesign';
import {
  assembleVPBCore,
  validateVPBResult,
  VPB_SECTION_KEYS,
  VPB_REQUIRED_SECTION_COUNT,
  type VPBCoreInput,
  type VPBCoreResult,
  type VPBApprovedAssetRef,
  type VPBCharacterVisualSummary,
  type VPBLocationVisualSummary,
  type VPBSectionKey,
} from './visualProjectBibleCore';

// ── Re-exports for backward compatibility ───────────────────────────────────

export const VISUAL_PROJECT_BIBLE_SECTION_KEYS = VPB_SECTION_KEYS;
export type VisualProjectBibleSectionKey = VPBSectionKey;
export const VISUAL_PROJECT_BIBLE_REQUIRED_SECTION_COUNT = VPB_REQUIRED_SECTION_COUNT;

// Re-export core types under legacy names
export type ApprovedAssetRef = VPBApprovedAssetRef;
export type CharacterVisualSummary = VPBCharacterVisualSummary;
export type LocationVisualSummary = VPBLocationVisualSummary;

// ── Assembly Input Contract (client-facing, maps to VPBCoreInput) ───────────

export interface VisualProjectBibleInput {
  project_title: string;
  project_id: string;
  visualCanonSignals: VisualCanonSignals | null;
  productionDesign: ProductionDesign;
  characters: CharacterVisualSummary[];
  locations: LocationVisualSummary[];
  approvedAssets: ApprovedAssetRef[];
  assembled_at?: string;
}

// ── Assembly Result (client-facing) ─────────────────────────────────────────

export interface VisualProjectBibleResult {
  markdown: string;
  sections_present: string[];
  sections_absent: string[];
  visual_canon_version_id: string | null;
  enrichment_applied: boolean;
  character_count: number;
  location_count: number;
  asset_count: number;
  assembled_at: string;
  is_complete: boolean;
  validation_issues: string[];
}

// ── Client Wrapper ──────────────────────────────────────────────────────────

/**
 * assembleVisualProjectBible — Client-side wrapper.
 *
 * ═══ VISUAL AUTHORITY BOUNDARY ═══
 * This wrapper:
 *   1. Runs IEL guards (raw prose detection)
 *   2. Maps client types to VPBCoreInput
 *   3. Delegates ALL section assembly to assembleVPBCore()
 *   4. Maps VPBCoreResult back to client VisualProjectBibleResult
 *
 * It MUST NOT duplicate any section logic from visualProjectBibleCore.
 */
export function assembleVisualProjectBible(
  input: VisualProjectBibleInput,
): VisualProjectBibleResult {
  const validationIssues: string[] = [];

  // ── IEL Gate: no raw visual canon markdown in signals ──
  if (input.visualCanonSignals) {
    try {
      assertNoRawVisualCanonMarkdown(
        (input.visualCanonSignals as any).world_visual_identity,
        'visual_project_bible_assembler',
      );
    } catch (e: any) {
      validationIssues.push(e.message);
    }
  }

  // ── Map to shared core input contract ──
  const coreInput: VPBCoreInput = {
    project_title: input.project_title,
    project_id: input.project_id,
    visualCanonSignals: input.visualCanonSignals as VPBCoreInput['visualCanonSignals'],
    productionDesign: input.productionDesign,
    characters: input.characters,
    locations: input.locations,
    approvedAssets: input.approvedAssets,
    assembled_at: input.assembled_at,
  };

  // ── Delegate to canonical shared core ──
  const coreResult = assembleVPBCore(coreInput);

  // ── Map core result to client result shape ──
  return {
    markdown: coreResult.markdown,
    sections_present: coreResult.sections_present,
    sections_absent: coreResult.sections_absent,
    visual_canon_version_id: input.visualCanonSignals?.source_version_id ?? null,
    enrichment_applied: input.productionDesign.enrichment_applied ?? false,
    character_count: coreResult.character_count,
    location_count: coreResult.location_count,
    asset_count: coreResult.asset_count,
    assembled_at: coreResult.assembled_at,
    is_complete: coreResult.is_complete,
    validation_issues: [...validationIssues, ...coreResult.validation_issues],
  };
}

// ── Validation re-export ────────────────────────────────────────────────────

export function validateAssemblyResult(result: VisualProjectBibleResult): {
  passed: boolean;
  gate_results: Array<{ gate: string; passed: boolean; detail: string }>;
} {
  // Adapt to core result shape for validation
  return validateVPBResult({
    ...result,
    visual_canon_signals_available: true,
    generation_method: 'deterministic_assembly',
  });
}
