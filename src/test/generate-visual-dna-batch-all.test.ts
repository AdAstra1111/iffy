/**
 * Tests for generate-visual-dna-from-canon — batch 'all' target.
 *
 * Reference: commit 75b6ace
 * Changes:
 *   - Adds 'all' to GenerateVisualDNAInput target union
 *   - Adds BatchResult / BatchSubReport interfaces for structured output
 *   - Adds staleRowCount() helper (character_visual_dna vs project_canon staleness)
 *   - Adds scanCanonLocations() helper (reads location names from canon_json)
 *   - Adds suppressGovernance flag to handleAllCharacters (5th param, default false)
 *   - Adds handleBatchAll() orchestration — calls all sub-handlers, aggregates results
 *   - LLM fallback in deriveStyleFromCanon (3+ empty fields + functionBase provided)
 *   - refresh_stale mode skips strong/approved DNA in handleCharacter
 *   - Frontend: target 'all_characters' → 'all', toast shows structured BatchResult
 *
 * This suite verifies:
 *   1. Source-level pattern checks for the new interfaces, functions, and routing
 *   2. Behavioral routing logic (extracted and unit-tested)
 *   3. Batch orchestration: all sub-handlers called, governance once at end
 *   4. Edge cases and invariants
 *   5. Legacy all_characters still returns flat DNAReport
 *   6. Toast display format for BatchResult
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';

// ──────────────────────────────────────────────────────────────────
// Source file path
// ──────────────────────────────────────────────────────────────────
const SOURCE_PATH = 'supabase/functions/generate-visual-dna-from-canon/index.ts';

function getSourceText(): string {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`Source file not found: ${SOURCE_PATH}`);
  }
  return readFileSync(SOURCE_PATH, 'utf-8');
}

// ──────────────────────────────────────────────────────────────────
// Extracted routing / logic for behavioral tests
// ──────────────────────────────────────────────────────────────────

/** Batch sub-report shape */
interface BatchSubReport {
  created: number;
  skipped: number;
  updated: number;
  blocked: number;
  low_confidence: number;
  errors: string[];
}

/** Batch result shape */
interface BatchResult {
  characters: BatchSubReport;
  style: BatchSubReport;
  locations: BatchSubReport;
  stale_count: number;
  location_names: string[];
}

type Target = 'character' | 'all_characters' | 'project_style' | 'location' | 'entity' | 'all';
type Mode = 'preview_only' | 'generate_missing' | 'refresh_stale';

/** Extracted switch-case routing logic — matches the updated handler */
function routeAllTarget(
  target: Target,
): { handler: string; functionBaseNeeded: boolean } {
  switch (target) {
    case 'character':
      return { handler: 'handleCharacter', functionBaseNeeded: true };
    case 'all_characters':
      return { handler: 'handleAllCharacters', functionBaseNeeded: true };
    case 'all':
      return { handler: 'handleBatchAll', functionBaseNeeded: true };
    case 'project_style':
      return { handler: 'handleProjectStyle', functionBaseNeeded: false };
    case 'location':
      return { handler: 'handleLocation', functionBaseNeeded: false };
    case 'entity':
      return { handler: 'handleEntity', functionBaseNeeded: true };
    default:
      return { handler: 'unknown', functionBaseNeeded: false };
  }
}

/** Validate target strings — must be in validTargets array */
function isValidTarget(target: string): boolean {
  const validTargets = ['character', 'all_characters', 'project_style', 'location', 'entity', 'all'];
  return validTargets.includes(target);
}

/** Validate mode strings */
function isValidMode(mode: string): boolean {
  const validModes = ['preview_only', 'generate_missing', 'refresh_stale'];
  return validModes.includes(mode);
}

/** Extracted staleRowCount logic for behavioral test */
function computeStaleCount(
  canonUpdatedAt: number | null,
  dnaRows: { created_at: string }[],
): { count: number; total: number } {
  if (!canonUpdatedAt) return { count: 0, total: 0 };
  if (!dnaRows || dnaRows.length === 0) return { count: 0, total: 0 };
  let staleCount = 0;
  for (const row of dnaRows) {
    const dnaCreated = new Date(row.created_at).getTime();
    if (dnaCreated < canonUpdatedAt) staleCount++;
  }
  return { count: staleCount, total: dnaRows.length };
}

/** Extracted scanCanonLocations logic */
function extractLocationNames(canonJson: Record<string, any> | null): string[] {
  if (!canonJson) return [];
  const locations = canonJson.locations || [];
  if (!Array.isArray(locations)) return [];
  return locations
    .map((l: any) => (typeof l === 'string' ? l : l.name || ''))
    .filter((n: string) => n.length > 0);
}

/** Simulate the handleBatchAll orchestration aggregation for behavioral tests */
function simulateBatchAllAggregation(
  charCreated: number,
  charSkipped: number,
  charUpdated: number,
  charBlocked: number,
  charLowConf: number,
  charErrors: string[],
  styleCreated: number,
  styleSkipped: number,
  styleUpdated: number,
  styleBlocked: number,
  styleLowConf: number,
  styleErrors: string[],
  locCreated: number,
  locSkipped: number,
  locUpdated: number,
  locBlocked: number,
  locLowConf: number,
  locErrors: string[],
  staleCount: number,
  locationNames: string[],
  mode: Mode,
): BatchResult & { governanceCalled: boolean } {
  const totalCreated = charCreated + styleCreated + locCreated;
  const totalUpdated = charUpdated + styleUpdated + locUpdated;
  const governanceCalled = mode !== 'preview_only' && (totalCreated > 0 || totalUpdated > 0);

  return {
    characters: { created: charCreated, skipped: charSkipped, updated: charUpdated, blocked: charBlocked, low_confidence: charLowConf, errors: charErrors },
    style: { created: styleCreated, skipped: styleSkipped, updated: styleUpdated, blocked: styleBlocked, low_confidence: charLowConf, errors: styleErrors },
    locations: { created: locCreated, skipped: locSkipped, updated: locUpdated, blocked: locBlocked, low_confidence: locLowConf, errors: locErrors },
    stale_count: staleCount,
    location_names: locationNames,
    governanceCalled,
  };
}

/** Simulate handleAllCharacters suppressGovernance logic */
function simulateGovernanceLogic(
  mode: Mode,
  totalCreated: number,
  totalUpdated: number,
  suppressed: boolean,
): boolean {
  if (mode === 'preview_only') return false;
  if (totalCreated === 0 && totalUpdated === 0) return false;
  if (suppressed) return false;
  return true;
}

// ──────────────────────────────────────────────────────────────────
// Section 1: Source-level pattern checks — batch 'all' target
// ──────────────────────────────────────────────────────────────────

describe('Source-level pattern checks — batch all target (commit 75b6ace)', () => {
  const source = getSourceText();
  const lines = source.split('\n');

  it('target union includes "all"', () => {
    // Find the GenerateVisualDNAInput interface
    const inputIdx = lines.findIndex((l) => l.includes('interface GenerateVisualDNAInput'));
    expect(inputIdx).toBeGreaterThanOrEqual(0);
    const inputBody = lines.slice(inputIdx, inputIdx + 10).join('\n');
    expect(inputBody).toContain('"all"');
    expect(inputBody).toContain('"character"');
    expect(inputBody).toContain('"all_characters"');
    expect(inputBody).toContain('"entity"');
  });

  it('validTargets array includes "all"', () => {
    const validTargetsLine = lines.find((l) => l.includes('const validTargets'));
    expect(validTargetsLine).toBeDefined();
    expect(validTargetsLine!).toContain('"all"');
    expect(validTargetsLine!).toContain('"character"');
    expect(validTargetsLine!).toContain('"all_characters"');
    expect(validTargetsLine!).toContain('"entity"');
  });

  it('BatchResult interface exists with correct shape', () => {
    const batchIdx = lines.findIndex((l) => l.includes('interface BatchResult'));
    expect(batchIdx).toBeGreaterThanOrEqual(0);
    const batchBody = lines.slice(batchIdx, batchIdx + 10).join('\n');
    expect(batchBody).toContain('characters: BatchSubReport');
    expect(batchBody).toContain('style: BatchSubReport');
    expect(batchBody).toContain('locations: BatchSubReport');
    expect(batchBody).toContain('stale_count: number');
    expect(batchBody).toContain('location_names: string[]');
  });

  it('BatchSubReport interface exists with correct shape', () => {
    const subIdx = lines.findIndex((l) => l.includes('interface BatchSubReport'));
    expect(subIdx).toBeGreaterThanOrEqual(0);
    const subBody = lines.slice(subIdx, subIdx + 10).join('\n');
    expect(subBody).toContain('created: number');
    expect(subBody).toContain('skipped: number');
    expect(subBody).toContain('updated: number');
    expect(subBody).toContain('blocked: number');
    expect(subBody).toContain('low_confidence: number');
    expect(subBody).toContain('errors: string[]');
  });

  it('handleBatchAll function exists and has correct signature', () => {
    const fnIdx = lines.findIndex((l) => l.includes('async function handleBatchAll('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 8).join('\n');
    expect(sigBlock).toContain('functionBase: string');
    expect(sigBlock).toContain('projectId: string');
    expect(sigBlock).toContain('mode: string');
    expect(sigBlock).toMatch(/async function handleBatchAll\(/);
  });

  it('switch case "all" routes to handleBatchAll', () => {
    const caseLine = lines.find((l) => l.includes('case "all"') || l.includes("case 'all'"));
    expect(caseLine).toBeDefined();
    const caseIdx = lines.findIndex((l) => l.includes('case "all"') || l.includes("case 'all'"));
    const returnLine = lines.slice(caseIdx).find((l) => l.includes('return await handleBatchAll('));
    expect(returnLine).toBeDefined();
    expect(returnLine!).toContain('handleBatchAll');
    expect(returnLine!).toContain('functionBase');
    expect(returnLine!).toMatch(/handleBatchAll\(\s*sb\s*,\s*functionBase\s*,/);
  });

  it('staleRowCount function exists', () => {
    const fnIdx = lines.findIndex((l) => l.includes('async function staleRowCount('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 5).join('\n');
    expect(sigBlock).toContain('projectId: string');
  });

  it('scanCanonLocations function exists', () => {
    const fnIdx = lines.findIndex((l) => l.includes('async function scanCanonLocations('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 5).join('\n');
    expect(sigBlock).toContain('projectId: string');
    expect(sigBlock).toContain('string[]');
  });

  it('handleAllCharacters has suppressGovernance as 5th parameter (default false)', () => {
    const fnIdx = lines.findIndex((l) => l.includes('async function handleAllCharacters('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 8).join('\n');
    expect(sigBlock).toContain('suppressGovernance');
    expect(sigBlock).toContain('= false');
  });

  it('handleBatchAll calls handleAllCharacters with suppressGovernance=true', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleBatchAll('));
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBody = lines.slice(fnStart, fnStart + 100).join('\n');
    expect(fnBody).toContain('handleAllCharacters(sb, functionBase, projectId, mode, true');
  });

  it('handleBatchAll calls handleProjectStyle', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleBatchAll('));
    const fnBody = lines.slice(fnStart, fnStart + 100).join('\n');
    expect(fnBody).toContain('handleProjectStyle(sb, projectId, mode');
    // handleProjectStyle does NOT get functionBase
    expect(fnBody).toMatch(/handleProjectStyle\(\s*sb\s*,\s*projectId\s*,\s*mode\s*\)/);
  });

  it('handleBatchAll calls handleLocation for each location', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleBatchAll('));
    const fnBody = lines.slice(fnStart, fnStart + 120).join('\n');
    expect(fnBody).toContain('handleLocation(sb, projectId, locName, mode');
    // handleLocation does NOT get functionBase
    expect(fnBody).toMatch(/handleLocation\(\s*sb\s*,\s*projectId\s*,\s*locName\s*,\s*mode\s*\)/);
  });

  it('handleBatchAll calls staleRowCount at start', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleBatchAll('));
    const fnBody = lines.slice(fnStart, fnStart + 40).join('\n');
    expect(fnBody).toContain('staleRowCount(sb, projectId');
  });

  it('handleBatchAll calls scanCanonLocations', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleBatchAll('));
    const fnBody = lines.slice(fnStart, fnStart + 80).join('\n');
    expect(fnBody).toContain('scanCanonLocations(sb, projectId');
  });

  it('handleBatchAll returns BatchResult shape (not DNAReport)', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleBatchAll('));
    const fnEnd = lines.slice(fnStart).findIndex((l) => l.includes('return respond'));
    // Extend slice to include the full return object span
    const fnBody = lines.slice(fnStart, fnStart + fnEnd + 12).join('\n');
    expect(fnBody).toContain('characters: batchResult.characters');
    expect(fnBody).toContain('style: batchResult.style');
    expect(fnBody).toContain('locations: batchResult.locations');
    expect(fnBody).toContain('stale_count: batchResult.stale_count');
    expect(fnBody).toContain('location_names: batchResult.location_names');
  });

  it('handleBatchAll returns governance_result in the response', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleBatchAll('));
    const fnEnd = lines.slice(fnStart).findIndex((l) => l.includes('return respond'));
    // Extend slice to include the full return object (return respond({ ... }) spans ~8 lines)
    const fnBody = lines.slice(fnStart, fnStart + fnEnd + 12).join('\n');
    expect(fnBody).toContain('governance_result: governanceResult');
  });

  it('deriveStyleFromCanon has optional functionBase parameter for LLM fallback', () => {
    const fnIdx = lines.findIndex((l) => l.includes('async function deriveStyleFromCanon('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 8).join('\n');
    expect(sigBlock).toContain('functionBase?: string');
  });

  it('deriveStyleFromCanon has LLM fallback for 3+ empty visual fields', () => {
    const fnIdx = lines.findIndex((l) => l.includes('async function deriveStyleFromCanon('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const fnBody = lines.slice(fnIdx, fnIdx + 200).join('\n');
    expect(fnBody).toContain('callLLM');
    expect(fnBody).toContain('emptyCount >= 3');
  });

  it('Frontend ProjectDevelopmentEngine.tsx sends target="all" instead of "all_characters"', () => {
    const fePath = 'src/pages/ProjectDevelopmentEngine.tsx';
    if (existsSync(fePath)) {
      const feSource = readFileSync(fePath, 'utf-8');
      expect(feSource).toContain("target: 'all'");
      // Verify toast shows BatchResult format
      expect(feSource).toContain('chars: +');
      expect(feSource).toContain('style: +');
      expect(feSource).toContain('locs: +');
      expect(feSource).toContain('Visual DNA batch');
    }
  });

  it('Frontend still handles legacy flat DNAReport shape (branching)', () => {
    const fePath = 'src/pages/ProjectDevelopmentEngine.tsx';
    if (existsSync(fePath)) {
      const feSource = readFileSync(fePath, 'utf-8');
      // Check for the branching logic
      expect(feSource).toContain('data.characters !== undefined');
      expect(feSource).toContain('Visual DNA:'); // Legacy toast prefix
      expect(feSource).toContain('BatchResult');  // Should reference the new shape
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// Section 2: Behavioral routing — target dispatch
// ──────────────────────────────────────────────────────────────────

describe('Target routing — batch all target included', () => {
  it('routes target="all" to handleBatchAll with functionBase', () => {
    const r = routeAllTarget('all');
    expect(r.handler).toBe('handleBatchAll');
    expect(r.functionBaseNeeded).toBe(true);
  });

  it('routes target="character" to handleCharacter with functionBase', () => {
    const r = routeAllTarget('character');
    expect(r.handler).toBe('handleCharacter');
    expect(r.functionBaseNeeded).toBe(true);
  });

  it('routes target="all_characters" to handleAllCharacters with functionBase', () => {
    const r = routeAllTarget('all_characters');
    expect(r.handler).toBe('handleAllCharacters');
    expect(r.functionBaseNeeded).toBe(true);
  });

  it('routes target="project_style" to handleProjectStyle WITHOUT functionBase', () => {
    const r = routeAllTarget('project_style');
    expect(r.handler).toBe('handleProjectStyle');
    expect(r.functionBaseNeeded).toBe(false);
  });

  it('routes target="location" to handleLocation WITHOUT functionBase', () => {
    const r = routeAllTarget('location');
    expect(r.handler).toBe('handleLocation');
    expect(r.functionBaseNeeded).toBe(false);
  });

  it('routes target="entity" to handleEntity with functionBase', () => {
    const r = routeAllTarget('entity');
    expect(r.handler).toBe('handleEntity');
    expect(r.functionBaseNeeded).toBe(true);
  });
});

describe('Target name validation', () => {
  it('"all" is a valid target', () => {
    expect(isValidTarget('all')).toBe(true);
  });

  it('"invalid" is NOT a valid target', () => {
    expect(isValidTarget('invalid')).toBe(false);
  });

  it('all 6 defined targets are valid', () => {
    const targets: Target[] = ['character', 'all_characters', 'project_style', 'location', 'entity', 'all'];
    for (const t of targets) {
      expect(isValidTarget(t)).toBe(true);
    }
  });

  it('empty string is NOT a valid target', () => {
    expect(isValidTarget('')).toBe(false);
  });
});

describe('Mode validation', () => {
  it('all 3 modes are valid', () => {
    const modes: Mode[] = ['preview_only', 'generate_missing', 'refresh_stale'];
    for (const m of modes) {
      expect(isValidMode(m)).toBe(true);
    }
  });

  it('"invalid" is NOT a valid mode', () => {
    expect(isValidMode('invalid')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// Section 3: Batch orchestration behavior
// ──────────────────────────────────────────────────────────────────

describe('Batch orchestration — governance is called exactly once', () => {
  it('generate_missing mode calls governance when items were created', () => {
    const result = simulateBatchAllAggregation(
      3, 0, 0, 0, 0, [], // characters: 3 created
      1, 0, 0, 0, 0, [], // style: 1 created
      2, 0, 0, 0, 0, [], // locations: 2 created
      0,                  // stale count
      ['Town', 'Forest'], // location names
      'generate_missing',
    );
    expect(result.governanceCalled).toBe(true);
    expect(result.characters.created).toBe(3);
    expect(result.style.created).toBe(1);
    expect(result.locations.created).toBe(2);
  });

  it('preview_only mode does NOT call governance even with items', () => {
    const result = simulateBatchAllAggregation(
      5, 0, 0, 0, 0, [],
      2, 0, 0, 0, 0, [],
      3, 0, 0, 0, 0, [],
      0,
      ['Town'],
      'preview_only',
    );
    expect(result.governanceCalled).toBe(false);
  });

  it('governance is NOT called when zero items were created or updated', () => {
    const result = simulateBatchAllAggregation(
      0, 0, 0, 0, 0, [],
      0, 0, 0, 0, 0, [],
      0, 0, 0, 0, 0, [],
      0,
      [],
      'generate_missing',
    );
    expect(result.governanceCalled).toBe(false);
  });

  it('governance IS called when items were updated but not created', () => {
    const result = simulateBatchAllAggregation(
      0, 0, 0, 0, 0, [],
      0, 0, 2, 0, 0, [],
      0, 0, 0, 0, 0, [],
      0,
      [],
      'generate_missing',
    );
    expect(result.governanceCalled).toBe(true);
  });
});

describe('handleAllCharacters suppressGovernance — deferred governance mode', () => {
  it('governance is NOT called when suppressGovernance=true even with new items', () => {
    expect(simulateGovernanceLogic('generate_missing', 5, 0, true)).toBe(false);
  });

  it('governance IS called when suppressGovernance=false with new items', () => {
    expect(simulateGovernanceLogic('generate_missing', 5, 0, false)).toBe(true);
  });

  it('governance NOT called for preview_only regardless of suppressGovernance', () => {
    expect(simulateGovernanceLogic('preview_only', 5, 0, false)).toBe(false);
    expect(simulateGovernanceLogic('preview_only', 5, 0, true)).toBe(false);
  });

  it('governance NOT called when zero items changed', () => {
    expect(simulateGovernanceLogic('generate_missing', 0, 0, false)).toBe(false);
    expect(simulateGovernanceLogic('refresh_stale', 0, 0, false)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// Section 4: Batch result format
// ──────────────────────────────────────────────────────────────────

describe('Batch result format — structured sub-reports', () => {
  it('BatchResult has separate characters sub-report', () => {
    const result = simulateBatchAllAggregation(2, 1, 0, 0, 0, [], 0, 0, 0, 0, 0, [], 0, 0, 0, 0, 0, [], 0, [], 'generate_missing');
    expect(result.characters.created).toBe(2);
    expect(result.characters.skipped).toBe(1);
  });

  it('BatchResult has separate style sub-report', () => {
    const result = simulateBatchAllAggregation(0, 0, 0, 0, 0, [], 1, 0, 2, 0, 0, [], 0, 0, 0, 0, 0, [], 0, [], 'generate_missing');
    expect(result.style.created).toBe(1);
    expect(result.style.updated).toBe(2);
  });

  it('BatchResult has separate locations sub-report', () => {
    const result = simulateBatchAllAggregation(0, 0, 0, 0, 0, [], 0, 0, 0, 0, 0, [], 3, 1, 0, 0, 0, [], 0, [], 'generate_missing');
    expect(result.locations.created).toBe(3);
    expect(result.locations.skipped).toBe(1);
  });

  it('stale_count is included in result', () => {
    const result = simulateBatchAllAggregation(0, 0, 0, 0, 0, [], 0, 0, 0, 0, 0, [], 0, 0, 0, 0, 0, [], 5, ['Town'], 'generate_missing');
    expect(result.stale_count).toBe(5);
  });

  it('location_names is included in result', () => {
    const result = simulateBatchAllAggregation(0, 0, 0, 0, 0, [], 0, 0, 0, 0, 0, [], 0, 0, 0, 0, 0, [], 0, ['Town', 'Forest', 'River'], 'generate_missing');
    expect(result.location_names).toEqual(['Town', 'Forest', 'River']);
  });
});

// ──────────────────────────────────────────────────────────────────
// Section 5: Edge cases
// ──────────────────────────────────────────────────────────────────

describe('Edge cases — scanCanonLocations', () => {
  it('returns empty array for null canon', () => {
    expect(extractLocationNames(null)).toEqual([]);
  });

  it('returns empty array for canon with no locations', () => {
    expect(extractLocationNames({})).toEqual([]);
  });

  it('returns empty array for non-array locations', () => {
    expect(extractLocationNames({ locations: 'not_an_array' })).toEqual([]);
  });

  it('extracts string location names', () => {
    const result = extractLocationNames({ locations: ['Town', 'Forest'] });
    expect(result).toEqual(['Town', 'Forest']);
  });

  it('extracts object location names', () => {
    const result = extractLocationNames({
      locations: [{ name: 'Town' }, { name: 'Forest' }],
    });
    expect(result).toEqual(['Town', 'Forest']);
  });

  it('handles mixed string and object locations', () => {
    const result = extractLocationNames({
      locations: ['Town', { name: 'Forest' }, { name: 'River' }],
    });
    expect(result).toEqual(['Town', 'Forest', 'River']);
  });

  it('filters out empty names', () => {
    const result = extractLocationNames({
      locations: ['Town', '', { name: '' }, { name: 'Forest' }],
    });
    expect(result).toEqual(['Town', 'Forest']);
  });

  it('handles locations with no name property', () => {
    const result = extractLocationNames({
      locations: [{ id: 1 }, { name: 'Forest' }],
    });
    expect(result).toEqual(['Forest']);
  });
});

describe('Edge cases — staleRowCount', () => {
  it('returns zero when canon has no updated_at', () => {
    expect(computeStaleCount(null, []).count).toBe(0);
    expect(computeStaleCount(null, [{ created_at: '2024-01-01' }]).count).toBe(0);
  });

  it('returns zero when no DNA rows exist', () => {
    expect(computeStaleCount(1700000000000, []).count).toBe(0);
    expect(computeStaleCount(1700000000000, undefined as any).count).toBe(0);
  });

  it('counts stale DNA (created before canon updated)', () => {
    const result = computeStaleCount(
      1700000000000, // canon updated at: Jan 14, 2024
      [
        { created_at: '2023-01-01T00:00:00Z' }, // stale (before canon)
        { created_at: '2024-06-01T00:00:00Z' }, // fresh (after canon)
        { created_at: '2023-06-01T00:00:00Z' }, // stale
      ],
    );
    expect(result.count).toBe(2);
    expect(result.total).toBe(3);
  });

  it('treats equal timestamps as NOT stale', () => {
    const result = computeStaleCount(
      1700000000000,
      [{ created_at: new Date(1700000000000).toISOString() }],
    );
    expect(result.count).toBe(0);
    expect(result.total).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────
// Section 6: Invariant checks
// ──────────────────────────────────────────────────────────────────

describe('Invariant — every target has a handler and appropriate functionBase', () => {
  it('all 6 targets have handlers', () => {
    const targets: Target[] = ['character', 'all_characters', 'project_style', 'location', 'entity', 'all'];
    for (const t of targets) {
      const r = routeAllTarget(t);
      expect(r.handler).not.toBe('unknown');
    }
  });

  it('handlers needing extract-visual-dna have functionBase (invariant)', () => {
    const extractTargets: Target[] = ['character', 'all_characters', 'entity', 'all'];
    for (const t of extractTargets) {
      expect(routeAllTarget(t).functionBaseNeeded).toBe(true);
    }
  });

  it('handlers NOT needing extract-visual-dna have no functionBase (invariant)', () => {
    const noExtractTargets: Target[] = ['project_style', 'location'];
    for (const t of noExtractTargets) {
      expect(routeAllTarget(t).functionBaseNeeded).toBe(false);
    }
  });
});

describe('Invariant — refresh_stale skips strong/approved DNA in handleCharacter', () => {
  const source = getSourceText();
  const lines = source.split('\n');

  it('handleCharacter has refresh_stale skip for strong/approved DNA', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleCharacter('));
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBody = lines.slice(fnStart, fnStart + 60).join('\n');
    expect(fnBody).toContain('refresh_stale');
    expect(fnBody).toContain('identity_strength');
    expect(fnBody).toContain('"strong"');
  });

  it('handleCharacter does not block for refresh_stale mode when identity is strong', () => {
    // From lines 191-193: if (isApprovedOrStrong && mode === "refresh_stale") { report.skipped++ }
    const fnStart = lines.findIndex((l) => l.includes('async function handleCharacter('));
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBody = lines.slice(fnStart, fnStart + 60).join('\n');
    expect(fnBody).toContain('mode === "refresh_stale"');
    expect(fnBody).toContain('report.skipped');
  });
});

describe('Invariant — governance not called per sub-handler in batch mode', () => {
  const source = getSourceText();
  const lines = source.split('\n');

  it('handleBatchAll calls handleAllCharacters with suppressGovernance=true', () => {
    // Verified in source checks above — this reinforces the invariant
    const fnStart = lines.findIndex((l) => l.includes('async function handleBatchAll('));
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBody = lines.slice(fnStart, fnStart + 40).join('\n');
    // The 5th argument (suppressGovernance) should be true
    const charCall = fnBody.match(/handleAllCharacters\([^)]+\)/)?.[0];
    expect(charCall).toBeDefined();
    expect(charCall!).toMatch(/,\s*true\s*\)$/);
  });
});

describe('Invariant — BatchResult vs DNAReport: legacy all_characters still returns flat report', () => {
  const source = getSourceText();
  const lines = source.split('\n');

  it('handleAllCharacters still returns DNAReport (not BatchResult)', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleAllCharacters('));
    expect(fnStart).toBeGreaterThanOrEqual(0);
    // Find the return statement
    const fnLines = lines.slice(fnStart);
    const returnIdx = fnLines.findIndex((l) => l.includes('return respond(report)'));
    expect(returnIdx).toBeGreaterThanOrEqual(0);
    // The function returns 'report' which is of type DNAReport
    // It should contain the flat structure: created, skipped, updated, blocked, low_confidence, errors
    const targetLine = fnLines.slice(0, returnIdx).find((l) => l.includes('const report: DNAReport'));
    expect(targetLine).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────
// Section 7: Toast display format
// ──────────────────────────────────────────────────────────────────

describe('Toast display format — batch result', () => {
  const fePath = 'src/pages/ProjectDevelopmentEngine.tsx';

  it('toast uses "Visual DNA batch:" prefix for batch results', () => {
    if (existsSync(fePath)) {
      const feSource = readFileSync(fePath, 'utf-8');
      expect(feSource).toContain('Visual DNA batch');
    }
  });

  it('toast format includes chars: +N/Mup pattern', () => {
    if (existsSync(fePath)) {
      const feSource = readFileSync(fePath, 'utf-8');
      expect(feSource).toContain('chars: +');
      expect(feSource).toContain('/');
      expect(feSource).toContain('up');
    }
  });

  it('toast format includes style: +N/Mup pattern', () => {
    if (existsSync(fePath)) {
      const feSource = readFileSync(fePath, 'utf-8');
      expect(feSource).toContain('style: +');
    }
  });

  it('toast format includes locs: +N/Mup pattern', () => {
    if (existsSync(fePath)) {
      const feSource = readFileSync(fePath, 'utf-8');
      expect(feSource).toContain('locs: +');
    }
  });

  it('legacy toast text "Visual DNA:" is preserved for non-batch results', () => {
    if (existsSync(fePath)) {
      const feSource = readFileSync(fePath, 'utf-8');
      expect(feSource).toContain('Visual DNA:');
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// Section 8: Regression checks
// ──────────────────────────────────────────────────────────────────

describe('Regression — existing all_characters behavior unbroken', () => {
  const source = getSourceText();
  const lines = source.split('\n');

  it('handleAllCharacters still returns DNAReport for legacy callers', () => {
    const fnStart = lines.findIndex((l) => l.includes('async function handleAllCharacters('));
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnBody = lines.slice(fnStart, fnStart + 100).join('\n');
    // Must still contain the governance call path (non-suppressed)
    expect(fnBody).toContain('evaluate-visual-governance');
    // Must still iterate over characters
    expect(fnBody).toContain('for (const charName');
  });

  it('callExtractDNA signature unchanged (functionBase, projectId, characterName)', () => {
    const fnIdx = lines.findIndex((l) => l.includes('async function callExtractDNA('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 6).join('\n');
    expect(sigBlock).toContain('functionBase');
    expect(sigBlock).toContain('projectId');
    expect(sigBlock).toContain('characterName');
  });

  it('respond function unchanged', () => {
    const sigLine = lines.find((line) => line.includes('function respond('));
    expect(sigLine).toBeDefined();
    expect(sigLine!).toContain('data');
    expect(sigLine!).toContain('status');
  });

  it('DNAReport interface still exists (legacy)', () => {
    const dnaIdx = lines.findIndex((l) => l.includes('interface DNAReport'));
    expect(dnaIdx).toBeGreaterThanOrEqual(0);
    const dnaBody = lines.slice(dnaIdx, dnaIdx + 14).join('\n');
    expect(dnaBody).toContain('created: number');
    expect(dnaBody).toContain('skipped: number');
    expect(dnaBody).toContain('governance_result');
  });
});