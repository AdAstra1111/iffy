/**
 * sceneDemoCanon.ts — Canonical Scene Demo Selection + Document Binding System.
 *
 * Provides deterministic selection of a single canonical run per scene,
 * asset resolution for downstream consumption, and coverage summaries.
 *
 * IEL: Only locked runs may become canonical.
 * Fail-closed: No silent fallbacks.
 *
 * v1.0.0
 */

import { SCENE_DEMO_SLOTS, type SceneDemoSlotDef } from './sceneDemoGenerator';

// ── Constants ───────────────────────────────────────────────────────────────

export const SCENE_DEMO_CANON_VERSION = '1.0.0';

// ── Types ───────────────────────────────────────────────────────────────────

export interface CanonicalRunRef {
  run_id: string;
  scene_id: string;
  status: string;
  is_canonical: boolean;
  plan_snapshot: any;
  created_at: string;
}

export interface CanonicalSlotAsset {
  slot_key: string;
  slot_label: string;
  image_id: string;
  public_url: string;
  storage_path: string | null;
  approval_status: string;
  required: boolean;
}

export interface CanonicalSceneDemoResult {
  found: boolean;
  run: CanonicalRunRef | null;
  assets: CanonicalSlotAsset[];
  missing_required_slots: string[];
  coverage_ratio: number;
}

export interface SceneDemoCoverageSummary {
  total_scenes: number;
  scenes_with_canonical: number;
  scenes_without_canonical: number;
  total_canonical_slots: number;
  total_required_slots: number;
  required_slots_covered: number;
  coverage_percent: number;
  uncovered_scene_ids: string[];
}

// ── Selection Gate ──────────────────────────────────────────────────────────

export interface CanonicalSelectionGate {
  allowed: boolean;
  blocking_reasons: string[];
}

/**
 * IEL gate: only locked runs may become canonical.
 */
export function gateCanonicalSelection(run: { status: string; id: string }): CanonicalSelectionGate {
  const reasons: string[] = [];
  if (run.status !== 'locked') {
    reasons.push(`Run ${run.id.slice(0, 8)} is not locked (status: ${run.status})`);
  }
  return { allowed: reasons.length === 0, blocking_reasons: reasons };
}

// ── Asset Resolution ────────────────────────────────────────────────────────

export interface SlotImage {
  id: string;
  slot_key: string;
  public_url: string | null;
  storage_path: string | null;
  approval_status: string;
  status: string;
}

/**
 * Resolve canonical slot assets from a run's images.
 * Deterministic: selects approved images per slot, fails closed on missing.
 */
export function resolveCanonicalSlotAssets(
  images: SlotImage[],
  slotDefs?: SceneDemoSlotDef[],
): { assets: CanonicalSlotAsset[]; missing_required: string[] } {
  const slots = slotDefs || SCENE_DEMO_SLOTS;
  const assets: CanonicalSlotAsset[] = [];
  const missingRequired: string[] = [];

  for (const slot of slots) {
    const img = images.find(
      i => i.slot_key === slot.key && i.approval_status === 'approved' && i.public_url
    );

    if (img && img.public_url) {
      assets.push({
        slot_key: slot.key,
        slot_label: slot.label,
        image_id: img.id,
        public_url: img.public_url,
        storage_path: img.storage_path,
        approval_status: img.approval_status,
        required: slot.required,
      });
    } else if (slot.required) {
      missingRequired.push(slot.key);
    }
  }

  return { assets, missing_required: missingRequired };
}

/**
 * Build a canonical scene demo result from run + images.
 * Fail-closed: returns found=false with no assets if run is null.
 */
export function buildCanonicalSceneDemoResult(
  run: CanonicalRunRef | null,
  images: SlotImage[],
): CanonicalSceneDemoResult {
  if (!run) {
    return {
      found: false,
      run: null,
      assets: [],
      missing_required_slots: SCENE_DEMO_SLOTS.filter(s => s.required).map(s => s.key),
      coverage_ratio: 0,
    };
  }

  const { assets, missing_required } = resolveCanonicalSlotAssets(images);
  const totalSlots = SCENE_DEMO_SLOTS.length;
  const coverageRatio = totalSlots > 0 ? assets.length / totalSlots : 0;

  return {
    found: true,
    run,
    assets,
    missing_required_slots: missing_required,
    coverage_ratio: Math.round(coverageRatio * 100) / 100,
  };
}

// ── Coverage Summary ────────────────────────────────────────────────────────

/**
 * Summarize canonical scene demo coverage across scenes.
 */
export function summarizeSceneDemoCoverage(
  sceneIds: string[],
  canonicalRuns: CanonicalRunRef[],
  imagesByRunId: Record<string, SlotImage[]>,
): SceneDemoCoverageSummary {
  const canonByScene = new Map<string, CanonicalRunRef>();
  for (const run of canonicalRuns) {
    if (run.is_canonical) canonByScene.set(run.scene_id, run);
  }

  const uncovered: string[] = [];
  let totalCanonSlots = 0;
  let totalRequired = 0;
  let requiredCovered = 0;
  const requiredSlotKeys = SCENE_DEMO_SLOTS.filter(s => s.required).map(s => s.key);

  for (const sceneId of sceneIds) {
    const canon = canonByScene.get(sceneId);
    if (!canon) {
      uncovered.push(sceneId);
      totalRequired += requiredSlotKeys.length;
      continue;
    }

    const imgs = imagesByRunId[canon.run_id] || [];
    const { assets } = resolveCanonicalSlotAssets(imgs);
    totalCanonSlots += assets.length;
    totalRequired += requiredSlotKeys.length;
    requiredCovered += assets.filter(a => a.required).length;
  }

  return {
    total_scenes: sceneIds.length,
    scenes_with_canonical: canonByScene.size,
    scenes_without_canonical: uncovered.length,
    total_canonical_slots: totalCanonSlots,
    total_required_slots: totalRequired,
    required_slots_covered: requiredCovered,
    coverage_percent: totalRequired > 0 ? Math.round((requiredCovered / totalRequired) * 100) : 0,
    uncovered_scene_ids: uncovered,
  };
}

// ── Document Binding Seam ───────────────────────────────────────────────────

export type SceneDemoSlotKey = 'establishing_wide' | 'character_action' | 'emotional_beat' | 'environment_detail';

/**
 * Resolve a specific slot image URL for document/deck binding.
 * Deterministic: returns null if not found. No fallback guessing.
 */
export function resolveSceneDemoSlotForDocument(
  assets: CanonicalSlotAsset[],
  slotKey: SceneDemoSlotKey,
): { url: string; image_id: string } | null {
  const asset = assets.find(a => a.slot_key === slotKey);
  if (!asset) return null;
  return { url: asset.public_url, image_id: asset.image_id };
}

/**
 * Resolve all available document binding slots from canonical assets.
 */
export function resolveAllDocumentBindingSlots(
  assets: CanonicalSlotAsset[],
): Record<SceneDemoSlotKey, { url: string; image_id: string } | null> {
  const keys: SceneDemoSlotKey[] = ['establishing_wide', 'character_action', 'emotional_beat', 'environment_detail'];
  const result: Record<string, { url: string; image_id: string } | null> = {};
  for (const key of keys) {
    result[key] = resolveSceneDemoSlotForDocument(assets, key);
  }
  return result as Record<SceneDemoSlotKey, { url: string; image_id: string } | null>;
}
