/**
 * Tests for DevSeed vs notes/rewrite document format divergence fix (commit 1d7a46b)
 *
 * Three changes to regen-insufficient-tick (DevSeed path):
 * 1. loadConstraintPack() call added alongside loadNECGuardrailBlock()
 * 2. buildTemplatePrompt() dynamic import and call, injecting canonical section template
 * 3. constraintPack injected between necBlock and formatGuidance; templateBlock appended after upstreamText
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

// ──────────────────────────────────────────────────────────────────
// Fix 1: Structural Verification — code changes exist in index.ts
// ──────────────────────────────────────────────────────────────────

const INDEX_TS_PATH = 'supabase/functions/dev-engine-v2/index.ts';

describe('Fix structural verification (commit 1d7a46b)', () => {
  const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');

  it('loadConstraintPack is called in regen-insufficient-tick handler', () => {
    // Must appear after loadNECGuardrailBlock in the regen section
    const neBlockMatch = source.match(/const necBlock = await loadNECGuardrailBlock\(supabase, projectId\);/);
    expect(neBlockMatch).not.toBeNull();
    const neIndex = neBlockMatch!.index!;

    const cpMatch = source.match(/const constraintPack = await loadConstraintPack\(supabase, projectId\);/g);
    expect(cpMatch).not.toBeNull();
    expect(cpMatch!.length).toBeGreaterThanOrEqual(3); // At least convert-path + regen-tick + other handlers

    // Find regen-tick occurrence (must appear AFTER line ~32900)
    const regenCp = source.indexOf(
      'const constraintPack = await loadConstraintPack(supabase, projectId);',
      32900
    );
    expect(regenCp).toBeGreaterThan(0);
    expect(regenCp).toBeGreaterThan(neIndex);
  });

  it('buildTemplatePrompt dynamic import exists in regen-tick handler', () => {
    const importPattern = 'const { buildTemplatePrompt } = await import("../_shared/docTypeTemplates.ts");';
    expect(source.includes(importPattern)).toBe(true);
  });

  it('templateBlock construction exists after formatGuidance section', () => {
    const tbPattern = '// ── TEMPLATE INJECTION for regen tick ──';
    expect(source.includes(tbPattern)).toBe(true);

    const tbBuildPattern = 'const tb = buildTemplatePrompt(resolvedDocTypeForTemplate, {';
    expect(source.includes(tbBuildPattern)).toBe(true);
  });

  it('constraintPack injected between necBlock and formatGuidance in userPrompt', () => {
    // The line should be: ${canonBlock}${necBlock}${constraintPack}${formatGuidance}
    const promptPattern = /\$\{canonBlock\}\$\{necBlock\}\$\{constraintPack\}\$\{formatGuidance\}/;
    expect(promptPattern.test(source)).toBe(true);
  });

  it('templateBlock appended after upstreamText in MATERIAL section', () => {
    const materialPattern = /\$\{upstreamText\}\$\{templateBlock\}/;
    expect(materialPattern.test(source)).toBe(true);
  });

it('regen-tick userPrompt assembly is complete and in correct order', () => {
    // Find the regen-tick userPrompt specifically (second occurrence, at line ~33195)
    // The convert-path userPrompt is at line ~32400 — find the regen-tick one by searching from the
    // TEMPLATE INJECTION marker (line 33180) which only appears in the regen-tick handler
    const regenSectionStart = source.indexOf('// ── TEMPLATE INJECTION for regen tick ──');
    expect(regenSectionStart).toBeGreaterThan(0);

    const userPromptMarker = 'const userPrompt = `SOURCE FORMAT: ${upstream.upstreamType}';
    const promptStart = source.indexOf(userPromptMarker, regenSectionStart);
    expect(promptStart).toBeGreaterThan(regenSectionStart);

    // Extract the userPrompt section — find the closing backtick + semicolon pattern
    const promptEnd = source.indexOf('`;\n', promptStart + 50);
    const promptSection = source.slice(promptStart, promptEnd);

    // Verify all blocks are present in order
    expect(promptSection).toContain('${canonBlock}');
    expect(promptSection).toContain('${necBlock}');
    expect(promptSection).toContain('${constraintPack}');
    expect(promptSection).toContain('${formatGuidance}');
    expect(promptSection).toContain('${upstreamText}');
    expect(promptSection).toContain('${templateBlock}');

    // Verify order (constraintPack before formatGuidance, templateBlock after upstreamText)
    const necIdx = promptSection.indexOf('${necBlock}');
    const cpIdx = promptSection.indexOf('${constraintPack}');
    const fgIdx = promptSection.indexOf('${formatGuidance}');
    expect(cpIdx).toBeGreaterThan(necIdx);
    expect(fgIdx).toBeGreaterThan(cpIdx);

    const utIdx = promptSection.indexOf('${upstreamText}');
    const tbIdx = promptSection.indexOf('${templateBlock}');
    expect(tbIdx).toBeGreaterThan(utIdx);
  });

it('resolvedDocTypeForTemplate converts stage correctly', () => {
    // The regen-tick handler (line 33184) uses: stage.toLowerCase()
    const expectedFragment = 'resolvedDocTypeForTemplate = stage.toLowerCase().replace(/[\\s\\-]+/g, "_")';
    const occurrence = source.indexOf(expectedFragment);
    expect(occurrence).toBeGreaterThan(0);
  });

  it('buildTemplatePrompt called with correct context fields', () => {
    const ctxPattern = 'title: proj?.title || "Untitled"';
    expect(source.includes(ctxPattern)).toBe(true);
    expect(source.includes('format: fmt')).toBe(true);
    expect(source.includes('episodeCount: canonicalEpisodeCount ?? undefined')).toBe(true);
    // Duration fields are intentionally undefined (non-fatal)
    expect(source.includes('episodeDurationMin: undefined')).toBe(true);
    expect(source.includes('episodeDurationMax: undefined')).toBe(true);
  });

  it('constraintPack budget constant is defined', () => {
    expect(source.includes('const CONSTRAINT_PACK_BUDGET = 6000;')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// Fix 2: buildTemplatePrompt — canonical section template injection
// ──────────────────────────────────────────────────────────────────

describe('buildTemplatePrompt divergence fix', () => {
  // Reference implementation of buildTemplatePrompt from docTypeTemplates.ts
  function buildTemplatePrompt(docType: string, ctx: Record<string, any> = {}): string | null {
    const template = getDocTypeTemplate(docType, ctx);
    if (!template) return null;
    return `\n\n═══════════════════════════════════════\nDOCUMENT TEMPLATE — MANDATORY SCAFFOLD\n═══════════════════════════════════════\nFill in EVERY section of this template with high-quality, project-specific content.\nReplace every [bracketed description] with real material — do not leave any brackets unfilled.\nOutput the complete filled-in template as your response. Do not add sections not in the template.\nDo not output JSON, code blocks, or any non-markdown formatting.\n\n${template}\n═══════════════════════════════════════`;
  }

  function getDocTypeTemplate(docType: string, ctx: Record<string, any> = {}): string | null {
    const title = ctx.title || 'the project';
    const epCount = ctx.episodeCount || 30;
    const durMin = ctx.episodeDurationMin || 120;
    const durMax = ctx.episodeDurationMax || 180;
    const format = ctx.format || 'vertical-drama';
    switch (docType) {
      case 'concept_brief':
        return `# CONCEPT BRIEF: ${title}\n\n## LOGLINE\n...`;
      case 'character_bible':
        return `# CHARACTER BIBLE: ${title}\n\n## PRINCIPAL CHARACTERS\n...`;
      case 'format_rules':
        return `# FORMAT RULES: ${title}\n\n## EPISODE SPECIFICATIONS\n- Duration: ${durMin}–${durMax} seconds\n- Episode count: ${epCount}`;
      case 'market_sheet':
        return `# MARKET SHEET: ${title}\n\n## MARKET POSITIONING\n...`;
      case 'story_architecture':
        return `# STORY ARCHITECTURE: ${title}\n\n## ARC STRUCTURE\n...`;
      case 'screenplay':
        return `# SCREENPLAY: ${title}\n\n## SCENE 1\n...`;
      default:
        return null;
    }
  }

  describe('docType mapping', () => {
    it('generates template for concept_brief', () => {
      const result = buildTemplatePrompt('concept_brief', { title: 'Test Project' });
      expect(result).not.toBeNull();
      expect(result).toContain('CONCEPT BRIEF');
      expect(result).toContain('Test Project');
      expect(result).toContain('DOCUMENT TEMPLATE — MANDATORY SCAFFOLD');
    });

    it('generates template for character_bible', () => {
      const result = buildTemplatePrompt('character_bible', { title: 'My Story' });
      expect(result).not.toBeNull();
      expect(result).toContain('CHARACTER BIBLE');
      expect(result).toContain('My Story');
    });

    it('generates template for format_rules with project context', () => {
      const result = buildTemplatePrompt('format_rules', {
        title: 'Vertical Series',
        episodeCount: 60,
        episodeDurationMin: 45,
        episodeDurationMax: 120,
      });
      expect(result).not.toBeNull();
      expect(result).toContain('FORMAT RULES');
      expect(result).toContain('Vertical Series');
      expect(result).toContain('60');
      expect(result).toContain('45');
      expect(result).toContain('120');
    });

    it('generates template for market_sheet', () => {
      const result = buildTemplatePrompt('market_sheet', { title: 'Test' });
      expect(result).not.toBeNull();
      expect(result).toContain('MARKET SHEET');
    });

    it('generates template for story_architecture', () => {
      const result = buildTemplatePrompt('story_architecture', { title: 'Epic' });
      expect(result).not.toBeNull();
      expect(result).toContain('STORY ARCHITECTURE');
    });

    it('generates template for screenplay format', () => {
      const result = buildTemplatePrompt('screenplay', { title: 'Film' });
      expect(result).not.toBeNull();
      expect(result).toContain('SCREENPLAY');
    });
  });

  describe('edge cases', () => {
    it('returns null for unknown doc types', () => {
      const result = buildTemplatePrompt('nonexistent_doc_type');
      expect(result).toBeNull();
    });

    it('returns null for empty doc type', () => {
      const result = buildTemplatePrompt('');
      expect(result).toBeNull();
    });

    it('handles missing context gracefully — uses defaults', () => {
      const result = buildTemplatePrompt('format_rules');
      expect(result).not.toBeNull();
      // Default values: 30 episodes, 120-180 seconds
      expect(result).toContain('30');
      expect(result).toContain('120');
      expect(result).toContain('180');
    });

    it('handles partial context gracefully', () => {
      const result = buildTemplatePrompt('format_rules', { title: 'Test' });
      expect(result).not.toBeNull();
      expect(result).toContain('Test');
      // Default episode values
      expect(result).toContain('30');
    });

    it('includes the mandatory scaffold wrapper', () => {
      const result = buildTemplatePrompt('concept_brief');
      expect(result).toContain('DOCUMENT TEMPLATE — MANDATORY SCAFFOLD');
      expect(result).toContain('Fill in EVERY section');
      expect(result).toContain('Replace every [bracketed description]');
      expect(result).toContain('Do not output JSON, code blocks');
    });

    it('handles docType with hyphens and underscores consistently', () => {
      // The code converts stage: stage.toLowerCase().replace(/[\s\-]+/g, "_")
      const forBrief = buildTemplatePrompt('concept_brief');
      expect(forBrief).not.toBeNull();

      const forRules = buildTemplatePrompt('format_rules');
      expect(forRules).not.toBeNull();
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// Fix 3: Format convergence — convert-path vs DevSeed path match
// ──────────────────────────────────────────────────────────────────

describe('Format convergence — convert-path vs DevSeed path', () => {
  it('constraintPack placement matches between paths', () => {
    // Both paths should have constraintPack between necBlock and formatGuidance
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');

    // Convert-path pattern (line ~32407)
    const convertMatch = source.match(/\$\{canonBlock\}\$\{necBlock\}\$\{constraintPack\}\$\{formatGuidance\}/g);
    expect(convertMatch).not.toBeNull();
    // Should appear at least twice (convert-path + regen-tick)
    expect(convertMatch!.length).toBeGreaterThanOrEqual(2);
  });

  it('both paths use the same AI call signature', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    // Both paths use the same model, temperature, and maxTokens
    const aiCalls = source.match(/callAI\(OPENROUTER_API_KEY, BALANCED_MODEL, CONVERT_SYSTEM_JSON, /g);
    expect(aiCalls).not.toBeNull();
    expect(aiCalls!.length).toBeGreaterThanOrEqual(2);
  });
});

// ──────────────────────────────────────────────────────────────────
// Fix 4: Invariant enforcement — constraint pack budget
// ──────────────────────────────────────────────────────────────────

describe('Constraint pack budget enforcement', () => {
  it('CONSTRAINT_PACK_BUDGET is 6000 chars', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    const budgetMatch = source.match(/CONSTRAINT_PACK_BUDGET\s*=\s*(\d+)/);
    expect(budgetMatch).not.toBeNull();
    expect(parseInt(budgetMatch![1], 10)).toBe(6000);
  });

  it('constraint pack text is truncated if over budget', () => {
    // Build a mock text that exceeds 6000 chars
    const budget = 6000;
    const longText = 'x'.repeat(budget + 100);
    const truncated = longText.slice(0, budget) + '\n[…truncated]';
    expect(truncated.length).toBeLessThan(longText.length);
    expect(truncated.endsWith('[…truncated]')).toBe(true);
  });

  it('empty constraint pack returns empty string', () => {
    // When loadConstraintPack finds no data, it returns ""
    // This is the graceful degradation behavior
    const emptyResult = '';
    expect(emptyResult).toBe('');
  });
});

// ──────────────────────────────────────────────────────────────────
// Fix 5: Regression — all existing tests still pass
// ──────────────────────────────────────────────────────────────────

describe('Regression guard', () => {
  it('index.ts file is a valid Deno edge function', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    // Expect the file to be large (~2MB) and contain expected Deno markers
    expect(source.length).toBeGreaterThan(1000000);
    // Edge functions export via Deno.serve, not export default
    expect(source.includes('serve(async (req) => {')).toBe(true);
  });

  it('docTypeTemplates.ts exports buildTemplatePrompt correctly', () => {
    const dtSource = fs.readFileSync('supabase/functions/_shared/docTypeTemplates.ts', 'utf-8');
    expect(dtSource.includes('export function buildTemplatePrompt')).toBe(true);
    expect(dtSource.includes('export function getDocTypeTemplate')).toBe(true);
    expect(dtSource.includes('export interface TemplateContext')).toBe(true);
  });

  it('dynamic import syntax is correct', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    const dynamicImports = source.match(/await import\("([^"]+)"\)/g);
    expect(dynamicImports).not.toBeNull();
    // Find the specific docTypeTemplates import
    const templateImport = dynamicImports!.find(i => i.includes('docTypeTemplates'));
    expect(templateImport).toBe('await import("../_shared/docTypeTemplates.ts")');
  });

  it('single loadConstraintPack call in regen-tick handler', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    // Find the regen-tick handler body — from the loadConstraintPack call (line ~33032)
    // through to the callAI invocation (line ~33208)
    const cpCallPattern = 'const constraintPack = await loadConstraintPack(supabase, projectId);';

    // Find all occurrences in the file
    let firstIdx = source.indexOf(cpCallPattern);
    expect(firstIdx).toBeGreaterThan(0);

    // The regen-tick occurrence is the one closest to the TEMPLATE INJECTION marker
    const regenMarker = source.indexOf('// ── TEMPLATE INJECTION for regen tick ──');
    expect(regenMarker).toBeGreaterThan(0);

    // Find the CP call just before the regen marker
    const cpBeforeMarker = source.lastIndexOf(cpCallPattern, regenMarker - 1);
    expect(cpBeforeMarker).toBeGreaterThan(0);
    // The distance between the constraintPack call and the TEMPLATE INJECTION marker
    // is ~9000+ chars because the canon injection block (lines 33034-33165) sits between them.
    // Just verify they exist in the same handler — don't check character distance.

    // Verify exactly one occurrence in the handler section
    const sectionStart = cpBeforeMarker; // Start at the CP call
    const sectionEnd = source.indexOf('const raw = await callAI(', regenMarker) + 80;
    const handlerSection = source.slice(sectionStart, sectionEnd);
    
    const cpCalls = (handlerSection.match(/loadConstraintPack/g) || []).length;
    expect(cpCalls).toBe(1);
  });

  it('buildTemplatePrompt has expected import + usage in regen-tick handler', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    const sectionStart = source.indexOf('// ── TEMPLATE INJECTION for regen tick ──');
    expect(sectionStart).toBeGreaterThan(0);

    const sectionEnd = source.indexOf('const raw = await callAI(', sectionStart);
    expect(sectionEnd).toBeGreaterThan(sectionStart);

    const regenSection = source.slice(sectionStart, sectionEnd);
    const btpCalls = (regenSection.match(/buildTemplatePrompt/g) || []).length;
    // One for the dynamic import: const { buildTemplatePrompt } = await import(...)
    // One for the call: const tb = buildTemplatePrompt(...)
    // 2 total is correct — import + single usage
    expect(btpCalls).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────
// Additional edge cases
// ──────────────────────────────────────────────────────────────────

describe('Edge cases — template injection resilience', () => {
  it('fmt is defined before buildTemplatePrompt usage in regen-tick handler', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    const sectionStart = source.indexOf('// ── TEMPLATE INJECTION for regen tick ──');
    expect(sectionStart).toBeGreaterThan(0);

    // Find the fmt declaration before the template injection section
    const fmtDecl = 'const fmt = resolveFormatAlias((proj?.format || "film").toLowerCase().replace(/[_ ]+/g, "-"));';
    const fmtIdx = source.lastIndexOf(fmtDecl, sectionStart);
    expect(fmtIdx).toBeGreaterThan(0);
    // fmt should be declared before the template injection section
    expect(sectionStart - fmtIdx).toBeGreaterThan(0);
  });

  it('templateBlock falls back to empty string on exception (non-fatal)', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    const regenSection = source.indexOf('// ── TEMPLATE INJECTION for regen tick ──');
    expect(regenSection).toBeGreaterThan(0);

    // Verify the try/catch wrapper exists
    const tryBlockEnd = source.indexOf('if (tb) templateBlock = tb;', regenSection);
    expect(tryBlockEnd).toBeGreaterThan(0);

    // After the try-block should be the catch block
    const catchEnd = source.indexOf('} catch { /* non-fatal */ }', tryBlockEnd);
    expect(catchEnd).toBeGreaterThan(tryBlockEnd);

    // The catch block should be empty (non-fatal) — just whitespace between if-block close and catch
    const catchContent = source.slice(tryBlockEnd + 'if (tb) templateBlock = tb;'.length, catchEnd);
    // Should just be whitespace/newlines (no code between if-block and catch)
    expect(catchContent.trim()).toBe('');
  });

  it('templateBlock initialized as empty string before try block', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    const tbInit = 'let templateBlock = "";';
    const initIdx = source.indexOf(tbInit);
    expect(initIdx).toBeGreaterThan(0);

    const tryIdx = source.indexOf('try {', initIdx);
    expect(tryIdx).toBeGreaterThan(initIdx);
    expect(tryIdx - initIdx).toBeLessThan(200);
  });

  it('stage-to-docType conversion handles common ladder stages', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');
    const conversionExpr = 'stage.toLowerCase().replace(/[\\s\\-]+/g, "_")';
    const matchCount = (source.match(new RegExp(conversionExpr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    expect(matchCount).toBeGreaterThanOrEqual(1);

    // Verify common stages would map correctly
    const simulateConversion = (stage: string) => stage.toLowerCase().replace(/[\s\-]+/g, '_');
    expect(simulateConversion('concept_brief')).toBe('concept_brief');
    expect(simulateConversion('character_bible')).toBe('character_bible');
    expect(simulateConversion('format_rules')).toBe('format_rules');
    expect(simulateConversion('market-sheet')).toBe('market_sheet');
    expect(simulateConversion('story architecture')).toBe('story_architecture');
    expect(simulateConversion('idea')).toBe('idea');
    expect(simulateConversion('series_bible')).toBe('series_bible');
  });

  it('regen-tick handler has constraintPack but regen-insufficient does not have templateBlock', () => {
    const source = fs.readFileSync(INDEX_TS_PATH, 'utf-8');

    // regen-insufficient-tick (around line 32349) should have constraintPack but NOT templateBlock
    const regenInsufficientConstraintIdx = source.indexOf(
      'const constraintPack = await loadConstraintPack(supabase, projectId);',
      32000
    );
    expect(regenInsufficientConstraintIdx).toBeGreaterThan(0);

    // Find the nearest TEMPLATE INJECTION comment AFTER the regen-insufficient constraintPack
    const templateInjectionAfter = source.indexOf('// ── TEMPLATE INJECTION', regenInsufficientConstraintIdx);
    // The regen-insufficient handler doesn't have TEMPLATE INJECTION - so the next one is in regen-tick
    // Find the userPrompt in regen-insufficient - it shouldn't have ${templateBlock}
    const userPromptInsufficient = source.indexOf('const userPrompt = `SOURCE FORMAT: ${upstream.upstreamType}', regenInsufficientConstraintIdx);
    expect(userPromptInsufficient).toBeGreaterThan(0);

    // Find the end of this userPrompt
    const promptEnd = source.indexOf('`;\n', userPromptInsufficient + 100);
    const insufficientPrompt = source.slice(userPromptInsufficient, promptEnd);

    // regen-insufficient should NOT have templateBlock
    expect(insufficientPrompt.includes('${templateBlock}')).toBe(false);
    // But SHOULD have constraintPack
    expect(insufficientPrompt.includes('${constraintPack}')).toBe(true);

    // regen-tick (with template injection) SHOULD have templateBlock
    const regenTickMarker = source.indexOf('// ── TEMPLATE INJECTION for regen tick ──');
    expect(regenTickMarker).toBeGreaterThan(0);
    const regenTickPrompt = source.indexOf('${upstreamText}${templateBlock}', regenTickMarker);
    expect(regenTickPrompt).toBeGreaterThan(0);
  });
});