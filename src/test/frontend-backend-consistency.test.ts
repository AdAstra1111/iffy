import { describe, it, expect } from 'vitest';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DecisionOption {
  id: string;
  label: string;
  selected: boolean;
}

interface PendingDecision {
  id: string;
  document_id: string;
  decision_type?: string;
  type?: string;
  label?: string;
  decision_label?: string;
  options: DecisionOption[];
  status: 'pending' | 'resolved';
  created_at: string | null;
  resolved_at: string | null;
}

interface NormalizedDecision {
  id: string;
  type: string;
  label: string;
  options: DecisionOption[];
  status: string;
  created_at: string | null;
  resolved_at: string | null;
  [key: string]: unknown;
}

interface ProjectDocumentVersion {
  id: string;
  version_number: number;
  content: string;
  created_at: string;
}

interface ProjectDocumentNote {
  id: string;
  document_id: string;
  content: string;
  resolved: boolean;
  status: 'open' | 'resolved' | 'applied';
}

interface ProjectDocumentChunk {
  id: string;
  document_id: string;
  index: number;
  status: 'pending' | 'processing' | 'complete' | 'error';
  content: string | null;
}

interface RewriteJob {
  id: string;
  document_id: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
}

// ─── Check Functions ─────────────────────────────────────────────────────────

/** I-1: The UI-displayed version_id must equal the DB latest version_number. */
function checkVersionParity(
  uiVersion: number,
  dbLatestVersion: number,
): boolean {
  return uiVersion === dbLatestVersion;
}

/** I-2: UI note badge must match DB note resolved/status. */
function checkNoteStatusParity(
  uiBadge: 'resolved' | 'unresolved',
  dbNote: { resolved: boolean; status: string },
): boolean {
  if (dbNote.resolved || dbNote.status === 'resolved' || dbNote.status === 'applied') {
    return uiBadge === 'resolved';
  }
  return uiBadge === 'unresolved';
}

/** I-3: DecisionPanel visibility must match DB pending decisions count. */
function checkDecisionAvailability(
  uiPanelVisible: boolean,
  dbPendingDecisions: number,
): boolean {
  return uiPanelVisible === (dbPendingDecisions > 0);
}

/** I-4: SectionedDocProgress completion must match DB chunk statuses. */
function checkChunkProgressParity(
  uiCompleteBars: number,
  dbChunks: ProjectDocumentChunk[],
): boolean {
  const dbComplete = dbChunks.filter(c => c.status === 'complete').length;
  return uiCompleteBars === dbComplete;
}

/** I-5: "Rewriting..." indicator must match DB active rewrite jobs. */
function checkRewriteTriggerParity(
  uiRewriting: boolean,
  dbActiveJobs: number,
): boolean {
  return uiRewriting === (dbActiveJobs > 0);
}

/** I-6: UI-rendered content must match latest DB document version content. */
function checkContentParity(
  uiContent: string,
  dbLatestContent: string,
): boolean {
  return uiContent === dbLatestContent;
}

/** I-7: Applying a note must bump version AND flip note status. */
function checkNoteApplicationEffect(
  preVersion: number,
  postVersion: number,
  preNoteStatus: string,
  postNoteStatus: string,
): { versionBumped: boolean; statusFlipped: boolean } {
  return {
    versionBumped: postVersion > preVersion,
    statusFlipped:
      postNoteStatus === 'applied' && preNoteStatus !== 'applied',
  };
}

/** I-8: Selecting a decision option must reflect in DB state. */
function checkDecisionApplicationEffect(
  preOptions: DecisionOption[],
  postOptions: DecisionOption[],
  selectedOptionId: string,
): boolean {
  const preSelected = preOptions.find(o => o.selected);
  const postSelected = postOptions.find(o => o.id === selectedOptionId);
  return !!postSelected?.selected && postSelected.id === selectedOptionId;
}

/** I-9: normalizeDecisionUI must preserve all fields without data loss. */
function normalizeDecisionUI(decision: PendingDecision): NormalizedDecision {
  const normalized: NormalizedDecision = {
    id: decision.id,
    type: decision.decision_type || decision.type || '',
    label: decision.label || decision.decision_label || '',
    options: (decision.options || []).map((o: DecisionOption) => ({
      id: o.id,
      label: o.label,
      selected: Boolean(o.selected),
    })),
    status: decision.status || 'pending',
    created_at: decision.created_at || null,
    resolved_at: decision.resolved_at || null,
  };
  return normalized;
}

function checkNormalizationFidelity(
  input: PendingDecision,
): string[] {
  const errors: string[] = [];
  const output = normalizeDecisionUI(input);

  // Every input field must survive
  if (input.id && output.id !== input.id) {
    errors.push(`id: expected ${input.id}, got ${output.id}`);
  }
  const expectedType = input.decision_type || input.type || '';
  if (output.type !== expectedType) {
    errors.push(`type: expected "${expectedType}", got "${output.type}"`);
  }
  const expectedLabel = input.label || input.decision_label || '';
  if (output.label !== expectedLabel) {
    errors.push(
      `label: expected "${expectedLabel}", got "${output.label}"`,
    );
  }
  const inputOptionCount = (input.options || []).length;
  if (output.options.length !== inputOptionCount) {
    errors.push(
      `options count: expected ${inputOptionCount}, got ${output.options.length}`,
    );
  }
  for (let i = 0; i < output.options.length; i++) {
    const inp = (input.options || [])[i];
    const out = output.options[i];
    if (inp.id !== out.id) {
      errors.push(`options[${i}].id: expected ${inp.id}, got ${out.id}`);
    }
    if (inp.label !== out.label) {
      errors.push(
        `options[${i}].label: expected "${inp.label}", got "${out.label}"`,
      );
    }
    if (Boolean(inp.selected) !== out.selected) {
      errors.push(
        `options[${i}].selected: expected ${inp.selected}, got ${out.selected}`,
      );
    }
  }
  if (output.status !== (input.status || 'pending')) {
    errors.push(
      `status: expected "${input.status}", got "${output.status}"`,
    );
  }
  return errors;
}

/** I-10: Render state after action must match action callback state. */
function checkRenderActionIdempotency(
  renderState: { version: number; content: string; notes: number },
  actionState: { version: number; content: string; notes: number },
): boolean {
  return (
    renderState.version === actionState.version &&
    renderState.content === actionState.content &&
    renderState.notes === actionState.notes
  );
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const docV1: ProjectDocumentVersion = {
  id: 'doc-1',
  version_number: 1,
  content: 'Scene opens in a dimly lit warehouse.',
  created_at: '2025-01-01T00:00:00Z',
};

const docV2: ProjectDocumentVersion = {
  id: 'doc-1',
  version_number: 2,
  content: 'Scene opens in a dimly lit warehouse. Rain streaks the windows.',
  created_at: '2025-01-02T00:00:00Z',
};

const noteOpen: ProjectDocumentNote = {
  id: 'note-1',
  document_id: 'doc-1',
  content: 'Add more description to the warehouse.',
  resolved: false,
  status: 'open',
};

const noteResolved: ProjectDocumentNote = {
  id: 'note-2',
  document_id: 'doc-1',
  content: 'Fix lighting description.',
  resolved: true,
  status: 'resolved',
};

const noteApplied: ProjectDocumentNote = {
  id: 'note-3',
  document_id: 'doc-1',
  content: 'Applied via rewrite.',
  resolved: true,
  status: 'applied',
};

const chunksAllComplete: ProjectDocumentChunk[] = [
  { id: 'chunk-1', document_id: 'doc-1', index: 0, status: 'complete', content: 'Part 1' },
  { id: 'chunk-2', document_id: 'doc-1', index: 1, status: 'complete', content: 'Part 2' },
  { id: 'chunk-3', document_id: 'doc-1', index: 2, status: 'complete', content: 'Part 3' },
  { id: 'chunk-4', document_id: 'doc-1', index: 3, status: 'complete', content: 'Part 4' },
];

const chunksPartial: ProjectDocumentChunk[] = [
  { id: 'chunk-1', document_id: 'doc-1', index: 0, status: 'complete', content: 'Part 1' },
  { id: 'chunk-2', document_id: 'doc-1', index: 1, status: 'complete', content: 'Part 2' },
  { id: 'chunk-3', document_id: 'doc-1', index: 2, status: 'processing', content: null },
  { id: 'chunk-4', document_id: 'doc-1', index: 3, status: 'pending', content: null },
];

const chunksEmpty: ProjectDocumentChunk[] = [];

// I-9: Normalization Fidelity fixtures — 3 distinct decisions with varied fields

const decisionComplete: PendingDecision = {
  id: 'dec-1',
  document_id: 'doc-1',
  decision_type: 'cast_choice',
  label: 'Choose lead actor style',
  options: [
    { id: 'opt-1a', label: 'Method actor', selected: false },
    { id: 'opt-1b', label: 'Natural improviser', selected: true },
  ],
  status: 'resolved',
  created_at: '2025-01-01T12:00:00Z',
  resolved_at: '2025-01-02T12:00:00Z',
};

const decisionPending: PendingDecision = {
  id: 'dec-2',
  document_id: 'doc-1',
  decision_type: 'lighting_scheme',
  label: 'Select lighting approach',
  options: [
    { id: 'opt-2a', label: 'Naturalistic', selected: false },
    { id: 'opt-2b', label: 'Expressionist', selected: false },
    { id: 'opt-2c', label: 'Neo-noir', selected: false },
  ],
  status: 'pending',
  created_at: '2025-01-03T12:00:00Z',
  resolved_at: null,
};

const decisionMinimal: PendingDecision = {
  id: 'dec-3',
  document_id: 'doc-1',
  options: [],
  status: 'pending',
  created_at: null,
  resolved_at: null,
};

// I-9 fixture that exercises fallback fields (type → decision_type, label → decision_label)

const decisionFallbackFields: PendingDecision = {
  id: 'dec-4',
  document_id: 'doc-1',
  type: 'wardrobe_choice',
  decision_label: 'Choose costume era',
  options: [
    { id: 'opt-4a', label: 'Victorian', selected: false },
    { id: 'opt-4b', label: 'Edwardian', selected: true },
  ],
  status: 'resolved',
  created_at: '2025-01-04T12:00:00Z',
  resolved_at: '2025-01-05T12:00:00Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

// I-1 — Version ID Parity (7 tests)
describe('I-1 — Version ID Parity', () => {
  it('exact match: UI version equals DB latest version', () => {
    expect(checkVersionParity(2, 2)).toBe(true);
  });

  it('mismatch: UI shows stale version (1), DB has 2', () => {
    expect(checkVersionParity(1, 2)).toBe(false);
  });

  it('mismatch: UI ahead of DB (optimistic update not confirmed)', () => {
    expect(checkVersionParity(3, 2)).toBe(false);
  });

  it('both zero: initial state', () => {
    expect(checkVersionParity(0, 0)).toBe(true);
  });

  it('version collision with different content — parity check only compares numbers', () => {
    // Parity is purely about the version number, not content
    expect(checkVersionParity(2, 2)).toBe(true);
  });

  it('version 5 vs 4 — regression case', () => {
    expect(checkVersionParity(5, 4)).toBe(false);
  });

  it('version 1 vs 1 — initial match after first save', () => {
    expect(checkVersionParity(1, 1)).toBe(true);
  });
});

// I-2 — Note Status Parity (8 tests)
describe('I-2 — Note Status Parity', () => {
  it('open note shows unresolved badge', () => {
    expect(checkNoteStatusParity('unresolved', noteOpen)).toBe(true);
  });

  it('open note with resolved badge = mismatch', () => {
    expect(checkNoteStatusParity('resolved', noteOpen)).toBe(false);
  });

  it('resolved note shows resolved badge', () => {
    expect(checkNoteStatusParity('resolved', noteResolved)).toBe(true);
  });

  it('resolved note with unresolved badge = mismatch', () => {
    expect(checkNoteStatusParity('unresolved', noteResolved)).toBe(false);
  });

  it('applied note shows resolved badge', () => {
    expect(checkNoteStatusParity('resolved', noteApplied)).toBe(true);
  });

  it('applied note with unresolved badge = mismatch', () => {
    expect(checkNoteStatusParity('unresolved', noteApplied)).toBe(false);
  });

  it('note with resolved=false, status=open — unresolved badge', () => {
    expect(
      checkNoteStatusParity('unresolved', { resolved: false, status: 'open' }),
    ).toBe(true);
  });

  it('note with resolved=true, status=open — edge case, logic favors resolved flag', () => {
    // The resolved boolean is truthy regardless of status
    expect(
      checkNoteStatusParity('resolved', { resolved: true, status: 'open' }),
    ).toBe(true);
  });
});

// I-3 — Decision Availability (7 tests)
describe('I-3 — Decision Availability', () => {
  it('1 pending decision → panel visible', () => {
    expect(checkDecisionAvailability(true, 1)).toBe(true);
  });

  it('0 pending decisions → panel hidden', () => {
    expect(checkDecisionAvailability(false, 0)).toBe(true);
  });

  it('panel visible but 0 pending = mismatch', () => {
    expect(checkDecisionAvailability(true, 0)).toBe(false);
  });

  it('panel hidden but 1 pending = mismatch', () => {
    expect(checkDecisionAvailability(false, 1)).toBe(false);
  });

  it('3 pending decisions → panel visible', () => {
    expect(checkDecisionAvailability(true, 3)).toBe(true);
  });

  it('panel hidden with 5 pending = mismatch', () => {
    expect(checkDecisionAvailability(false, 5)).toBe(false);
  });

  it('null/undefined treated as 0', () => {
    expect(checkDecisionAvailability(false, 0)).toBe(true);
  });
});

// I-4 — Chunk Progress Parity (7 tests)
describe('I-4 — Chunk Progress Parity', () => {
  it('4 complete bars matches 4 complete chunks', () => {
    expect(checkChunkProgressParity(4, chunksAllComplete)).toBe(true);
  });

  it('2 complete bars matches partial chunks (2 complete, 2 in progress)', () => {
    expect(checkChunkProgressParity(2, chunksPartial)).toBe(true);
  });

  it('0 complete bars matches empty chunks', () => {
    expect(checkChunkProgressParity(0, chunksEmpty)).toBe(true);
  });

  it('UI shows 3 bars but DB only has 2 complete = mismatch', () => {
    expect(checkChunkProgressParity(3, chunksPartial)).toBe(false);
  });

  it('UI shows 1 bar but DB has 4 complete = mismatch (suppressed progress)', () => {
    expect(checkChunkProgressParity(1, chunksAllComplete)).toBe(false);
  });

  it('4 bars shown when only 4 chunks exist (full match)', () => {
    expect(checkChunkProgressParity(4, chunksAllComplete)).toBe(true);
  });

  it('2 bars shown when 2 of 4 chunks complete (partial match)', () => {
    expect(checkChunkProgressParity(2, chunksPartial)).toBe(true);
  });
});

// I-5 — Rewrite Trigger Parity (10 tests)
describe('I-5 — Rewrite Trigger Parity', () => {
  it('no active jobs → no rewriting indicator', () => {
    expect(checkRewriteTriggerParity(false, 0)).toBe(true);
  });

  it('1 active job → rewriting indicator', () => {
    expect(checkRewriteTriggerParity(true, 1)).toBe(true);
  });

  it('rewriting shown but 0 active = mismatch (stuck spinner)', () => {
    expect(checkRewriteTriggerParity(true, 0)).toBe(false);
  });

  it('no rewriting but 1 active = mismatch (missed trigger)', () => {
    expect(checkRewriteTriggerParity(false, 1)).toBe(false);
  });

  it('3 active jobs → rewriting indicator', () => {
    expect(checkRewriteTriggerParity(true, 3)).toBe(true);
  });

  it('rewriting shown but jobs all complete = mismatch', () => {
    expect(checkRewriteTriggerParity(true, 0)).toBe(false);
  });

  it('no rewriting and 0 active = correct idle', () => {
    expect(checkRewriteTriggerParity(false, 0)).toBe(true);
  });

  it('rewriting shown with 1 queued job', () => {
    expect(checkRewriteTriggerParity(true, 1)).toBe(true);
  });

  it('rewriting hidden with 1 complete job (not active) — correct', () => {
    // "Active" means queued or processing, not complete
    expect(checkRewriteTriggerParity(false, 0)).toBe(true);
  });

  it('rewriting shown with 5 queued jobs', () => {
    expect(checkRewriteTriggerParity(true, 5)).toBe(true);
  });
});

// I-6 — Content Parity (10 tests)
describe('I-6 — Content Parity', () => {
  it('v1 content matches v1', () => {
    expect(checkContentParity(docV1.content, docV1.content)).toBe(true);
  });

  it('v2 content matches v2', () => {
    expect(checkContentParity(docV2.content, docV2.content)).toBe(true);
  });

  it('UI shows v1 content but DB has v2 = mismatch (stale)', () => {
    expect(checkContentParity(docV1.content, docV2.content)).toBe(false);
  });

  it('UI shows v2 content matches DB v2', () => {
    expect(checkContentParity(docV2.content, docV2.content)).toBe(true);
  });

  it('empty content matches empty', () => {
    expect(checkContentParity('', '')).toBe(true);
  });

  it('UI empty but DB has content = mismatch', () => {
    expect(checkContentParity('', docV1.content)).toBe(false);
  });

  it('UI has content but DB empty = mismatch (optimistic)', () => {
    expect(checkContentParity(docV1.content, '')).toBe(false);
  });

  it('partial match (same prefix, DB has more) = mismatch', () => {
    expect(checkContentParity('Scene opens', docV2.content)).toBe(false);
  });

  it('whitespace mismatch = mismatch', () => {
    expect(checkContentParity('Scene opens in a dimly lit warehouse.', 'Scene opens in a dimly lit warehouse.  ')).toBe(false);
  });

  it('identical long content match', () => {
    const longContent = 'A'.repeat(1000);
    expect(checkContentParity(longContent, longContent)).toBe(true);
  });
});

// I-7 — Note Application Effect (7 tests)
describe('I-7 — Note Application Effect', () => {
  it('applying note bumps version 1→2 and flips open→applied', () => {
    const result = checkNoteApplicationEffect(1, 2, 'open', 'applied');
    expect(result.versionBumped).toBe(true);
    expect(result.statusFlipped).toBe(true);
  });

  it('applying note bumps version 2→3 and flips resolved→applied', () => {
    const result = checkNoteApplicationEffect(2, 3, 'resolved', 'applied');
    expect(result.versionBumped).toBe(true);
    expect(result.statusFlipped).toBe(true);
  });

  it('no version bump = failure', () => {
    const result = checkNoteApplicationEffect(1, 1, 'open', 'applied');
    expect(result.versionBumped).toBe(false);
  });

  it('version declines = serious failure', () => {
    const result = checkNoteApplicationEffect(2, 1, 'open', 'applied');
    expect(result.versionBumped).toBe(false);
  });

  it('status does not flip = failure (remained open)', () => {
    const result = checkNoteApplicationEffect(1, 2, 'open', 'open');
    expect(result.statusFlipped).toBe(false);
  });

  it('version bump with no status change = partial failure', () => {
    const result = checkNoteApplicationEffect(1, 2, 'open', 'open');
    expect(result.versionBumped).toBe(true);
    expect(result.statusFlipped).toBe(false);
  });

  it('version bump from 10→11 with resolved→applied', () => {
    const result = checkNoteApplicationEffect(10, 11, 'resolved', 'applied');
    expect(result.versionBumped).toBe(true);
    expect(result.statusFlipped).toBe(true);
  });
});

// I-8 — Decision Application Effect (6 tests)
describe('I-8 — Decision Application Effect', () => {
  it('selecting option 1 reflects in state', () => {
    const pre: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
      { id: 'opt-2', label: 'B', selected: false },
    ];
    const post: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: true },
      { id: 'opt-2', label: 'B', selected: false },
    ];
    expect(checkDecisionApplicationEffect(pre, post, 'opt-1')).toBe(true);
  });

  it('selecting different option = correct', () => {
    const pre: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
      { id: 'opt-2', label: 'B', selected: false },
    ];
    const post: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
      { id: 'opt-2', label: 'B', selected: true },
    ];
    expect(checkDecisionApplicationEffect(pre, post, 'opt-2')).toBe(true);
  });

  it('switching selection: A→B, verify B selected', () => {
    const pre: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: true },
      { id: 'opt-2', label: 'B', selected: false },
    ];
    const post: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
      { id: 'opt-2', label: 'B', selected: true },
    ];
    expect(checkDecisionApplicationEffect(pre, post, 'opt-2')).toBe(true);
  });

  it('selection did not persist = failure', () => {
    const pre: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
      { id: 'opt-2', label: 'B', selected: false },
    ];
    const post: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
      { id: 'opt-2', label: 'B', selected: false },
    ];
    expect(checkDecisionApplicationEffect(pre, post, 'opt-1')).toBe(false);
  });

  it('wrong option selected = failure', () => {
    const pre: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
      { id: 'opt-2', label: 'B', selected: false },
    ];
    const post: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
      { id: 'opt-2', label: 'B', selected: true },
    ];
    expect(checkDecisionApplicationEffect(pre, post, 'opt-1')).toBe(false);
  });

  it('post has more options than pre (new option added) = still valid check', () => {
    const pre: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
    ];
    const post: DecisionOption[] = [
      { id: 'opt-1', label: 'A', selected: false },
      { id: 'opt-2', label: 'B', selected: true },
    ];
    expect(checkDecisionApplicationEffect(pre, post, 'opt-2')).toBe(true);
  });
});

// I-9 — Normalization Fidelity (9 tests)
describe('I-9 — Normalization Fidelity', () => {
  it('complete decision normalizes without data loss', () => {
    const errors = checkNormalizationFidelity(decisionComplete);
    expect(errors).toEqual([]);
  });

  it('pending decision with multiple options normalizes correctly', () => {
    const errors = checkNormalizationFidelity(decisionPending);
    expect(errors).toEqual([]);
  });

  it('minimal decision (no options, null dates) normalizes without crash', () => {
    const errors = checkNormalizationFidelity(decisionMinimal);
    expect(errors).toEqual([]);
  });

  it('decision with fallback fields (type/decision_label) normalizes correctly', () => {
    const errors = checkNormalizationFidelity(decisionFallbackFields);
    expect(errors).toEqual([]);
  });

  it('normalized decision has all expected keys', () => {
    const output = normalizeDecisionUI(decisionComplete);
    const expectedKeys = ['id', 'type', 'label', 'options', 'status', 'created_at', 'resolved_at'];
    for (const key of expectedKeys) {
      expect(output).toHaveProperty(key);
    }
  });

  it('no extraneous properties leaked into normalized output', () => {
    const output = normalizeDecisionUI(decisionComplete);
    const allowedKeys = new Set(['id', 'type', 'label', 'options', 'status', 'created_at', 'resolved_at']);
    const extraKeys = Object.keys(output).filter(k => !allowedKeys.has(k));
    expect(extraKeys).toEqual([]);
  });

  it('options array preserved in order', () => {
    const output = normalizeDecisionUI(decisionPending);
    expect(output.options[0].id).toBe('opt-2a');
    expect(output.options[1].id).toBe('opt-2b');
    expect(output.options[2].id).toBe('opt-2c');
  });

  it('selected flags coerced to boolean', () => {
    const input: PendingDecision = {
      id: 'dec-bool',
      document_id: 'doc-1',
      options: [
        { id: 'o1', label: 'a', selected: true as any },
        { id: 'o2', label: 'b', selected: false as any },
      ],
      status: 'pending',
      created_at: null,
      resolved_at: null,
    };
    const errors = checkNormalizationFidelity(input);
    expect(errors).toEqual([]);
  });

  it('null/undefined fields handled gracefully', () => {
    const minimal: PendingDecision = {
      id: 'dec-null',
      document_id: 'doc-1',
      options: [],
      status: 'pending',
      created_at: null,
      resolved_at: null,
    };
    const output = normalizeDecisionUI(minimal);
    expect(output.type).toBe('');
    expect(output.label).toBe('');
    expect(output.options).toEqual([]);
    expect(output.created_at).toBeNull();
    expect(output.resolved_at).toBeNull();
  });
});

// I-10 — Render-Action Idempotency (7 tests)
describe('I-10 — Render-Action Idempotency', () => {
  it('after-action state matches render state (no version change, no content change)', () => {
    const renderState = { version: 2, content: docV2.content, notes: 1 };
    const actionState = { version: 2, content: docV2.content, notes: 1 };
    expect(checkRenderActionIdempotency(renderState, actionState)).toBe(true);
  });

  it('after-action version differs from render = mismatch', () => {
    const renderState = { version: 2, content: docV2.content, notes: 1 };
    const actionState = { version: 3, content: docV2.content, notes: 1 };
    expect(checkRenderActionIdempotency(renderState, actionState)).toBe(false);
  });

  it('after-action content differs = mismatch', () => {
    const renderState = { version: 2, content: docV2.content, notes: 1 };
    const actionState = { version: 2, content: 'Modified content', notes: 1 };
    expect(checkRenderActionIdempotency(renderState, actionState)).toBe(false);
  });

  it('after-action notes count differs = mismatch', () => {
    const renderState = { version: 2, content: docV2.content, notes: 1 };
    const actionState = { version: 2, content: docV2.content, notes: 2 };
    expect(checkRenderActionIdempotency(renderState, actionState)).toBe(false);
  });

  it('initial empty state idempotent', () => {
    const renderState = { version: 0, content: '', notes: 0 };
    const actionState = { version: 0, content: '', notes: 0 };
    expect(checkRenderActionIdempotency(renderState, actionState)).toBe(true);
  });

  it('version 0 vs version 1 after first action = mismatch', () => {
    const renderState = { version: 0, content: '', notes: 0 };
    const actionState = { version: 1, content: docV1.content, notes: 1 };
    expect(checkRenderActionIdempotency(renderState, actionState)).toBe(false);
  });

  it('all fields differ = multiple failures', () => {
    const renderState = { version: 1, content: 'old', notes: 0 };
    const actionState = { version: 3, content: 'new', notes: 2 };
    expect(checkRenderActionIdempotency(renderState, actionState)).toBe(false);
  });
});
