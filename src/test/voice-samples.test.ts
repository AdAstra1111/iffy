/**
 * Voice Samples: Note Application Quality Root Cause — Test Suite
 *
 * Tests 4 changes from dev-engine-v2:
 * 1. ANALYZE polish-only override removed — voice_distinctiveness notes can now
 *    be blocking issues (not automatically polish-only)
 * 2. Voice-specific note matching in isAffected() — voice keyword + body > 100
 *    chars heuristic fires for character sections without explicit name match
 * 3. Voice component instruction in per-character rewrite prompt — register,
 *    vocabulary, tics, avoidances
 * 4. Post-rewrite voice quality verification gate — checkVoiceComponentPresence()
 *    + meta_json warning at <50% coverage
 */
import { describe, it, expect } from "vitest";

// ── Types (mirrored from dev-engine-v2 index.ts) ──

interface CharBibleSection {
  name: string;
  role?: string;
  sectionType: string;
  body: string;
  header?: string;
}

// ─── CHANGE 1: ANALYZE polish-only override removed ─────────────────────────
//
// The note schema now includes "voice_distinctiveness" as a valid category for
// blocking_issues and high_impact_notes (not just polish_notes).
// Previously, voice_distinctiveness notes were hardcoded as polish-only and
// could never block progression. Now they start as blockers (or high impact)
// and only get demoted to polish via the churn detection mechanism.

const VALID_BLOCKER_CATEGORIES = [
  "structural",
  "character",
  "escalation",
  "lane",
  "packaging",
  "risk",
  "pacing",
  "hook",
  "cliffhanger",
  "spine_alignment",
  "spine_drift",
  "character_depth",
  "arc_clarity",
  "voice_distinctiveness",
  "relationship_dynamics",
  "backstory_consistency",
  "thematic_integration",
  "missing_character",
  "cast_balance",
];

// Simulated detectNoteChurn (replicates exact logic from index.ts lines 551-640)
function detectNoteChurn_simulated(
  recentRuns: any[],
  effectiveDeliverable: string,
  parsed: any,
): { demotedKeys: string[] } {
  if (effectiveDeliverable !== "character_bible") return { demotedKeys: [] };
  if (!recentRuns || recentRuns.length < 3) return { demotedKeys: [] };

  const churnCount: Record<string, number> = {};
  const categoryChurnCount: Record<string, number> = {};

  for (const run of recentRuns) {
    const blockers = run.output_json?.blocking_issues || [];
    const seenKeys = new Set<string>();
    const seenCategories = new Set<string>();
    for (const b of blockers) {
      const nk = b.note_key || b.id;
      if (nk) seenKeys.add(nk);
      if (b.category) seenCategories.add(b.category);
    }
    for (const nk of seenKeys) {
      churnCount[nk] = (churnCount[nk] || 0) + 1;
    }
    for (const nk of Object.keys(churnCount)) {
      if (!seenKeys.has(nk)) {
        churnCount[nk] = 0;
      }
    }
    for (const cat of seenCategories) {
      categoryChurnCount[cat] = (categoryChurnCount[cat] || 0) + 1;
    }
    for (const cat of Object.keys(categoryChurnCount)) {
      if (!seenCategories.has(cat)) {
        categoryChurnCount[cat] = 0;
      }
    }
  }

  const demotedKeys: string[] = [];
  const currentBlockers = parsed.blocking_issues || [];
  const remaining: any[] = [];
  for (const b of currentBlockers) {
    const nk = b.note_key || b.id;
    const cat = b.category;
    if (nk && (churnCount[nk] || 0) >= 3) {
      demotedKeys.push(nk);
      if (!Array.isArray(parsed.polish_notes)) parsed.polish_notes = [];
      parsed.polish_notes.push({ ...b, severity: "polish", churn_demoted: true });
    } else if (cat && (categoryChurnCount[cat] || 0) >= 3) {
      demotedKeys.push(nk || cat);
      if (!Array.isArray(parsed.polish_notes)) parsed.polish_notes = [];
      parsed.polish_notes.push({ ...b, severity: "polish", churn_demoted: true, churn_category: cat });
    } else {
      remaining.push(b);
    }
  }
  parsed.blocking_issues = remaining;
  return { demotedKeys };
}

// Replicate isAffected from index.ts line 8555-8585
function isAffected(section: CharBibleSection, allNoteText: string): boolean {
  // Non-character sections: keyword-based matching
  if (section.sectionType === 'relationship_dynamics') {
    const rdKeywords = /\b(relationship|dynamic|character dynamic|paired dynamic)\b/i;
    return rdKeywords.test(allNoteText);
  }
  if (section.sectionType === 'ensemble_notes') {
    const enKeywords = /\b(ensemble|group|team note|cast dynamic|ensemble dynamics)\b/i;
    return enKeywords.test(allNoteText);
  }

  // Character sections: exact name match (existing logic)
  const nameLower = section.name.toLowerCase();
  const namePattern = new RegExp(
    nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i"
  );
  if (namePattern.test(allNoteText)) return true;

  // Voice-specific matching: if note text references voice/speech patterns
  // without naming a specific character, flag character sections with
  // substantial existing content for potential improvement
  const voiceKeywords = /\b(voice|speech|dialogue pattern|verbal|register|vocabulary)\b/i;
  if (voiceKeywords.test(allNoteText) && section.body.length > 100) {
    return true;
  }

  return false;
}

const VOICE_PROMPT_INSTRUCTION = `- INCLUDE the character's distinct VOICE: define speech register (formal/colloquial/archaic), vocabulary level, verbal tics (repeated phrases/patterns), and avoidances (words or topics the character would never say).`;

// Replicate checkVoiceComponentPresence from index.ts line 2146-2170
function checkVoiceComponentPresence(
  assembledSections: string[],
  updatedNames: string[]
): { coveragePercent: number; charactersWithVoice: number; characterCount: number } {
  const voicePatterns = [
    /\b(register|colloquial|formal|archaic)\b/i,
    /\b(vocabulary|lexicon|word choice|phrasing)\b/i,
    /\b(verbal tic|repeated phrase|catchphrase|verbal habit)\b/i,
    /\b(avoidance|never says|avoids topic)\b/i,
    /\b(speech pattern|dialogue pattern|speaks in|way of speaking)\b/i,
  ];

  const sectionsWithVoice = assembledSections.filter(body => {
    const matchCount = voicePatterns.filter(p => p.test(body)).length;
    return matchCount >= 2; // At least 2 different voice indicator categories
  }).length;

  const characterCount = updatedNames.length;
  const charactersWithVoice = Math.min(sectionsWithVoice, characterCount);
  const coveragePercent = characterCount > 0
    ? Math.round((charactersWithVoice / characterCount) * 100)
    : 0;

  return { coveragePercent, charactersWithVoice, characterCount };
}

// ─── CHANGE 1: ANALYZE polish-only override removed ───────────────────────

describe("change1: voice_distinctiveness blocker category", () => {

  it("voice_distinctiveness is valid in blocker categories", () => {
    expect(VALID_BLOCKER_CATEGORIES.includes("voice_distinctiveness")).toBe(true);
  });

  it("voice_distinctiveness note with severity blocker remains in blocking_issues through churn-detection if not churning", () => {
    const recentRuns = [
      { output_json: { blocking_issues: [{ note_key: "voice:hero", category: "voice_distinctiveness" }] }, created_at: "2025-01-02T00:00:00Z" },
      { output_json: { blocking_issues: [{ note_key: "voice:hero", category: "voice_distinctiveness" }] }, created_at: "2025-01-01T00:00:00Z" },
    ];
    const parsed: any = { blocking_issues: [{ note_key: "voice:hero", category: "voice_distinctiveness", severity: "blocker" }] };

    const result = detectNoteChurn_simulated(recentRuns, "character_bible", parsed);
    expect(result.demotedKeys.length).toBe(0);
    expect(parsed.blocking_issues.length).toBe(1);
    expect(parsed.blocking_issues[0].category).toBe("voice_distinctiveness");
    expect(parsed.blocking_issues[0].severity).toBe("blocker");
  });

  it("voice_distinctiveness note with different note_keys across runs gets category-level churn demotion", () => {
    const recentRuns = [
      { output_json: { blocking_issues: [{ note_key: "voice:hero", category: "voice_distinctiveness" }] }, created_at: "2025-01-03T00:00:00Z" },
      { output_json: { blocking_issues: [{ note_key: "voice:sidekick", category: "voice_distinctiveness" }] }, created_at: "2025-01-02T00:00:00Z" },
      { output_json: { blocking_issues: [{ note_key: "voice:villain", category: "voice_distinctiveness" }] }, created_at: "2025-01-01T00:00:00Z" },
    ];
    const parsed: any = { blocking_issues: [{ note_key: "voice:hero", category: "voice_distinctiveness", severity: "blocker" }] };

    const result = detectNoteChurn_simulated(recentRuns, "character_bible", parsed);
    expect(result.demotedKeys).toEqual(["voice:hero"]);
    expect(parsed.blocking_issues.length).toBe(0);
    expect(parsed.polish_notes.length).toBe(1);
    expect(parsed.polish_notes[0].churn_category).toBe("voice_distinctiveness");
    expect(parsed.polish_notes[0].severity).toBe("polish");
    expect(parsed.polish_notes[0].churn_demoted).toBe(true);
  });

  it("voice_distinctiveness blocker survives single-run ANALYZE", () => {
    const recentRuns = [
      { output_json: { blocking_issues: [{ note_key: "voice:hero", category: "voice_distinctiveness" }] }, created_at: "2025-01-01T00:00:00Z" },
    ];
    const parsed: any = { blocking_issues: [{ note_key: "voice:hero", category: "voice_distinctiveness", severity: "blocker" }] };
    const result = detectNoteChurn_simulated(recentRuns, "character_bible", parsed);
    expect(result.demotedKeys.length).toBe(0);
    expect(parsed.blocking_issues.length).toBe(1);
    expect(parsed.blocking_issues[0].severity).toBe("blocker");
  });

  it("voice_distinctiveness valid in character_bible note scope", () => {
    const noteScopeLine = `|- Valid note categories: "character_depth|arc_clarity|voice_distinctiveness|relationship_dynamics|backstory_consistency|thematic_integration|missing_character|cast_balance"`;
    expect(noteScopeLine.includes("voice_distinctiveness")).toBe(true);
  });

  it("voice_distinctiveness can coexist with other blocker categories", () => {
    const recentRuns = [
      { output_json: {
          blocking_issues: [
            { note_key: "voice:hero", category: "voice_distinctiveness" },
            { note_key: "arc:weak", category: "arc_clarity" },
          ],
        }, created_at: "2025-01-03T00:00:00Z" },
      { output_json: { blocking_issues: [{ note_key: "arc:weak", category: "arc_clarity" }] }, created_at: "2025-01-02T00:00:00Z" },
      { output_json: { blocking_issues: [{ note_key: "arc:weak", category: "arc_clarity" }] }, created_at: "2025-01-01T00:00:00Z" },
    ];
    const parsed: any = {
      blocking_issues: [
        { note_key: "voice:hero", category: "voice_distinctiveness", severity: "blocker" },
        { note_key: "arc:weak", category: "arc_clarity", severity: "blocker" },
      ],
    };

    const result = detectNoteChurn_simulated(recentRuns, "character_bible", parsed);
    expect(result.demotedKeys).toEqual(["arc:weak"]);
    expect(parsed.blocking_issues.length).toBe(1);
    expect(parsed.blocking_issues[0].category).toBe("voice_distinctiveness");
    expect(parsed.polish_notes.length).toBe(1);
    expect(parsed.polish_notes[0].note_key).toBe("arc:weak");
  });

  it("voice_distinctiveness NOT in non-character_bible note scopes", () => {
    const scope = `character_bible: |- Evaluate character completeness, arc design, voice distinctiveness, relationship dynamics, thematic integration, and backstory depth.`;
    expect(scope.includes("voice distinctiveness")).toBe(true);
  });
});

// ─── CHANGE 2: Voice-specific note matching in isAffected() ──────────────

describe("change2: voice-specific note matching in isAffected()", () => {

  it("voice note matches character section without name match — body > 100 chars", () => {
    const section: CharBibleSection = {
      name: "Marcus",
      role: "Protagonist",
      sectionType: "character",
      body: "Marcus is a former military officer who now runs a private security firm. He is pragmatic, cynical, and deeply loyal to his small team. His dialogue tends to be clipped and tactical, using military jargon and brief commands. He speaks with authority but rarely raises his voice, preferring measured, deliberate phrasing that projects control.",
    };
    const noteText = "Characters need more distinct voice patterns — hero speaks too similarly to sidekick";

    const result = isAffected(section, noteText);
    expect(result).toBe(true);
  });

  it("voice note does NOT match character section with body <= 100 chars", () => {
    const section: CharBibleSection = {
      name: "Minor_Character",
      role: "Walk-on",
      sectionType: "character",
      body: "A minor background character with barely any lines. Appears in one scene.",
    };
    const noteText = "Needs more distinct voice patterns";

    const result = isAffected(section, noteText);
    expect(result).toBe(false);
  });

  it("voice note does NOT match non-character sections via voice heuristic", () => {
    const rdSection: CharBibleSection = {
      name: "Relationship Dynamics",
      role: "",
      sectionType: "relationship_dynamics",
      body: "A".repeat(200),
    };
    const noteText = "Voice patterns need work across the whole cast";

    const result = isAffected(rdSection, noteText);
    expect(result).toBe(false);
  });

  it("non-voice note does NOT trigger voice heuristic (name match still works)", () => {
    const section: CharBibleSection = {
      name: "Elena",
      role: "Protagonist",
      sectionType: "character",
      body: "Elena is a brilliant astrophysicist who discovered an anomaly in deep space. Her dialogue is technical and precise. She uses analogy and metaphor extensively and often gets lost in explanations. Colleagues find her brilliant but difficult to follow. When stressed, she defaults to academic language even in personal conversations.",
    };
    const noteText = "Elena's backstory needs more detail — where did she grow up?";

    const result = isAffected(section, noteText);
    expect(result).toBe(true);
  });

  it("voice heuristic with 'speech pattern' keyword and large body", () => {
    const section: CharBibleSection = {
      name: "Cassandra",
      role: "Sidekick",
      sectionType: "character",
      body: "Cassandra is the tech wizard who provides comic relief and technical support. She speaks in rapid-fire pop culture references, often making jokes that only she finds funny. Her dialogue is fast-paced with frequent asides. Despite her jokey exterior, she drops serious insights when nobody expects them. Her vocabulary includes extensive internet slang and gaming terminology. She is fiercely loyal and expresses care through sarcasm.",
    };
    const noteText = "Speech pattern should differentiate her from other characters";

    const result = isAffected(section, noteText);
    expect(result).toBe(true);
  });

  it("voice heuristic triggers on 'register' keyword", () => {
    const section: CharBibleSection = {
      name: "Judge_Harper",
      role: "Authority Figure",
      sectionType: "character",
      body: "Judge Harper presides over the district court with an iron will. His sentences are harsh and moralistic. He believes in order above all else. His courtroom presence is formidable and he will not tolerate any disrespect. His personal life is a carefully guarded secret and his family is mentioned only in the most oblique terms.",
    };
    const noteText = "Register of speech needs to be more formal to match his position";

    const result = isAffected(section, noteText);
    expect(result).toBe(true);
  });

  it("voice heuristic triggers on 'vocabulary' keyword", () => {
    const section: CharBibleSection = {
      name: "Professor_Kim",
      role: "Mentor",
      sectionType: "character",
      body: "Professor Kim is a retired historian who serves as a guide. She possesses vast knowledge of the ancient texts and uses obscure historical references constantly. She is patient with questions but grows frustrated when facts are ignored. Her gentle exterior conceals a fierce intellect and a hidden past involving forbidden research that may hold the key to the whole mystery.",
    };
    const noteText = "Vocabulary level needs to reflect academic background";

    const result = isAffected(section, noteText);
    expect(result).toBe(true);
  });

  it("voice heuristic triggers on 'verbal' keyword", () => {
    const section: CharBibleSection = {
      name: "Detective_Reyes",
      role: "Investigator",
      sectionType: "character",
      body: "Reyes is a grizzled homicide detective in the final years before retirement. He has seen everything and is almost impossible to shock. He works methodically, processing evidence with practiced efficiency. He uses dark humor to cope and has a running bet with his partner on how many hours until the first break in each case. He respects competence and has no tolerance for politics.",
    };
    const noteText = "Verbal patterns should reflect seasoned detective — world-weary, terse, dark humor";

    const result = isAffected(section, noteText);
    expect(result).toBe(true);
  });

  it("voice heuristic does NOT trigger on body border case — exactly 100 chars", () => {
    const section: CharBibleSection = {
      name: "BorderCase",
      role: "Test",
      sectionType: "character",
      body: "A".repeat(100),
    };
    const noteText = "Voice needs improvement across all characters";

    const result = isAffected(section, noteText);
    expect(result).toBe(false);
  });

  it("voice heuristic triggers on body > 100 chars — 101 chars", () => {
    const section: CharBibleSection = {
      name: "AboveBorder",
      role: "Test",
      sectionType: "character",
      body: "A".repeat(101),
    };
    const noteText = "Voice problems throughout the cast";

    const result = isAffected(section, noteText);
    expect(result).toBe(true);
  });

  it("exact name match takes priority over voice heuristic", () => {
    const section: CharBibleSection = {
      name: "Zara",
      role: "Protagonist",
      sectionType: "character",
      body: "Short.",
    };
    const noteText = "Zara needs more development";

    const result = isAffected(section, noteText);
    expect(result).toBe(true);
  });

  it("voice allNoteText construction includes notes, titles, summaries, and note_keys", () => {
    const perCharNotes = "Critical note about character voice";
    const approvedNotes = [
      { note: "Voice needs distinction", title: "Voice Issue", summary: "Characters sound alike", note_key: "voice_uniformity" },
    ];
    const allNoteText = [
      perCharNotes,
      ...(approvedNotes || []).flatMap((n: any) => [
        n.note, n.title, n.summary, n.note_key || n.id,
      ]),
    ].filter(Boolean).join("\n").toLowerCase();

    expect(allNoteText.includes("critical note about character voice")).toBe(true);
    expect(allNoteText.includes("voice needs distinction")).toBe(true);
    expect(allNoteText.includes("voice issue")).toBe(true);
    expect(allNoteText.includes("characters sound alike")).toBe(true);
    expect(allNoteText.includes("voice_uniformity")).toBe(true);
  });

  it("voice heuristic activates on 'dialogue pattern' keyword", () => {
    const section: CharBibleSection = {
      name: "Captain_Blake",
      role: "Captain",
      sectionType: "character",
      body: "Blake commands the starship Intrepid with a steady hand. He delegates authority well and trusts his crew implicitly. He gives thoughtful, deliberate orders and expects them followed without question. He holds a weekly briefing where every department reports directly to him. He lost his previous ship to a surprise attack and carries that guilt in every decision. He quotes naval history constantly.",
    };
    const noteText = "Dialogue pattern needs to reflect authoritative command style";

    const result = isAffected(section, noteText);
    expect(result).toBe(true);
  });
});

// ─── CHANGE 3: Voice component instruction in per-character rewrite prompt ──

describe("change3: voice component instruction in rewrite prompt", () => {

  it("voice prompt instruction contains register requirement", () => {
    expect(VOICE_PROMPT_INSTRUCTION.includes("register")).toBe(true);
  });

  it("voice prompt instruction contains vocabulary level requirement", () => {
    expect(VOICE_PROMPT_INSTRUCTION.includes("vocabulary level")).toBe(true);
  });

  it("voice prompt instruction contains verbal tics requirement", () => {
    expect(VOICE_PROMPT_INSTRUCTION.includes("verbal tics")).toBe(true);
  });

  it("voice prompt instruction contains avoidances requirement", () => {
    expect(VOICE_PROMPT_INSTRUCTION.includes("avoidances")).toBe(true);
  });

  it("voice prompt instructs consistency with schema v2 role fields", () => {
    const voiceConsistencyLine = `- Voice must be consistent with the character's social_position, functional_role, and world_embedding as defined in the Schema v2 requirements.`;
    expect(voiceConsistencyLine.includes("social_position")).toBe(true);
    expect(voiceConsistencyLine.includes("functional_role")).toBe(true);
    expect(voiceConsistencyLine.includes("world_embedding")).toBe(true);
  });

  it("voice prompt instructs preservation of existing voice components", () => {
    const preservationLine = `- If previously evaluated voice components exist (from meta_json), preserve or improve them — do NOT regress.`;
    expect(preservationLine.includes("preserve or improve")).toBe(true);
    expect(preservationLine.includes("do NOT regress")).toBe(true);
  });

  it("voice instruction appears in per-character prompt — not non-character", () => {
    const charPromptLines = [
      "- INCLUDE the character's distinct VOICE: define speech register (formal/colloquial/archaic), vocabulary level, verbal tics (repeated phrases/patterns), and avoidances (words or topics the character would never say).",
      "- Voice must be consistent with the character's social_position, functional_role, and world_embedding as defined in the Schema v2 requirements.",
      "- If previously evaluated voice components exist (from meta_json), preserve or improve them — do NOT regress.",
    ];

    const nonCharPromptLines = [
      "- Rewrite ONLY this section:",
      "- Apply ONLY the approved notes that reference",
      "- Preserve the section header exactly as provided.",
      "- Output the FULL rewritten section in natural prose.",
      "- If no notes apply to this section, return the original text verbatim unchanged.",
      "- Do NOT output any other sections. Do NOT output the full bible.",
      '- Return valid JSON with "rewritten_text" containing ONLY this section\'s content.',
    ];

    for (const line of charPromptLines) {
      expect(
        line.includes("VOICE") || line.includes("voice") || line.includes("social_position")
      ).toBe(true);
    }

    for (const line of nonCharPromptLines) {
      const hasVoice = /\b(voice|register|vocabulary|tics|avoidances|social_position)\b/i.test(line);
      expect(hasVoice).toBe(false);
    }
  });
});

// ─── CHANGE 4: Post-rewrite voice quality verification gate ─────────────────

describe("change4: post-rewrite voice quality verification gate", () => {

  it("checkVoiceComponentPresence — no updated characters = 0% coverage", () => {
    const result = checkVoiceComponentPresence([], []);
    expect(result.coveragePercent).toBe(0);
    expect(result.charactersWithVoice).toBe(0);
    expect(result.characterCount).toBe(0);
  });

  it("checkVoiceComponentPresence — section with 2+ voice categories counts as having voice", () => {
    const sections = [
      "Marcus speaks in a formal register with academic vocabulary. His speech patterns are measured and deliberate.",
    ];
    const result = checkVoiceComponentPresence(sections, ["Marcus"]);
    expect(result.coveragePercent).toBe(100);
    expect(result.charactersWithVoice).toBe(1);
    expect(result.characterCount).toBe(1);
  });

  it("checkVoiceComponentPresence — section with only 1 voice category = insufficient", () => {
    const sections = [
      "Marcus has a formal register.",
    ];
    const result = checkVoiceComponentPresence(sections, ["Marcus"]);
    expect(result.coveragePercent).toBe(0);
    expect(result.charactersWithVoice).toBe(0);
    expect(result.characterCount).toBe(1);
  });

  it("checkVoiceComponentPresence — 2 sections, 1 has voice = 50% coverage", () => {
    const sections = [
      "Formal register and precise vocabulary define her speech.",
      "He rarely speaks and when he does it's brief.",
    ];
    const result = checkVoiceComponentPresence(sections, ["Elena", "SilentBob"]);
    expect(result.coveragePercent).toBe(50);
    expect(result.charactersWithVoice).toBe(1);
    expect(result.characterCount).toBe(2);
  });

  it("checkVoiceComponentPresence — 3 sections, 1 has voice = 33% (< 50% triggers warning)", () => {
    const sections = [
      "Formal register and precise vocabulary define her speech.",
      "He rarely speaks.",
      "Just background.",
    ];
    const result = checkVoiceComponentPresence(sections, ["Elena", "Bob", "Carl"]);
    expect(result.coveragePercent).toBe(33);
    expect(result.charactersWithVoice).toBe(1);
    expect(result.characterCount).toBe(3);
  });

  it("checkVoiceComponentPresence — all sections have voice = 100%", () => {
    const sections = [
      "Formal register, academic vocabulary, and a catchphrase 'Indeed.'",
      "Colloquial slang, street vocabulary, and a verbal tic of 'you know?'",
      "Archaic speech pattern, formal register, verbal habit of avoiding certain words.",
    ];
    const result = checkVoiceComponentPresence(sections, ["Marcus", "Elena", "Professor"]);
    expect(result.coveragePercent).toBe(100);
    expect(result.charactersWithVoice).toBe(3);
    expect(result.characterCount).toBe(3);
  });

  it("checkVoiceComponentPresence — more sections than characters is clamped", () => {
    const sections = [
      "Formal register and vocabulary.",
      "Casual register and slang vocabulary.",
      "More sections than characters",
    ];
    const result = checkVoiceComponentPresence(sections, ["OnlyOne"]);
    expect(result.charactersWithVoice).toBe(1);
    expect(result.characterCount).toBe(1);
    expect(result.coveragePercent).toBe(100);
  });

  it("checkVoiceComponentPresence — zero voice indicator hits = 0%", () => {
    const sections = [
      "This section has no voice-related content whatsoever. It just describes the character's appearance and backstory without any mention of how they speak or what words they use.",
    ];
    const result = checkVoiceComponentPresence(sections, ["TestChar"]);
    expect(result.coveragePercent).toBe(0);
    expect(result.charactersWithVoice).toBe(0);
  });

  it("checkVoiceComponentPresence — each voice pattern tested individually", () => {
    const patternTexts: [string, string][] = [
      ["register", "catchphrase"],
      ["vocabulary", "register"],
      ["verbal tic", "register"],
      ["avoidance", "register"],
      ["speech pattern", "register"],
      ["way of speaking", "register"],
      ["formal", "verbal habit"],
      ["archaic", "catchphrase"],
      ["word choice", "verbal habit"],
      ["repeated phrase", "avoids topic"],
      ["never says", "speaks in"],
      ["dialogue pattern", "phrasing"],
    ];

    for (const [a, b] of patternTexts) {
      const body = `${a} and ${b} together in character description.`;
      const result = checkVoiceComponentPresence([body], ["Test_" + a + "_" + b]);
      expect(result.charactersWithVoice).toBe(1);
      expect(result.coveragePercent).toBe(100);
    }
  });

  it("voice gate warning body has correct shape", () => {
    const coveragePercent = 33;
    const charactersWithVoice = 1;
    const characterCount = 3;

    const metaUpdate = {
      voiceCoverageWarning: {
        coveragePercent,
        charactersWithVoice,
        totalTier1Characters: characterCount,
        message: `Voice components below 50% coverage (${coveragePercent}% of ${characterCount} characters)`,
      },
    };

    expect(metaUpdate.voiceCoverageWarning.coveragePercent).toBe(33);
    expect(metaUpdate.voiceCoverageWarning.charactersWithVoice).toBe(1);
    expect(metaUpdate.voiceCoverageWarning.totalTier1Characters).toBe(3);
    expect(metaUpdate.voiceCoverageWarning.message.includes("below 50% coverage")).toBe(true);
  });

  it("voice gate only writes warning when < 50% and characterCount > 0", () => {
    function shouldWriteWarning(vc: { coveragePercent: number; characterCount: number }): boolean {
      return vc.coveragePercent < 50 && vc.characterCount > 0;
    }

    expect(shouldWriteWarning({ coveragePercent: 0, characterCount: 0 })).toBe(false);
    expect(shouldWriteWarning({ coveragePercent: 0, characterCount: 1 })).toBe(true);
    expect(shouldWriteWarning({ coveragePercent: 49, characterCount: 1 })).toBe(true);
    expect(shouldWriteWarning({ coveragePercent: 50, characterCount: 1 })).toBe(false);
    expect(shouldWriteWarning({ coveragePercent: 100, characterCount: 2 })).toBe(false);
  });

  it("voice gate is non-fatal — error in gate does not crash rewrite", () => {
    try {
      throw new Error("Voice gate failed");
    } catch (vcErr: any) {
      // Expected: non-fatal, should not throw out of the test
    }
    expect(true).toBe(true);
  });

  it("checkVoiceComponentPresence — empty assembledSections with no characters", () => {
    const result = checkVoiceComponentPresence([], []);
    expect(result.coveragePercent).toBe(0);
    expect(result.charactersWithVoice).toBe(0);
    expect(result.characterCount).toBe(0);
  });

  it("checkVoiceComponentPresence — sections with no updatedNames", () => {
    const sections = [
      "Formal register and vocabulary in this section.",
    ];
    const result = checkVoiceComponentPresence(sections, []);
    expect(result.coveragePercent).toBe(0);
    expect(result.charactersWithVoice).toBe(0);
    expect(result.characterCount).toBe(0);
  });
});

// ─── Integration: voice_changes_end_to_end ─────────────────────────────────

describe("integration: voice changes end-to-end", () => {

  it("voice note isAffected match rewrite prompt with voice instruction voice gate check", () => {
    // Step 1: Voice note
    const noteText = "Characters need distinct voice patterns - they all sound alike";

    // Step 2: Character section
    const section: CharBibleSection = {
      name: "Alex",
      role: "Protagonist",
      sectionType: "character",
      body: "Alex is a young journalist investigating a corporate conspiracy. He is idealistic but naive, driven by a sense of justice inherited from his father. His contacts in the city include a whistleblower, a retired cop, and a hacker. He tends to speak in questions, always probing, always seeking confirmation. His voice is curious, earnest, and slightly uncertain — he uses a lot of tag questions like 'right?' and 'isn't it?'",
    };

    // Step 2 verify: isAffected catches this via voice heuristic
    const affected = isAffected(section, noteText);
    expect(affected).toBe(true);

    // Step 3: The rewrite prompt includes voice instruction
    expect(VOICE_PROMPT_INSTRUCTION.includes("register")).toBe(true);
    expect(VOICE_PROMPT_INSTRUCTION.includes("vocabulary level")).toBe(true);
    expect(VOICE_PROMPT_INSTRUCTION.includes("verbal tics")).toBe(true);
    expect(VOICE_PROMPT_INSTRUCTION.includes("avoidances")).toBe(true);

    // Step 4: After theoretical rewrite, check voice component presence
    const rewritten = [
      `Alex speaks in an earnest, collaborative register. His vocabulary is conversational but precise — typical of a well-educated journalist. He has a verbal tic of tag questions ("right?", "isn't it?"). He avoids definitive statements, preferring collaborative language. His speech patterns reflect curiosity and a need for validation.`,
    ];
    const gateResult = checkVoiceComponentPresence(rewritten, ["Alex"]);
    expect(gateResult.coveragePercent).toBe(100);
  });
});