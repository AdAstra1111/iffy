# Rewrite UI Canonical Registry — Design Decision

**Source:** Roundtable (Sebastian + ChatGPT + Red)
**Date:** 2026-05-27
**Overtides:** All prior per-stage UI wiring decisions. This is the canonical mapping.

## Core Rule

- **Atomic Review Unit** = what the user meaningfully approves/edits
- **Generation Chunk** = what the system can safely produce efficiently
- **Rewrite UI** = displays atomic units, even if generated in grouped chunks
- **Do NOT bind UI granularity to API-call granularity**

The registry abstraction:
```
document_type → atomic_review_unit → generation_batch_unit → renderer_component
```

---

## Feature Film Ladder

| Document Type | Atomic Review Unit | Generation Chunk | Rewrite UI Component |
|--------------|-------------------|------------------|---------------------|
| Idea | whole idea | one-shot | Static rewrite / regenerate |
| Concept Brief | section | section-by-section or one-shot + extraction | Section rewritier |
| Market Sheet | section | section-by-section | Section rewritier (parallel/on-demand, not main ladder) |
| Character Bible | character | grouped generation allowed | Character card rewritier |
| Story Outline | act | per-act | **Act-by-act rewritier** ← fix first |
| Beat Sheet | beat | act-batched generation | **Beat-by-beat rewritier inside act groups** |
| Treatment | section / act section | act-by-act or section-by-section | Treatment-section rewritier |
| Feature Script | scene | scene-by-scene | Scene-by-scene rewritier (fix rendering, not model) |
| Production Draft | scene | scene-by-scene | Scene-by-scene rewritier |

## Vertical Drama Ladder

| Document Type | Atomic Review Unit | Generation Chunk | Rewrite UI Component |
|--------------|-------------------|------------------|---------------------|
| Idea | whole idea | one-shot | Static rewrite / regenerate |
| Concept Brief | section | section-by-section | Section rewritier |
| Format Rules | rule block | section/rule-group | Rule-block rewritier |
| Character Bible | character | grouped generation | Character card rewritier |
| Season Arc | arc section | section-by-section | Arc-section rewritier |
| Episode Grid | episode | batch episodes in groups | Episode-by-episode grid/cards |
| Vertical Episode Beats | beat | episode-batched | Beat-by-beat inside episode groups |
| Season Script | scene or segment | scene/segment-by-scene | Scene/segment rewritier |

---

## Specific Implementation Notes

### Story Outline (P0 fix)
- Already generates per-act ✅
- Just needs to route to the right ActByActRewriter component
- Currently falling into static yellow bar path

### Beat Sheet (P1 fix)
- Generation: act-batched (keeps speed, 5 API calls)
- Persistence: individual beats (stored as separate rows)
- UI: beat-by-beat, grouped under act headers
- Best compromise: API produces Act 1 beats together, UI reveals each beat individually

### Character Bible
- Characters should appear as individual cards
- User can review/approve/reject per character
- Grouped generation allowed for speed

### Treatment
- Not paragraph-level unless doing surgical polish
- Section/act-section granularity
- May need Act1/Act2A/Act2B/Act3 sections

### Scripts (Feature Script + Production Draft)
- SceneBySceneRewriter is the correct component
- Separate rendering bugs need fixing independently

### Market Sheet / Concept Brief
- Should probably be parallel/on-demand, not blocking steps in the main ladder
- Section rewritier for review

---

## Architecture Change

The current wiring is scattered through UI conditionals.

**Needed:** A canonical registry that maps:
```typescript
type RewriteUIDef = {
  atomicReviewUnit: 'idea' | 'section' | 'character' | 'act' | 'beat' | 'scene' | 'episode' | 'rule_block' | 'arc_section';
  generationBatchUnit: 'one-shot' | 'section' | 'act' | 'scene' | 'character-group' | 'act-batched' | 'episode-group' | 'segment';
  rewriteComponent: string; // component name/path
  parallelizable: boolean; // can run async/on-demand?
  isMainLadder: boolean; // blocking step or parallel task?
};
```

This registry should become the single source of truth. All UI conditionals should read from it, not have their own logic.

---

## Priority Order

1. **P0 — Story Outline: ActByActRewriter** (already generating per-act, just wrong route)
2. **P1 — Beat Sheet: BeatByBeatRewriter** (act-batched generation, per-beat display)
3. **P2 — Character Bible: CharacterCardRewriter**
4. **P2 — Treatment: SectionRewriter**
5. **P3 — Scripts: fix SceneBySceneRewriter rendering bugs**
6. **P3 — Market Sheet / Concept Brief: section rewriter, parallel path**
7. **P3 — Vertical Drama ladders**
