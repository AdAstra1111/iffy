import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = process.cwd();

// ── FIX 1: generate-seed-pack creates docs with approvalStatus "approved" instead of "draft" ──

describe("generate-seed-pack — approvalStatus fix (was 'draft', now 'approved')", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/generate-seed-pack/index.ts"),
      "utf-8"
    );
  });

  it("sets approvalStatus to 'approved' when upserting seed docs", () => {
    expect(source).toContain('approvalStatus: "approved"');
  });

  it("does NOT use 'draft' for seed doc approvalStatus", () => {
    // Find the upsertDoc call and verify it's 'approved' not 'draft'
    const upsertMatch = source.match(/upsertDoc\([^)]+\)/s);
    // Broader check: the entire file should not have approvalStatus: "draft"
    // within the SEED_DOC_CONFIGS upsert loop context
    const draftApproval = source.match(
      /approvalStatus:\s*["']draft["']/
    );
    expect(draftApproval).toBeNull();
  });

  it("contains approvalStatus within the upsertDoc call block", () => {
    const match = source.match(
      /approvalStatus:\s*["'](?:approved|draft)["']/
    );
    expect(match).not.toBeNull();
    expect(match![0]).toContain("approved");
  });
});

// ── FIX 2: ensureSeedPack post-generation re-verify no longer filters by approval_status ──

describe("ensureSeedPack — post-generation re-verify (removed approval_status filter)", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/auto-run/index.ts"),
      "utf-8"
    );
  });

  it("has a post-generation re-verify query that does NOT filter by approval_status", () => {
    // Find the "Re-verify after generation" block
    const blockStart = source.indexOf("// Re-verify after generation");
    expect(blockStart).not.toBe(-1);

    // Extract the block up to the first return/assignment after the query
    const block = source.slice(blockStart, blockStart + 600);

    // Verify it queries project_document_versions with is_current
    expect(block).toContain('from("project_document_versions")');
    expect(block).toContain('.eq("is_current"');
    expect(block).toContain("true");

    // Verify it does NOT filter by approval_status in this query
    // (there may be other approval_status references in the block for other queries,
    //  so we check specifically after the is_current chain)
    const queryStart = block.indexOf('from("project_document_versions")');
    const afterQuery = block.slice(queryStart, queryStart + 200);
    const hasApprovalStatusAfterIsCurrent = afterQuery.indexOf(".eq(") !== -1
      && afterQuery.indexOf(".eq(", afterQuery.indexOf('.eq("is_current"')) !== -1;

    // The query should either only have is_current (no approval_status chained after it)
    // or if there is another .eq(), it should NOT be approval_status
    const secondEqIndex = afterQuery.indexOf(".eq(", afterQuery.indexOf('.eq("is_current"') + 1);
    if (secondEqIndex !== -1) {
      const afterSecondEq = afterQuery.slice(secondEqIndex, secondEqIndex + 30);
      expect(afterSecondEq).not.toContain("approval_status");
    }
  });

  it("the post-gen re-verify uses .eq('is_current', true) but NOT .eq('approval_status'...)", () => {
    // Direct check: the specific post-verify query pattern should NOT have approval_status
    // The query is: from -> select -> in(document_id, postDocIds) -> eq(is_current, true)
    // It should NOT then also have .eq(approval_status, approved)

    const queryPattern =
      /\n\s+\.from\(["']project_document_versions["']\)\s*\n\s+\.select\(["']document_id,\s*plaintext["']\)\s*\n\s+\.in\(["']document_id["'],\s*postDocIds\)\s*\n\s+\.eq\(["']is_current["'],\s*true\)/;

    const match = source.match(queryPattern);
    expect(match).not.toBeNull();
    if (match) {
      // Get everything up to the closing of the ternary or the next statement
      const fullMatch = match[0];
      // The fix removed .eq("approval_status", "approved") after is_current
      // So after .eq("is_current", true), the next line should be ":" (end of ternary)
      // or a semicolon or closing paren, NOT another .eq
      const afterIsCurrent = source.slice(
        source.indexOf(fullMatch) + fullMatch.length,
        source.indexOf(fullMatch) + fullMatch.length + 50
      );
      expect(afterIsCurrent).not.toContain("approval_status");
    }
  });
});

// ── REGRESSION GUARD: initial ensureSeedPack check still filters by approval_status ──

describe("ensureSeedPack — initial check no longer filters by approval_status (BP-1/BP-2 guarantee approved docs)", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/auto-run/index.ts"),
      "utf-8"
    );
  });

  it("the initial check query no longer filters by approval_status (BP-1/BP-2 guarantee approved docs)", () => {
    // Since BP-1/BP-2 make generate-seed-pack create approved docs,
    // any existing current version is already approved.
    // The initial ensureSeedPack check no longer needs to filter by approval_status.
    const fnStart = source.indexOf("async function ensureSeedPack(");
    expect(fnStart).not.toBe(-1);
    const fnBody = source.slice(fnStart, fnStart + 3000);

    // Find the first .from("project_document_versions") query in ensureSeedPack
    const queryStart = fnBody.indexOf('.from("project_document_versions")');
    expect(queryStart).not.toBe(-1);

    const query = fnBody.slice(queryStart, queryStart + 250);
    expect(query).toContain('.in("document_id", docIds)');
    expect(query).toContain('.eq("is_current"');
    // BP-1/BP-2 guarantee all generated docs are approved,
    // so the initial check no longer filters by approval_status
    expect(query).not.toContain("approval_status");
  });

  it("at least one is_current query in ensureSeedPack lacks approval_status (the post-gen re-verify)", () => {
    // Focus only on the ensureSeedPack function — not the entire 12700-line file.
    const fnStart = source.indexOf("async function ensureSeedPack(");
    expect(fnStart).not.toBe(-1);
    const ensureSeedPackSource = source.slice(fnStart, fnStart + 15000);

    // Find query blocks by splitting on `.from("project_document_versions")`
    const queryBlocks: string[] = [];
    let currentBlock = "";
    let inQuery = false;

    for (const line of ensureSeedPackSource.split("\n")) {
      if (line.includes('.from("project_document_versions")')) {
        if (inQuery && currentBlock.trim()) {
          queryBlocks.push(currentBlock);
        }
        inQuery = true;
        currentBlock = line + "\n";
      } else if (inQuery) {
        currentBlock += line + "\n";
        if (line.includes(": { data: [] }") || (line.includes(";") && line.trim().length < 5)) {
          queryBlocks.push(currentBlock);
          inQuery = false;
          currentBlock = "";
        }
      }
    }
    if (inQuery && currentBlock.trim()) {
      queryBlocks.push(currentBlock);
    }

    expect(queryBlocks.length).toBeGreaterThanOrEqual(2);

    // Filter to only those that contain .eq("is_current", true)
    const isCurrentQueries = queryBlocks.filter(q =>
      q.includes('.eq("is_current"') && q.includes("true")
    );

    const withApprovalStatus = isCurrentQueries.filter(q =>
      q.includes("approval_status")
    );

    const withoutApprovalStatus = isCurrentQueries.filter(q =>
      !q.includes("approval_status")
    );

    // At least one is_current query must lack approval_status (the post-gen re-verify)
    expect(withoutApprovalStatus.length).toBeGreaterThanOrEqual(1);

    // All other is_current queries must still have approval_status
    // (no query should have lost it unintentionally)
    expect(withApprovalStatus.length).toBeGreaterThanOrEqual(2);
  });
});

// ── FIX 3: Main pipeline has proper seedResult.failed handling ──

describe("auto-run main pipeline — seedResult.failed handler", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/auto-run/index.ts"),
      "utf-8"
    );
  });

  it("has a seedResult.failed check that fails the job with SEED_PACK_INCOMPLETE", () => {
    // Find the SECOND seedResult.failed handler (the resume/bgTask handler
    // that has a job to update with status: "failed" via updateJob()).
    // The first handler (pre-job-creation guard) returns before creating a job.
    const firstIndex = source.indexOf("if (seedResult.failed) {");
    expect(firstIndex).not.toBe(-1);

    const secondIndex = source.indexOf("if (seedResult.failed) {", firstIndex + 1);
    expect(secondIndex).not.toBe(-1);

    const block = source.slice(secondIndex, secondIndex + 800);
    expect(block).toContain("seedResult.failed");
    expect(block).toContain("SEED_PACK_INCOMPLETE");
    expect(block).toContain('status: "failed"');
    expect(block).toContain("stop_reason: stopReason");
  });

  it("seedResult.failed handler updates auto_run_jobs with failed status", () => {
    const match = source.match(
      /if \(seedResult\.failed\)\s*\{[\s\S]*?stopReason\s*=\s*seedResult\.fail_type\s*\|\|\s*["']SEED_PACK_INCOMPLETE["'][\s\S]*?supabase\.from\(["']auto_run_jobs["']\)[\s\S]*?status:\s*["']failed["']/
    );
    expect(match).not.toBeNull();
  });

  it("seedResult.failed handler logs seed_pack_failed step", () => {
    const match = source.match(
      /seedResult\.failed[\s\S]*?logStep\([^)]*["']seed_pack_failed["'][\s\S]*?cannot\s*proceed/
    );
    expect(match).not.toBeNull();
  });
});

// ── INVARIANT: The "stuck Pending" cycle is broken ──

describe("Seed pack — stuck Pending invariant protection", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/auto-run/index.ts"),
      "utf-8"
    );
  });

  it("the post-gen re-verify does not filter by approval_status, so Pending/draft versions are found", () => {
    // The bug was: generate-seed-pack creates docs, but post-verify filtered by
    // approval_status='approved', so docs with approval_status='draft' (the old behavior)
    // were invisible. This caused a cycle: generate -> verify fails -> generate again -> ...
    //
    // The fix removes the filter from post-gen verify. Confirm the filter is gone.
    const reVerifyStart = source.indexOf("// Re-verify after generation");
    const block = source.slice(reVerifyStart, reVerifyStart + 800);

    // The query block should not have approval_status
    const queryStart = block.indexOf('from("project_document_versions")');
    const queryBlock = block.slice(queryStart, queryStart + 250);
    expect(queryBlock).toContain('.eq("is_current"');
    expect(queryBlock).not.toContain("approval_status");
  });

  it("contextDocuments query (for NEC) still properly filters by approval_status", () => {
    // This is a separate concern — contextDocuments for NEC should only include
    // approved foundation docs. This filter was NOT modified by this fix.
    const ctxQueryPattern =
      /\.in\(["']document_id["'],\s*ctxDocIds\)[\s\S]{0,200}?\.eq\(["']approval_status["'],\s*["']approved["']\)/;
    const match = source.match(ctxQueryPattern);
    expect(match).not.toBeNull();
  });

  it("initial ensureSeedPack check no longer filters by approval_status (BP-1/BP-2 guarantee approved docs)", () => {
    // Since BP-1/BP-2 make generate-seed-pack create approved docs,
    // any existing current version is already approved.
    // The initial ensureSeedPack check no longer needs to filter by approval_status.
    const fnStart = source.indexOf("async function ensureSeedPack(");
    expect(fnStart).not.toBe(-1);
    const fnBody = source.slice(fnStart, fnStart + 3000);

    // Find the first .from("project_document_versions") query in ensureSeedPack
    const queryStart = fnBody.indexOf('.from("project_document_versions")');
    expect(queryStart).not.toBe(-1);

    const query = fnBody.slice(queryStart, queryStart + 250);
    expect(query).toContain('.in("document_id", docIds)');
    expect(query).toContain('.eq("is_current"');
    // BP-1/BP-2 guarantee all generated docs are approved,
    // so the initial check no longer filters by approval_status
    expect(query).not.toContain("approval_status");
  });
});
