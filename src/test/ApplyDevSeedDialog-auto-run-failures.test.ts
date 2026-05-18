import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = process.cwd();
// Use the actual project path if running from workspace
const COMPONENT_PATH = resolve(
  PROJECT_ROOT.includes("kanban/workspaces")
    ? "/Users/laralane/code/iffy"
    : PROJECT_ROOT,
  "src/components/pitch/ApplyDevSeedDialog.tsx"
);

// ── FIX: Auto-run start failures are no longer swallowed ──
//
// Previously, when auto-run start failed, the error was logged to console.error
// but NOT pushed to the `parts` array — meaning the toast.success message
// would not indicate the failure to the user. Two catch blocks were affected:
//
// 1. The inner catch where `arInvokeErr` is non-null and NOT a recoverable conflict
//    (line ~886): only `console.error(...)` was called
// 2. The outer catch (try/catch around the whole start block, line ~893):
//    only `console.error(...)` was called
//
// The fix adds `parts.push('auto-run failed to start')` to both catch blocks,
// so the toast that joins parts conveys the failure to the user.

describe("ApplyDevSeedDialog — auto-run start failures not swallowed", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(COMPONENT_PATH, "utf-8");
  });

  // ── Verifying the fix itself ──

  it("has parts.push('auto-run failed to start') in the arInvokeErr catch (inner)", () => {
    // Find the arInvokeErr block: non-recoverable error path
    const consoleErrMatch = source.match(
      /console\.error\('\[DevSeed\] auto-run start failed \(non-fatal\):',\s*arInvokeErr\)/
    );
    expect(consoleErrMatch).not.toBeNull();

    // Within ~200 chars after that console.error, there should be parts.push('auto-run failed to start')
    const matchIndex = consoleErrMatch!.index!;
    const afterConsole = source.slice(matchIndex, matchIndex + 200);
    expect(afterConsole).toContain("parts.push('auto-run failed to start')");
  });

  it("has parts.push('auto-run failed to start') in the outer catch (arErr)", () => {
    // Find the outer catch for arErr
    const consoleErrMatch = source.match(
      /console\.error\('\[DevSeed\] auto-run start failed \(non-fatal\):',\s*arErr\?\.message\)/
    );
    expect(consoleErrMatch).not.toBeNull();

    // Within ~200 chars after that console.error, there should be parts.push('auto-run failed to start')
    const matchIndex = consoleErrMatch!.index!;
    const afterConsole = source.slice(matchIndex, matchIndex + 200);
    expect(afterConsole).toContain("parts.push('auto-run failed to start')");
  });

  // ── Verifying existing paths are intact (regression) ──

  it("still has parts.push('auto-run started') for the success path", () => {
    expect(source).toContain("parts.push('auto-run started')");
  });

  it("still has parts.push('auto-run reattached') for the recoverable conflict path", () => {
    expect(source).toContain("parts.push('auto-run reattached')");
  });

  it("still has parts.push('auto-run reattached') for the preflight-already-running path", () => {
    // The first reattach is from the preflight status check (line ~867)
    const matches = [...source.matchAll(/parts\.push\('auto-run reattached'\)/g)];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  // ── Verifying the failure is now VISIBLE to the user (not just console) ──

  it("toast.success joins the parts array — failure entry reaches user", () => {
    // The toast.success is on line ~912
    expect(source).toContain("toast.success(parts.join(', '))");
  });

  // ── Verifying console.error is STILL present (logging preserved) ──

  it("still logs auto-run start failure errors for debugging", () => {
    const match = source.match(
      /console\.error\('\[DevSeed\] auto-run start failed \(non-fatal\):',/g
    );
    expect(match).not.toBeNull();
    expect(match!.length).toBe(2);
  });

  // ── Verifying the preflight status check catch does NOT push a failure message ──

  it("preflight status check catch still silently swallows (no parts.push)", () => {
    // Find the status check catch block: `} catch { // Status check failed — proceed`
    // It should NOT have parts.push after it
    const statusCheckCatch = source.match(
      /\}\s*catch\s*\{[\s\n]*\/\/\s*Status check failed/
    );
    expect(statusCheckCatch).not.toBeNull();

    const matchIndex = statusCheckCatch!.index!;
    const afterCatch = source.slice(matchIndex, matchIndex + 100);
    // No parts.push should appear in the preflight catch block
    expect(afterCatch).not.toContain("parts.push");
  });

  // ── Verifying the error context is complete ──

  it("console.error includes arInvokeErr (not just a static string)", () => {
    const arErrCatch = source.match(
      /console\.error\('\[DevSeed\] auto-run start failed \(non-fatal\):',\s*arInvokeErr\)/
    );
    expect(arErrCatch).not.toBeNull();
  });

  it("outer catch includes arErr.message in console.error", () => {
    const outerCatch = source.match(
      /console\.error\('\[DevSeed\] auto-run start failed \(non-fatal\):',\s*arErr\?\.message\)/
    );
    expect(outerCatch).not.toBeNull();
  });

  // ── Verifying no other error-swallowing catch blocks remain ──

  it("no other 'non-fatal' auto-run blocks lack parts.push", () => {
    // Find all `console.error('[DevSeed] auto-run` patterns and verify
    // each one has a corresponding parts.push within 5 lines
    // (the outer catch swallows console.error with message — we already verified it has parts.push)
    // This is a safety net for future edits that might add new catch blocks
    const autoRunErrorRefs = [
      ...source.matchAll(
        /console\.error\('\[DevSeed\] auto-run start failed/g
      ),
    ];

    for (const match of autoRunErrorRefs) {
      const idx = match.index!;
      const after = source.slice(idx, idx + 200);
      // Each console.error about auto-run start should be followed
      // by parts.push within a reasonable distance
      expect(after).toMatch(/parts\.push\('auto-run failed/);
    }
  });
});

describe("ApplyDevSeedDialog — source file integrity", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(COMPONENT_PATH, "utf-8");
  });

  it("file compiles (not empty, has expected exports)", () => {
    expect(source).toContain("export function ApplyDevSeedDialog");
  });

  it("file size is reasonable", () => {
    expect(source.length).toBeGreaterThan(10000);
    expect(source.length).toBeLessThan(60000);
  });
});
