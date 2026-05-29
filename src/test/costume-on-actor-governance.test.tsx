/**
 * CostumeOnActor Governance — Frontend Integration Tests
 *
 * Validates that the Costume-on-Actor 403 governance block fix is correctly
 * wired into the frontend layer:
 *
 * Fix 1: Governance payload propagated in both invoke calls (useCostumeOnActor.ts)
 *   - generation_surface: "costume_on_actor" in both invoke locations
 *   - slot_type, identity_lock, character_id fields present
 *   - scoring_policy and package_strength from convergence_state and statePackage
 *   - Structured 403 blocker parsing block exists in both locations
 *
 * Fix 2: Governance blocker banner in CostumeOnActorPanel.tsx
 *   - Reads convergence_state.governance_blocked
 *   - Fatal severity → red destructive banner with "Generation blocked"
 *   - Recoverable severity → amber banner with "Generation paused"
 *   - Shows code, message, and next_actions per slot
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Source file paths ──
const HOOK_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../src/hooks/useCostumeOnActor.ts'),
  'utf-8'
);

const PANEL_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../src/components/visual/CostumeOnActorPanel.tsx'),
  'utf-8'
);

// ═════════════════════════════════════════════════════════════════════════════
// Fix 1: Governance payload in useCostumeOnActor.ts
// ═════════════════════════════════════════════════════════════════════════════

describe('Fix 1: Governance payload in useCostumeOnActor.ts', () => {

  it('sends generation_surface: "costume_on_actor" in first invoke call (~line 820)', () => {
    expect(HOOK_SOURCE).toContain('generation_surface: "costume_on_actor"');
  });

  it('sends slot_type in first invoke call', () => {
    expect(HOOK_SOURCE).toContain('slot_type: slot.slot_key');
  });

  it('sends identity_lock in first invoke call', () => {
    expect(HOOK_SOURCE).toContain('identity_lock: slotBrief.requiresIdentityLock');
  });

  it('sends scoring_policy in first invoke call', () => {
    // Must pull from convergence_state with null fallback
    const match = HOOK_SOURCE.match(/scoring_policy:.*convergence_state.*scoring_policy/);
    expect(match).not.toBeNull();
  });

  it('sends package_strength in first invoke call', () => {
    expect(HOOK_SOURCE).toContain('package_strength: statePackage.packageStrength');
  });

  it('sends character_id in first invoke call', () => {
    expect(HOOK_SOURCE).toContain('character_id: characterKey');
  });

  it('has 6 governance fields in first invoke block (lines 820-825)', () => {
    // Find the first invoke block with all 6 fields together
    const blockMatch = HOOK_SOURCE.match(
      /generation_surface: "costume_on_actor"[\s\S]{0,400}character_id: characterKey/
    );
    expect(blockMatch).not.toBeNull();
    const block = blockMatch![0];
    expect(block).toContain('slot_type:');
    expect(block).toContain('identity_lock:');
    expect(block).toContain('scoring_policy:');
    expect(block).toContain('package_strength:');
  });

  it('sends generation_surface in second invoke call (~line 1672)', () => {
    const count = (HOOK_SOURCE.match(/generation_surface: "costume_on_actor"/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('sends slot_type in second invoke call', () => {
    const count = (HOOK_SOURCE.match(/slot_type:.*slot\.slot_key/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('sends character_id in second invoke call', () => {
    const count = (HOOK_SOURCE.match(/character_id: characterKey/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('has 6 governance fields in second invoke block (lines 1672-1677)', () => {
    // Find ALL blocks containing generation_surface and verify at least one
    // occurs after line ~1650
    const secondInvokeRegion = HOOK_SOURCE.split('// ── RESOLVE SLOT SCORING POLICY ──')[1] || '';
    expect(secondInvokeRegion).toContain('generation_surface: "costume_on_actor"');
    expect(secondInvokeRegion).toContain('slot_type:');
    expect(secondInvokeRegion).toContain('identity_lock:');
    expect(secondInvokeRegion).toContain('scoring_policy:');
    expect(secondInvokeRegion).toContain('package_strength:');
    expect(secondInvokeRegion).toContain('character_id:');
  });

  it('has structured 403 blocker parsing in first location', () => {
    // Find the 403 handler block against "costume_on_actor"
    // First block: "// 403 = governance block — not transient, break the retry loop"
    const match = HOOK_SOURCE.match(
      /403 = governance block[\s\S]{0,500}surface === "costume_on_actor"/
    );
    expect(match).not.toBeNull();
  });

  it('has structured 403 blocker parsing in second location', () => {
    // Second block uses "Single-slot" prefix
    const match = HOOK_SOURCE.match(
      /Single-slot generation error[\s\S]{0,550}surface === "costume_on_actor"/
    );
    expect(match).not.toBeNull();
  });

  it('parses blocker_codes and blockers from 403 response body', () => {
    // Both 403 handlers should parse blocker_codes and iterate blockers
    const first403Block = HOOK_SOURCE.split('// 403 = governance block — not transient, break the retry loop')[1] || '';
    expect(first403Block).toContain('blocker_codes');
    expect(first403Block).toContain('blockers');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Fix 2: Governance blocker banner in CostumeOnActorPanel.tsx
// ═════════════════════════════════════════════════════════════════════════════

describe('Fix 2: Governance blocker banner in CostumeOnActorPanel.tsx', () => {

  it('has governance blocker banner section', () => {
    expect(PANEL_SOURCE).toContain('Governance Blocker Banner');
  });

  it('reads governance_blocked from convergence_state', () => {
    expect(PANEL_SOURCE).toContain('governance_blocked');
    expect(PANEL_SOURCE).toContain('cs.governance_blocked === true');
  });

  it('reads governance_severity for fatal/recoverable distinction', () => {
    expect(PANEL_SOURCE).toContain('governance_severity');
  });

  it('renders fatal severity with destructive (red) styling', () => {
    // Fatal severity → border-destructive/40 bg-destructive/5
    const fatalMatch = PANEL_SOURCE.match(/border-destructive\/40[\s\S]{0,50}bg-destructive\/5/);
    expect(fatalMatch).not.toBeNull();
  });

  it('renders recoverable severity with amber styling', () => {
    // Recoverable → border-amber-500/40 bg-amber-500/5
    const amberMatch = PANEL_SOURCE.match(/border-amber-500\/40[\s\S]{0,50}bg-amber-500\/5/);
    expect(amberMatch).not.toBeNull();
  });

  it('shows "Generation blocked" text for fatal severity', () => {
    expect(PANEL_SOURCE).toContain("Generation blocked");
  });

  it('shows "Generation paused" text for recoverable severity', () => {
    expect(PANEL_SOURCE).toContain("Generation paused");
  });

  it('displays governance_code per blocked slot', () => {
    expect(PANEL_SOURCE).toContain('governance_code');
  });

  it('displays governance_message per blocked slot', () => {
    expect(PANEL_SOURCE).toContain('governance_message');
  });

  it('displays governance_next_actions when present', () => {
    expect(PANEL_SOURCE).toContain('governance_next_actions');
  });

  it('returns null when no slots have governance_blocked', () => {
    // The component must return null (not render) when governance_blocked is absent
    const returnNullMatch = PANEL_SOURCE.match(
      /governanceBlockedSlots\.length === 0\) return null/
    );
    expect(returnNullMatch).not.toBeNull();
  });

  it('iterates blocked slots with map', () => {
    const mapMatch = PANEL_SOURCE.match(
      /governanceBlockedSlots\.map\(/
    );
    expect(mapMatch).not.toBeNull();
  });

  it('renders next_actions as a list when non-empty', () => {
    expect(PANEL_SOURCE).toContain('nextActions.length > 0 &&');
  });

  it('shows slot_label for each blocked slot', () => {
    expect(PANEL_SOURCE).toContain('slot.slot_label');
  });
});