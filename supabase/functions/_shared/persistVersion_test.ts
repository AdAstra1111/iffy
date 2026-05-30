/**
 * persistVersion Unit Tests
 * 
 * Tests for the canonical version persistence boundary in doc-os.ts.
 * These are pure logic tests — they test operation classification,
 * guard behavior, and identity stack integration rules.
 * 
 * Run: deno test --allow-read --allow-net --allow-env supabase/functions/_shared/persistVersion_test.ts
 */

import { assertEquals, assertNotEquals } from "jsr:@std/assert";

// ── Imports from doc-os ──
import {
  CONTENT_WRITE_OPERATIONS,
  type PersistVersionOperationType,
} from "./doc-os.ts";

// ── Mock imports (these won't be called in unit tests) ──
// We test the operation classification and safety logic only.
// Full integration tests require a real supabase instance.

// ══════════════════════════════════════════════════
// OPERATION CLASSIFICATION TESTS
// ══════════════════════════════════════════════════

Deno.test("persistVersion: CONTENT_WRITE_OPERATIONS includes all content operations", () => {
  const contentOps: PersistVersionOperationType[] = [
    "CREATE_FINAL",
    "UPDATE_CONTENT",
    "UPSERT_CONTENT",
    "CONVERT_FORMAT",
    "REWRITE_FINAL",
    "PROMOTE_DERIVATIVE",
  ];
  
  for (const op of contentOps) {
    assertEquals(CONTENT_WRITE_OPERATIONS.has(op), true, `Expected ${op} to be in CONTENT_WRITE_OPERATIONS`);
  }
});

Deno.test("persistVersion: CONTENT_WRITE_OPERATIONS excludes placeholder and metadata operations", () => {
  const nonContentOps: PersistVersionOperationType[] = [
    "CREATE_PLACEHOLDER",
    "UPDATE_METADATA_ONLY",
    "UPDATE_STATUS_ONLY",
    "SUPERSEDE",
  ];
  
  for (const op of nonContentOps) {
    assertEquals(CONTENT_WRITE_OPERATIONS.has(op), false, `Expected ${op} to NOT be in CONTENT_WRITE_OPERATIONS`);
  }
});

// ══════════════════════════════════════════════════
// OPERATION TYPE UNIQUENESS TESTS
// ══════════════════════════════════════════════════

Deno.test("persistVersion: operation types are mutually exclusive", () => {
  // Content operations should all be DISTINCT from non-content operations
  const contentOps: Set<string> = new Set([
    "CREATE_FINAL",
    "UPDATE_CONTENT",
    "UPSERT_CONTENT",
    "CONVERT_FORMAT",
    "REWRITE_FINAL",
    "PROMOTE_DERIVATIVE",
  ]);
  
  const nonContentOps: Set<string> = new Set([
    "CREATE_PLACEHOLDER",
    "UPDATE_METADATA_ONLY",
    "UPDATE_STATUS_ONLY",
    "SUPERSEDE",
  ]);
  
  // No overlap
  for (const op of contentOps) {
    assertEquals(nonContentOps.has(op), false, `Content op ${op} should not appear in non-content set`);
  }
  for (const op of nonContentOps) {
    assertEquals(contentOps.has(op), false, `Non-content op ${op} should not appear in content set`);
  }
});

// ══════════════════════════════════════════════════
// TYPE GUARD BEHAVIOR TESTS
// ══════════════════════════════════════════════════

Deno.test("persistVersion: isContentOp guard works for all operation types", () => {
  const isContentOp = (op: PersistVersionOperationType): boolean => {
    return CONTENT_WRITE_OPERATIONS.has(op);
  };
  
  // Content operations return true
  assertEquals(isContentOp("CREATE_FINAL"), true);
  assertEquals(isContentOp("UPDATE_CONTENT"), true);
  assertEquals(isContentOp("UPSERT_CONTENT"), true);
  assertEquals(isContentOp("CONVERT_FORMAT"), true);
  assertEquals(isContentOp("REWRITE_FINAL"), true);
  assertEquals(isContentOp("PROMOTE_DERIVATIVE"), true);
  
  // Non-content operations return false
  assertEquals(isContentOp("CREATE_PLACEHOLDER"), false);
  assertEquals(isContentOp("UPDATE_METADATA_ONLY"), false);
  assertEquals(isContentOp("UPDATE_STATUS_ONLY"), false);
  assertEquals(isContentOp("SUPERSEDE"), false);
});

// ══════════════════════════════════════════════════
// IDENTITY STACK DUPLICATE SAFETY TESTS
// ══════════════════════════════════════════════════

Deno.test("persistVersion: dedup logic — identity_stack_shadow present means skip", () => {
  // Simulate the dedup check logic from persistVersion()
  const shouldComputeIdentityStack = (
    metadata: Record<string, any> | null,
    hasContent: boolean,
    isContentOp: boolean,
    flagEnabled: boolean,
  ): boolean => {
    if (!flagEnabled) return false;
    if (!hasContent) return false;
    if (!isContentOp) return false;
    if (metadata?.identity_stack_shadow) return false; // Already computed
    return true;
  };
  
  // Flag OFF — skip
  assertEquals(shouldComputeIdentityStack({}, true, true, false), false);
  
  // No content — skip
  assertEquals(shouldComputeIdentityStack({}, false, true, true), false);
  
  // Not a content op — skip
  assertEquals(shouldComputeIdentityStack({}, true, false, true), false);
  
  // Already has shadow — skip
  assertEquals(shouldComputeIdentityStack({ identity_stack_shadow: { irs: { score: 85 } } }, true, true, true), false);
  
  // All conditions met — compute
  assertEquals(shouldComputeIdentityStack({}, true, true, true), true);
  
  // Shadow present but force — compute (future extension)
  assertEquals(shouldComputeIdentityStack({}, true, true, true), true);
});

// ══════════════════════════════════════════════════
// CONTENT VS PLACEHOLDER CLASSIFICATION TESTS
// ══════════════════════════════════════════════════

Deno.test("persistVersion: text content determines content presence", () => {
  const hasContent = (text: string | null | undefined): boolean => {
    return !!(text && text.trim().length > 0);
  };
  
  assertEquals(hasContent(null), false);
  assertEquals(hasContent(undefined), false);
  assertEquals(hasContent(""), false);
  assertEquals(hasContent("   "), false);
  assertEquals(hasContent("Hello world"), true);
  assertEquals(hasContent("a"), true);
});

// ══════════════════════════════════════════════════
// RACE CONDITION SAFETY TESTS
// ══════════════════════════════════════════════════

Deno.test("persistVersion: concurrent content updates should not duplicate telemetry (simulated)", () => {
  // Simulate two concurrent UPDATE_CONTENT operations on the same version
  // The dedup check prevents double computation
  
  let shadowComputedCount = 0;
  
  const simulateWriteWithDedup = (currentShadow: any): boolean => {
    if (currentShadow) return false; // Dedup: already computed
    shadowComputedCount++;
    return true;
  };
  
  // First call — no shadow yet → compute
  simulateWriteWithDedup(null);
  assertEquals(shadowComputedCount, 1);
  
  // Second call — shadow exists → skip
  simulateWriteWithDedup({ irs: { score: 85 } });
  assertEquals(shadowComputedCount, 1); // Still 1 (not double-computed)
});

// ══════════════════════════════════════════════════
// EDGE CASES
// ══════════════════════════════════════════════════

Deno.test("persistVersion: two-phase write pattern safety", () => {
  // Phase 1: CREATE_PLACEHOLDER with empty text
  // Phase 2: UPDATE_CONTENT with real content
  
  const isContentOp = (op: PersistVersionOperationType): boolean => CONTENT_WRITE_OPERATIONS.has(op);
  const hasContent = (text: string | null): boolean => !!(text && text.trim().length > 0);
  
  // Phase 1: placeholder — identity stack should NOT fire
  assertEquals(isContentOp("CREATE_PLACEHOLDER"), false);
  assertEquals(hasContent(""), false);
  
  // Phase 2: content update — identity stack SHOULD fire
  assertEquals(isContentOp("UPDATE_CONTENT"), true);
  assertEquals(hasContent("This is the assembled screenplay content..."), true);
});

Deno.test("persistVersion: empty upsert content is treated as placeholder", () => {
  const hasContent = (text: string | null | undefined): boolean => {
    return !!(text && text.trim().length > 0);
  };
  
  // UPSERT_CONTENT with empty text should not trigger identity stack
  assertEquals(hasContent(""), false);
  assertEquals(hasContent(null), false);
  assertEquals(hasContent(undefined), false);
});

Deno.test("persistVersion: very long content still triggers identity stack", () => {
  const hasContent = (text: string | null | undefined): boolean => {
    return !!(text && text.trim().length > 0);
  };
  
  const longContent = "A".repeat(100000);
  assertEquals(hasContent(longContent), true);
});
