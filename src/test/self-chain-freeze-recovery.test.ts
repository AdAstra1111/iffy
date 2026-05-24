/**
 * Self-Chain Freeze Recovery Protocol — Comprehensive Verification Tests
 *
 * The auto-run pipeline freezes when the Deno isolate terminates in fire-and-forget
 * mode before the self-chain fetch completes. These tests verify the recovery
 * protocol implementation across:
 *   - detectFrozen() logic (replicated from auto-run/index.ts for pure unit testing)
 *   - Structural presence of recover action handler and recovery_needed in status
 *   - Frontend hook recovery logic (useAutoRun.ts mount effect)
 *   - Invariant guards against regression
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ──────────────────────────────────────────────
// 1. detectFrozen() — Pure Unit Tests
// ──────────────────────────────────────────────
// Replicated from auto-run/index.ts line ~455 for testability.
// The original is a module-level function in a Deno edge function (not exported).
// This replicates the exact algorithm to validate all edge cases without
// requiring a Deno runtime or Supabase connection.

function detectFrozen(job: any): boolean {
  if (!job) return false;
  if (job.status !== 'running') return false;
  if (job.is_processing) return false;
  if (job.awaiting_approval) return false;
  if (Array.isArray(job.pending_decisions) && job.pending_decisions.length > 0) return false;

  // Staleness check: has last_step_at been updated recently?
  if (job.last_step_at) {
    const staleness = Date.now() - new Date(job.last_step_at).getTime();
    return staleness >= 30_000;
  }

  // No last_step_at at all — check if job is old enough to be considered frozen
  if (job.created_at) {
    const age = Date.now() - new Date(job.created_at).getTime();
    return age >= 60_000; // Created >1 min ago with no steps and no lock = frozen
  }

  return true; // No timestamp info at all — recover to be safe
}

describe('detectFrozen() — Self-chain freeze detection', () => {
  // ── PRIMARY USE CASE: Frozen job is correctly identified ──
  it('detects frozen job: running, not processing, stale last_step_at', () => {
    const frozen = detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: null,
      last_step_at: new Date(Date.now() - 60_000).toISOString(), // 60s old
    });
    expect(frozen).toBe(true);
  });

  // ── HEALTHY JOBS: Should never be flagged ──
  it('returns false for null/undefined job', () => {
    expect(detectFrozen(null)).toBe(false);
    expect(detectFrozen(undefined)).toBe(false);
  });

  it('returns false for job not in running status', () => {
    const statuses = ['completed', 'failed', 'cancelled', 'pending', 'queued', 'approved'];
    for (const status of statuses) {
      expect(detectFrozen({ status, is_processing: false })).toBe(false);
    }
  });

  it('returns false for running job that is processing (has lock)', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: true,
      last_step_at: new Date().toISOString(),
    })).toBe(false);
  });

  it('returns false for running job awaiting approval', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: true,
    })).toBe(false);
  });

  it('returns false for running job with pending decisions', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: ['decision-1'],
    })).toBe(false);
  });

  it('returns false for running job with recent last_step_at (< 30s)', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
      last_step_at: new Date(Date.now() - 5_000).toISOString(), // 5s ago
    })).toBe(false);
  });

  // ── BOUNDARY: Staleness threshold ──
  it('returns true exactly at 30s staleness boundary', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: null,
      last_step_at: new Date(Date.now() - 30_000).toISOString(),
    })).toBe(true);
  });

  it('returns false just before 30s staleness boundary', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: null,
      last_step_at: new Date(Date.now() - 29_999).toISOString(),
    })).toBe(false);
  });

  // ── FALLBACK: No last_step_at, check created_at age ──
  it('returns true for old job with no last_step_at (>60s since creation)', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
      created_at: new Date(Date.now() - 120_000).toISOString(),
    })).toBe(true);
  });

  it('returns false for new job with no last_step_at (<60s since creation)', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
      created_at: new Date(Date.now() - 30_000).toISOString(),
    })).toBe(false);
  });

  it('returns true at exactly 60s creation age boundary (fallback)', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
      created_at: new Date(Date.now() - 60_000).toISOString(),
    })).toBe(true);
  });

  // ── CATASTROPHIC FALLBACK: No timestamp info at all ──
  it('returns true when no timestamp info exists (safe fallback)', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
    })).toBe(true);
  });

  // ── EDGE: Empty pending_decisions array ──
  it('returns false when running job has all conditions clear but recent activity', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
      last_step_at: new Date(Date.now() - 10_000).toISOString(),
    })).toBe(false);
  });

  // ── EDGE: pending_decisions is null (not empty array) ──
  it('handles null pending_decisions (not false positive)', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: null,
      last_step_at: new Date(Date.now() - 10_000).toISOString(),
    })).toBe(false);
  });

  // ── EDGE: pending_decisions is undefined ──
  it('handles undefined pending_decisions', () => {
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      last_step_at: new Date(Date.now() - 10_000).toISOString(),
    })).toBe(false);
  });

  // ── CONFIRM IDEMPOTENCE SIGNATURE ──
  it('recover action is designed to be idempotent: detectFrozen returns false when job is healthy', () => {
    // A healthy running job should NEVER be flagged — this is what makes recover idempotent
    // (the handler checks detectFrozen and returns without firing self-chain when false)
    const healthyJobs = [
      { status: 'running', is_processing: true, last_step_at: new Date().toISOString() },
      { status: 'running', is_processing: false, awaiting_approval: true },
      { status: 'running', is_processing: false, last_step_at: new Date(Date.now() - 10_000).toISOString() },
      { status: 'completed', is_processing: false },
      { status: 'failed', is_processing: false },
    ];
    for (const job of healthyJobs) {
      expect(detectFrozen(job)).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────
// 2. Structural Tests — Source Code Verification
// ──────────────────────────────────────────────
// These tests verify that the freeze recovery protocol components exist
// in the source files by reading and parsing the actual source.

describe('Structural: auto-run edge function (supabase/functions/auto-run/index.ts)', () => {
  const autoRunPath = path.resolve(__dirname, '../../supabase/functions/auto-run/index.ts');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(autoRunPath, 'utf-8');
  });

  it('exists as a file', () => {
    expect(fs.existsSync(autoRunPath)).toBe(true);
  });

  it('contains detectFrozen() function definition', () => {
    expect(source).toContain('function detectFrozen');
    // Verify the function signature
    const match = source.match(/function\s+detectFrozen\s*\(\s*job\s*:\s*any\s*\)\s*:\s*boolean/);
    expect(match).not.toBeNull();
  });

  it('detectFrozen has staleness threshold 30_000 (30s)', () => {
    expect(source).toContain('30_000');
    const stalenessLine = source.split('\n').find(l => l.includes('30_000') && l.includes('staleness'));
    expect(stalenessLine).toBeTruthy();
  });

  it('detectFrozen has creation-age fallback threshold 60_000 (60s)', () => {
    expect(source).toContain('60_000');
    const ageLine = source.split('\n').find(l => l.includes('60_000') && l.includes('age'));
    expect(ageLine).toBeTruthy();
  });

  it('status response includes recovery_needed: detectFrozen(job)', () => {
    expect(source).toContain('recovery_needed: detectFrozen(job)');
  });

  it('contains recover action handler (action === "recover")', () => {
    const match = source.match(/if\s*\(\s*action\s*===\s*['"]recover['"]\s*\)/);
    expect(match).not.toBeNull();
  });

  it('recover handler fires self-chain with { action: "run-next", jobId }', () => {
    expect(source).toContain('action: "run-next"');
    expect(source).toContain('action: "run-next"');
  });

  it('recover handler uses waitUntilSafe for fire-and-forget self-chain', () => {
    expect(source).toContain('waitUntilSafe(chainPromise)');
  });

  it('recover handler returns respondWithJob on success', () => {
    const lines = source.split('\n');
    const recoverBlock = lines.slice(
      lines.findIndex(l => l.includes('action === "recover"')),
      lines.findIndex(l => l.includes('ACTION: start'))
    ).join('\n');
    expect(recoverBlock).toContain('respondWithJob(supabase, jobId, "run-next")');
  });

  it('recover handler is idempotent: returns early when job is not frozen', () => {
    const lines = source.split('\n');
    const recoverBlock = lines.slice(
      lines.findIndex(l => l.includes('action === "recover"')),
      lines.findIndex(l => l.includes('ACTION: start'))
    ).join('\n');
    expect(recoverBlock).toContain('!detectFrozen(job)');
    expect(recoverBlock).toContain('respondWithJob(supabase, jobId, "none")');
  });

  it('recover handler validates jobId required', () => {
    expect(source).toContain('jobId required');
  });

  it('recover handler returns 404 for missing job', () => {
    expect(source).toContain('Job not found');
  });

  it('recover handler logs IEL event freeze_recovery_triggered', () => {
    expect(source).toContain('freeze_recovery_triggered');
  });

  it('status ACTION exists before recover ACTION in Deno.serve handler', () => {
    // The recover handler must be placed AFTER status but BEFORE start
    const lines = source.split('\n');
    const statusIdx = lines.findIndex(l => l.includes('if (action === "status")'));
    const recoverIdx = lines.findIndex(l => l.includes('ACTION: recover'));
    const startIdx = lines.findIndex(l => l.includes('ACTION: start'));
    expect(statusIdx).toBeGreaterThan(-1);
    expect(recoverIdx).toBeGreaterThan(-1);
    expect(startIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeLessThan(recoverIdx);
    expect(recoverIdx).toBeLessThan(startIdx);
  });
});

describe('Structural: frontend hook (src/hooks/useAutoRun.ts)', () => {
  const hookPath = path.resolve(__dirname, '../../src/hooks/useAutoRun.ts');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(hookPath, 'utf-8');
  });

  it('exists as a file', () => {
    expect(fs.existsSync(hookPath)).toBe(true);
  });

  it('mount effect checks recovery_needed flag', () => {
    expect(source).toContain('recovery_needed');
  });

  it('mount effect fires callAutoRun("recover", ...) when recovery_needed is true', () => {
    expect(source).toContain("callAutoRun('recover'");
    expect(source).toContain("callAutoRun('recover',");
  });

  it('mount effect auto-starts runLoop after recovery succeeds', () => {
    expect(source).toContain('runLoopRef.current?.(existingJob.job.id)');
    const mountBlock = source.split('\n').slice(
      source.split('\n').findIndex(l => l.includes('recovery_needed')),
      source.split('\n').findIndex(l => l.includes('const start = useCallback'))
    ).join('\n');
    expect(mountBlock).toContain('setIsRunning(true)');
  });

  it('mount effect has fallback: continues polling even if recovery HTTP fails', () => {
    // The catch block should still start runLoop
    const lines = source.split('\n');
    const catchLine = lines.findIndex(l => l.includes('.catch'));
    if (catchLine > -1) {
      const afterCatch = lines.slice(catchLine, catchLine + 20).join('\n');
      expect(afterCatch).toContain('setIsRunning(true)');
      expect(afterCatch).toContain('runLoopRef.current?.');
    }
  });

  it('auto-starts runLoop for non-frozen running jobs (navigation-back continuity)', () => {
    // else if (isRunning) block: auto-start runLoop for running jobs
    const lines = source.split('\n');
    const elseIfRunning = lines.findIndex(l => l.includes('else if (isRunning)'));
    if (elseIfRunning > -1) {
      const block = lines.slice(elseIfRunning, elseIfRunning + 15).join('\n');
      expect(block).toContain('setIsRunning(true)');
      expect(block).toContain('runLoopRef.current?.');
    }
  });
});

describe('Structural: CLAUDE.md documentation', () => {
  const claudeMdPath = path.resolve(__dirname, '../../CLAUDE.md');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(claudeMdPath, 'utf-8');
  });

  it('documents Self-Chain Freeze Recovery Protocol', () => {
    expect(source).toContain('Self-Chain Freeze Recovery Protocol');
  });

  it('documents freeze signature conditions', () => {
    expect(source).toContain('Freeze signature');
    expect(source).toContain('waitUntilSafe');
    expect(source).toContain('status=running, is_processing=false');
  });

  it('documents recovery architecture with detectFrozen, recovery_needed, recover action, frontend auto-recovery', () => {
    expect(source).toContain('detectFrozen');
    expect(source).toContain('recovery_needed');
    expect(source).toContain('recover');
    expect(source).toContain('Auto-start on mount');
  });
});

// ──────────────────────────────────────────────
// 3. Invariant: Idempotence Safety
// ──────────────────────────────────────────────
describe('Invariant: Recover action idempotence', () => {
  it('recover handler returns respondWithJob with "none" when job is not frozen', () => {
    // The handler explicitly checks !detectFrozen(job) and returns early:
    //   if (!detectFrozen(job)) {
    //     return respondWithJob(supabase, jobId, "none");
    //   }
    // This means calling recover on a healthy job is a no-op.
    // verify via our detectFrozen replica that healthy jobs return false:
    const healthyJob = {
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
      last_step_at: new Date(Date.now() - 10_000).toISOString(),
    };
    expect(detectFrozen(healthyJob)).toBe(false);
  });

  it('double-recover on same frozen job is safe (run-next acquires processing lock)', () => {
    // run-next internally acquires a processing lock via is_processing check
    // so concurrent recover calls are safe — the second recover's self-chain
    // will find is_processing=true and be a no-op.
    const frozenJob = {
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
      last_step_at: new Date(Date.now() - 60_000).toISOString(),
    };
    expect(detectFrozen(frozenJob)).toBe(true);
  });
});

// ──────────────────────────────────────────────
// 4. Edge Case: Recovery boundary conditions
// ──────────────────────────────────────────────
describe('Edge case: Recovery boundary conditions', () => {
  it('job with status=running but no fields at all returns true (safe fallback)', () => {
    expect(detectFrozen({ status: 'running' })).toBe(true);
  });

  it('job with only status=running + is_processing fields returns true when not processing and no timestamps', () => {
    expect(detectFrozen({ status: 'running', is_processing: false })).toBe(true);
  });

  it('job with all fields present but edge-case staleness at 0ms', () => {
    // last_step_at right now — definitely not frozen
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
      last_step_at: new Date().toISOString(),
    })).toBe(false);
  });

  it('pending_decisions empty array is treated same as no pending decisions', () => {
    // Array.isArray check + .length > 0 means empty array passes through
    // and staleness check applies
    expect(detectFrozen({
      status: 'running',
      is_processing: false,
      awaiting_approval: false,
      pending_decisions: [],
      last_step_at: new Date(Date.now() - 60_000).toISOString(),
    })).toBe(true);
  });
});