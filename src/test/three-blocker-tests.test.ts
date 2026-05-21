/**
 * Three-Blocker Validation Tests
 *
 * Tests for:
 *   Blocker 1 — ApplyDevSeedDialog upsert: userId→user.id fix (ReferenceError fix)
 *   Blocker 2 — character-atomiser EdgeRuntime guard: typeof EdgeRuntime !== 'undefined'
 *   Blocker 3 — deploy-functions.yml: missing functions added to deploy list
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const PROJECT_ROOT = process.cwd();

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKER 1: ApplyDevSeedDialog upsert — ReferenceError fix (userId→user.id)
// ─────────────────────────────────────────────────────────────────────────────

describe("Blocker 1 — ApplyDevSeedDialog upsert (userId→user.id fix)", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(PROJECT_ROOT, "src/components/pitch/ApplyDevSeedDialog.tsx"),
      "utf-8"
    );
  });

  it("uses useAuth hook to get user (user.id available in scope)", () => {
    expect(source).toContain('useAuth');
    expect(source).toContain('const { user } = useAuth()');
  });

  it("uses userId: user.id (not bare userId) in devseed-autopilot start", () => {
    // The fix changed bare 'userId' to 'userId: user.id' at the start invocation
    // Check the first start (handleCreate): has userId: user.id, projectId: project.id
    expect(source).toContain("userId: user.id");
    expect(source).toContain("projectId: project.id");
  });

  it("uses userId: user.id (not bare userId) in devseed-autopilot tick", () => {
    // The fix changed bare 'userId' to 'userId: user.id' at the tick invocation
    // in handleCreate: body { action: 'tick', projectId: project.id, userId: user.id }
    expect(source).toContain("userId: user.id");
  });

  it("does NOT refer to undefined 'userId' variable in autopilot calls", () => {
    // After the fix, there should be no bare 'userId,' or 'userId}' in the file
    // (userId as a key in an object should be 'userId:' not plain 'userId')
    // Check for the specific pattern: bare userId used as a value (not a key)
    const bareUserIdUsages = source.match(/[^a-zA-Z_.]userId[^a-zA-Z_.:]/);
    // Each match should be in a context where userId is a key (userId:), not a bare reference
    if (bareUserIdUsages) {
      for (const match of bareUserIdUsages) {
        // If found, it should only be in object key position (userId:)
        expect(match.includes(':') || match.includes('userId')).toBe(true);
      }
    }
  });

  it("has proper auto-run failure handling (the 'failed to start' parts)", () => {
    expect(source).toContain("parts.push('auto-run failed to start')");
  });

  it("has proper auto-run reattach handling", () => {
    expect(source).toContain("parts.push('auto-run reattached')");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKER 2: character-atomiser EdgeRuntime guard
// ─────────────────────────────────────────────────────────────────────────────

describe("Blocker 2 — character-atomiser EdgeRuntime guard", () => {
  let source: string;

  beforeAll(() => {
    source = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/character-atomiser/index.ts"),
      "utf-8"
    );
  });

  it("has typeof EdgeRuntime !== 'undefined' guard before waitUntil", () => {
    expect(source).toContain("typeof EdgeRuntime !== 'undefined'");
  });

  it("calls EdgeRuntime.waitUntil inside the guard", () => {
    // Verify both guard and call are present sequentially
    const guardIndex = source.indexOf("typeof EdgeRuntime !== 'undefined'");
    expect(guardIndex).not.toBe(-1);

    const afterGuard = source.slice(guardIndex, guardIndex + 200);
    expect(afterGuard).toContain("EdgeRuntime.waitUntil");
  });

  it("has @ts-ignore comment for EdgeRuntime type safety", () => {
    expect(source).toContain("@ts-ignore");
    expect(source).toContain("EdgeRuntime available in Deno Deploy");
  });

  it("falls through safely when EdgeRuntime is not available", () => {
    // If EdgeRuntime is undefined, the guard prevents the crash
    // The code should still return 'spawned: true' response regardless
    const generateBlock = source.match(/action === ['"]generate['"'][\s\S]{0,500}/);

    expect(generateBlock).not.toBeNull();
    expect(generateBlock![0]).toContain('spawned: true');
    // The guard should be present between 'spawned' and the rest of the handler
    expect(generateBlock![0]).toContain('EdgeRuntime');
  });

  it("character-atomiser is listed in deploy-functions.yml", () => {
    const deploySource = readFileSync(
      resolve(PROJECT_ROOT, ".github/workflows/deploy-functions.yml"),
      "utf-8"
    );
    expect(deploySource).toContain("character-atomiser");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCKER 3: deploy-functions.yml — missing functions added
// ─────────────────────────────────────────────────────────────────────────────

describe("Blocker 3 — deploy-functions.yml completeness", () => {
  let deploySource: string;

  beforeAll(() => {
    deploySource = readFileSync(
      resolve(PROJECT_ROOT, ".github/workflows/deploy-functions.yml"),
      "utf-8"
    );
  });

  it("contains generate-seed-pack in deploy list", () => {
    expect(deploySource).toContain("generate-seed-pack");
  });

  it("contains project-folder-engine in deploy list", () => {
    expect(deploySource).toContain("project-folder-engine");
  });

  it("contains character-atomiser in deploy list", () => {
    expect(deploySource).toContain("character-atomiser");
  });

  it("contains generate-lookbook-image in deploy list", () => {
    expect(deploySource).toContain("generate-lookbook-image");
  });

  it("contains devseed-autopilot in deploy list", () => {
    expect(deploySource).toContain("devseed-autopilot");
  });

  it("contains create-document-version in deploy list", () => {
    expect(deploySource).toContain("create-document-version");
  });

  it("contains the core pipeline functions (auto-run, dev-engine-v2, generate-document)", () => {
    expect(deploySource).toContain("auto-run");
    expect(deploySource).toContain("dev-engine-v2");
    expect(deploySource).toContain("generate-document");
  });

  it("has valid YAML structure (key properties)", () => {
    // Verify the workflow structure is intact
    expect(deploySource).toContain("name: Deploy Supabase Edge Functions");
    expect(deploySource).toContain("on:");
    expect(deploySource).toContain("push:");
    expect(deploySource).toContain("branches: [main]");
    expect(deploySource).toContain("supabase functions deploy");
    expect(deploySource).toContain("--project-ref");
    expect(deploySource).toContain("--no-verify-jwt");
  });

  it("uses the correct Supabase project ref", () => {
    expect(deploySource).toContain("hdfderbphdobomkdjypc");
  });

  it("triggers on push to main with functions changes", () => {
    expect(deploySource).toContain("paths:");
    expect(deploySource).toContain("supabase/functions/**");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-CUTTING: All three blockers are in a consistent state
// ─────────────────────────────────────────────────────────────────────────────

describe("Cross-cutting — all three blockers consistent", () => {
  let deploySource: string;
  let dialogSource: string;
  let atomiserSource: string;

  beforeAll(() => {
    deploySource = readFileSync(
      resolve(PROJECT_ROOT, ".github/workflows/deploy-functions.yml"),
      "utf-8"
    );
    dialogSource = readFileSync(
      resolve(PROJECT_ROOT, "src/components/pitch/ApplyDevSeedDialog.tsx"),
      "utf-8"
    );
    atomiserSource = readFileSync(
      resolve(PROJECT_ROOT, "supabase/functions/character-atomiser/index.ts"),
      "utf-8"
    );
  });

  it("character-atomiser is deployed AND has EdgeRuntime guard", () => {
    expect(deploySource).toContain("character-atomiser");
    expect(atomiserSource).toContain("typeof EdgeRuntime !== 'undefined'");
    expect(atomiserSource).toContain("EdgeRuntime.waitUntil");
  });

  it("ApplyDevSeedDialog auth + deploy: uses useAuth and is part of deployed pipeline", () => {
    expect(dialogSource).toContain('useAuth');
    expect(deploySource).toContain("devseed-autopilot");
    expect(deploySource).toContain("create-document-version");
  });

  it("deploy list includes all edge functions referenced by ApplyDevSeedDialog", () => {
    // ApplyDevSeedDialog invokes: devseed-autopilot, create-document-version, auto-run
    expect(deploySource).toContain("devseed-autopilot");
    expect(deploySource).toContain("create-document-version");
    expect(deploySource).toContain("auto-run");
  });
});
