# Roundtable: Rewrite UI Granularity per Document Type

## The Question
For each document type across both ladders (feature film + vertical drama), what is the correct granularity of the rewrite UI? Should the user see content appear **act-by-act**, **beat-by-beat**, **scene-by-scene**, **section-by-section**, or something else?

## Current State
The rewrite UIs are wired inconsistently:
- Story outline: generates per-act chunks → should use act-by-act rewriter ✅ but it falls into the static yellow bar instead 🚫
- Beat sheet: generates per-act chunks → currently uses act-by-act UI, but this may be wrong ⚠️
- Feature script: scene-by-scene rewriter → has rendering issues
- Production draft: scene-by-scene rewriter → has rendering issues
- Treatment: unclear what granularity is used
- Other document types: unknown

## The Design Principle
**The rewrite UI should mirror the generation chunking.** If the model generates one act at a time, the UI should show one act at a time. If it generates one beat at a time, the UI should show beats individually.

## Document-by-Document Analysis Needed

### Feature Film Ladder
| Stage | Current Chunking | Current UI | Ideal UI |
|-------|-----------------|------------|----------|
| Idea | one-shot? | ? | ? |
| Concept Brief | one-shot? | ? | ? |
| Market Sheet | one-shot? | ? | ? |
| Character Bible | character-by-character? | ? | ? |
| Story Outline | per-act | yellow bar | per-act rewriter |
| Beat Sheet | per-act | per-act rewriter | per-beat rewriter? |
| Treatment | ? | ? | ? |
| Feature Script | scene-by-scene | scene-by-scene | scene-by-scene ✅ |
| Production Draft | scene-by-scene | scene-by-scene | scene-by-scene ✅ |

### Vertical Drama Ladder
| Stage | Current Chunking | Current UI | Ideal UI |
|-------|-----------------|------------|----------|
| Idea | ? | ? | ? |
| Concept Brief | ? | ? | ? |
| Market Sheet | ? | ? | ? |
| Character Bible | ? | ? | ? |
| Season Grid | ? | ? | ? |
| Season Script | ? | ? | ? |

## Key Debate Points

### 1. Beat Sheet: Acts vs Beats
The beat sheet's logical unit is the **individual beat**, not the act. However, generating 40+ individual beats one at a time would mean 40+ API calls, which is slow. Options:
- **Beat-by-beat**: maximum granularity, slowest, user sees each beat appear
- **Act-by-act (current)**: groups beats into 5 chunks, faster, but user sees all beats in an act at once
- **Hybrid**: generate one beat at a time but batch the stream updates so the UI doesn't flicker

### 2. Character Bible: Group vs Individual
Should character introductions appear one at a time, or all at once?

### 3. Treatment: Paragraph vs Section vs Act
The treatment has prose paragraphs, not structured entries. What's the right chunk?

### 4. Market Sheet / Concept Brief: One-Shot vs Sectioned
Do these even need a rewrite UI, or is a single generate sufficient?

## Red's Perspective (expected)
Red would argue for **deterministic, predictable chunking** — each generation pass should produce a well-defined, testable unit. The rewrite UI should reflect the stage's natural grain, not an arbitrary grouping.

## ChatGPT's Role
Weigh the UX tradeoffs: responsiveness vs speed, granular control vs cognitive load, consistency across stages.

---

**Deliverable from roundtable:** A definitive mapping table — every document type → atomic unit → chunk strategy → rewrite UI component.
