/**
 * Document Purpose Registry v1
 *
 * IFFY treats documents according to what they are FOR, not just what stage they occupy.
 *
 * Purpose classes define:
 *   - the primary scoring axis (CI vs GP, and what each measures for this doc type)
 *   - the rewrite goal (depth/architecture vs commercial readiness)
 *   - how notes should be scoped and framed
 *
 * This registry is the single source of truth. buildAnalyzeSystem and buildRewriteSystem
 * MUST consult it — never hard-code purpose logic per doc type elsewhere.
 *
 * INVARIANT: unknown doc types fall back to PREMISE_POSITIONING (safe generic default).
 *
 * Architecture-Strict Mode: determinism overrides convenience.
 * No silent fallback to generic CI/GP for docs that have an explicit purpose class.
 */

// ── Purpose Classes ──

export type DocPurposeClass =
  /** Internal creative architecture. Job: improve story quality, depth, structural completeness.
   *  Score on: depth, craft, internal coherence, development utility.
   *  NOT on: market positioning, packaging magnetism, castability. */
  | "DEVELOPMENT_ARCHITECTURE"

  /** Concept / viability bridge. Job: establish premise strength and commercial clarity.
   *  Score on: premise originality, hook clarity, genre legibility, commercial viability.
   *  Balanced CI/GP — both matter. */
  | "PREMISE_POSITIONING"

  /** Commercial-facing outputs. Job: communicate market promise and finance readiness.
   *  GP is primary. CI reflects clarity and quality of the commercial argument.
   *  NOT scored on narrative depth. */
  | "PACKAGING_COMMERCIAL"

  /** Executable story delivery. Job: produce a script or production-ready document.
   *  Score on: craft, format compliance, scene quality, production feasibility. */
  | "SCRIPT_EXECUTION";


// ── Purpose Map ──

export const DOC_PURPOSE_MAP: Record<string, DocPurposeClass> = {
  // DEVELOPMENT_ARCHITECTURE — internal creative architecture
  character_bible:          "DEVELOPMENT_ARCHITECTURE",
  story_outline:            "DEVELOPMENT_ARCHITECTURE",
  beat_sheet:               "DEVELOPMENT_ARCHITECTURE",
  season_arc:               "DEVELOPMENT_ARCHITECTURE",
  vertical_episode_beats:   "DEVELOPMENT_ARCHITECTURE",
  episode_grid:             "DEVELOPMENT_ARCHITECTURE",
  episode_beats:            "DEVELOPMENT_ARCHITECTURE",

  // PREMISE_POSITIONING — concept / viability bridge
  idea:                     "PREMISE_POSITIONING",
  concept_brief:            "PREMISE_POSITIONING",
  treatment:                "PREMISE_POSITIONING",
  format_rules:             "PREMISE_POSITIONING",
  topline_narrative:        "PREMISE_POSITIONING",

  // PACKAGING_COMMERCIAL — market / finance outputs
  market_sheet:             "PACKAGING_COMMERCIAL",
  deck:                     "PACKAGING_COMMERCIAL",
  vertical_market_sheet:    "PACKAGING_COMMERCIAL",
  trailer_script:           "PACKAGING_COMMERCIAL",
  project_overview:         "PACKAGING_COMMERCIAL",
  market_positioning:       "PACKAGING_COMMERCIAL",

  // SCRIPT_EXECUTION — executable story delivery
  feature_script:           "SCRIPT_EXECUTION",
  episode_script:           "SCRIPT_EXECUTION",
  season_script:            "SCRIPT_EXECUTION",
  production_draft:         "SCRIPT_EXECUTION",
  season_master_script:     "SCRIPT_EXECUTION",
  documentary_outline:      "SCRIPT_EXECUTION",
};


// ── Public Lookup ──

/**
 * Returns the purpose class for a doc type.
 * Fails safe to PREMISE_POSITIONING for unknown types.
 */
export function getDocPurposeClass(docType: string): DocPurposeClass {
  return DOC_PURPOSE_MAP[docType] ?? "PREMISE_POSITIONING";
}


// ── Purpose-Aware CI/GP Scoring Rubrics ──
// These REPLACE the generic universal CI/GP block for each purpose class.
// They are injected into buildAnalyzeSystem after the deliverable rubric.

export const PURPOSE_SCORING_RUBRICS: Record<DocPurposeClass, string> = {

  DEVELOPMENT_ARCHITECTURE: `SCORING RUBRIC (PURPOSE: DEVELOPMENT_ARCHITECTURE)

This document is an internal creative architecture tool. CI scores the quality of the document's internal craft. GP scores whether it unblocks the next development stage.

== CI: CREATIVE INTEGRITY (50 points max) ==

Score each criterion. Award full points for YES, half for PARTIAL, zero for NO.

Criterion CI-1: Creative Depth and Specificity (10 pts)
  YES (10): Named characters with defined roles/goals/conflicts, OR named beats with specific content and stakes, OR explicit structural divisions with clear purpose
  PARTIAL (5): General descriptions of characters/beats/structure present, but lacks specific names or detailed content
  NO (0): Vague, generic, or core content missing entirely

Criterion CI-2: Internal Coherence (10 pts)
  YES (10): No internal contradictions; all elements work together toward a unified story direction
  PARTIAL (5): Minor inconsistencies present, but overall story direction is clear
  NO (0): Major contradictions, or no identifiable story direction

Criterion CI-3: Thematic Integration (10 pts)
  YES (10): Theme is explicitly stated or clearly embedded in the narrative content
  PARTIAL (5): Theme is present but not consistently woven through
  NO (0): No identifiable theme, or theme disconnected from story

Criterion CI-4: Structural Completeness (10 pts)
  YES (10): All structural elements expected for this document type are present and fully developed
  PARTIAL (5): Most elements present but some are underdeveloped or missing
  NO (0): Structural elements missing, incomplete, or structurally incoherent

Criterion CI-5: Craft Quality (10 pts)
  YES (10): Writing quality, narrative logic, and prose are clear, purposeful, and appropriate for an internal development document
  PARTIAL (5): Adequate craft with some muddled passages or logic gaps
  NO (0): Poor craft: unclear writing, logical contradictions, or content that impedes understanding

Criterion CI-6: Canon Conformance (6 pts)
  YES (6): All character names, roles, relationships, and identity facts match the established character bible canon. Episode premises do not contradict canon facts (logline, premise, genre, tone, character roles). No character appears under a different name, motivation, or role than what is defined in the character bible.
  PARTIAL (3): Minor canon drift detected — some character details or relationship facts differ from canon, but no major identity contradictions.
  NO (0): Significant canon violations — protagonist profession/trait contradicts canon, key relationship type differs (e.g., friend vs enemy), or character not in canon appears as primary. Any instance of a character acting against their established bible identity is a full NO.

CI SCORE = sum of CI-1 through CI-6 (max 56, multiply by 2 for 0-100 scale, capped at 100)

== GP: DEVELOPMENT READINESS (50 points max) ==

Score each criterion. Award full points for YES, half for PARTIAL, zero for NO.

Criterion GP-1: Next-Stage Unblocking (13 pts)
  YES (13): This document provides everything the next stage needs to begin immediately with no ambiguity
  PARTIAL (7): Next stage can begin but some ambiguity or gaps exist about what exactly to do next
  NO (0): Next stage cannot proceed without major creative decisions being reopened

Criterion GP-2: Specificity and Actionability (12 pts)
  YES (12): All material is specific and actionable; a writer could take this directly into the next document without invention
  PARTIAL (6): Material is usable but requires the next-stage writer to fill gaps or make creative choices
  NO (0): Material too general or ambiguous to serve as a clear development brief

Criterion GP-3: Critical Architecture Decisions in Place (13 pts)
  YES (13): All critical architecture decisions are resolved and mutually consistent
  PARTIAL (7): Most decisions resolved, but 1-2 significant decisions remain open or ambiguous
  NO (0): Significant decisions open, contradicted, or missing

Criterion GP-4: Gap Identification (12 pts)
  YES (12): Document explicitly acknowledges what is NOT yet resolved and flags what needs addressing in subsequent stages
  PARTIAL (6): Some awareness of open questions, but gaps are not clearly called out
  NO (0): No gap awareness; document implies everything is resolved when it is not

GP SCORE = sum of GP-1 through GP-4 (max 50, multiply by 2 for 0-100 scale)

== FINAL SCORES ==
ci_score [0-100] = CI SCORE multiplied by 2
gp_score [0-100] = GP SCORE multiplied by 2

CRITICAL SCORING RULES for DEVELOPMENT_ARCHITECTURE:
- Do NOT score packaging, castability, talkability, or commercial framing.
- Do NOT penalize for lacking audience hook language or pitch-facing polish.
- A character bible with named characters, defined roles/goals/conflicts, and complete profiles scores ci_score 80+ and gp_score 75+ regardless of commercial language.
- A beat sheet with all acts, clearly labeled turning points, midpoint, climax, and mutually consistent story logic scores ci_score 78+ and gp_score 75+.
- CI and GP are independent: a document can score high on one and lower on the other.
- Canon conformance (CI-6) is MANDATORY for episode_grid, vertical_episode_beats, episode_beats, and season_arc. For these doc types, CI-6 must be evaluated against the character bible and canon facts. A document that violates canon facts scores a maximum of CI-4 (72) regardless of other quality dimensions.

- CANONICAL COMMITMENT RULE: Once a document is promoted and locked, its facts become canonical for all downstream documents. Downstream docs (beat_sheet, character_bible, season_arc, episode_grid, episode_beats, VEB) MUST NOT contradict established canon facts without explicit documented justification. If a downstream doc PROPOSES a canon change, it MUST be raised as a development_note with severity=blocker, explaining: (1) exactly what fact is being changed, (2) the specific CI or GP gain that justifies it, and (3) why the gain is worth the canonical breakage. A canon change without documented justification is a blocker. A canon change with weak justification (CI/GP gain <5 points) is also a blocker. Only changes with compelling, specific CI/GP rationale may proceed.`,

  PREMISE_POSITIONING: `SCORING RUBRIC (PURPOSE: PREMISE_POSITIONING)

This document bridges creative vision and commercial viability. CI scores the creative integrity of the concept. GP scores its market legibility and development viability.

== CI: CREATIVE INTEGRITY (50 points max) ==

Score each criterion. Award full points for YES, half for PARTIAL, zero for NO.

Criterion CI-1: Originality and Distinctiveness (12 pts)
  YES (12): Concept offers a fresh angle, unexpected combination, or distinctive voice
  PARTIAL (6): Competent but familiar; recognizable genre/trope without strong differentiation
  NO (0): Highly generic, fully derivative, or indistinguishable from existing material

Criterion CI-2: Emotional Conviction and Character Truth (13 pts)
  YES (13): The core human experience is clear, emotionally grounded, and character-driven
  PARTIAL (7): Emotional element present but underdeveloped or subordinate to plot
  NO (0): No clear emotional core; characters serve plot rather than the reverse

Criterion CI-3: Thematic Coherence and Genre Clarity (12 pts)
  YES (12): Theme is identifiable and consistently explored; genre is clear, specific, and explicitly declared
  PARTIAL (6): Theme or genre present but vague or inconsistently applied
  NO (0): No identifiable theme; genre unclear or absent

Criterion CI-4: Structural Integrity of Concept (13 pts)
  YES (13): The concept contains a complete dramatic engine; beginning, middle, and end are structurally implicit and mutually dependent
  PARTIAL (7): Basic structure present but incomplete
  NO (0): No identifiable story structure; premise does not generate a narrative

Criterion CI-5: Canon Conformance for Downstream Docs (6 pts)
  [Only evaluate this criterion if the document is treatment, story_outline, or topline_narrative — skip for idea/concept_brief/format_rules as these documents ESTABLISH canon rather than conform to it]
  YES (6): All character names, relationship types, story facts, and premise elements match what was established in the upstream locked documents (idea logline, concept_brief premise, format_rules specs). The treatment does not contradict, rename, or reframe any element that was locked in an earlier stage.
  PARTIAL (3): Minor drift from upstream canon — a character motivation or relationship dynamic differs slightly, but no core identity contradictions.
  NO (0): Treatment contradicts a locked premise element — protagonist's core goal changes, a key relationship type inverts (e.g., mentor becomes antagonist), or the genre/tone shifts significantly from what was declared in the idea/concept_brief.

CI SCORE = sum of CI-1 through CI-5 (max 56, multiply by 2 for 0-100 scale, capped at 100)

CRITICAL SCORING RULE for PREMISE_POSITIONING: If this is a treatment or story_outline, CI-5 is MANDATORY. Score it against the locked idea and concept_brief. Do not apply CI-5 to idea, concept_brief, or format_rules documents — these are establishing canon, not conforming to it.

== GP: GREENLIGHT PROBABILITY (50 points max) ==

Score each criterion. Award full points for YES, half for PARTIAL, zero for NO.

Criterion GP-1: Audience Clarity and Hook Strength (10 pts)
  YES (10): Target audience is precisely defined; the hook is immediately legible and compelling
  PARTIAL (5): Audience or hook present but vague or generic
  NO (0): No clear target audience; hook absent or illegible

Criterion GP-2: Market Positioning Within Declared Lane (10 pts)
  YES (10): Lane explicitly named; project clearly differentiated from direct competitors within it
  PARTIAL (5): Lane named but positioning vague or undifferentiated
  NO (0): No clear lane identified; no differentiation argument

Criterion GP-3: Concept Legibility (10 pts)
  YES (10): A reader or buyer can understand exactly what this project is in one read
  PARTIAL (5): General sense conveyed but specifics unclear or confusing
  NO (0): Concept is confusing, misleading, or requires extensive explanation

Criterion GP-4: Development Viability (10 pts)
  YES (10): Premise generates sufficient story material; natural escalation and resolution are evident
  PARTIAL (5): Some story potential visible but limited or unclear
  NO (0): Premise too thin to sustain a full story; no clear narrative engine

Criterion GP-5: Alignment with Monetisation Lane (10 pts)
  YES (10): Format, tone, budget, and platform explicitly declared and mutually consistent
  PARTIAL (5): Partial alignment; 1-2 elements missing or misaligned
  NO (0): No explicit format/platform/budget alignment; viability unclear

GP SCORE = sum of GP-1 through GP-5 (max 50, multiply by 2 for 0-100 scale)

== FINAL SCORES ==
ci_score [0-100] = CI SCORE multiplied by 2
gp_score [0-100] = GP SCORE multiplied by 2

Both CI and GP matter equally for this purpose class.
Do NOT penalize for lacking scene-level craft detail; this is a concept/framing document.

- CANONICAL COMMITMENT RULE: concept_brief and treatment are establishing documents. However, once a concept_brief is promoted, its premise facts (protagonist identity, core goal, central conflict, genre, tone) are canonical. A treatment that contradicts concept_brief facts must raise the contradiction as a blocker note with specific justification. If the contradiction is deliberate and improves CI or GP by 5+ points, the change may be approved — but the justification must be documented. Canon breakage without clear benefit is a blocker.`,

  PACKAGING_COMMERCIAL: `SCORING RUBRIC (PURPOSE: PACKAGING_COMMERCIAL):
This document is a commercial-facing output. Its job is to communicate market promise,
positioning, and finance/pitch readiness.

GP (Commercial Viability) is the PRIMARY scoring axis:
- Audience targeting clarity and specificity
- Market positioning — is the unique angle and gap clearly articulated?
- Comparable titles — are comps current, genuinely comparable, and used to make an argument?
- Budget alignment and production feasibility
- Distribution strategy and platform fit
- Revenue model and monetisation logic

CI (Clarity and Argument Quality) is secondary:
- Is the commercial argument clear and internally consistent?
- Is the language precise and pitch-ready?
- Does the document make the case it sets out to make?

Do NOT score narrative craft, character depth, or thematic complexity for packaging documents.
Do NOT penalise a market sheet or deck for lacking character development.`,

  SCRIPT_EXECUTION: `SCORING RUBRIC (PURPOSE: SCRIPT_EXECUTION):
This document is executable story delivery in script or production-ready form.

== CI: CREATIVE INTEGRITY (50 points max) ==

Score each criterion. Award full points for YES, half for PARTIAL, zero for NO.

Criterion CI-1: Dialogue Craft and Scene Dynamics (12 pts)
  YES (12): Character voice is distinct and consistent; dialogue drives story; scenes have clear purpose and momentum.
  PARTIAL (6): Dialogue is functional but some exchanges feel generic or scenes ramble.
  NO (0): Character voice is undifferentiated; dialogue is expository or hollow; scenes lack purpose.

Criterion CI-2: Structural Integrity and Pacing (12 pts)
  YES (12): The script's structure supports the story's arc; pacing serves the material's natural rhythm; act/episode breaks land correctly.
  PARTIAL (6): General structure is present but some act breaks feel off or pacing is uneven.
  NO (0): Structural problems — pacing drags, act breaks missing or misplaced, episode structure violated.

Criterion CI-3: Visual Storytelling and Dramatic Impact (10 pts)
  YES (10): The script uses cinematic language — blocking, camera perspective, environment — to tell the story visually as well as verbally.
  PARTIAL (5): Some visual storytelling present but often falls back to dialogue explanation.
  NO (0): Minimal visual storytelling; the script reads like a stage play without cinematic intent.

Criterion CI-4: Thematic Coherence and Emotional Conviction (8 pts)
  YES (8): The script's emotional throughline is clear; theme is embedded in action and dialogue, not stated.
  PARTIAL (4): Emotional element present but inconsistent; theme occasionally stated rather than shown.
  NO (0): No clear emotional arc; theme is absent or heavy-handed.

Criterion CI-5: Canon Conformance (8 pts)
  YES (8): All character names, visual descriptions, relationship dynamics, and story facts match the established character_bible canon. Episode premises do not contradict the episode_grid or season_arc. No character behaves against their established bible identity.
  PARTIAL (4): Minor canon drift — a character detail or visual description differs from the bible but no core identity violation.
  NO (0): Significant canon violations — a character acts against their bible identity, a relationship type contradicts the bible, or an episode premise contradicts the episode_grid/season_arc.

CI SCORE = sum of CI-1 through CI-5 (max 50, multiply by 2 for 0-100 scale)

== GP: GREENLIGHT PROBABILITY (50 points max) ==

Score each criterion. Award full points for YES, half for PARTIAL, zero for NO.

Criterion GP-1: Production Feasibility vs Budget (10 pts)
  YES (10): Every scene is executable within the declared budget and format constraints. No exigency problems.
  PARTIAL (5): Mostly executable with minor budgetrisks.
  NO (0): Multiple scenes require resources beyond budget or format constraints.

Criterion GP-2: Audience Clarity and Hook Strength (10 pts)
  YES (10): The script has a clear target audience; the hook is present and compelling; the audience knows what they are getting.
  PARTIAL (5): Audience is vaguely defined; hook is present but not specific.
  NO (0): No clear target audience; hook is absent or generic.

Criterion GP-3: Packaging Magnetism (10 pts)
  YES (10): The script has castable roles, a clear audience promise, and a marketable concept.
  PARTIAL (5): Some packaging elements present but not compelling.
  NO (0): Weak packaging — roles feel generic, concept is hard to articulate in a market context.

Criterion GP-4: Commercial Viability (10 pts)
  YES (10): The produced script is viable as a product — it can be made within budget, sold to the target audience, and executed in the declared format.
  PARTIAL (5): Basic viability but significant risks.
  NO (0): Viability is unclear or compromised by execution requirements.

Criterion GP-5: Format Compliance (10 pts)
  YES (10): Script format is correct for the declared type (screenplay, episode script, or season script); proper sluglines, action, dialogue formatting used throughout.
  PARTIAL (5): Generally correct format with occasional errors.
  NO (0): Format errors throughout — sluglines wrong, action blocks misused, format violated for the declared type.

GP SCORE = sum of GP-1 through GP-5 (max 50, multiply by 2 for 0-100 scale)

== FINAL SCORES ==
ci_score [0-100] = CI SCORE multiplied by 2
gp_score [0-100] = GP SCORE multiplied by 2

CRITICAL SCORING RULE for SCRIPT_EXECUTION: CI-5 (Canon Conformance) is MANDATORY. Scripts must conform to the character_bible, episode_grid, and season_arc. A script that violates canon scores a maximum of CI-3 (60) regardless of dialogue quality.

- CANONICAL COMMITMENT RULE: Scripts must not contradict the character_bible, episode_grid, or season_arc. If a script discovers that following canon would limit CI or GP, it must raise a canon_rewrite proposal as a blocker note — not silently ignore the canon. Scripts are downstream consumers of canon; they do not rewrite canon unilaterally. Any scene that requires violating a character's established identity must be flagged.

Do NOT score idea/concept development, market positioning, or packaging language in a script. Score the execution quality only.`,
};


// ── Purpose-Aware Rewrite Goals ──
// Replaces the universal "Strengthen escalation and improve packaging magnetism organically"
// with a purpose-appropriate rewrite objective.

export const PURPOSE_REWRITE_GOALS: Record<DocPurposeClass, string> = {

  DEVELOPMENT_ARCHITECTURE:
    `- Deepen the creative architecture: character specificity, structural clarity, thematic integration, arc completeness.
- Resolve the structural and developmental issues in the approved notes exactly as directed.
- Do NOT introduce packaging language, commercial framing, or pitch-facing language — this is an internal development document.
- Do NOT flatten creative specificity for commercial legibility.
- Strengthen what is already strong; repair what the notes identify as weak.
- OUTPUT THE COMPLETE DOCUMENT — all sections, all characters/beats/acts — do not truncate.`,

  PREMISE_POSITIONING:
    `- Strengthen premise clarity, hook specificity, and commercial legibility.
- Deepen emotional conviction and thematic coherence at concept level.
- Apply approved notes to improve both creative integrity and market viability.
- Strengthen escalation logic and concept viability.
- Do not flatten voice for minor commercial gain.`,

  PACKAGING_COMMERCIAL:
    `- Sharpen commercial argument, positioning clarity, and market specificity.
- Strengthen comps, audience targeting, and distribution logic.
- Apply approved notes to improve commercial viability and pitch readiness.
- Improve packaging magnetism and buyer-facing clarity organically.
- Do NOT introduce narrative depth or character backstory unless explicitly requested.`,

  SCRIPT_EXECUTION:
    `- Strengthen dialogue craft, scene dynamics, and dramatic impact.
- Improve pacing, character voice, and structural integrity.
- Apply approved notes to improve script quality and production readiness.
- Strengthen escalation and improve packaging magnetism organically.
- Maintain proper format for the deliverable type (screenplay, episode script, etc.).`,
};
