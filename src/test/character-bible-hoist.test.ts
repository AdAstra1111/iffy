import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Character Bible Hoist Validation Tests
 *
 * Validates that 4 variables (sections, updatedCount, nonCharacterCount, updatedNames)
 * have been hoisted to outer scope correctly in supabase/functions/dev-engine-v2/index.ts.
 *
 * The original bug was "sections is not defined" — variables declared inside
 * inner blocks but referenced at higher scope levels or in different iterations.
 *
 * Expected hoist:
 *   - sections:   let declaration at outer scope (was const inside inner if-block)
 *   - updatedCount:   let declaration at outer scope (was inside if-blocks)
 *   - nonCharacterCount: let declaration at outer scope (was missing entirely)
 *   - updatedNames: const declaration at outer scope
 */

const SOURCE_PATH = path.resolve(
  __dirname,
  "../../supabase/functions/dev-engine-v2/index.ts"
);
const source = readFileSync(SOURCE_PATH, "utf-8");
const lines = source.split("\n");

/** Extract a block of lines around a given line number for context */
function linesAround(lineNum: number, range = 3): string {
  const start = Math.max(0, lineNum - range - 1);
  const end = Math.min(lines.length, lineNum + range);
  return lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join("\n");
}

/** Get the indentation level (in spaces) of a line */
function indentLevel(lineNum: number): number {
  if (lineNum < 1 || lineNum > lines.length) return -1;
  const line = lines[lineNum - 1];
  return line.length - line.trimStart().length;
}

/** Find first line number containing a pattern, -1 if not found */
function findLine(pattern: RegExp, afterLine = 0): number {
  const startIdx = afterLine > 0 ? afterLine : 0;
  for (let i = startIdx; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return -1;
}

/** Find all line numbers matching a pattern */
function findAllLines(pattern: RegExp): number[] {
  const results: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) results.push(i + 1);
  }
  return results;
}

describe("Character Bible — Variable Hoist Validation", () => {
  // ── Context: Find the per-character rewrite section boundaries ──
  const perCharSectionStart = findLine(
    /PER-CHARACTER REWRITE for character bible/i
  );
  const forLoopLine = findLine(/for\s+\(const section of sections\)/);

  it("should have the per-character rewrite section in the source", () => {
    expect(perCharSectionStart).toBeGreaterThan(0);
    expect(forLoopLine).toBeGreaterThan(0);
  });

  // ── Test 1: sections must be declared with `let` at outer scope ──
  describe("sections — outer scope `let` declaration", () => {
    // Find `const sections = parseCharacterBibleSections(`  (the current inner-scope declaration)
    const constSectionsLines = findAllLines(
      /const sections\s*=\s*parseCharacterBibleSections\b/
    );
    // Find `let sections` declarations
    const letSectionsLines = findAllLines(/let sections\b/);

    it("should NOT have `const sections` inside inner block (must be hoisted)", () => {
      // Check if there's still a const sections inside the per-character block
      const innerConstSections = constSectionsLines.filter(
        (ln) => ln > (perCharSectionStart || 0) && ln < (forLoopLine || Infinity)
      );
      // If the hoist is done, this should be 0 — no inner const declaration
      // If it's NOT done, this is 1 — the bug still exists
      expect(innerConstSections.length).toBe(0);
    });

    it("should have `let sections` declared at outer scope BEFORE the conditional blocks", () => {
      // Find `let sections` declarations before the per-character section
      const outerLetSections = letSectionsLines.filter(
        (ln) => ln < (perCharSectionStart || Infinity) && ln > 0
      );
      // The review says this should be present at "outer scope"
      // But currently the code has `const sections` inside the inner block
      // After hoist: `let sections;` (or similar) at a higher scope level
      expect(outerLetSections.length).toBeGreaterThanOrEqual(1);
    });

    it("should assign `sections` via `sections = parseCharacterBibleSections()` (no const)", () => {
      // After hoist: `sections = parseCharacterBibleSections(fullText)` (no `const` prefix)
      const assignmentLines = findAllLines(
        /sections\s*=\s*parseCharacterBibleSections\b/
      );
      const innerAssignments = assignmentLines.filter(
        (ln) => ln > (perCharSectionStart || 0) && ln < (forLoopLine || Infinity)
      );
      expect(innerAssignments.length).toBe(1);
    });

    it("should be accessible at the `assembledText` usage point (sections.length)", () => {
      // Line that uses sections.length in the assembled output
      const usageLine = findLine(
        /sections\.length\s*-\s*updatedCount/
      );
      expect(usageLine).toBeGreaterThan(0);
      // sections must be in scope at this point (same function or outer scope)
      // The declaration must be at a lower (outer) line number than the usage
      const sectionsDecl = findLine(/let sections\b.*;/);
      const sectionsReassign = findLine(/sections\s*=\s*parseCharacterBibleSections\b/);
      
      if (sectionsDecl && sectionsDecl > 0) {
        expect(sectionsDecl).toBeLessThan(usageLine!);
      } else if (sectionsReassign && sectionsReassign > 0) {
        // If using a higher-level const
        expect(sectionsReassign).toBeLessThan(usageLine!);
      }
    });
  });

  // ── Test 2: updatedCount must be `let` at outer scope ──
  describe("updatedCount — outer scope `let` declaration", () => {
    it("should be declared as `let updatedCount` at outer scope", () => {
      // After hoist: `let updatedCount;` at outer scope
      const outerUpdatedCount = findAllLines(/let updatedCount\b/);
      // The hoisted declaration should be OUTSIDE the per-character block
      const outerScope = outerUpdatedCount.filter(
        (ln) => ln < (perCharSectionStart || Infinity) && ln > 0
      );
      // Currently the declaration is INSIDE the if-block — this test checks for hoist
      expect(outerScope.length).toBeGreaterThanOrEqual(1);
    });

    it("should be incremented at the correct location (updatedCount++)", () => {
      const incrementLines = findAllLines(/updatedCount\+\+/);
      expect(incrementLines.length).toBeGreaterThanOrEqual(1);
      // The increment should be inside the for loop
      const loopIncrement = incrementLines.filter(
        (ln) => ln > (forLoopLine || 0) && ln < (forLoopLine || 0) + 200
      );
      expect(loopIncrement.length).toBe(1);
    });

    it("should not have a duplicate inner `let updatedCount` declaration", () => {
      // After hoist, there should be no `let updatedCount` INSIDE the per-character block
      const innerUpdatedCount = findAllLines(/let updatedCount\b/).filter(
        (ln) => ln > (perCharSectionStart || 0)
      );
      expect(innerUpdatedCount.length).toBe(0);
    });
  });

  // ── Test 3: nonCharacterCount must exist as `let` at outer scope ──
  describe("nonCharacterCount — must exist as outer scope `let` declaration", () => {
    it("should be declared somewhere in the file", () => {
      // The review mentions nonCharacterCount as one of 4 hoisted variables
      // but there's no evidence it exists in the current code
      const nonCharDecl = findAllLines(/nonCharacterCount/);
      expect(nonCharDecl.length).toBeGreaterThanOrEqual(1);
    });

    it("should be declared as `let nonCharacterCount` at outer scope", () => {
      const outerDecl = findAllLines(/let nonCharacterCount\b/).filter(
        (ln) => ln < (perCharSectionStart || Infinity) && ln > 0
      );
      expect(outerDecl.length).toBeGreaterThanOrEqual(1);
    });

    it("should be incremented at the correct location (nonCharacterCount++)", () => {
      const incrementLines = findAllLines(/nonCharacterCount\+\+/);
      expect(incrementLines.length).toBeGreaterThanOrEqual(1);
    });

    it("should be referenced in the parsed output", () => {
      // The count should appear in the assembled object
      const linesWithRef = findAllLines(/nonCharacterCount/);
      expect(linesWithRef.length).toBeGreaterThan(0);
    });
  });

  // ── Test 4: updatedNames must be `const` at outer scope ──
  describe("updatedNames — outer scope `const` declaration", () => {
    it("should be declared as `const updatedNames` at outer scope", () => {
      const outerDecl = findAllLines(/const updatedNames\b/).filter(
        (ln) => ln < (perCharSectionStart || Infinity) && ln > 0
      );
      expect(outerDecl.length).toBeGreaterThanOrEqual(1);
    });

    it("should `.push` at the correct location", () => {
      const pushLines = findAllLines(/updatedNames\.push\(/);
      expect(pushLines.length).toBeGreaterThanOrEqual(1);
      // Should be inside the for loop
      const loopPush = pushLines.filter(
        (ln) => ln > (forLoopLine || 0) && ln < (forLoopLine || 0) + 200
      );
      expect(loopPush.length).toBe(1);
    });

    it("should not have a duplicate inner `const updatedNames` declaration", () => {
      const innerDecl = findAllLines(/const updatedNames\b/).filter(
        (ln) => ln > (perCharSectionStart || 0)
      );
      expect(innerDecl.length).toBe(0);
    });
  });

  // ── Test 5: Inner declarations must be removed ──
  describe("Removed inner declarations (lines ~8247-8250 original)", () => {
    it("should not redeclare `let updatedCount` or `const updatedNames` inside the if-block", () => {
      // Find the line with 'let charLoopIndex = 0' — this is AFTER the outer declarations
      const charLoopLine = findLine(/let charLoopIndex\s*=\s*0/);
      expect(charLoopLine).toBeGreaterThan(0);

      // There should be NO let/const declarations for the hoisted vars after this line
      // (they were already declared at outer scope)
      const afterCharLoop = findAllLines(
        /(let updatedCount|let nonCharacterCount|const updatedNames)\b/
      );
      const innerDupes = afterCharLoop.filter(
        (ln) => ln > (charLoopLine || 0)
      );
      expect(innerDupes.length).toBe(0);
    });
  });

  // ── Test 6: parsed object uses the hoisted variables ──
  describe("parsed object uses hoisted variables", () => {
    it("should reference `updatedCount` in changes_summary", () => {
      const summaryLine = findLine(/changes_summary.*updatedCount/);
      expect(summaryLine).toBeGreaterThan(0);
    });

    it("should reference `updatedNames` in changes_summary", () => {
      const summaryLine = findLine(/changes_summary.*updatedNames/);
      expect(summaryLine).toBeGreaterThan(0);
    });

    it("should reference `sections.length` in creative_preserved", () => {
      const preservedLine = findLine(/creative_preserved.*sections\.length/);
      expect(preservedLine).toBeGreaterThan(0);
    });
  });
});

describe("Character Bible — Edge Case Validation", () => {
  // ── Edge case 1: Empty sections (sections.length === 0) ──
  describe("Empty sections edge case", () => {
    it("should handle empty sections gracefully — isPerCharRewrite stays false", () => {
      // The check `if (sections.length > 0)` guards the inner block
      // When sections.length === 0, isPerCharRewrite should stay false (default)
      const sectionsCheckLine = findLine(/if\s*\(\s*sections\.length\s*>\s*0\s*\)/);
      expect(sectionsCheckLine).toBeGreaterThan(0);
      
      // Verify `isPerCharRewrite = true` is INSIDE the sections.length > 0 block
      const setTrueLine = findLine(/isPerCharRewrite\s*=\s*true/);
      expect(setTrueLine).toBeGreaterThan(0);
      
      // The `isPerCharRewrite = true` line must be AFTER the sections.length check
      const sectionsCheckLineNum = findLine(/if\s*\(\s*sections\.length\s*>\s*0\s*\)/)!;
      const setTrueLineNum = findLine(/isPerCharRewrite\s*=\s*true/)!;
      expect(setTrueLineNum).toBeGreaterThan(sectionsCheckLineNum);
    });

    it("should default parsed to null when per-char rewrite doesn't execute", () => {
      // `let parsed: any = null;` at the declaration point
      const parsedDeclLine = findLine(/let parsed:\s*any\s*=\s*null/);
      expect(parsedDeclLine).toBeGreaterThan(0);
      expect(parsedDeclLine).toBeLessThan(perCharSectionStart || Infinity);
    });
  });

  // ── Edge case 2: ParseAIJson failures ──
  describe("LLM failure edge cases", () => {
    it("should handle parseAIJson failure — `updatedCount` stays 0", () => {
      // The updatedCount starts at 0 and only increments on success
      const initLine = findLine(/let updatedCount\s*=\s*0/);
      const incrLine = findLine(/updatedCount\+\+/);
      expect(initLine).toBeGreaterThan(0);
      expect(incrLine).toBeGreaterThan(0);
      // increment must be AFTER initialization
      expect(incrLine).toBeGreaterThan(initLine!);
    });

    it("should preserve original section text on LLM failure (catch block)", () => {
      // The catch block preserves the original: `assembledSections.push(section.body);`
      const catchPreserveLine = findLine(
        /assembledSections\.push\(section\.body\)/
      );
      expect(catchPreserveLine).toBeGreaterThan(0);
    });

    it("should handle meta_json update failure gracefully (non-fatal try/catch)", () => {
      const metaCatchLine = findLine(
        /meta_json progress update failed \(non-fatal\)/i
      );
      expect(metaCatchLine).toBeGreaterThan(0);
    });
  });

  // ── Edge case 3: Variable NOT hoisted — intentional ──
  describe("Variables intentionally NOT hoisted remain inner scope", () => {
    it("should keep `charLoopIndex` as inner-scope `let`", () => {
      // charLoopIndex is intentionally NOT hoisted
      const charLoopIdx = findAllLines(/let charLoopIndex/);
      expect(charLoopIdx.length).toBe(1);
      // Must be inside the per-character block
      expect(charLoopIdx[0]).toBeGreaterThan(perCharSectionStart || 0);
    });

    it("should keep `assembledSections` as inner-scope `const`", () => {
      const assembledSecs = findAllLines(/const assembledSections/);
      expect(assembledSecs.length).toBe(1);
      expect(assembledSecs[0]).toBeGreaterThan(perCharSectionStart || 0);
    });
  });
});
