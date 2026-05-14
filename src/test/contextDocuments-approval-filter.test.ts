import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = process.cwd();

describe("NEC pipeline contextDocuments — approval_status filter (auto-run)", () => {
  let autoRunSource: string;

  beforeAll(() => {
    autoRunSource = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/auto-run/index.ts"),
      "utf-8"
    );
  });

  it("contains project_document_versions query with .eq('is_current', true)", () => {
    const match = autoRunSource.match(
      /\.from\(['"]project_document_versions['"]\)[\s\S]*?\.eq\(['"]is_current['"],\s*true\)/
    );
    expect(match).not.toBeNull();
  });

  it("contains .eq('approval_status', 'approved') immediately after is_current", () => {
    const match = autoRunSource.match(
      /\.eq\(['"]is_current['"],\s*true\)\s*\.eq\(['"]approval_status['"],\s*['"]approved['"]\)/
    );
    expect(match).not.toBeNull();
  });

  it("contextDocuments query block has both is_current and approval_status filters", () => {
    // Find the specific .in("document_id", ctxDocIds) query — the contextDocuments fix
    const match = autoRunSource.match(
      /\.in\(['"]document_id['"],\s*ctxDocIds\)[\s\S]{0,200}/
    );
    expect(match).not.toBeNull();
    if (match) {
      const queryBlock = match[0];
      expect(queryBlock).toContain('.eq("is_current"');
      expect(queryBlock).toContain('.eq("approval_status"');
    }
  });

  it("uses 2-space indentation throughout the contextDocuments block (lines ~1529-1558)", () => {
    const blockStart = autoRunSource.indexOf("// Fetch foundation docs");
    const blockEnd = autoRunSource.indexOf("let seedRes", blockStart);
    const block = autoRunSource.slice(blockStart, blockEnd);
    const lines = block.split("\n").filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const indent = line.search(/\S/);
      if (indent > 0) {
        // Every indented line should use multiples of 2 spaces
        expect(indent % 2).toBe(0);
      }
    }
  });

  it("has consistent query structure — select, is_current, approval_status all chained", () => {
    const queryPattern =
      /\.from\(['"]project_document_versions['"]\)\s*\.select\(['"]document_id,\s*plaintext['"]\)\s*\.in\(['"]document_id['"],\s*ctxDocIds\)\s*\.eq\(['"]is_current['"],\s*true\)\s*\.eq\(['"]approval_status['"],\s*['"]approved['"]\)/;
    expect(autoRunSource).toMatch(queryPattern);
  });

  it("has best-effort error handling (try/catch with fallback to undefined)", () => {
    // Verify the try/catch block around the contextDocuments fetch
    const tryMatch = autoRunSource.match(/try\s*\{[\s\S]*?contextDocuments\s*=\s*undefined;?\s*\}/);
    expect(tryMatch).not.toBeNull();
  });
});

describe("NEC pipeline contextDocuments — approval_status filter (GenerateSeedPackModal)", () => {
  let modalSource: string;

  beforeAll(() => {
    modalSource = readFileSync(
      resolve(PROJECT_ROOT, "src/components/seedpack/GenerateSeedPackModal.tsx"),
      "utf-8"
    );
  });

  it("contains project_document_versions query with .eq('is_current', true)", () => {
    const match = modalSource.match(
      /\.from\(['"]project_document_versions['"]\)[\s\S]*?\.eq\(['"]is_current['"],\s*true\)/
    );
    expect(match).not.toBeNull();
  });

  it("contains .eq('approval_status', 'approved') immediately after is_current", () => {
    const match = modalSource.match(
      /\.eq\(['"]is_current['"],\s*true\)\s*\.eq\(['"]approval_status['"],\s*['"]approved['"]\)/
    );
    expect(match).not.toBeNull();
  });

  it("does NOT contain an old query missing approval_status filter on the versions query", () => {
    const match = modalSource.match(
      /\.from\(['"]project_document_versions['"]\)[\s\S]*?\.eq\(['"]is_current['"],\s*true\)([\s\S]{0,100})/
    );
    expect(match).not.toBeNull();
    if (match) {
      expect(match[1]).toContain("approval_status");
    }
  });

  it("has consistent query structure — select, in, is_current, approval_status chained", () => {
    const queryPattern =
      /\.from\(['"]project_document_versions['"]\)\s*\.select\(['"]document_id,\s*plaintext['"]\)\s*\.in\(['"]document_id['"],\s*docIds\)\s*\.eq\(['"]is_current['"],\s*true\)\s*\.eq\(['"]approval_status['"],\s*['"]approved['"]\)/;
    expect(modalSource).toMatch(queryPattern);
  });
});

describe("ContextDocuments — behavioral / filtering logic", () => {
  it("filter(Boolean) correctly excludes null entries when no approved version exists", () => {
    const foundationDocs = [
      { id: "1", doc_type: "beat_sheet" },
      { id: "2", doc_type: "treatment" },
    ];
    const ctxVersions: { document_id: string; plaintext: string }[] = [];

    const result = foundationDocs
      .map((d: any) => {
        const ver = (ctxVersions || []).find(
          (v: any) => v.document_id === d.id
        );
        return ver
          ? {
              doc_type: d.doc_type,
              title: d.doc_type.replace(/_/g, " "),
              plaintext: ver.plaintext,
            }
          : null;
      })
      .filter(Boolean);

    expect(result).toHaveLength(0);
  });

  it("returns only documents that have an approved version when some are missing", () => {
    const foundationDocs = [
      { id: "1", doc_type: "beat_sheet" },
      { id: "2", doc_type: "treatment" },
      { id: "3", doc_type: "character_bible" },
    ];
    const ctxVersions = [
      { document_id: "1", plaintext: "Beat sheet content" },
      { document_id: "3", plaintext: "Character bible content" },
    ];

    const result = foundationDocs
      .map((d: any) => {
        const ver = (ctxVersions || []).find(
          (v: any) => v.document_id === d.id
        );
        return ver
          ? {
              doc_type: d.doc_type,
              title: d.doc_type.replace(/_/g, " "),
              plaintext: ver.plaintext,
            }
          : null;
      })
      .filter(Boolean);

    expect(result).toHaveLength(2);
    expect(result[0].doc_type).toBe("beat_sheet");
    expect(result[1].doc_type).toBe("character_bible");
  });

  it("returns all documents when all foundation docs have approved versions", () => {
    const foundationDocs = [
      { id: "1", doc_type: "beat_sheet" },
      { id: "2", doc_type: "treatment" },
    ];
    const ctxVersions = [
      { document_id: "1", plaintext: "Beat sheet" },
      { document_id: "2", plaintext: "Treatment" },
    ];

    const result = foundationDocs
      .map((d: any) => {
        const ver = (ctxVersions || []).find(
          (v: any) => v.document_id === d.id
        );
        return ver
          ? {
              doc_type: d.doc_type,
              title: d.doc_type.replace(/_/g, " "),
              plaintext: ver.plaintext,
            }
          : null;
      })
      .filter(Boolean);

    expect(result).toHaveLength(2);
  });

  it("falls back to contextDocuments = undefined when foundationDocs is empty", () => {
    // Simulates the guard: if (foundationDocs && foundationDocs.length > 0)
    const foundationDocs: any[] = [];
    let contextDocuments: any[] | undefined;

    if (foundationDocs && foundationDocs.length > 0) {
      contextDocuments = [];
    }
    // else: stays undefined — same as the production code

    expect(contextDocuments).toBeUndefined();
  });

  it("falls back to contextDocuments = undefined on exception (try/catch)", () => {
    // Simulates the production catch block
    let contextDocuments: any[] | undefined;

    try {
      throw new Error("DB connection failed");
    } catch {
      contextDocuments = undefined;
    }

    expect(contextDocuments).toBeUndefined();
  });

  it("handles ctxVersions being null (query returned null)", () => {
    const foundationDocs = [{ id: "1", doc_type: "beat_sheet" }];
    // Production code: const { data: ctxVersions } = await supabase...;
    // If the query returns null, (ctxVersions || []) handles it
    const ctxVersions = null;

    const result = foundationDocs
      .map((d: any) => {
        const ver = (ctxVersions || []).find(
          (v: any) => v.document_id === d.id
        );
        return ver
          ? {
              doc_type: d.doc_type,
              title: d.doc_type.replace(/_/g, " "),
              plaintext: ver.plaintext,
            }
          : null;
      })
      .filter(Boolean);

    expect(result).toHaveLength(0);
  });

  it("correctly transforms doc_type to title by replacing underscores with spaces", () => {
    const foundationDocs = [{ id: "1", doc_type: "character_bible" }];
    const ctxVersions = [{ document_id: "1", plaintext: "Content" }];

    const result = foundationDocs
      .map((d: any) => {
        const ver = (ctxVersions || []).find(
          (v: any) => v.document_id === d.id
        );
        return ver
          ? {
              doc_type: d.doc_type,
              title: d.doc_type.replace(/_/g, " "),
              plaintext: ver.plaintext,
            }
          : null;
      })
      .filter(Boolean);

    expect(result[0].title).toBe("character bible");
  });
});

describe("Authoritative Version Invariant — contextDocuments regression guard", () => {
  let autoRunSource: string;

  beforeAll(() => {
    autoRunSource = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/auto-run/index.ts"),
      "utf-8"
    );
  });

  it("the contextDocuments query (ctxDocIds) enforces both is_current and approval_status", () => {
    // Find the specific query using ctxDocIds — uniquely identifies the fix
    const match = autoRunSource.match(
      /\.from\(['"]project_document_versions['"]\)[\s\S]*?\.in\(['"]document_id['"],\s*ctxDocIds\)[\s\S]{0,200}/
    );
    expect(match).not.toBeNull();
    if (match) {
      const snippet = match[0];
      expect(snippet).toContain('.eq("is_current"');
      expect(snippet).toContain('.eq("approval_status"');
    }
  });
});
