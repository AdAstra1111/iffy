---

# FORMAT RULES — SENDER UNKNOWN

**Doc type:** `format_rules`
**Project:** SENDER UNKNOWN
**Format:** Vertical drama · 60 episodes · 3 seasons × 20
**Version:** 1.0
**Status:** Active

---

## 1. EPISODE STRUCTURE

### Runtime Bands

| Band | Duration | Use |
|------|----------|-----|
| Micro | 1:30–1:45 | Pure message reveals, single-beat episodes |
| Standard | 1:45–2:15 | Investigation scenes, dialogue + message hybrid |
| Extended | 2:15–2:30 | Season openers, finales, major twist episodes |

Hard ceiling: 2:30. No exceptions. Platform algorithms penalise beyond this.

### Beat Architecture (per episode)

| Beat | Timestamp | Function |
|------|-----------|----------|
| HOOK | 0:00–0:02 | Interrupt pattern. Visual or text that stops the scroll. |
| CONTEXT | 0:02–0:15 | Establish situation. Where are we? What just happened? |
| ESCALATION | 0:15–1:00 | New information. Tension builds. Stakes raised. |
| PIVOT | 1:00–1:30 | Reversal, discovery, or emotional shift. |
| CLIFF | Last 3–5s | Unresolved tension. Incomplete information. Force next episode. |

### Rules
- No episode may contain more than ONE major revelation.
- Every episode must contain exactly ONE new piece of information the audience didn't have before.
- Cold opens only. No recaps. No "previously on."
- Scene count per episode: 1–3 maximum. Single-scene episodes are preferred.

---

## 2. VERTICAL GRAMMAR

### Frame Composition Breakdown

| Shot Type | % of Runtime | Use |
|-----------|-------------|-----|
| Phone UI (texts, photos, apps) | 35–45% | Message reveals, photo evidence, search results |
| Face camera (tight CU) | 30–40% | Reactions, dialogue, emotional beats |
| Environmental / insert | 10–20% | Location establishing, props, hands, objects |
| Transitional / black | 2–5% | Beat separators, tension pauses |

### Framing Rules

**Phone UI shots:**
- Screen fills 85–100% of frame.
- Text must be readable at 1x speed without pausing.
- Maximum 3 message bubbles visible simultaneously.
- Cursor/typing indicator must be visible when sender is composing.

**Face camera shots:**
- Eyes in upper third. Always.
- Minimum 70% of face visible. No full-face crop below the mouth.
- Preferred focal length equivalent: 35–50mm. No wide-angle distortion on faces.
- Single-source lighting. Motivated light only (phone glow, window, lamp).

**Hand/insert shots:**
- Hands holding phone: show knuckle tension, grip changes, thumb hesitation.
- Props: only items that carry narrative weight. No dressing.

**Environmental shots:**
- Maximum 3 seconds duration.
- Must contain at least one narrative detail (object, shadow, reflection, person in background).
- Never purely atmospheric.

### Aspect Ratio
- 9:16 native. No letterboxing. No pillarboxing.
- Safe zone: all critical text and faces within 80% centre frame (platform UI overlays consume edges).

---

## 3. TEXT SYSTEM

### Message Pacing Rules

| Message Type | Display Duration | Typing Indicator |
|-------------|-----------------|----------------|
| Short (≤10 words) | 1.5–2s on screen before next action | 1–2s |
| Medium (11–25 words) | 3–4s on screen | 2–3s |
| Long (26+ words) | 4–5s, or split across 2 bubbles | 3–4s |
| Photo/media message | 2s loading blur → 1.5s reveal | None |

### Typing Delay Mechanics
- Typing indicator appears BEFORE every sender message.
- Minimum typing duration: 1s. Maximum: 4s.
- False starts: typing indicator appears, disappears, reappears. Use maximum 2× per episode.
- Typing indicator from THE SENDER (unknown) uses a distinct visual treatment (subtle glitch, slight colour shift on the indicator dots).

### Read Receipts as Tension
- Blue ticks / "Read" indicator is a narrative tool.
- Rules:
  - Lena's messages to The Sender: always show "Delivered." "Read" status is delayed or withheld as tension.
  - Marcus's messages: always show "Read" immediately. He's always watching.
  - The Sender's messages: no read receipts. One-directional pressure.

### Subtitle vs Native Text Hierarchy

| Layer | Priority | Treatment |
|-------|----------|-----------|
| In-screen text (messages) | Primary | Native phone UI. Diegetic. |
| Spoken dialogue subtitles | Secondary | Bottom-centre, semi-transparent BG, sans-serif. |
| Environmental text (signs, labels) | Tertiary | No subtitle. Must be readable in-frame or irrelevant. |

- In-screen text and subtitles must NEVER overlap.
- When phone UI is on screen, no subtitles appear. Audio is secondary.

---

## 4. HOOK ENGINE

### 5 Repeatable Hook Patterns

**PATTERN 1: THE NOTIFICATION**
- Frame 1: black screen or neutral shot.
- Frame 2 (0.5s): phone notification sound + banner slides in.
- Frame 3: message content partially visible. Cut before full read.
- Use: 30% of episodes. Primary hook type.

**PATTERN 2: THE REACTION**
- Frame 1: Lena's face, mid-expression shift (shock, confusion, fear).
- No context. No explanation. Audience must watch to understand why.
- Use: 25% of episodes.

**PATTERN 3: THE VISUAL CONTRADICTION**
- Frame 1: an image, photo, or scene that contradicts something previously established.
- No dialogue. No text. Pure visual dissonance.
- Use: 15% of episodes.

**PATTERN 4: THE INCOMPLETE SENTENCE**
- Frame 1: text on screen, mid-sentence. "He was there when—"
- Sentence is never completed in the hook. Completed later in the episode.
- Use: 15% of episodes.

**PATTERN 5: THE TIMESTAMP**
- Frame 1: a date, time, or countdown displayed prominently.
- Implies urgency or reveals temporal inconsistency.
- Use: 15% of episodes.

### Hook Rules
- No hook pattern may be used more than 3 episodes in a row.
- Season premieres always use PATTERN 1 (The Notification).
- Season finales always use PATTERN 2 (The Reaction).

---

## 5. SCROLL MECHANICS

### End-of-Episode Continuation Rules

Every episode must end with one of the following **cliff types:**

| Cliff Type | Description | Frequency |
|------------|-------------|-----------|
| INCOMPLETE REVEAL | Information partially shown. Key detail obscured or cut. | 40% |
| QUESTION PLANT | A question is asked (by character or text) but not answered. | 25% |
| ARRIVAL | Someone appears, a message arrives, a door opens. Cut before identity/content. | 20% |
| REVERSAL | Last 2 seconds contradict or reframe everything in the episode. | 15% |

### Last-Frame Design Rules
- Final frame persists for 0.8–1.2s (slightly longer than comfortable).
- Final frame must contain EXACTLY ONE dominant visual element (a face, a message, an object).
- No music resolution on the final frame. Audio must be suspended or absent.
- No fade-to-black. Hard cut or freeze.
- Platform "next episode" overlay must not obscure the dominant visual element. Keep it in the upper 70% of frame.

---

## 6. SOUND DESIGN RULES

### Core Principle
Every episode must be fully comprehensible on mute. Audio is additive, never load-bearing.

### Audio Hierarchy

| Layer | Role | Rules |
|-------|------|------|
| Phone sounds (notification, typing, keyboard) | Diegetic rhythm | Match on-screen actions exactly. No delay. |
| Ambient (room tone, traffic, weather) | Spatial grounding | Constant low-level presence. Never mixed above -18dB. |
| Score / music | Emotional colouring | Underscore only. No songs with lyrics during dialogue or text. |
| Dialogue | Character expression | Clear, close-mic'd. No ADR-sounding audio. |

### Mute-First Rules
- All critical information must be conveyed visually (text on screen or readable action).
- No plot-critical audio-only reveals.
- Sound design may ENHANCE a reveal (e.g., notification chime punctuating a message arrival) but must not BE the reveal.
- Score enters no earlier than 0:15 in any episode. Hook is always silent or diegetic-sound only.

### Silence as Tool
- Minimum 1 beat of full silence (0.5–1.5s) per episode.
- Silence must precede or follow the episode's major revelation.

---

## 7. PRODUCTION CONSTRAINTS

### Locations

| Constraint | Limit |
|------------|-------|
| Total unique locations (full series) | 8–12 |
| Locations per episode | 1–2 |
| Recurring locations | 4–5 (Lena's apartment, Marcus's office, café, therapist's office, car) |
| One-off locations | Maximum 1 per 5 episodes |

### Cast Density

| Constraint | Limit |
|------------|-------|
| On-screen cast per episode | 1–2 (Lena + max 1 other) |
| Total recurring cast | 5 |
| Day players / extras | Maximum 2 per episode, maximum 10 across full series |
| Solo Lena episodes | Minimum 40% of all episodes |

### Lighting Rules
- Single motivated source per scene. Phone glow, window light, practical lamp.
- No production lighting rigs visible in reflections (phone screens, mirrors, windows).
- Night scenes: phone screen is primary light source on face. Supplemented by one soft practical only.
- Daylight scenes: window light preferred. No direct sunlight on face (harsh shadows break mobile realism).
- Colour temperature: warm interiors (3200K), cool exteriors (5600K). Sender's messages cast slightly cooler light on Lena's face than normal texts.

### Camera Rules
- Handheld or stabilised handheld only. No tripod. No dolly. No crane.
- Movement motivated by character movement only. Camera does not move independently.
- Phone screen capture: direct screen recording composited in post. No filming screens.

---

**Document end.**

Next on ladder: `character_bible`
Awaiting instruction.
