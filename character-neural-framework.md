# Character Neural Fingerprint Framework
## Mapping audience-character relationships via TRIBE v2

### Core Insight
The audience's emotional relationship with each character *is* the story. Plot is just the vehicle. What people remember is how they felt about the people in the narrative.

This framework defines ROI signatures for audience-character relationship states, so we can:
1. Measure where the audience is with each character at every beat
2. Design character arcs that move the audience through specific emotional journeys
3. Validate that character dialogue and description produce the intended relationship

---

### Neural Signatures for Character Relationship States

Each state is defined by a vector of 5 ROI activations: [Amygdala, TPJ, DMN, PFC, Insula]
Scale: -0.10 to +0.10 (from TRIBE v2 activation range)

| Relationship State | Amygdala | TPJ | DMN | PFC | Insula | What it Feels Like |
|---|---|---|---|---|---|---|
| **Suspicion** | −0.02 | +0.01 | +0.03 | **+0.06** | −0.01 | Analyzing them, not connecting. Brain is trying to figure out their angle. |
| **Trust** | +0.02 | **+0.06** | **+0.05** | +0.01 | +0.03 | Connected, absorbing, not analyzing. You're *with* them. |
| **Love / Deep Empathy** | +0.04 | **+0.07** | +0.04 | −0.02 | **+0.06** | Full embodied connection. You feel what they feel. |
| **Fear / Dread** | **+0.08** | +0.02 | +0.02 | −0.03 | **+0.05** | High emotional arousal, low character connection. You're afraid *for* them or *of* them. |
| **Hatred / Revulsion** | **+0.06** | −0.03 | −0.02 | **+0.05** | +0.03 | Strong negative emotion + cognitive judgment. You've made up your mind. |
| **Awe / Wonder** | +0.03 | −0.01 | **+0.07** | −0.04 | **+0.07** | Narrative absorption + visceral response. The character is *part of something bigger.* |
| **Boredom / Disinterest** | −0.04 | −0.02 | −0.05 | −0.03 | −0.04 | Nothing firing. The brain has checked out. |
| **Betrayal** | +0.05 | −0.01 | −0.03 | **+0.06** | +0.02 | Emotional hit + cognitive recalibration. "I trusted you and I was wrong." |
| **Curiosity / Intrigue** | +0.01 | +0.03 | +0.02 | **+0.05** | +0.01 | Moderate character interest + cognitive processing. "What are they really?" |
| **Resolution / Acceptance** | −0.01 | **+0.04** | **+0.05** | −0.01 | +0.02 | Peaceful connection. The arc has landed. |

---

### Character Arc as Neural Trajectory

For every character, define their intended neural journey across the beat sequence:

#### Bill Blackstone — Intended Audience Arc

| Beat | Target State | Rationale |
|------|-------------|-----------|
| 3 — Benghazi Intro | **Suspicion** | He's cynical, working under duress. Don't trust him yet. |
| 4 — Secret Motivation | **Curiosity** | His son. Why is he really here? |
| 5 — Sophia's Arrival | **Suspicion** (deepens) | He's trapped. Weakness exposed. |
| 7 — The Blackmail | **Trust** begins | He's doing this for his child. That's universal. |
| 9 — Reluctant Acceptance | **Trust** | He commits despite fear. We're with him now. |
| Act 2A Climax | **Awe** | The Yeti, the cave, the map — he's our guide into wonder. |
| Act 2B Low Point | **Fear** | He's in real danger. We might lose him. |
| 4 — Abzu Sacrifice | **Love / Deep Empathy** | He makes the hard choice. We feel it in our bodies. |
| Final Image | **Resolution / Acceptance** | Tragedy, but earned. We understand. |

#### Sophia Holmes — Intended Audience Arc

| Beat | Target State | Rationale |
|------|-------------|-----------|
| 5 — Inciting Arrival | **Curiosity / Intrigue** | Who is this woman? Power, mystery. |
| 7 — The Blackmail | **Suspicion** | She's using Bill. Cold. |
| Act 2 Mentions | **Suspicion** (maintained) | She's always in the background, manipulating. |
| Act 3 — Interrogation | **Hatred / Betrayal** | She betrays everything Bill fought for. |
| Final — Sophia's Triumph | **Hatred** (complex) | She "wins" — but we understand the system she serves. |

---

### How to Use This in Practice

**Step 1:** Run each beat through TRIBE v2 → get raw ROI activation vector.

**Step 2:** For each character present in the beat, extract the character-specific language and dialogue from the beat description. Run that text through TRIBE v2 separately.

**Step 3:** Compare the predicted neural response against the target state from the Character Neural Fingerprint.

**Step 4:** If divergence is detected (e.g., Bill's Blackmail beat produces Suspicion instead of Trust), flag the language for rewrite.

**Step 5:** After rewrite, re-run to confirm shift toward target state.

---

### Bill's Blackmail — Neural Signature Example

We haven't run this beat yet, but based on our first 3 beats, here's what I'd expect:

A beat-7 description like:
> *"Sophia steps closer, voice dropping to a whisper. Klausman seeks a power beyond imagining. And Bill is going to stop him. His son's safety is the invisible chain binding him. He has no choice."*

Should produce:
- **Amygdala:** +0.03 to +0.05 (emotional stakes rising)
- **TPJ:** +0.04 to +0.06 (connecting with Bill's predicament)
- **DMN:** +0.03 to +0.05 (narrative absorption — we're in the story)
- **PFC:** +0.01 to +0.02 (low cognitive — we're *feeling* not analyzing)
- **Insula:** +0.02 to +0.04 (visceral response to the threat)

This should classify as **Trust** (TPJ dominant, moderate Amygdala, low PFC).

If instead we see:
- **PFC:** +0.06 (high cognitive)
- **TPJ:** +0.01 (low character connection)
- **Amygdala:** −0.02 (flat)

That's **Suspicion** — the brain is analyzing the situation instead of feeling Bill's dilemma. The language needs more sensory, personal detail.

---

### Next Steps

1. Wait for TRIBE v2 word-level inference on all 10 Act 1 beats
2. Extract character-specific ROI vectors for Bill and Sophia
3. Compare against target states
4. Identify divergences
5. Sebastian rewrites diverging beats
6. Re-run to validate shift

---

*Framework: Red, May 21, 2026*
*In collaboration with Sebastian — the insight that character neural arcs ARE the story came from him.*