/**
 * identityStackFlags.ts
 *
 * Feature flag for Identity Stack P0 shadow-mode.
 *
 * DEFAULT: OFF
 * When OFF: zero runtime impact, zero telemetry, zero behavior changes.
 * When ON: compute shadow telemetry only — no decisions, no gates.
 *
 * Phase 7.2B — shadow integration only.
 */

export const IDENTITY_STACK_SHADOW_ENABLED = false;
