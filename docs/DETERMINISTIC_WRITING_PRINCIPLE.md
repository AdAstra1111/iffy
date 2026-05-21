# DETERMINISTIC WRITING PRINCIPLE
*Established May 19, 2026 — applies to all IFFY installations and all future development*
*Living document — rules may evolve as we learn what works in practice*

---

## The Core Rule

**The AI must never hallucinate or invent story facts.**

Every character detail, world rule, plot point, relationship dynamic, and dramatic beat must trace directly back to a source document in the upstream ladder. If a fact doesn't exist in an upstream doc, the AI must flag it as missing — not invent it.

---

## Dramatic vs Functional Characters

This is a critical nuance. A rigid "no new characters" rule would break realistic scriptwriting. Real scripts need both:

### Dramatic Characters
These are the story's engine — protagonist, antagonist, love interest, mentor, rival, confidante. They have arcs, make meaningful choices, and drive the plot forward.

**Rule:** Must come from character bible. Never invent.

### Functional Characters
These exist to serve the mechanism of a specific scene — waiter, doorman, taxi driver, cop on a corner, bartender, passerby. They are scene texture, not story drivers.

**Allowed** — generated contextually per scene/beat, subject to these constraints:
- **Occupation-defined, not name-defined**: WAITER, not "Jorge". Unless naming is essential to the scene mechanism (e.g. protagonist asks a name).
- **Must not recur**: If a functional character appears in more than one beat across the entire script, they must be elevated to the character bible as a dramatic character. Exceptions: clearly generic roles like "Announcer" in a stadium scene.
- **Must not drive plot**: They can react to the protagonist (e.g. "The bridge is closed"), but they cannot make choices that alter the story trajectory. A cop who says "this way, follow me" is functional. A cop who says "I'm taking you in because your partner ratted you out" is dramatic.
- **Must not have backstory or emotional arc**: No revealed history, no personal stakes. They exist for the scene and vanish.
- **3-line limit**: If a functional character has more than 3 lines across the entire script, they need elevation to character bible.

#### The Practical Test

```
Scene: Protagonist walks into a diner after a chase.

"Black coffee." — Protagonist
"Coming right up." — WAITER (walks away)
```
✅ **Functional character.** WAITER is a scene mechanism. No backstory needed.

```
Same scene. WAITER sits down.

"I know who you are. The police were here looking for you. 
They said you wouldn't come back here, but I knew you would."
```
✗ **Should be a dramatic character.** This WAITER drives plot. Needs a name, a relationship to the protagonist, elevation to character bible.

---

## What This Means Per Stage

| Stage | Source | Can Generate | Cannot Generate |
|-------|--------|-------------|-----------------|
| **Treatment** | Concept brief + character bible | Scene-level action, dramatic prose, expanded world texture | New characters, new backstory facts, new plot events |
| **Story outline** | Treatment | Moment-level dramatic units, act structure | New plot points not in treatment |
| **Beat sheet** | Story outline + treatment | Named beats citing story outline scenes | Beats that don't correspond to story outline moments |
| **Feature script** | Beat sheet + all upstream | 1-3 screenplay-formatted scenes per beat. Functional characters per scene. | New dramatic characters, new story events, new dramatic turns |

---

## Chunk-Level Canon Constraint

Every chunk in a sequential generation receives the **full accumulated canon state** from all prior chunks. This includes:
- Character states (emotional, physical, arc position)
- World state (settings established, objects introduced, rules set)
- Plot threads (active, resolved, dangling)
- Dramatic tension level

The AI must never contradict anything in the accumulated canon. If it needs to establish a new fact, it must source it from an upstream document or flag it as a gap.

---

## Design Precedent

The `beat_sequential` strategy for feature_script is the model implementation:
- Beat analysis determines scene count (1-3, capped)
- Each beat's scenes generated with prior canon context
- Chunk persistence (commit `9490e0f`) for crash recovery
- Slower sequential generation preferred over fast hallucinated output

---

## Enforcement Pattern

When any agent (Architect, Morpheus, Trinity, Seraph, Agent Smith, Keymaker) reviews a generated script, they must verify:

1. Does every dramatic character trace back to character bible? 
2. Are functional characters occupation-defined and non-recurring?
3. Does every plot event correspond to a beat in the beat sheet?
4. Does scene N+1's state correctly follow scene N's closing state?
5. Has the AI invented any story fact that isn't sourced upstream?

Any violation is a hard failure — the task returns to be re-generated with explicit constraints.

---

## Non-Negotiable

**Quality of output is paramount.** No speed optimization, no parallelization shortcut, no "good enough" compromise is worth introducing hallucinated content into a script. Slower sequential generation > fast hallucinated output, always.

---

## Operating Protocol: Oracle ↔ ChatGPT Design Pipeline

*Established May 19, 2026 — standard procedure for complex architectural work*

### When to Use
Any design task that is more complex than a straightforward bug fix. Indicators:
- New feature or subsystem design
- Non-trivial architectural tradeoffs
- Multiple viable approaches with different outcomes
- Changes that span frontend + backend + edge functions
- Strategic decisions about the direction of the system

### The Protocol

```
┌──────────────────────────────────────────────────┐
│                 1. PROBLEM                        │
│     User describes rough intent to Oracle         │
└─────────────────────┬────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────┐
│             2. PACKAGE                            │
│     Oracle researches codebase, formulates        │
│     comprehensive design document with:           │
│     • Current architecture + code paths           │
│     • The problem being solved                    │
│     • Proposed approach                           │
│     • Open design questions                       │
│     • Relevant file:line references               │
└─────────────────────┬────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────┐
│            3. CONSULT                             │
│     User takes package to ChatGPT, has            │
│     back-and-forth design conversation           │
│     ChatGPT provides critique + alternatives       │
└─────────────────────┬────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────┐
│            4. INTEGRATE                           │
│     User returns ChatGPT output to Oracle         │
│     Oracle updates:                               │
│     • Design document with refinements            │
│     • Architect kanban task with updated spec     │
│     • Any affected principle docs                 │
└─────────────────────┬────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────┐
│             5. EXECUTE                            │
│     Chain begins: Oracle → Architect → ...       │
│     Design proceeds with ChatGPT feedback baked  │
│     in from the start                            │
└──────────────────────────────────────────────────┘
```

### Why It Works
- Oracle does the codebase research and problems you don't want to do
- ChatGPT does the architecture critique and alternatives that Oracle can't do
- You steer at both ends — intent → Oracle, strategic direction → ChatGPT
- The back-and-forth catches blind spots neither side would find alone
- Every design is documented end-to-end in `docs/`

### Current Example
The `beat_sequential` strategy for feature_script followed this exact protocol and produced a significantly richer architecture than either side alone would have: structured dramatic contracts, four-layer canon, intent tracking, hybrid updates, parallel rollout — all came from the ChatGPT conversation after Oracle did the codebase research.
