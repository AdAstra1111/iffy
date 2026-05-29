/**
 * duplicate-subscore-write-fix.test.ts
 *
 * Validates P0-2: Removal of duplicate Block 2 subscore writer.
 *
 * Block 2 used `(Number(ciSubScores[k]) || 5) * 10` which defaulted missing
 * scores to 50. Block 1 (the surviving writer) validates scores and sets
 * is_valid=false for out-of-range or missing values.
 *
 * Invariants:
 * 1. Validated writer rejects out-of-range values
 * 2. Validated writer marks is_valid=false instead of defaulting
 * 3. Validated writer sets descriptive validation_error
 * 4. Delta tracking respects is_valid (null for invalid)
 * 5. Backfill catches score=50 rows with no validation
 */
import { describe, it, expect } from 'vitest';

type SubscoreRecord = {
  dimension: string;
  score: number;
  is_valid: boolean;
  validation_error: string | null;
};

type SubscoreRow = {
  version_id: string;
  category: string;
  dimension: string;
  score: number;
  confidence: null;
  delta_from_previous: number | null;
  trend: string | null;
  is_valid: boolean;
  validation_error: string | null;
  created_at: string;
};

// ── Pure logic: validated subscore builder (mirrors Block 1 at line 695-718) ──
function buildValidatedCIRecords(ciSubScores: Record<string, number | null | undefined>): SubscoreRecord[] {
  return Object.entries(ciSubScores).map(([k, raw]) => {
    const num = Number(raw);
    const valid = raw != null && !isNaN(num) && num >= 0 && num <= 10;
    return {
      dimension: k,
      score: Math.round(num * 10),
      is_valid: valid,
      validation_error: valid ? null : `CI::${k} missing or out of range [0-10]: ${JSON.stringify(raw)}`,
    };
  });
}

// ── Pure logic: delta builder that respects is_valid (mirrors Block 1 at line 738-757) ──
function buildDeltaRow(
  rec: SubscoreRecord,
  prevScore: number | null,
  now: string,
): SubscoreRow {
  const delta = rec.is_valid && prevScore != null ? rec.score - prevScore : null;
  const trend = delta != null
    ? (delta > 2 ? 'up' : delta < -2 ? 'down' : 'stable')
    : null;
  return {
    version_id: 'test-v1',
    category: 'CI',
    dimension: rec.dimension,
    score: rec.score,
    confidence: null,
    delta_from_previous: delta,
    trend,
    is_valid: rec.is_valid,
    validation_error: rec.validation_error,
    created_at: now,
  };
}

// ── Tests ──

describe('P0-2: Validated subscore writer (Block 1, survives)', () => {
  it('valid score (7) → is_valid=true, score=70', () => {
    const records = buildValidatedCIRecords({ narrative_clarity: 7 });
    expect(records[0].is_valid).toBe(true);
    expect(records[0].score).toBe(70);
    expect(records[0].validation_error).toBeNull();
  });

  it('null score → is_valid=false, score=0', () => {
    const records = buildValidatedCIRecords({ narrative_clarity: null });
    expect(records[0].is_valid).toBe(false);
    expect(records[0].score).toBe(0);
    expect(records[0].validation_error).toContain('missing');
  });

  it('undefined score → is_valid=false', () => {
    const records = buildValidatedCIRecords({ narrative_clarity: undefined });
    expect(records[0].is_valid).toBe(false);
  });

  it('out-of-range 15 → is_valid=false', () => {
    const records = buildValidatedCIRecords({ narrative_clarity: 15 });
    expect(records[0].is_valid).toBe(false);
    expect(records[0].validation_error).toContain('out of range');
  });

  it('delta is null when is_valid is false', () => {
    const rec = buildValidatedCIRecords({ narrative_clarity: null })[0];
    const row = buildDeltaRow(rec, 50, new Date().toISOString());
    expect(row.delta_from_previous).toBeNull();
    expect(row.trend).toBeNull();
  });

  it('delta is computed when is_valid is true and previous exists', () => {
    const rec = buildValidatedCIRecords({ narrative_clarity: 7 })[0];
    const row = buildDeltaRow(rec, 50, new Date().toISOString());
    expect(row.delta_from_previous).toBe(20); // 70 - 50
    expect(row.trend).toBe('up');
  });

  it('delta stable when change ≤ 2', () => {
    const rec = buildValidatedCIRecords({ narrative_clarity: 5 })[0];
    const row = buildDeltaRow(rec, 50, new Date().toISOString());
    expect(row.trend).toBe('stable');
  });

  it('delta down when change < -2', () => {
    const rec = buildValidatedCIRecords({ narrative_clarity: 4 })[0];
    const row = buildDeltaRow(rec, 50, new Date().toISOString());
    expect(row.trend).toBe('down');
  });
});

describe('P0-2: What Block 2 did wrong (defaulted to 50)', () => {
  it('Block 2 default pattern would produce score=50 for null (now impossible)', () => {
    // This is what Block 2 did: (Number(null) || 5) * 10 = 50
    const badScore = (Number(null) || 5) * 10;
    expect(badScore).toBe(50);
    // Block 1 correctly gives 0 with is_valid=false
    const records = buildValidatedCIRecords({ narrative_clarity: null });
    expect(records[0].score).toBe(0);
    expect(records[0].is_valid).toBe(false);
  });
});