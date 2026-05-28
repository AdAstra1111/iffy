/**
 * Unit tests for lockNarrativeSpine — fires when Concept Brief is approved.
 *
 * Verifies:
 *   1. Primary use case: locks pending_lock entry on CB approval
 *   2. docType guard: no-op on non-concept_brief doc types
 *   3. Edge: no decision_ledger entries → no-op
 *   4. Edge: already locked → no-op
 *   5. Edge: no pending entry → no-op
 *   6. Invariant: only updates the targeted entry
 *   7. Regression: fail-open on DB error (catch + log)
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { lockNarrativeSpine } from "./narrativeSpine.ts";

// ─── Test Helpers ───

function makeMockDb(overrides?: {
  selectResult?: any;
  updateResult?: any;
  selectError?: Error;
  updateError?: Error;
}): any {
  const mock = {
    from: (_table: string) => ({
      select: (_cols: string) => {
        const chain: any = {};
        chain.eq = (_field: string, _val: any) => {
          // Chain supports .eq().eq().in() or .eq().in()
          const secondEq = (_f2: string, _v2: any) => {
            const inChain: any = {};
            inChain.in = (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => {
                if (overrides?.selectError) throw overrides.selectError;
                resolve({ data: overrides?.selectResult ?? defaultEntries, error: null });
              },
            });
            return inChain;
          };
          // Return an object that has both .eq and .in on it
          return {
            eq: secondEq,
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => {
                if (overrides?.selectError) throw overrides.selectError;
                resolve({ data: overrides?.selectResult ?? defaultEntries, error: null });
              },
            }),
          };
        };
        return chain;
      },
      update: (_payload: any) => ({
        eq: (_field: string, _val: any) => ({
          then: (resolve: (v: any) => void) => {
            if (overrides?.updateError) throw overrides.updateError;
            resolve({ data: overrides?.updateResult ?? null, error: null });
          },
        }),
      }),
    }),
  };

  return mock;
}

const defaultPendingEntry = {
  id: "spine-entry-001",
  locked: false,
  status: "pending_lock",
};

const defaultEntries = [defaultPendingEntry];

const PROJECT_ID = "proj-test-001";

// ══════════════════════════════════════════════════════════════════════════════
// 1. Primary Use Case — locks pending_lock entry on concept_brief approval
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("lockNarrativeSpine — locks pending_lock entry when docType is concept_brief", async () => {
  let updatedEntry: any = null;
  const db = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => {
                resolve({ data: [defaultPendingEntry], error: null });
              },
            }),
          }),
        }),
      }),
      update: (payload: any) => {
        updatedEntry = payload;
        return {
          eq: (_field: string, _val: string) => ({
            then: (resolve: (v: any) => void) => {
              resolve({ data: null, error: null });
            },
          }),
        };
      },
    }),
  };

  await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");

  assert(updatedEntry !== null, "Expected update() to have been called");
  assertEquals(updatedEntry.locked, true, "locked should be set to true");
  assertEquals(updatedEntry.status, "active", "status should be set to active");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. docType Guard — no-op on non-concept_brief doc types
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("lockNarrativeSpine — no-op when docType is not concept_brief", async () => {
  let wasCalled = false;
  const db = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          in: (_field: string, _vals: string[]) => {
            wasCalled = true;
            return { then: (_resolve: any) => {} };
          },
        }),
      }),
      update: (_payload: any) => {
        wasCalled = true;
        return { eq: (_field: string, _val: any) => ({ then: (_resolve: any) => {} }) };
      },
    }),
  };

  await lockNarrativeSpine(db, PROJECT_ID, "market_sheet");
  assertEquals(wasCalled, false, "should not query or update when docType is not concept_brief");
});

Deno.test("lockNarrativeSpine — no-op when docType is empty string", async () => {
  let wasCalled = false;
  const db = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          in: (_field: string, _vals: string[]) => {
            wasCalled = true;
            return { then: (_resolve: any) => {} };
          },
        }),
      }),
      update: (_payload: any) => {
        wasCalled = true;
        return { eq: (_field: string, _val: any) => ({ then: (_resolve: any) => {} }) };
      },
    }),
  };

  await lockNarrativeSpine(db, PROJECT_ID, "");
  assertEquals(wasCalled, false, "should not query or update when docType is empty");
});

Deno.test("lockNarrativeSpine — no-op when docType is null/undefined", async () => {
  let wasCalled = false;
  const db = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          in: (_field: string, _vals: string[]) => {
            wasCalled = true;
            return { then: (_resolve: any) => {} };
          },
        }),
      }),
      update: (_payload: any) => {
        wasCalled = true;
        return { eq: (_field: string, _val: any) => ({ then: (_resolve: any) => {} }) };
      },
    }),
  };

  // @ts-ignore — testing runtime behavior with null/undefined
  await lockNarrativeSpine(db, PROJECT_ID, null);
  assertEquals(wasCalled, false, "should not query or update when docType is null");
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Edge: No decision_ledger entries → no-op
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("lockNarrativeSpine — no-op when no decision_ledger entries exist", async () => {
  let updateCalled = false;
  const db = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => {
                resolve({ data: [], error: null });
              },
            }),
          }),
        }),
      }),
      update: (_payload: any) => {
        updateCalled = true;
        return { eq: (_field: string, _val: any) => ({ then: (_resolve: any) => {} }) };
      },
    }),
  };

  await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");
  assertEquals(updateCalled, false, "should not update when no entries exist");
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Edge: Already locked → no-op
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("lockNarrativeSpine — no-op when spine is already locked (active entry exists)", async () => {
  let updateCalled = false;
  const activeEntry = { id: "spine-locked-001", locked: true, status: "active" };
  const db = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => {
                resolve({ data: [activeEntry], error: null });
              },
            }),
          }),
        }),
      }),
      update: (_payload: any) => {
        updateCalled = true;
        return { eq: (_field: string, _val: any) => ({ then: (_resolve: any) => {} }) };
      },
    }),
  };

  await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");
  assertEquals(updateCalled, false, "should not update when already locked");
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Edge: No pending_lock entry (only other status entries) → no-op
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("lockNarrativeSpine — no-op when no pending_lock entry exists", async () => {
  let updateCalled = false;
  // Only a superseded entry exists, no pending_lock or active
  const supersededEntry = { id: "spine-superseded-001", locked: true, status: "superseded" };
  const db = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => {
                resolve({ data: [supersededEntry], error: null });
              },
            }),
          }),
        }),
      }),
      update: (_payload: any) => {
        updateCalled = true;
        return { eq: (_field: string, _val: any) => ({ then: (_resolve: any) => {} }) };
      },
    }),
  };

  await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");
  assertEquals(updateCalled, false, "should not update when only superseded entries exist");
});

// Edge: Entry with status='pending_lock' but locked=true (transitioning state)
Deno.test("lockNarrativeSpine — treats pending_lock+locked entry as already locked", async () => {
  let updateCalled = false;
  // entry has pending_lock status but locked = true — should be treated as effectively locked
  const mixedEntry = { id: "spine-mixed-001", locked: true, status: "pending_lock" };
  const db = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => {
                resolve({ data: [mixedEntry], error: null });
              },
            }),
          }),
        }),
      }),
      update: (_payload: any) => {
        updateCalled = true;
        return { eq: (_field: string, _val: any) => ({ then: (_resolve: any) => {} }) };
      },
    }),
  };

  await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");
  assertEquals(updateCalled, false, "should not update when entry is already locked=true even if status is pending_lock");
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. Invariant: Only updates the target pending_lock entry by its ID
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("lockNarrativeSpine — update targets the correct entry ID", async () => {
  let updateArgs: Record<string, any> = {};
  const pendingEntry = { id: "target-entry-456", locked: false, status: "pending_lock" };
  const db = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => {
                resolve({ data: [pendingEntry], error: null });
              },
            }),
          }),
        }),
      }),
      update: (payload: any) => {
        updateArgs = { payload, field: "", value: "" };
        return {
          eq: (field: string, value: string) => {
            updateArgs = { ...updateArgs!, field, value };
            return { then: (resolve: (v: any) => void) => resolve({ data: null, error: null }) };
          },
        };
      },
    }),
  };

  await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");

  assert("payload" in updateArgs, "update should have been called");
  assertEquals(updateArgs.payload.locked, true);
  assertEquals(updateArgs.payload.status, "active");
  assertEquals(updateArgs.value, "target-entry-456", "update should target the correct entry ID");
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Regression: Fail-open on DB error (catch + log, never throw)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("lockNarrativeSpine — fail-open on select error (catches exception)", async () => {
  const db = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => {
              throw new Error("DATABASE_CONNECTION_FAILED");
            },
          }),
        }),
      }),
      update: (_payload: any) => ({
        eq: (_field: string, _val: any) => ({ then: (_resolve: any) => {} }),
      }),
    }),
  };

  // Should not throw — function catches all errors
  let threw = false;
  try {
    await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");
  } catch {
    threw = true;
  }
  assertEquals(threw, false, "should not throw on DB error — fail-open");
});

Deno.test("lockNarrativeSpine — fail-open on update error (catches exception)", async () => {
  const db = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => {
                resolve({ data: [defaultPendingEntry], error: null });
              },
            }),
          }),
        }),
      }),
      update: (_payload: any) => ({
        eq: (_field: string, _val: any) => {
          throw new Error("UPDATE_FAILED");
        },
      }),
    }),
  };

  let threw = false;
  try {
    await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");
  } catch {
    threw = true;
  }
  assertEquals(threw, false, "should not throw on update error — fail-open");
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. Integration: Multiple entries, picks the right pending_lock
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("lockNarrativeSpine — with multiple entries, picks the pending_lock (not superseded)", async () => {
  let updatedId: string | null = null;
  const entries = [
    { id: "superseded-001", locked: true, status: "superseded" },
    { id: "pending-002", locked: false, status: "pending_lock" },
    { id: "superseded-003", locked: false, status: "superseded" },
  ];

  const db = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => resolve({ data: entries, error: null }),
            }),
          }),
        }),
      }),
      update: (payload: any) => ({
        eq: (_field: string, val: string) => {
          updatedId = val;
          return { then: (resolve: (v: any) => void) => resolve({ data: null, error: null }) };
        },
      }),
    }),
  };

  await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");
  assertEquals(updatedId, "pending-002", "should update the pending_lock entry, not superseded ones");
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. Edge: DB returns error in response object (not exception)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("lockNarrativeSpine — fail-open on DB error response (error field, not exception)", async () => {
  // When Supabase returns { data: null, error: { message: "..." } }, functions that
  // don't check for error will try to iterate null/undefined
  // The function iterates entries, so data=null should result in a no-op

  const db = {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, _val: any) => ({
          eq: (_f2: string, _v2: any) => ({
            in: (_field: string, _vals: string[]) => ({
              then: (resolve: (v: any) => void) => resolve({ data: null, error: { message: "DB_ERROR" } }),
            }),
          }),
        }),
      }),
      update: (_payload: any) => ({
        eq: (_field: string, _val: any) => ({ then: (_resolve: any) => {} }),
      }),
    }),
  };

  let threw = false;
  try {
    await lockNarrativeSpine(db, PROJECT_ID, "concept_brief");
  } catch {
    threw = true;
  }
  assertEquals(threw, false, "should not throw on DB error response — fail-open, no-op for null data");
});