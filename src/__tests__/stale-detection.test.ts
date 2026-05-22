import { describe, it, expect } from "vitest";
import { isDocStale, DocVersionDependency } from "../lib/stale-detection";

describe("isDocStale — NEC stale exclusion", () => {
  // --- NEC should never be flagged stale ---
  it("returns false for NEC with different resolver hash", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: "old-hash",
    };
    expect(isDocStale(docVersion, "new-hash", "nec")).toBe(false);
  });

  it("returns false for NEC with matching resolver hash", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: "same-hash",
    };
    expect(isDocStale(docVersion, "same-hash", "nec")).toBe(false);
  });

  it("returns false for NEC with null resolver hash", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: null,
    };
    expect(isDocStale(docVersion, "new-hash", "nec")).toBe(false);
  });

  // --- concept_brief regression — should also never be flagged stale ---
  it("returns false for concept_brief with different resolver hash (regression)", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: "old-hash",
    };
    expect(isDocStale(docVersion, "new-hash", "concept_brief")).toBe(false);
  });

  // --- Other doc types should still work normally ---
  it("returns true for treatment with different resolver hash", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: "old-hash",
    };
    expect(isDocStale(docVersion, "new-hash", "treatment")).toBe(true);
  });

  it("returns false for treatment with matching resolver hash", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: "same-hash",
    };
    expect(isDocStale(docVersion, "same-hash", "treatment")).toBe(false);
  });

  it("returns true for market_sheet with different resolver hash", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: "old-hash",
    };
    expect(isDocStale(docVersion, "new-hash", "market_sheet")).toBe(true);
  });

  // --- Edge cases ---
  it("returns false for null docVersion", () => {
    expect(isDocStale(null, "some-hash", "treatment")).toBe(false);
  });

  it("returns false for undefined docVersion", () => {
    expect(isDocStale(undefined, "some-hash", "treatment")).toBe(false);
  });

  it("returns false when depends_on_resolver_hash is null (no hash tracked)", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: null,
    };
    expect(isDocStale(docVersion, "new-hash", "treatment")).toBe(false);
  });

  it("returns false when currentResolverHash is null (no current hash)", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: "old-hash",
    };
    expect(isDocStale(docVersion, null, "treatment")).toBe(false);
  });

  it("returns false when currentResolverHash is undefined", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: "old-hash",
    };
    expect(isDocStale(docVersion, undefined, "treatment")).toBe(false);
  });

  it("detects staleness for undefined docType (no exclusion applies)", () => {
    const docVersion: DocVersionDependency = {
      depends_on_resolver_hash: "old-hash",
    };
    // Without a docType, it should still detect staleness
    expect(isDocStale(docVersion, "new-hash", undefined)).toBe(true);
  });

  it("returns false when docVersion has no depends_on field at all", () => {
    const docVersion: DocVersionDependency = {};
    expect(isDocStale(docVersion, "new-hash", "treatment")).toBe(false);
  });
});
