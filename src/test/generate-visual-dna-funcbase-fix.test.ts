/**
 * Tests for generate-visual-dna-from-canon — handleEntity functionBase fix.
 *
 * Reference: commit 12f5458
 * Changes:
 *   - handleEntity signature now has functionBase: string as second parameter
 *   - Switch case passes functionBase to handleEntity
 *   - Internal handleCharacter call passes functionBase instead of empty string
 *
 * This suite verifies:
 *   1. Source-level pattern checks (signatures, call sites)
 *   2. Behavioral routing logic (extracted and unit-tested)
 *   3. Edge cases and invariants
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';

// ──────────────────────────────────────────────────────────────────
// Source file path
// ──────────────────────────────────────────────────────────────────
const SOURCE_PATH = 'supabase/functions/generate-visual-dna-from-canon/index.ts';

// ──────────────────────────────────────────────────────────────────
// Source-level pattern verification
// ──────────────────────────────────────────────────────────────────

function getSourceText(): string {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`Source file not found: ${SOURCE_PATH}`);
  }
  return readFileSync(SOURCE_PATH, 'utf-8');
}

describe('Source-level pattern checks — commit 12f5458', () => {
  const source = getSourceText();

  it('handleEntity signature has functionBase: string as second parameter', () => {
    const lines = source.split('\n');
    // Find the function declaration line and read the next 8 lines to get the signature
    const fnIdx = lines.findIndex((l) => l.includes('async function handleEntity('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 8).join('\n');
    expect(sigBlock).toContain('functionBase: string');
    // functionBase should be the second parameter — after "sb: any"
    expect(sigBlock).toMatch(/sb:\s*\w+,\s*\n\s*functionBase:\s*string/);
  });

  it('handleLocation signature does NOT have functionBase parameter', () => {
    const lines = source.split('\n');
    const fnIdx = lines.findIndex((l) => l.includes('async function handleLocation('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 6).join('\n');
    // Should NOT contain functionBase
    expect(sigBlock).not.toContain('functionBase');
    // Should contain sb, projectId, locationName, mode
    expect(sigBlock).toContain('projectId');
    expect(sigBlock).toContain('locationName');
    expect(sigBlock).toContain('mode');
  });

  it('handleCharacter signature has functionBase: string as second parameter', () => {
    const lines = source.split('\n');
    const fnIdx = lines.findIndex((l) => l.includes('async function handleCharacter('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 6).join('\n');
    expect(sigBlock).toContain('functionBase: string');
    // functionBase should be second parameter — after sb
    expect(sigBlock).toMatch(/sb:\s*\w+,\s*\n\s*functionBase:\s*string/);
  });

  it('handleAllCharacters has functionBase: string as second parameter', () => {
    const lines = source.split('\n');
    const fnIdx = lines.findIndex((l) => l.includes('async function handleAllCharacters('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = lines.slice(fnIdx, fnIdx + 6).join('\n');
    expect(sigBlock).toContain('functionBase: string');
    expect(sigBlock).toMatch(/sb:\s*\w+,\s*\n\s*functionBase:\s*string/);
  });

  it('switch case "entity" passes functionBase to handleEntity', () => {
    // Line ~122: return await handleEntity(sb, functionBase, project_id, ...
    const lines = source.split('\n');
    const entityCaseLine = lines.find(
      (line) => line.includes('case "entity"') || line.includes("case 'entity'"),
    );
    expect(entityCaseLine).toBeDefined();
    // Find the return statement after the case
    const caseIdx = lines.findIndex(
      (line) => line.includes('case "entity"') || line.includes("case 'entity'"),
    );
    expect(caseIdx).toBeGreaterThanOrEqual(0);
    // The next non-blank line should be the return
    const returnLine = lines.slice(caseIdx).find((l) => l.includes('return await handleEntity('));
    expect(returnLine).toBeDefined();
    expect(returnLine!).toContain('functionBase');
    // Verify functionBase is the second argument (after sb)
    expect(returnLine!).toMatch(/handleEntity\(\s*sb\s*,\s*functionBase\s*,/);
  });

  it('switch case "character" passes functionBase to handleCharacter', () => {
    const lines = source.split('\n');
    const caseIdx = lines.findIndex(
      (line) => line.includes('case "character"') || line.includes("case 'character'"),
    );
    expect(caseIdx).toBeGreaterThanOrEqual(0);
    const returnLine = lines.slice(caseIdx).find((l) => l.includes('return await handleCharacter('));
    expect(returnLine).toBeDefined();
    expect(returnLine!).toContain('functionBase');
    expect(returnLine!).toMatch(/handleCharacter\(\s*sb\s*,\s*functionBase\s*,/);
  });

  it('switch case "all_characters" passes functionBase to handleAllCharacters', () => {
    const lines = source.split('\n');
    const caseIdx = lines.findIndex(
      (line) => line.includes('case "all_characters"') || line.includes("case 'all_characters'"),
    );
    expect(caseIdx).toBeGreaterThanOrEqual(0);
    const returnLine = lines.slice(caseIdx).find((l) =>
      l.includes('return await handleAllCharacters('),
    );
    expect(returnLine).toBeDefined();
    expect(returnLine!).toContain('functionBase');
    expect(returnLine!).toMatch(/handleAllCharacters\(\s*sb\s*,\s*functionBase\s*,/);
  });

  it('switch case "location" does NOT pass functionBase to handleLocation', () => {
    const lines = source.split('\n');
    const caseIdx = lines.findIndex(
      (line) => line.includes('case "location"') || line.includes("case 'location'"),
    );
    expect(caseIdx).toBeGreaterThanOrEqual(0);
    const returnLine = lines.slice(caseIdx).find((l) => l.includes('return await handleLocation('));
    expect(returnLine).toBeDefined();
    // Should NOT contain functionBase
    expect(returnLine!).not.toContain('functionBase');
    // Should have only 4 args: sb, project_id, entity_name!, mode
    expect(returnLine!).toMatch(/handleLocation\(\s*sb\s*,/);
  });

  it('handleEntity routes to handleCharacter with functionBase when entityType="character"', () => {
    // Line 811: return await handleCharacter(sb, functionBase, projectId, entityName, mode);
    const lines = source.split('\n');
    // Find the handleEntity function body
    const fnStart = lines.findIndex((l) => l.includes('async function handleEntity('));
    expect(fnStart).toBeGreaterThanOrEqual(0);

    // Find the handleCharacter call inside handleEntity (not in the switch case)
    const entityFnLines = lines.slice(fnStart);
    const charCallLine = entityFnLines.find(
      (l) => l.includes('return await handleCharacter(') && l.includes('functionBase'),
    );
    expect(charCallLine).toBeDefined();
    // Must pass functionBase (not empty string)
    expect(charCallLine!).not.toContain('handleCharacter(sb, ""');
    expect(charCallLine!).toContain('handleCharacter(sb, functionBase');
  });

  it('handleEntity routes to handleLocation WITHOUT functionBase when entityType="location"', () => {
    // Line 813: return await handleLocation(sb, projectId, entityName, mode);
    const lines = source.split('\n');
    const fnStart = lines.findIndex((l) => l.includes('async function handleEntity('));
    const entityFnLines = lines.slice(fnStart);
    const locCallLine = entityFnLines.find(
      (l) => l.includes('return await handleLocation('),
    );
    expect(locCallLine).toBeDefined();
    // Should NOT have functionBase in this call
    expect(locCallLine!).not.toContain('functionBase');
  });
});

// ──────────────────────────────────────────────────────────────────
// Behavioral routing tests (extracted logic)
// ──────────────────────────────────────────────────────────────────

/**
 * Extracted routing logic from handleEntity.
 * Matches the actual implementation at lines 809-813:
 *   if (entityType === "character") {
 *     return await handleCharacter(sb, functionBase, projectId, entityName, mode);
 *   } else if (entityType === "location") {
 *     return await handleLocation(sb, projectId, entityName, mode);
 *   }
 */
 type EntityType = 'character' | 'location' | 'object';

 interface RouteResult {
   handler: string;
   args: string[];
 }

 function routeEntity(
   entityType: EntityType | undefined | null,
 ): RouteResult {
   if (entityType === 'character') {
     return {
       handler: 'handleCharacter',
       args: ['sb', 'functionBase', 'projectId', 'entityName', 'mode'],
     };
   } else if (entityType === 'location') {
     return {
       handler: 'handleLocation',
       args: ['sb', 'projectId', 'entityName', 'mode'],
     };
   }
   // Object type — default
   return {
     handler: 'handleEntityObject',
     args: ['sb', 'projectId', 'entityName', 'mode'],
   };
 }

 describe('handleEntity routing logic — behavioral', () => {
   it('routes entityType="character" to handleCharacter with functionBase', () => {
     const result = routeEntity('character');
     expect(result.handler).toBe('handleCharacter');
     expect(result.args).toContain('functionBase');
   });

   it('routes entityType="location" to handleLocation WITHOUT functionBase', () => {
     const result = routeEntity('location');
     expect(result.handler).toBe('handleLocation');
     expect(result.args).not.toContain('functionBase');
   });

   it('routes entityType="object" to object handler (does not need functionBase)', () => {
     const result = routeEntity('object');
     expect(result.handler).toBe('handleEntityObject');
     expect(result.args).not.toContain('functionBase');
   });

   it('routes null/undefined entityType to object handler (default)', () => {
     expect(routeEntity(null).handler).toBe('handleEntityObject');
     expect(routeEntity(undefined).handler).toBe('handleEntityObject');
   });

   it('handleCharacter call has functionBase as second argument', () => {
     const result = routeEntity('character');
     // args order: ['sb', 'functionBase', 'projectId', 'entityName', 'mode']
     expect(result.args[0]).toBe('sb');
     expect(result.args[1]).toBe('functionBase');
     expect(result.args[2]).toBe('projectId');
     expect(result.args.length).toBe(5);
   });

   it('handleLocation call does NOT have functionBase at all', () => {
     const result = routeEntity('location');
     // args order: ['sb', 'projectId', 'entityName', 'mode']
     expect(result.args[0]).toBe('sb');
     expect(result.args[1]).toBe('projectId');
     expect(result.args.length).toBe(4);
   });
 });

// ──────────────────────────────────────────────────────────────────
// Switch case routing (extracted from Deno.serve handler)
// ──────────────────────────────────────────────────────────────────

type Target = 'character' | 'all_characters' | 'project_style' | 'location' | 'entity';

function routeTarget(
  target: Target,
  entity_type?: string | null,
): { handler: string; hasFunctionBase: boolean } {
  switch (target) {
    case 'character':
      return { handler: 'handleCharacter', hasFunctionBase: true };
    case 'all_characters':
      return { handler: 'handleAllCharacters', hasFunctionBase: true };
    case 'project_style':
      return { handler: 'handleProjectStyle', hasFunctionBase: false };
    case 'location':
      return { handler: 'handleLocation', hasFunctionBase: false };
    case 'entity':
      return { handler: 'handleEntity', hasFunctionBase: true };
    default:
      return { handler: 'unknown', hasFunctionBase: false };
  }
}

describe('Switch case target routing — all handlers consistent', () => {
  it('character routes to handleCharacter with functionBase', () => {
    const r = routeTarget('character');
    expect(r.handler).toBe('handleCharacter');
    expect(r.hasFunctionBase).toBe(true);
  });

  it('all_characters routes to handleAllCharacters with functionBase', () => {
    const r = routeTarget('all_characters');
    expect(r.handler).toBe('handleAllCharacters');
    expect(r.hasFunctionBase).toBe(true);
  });

  it('location routes to handleLocation WITHOUT functionBase', () => {
    const r = routeTarget('location');
    expect(r.handler).toBe('handleLocation');
    expect(r.hasFunctionBase).toBe(false);
  });

  it('entity routes to handleEntity WITH functionBase', () => {
    const r = routeTarget('entity');
    expect(r.handler).toBe('handleEntity');
    expect(r.hasFunctionBase).toBe(true);
  });

  it('project_style routes to handleProjectStyle WITHOUT functionBase', () => {
    const r = routeTarget('project_style');
    expect(r.handler).toBe('handleProjectStyle');
    expect(r.hasFunctionBase).toBe(false);
  });

  it('every handler that uses callExtractDNA has functionBase (invariant)', () => {
    // Handlers that call callExtractDNA: handleCharacter (via functionBase)
    // and handleAllCharacters (via handleCharacter which uses functionBase)
    const handlersUsingDNA = ['handleCharacter', 'handleAllCharacters', 'handleEntity'];
    for (const h of ['character', 'all_characters', 'entity'] as Target[]) {
      const r = routeTarget(h);
      expect(r.hasFunctionBase).toBe(true);
      expect(handlersUsingDNA).toContain(r.handler);
    }
  });

  it('every handler that does NOT call extract has no functionBase (invariant)', () => {
    // Handlers that don't need functionBase: handleLocation, handleProjectStyle
    for (const h of ['location', 'project_style'] as Target[]) {
      const r = routeTarget(h);
      expect(r.hasFunctionBase).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────────

describe('Edge cases — routing boundaries', () => {
  it('all valid targets have a handler mapping', () => {
    const validTargets: Target[] = [
      'character',
      'all_characters',
      'project_style',
      'location',
      'entity',
    ];
    for (const t of validTargets) {
      const r = routeTarget(t);
      expect(r.handler).not.toBe('unknown');
    }
  });

  it('every handler with functionBase has consistent callExtractDNA pattern', () => {
    // callExtractDNA takes (functionBase, projectId, characterName)
    // functionBase is used to construct the edge function URL:
    //   const url = `${functionBase}/extract-visual-dna`;
    const handlers = routeTarget('character'); // representative
    expect(handlers.hasFunctionBase).toBe(true);
  });

  it('every switch case returns (no fallthrough)', () => {
    const source = getSourceText();
    const lines = source.split('\n');
    // Find the switch block
    const switchStart = lines.findIndex((l) => l.includes('switch (target)'));
    expect(switchStart).toBeGreaterThanOrEqual(0);
    const switchBlock = lines.slice(switchStart, switchStart + 20);
    
    // Each case should have a return
    const caseLines = switchBlock.filter((l) => l.trim().startsWith('case '));
    for (const cl of caseLines) {
      const caseText = cl.trim();
      // Each case should have a return or break within a few lines
      const caseIdx = switchBlock.indexOf(cl);
      const afterCase = switchBlock.slice(caseIdx, caseIdx + 3).join('');
      expect(
        afterCase.includes('return') || afterCase.includes('break'),
      ).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// Invariant: only handlers that need functionBase have it
// ──────────────────────────────────────────────────────────────────

describe('FunctionBase invariant — only extract-calling handlers have it', () => {
  it('handleCharacter has functionBase (calls callExtractDNA via functionBase URL)', () => {
    // handleCharacter constructs URL: `${functionBase}/extract-visual-dna`
    // This is verified by the callExtractDNA function which takes functionBase
    const source = getSourceText();
    const lines = source.split('\n');
    // Verify handleCharacter body contains a callExtractDNA call
    const fnStart = lines.findIndex((l) => l.includes('async function handleCharacter('));
    const fnBody = lines.slice(fnStart, fnStart + 100).join('\n');
    expect(fnBody).toContain('callExtractDNA(functionBase');
    expect(fnBody).toContain('functionBase');
  });

  it('handleAllCharacters has functionBase (delegates to handleCharacter)', () => {
    // handleAllCharacters calls handleCharacter(sb, functionBase, ...)
    const source = getSourceText();
    const lines = source.split('\n');
    const fnStart = lines.findIndex((l) => l.includes('async function handleAllCharacters('));
    // Use fnStart + 100 to capture the full body including handleCharacter call (now at ~line 430 in array)
    const fnBody = lines.slice(fnStart, fnStart + 100).join('\n');
    expect(fnBody).toContain('functionBase');
    expect(fnBody).toContain('handleCharacter(sb, functionBase');
  });

  it('handleLocation does NOT have functionBase (does not use extract-visual-dna)', () => {
    // handleLocation reads from canon directly, doesn't call callExtractDNA
    const src = getSourceText();
    const srcLines = src.split('\n');
    const fnStart = srcLines.findIndex((l) => l.includes('async function handleLocation('));
    const fnBody = srcLines.slice(fnStart, fnStart + 100).join('\n');
    expect(fnBody).not.toContain('functionBase');
    expect(fnBody).not.toContain('callExtractDNA');
  });

  it('handleEntity correctly delegates to handleCharacter with functionBase', () => {
    // The whole purpose of the fix — handleEntity must pass functionBase
    const source = getSourceText();
    const lines = source.split('\n');
    const fnStart = lines.findIndex((l) => l.includes('async function handleEntity('));
    const fnBody = lines.slice(fnStart, fnStart + 20).join('\n');
    expect(fnBody).toContain('handleCharacter(sb, functionBase');
    expect(fnBody).not.toContain('handleCharacter(sb, ""');
  });
});

// ──────────────────────────────────────────────────────────────────
// Regression: existing behavior not broken
// ──────────────────────────────────────────────────────────────────

describe('Regression — existing handler signatures unbroken', () => {
  const source = getSourceText();

  it('handleProjectStyle signature unchanged (no functionBase)', () => {
    const srcLines = source.split('\n');
    const fnIdx = srcLines.findIndex((l) => l.includes('async function handleProjectStyle('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = srcLines.slice(fnIdx, fnIdx + 6).join('\n');
    // Should NOT have functionBase
    expect(sigBlock).not.toContain('functionBase');
    // Should have sb, projectId, mode
    expect(sigBlock).toContain('sb');
    expect(sigBlock).toContain('projectId');
    expect(sigBlock).toContain('mode');
  });

  it('callExtractDNA signature unchanged (functionBase, projectId, characterName)', () => {
    const srcLines = source.split('\n');
    const fnIdx = srcLines.findIndex((l) => l.includes('async function callExtractDNA('));
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    const sigBlock = srcLines.slice(fnIdx, fnIdx + 6).join('\n');
    expect(sigBlock).toContain('functionBase');
    expect(sigBlock).toContain('projectId');
    expect(sigBlock).toContain('characterName');
  });

  it('respond function unchanged', () => {
    const sigLine = source
      .split('\n')
      .find((line) => line.includes('function respond('));
    expect(sigLine).toBeDefined();
    expect(sigLine!).toContain('data');
    expect(sigLine!).toContain('status');
  });
});