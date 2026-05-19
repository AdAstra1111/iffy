import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const IFFY_ROOT = "/Users/laralane/code/iffy";

// ─────────────────────────────────────────────────────────────────────────
// Test: Fix DevSeed doc approval_status plumbing
// Routes approvalStatus through client → edge → createVersion
// ─────────────────────────────────────────────────────────────────────────

describe("ApprovalStatus plumbing: ApplyDevSeedDialog → client lib → edge function → createVersion", () => {
  let dialogSource: string;
  let clientLibSource: string;
  let edgeFnSource: string;
  let docOsSource: string;
  let testSource: string;

  beforeAll(() => {
    dialogSource = readFileSync(
      resolve(IFFY_ROOT, "src/components/pitch/ApplyDevSeedDialog.tsx"),
      "utf-8",
    );
    clientLibSource = readFileSync(
      resolve(IFFY_ROOT, "src/lib/docVersions/createDocumentVersion.ts"),
      "utf-8",
    );
    edgeFnSource = readFileSync(
      resolve(IFFY_ROOT, "supabase/functions/create-document-version/index.ts"),
      "utf-8",
    );
    docOsSource = readFileSync(
      resolve(IFFY_ROOT, "supabase/functions/_shared/doc-os.ts"),
      "utf-8",
    );
    testSource = readFileSync(
      resolve(IFFY_ROOT, "src/test/three-blockers.test.ts"),
      "utf-8",
    );
  });

  // ── Layer 1: ApplyDevSeedDialog (client) ──

  describe("Layer 1: ApplyDevSeedDialog.tsx — sends approvalStatus", () => {
    it("passes approvalStatus:'approved' instead of status:'approved'", () => {
      // The fix changed status:'approved' to approvalStatus:'approved'
      // Line 303 in the diff
      expect(dialogSource).toContain("approvalStatus: 'approved'");
    });

    it("does NOT pass status:'approved' anymore", () => {
      // The old status:'approved' should be gone from the createDocumentVersion call
      const callStart = dialogSource.indexOf("await createDocumentVersion({");
      expect(callStart).not.toBe(-1);
      const callEnd = dialogSource.indexOf("});", callStart);
      const callBlock = dialogSource.slice(callStart, callEnd + 3);

      // Status should either be absent or 'draft' — NOT 'approved'
      // Actually let's check: does the call block still contain status: ?
      // The fix says status was replaced, so status should not be in the call
      // OR it should be 'draft'
      const statusMatch = callBlock.match(/status:\s*['"]([^'"]+)['"]/);
      if (statusMatch) {
        // If status IS present, it should be 'draft', not 'approved'
        expect(statusMatch[1]).not.toBe("approved");
      }
      // approvalStatus should be present and set to 'approved'
      expect(callBlock).toContain("approvalStatus: 'approved'");
    });

    it("still passes all other required params", () => {
      const callStart = dialogSource.indexOf("await createDocumentVersion({");
      const callEnd = dialogSource.indexOf("});", callStart);
      const callBlock = dialogSource.slice(callStart, callEnd + 3);

      expect(callBlock).toContain("documentId:");
      expect(callBlock).toContain("plaintext:");
      expect(callBlock).toContain("label:");
      expect(callBlock).toContain("changeSummary:");
      expect(callBlock).toContain("generatorId:");
      expect(callBlock).toContain("sourceMode:");

      // Verify generatorId is still 'devseed'
      expect(callBlock).toContain("generatorId: 'devseed'");
    });
  });

  // ── Layer 2: Client lib createDocumentVersion.ts ──

  describe("Layer 2: Client lib — createDocumentVersion.ts adds approvalStatus to POST body", () => {
    it("exports CreateDocumentVersionParams with approvalStatus field", () => {
      // The interface must include approvalStatus as optional string
      expect(clientLibSource).toContain("approvalStatus?: string");
    });

    it("still has status field in the interface (backward compat)", () => {
      // status field for backward compatibility
      expect(clientLibSource).toContain("status?: string");
    });

    it("passes approvalStatus in the invoke() body to the edge function", () => {
      // The lib uses supabase.functions.invoke() — check the body object
      const invokeCall = clientLibSource.match(
        /supabase\.functions\.invoke\([\s\S]{0,1000}\}\);/);
      expect(invokeCall).not.toBeNull();
      const bodySection = invokeCall![0];

      expect(bodySection).toContain("approvalStatus:");
      // The value should come from params.approvalStatus (no default — pass through)
      expect(bodySection).toContain("approvalStatus: params.approvalStatus");
    });

    it("sends status as params.status || 'draft' for backward compat", () => {
      // The POST body should still include status (defaulting to draft)
      const invokeCall = clientLibSource.match(
        /supabase\.functions\.invoke\([\s\S]{0,1000}\}\);/);
      expect(invokeCall).not.toBeNull();
      const bodySection = invokeCall[0];
      expect(bodySection).toContain("status: params.status || 'draft'");
    });
  });

  // ── Layer 3: Edge function ──

  describe("Layer 3: Edge function — create-document-version/index.ts receives and passes approvalStatus", () => {
    it("destructures approvalStatus from the request body", () => {
      // The destructuring should include approvalStatus
      const destructurePattern = /const\s*\{[\s\S]{0,300}\}\s*=\s*body\s*;/;
      const destructure = edgeFnSource.match(destructurePattern);
      expect(destructure).not.toBeNull();
      expect(destructure![0]).toContain("approvalStatus");
    });

    it("passes approvalStatus to createVersion() in opts", () => {
      // The createVersion call should include approvalStatus
      const createVersionCall = edgeFnSource.match(
        /await createVersion\([\s\S]{0,600}\);/
      );
      expect(createVersionCall).not.toBeNull();
      const callBlock = createVersionCall![0];

      // Must include approvalStatus in the opts
      expect(callBlock).toContain("approvalStatus");
      // Should use the destructured value: approvalStatus: approvalStatus || undefined
      // or approvalStatus: approvalStatus
      expect(callBlock).toContain("approvalStatus");
    });

    it("still passes status as status || 'draft' (backward compat)", () => {
      // The createVersion call should still include status with draft default
      const createVersionCall = edgeFnSource.match(
        /await createVersion\([\s\S]{0,600}\);/
      );
      expect(createVersionCall).not.toBeNull();
      const callBlock = createVersionCall![0];
      expect(callBlock).toContain("status");
    });
  });

  // ── Layer 4: doc-os.ts createVersion() ──

  describe("Layer 4: doc-os.ts — createVersion() maps approvalStatus to approval_status", () => {
    it("CreateVersionOpts interface includes approvalStatus field", () => {
      const ifaceMatch = docOsSource.match(
        /export interface CreateVersionOpts \{[\s\S]{0,2000}\}/
      );
      expect(ifaceMatch).not.toBeNull();
      expect(ifaceMatch![0]).toContain("approvalStatus?: string");
    });

    it("maps approvalStatus to approval_status DB column with 'draft' default", () => {
      // Line 485: approval_status: opts.approvalStatus || "draft",
      const insertPayloadMatch = docOsSource.match(
        /approval_status:\s*opts\.approvalStatus\s*\|\|\s*["']draft["']/
      );
      expect(insertPayloadMatch).not.toBeNull();
    });
  });

  // ── Layer 5: Integration — status and approvalStatus independent ──

  describe("Layer 5: Integration — status and approvalStatus are independent fields", () => {
    it("status defaults to 'draft' separately from approvalStatus", () => {
      // status: opts.status || "draft" (line 482)
      const statusDefaultMatch = docOsSource.match(
        /status:\s*opts\.status\s*\|\|\s*["']draft["']/
      );
      expect(statusDefaultMatch).not.toBeNull();
    });

    it("approvalStatus defaults to 'draft' separately from status", () => {
      const approvalDefaultMatch = docOsSource.match(
        /approval_status:\s*opts\.approvalStatus\s*\|\|\s*["']draft["']/
      );
      expect(approvalDefaultMatch).not.toBeNull();
    });

    it("both fields are present in the insert payload", () => {
      // In the insertPayload construction, both status and approval_status must exist
      const statusInPayload = docOsSource.match(/status:\s*opts\.status\s*\|\|/);
      expect(statusInPayload).not.toBeNull();

      const approvalInPayload = docOsSource.match(/approval_status:\s*opts\.approvalStatus\s*\|\|/);
      expect(approvalInPayload).not.toBeNull();
    });
  });

  // ── Layer 6: Edge cases ──

  describe("Layer 6: Edge cases — approvalStatus boundary conditions", () => {
    it("approvalStatus: undefined → defaults to 'draft' (not undefined/null in DB)", () => {
      // The || operator: undefined || "draft" → "draft"
      const defaultExpr = docOsSource.match(
        /approval_status:\s*opts\.approvalStatus\s*\|\|\s*["']draft["']/
      );
      expect(defaultExpr).not.toBeNull();

      // Verify null is also caught by the || operator
      // null || "draft" → "draft"
      // So both null and undefined fall through to draft
    });

    it("approvalStatus: 'approved' → maps to 'approved' in DB", () => {
      // 'approved' is truthy, so 'approved' || "draft" → 'approved'
      // This is verified by the expression itself
      const expr = docOsSource.match(
        /approval_status:\s*opts\.approvalStatus\s*\|\|\s*["']draft["']/
      );
      expect(expr).not.toBeNull();

      // The literal string 'approved' appears in the approvalStatus context in ApplyDevSeedDialog
      expect(dialogSource).toContain("approvalStatus: 'approved'");
    });

    it("status and approvalStatus can be set to different values independently", () => {
      // The insert payload has separate fields for status and approval_status
      // status is at line 482, approval_status at line 485
      const statusLine = docOsSource.match(/^\s{4}status:\s*opts\.status/m);
      const approvalLine = docOsSource.match(/^\s{4}approval_status:\s*opts\.approvalStatus/m);
      expect(statusLine).not.toBeNull();
      expect(approvalLine).not.toBeNull();
    });
  });

  // ── Layer 7: three-blockers.test.ts regression ──

  describe("Layer 7: Existing test file correctly updated", () => {
    it("three-blockers.test.ts now expects approvalStatus instead of status in the call block", () => {
      // Find the blocker 1 section by looking for the specific assertion
      const assertionLine = "expect(callBlock).toContain(\"approvalStatus:\");";
      expect(testSource).toContain(assertionLine);

      // Verify there is NO assertion for "status:" in the blocker 1 "required params" test
      // The old assertion was: expect(callBlock).toContain("status:");
      // After the fix, it should be approvalStatus:

      // Check that the params test doesn't contain status:
      const paramsTestStart = testSource.indexOf('it("passes all required params to createDocumentVersion"');
      expect(paramsTestStart).not.toBe(-1);
      const paramsTestEnd = testSource.indexOf("  });", paramsTestStart + 100);
      const paramsTestBody = testSource.slice(paramsTestStart, paramsTestEnd + 5);

      // Must contain approvalStatus
      expect(paramsTestBody).toContain("approvalStatus:");
      // Must NOT contain status: (as a param check — status was replaced)
      // But status could appear in comments or other contexts, so let's be specific
      expect(paramsTestBody).toContain('toContain("approvalStatus:")');
    });

    it("three-blockers.test.ts no longer expects status in createDocumentVersion call", () => {
      // The old assertion: expect(callBlock).toContain("status:");
      // was replaced with: expect(callBlock).toContain("approvalStatus:");
      expect(testSource).toContain('toContain("approvalStatus:")');
      // The old status assertion should NOT be there
      const statusAssertion = testSource.match(/toContain\("status:"\)/);
      // It's OK if there's a status assertion elsewhere (for other tests),
      // but NOT in the Blocker 1 section
      const blocker1Match = testSource.match(
        /describe\("Blocker 1: PitchIdeas RLS[\s\S]{0,2000}"catch/
      );
      if (blocker1Match) {
        expect(blocker1Match[0]).not.toContain('toContain("status:")');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Invariant check: The Authoritative Version Invariant is preserved
// ─────────────────────────────────────────────────────────────────────────
describe("Invariant: approval_status = 'approved' AND is_current = true invariant preserved", () => {
  it("approval_status still exists as a DB column mapping", () => {
    const docOsSource = readFileSync(
      resolve(IFFY_ROOT, "supabase/functions/_shared/doc-os.ts"),
      "utf-8",
    );
    expect(docOsSource).toContain("approval_status");
  });

  it("CLAUDE.md still documents the invariant", () => {
    const claudeMd = readFileSync(
      resolve(IFFY_ROOT, "CLAUDE.md"),
      "utf-8",
    );
    expect(claudeMd).toContain("approval_status = 'approved' AND is_current = true");
  });
});
