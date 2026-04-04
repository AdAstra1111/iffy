

# VPB Evaluation Contract Fix — Implementation Plan

## Evidence (Confirmed)

**Coercion point**: `src/lib/dev-os-config.ts` line 562-569 — `defaultDeliverableForDocType()` has no `visual_project_bible` entry. Falls back to `'concept_brief'`.

**Propagation**: ProjectDevelopmentEngine → `defaultDeliverableForDocType('visual_project_bible')` → `'concept_brief'` → backend `DELIVERABLE_RUBRICS['concept_brief']` → narrative evaluation → false blockers.

**No secondary remap**: `DOC_TYPE_REMAP` does not mention VPB. No other coercion path exists.

---

## Patch — 3 Files

### 1. `src/lib/dev-os-config.ts`

**A.** Add `'visual_project_bible'` to `DeliverableType` union (after line 30, before semicolon):
```typescript
  | 'visual_project_bible';
```

**B.** Add label to `DELIVERABLE_LABELS` (after line 54):
```typescript
  visual_project_bible: 'Visual Project Bible',
```

**C.** Add mapping in `defaultDeliverableForDocType()` map (after line 559, before closing brace):
```typescript
    visual_project_bible: 'visual_project_bible',
```

### 2. `supabase/functions/dev-engine-v2/index.ts`

Add VPB rubric to `DELIVERABLE_RUBRICS` (after line 1321, before closing `};` at line 1322):

```typescript
  visual_project_bible: `Evaluate as a VISUAL PROJECT BIBLE — a deterministic visual assembly document, NOT a narrative or screenplay document.

Score on presence, specificity, coherence, and production usability of:
1. VISUAL TONE — overall visual identity, specificity, references, palette/mood language
2. WORLD VISUAL LANGUAGE — rules of the visual world, recurring aesthetic logic, environmental identity
3. CHARACTER VISUAL PROFILES — principal characters visually specified with clear differentiation
4. WARDROBE SYSTEM — wardrobe logic, silhouette/material/color/state logic across characters or phases
5. LOCATION LANGUAGE — locations visually specified with mood, palette, texture, production design character
6. MOTIF SYSTEM — recurring visual motifs or symbolic image systems identified and meaningfully integrated
7. CINEMATOGRAPHY PRINCIPLES — camera, lens, framing, movement, lighting, and image grammar rules
8. REFERENCE FRAMES — curated visual references that are contextualized and useful, not random inspiration

CI = internal coherence, distinctiveness, and integrity of the visual system.
GP = production usefulness, communicability, alignment, and readiness of the visual package.

Do NOT evaluate: logline, premise, narrative themes, dramatic structure, dialogue, screenplay formatting, or scene construction. These are irrelevant to a VPB.
A strong VPB with specific, coherent visual systems across all 8 domains should score CI:80+ GP:75+.
Missing, vague, contradictory, or underdeveloped coverage in any domain is a blocker.`,
```

### 3. `src/test/vpb-evaluation-contract.test.ts` (new)

Regression tests covering:
- `defaultDeliverableForDocType('visual_project_bible')` returns `'visual_project_bible'`
- `defaultDeliverableForDocType('visual_project_bible')` does NOT return `'concept_brief'`
- `DELIVERABLE_LABELS.visual_project_bible` equals `'Visual Project Bible'`
- Regression: `concept_brief` → `concept_brief`, `idea` → `idea`
- Regression: `market_sheet` and `vertical_market_sheet` unchanged

---

## Definition of Done

| Check | Action |
|-------|--------|
| VPB in DeliverableType union | Add to line 30 |
| VPB in DELIVERABLE_LABELS | Add after line 54 |
| VPB in defaultDeliverableForDocType map | Add after line 559 |
| VPB rubric in DELIVERABLE_RUBRICS | Add after line 1321 |
| VPB no longer coerces to concept_brief | Enforced by explicit map entry |
| Regression tests added | New test file |
| No ladder/output regressions | Tests cover concept_brief, idea, market_sheet |

