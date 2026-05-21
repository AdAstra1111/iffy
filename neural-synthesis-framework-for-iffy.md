# IFFY Neural Synthesis Framework

## Integrating TRIBE v2 Brain Response Prediction into the IFFY Pipeline

**Author:** Red (with Sebastian)
**Date:** May 21, 2026
**Status:** Framework ready for discussion
**Distribution:** Sky pitch preparation, IFFY system design

---

## 1. Executive Summary

IFFY's deterministic storytelling pipeline now has a **neural validation layer** using Meta's TRIBE v2 foundation model. TRIBE v2 is a deep multimodal brain encoding model that predicts fMRI brain responses to naturalistic stimuli — **video, audio, and text** — using three feature extractors fused into a unified Transformer:

| Modality | Feature Extractor | What it measures |
|----------|-----------------|------------------|
| **Text** | LLaMA 3.2 | Story meaning, dialogue, narration |
| **Video** | V-JEPA2 | Visual composition, camera movement, blocking, colour, lighting |
| **Audio** | Wav2Vec-BERT | Music, sound design, silence, vocal delivery |

The model maps all three onto the fsaverage5 cortical surface (~20,484 vertices), predicting responses across key functional networks:

| ROI Network | What it measures |
|-------------|-----------------|
| **Amygdala** | Emotional intensity — *how much the audience feels* |
| **TPJ** (Temporoparietal Junction) | Theory of Mind — *how deeply the audience connects with characters* |
| **DMN** (Default Mode Network) | Narrative absorption — *how lost in the story the audience is* |
| **PFC** (Prefrontal Cortex) | Cognitive analysis — *how much the audience is thinking rather than feeling* |
| **Visual Cortex** | Mental imagery — *visual engagement* |
| **Insula** | Visceral response — *the body feeling the emotion* |

**The core insight:** A story's success can be measured before a single frame is shot. Every creative choice — every word, every frame, every note — produces a predictable shift in brain activity. IFFY can validate those choices against the intended emotional outcome and iterate toward craft convergence.

---

## 2. The 7×3 Validation Grid

The neural synthesis framework operates across **7 production layers** (horizontal) and **3 through-lines** (vertical). Every creative choice must be validated against all three through-lines simultaneously.

### The 3 Through-Lines (Vertical — thread through every layer)

| Through-Line | Definition | Neural Signature Examples |
|-------------|-----------|-------------------------|
| **THEME** *(the purpose)* | What the story is *about* — the core idea the audience should walk away feeling | High DMN + moderate Amygdala = resonant thematic absorption. PFC suppression = feeling the theme, not analysing it |
| **TONE** *(the emotional colour)* | The consistent emotional register — comedy, tragedy, irony, menace | Amygdala × Insula ratio differentiates dread from sadness from joy. Same ROI values, different feel when weighted differently |
| **SYMBOLISM** *(the semantic anchors)* | Objects, images, sounds that carry accumulated meaning across the narrative | Symbol replay should produce *stronger* neural response each time (accumulated emotional weight). First appearance: moderate TPJ. Final appearance: high TPJ + high Amygdala |

### The 7 Production Layers (Horizontal — applied sequentially through the pipeline)

| # | Layer | Input Modality | When Applied | Status |
|---|-------|---------------|-------------|--------|
| 1 | **Beat Sheet Validation** | Text (beat descriptions) | After story outline, before scene writing | ✅ **Proven** |
| 2 | **Scene Craft Validation** | Text (full scene script) | After scenes drafted | ✅ **Works** (with caveat) |
| 3 | **Assembly / Sequence Validation** | Text (sequence of beats) | During act assembly | ✅ **Ready** |
| 4 | **Character Neural Fingerprint** | Text (character dialogue) | During character bible + scene validation | 🔧 **Needs build** |
| 5 | **Performance Proxy** | Text + annotations | During scene validation | 🔧 **Needs design** |
| 6 | **Visual / Cinematic Validation** | Video (V-JEPA2) | During pre-production → final cut | 🟡 **Model supports it** |
| 7 | **Music / Sound Validation** | Audio (Wav2Vec-BERT) | During post-production | 🟡 **Model supports it** |

---

## 3. Phase 1 — Immediate (Already Works)

### Layer 1: Beat Sheet Validation

**What it does:** Validates the macro emotional shape of the story. Each beat (40–60 per feature) is fed through TRIBE v2 at the beat-description level. The model returns a neural profile — Amygdala, TPJ, DMN, PFC, Insula — for each beat.

**Methodology — Three-Version Comparison:**

| Version | Source | What it tells us |
|---------|--------|-----------------|
| **A — Beat Description** | Producer's note of what the beat *should* do | The target. The neural profile the story architecture demands |
| **B — Analytical Rewrite** | AI-generated attempt to manufacture emotion | The gap between *understanding* craft and *executing* it |
| **C — Professional Script** | Sebastian's actual written scene | Ground truth — what a skilled writer produces |

**Discovered May 21 (Beat 7 — Blackmail Scene):**

| Metric | Beat Description | Analytical Rewrite | Sebastian's Script |
|--------|-----------------|-------------------|-------------------|
| Average activation | +0.008 | +0.021 | +0.001 |
| Amygdala | -0.056 | -0.031 | -0.056 |
| TPJ (character connection) | +0.012 | +0.023 | -0.013 |
| DMN (absorption) | +0.073 | +0.071 | +0.077 |
| PFC (cognitive load) | +0.046 | +0.053 | **+0.065** |
| Insula (visceral) | **+0.108** | +0.070 | +0.059 |

**Key finding:** The beat description outperformed the full script on visceral response because:
- TRIBE v2 measures *text*, not *performance*
- A dense script scene is informationally complex (multiple characters, scene setting, subtext, action lines)
- The brain processes the concise description as a single emotional unit
- The emotional payoff of the script comes from *watching it performed*, not reading it

This isn't a limitation of TRIBE v2 — it's a design constraint that tells us HOW to use each layer. Text validation is for **story architecture and craft intent**. Video/audio validation (Layers 6-7) captures the performed experience.

**Validation criteria per beat:**
```
BEAT ENTRY STATE:   What the previous beat leaves the audience feeling
BEAT PEAK STATE:    What this beat should achieve at its emotional high point
BEAT EXIT STATE:    What the audience needs to feel going into the next beat

PASS:   Neural profile matches all three states within tolerance
FLAG:   One or more ROIs outside target range → targeted rewrite
FAIL:   Profile contradicts the beat's intended function → structural rework
```

**Loop count:** 1–3 iterations per beat. ~40–180 TRIBE calls per feature.

---

### Layer 2: Scene Craft Validation

**What it does:** Validates whether the *written scene* delivers the neural state the beat promised. Scene text (action lines + dialogue) is fed through TRIBE v2 at sentence level.

**Validation criteria per scene:**
```
SCENE TARGET:    The beat's peak state + thematic purpose + tonal register
SCENE OUTPUT:    Neural profile of the scene text

DIVERGENCE CHECK:
  • PFC too high → cognitive load. Remove exposition, trust the audience to infer
  • Amygdala too low → not enough emotional weight. Introduce somatic detail
  • TPJ flat → character connection missing. Create a choice the audience can read
  • Insula absent → no body experience. Add a physical detail the character notices but doesn't comment on
```

**The craft-as-divergence-rules principle:** The system doesn't need to *write* well. It needs to *recognize when the writing isn't landing* and specify the correction. The divergence rules encode Sebastian's instinct as measurable constraints.

**Loop count:** 2–5 iterations per scene. ~120–450 TRIBE calls per feature.

**Caveat:** As with Layer 1, text-level validation measures the *blueprint*, not the *experience*. The script may produce low visceral response at text level and high visceral response when performed. This gap is bridged by Layer 5 (Performance Proxy) and closed by Layers 6-7 (Video/Audio).

---

### Layer 3: Assembly / Sequence Validation

**What it does:** Validates the shape of the neural trajectory across a sequence of beats or scenes. The goal isn't to maximize every ROI — it's to create *contrast*.

**The contrast principle:** A beat with high Amygdala that follows another high-Amygdala beat feels *less* intense than if it followed a quiet beat. The contrast *between* beats is as important as the absolute value of any single beat.

**Validation criteria:**
```
TRAJECTORY:     Does the arc rise, hold, and fall where the story demands?
CONTRAST:       Are there quiet beats between intense ones? Is the audience being given room to breathe?
CLIMAX:         Does the peak of each act align with the story's emotional target?
RESOLUTION:     Does the audience land in the correct emotional state at the end?

FLAGS:
  • Flat trajectory over 3+ consecutive beats → insert variation
  • Wrong peak placement → structural reorder
  • No recovery after climax → audience fatigue
```

**Loop count:** 3–5 iterations per act. ~9–15 TRIBE calls per feature.

---

## 4. Phase 2 — Needs Build (Next 2–4 Weeks)

### Layer 4: Character Neural Fingerprint

**What it does:** Ensures each character produces a consistent, intentional neural signature across every scene they appear in. The audience's relationship to each character is a neural trajectory that must be deliberately designed and maintained.

**Character targets:**
| Desired audience relationship | Neural fingerprint |
|------------------------------|-------------------|
| **Trust this character** | Rising TPJ over time, stable DMN |
| **Suspect this character** | High PFC (audience is analysing them), low TPJ |
| **Fear for this character** | High Amygdala, rising Insula |
| **Love this character** | Peak TPJ, moderate Amygdala, DMN absorption |
| **Distrust / feel unsettled** | DMN suppression, PFC elevated — cognitive dissonance |

**Implementation:** Cluster all dialogue for one character across scenes. Run each cluster through TRIBE v2. Compare consistency across scenes. Flag drift.

**Loop count:** 1–2 per character per act. ~20–40 TRIBE calls per feature.

---

### Layer 5: Performance Proxy

**What it does:** Bridges the gap between the *written script* and the *performed experience*. A script sentence like "He doesn't touch the photograph, just looks at it" produces a cognitive neural profile at text level, but when *performed* — with a 3-second silence, a hand tremor, a held close-up — it produces a visceral profile.

**Methodology:** Annotate script moments with performance descriptors, then feed the *annotated* description through TRIBE v2 alongside the raw text. Compare the two predictions. The gap is the *performance premium*.

**Annotation dimensions:**
| Dimension | Examples |
|-----------|---------|
| **Stillness / movement** | "3 seconds of silence", "hand tremor", "slow breath" |
| **Camera** | "Close-up held for 4 beats", "slow push-in", "wide shot of empty room" |
| **Sound** | "Footsteps fading", "distant casino noise", "no music — just silence" |
| **Pacing** | "Beat. Long beat. She doesn't answer." |

**Loop count:** 1 annotation pass per scene, then re-validate. ~60–90 annotations per feature.

---

## 5. Phase 3 — Full Multimodal (Model Supports It)

### Layer 6: Visual / Cinematic Validation

**What it measures:** Every frame's contribution to the intended neural state. TRIBE v2 uses **V-JEPA2** as its video feature extractor, trained on naturalistic video stimuli. The same validation grid applies: Does this frame serve the theme, tone, and symbolism?

**What can be validated:**
| Visual element | Neural impact |
|---------------|---------------|
| **Camera distance** — wide vs. close-up | Wide = context/isolation (PFC engagement). Close-up = intimacy/pressure (Amygdala + TPJ) |
| **Colour palette** — warm vs. cold vs. desaturated | Warm = comfort/memory (DMN engagement). Cold = threat/distance (Amygdala, PFC). Desaturated = grief/hopelessness (Amygdala + Insula) |
| **Lighting** — hard shadows vs. soft | Hard = moral clarity or danger. Soft = vulnerability or safety |
| **Movement** — handheld vs. locked-off | Handheld = instability/tension (Insula rise). Locked-off = stillness/dread (sustained low-frequency Amygdala) |
| **Composition** — centred vs. pushed to edge | Centred = stability. Pushed = anxiety, imbalance |
| **Symbol placement** — where in the frame | Central = conscious processing. Peripheral = subconscious |

**Implementation:** Feed individual frames or short sequences (video clips) through TRIBE v2's video pipeline. The model returns per-timestep neural predictions across all 20,484 vertices, mapped to the same ROI networks used for text.

**Loop count:** 1–3 iterations per key sequence. ~30–60 TRIBE calls per feature for the pivotal moments.

---

### Layer 7: Music / Sound Validation

**What it measures:** Whether the score and sound design amplify or conflict with the scene's neural target. TRIBE v2 uses **Wav2Vec-BERT** as its audio feature extractor.

**What can be validated:**
| Audio element | Neural impact |
|--------------|---------------|
| **Key** — major vs. minor | Major = openness, hope (DMN, reduced PFC). Minor = tension, grief (Amygdala, Insula) |
| **Tempo** — fast vs. slow | Fast = urgency (Amygdala, PFC engagement). Slow = weight, space for feeling (DMN, sustained Amygdala) |
| **Instrumentation** — orchestral vs. solo | Full = grandeur, overwhelm. Solo = intimacy, vulnerability |
| **Silence** — absence of sound | Can be the most powerful cue — forces the audience into their own emotional response (max DMN, PFC suppressed) |
| **Leitmotif** — musical symbolism | Call-back to earlier moment should produce *amplified* response (accumulated meaning) |

**Implementation:** Feed audio track (or segments) through TRIBE v2's audio pipeline. Compare predicted vs. intended neural state per scene. Flag audio elements that push the audience *away* from the target.

**Loop count:** 2–3 iterations per cue. ~20–40 TRIBE calls per feature.

---

## 6. The Through-Lines in Practice — A Worked Example

### Beat 7: The Blackmail Scene (YETI)

**Beat description (target):** Sophia threatens Bill, leveraging his son. He has no choice.

**Theme:** *Impossible choice — what do you sacrifice when there's no right answer?*
- Neural target: DMN sustained (thematic resonance), Amygdala moderate (emotional weight of the choice)
- Validation: Does the beat's neural profile show the audience *feeling* the weight of the choice, not just *understanding* it?

**Tone:** *Menace — quiet, controlled, predatory*
- Neural target: PFC slightly suppressed (not explaining the menace), Insula elevated (the audience *feels* the threat in their body)
- Validation: Does the prediction show Amygdala + Insula coupling, or is it pure cognitive threat recognition (PFC only)?

**Symbolism:** *The photograph — connection to Bill's son, the thing he loves that is being weaponized*
- Neural progression target:
  - First appearance: TPJ moderate (we understand what it means to him)
  - Mid-scene: Amygdala rises (it hurts not to touch it)
  - Final: TPJ + Amygdala (the accumulated weight of what he's about to lose)

**Grid validation for Sebastian's script:**
```
LAYER 1 (Beat):      TPJ +0.012 → FLAG (too low for 'character in impossible choice')
LAYER 2 (Scene):     PFC +0.065 → FLAG (script text is informationally dense)
LAYER 5 (Performance Proxy): Would correct PFC down (the silence, the stillness, the close-up)
LAYER 6 (Video):     Would show the V-JEPA2 prediction when the camera holds on the photograph
LAYER 7 (Audio):     Would show the Wav2Vec-BERT prediction for silence vs. subtle score

Diagnosis: The text-only validation tells us the story architecture is right but the emotional
payload lives in performance and camera. The full multimodal pipeline captures the experience.
```

---

## 7. Complete Loop Count — Idea to Finished Film

| Phase | Layer | TRIBE calls | Human rewrite passes | Time | Notes |
|-------|-------|-------------|---------------------|------|-------|
| **1** | Beat Sheet | 40–180 | 1–3 full-pass rewrites | 1–2 days | Fully automated. Fast iteration. |
| **1** | Scene Craft | 120–450 | 2–5 per scene | 1–2 weeks | Per-scene validation. Prioritize pivotal scenes. |
| **1** | Assembly | 9–15 | 3–5 per act | 1–2 days | Sequence-level trajectory validation. |
| **2** | Character FP | 20–40 | 1–2 per character | 2–3 days | Consistency check. Low overhead. |
| **2** | Performance Proxy | 60–90 | 1 per scene | 3–5 days | Annotation layer. Closes the script→experience gap. |
| **3** | Visual (Video) | 30–60 | 2–3 per key sequence | 1–2 weeks per key seq | GPU required. Run on pivotal scenes only. |
| **3** | Music (Audio) | 20–40 | 2–3 per cue | 1–2 weeks | GPU required. Run on emotional peaks. |

**Total per feature:** ~300–900 TRIBE inferences, ~10–50 human rewrite passes, **4–8 weeks** of parallel development.

**After the first feature:** The divergence rules (craft-as-measurable-constraints) become a reusable knowledge base. Each successive feature converges faster because the system learns *which kinds of choices move which ROIs*.

---

## 8. Sky Pitch Integration

### The Consciousness Through-Line

The brain constructs reality through narrative. Storytelling works because consciousness *is* narrative self-construction.

- The brain checks against *coherence*, not *truth*
- A well-crafted story feels *more real* to the brain than a poorly remembered actual event
- The actor's craft — manufacturing genuine emotion from invented circumstances — is consciousness research from the inside
- Narrative dissonance (a story that doesn't align with experience) is the same mechanism as cognitive dissonance

**Why IFFY is unique:** We aren't building a better writing tool. We're building an **emotional engineering system** that measures the mechanism by which stories become real in the audience's brain.

### Demo Strategy

**What we can demo NOW (June 1):**
1. **Beat-level validation** — Take a beat from YETI, run the three-way comparison (description vs. analytical rewrite vs. Sebastian's script), show the neural prediction divergence
2. **The 7×3 grid** — Show the architecture. Prove we understand the full problem space even if we're demonstrating in one modality
3. **The consciousness through-line** — This is the philosophical payload. The "why" that makes Sky want to fund the "how"

**What we promise to build next:**
1. Full multimodal pipeline (video + audio integration with TRIBE v2)
2. Performance proxy layer
3. Character neural fingerprint system
4. The divergence-rule database (craft encoded as neural constraints)

---

## 9. Next Steps

| Priority | Task | Owner | Timeline |
|----------|------|-------|----------|
| **P0** | Run Act 1 of YETI through full beat-level validation pipeline | Red | This week |
| **P0** | Prepare Sky pitch document integrating this framework + demo plan | Red + Sebastian | Before June 1 |
| **P1** | Build the performance proxy annotation system | Red | Next 2 weeks |
| **P1** | Test TRIBE v2 video pipeline on a 30-second clip | Red | Next 2 weeks |
| **P1** | Define character neural fingerprints for YETI's 4 characters | Red + Sebastian | Next 2 weeks |
| **P2** | Build character neural fingerprint clustering code | Red | Week 3–4 |
| **P2** | Run moment-level analysis on 3 pivotal beats | Red | Week 3–4 |
| **P3** | Integrate TRIBE v2 audio pipeline | Red | Week 5–6 |
| **P3** | Build divergence-rule database from Sebastian's rewrite notes | Red | Week 5–6 |

---

## Appendix: Technical Architecture

### Current Setup

- **Model:** TRIBE v2 (`facebook/tribev2` via HuggingFace Hub)
- **Text encoder:** `unsloth/Llama-3.2-3B` (mirror bypassing Meta's gated LLaMA 3.2)
- **Surface:** fsaverage5 (~20,484 cortical vertices)
- **Hardware:** Apple Silicon (M4 Max) — CPU-only inference
  - Sentence-level: ~20–50s per embedding
  - Word-level: ~30–60s per embedding
  - Full act (30–40 sentences): ~15–30 minutes
- **Code location:** `~/code/tribe-test/`

### Multimodal Requirements

| Modality | Additional Requirements | Estimated GPU need |
|----------|----------------------|-------------------|
| **Text** (current) | None — runs on CPU | None |
| **Video** (V-JEPA2) | Video file input, GPU for vision encoder | 16GB+ VRAM |
| **Audio** (Wav2Vec-BERT) | Audio file input, GPU for audio encoder | 8GB+ VRAM |

### Data Flow

```
Input (text/image/audio/video)
    → TRIBE v2 feature extractor (LLaMA / V-JEPA2 / Wav2Vec-BERT)
    → Unified Transformer encoder
    → Cortical surface projection (fsaverage5, 20,484 vertices)
    → Per-RI network aggregation (Amygdala, TPJ, DMN, PFC, Visual, Insula)
    → Divergence detection vs. beat target
    → Targeted rewrite instruction
```

---

*This document was produced collaboratively by Red and Sebastian on May 21, 2026. It represents the current state of the IFFY neural synthesis framework and is intended for strategic planning and investor communication.*