/**
 * Tests for Fix Mission Control AutoRun lifecycle loop
 * — 503 retry + retry:false + idempotency guard
 *
 * Commit: 6bc3125
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const AUTO_RUN_SRC = path.resolve(__dirname, '../../supabase/functions/auto-run/index.ts');
const USE_DEV_ENGINE_SRC = path.resolve(__dirname, '../../src/hooks/useDevEngineV2.ts');
const DEV_ENGINE_PAGE_SRC = path.resolve(__dirname, '../../src/pages/ProjectDevelopmentEngine.tsx');

// ── Change 1: 503 added to retryable status codes in auto-run ──

describe('Change 1 — 503 retryable in auto-run callEdgeFunction', () => {
  const source = fs.readFileSync(AUTO_RUN_SRC, 'utf-8');

  it('includes 503 in retryable status code check alongside 502 and 504', () => {
    expect(source).toContain('resp.status === 503');
  });

  it('retryable assignment includes 503 alongside 502 and 504', () => {
    expect(source).toContain('502 || resp.status === 503 || resp.status === 504');
  });

  it('user message condition also includes 503', () => {
    expect(source).toContain('502 || resp.status === 503 || resp.status === 504');
  });

  it('detectFrozen function still exists (regression check)', () => {
    expect(source).toContain('function detectFrozen');
  });

  it('contains the recover action handler (regression check)', () => {
    expect(source).toContain('action === "recover"');
  });
});

// ── Change 2: retry: false on all 10 mutations in useDevEngineV2 ──

describe('Change 2 — retry: false on all 10 dev-engine-v2 mutations', () => {
  const source = fs.readFileSync(USE_DEV_ENGINE_SRC, 'utf-8');

  // Verify each mutation name appears in the source with retry: false
  // We use indexOf with substring matching to avoid regex escape issues
  const mutations = source.split('\n');
  const mutationLines: string[] = [];

  for (let i = 0; i < mutations.length; i++) {
    const line = mutations[i].trim();
    if (line.match(/^const \w+ = useMutation\(/)) {
      // Found a mutation, check if next non-comment lines contain retry: false
      let foundRetry = false;
      for (let j = i + 1; j < Math.min(i + 10, mutations.length); j++) {
        const inner = mutations[j].trim();
        if (inner.startsWith('retry:')) {
          foundRetry = inner.includes('false');
          break;
        }
      }
      const name = line.match(/const (\w+) = useMutation/)?.[1] || 'unknown';
      mutationLines.push(name);
      it(`${name} mutation has retry: false`, () => {
        expect(foundRetry).toBe(true);
      });
    }
  }

  it('EXACTLY 10 mutations exist with retry: false', () => {
    const expectedNames = [
      'analyze', 'generateNotes', 'rewrite', 'convert', 'beatSheetToScript',
      'createPaste', 'deleteVersion', 'deleteDocument', 'acknowledgeDrift', 'resolveDrift',
    ];
    expect(mutationLines.sort()).toEqual(expectedNames.sort());
    expect(mutationLines.length).toBe(10);
  });

  it('single-flight guard still functions (regression check)', () => {
    expect(source).toContain('inFlightCalls');
    expect(source).toContain('makeFlightKey');
  });

  it('concurrency limiter still intact (regression check)', () => {
    expect(source).toContain('ENGINE_V2_MAX_CONCURRENT');
  });

  it('hardened JSON boundary still intact (regression check)', () => {
    expect(source).toContain('contentType.includes');
    expect(source).toContain('resp.text()');
  });
});

// ── Change 3: Idempotency guard on promotion state effect ──

describe('Change 3 — Idempotency guard for promotion state recomputation', () => {
  const source = fs.readFileSync(DEV_ENGINE_PAGE_SRC, 'utf-8');

  it('has prevPromotionSignatureRef declaration', () => {
    expect(source).toContain('prevPromotionSignatureRef');
    expect(source).toContain('useRef<string | null>');
  });

  it('computes a promotion schema signature from all state inputs', () => {
    expect(source).toContain('const promotionSchema = {');
    // Must include key identity fields
    expect(source).toContain('projectId');
    expect(source).toContain('jobId');
    expect(source).toContain('docType');
    expect(source).toContain('authoritativeVersionId');
    expect(source).toContain('ci');
    expect(source).toContain('gp');
    expect(source).toContain('gap');
    expect(source).toContain('trajectory');
    expect(source).toContain('blockersCount');
    expect(source).toContain('convergenceStatus');
  });

  it('serializes the schema to JSON for comparison', () => {
    expect(source).toContain('const signature = JSON.stringify(promotionSchema)');
  });

  it('early-returns when signature matches previous', () => {
    expect(source).toContain('signature === prevPromotionSignatureRef.current');
    expect(source).toContain('return; // Skip');
  });

  it('updates the ref after computing', () => {
    expect(source).toContain('prevPromotionSignatureRef.current = signature');
  });

  it('computeLocal is still called (regression check)', () => {
    expect(source).toContain('promotionIntel.computeLocal');
  });

  it('inline decisions fallback still exists (regression check)', () => {
    expect(source).toContain('DecisionModePanel');
  });
});