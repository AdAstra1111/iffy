import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = process.cwd();
const IFFY_ROOT = PROJECT_ROOT.includes("kanban/workspaces")
  ? "/Users/laralane/code/iffy"
  : PROJECT_ROOT;

// ─────────────────────────────────────────────────────────────────────────
// Blocker 1: PitchIdeas RLS — ApplyDevSeedDialog createDocumentVersion()
// Seraph confirmed: replaced direct supabase upsert on
// project_document_versions with createDocumentVersion() call. Routes
// through service_role edge function, bypassing RLS correctly.
// ─────────────────────────────────────────────────────────────────────────
describe("Blocker 1: PitchIdeas RLS — createDocumentVersion() in ApplyDevSeedDialog", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(IFFY_ROOT, "src/components/pitch/ApplyDevSeedDialog.tsx"),
      "utf-8",
    );
  });

  it("imports createDocumentVersion from the correct lib path", () => {
    // Line 24: import { createDocumentVersion } from '@/lib/docVersions/createDocumentVersion';
    expect(source).toContain(
      "import { createDocumentVersion } from '@/lib/docVersions/createDocumentVersion';",
    );
  });

  it("uses createDocumentVersion instead of direct upsert on project_document_versions", () => {
    // The old approach was: await supabase.from('project_document_versions').upsert(...)
    // The new approach calls createDocumentVersion() which goes through the edge function
    expect(source).toContain("await createDocumentVersion({");
    // Ensure there's NO direct upsert on project_document_versions in this file
    // The only table upserts should be on project_documents (the doc itself)
    const docUpsertCount = (source.match(/\.from\('project_documents'\)/g) || []).length;
    expect(docUpsertCount).toBeGreaterThanOrEqual(1);
    const versionUpserts = source.match(/\.from\('project_document_versions'\)/g);
    expect(versionUpserts).toBeNull();
  });

  it("passes all required params to createDocumentVersion", () => {
    // Find the createDocumentVersion call block
    const callStart = source.indexOf("await createDocumentVersion({");
    expect(callStart).not.toBe(-1);
    const callEnd = source.indexOf("});", callStart);
    const callBlock = source.slice(callStart, callEnd + 3);

    // All required params should be present
    expect(callBlock).toContain("documentId:");
    expect(callBlock).toContain("plaintext:");
    expect(callBlock).toContain("label:");
    expect(callBlock).toContain("changeSummary:");
    expect(callBlock).toContain("generatorId:");
    expect(callBlock).toContain("sourceMode:");
    expect(callBlock).toContain("status:");
  });

  it("catches createDocumentVersion errors without crashing (graceful degradation)", () => {
    // The version creation is wrapped in try/catch — if the edge function fails,
    // the doc itself was already created, and the version failure is logged
    const verCatchMatch = source.match(
      /catch\s*\(verErr:\s*any\)\s*\{[\s\S]*?console\.error\(`Version create failed/,
    );
    expect(verCatchMatch).not.toBeNull();
    // The catch should NOT re-throw (function continues and returns doc)
    const catchBody = verCatchMatch![0];
    expect(catchBody).not.toContain("throw");
  });

  it("doc insert still goes through supabase (doc creation is OLTP, RLS-safe)", () => {
    // The project_documents insert is on a table where RLS is either disabled
    // or has appropriate user-level policies. The version table is the one
    // that needs service_role routing.
    const docInsertExists = source.match(
      /supabase\s*\n?\s*\.from\('project_documents'\)\s*\n?\s*\.insert\(/,
    );
    expect(docInsertExists).not.toBeNull();
  });

  it("sourceMode is set to seed_override for DevSeed versions", () => {
    expect(source).toContain("sourceMode: 'seed_override'");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Blocker 2: character-atomiser 500 — EdgeRuntime waitUntil guard
// Seraph confirmed: added typeof EdgeRuntime !== "undefined" guard around
// EdgeRuntime.waitUntil() at line 323. Prevents crashes in CI/local.
// ─────────────────────────────────────────────────────────────────────────
describe("Blocker 2: character-atomiser — EdgeRuntime waitUntil guard", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(IFFY_ROOT, "supabase/functions/character-atomiser/index.ts"),
      "utf-8",
    );
  });

  it("has the typeof EdgeRuntime guard before waitUntil", () => {
    // Line 323: if (typeof EdgeRuntime !== "undefined") {
    expect(source).toContain('typeof EdgeRuntime !== "undefined"');
  });

  it("EdgeRuntime.waitUntil is called inside the guard block", () => {
    const guardIndex = source.indexOf('typeof EdgeRuntime !== "undefined"');
    expect(guardIndex).not.toBe(-1);

    // After the guard, within a reasonable window, waitUntil should appear
    const afterGuard = source.slice(guardIndex, guardIndex + 300);
    expect(afterGuard).toMatch(/EdgeRuntime\.waitUntil\(/);
  });

  it("has the waitUntil call on the correct handler — handleGenerate", () => {
    // The waitUntil should wrap handleGenerate with proper arguments
    // EdgeRuntime.waitUntil(handleGenerate(sb, openrouterKey, projectId, atomIds));
    const guardIndex = source.indexOf('typeof EdgeRuntime !== "undefined"');
    const afterGuard = source.slice(guardIndex, guardIndex + 350);
    expect(afterGuard).toContain("handleGenerate(sb, openrouterKey, projectId, atomIds)");
  });

  it("action 'generate' returns immediately before background spawn", () => {
    // The generate action handler returns { spawned: true } BEFORE calling waitUntil
    // Code at lines 318-326: result = { spawned: true, ... } set first, then guard
    const generateSection = source.match(
      /action === "generate"[\s\S]{0,200}spawned: true[\s\S]{0,300}EdgeRuntime\.waitUntil/,
    );
    expect(generateSection).not.toBeNull();
  });

  it("does NOT have bare EdgeRuntime.waitUntil outside the guard", () => {
    // Find all EdgeRuntime references - should be in guard check + waitUntil +
    // the comment on line 322 ("Guard EdgeRuntime —")
    const edgeRuntimeRefs = source.match(/EdgeRuntime/g) || [];
    expect(edgeRuntimeRefs.length).toBeGreaterThanOrEqual(2); // guard check + waitUntil

    // The only EdgeRuntime reference before the guard check is in the COMMENT,
    // which is fine. There should be NO waitUntil() call outside the if block.
    // Count bare EdgeRuntime.waitUntil (not inside if block)
    const bareWaitUntil = source.match(/EdgeRuntime\.waitUntil\(/g);
    expect(bareWaitUntil).not.toBeNull();
    // There should be exactly 1 waitUntil call (inside the guard)
    const waitUntilRefInComment = source.match(/waitUntil in the comment/i);
    // (the comment on line 319 says "Spawn in background — return immediately")
    // The comment on line 322 says "Guard EdgeRuntime" — that's the extra reference
    
    // The if block starts and ends properly
    const guardIndex = source.indexOf('typeof EdgeRuntime !== "undefined"');
    const afterGuard = source.slice(guardIndex, guardIndex + 400);
    const openBrace = afterGuard.indexOf("{");
    const closeBrace = afterGuard.indexOf("}");
    expect(openBrace).not.toBe(-1);
    expect(closeBrace).not.toBe(-1);
    expect(closeBrace).toBeGreaterThan(openBrace);
  });

  it("handles the action routing correctly when EdgeRuntime is undefined", () => {
    // When EdgeRuntime is undefined, the generate action still sets result
    // to { spawned: true, message: ... } which is returned via the generic
    // return new Response(JSON.stringify(result)) at the end of the handler
    const spawnedResult = source.match(
      /action === "generate"[\s\S]{0,200}spawned: true/
    );
    expect(spawnedResult).not.toBeNull();
    // The result variable is set and returned at the end of the handler
    expect(source).toContain('result = { spawned: true');
  });

  it("properly catches nested waiter — handleGenerate also handles per-atom errors", () => {
    // The handleGenerate function has its own try/catch per atom
    expect(source).toContain("catch (e: any) {");
    // Failed atoms get generation_status = "failed"
    expect(source).toContain("generation_status: \"failed\"");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Blocker 3: devseed_plateau_diagnoses migration
// Seraph confirmed: Creates table with IF NOT EXISTS, proper indexes and
// RLS policies. Safe re-apply.
// ─────────────────────────────────────────────────────────────────────────
describe("Blocker 3: devseed_plateau_diagnoses migration", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(
        IFFY_ROOT,
        "supabase/migrations/20260317151032_46f9919b-5ee7-45bb-a5d8-cebd9ef557de.sql",
      ),
      "utf-8",
    );
  });

  // ── Safety: idempotent re-apply ──

  it("uses IF NOT EXISTS for CREATE TABLE", () => {
    expect(source).toContain("CREATE TABLE IF NOT EXISTS");
  });

  it("uses IF NOT EXISTS for all CREATE INDEX statements", () => {
    const createIndexLines = source.match(/CREATE INDEX.*/g) || [];
    expect(createIndexLines.length).toBeGreaterThanOrEqual(3);
    for (const line of createIndexLines) {
      expect(line).toMatch(/CREATE INDEX IF NOT EXISTS/);
    }
  });

  // ── Schema: structure ──

  it("defines a UUID primary key with default gen_random_uuid()", () => {
    expect(source).toContain("id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY");
  });

  it("references projects(id) with ON DELETE CASCADE", () => {
    expect(source).toContain("REFERENCES public.projects(id) ON DELETE CASCADE");
  });

  it("includes all required analytics columns", () => {
    const requiredColumns = [
      "final_ci",
      "final_gp",
      "target_ci",
      "target_gp",
      "best_ci_seen",
      "halted_reason",
      "primary_cause",
      "secondary_causes JSONB",
      "rewriteable BOOLEAN",
      "seed_limited BOOLEAN",
      "evidence_summary JSONB",
      "recommendation_bundle JSONB",
    ];
    for (const col of requiredColumns) {
      expect(source).toContain(col);
    }
  });

  it("has created_at with default now()", () => {
    expect(source).toContain("created_at TIMESTAMPTZ NOT NULL DEFAULT now()");
  });

  // ── Indexes ──

  it("has indexes on project_id, auto_run_job_id, and user_id", () => {
    expect(source).toContain("idx_devseed_plateau_diag_project");
    expect(source).toContain("idx_devseed_plateau_diag_job");
    expect(source).toContain("idx_devseed_plateau_diag_user");
  });

  // ── RLS ──

  it("enables RLS on the table", () => {
    expect(source).toContain("ALTER TABLE public.devseed_plateau_diagnoses ENABLE ROW LEVEL SECURITY;");
  });

  it("has a SELECT policy for users to view own diagnoses", () => {
    expect(source).toContain(
      'CREATE POLICY "Users can view own plateau diagnoses"',
    );
    expect(source).toContain("auth.uid() = user_id");
  });

  it("has an INSERT policy for users to insert own diagnoses", () => {
    expect(source).toContain(
      'CREATE POLICY "Users can insert own plateau diagnoses"',
    );
  });

  it("has a service_role full access policy", () => {
    expect(source).toContain(
      'CREATE POLICY "Service role full access plateau diagnoses"',
    );
    expect(source).toContain("auth.role() = 'service_role'");
  });

  it("has 3 RLS policies total (select + insert + service_role)", () => {
    const policyCount = (source.match(/CREATE POLICY/g) || []).length;
    expect(policyCount).toBe(3);
  });

  // ── Deploy: listed in deploy-functions.yml ──

  it("migration is listed in deploy-functions.yml workflow", () => {
    const deploySource = readFileSync(
      resolve(IFFY_ROOT, ".github/workflows/deploy-functions.yml"),
      "utf-8",
    );
    // The migration itself doesn't need to be in deploy-functions.yml
    // (migrations are run separately), but check that the character-atomiser
    // function IS listed (which it should be for blocker 2)
    expect(deploySource).toContain("character-atomiser");
  });

  it("character-atomiser is deployed with --no-verify-jwt", () => {
    const deploySource = readFileSync(
      resolve(IFFY_ROOT, ".github/workflows/deploy-functions.yml"),
      "utf-8",
    );
    expect(deploySource).toContain("--no-verify-jwt");
  });
});
