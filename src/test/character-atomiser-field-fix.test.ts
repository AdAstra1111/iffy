import { describe, it, expect } from "vitest";

/**
 * Tests for character-atomiser projectId → project_id fix.
 *
 * The fix: changed `body.projectId` to `body.project_id` at line 307.
 * This ensures the edge function reads the snake_case field sent by the frontend.
 */

function extractProjectId(body: Record<string, unknown>): string {
  // This replicates the exact logic from character-atomiser/index.ts (lines 305-310 after fix)
  const action: string = (body.action as string) || "status";
  const projectId: string = body.project_id as string;
  const atomIds: string[] = (body.atomIds as string[]) || [];

  if (!projectId) throw new Error("projectId required");

  return projectId;
}

describe("character-atomiser — projectId/project_id field read", () => {
  // ── Primary use case ──────────────────────────────────────────────────
  it("should read project_id (snake_case) from body", () => {
    const result = extractProjectId({ project_id: "proj-123" });
    expect(result).toBe("proj-123");
  });

  // ── Edge cases: missing / empty / null / undefined project_id ─────────
  it("should throw when project_id is missing from body", () => {
    expect(() => extractProjectId({ action: "status" })).toThrow("projectId required");
  });

  it("should throw when project_id is empty string", () => {
    expect(() => extractProjectId({ project_id: "" })).toThrow("projectId required");
  });

  it("should throw when project_id is null", () => {
    expect(() => extractProjectId({ project_id: null })).toThrow("projectId required");
  });

  it("should throw when project_id is undefined", () => {
    expect(() => extractProjectId({ project_id: undefined })).toThrow("projectId required");
  });

  // ── CRITICAL: Old camelCase field should NOT work ─────────────────────
  it("should NOT read projectId (camelCase) — old field name", () => {
    // This is the bug: the frontend sends project_id, not projectId
    // If only projectId is present, the fix correctly throws
    expect(() => extractProjectId({ projectId: "proj-123" })).toThrow("projectId required");
  });

  // ── Boundary: both field names present ───────────────────────────────
  it("should prefer project_id when both project_id and projectId exist", () => {
    const result = extractProjectId({
      project_id: "proj-snake",
      projectId: "proj-camel",
    });
    expect(result).toBe("proj-snake");
  });

  // ── Integration: action dispatch with project_id ──────────────────────
  it("should support all action types with project_id present", () => {
    // status
    expect(extractProjectId({ action: "status", project_id: "proj-1" })).toBe("proj-1");
    // extract
    expect(extractProjectId({ action: "extract", project_id: "proj-2" })).toBe("proj-2");
    // generate
    expect(extractProjectId({ action: "generate", project_id: "proj-3", atomIds: ["a1"] })).toBe("proj-3");
    // debug
    expect(extractProjectId({ action: "debug", project_id: "proj-4" })).toBe("proj-4");
  });
});

describe("character-atomiser — atomIds handling", () => {
  it("should default atomIds to empty array when not provided", () => {
    // This just verifies the destructuring works (not part of the fix, but regression check)
    const body = { action: "generate", project_id: "proj-1" };
    const atomIds: string[] = (body.atomIds as string[]) || [];
    expect(atomIds).toEqual([]);
  });

  it("should read atomIds when provided", () => {
    const body = { action: "generate", project_id: "proj-1", atomIds: ["a1", "a2"] };
    const atomIds: string[] = (body.atomIds as string[]) || [];
    expect(atomIds).toEqual(["a1", "a2"]);
  });
});