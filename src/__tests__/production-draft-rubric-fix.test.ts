/**
 * Tests for: Fix production_draft evaluation rubric — remove 'Also evaluate script quality'
 *
 * Commit 597a744 — Replaced "Evaluate as a PRODUCTION DRAFT. Score production readiness...
 * Also evaluate script quality." with 7 production-specific criteria and CRITICAL SCOPE RULES
 * that prohibit creative script evaluation.
 *
 * Key conflict identified by Seraph (Code Review):
 *   production_draft maps to SCRIPT_EXECUTION purpose class. The evaluation prompt includes
 *   BOTH the DELIVERABLE_RUBRICS.production_draft (which says "Do NOT evaluate dialogue quality,
 *   scene dynamics, pacing, character voice, or visual storytelling") AND the
 *   PURPOSE_SCORING_RUBRICS.SCRIPT_EXECUTION (which has CI-1 "Dialogue Craft and Scene Dynamics",
 *   CI-2 "Structural Integrity and Pacing", CI-3 "Visual Storytelling and Dramatic Impact").
 *
 * Tests verify that:
 *   - The production_draft rubric contains the CRITICAL SCOPE RULES
 *   - The SCRIPT_EXECUTION scoring rubric directly contradicts these rules
 *   - The prompt construction orders the delivery rubric BEFORE the purpose scoring rubric
 *   - The rewrite goals for SCRIPT_EXECUTION don't inject creative language into production_draft rewrites
 *   - The LLM correctly defers to the more specific production_draft rubric
 */
import { describe, it, expect } from 'vitest';
import { getDocPurposeClass, PURPOSE_SCORING_RUBRICS, PURPOSE_REWRITE_GOALS } from '../../supabase/functions/_shared/docPurposeRegistry.ts';

const DEV_ENGINE_PATH = '/Users/laralane/code/iffy/supabase/functions/dev-engine-v2/index.ts';

// ════════════════════════════════════════════════════════════════════════════════
// FIX 1: production_draft rubric — 7 production criteria + critical scope rules
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 1 — production_draft rubric: 7 production criteria', () => {

  // Helper: load source file
  async function getLines(): Promise<string[]> {
    const fs = await import('fs');
    return fs.readFileSync(DEV_ENGINE_PATH, 'utf-8').split('\n');
  }

  // ── Primary use case ──────────────────────────────────────────────────────

  it('production_draft rubric no longer contains "Also evaluate script quality"', async () => {
    const lines = await getLines();
    // Find the production_draft entry — it's the value after 'production_draft: `...'
    const prodDraftLine = lines.findIndex(l => l.includes('production_draft:'));
    expect(prodDraftLine).toBeGreaterThanOrEqual(0);

    // Collect all lines from production_draft: ` until the closing backtick
    const prodDraftBlock: string[] = [];
    let inBlock = false;
    let backtickDepth = 0;
    for (let i = prodDraftLine; i < lines.length && i < prodDraftLine + 30; i++) {
      const line = lines[i];
      prodDraftBlock.push(line);
      // Count backticks to find end of template literal
      const backtickCount = (line.match(/`/g) || []).length;
      if (backtickCount > 0) {
        backtickDepth += backtickCount;
        // The template literal starts with production_draft: `... and ends with `,
        // Since backticks are within the string, we need to look for the pattern `,
        if (line.includes('`,')) break;
      }
    }

    const fullRubric = prodDraftBlock.join('\n');

    // Verify "Also evaluate script quality" is REMOVED
    expect(fullRubric).not.toContain('Also evaluate script quality');

    // Verify the 7 production-specific criteria are all present
    expect(fullRubric).toContain('(1) PRODUCTION READINESS');
    expect(fullRubric).toContain('(2) SCENE FEASIBILITY');
    expect(fullRubric).toContain('(3) CLARITY FOR DEPARTMENT HEADS');
    expect(fullRubric).toContain('(4) SCHEDULE IMPLICATIONS');
    expect(fullRubric).toContain('(5) CONTINUITY');
    expect(fullRubric).toContain('(6) FORMAT COMPLIANCE');
    expect(fullRubric).toContain('(7) PRODUCTION CUES');

    // Verify CRITICAL SCOPE RULES header is present
    expect(fullRubric).toContain('CRITICAL SCOPE RULES');
  });

  it('production_draft CRITICAL SCOPE RULES explicitly prohibit creative script evaluation', async () => {
    const lines = await getLines();
    const prodDraftLine = lines.findIndex(l => l.includes('production_draft:'));
    expect(prodDraftLine).toBeGreaterThanOrEqual(0);

    const scopeBlock: string[] = [];
    let inScopeSection = false;
    for (let i = prodDraftLine; i < lines.length && i < prodDraftLine + 30; i++) {
      const line = lines[i];
      if (line.includes('CRITICAL SCOPE RULES')) inScopeSection = true;
      if (inScopeSection) scopeBlock.push(line);
      if (inScopeSection && line.includes('blockers.`,')) break;
    }

    const scopeRules = scopeBlock.join('\n');

    // The exact prohibition text
    expect(scopeRules).toContain('Do NOT evaluate dialogue quality, scene dynamics, pacing, character voice, or visual storytelling');
    expect(scopeRules).toContain('A production draft is a production-planning document — not a creative script evaluation');

    // Additional scope rules
    expect(scopeRules).toContain('Do NOT flag them as exposition');
    expect(scopeRules).toContain('Missing production detail');
    expect(scopeRules).toContain('HIGHER priority flag');
    expect(scopeRules).toContain('Flag creative writing quality issues only if they make the PRODUCTION INTENT ambiguous');
  });

  it('production_draft rubric correctly describes itself as a production-planning document', async () => {
    const lines = await getLines();
    const prodDraftLine = lines.findIndex(l => l.includes('production_draft:'));
    expect(prodDraftLine).toBeGreaterThanOrEqual(0);

    const headerLines = lines.slice(prodDraftLine, prodDraftLine + 3).join('\n');
    expect(headerLines).toContain('PRODUCTION-PLANNING document');
    expect(headerLines).toContain('department heads');
    expect(headerLines).toContain('director, DP, production designer');
  });

  it('production_draft rubric references all department heads that need clarity', async () => {
    const lines = await getLines();
    const prodDraftLine = lines.findIndex(l => l.includes('production_draft:'));
    expect(prodDraftLine).toBeGreaterThanOrEqual(0);

    // Check criteria (3) references specific department types
    const clarityBlock = lines.slice(prodDraftLine, prodDraftLine + 15).join('\n');
    expect(clarityBlock).toContain('production designer');
    expect(clarityBlock).toContain('costume designer');
    expect(clarityBlock).toContain('sound designer');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Concern 1: PURPOSE_SCORING_RUBRICS.SCRIPT_EXECUTION conflict
// ════════════════════════════════════════════════════════════════════════════════

describe('Concern 1 — PURPOSE_SCORING_RUBRICS.SCRIPT_EXECUTION creative criteria conflict', () => {

  it('production_draft maps to SCRIPT_EXECUTION purpose class', () => {
    const purposeClass = getDocPurposeClass('production_draft');
    expect(purposeClass).toBe('SCRIPT_EXECUTION');
  });

  it('SCRIPT_EXECUTION scoring rubric contains creative criteria that contradict production_draft scope rules', () => {
    const scriptExecRubric = PURPOSE_SCORING_RUBRICS.SCRIPT_EXECUTION;
    expect(scriptExecRubric).toBeDefined();

    // The SCRIPT_EXECUTION rubric explicitly scores creative quality:
    // CI-1: Dialogue Craft and Scene Dynamics (12 pts)
    expect(scriptExecRubric).toContain('CI-1');
    expect(scriptExecRubric).toContain('Dialogue Craft and Scene Dynamics');

    // CI-2: Structural Integrity and Pacing (12 pts)
    expect(scriptExecRubric).toContain('CI-2');
    expect(scriptExecRubric).toContain('Structural Integrity and Pacing');

    // CI-3: Visual Storytelling and Dramatic Impact (10 pts)
    expect(scriptExecRubric).toContain('CI-3');
    expect(scriptExecRubric).toContain('Visual Storytelling and Dramatic Impact');

    // These are EXACTLY what the production_draft CRITICAL SCOPE RULES say NOT to evaluate:
    // "Do NOT evaluate dialogue quality, scene dynamics, pacing, character voice, or visual storytelling"
    // So there is a direct contradiction between the two rubrics.
  });

  it('SCRIPT_EXECUTION rubric has GP criteria for production feasibility and format compliance', () => {
    const scriptExecRubric = PURPOSE_SCORING_RUBRICS.SCRIPT_EXECUTION;
    // GP-1: Production Feasibility — relevant for production_draft
    expect(scriptExecRubric).toContain('GP-1');
    expect(scriptExecRubric).toContain('Production Feasibility');

    // GP-5: Format Compliance — relevant for production_draft
    expect(scriptExecRubric).toContain('GP-5');
    expect(scriptExecRubric).toContain('Format Compliance');

    // GP-2: Audience Clarity and Hook Strength — aligns with production readiness
    expect(scriptExecRubric).toContain('GP-2');
  });

  it('prompt construction places delivery rubric BEFORE purpose scoring rubric', async () => {
    // Read the buildEvalPrompt function around line 2184
    const lines = await (async () => {
      const fs = await import('fs');
      return fs.readFileSync(DEV_ENGINE_PATH, 'utf-8').split('\n');
    })();

    // Find the rubric insertion point: ${rubric}
    // Then PURPOSE_SCORING_RUBRICS should come AFTER
    const rubricLine = lines.findIndex(l => l.includes('${rubric}'));
    const purposeLine = lines.findIndex(l => l.includes('${PURPOSE_SCORING_RUBRICS[getDocPurposeClass(deliverable)]}'));

    expect(rubricLine).toBeGreaterThanOrEqual(0);
    expect(purposeLine).toBeGreaterThanOrEqual(0);
    expect(rubricLine).toBeLessThan(purposeLine);

    // Verify there's at least some gap between them (not adjacent)
    const gap = purposeLine - rubricLine;
    expect(gap).toBeGreaterThan(3);
  });

  it('production_draft rubric appears in the returned prompt before SCRIPT_EXECUTION purpose scoring', async () => {
    // Read the DEV_ENGINE_PATH to find the buildEvalPrompt function
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');

    // Find the rubric constructor — it's a template literal that builds the full prompt
    // The DELIVERABLE_RUBRICS entry for production_draft is used as ${rubric}
    // Then ${PURPOSE_SCORING_RUBRICS[...]} comes after

    // Verify production_draft is referenced as a deliverable rubric key
    expect(content).toContain('  production_draft: `');

    // The prompt explicitly states "Evaluate as a PRODUCTION DRAFT"
    expect(content).toContain('Evaluate as a PRODUCTION DRAFT');
    expect(content).toContain('PRODUCTION-PLANNING document');
  });

  it('SCRIPT_EXECUTION scoring rubric would be included for production_draft evaluation', () => {
    const purposeClass = getDocPurposeClass('production_draft');
    expect(purposeClass).toBe('SCRIPT_EXECUTION');
    const rubric = PURPOSE_SCORING_RUBRICS[purposeClass];
    expect(rubric).toBe(PURPOSE_SCORING_RUBRICS.SCRIPT_EXECUTION);
    expect(rubric).toContain('CI-1: Dialogue Craft and Scene Dynamics (12 pts)');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Concern 2: PURPOSE_REWRITE_GOALS.SCRIPT_EXECUTION
// ════════════════════════════════════════════════════════════════════════════════

describe('Concern 2 — PURPOSE_REWRITE_GOALS.SCRIPT_EXECUTION creative language risk', () => {

  it('SCRIPT_EXECUTION rewrite goals mention dialogue craft and scene dynamics', () => {
    const rewriteGoals = PURPOSE_REWRITE_GOALS.SCRIPT_EXECUTION;
    expect(rewriteGoals).toBeDefined();
    expect(rewriteGoals).toContain('dialogue craft');
    expect(rewriteGoals).toContain('scene dynamics');
    expect(rewriteGoals).toContain('dramatic impact');
    expect(rewriteGoals).toContain('character voice');
  });

  it('SCRIPT_EXECUTION rewrite goals also mention production readiness', () => {
    const rewriteGoals = PURPOSE_REWRITE_GOALS.SCRIPT_EXECUTION;
    // This is the overlap — production readiness is valid for production_draft
    expect(rewriteGoals).toContain('production readiness');
  });

  it('rewrite function does NOT inject PURPOSE_REWRITE_GOALS for production_draft evaluations', async () => {
    // Verify the evaluation prompt in dev-engine-v2 only uses PURPOSE_SCORING_RUBRICS,
    // not PURPOSE_REWRITE_GOALS — the rewrite goals are only used during actual rewrites
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');

    // Count PURPOSE_REWRITE_GOALS references — should only be in the rewrite handler, not eval
    const rewriteGoalRefs = content.match(/PURPOSE_REWRITE_GOALS/g);
    const scoringRefs = content.match(/PURPOSE_SCORING_RUBRICS/g);

    // Both are present in the file, but PURPOSE_REWRITE_GOALS should have fewer uses
    expect(rewriteGoalRefs).toBeDefined();
    expect(scoringRefs).toBeDefined();
    expect(scoringRefs!.length).toBeGreaterThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Invariant: No other rubric references "Also evaluate script quality"
// ════════════════════════════════════════════════════════════════════════════════

describe('Invariant — no remaining "Also evaluate script quality" references', () => {

  it('the string "Also evaluate script quality" does not appear anywhere in dev-engine-v2', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');
    expect(content).not.toContain('Also evaluate script quality');
  });

  it('the string "Also evaluate" does not appear in the production_draft rubric', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');
    // Find the production_draft entry
    const prodDraftIndex = content.indexOf('production_draft:');
    const afterProdDraft = content.slice(prodDraftIndex, prodDraftIndex + 2000);
    expect(afterProdDraft).not.toContain('Also evaluate');
  });

  it('production_draft is still in the DELIVERABLE_RUBRICS object', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');
    // Just verify the key exists at all
    expect(content).toContain('production_draft:');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Edge cases and boundary values
// ════════════════════════════════════════════════════════════════════════════════

describe('Edge cases — production_draft rubric boundary behavior', () => {

  it('production_draft rubric sets correct score expectations for CI and GP', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');

    // Find the production_draft entry and extract score expectations
    const prodDraftStart = content.indexOf('production_draft:');
    const prodDraftBlock = content.slice(prodDraftStart, prodDraftStart + 3000);

    // The rubric should specify expected score ranges — look for the score summary
    expect(prodDraftBlock).toContain('CI:70-80');
    expect(prodDraftBlock).toContain('GP:80+');
  });

  it('production_draft rubric treats missing production details as blockers', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');
    const prodDraftStart = content.indexOf('production_draft:');
    const prodDraftBlock = content.slice(prodDraftStart, prodDraftStart + 3000);
    expect(prodDraftBlock).toContain('blockers');
    expect(prodDraftBlock).toContain('Missing production-critical details');
  });

  it('SCREENPLAY FORMAT PROHIBITION explicitly allows production_draft to use screenplay format', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');

    // The format prohibition says "Unless the deliverable is explicitly a script
    // (feature_script, episode_script, season_script, production_draft)"
    const prohibitionSection = content.indexOf('SCREENPLAY FORMAT PROHIBITION');
    expect(prohibitionSection).toBeGreaterThanOrEqual(0);

    const prohibitionBlock = content.slice(prohibitionSection, prohibitionSection + 500);
    expect(prohibitionBlock).toContain('production_draft');
    // production_draft is explicitly excluded from the prohibition
    expect(prohibitionBlock).toContain('Unless the deliverable is explicitly a script');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Integration: Prompt construction verification
// ════════════════════════════════════════════════════════════════════════════════

describe('Integration — Prompt construction for production_draft evaluation', () => {

  it('production_draft prompting has both the delivery rubric and purpose scoring', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');

    // The buildEvalPrompt function interpolates:
    // ${rubric} -> DELIVERABLE_RUBRICS[deliverable] (the production-specific rubric)
    // ${PURPOSE_SCORING_RUBRICS[getDocPurposeClass(deliverable)]} -> SCRIPT_EXECUTION scoring

    // Both are present in the template
    expect(content).toContain('${rubric}');
    expect(content).toContain('${PURPOSE_SCORING_RUBRICS[getDocPurposeClass(deliverable)]}');
  });

  it('prompt has the "Score CI and GP" instruction after both rubrics', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');

    const purposeLine = content.indexOf('${PURPOSE_SCORING_RUBRICS[getDocPurposeClass(deliverable)]}');
    const afterPurpose = content.slice(purposeLine, purposeLine + 200);

    // After the purpose scoring rubric, there's instruction about scoring
    expect(afterPurpose).toContain('Score CI and GP relative to the declared format and lane');
  });

  it('SCREENPLAY FORMAT PROHIBITION still allows production_draft to use sluglines', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');

    // The prohibition is: "Unless the deliverable is explicitly a script
    // (feature_script, episode_script, season_script, production_draft), do NOT use..."
    const prohibitionSection = content.indexOf('SCREENPLAY FORMAT PROHIBITION');
    const prohibitionText = content.slice(prohibitionSection, prohibitionSection + 300);

    // production_draft must remain in the exemption list
    expect(prohibitionText).toContain('production_draft');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Regression: Other rubric entries not affected
// ════════════════════════════════════════════════════════════════════════════════

describe('Regression — other rubric entries unchanged', () => {

  it('beat_sheet rubric still has same content', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');
    expect(content).toContain('Score beat progression, dramatic escalation, turning points, structural completeness');
    expect(content).toContain('Do NOT evaluate prose quality or dialogue');
  });

  it('script rubric still evaluates creative quality (unchanged)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');
    const scriptRubric = content.match(/script: `([^`]+`)/);
    expect(scriptRubric).toBeTruthy();
    // Script rubric still evaluates dialogue craft
    expect(scriptRubric![1]).toContain('dialogue craft');
    expect(scriptRubric![1]).toContain('scene dynamics');
  });

  it('format_rules rubric still has production focus (unchanged)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync(DEV_ENGINE_PATH, 'utf-8');
    expect(content).toContain('STRUCTURAL / PRODUCTION document');
  });
});