/**
 * Tests for generate-visual-dna-from-canon — structured identity builder,
 * signature merging, backfill from legacy format, and nested helper functions.
 *
 * Covers:
 *   1. buildStructuredIdentityFromTraits — age_range extraction
 *   2. buildStructuredIdentityFromTraits — biological_sex/gender_presentation
 *   3. buildStructuredIdentityFromTraits — ethnicity, body_type, height_class
 *   4. buildStructuredIdentityFromTraits — facial_archetype, voice_quality
 *   5. buildStructuredIdentityFromTraits — wardrobe_signals, social_class, role
 *   6. buildStructuredIdentityFromTraits — generic label rejection
 *   7. buildStructuredIdentityFromTraits — confidence tracking
 *   8. buildStructuredIdentityFromTraits — non-human entity awareness
 *   9. buildStructuredIdentityFromTraits — empty traits returns {}
 *  10. buildStructuredIdentityFromTraits — evidence and inference type tracking
 *  11. normalizeValue helper — category suffix stripping
 *  12. normalizeValue helper — appearance/look stripping
 *  13. normalizeAgeRange — decade parsing and age band mapping
 *  14. normalizeAgeRange — known age bands
 *  15. normalizeBiologicalSex — strict male/female acceptance
 *  16. isGenericLabel — known generic label rejection
 *  17. isNonHumanEntity — mythic/divine markers
 *  18. mergeIdentitySignatures — top-level field merge
 *  19. mergeIdentitySignatures — signature sub-object merge
 *  20. mergeIdentitySignatures — binding_markers append (no dupes)
 *  21. mergeIdentitySignatures — evidence_traits append (no dupes)
 *  22. backfillIdentityFromSignature — Format D: signature sub-object
 *  23. backfillIdentityFromSignature — Legacy flat format
 *  24. backfillIdentityFromSignature — NEVER overwrites existing
 *  25. extractIdentitySignature — prefers identity_signature column
 *  26. extractIdentitySignature — constructs from structured fields fallback
 *  27. extractIdentitySignature — null/empty returns null
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

/** Trait as emitted by extract-visual-dna */
interface Trait {
  label: string;
  category: string;
  confidence: string;
  evidence_source?: string;
  source?: string;
  value?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Constants (mirrored from index.ts)
// ══════════════════════════════════════════════════════════════════════════════

const GENERIC_LABELS = new Set([
  "age", "ages", "eyes", "appearance", "appearances",
  "build", "body", "face", "facial", "skin", "hair",
  "height", "voice", "ethnicity", "social class", "role",
  "look", "looks", "feature", "features", "type", "style",
]);

const sexLabels = ["male", "female"];
const genderLabels = ["male", "female", "non-binary", "masculine", "feminine", "androgynous"];

const CATEGORY_SUFFIXES = [
  /^(.*?)\s+(age|ages|gender|build|body|figure|appearance|look|looks|type|description|feature|features)\s*$/i,
  /^(.*?)\s+(years old|year old|years of age)\s*$/i,
  /^appears?\s+(?:to\s+be\s+)?(?:in\s+)?(?:their\s+)?(.+)$/i,
  /^(?:a\s+|an\s+)?(.+)$/i,
];

const NON_HUMAN_MARKERS = [
  /\b(?:ten|forty|fifty|hundred|thousand)\s+(?:feet?|meters?)\s+tall\b/i,
  /\b(?:divine|alien|mythical|mythic|supernatural|demonic|angelic|celestial|regal|otherworldly)\b/i,
  /\b(?:ram[\-\s]like|horn|claw|tentacle|wing|hoof|tail|fang)\b/i,
  /\b(?:colossal|gigantic|massive|monstrous|giant)\s+(?:form|figure|being|creature|size|stature)\b/i,
  /\bnon[- ]?human\b/i,
  /\b(?:polished\s+)?(?:obsidian|stone-like|metallic|crystalline)\s+skin\b/i,
  /\bglowing\s+(?:eyes?|aura|presence)\b/i,
];

// ══════════════════════════════════════════════════════════════════════════════
// Functions under test (mirrored from index.ts)
// ══════════════════════════════════════════════════════════════════════════════

function isGenericLabel(value: string): boolean {
  const clean = value.toLowerCase().replace(/[^a-z\s-]/g, "").trim();
  if (GENERIC_LABELS.has(clean)) return true;
  if (!clean.includes(" ") && GENERIC_LABELS.has(clean)) return true;
  return false;
}

function normalizeValue(raw: string, category: string): string {
  if (!raw) return "";
  let value = raw.trim();
  if (!value) return "";

  if (isGenericLabel(value)) return "";

  value = value.replace(/^appears?\s+(?:to\s+be\s+)?(?:in\s+)?(?:their\s+)?/i, "").trim();
  value = value.replace(/^(?:a\s+|an\s+)/i, "").trim();

  for (const pattern of CATEGORY_SUFFIXES) {
    const match = value.match(pattern);
    if (match && match[1] && match[1].trim()) {
      const stripped = match[1].trim();
      const suffix = (match[2] || "").toLowerCase();
      const descriptorSuffixes = new Set(["appearance", "look", "looks", "type", "description", "feature", "features"]);
      if (!suffix || suffix === category.toLowerCase() || descriptorSuffixes.has(suffix)) {
        value = stripped;
        break;
      }
    }
  }

  value = value.replace(/\s+/g, " ").trim();
  if (isGenericLabel(value)) return "";
  return value;
}

function normalizeAgeRange(raw: string): string {
  if (!raw) return "";

  const appearsMatch = raw.match(/appears?\s+(?:to\s+be\s+)?(?:in\s+)?(?:their\s+)?(\d+)s?/i);
  if (appearsMatch) return appearsMatch[1] + "s";

  const knownAgeBands = new Set([
    "child", "teen", "teenager", "young adult", "adult",
    "middle-aged", "middle aged", "elderly", "senior",
    "ancient", "ageless",
  ]);
  const clean = raw.toLowerCase().replace(/[^a-z\s-]/g, "").trim();
  if (knownAgeBands.has(clean)) return clean;

  const yearsOldMatch = raw.match(/(\d+)\s*(?:years?\s*)?old/i);
  if (yearsOldMatch) {
    const age = parseInt(yearsOldMatch[1], 10);
    if (age >= 0 && age <= 12) return "child";
    if (age >= 13 && age <= 19) return "teen";
    if (age >= 20 && age <= 29) return "20s";
    if (age >= 30 && age <= 39) return "30s";
    if (age >= 40 && age <= 49) return "40s";
    if (age >= 50 && age <= 59) return "50s";
    if (age >= 60) return "60s+";
  }

  const rangeMatch = raw.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1], 10);
    const high = parseInt(rangeMatch[2], 10);
    return `${low}-${high}`;
  }

  const decadeMatch = raw.match(/(\d+)s/);
  if (decadeMatch) return decadeMatch[1] + "s";

  return raw;
}

function classifyInferenceType(category: string, rawLabel: string, traitConfidence: string): string {
  if (traitConfidence === "high" && rawLabel.length > 3) return "explicit_canon";
  if (traitConfidence === "high") return "strongly_implied";
  if (traitConfidence === "medium") return "inferred_style";
  return "unknown";
}

function normalizeBiologicalSex(raw: string): string | undefined {
  if (!raw) return undefined;
  const clean = raw.toLowerCase().replace(/[^a-z]/g, "").trim();
  if (clean === "male" || clean === "female") return clean;
  if (clean === "malegender" || clean === "malegendered") return "male";
  if (clean === "femalegender" || clean === "femalegendered") return "female";
  return undefined;
}

function isNonHumanEntity(traits: Trait[]): boolean {
  if (!traits) return false;
  let nonHumanScore = 0;
  for (const t of traits) {
    const combined = `${t.label || ""} ${t.value || ""} ${t.category || ""}`;
    for (const pattern of NON_HUMAN_MARKERS) {
      if (pattern.test(combined)) {
        nonHumanScore++;
        break;
      }
    }
  }
  return nonHumanScore >= 2;
}

function buildStructuredIdentityFromTraits(traits: Trait[], strength: string): Record<string, any> {
  if (!traits || traits.length === 0) return {};

  const result: Record<string, any> = {};

  let biologicalSex: string | undefined;
  let genderPresentation: string | undefined;
  let ageRange: string | undefined;
  let ethnicity: string[] | undefined;
  let bodyType: string | undefined;
  let heightClass: string | undefined;
  let facialArchetype: string | undefined;
  let voiceQuality: string | undefined;
  let wardrobeSignals: Record<string, any> = {};
  let socialClass: string | undefined;
  let roleArchetype: string | undefined;

  const confidence: Record<string, string> = {};
  const evidence: Record<string, string[]> = {};
  const inferenceTypes: Record<string, string> = {};

  const updateField = (fieldName: string, fieldValue: string | string[]) => {
    if (!fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)) return;
    const confScore = traitConfidence === "high" ? 3 : traitConfidence === "medium" ? 2 : 1;
    const existingScore = (confidence[fieldName] === "high" ? 3 : confidence[fieldName] === "medium" ? 2 : 0);
    if (confScore >= existingScore) {
      confidence[fieldName] = traitConfidence;
      evidence[fieldName] = [...(evidence[fieldName] || []), evidenceSource];
      inferenceTypes[fieldName] = classifyInferenceType(category, label, traitConfidence);
    }
  };

  const entityIsNonHuman = isNonHumanEntity(traits);

  let traitConfidence = "low";
  let evidenceSource = "";
  let category = "";
  let label = "";
  let rawLabel = "";
  let value = "";

  for (const loopTrait of traits) {
    category = (loopTrait.category || "").toLowerCase().trim();
    rawLabel = (loopTrait.label || "").trim();
    label = rawLabel.toLowerCase().trim();
    value = (loopTrait.value || loopTrait.label || "").trim();
    traitConfidence = (loopTrait.confidence || "low").toLowerCase().trim();
    evidenceSource = loopTrait.evidence_source || loopTrait.source || "extract-visual-dna";

    if (isGenericLabel(label)) continue;

    const normalized = normalizeValue(value, category);
    if (!normalized) continue;

    switch (category) {
      case "gender": {
        if (entityIsNonHuman) break;

        const cleanLabel = label.replace(/[^a-z\s-]/g, "").trim();
        const matchedSex = normalizeBiologicalSex(cleanLabel);

        if (matchedSex && !biologicalSex) {
          biologicalSex = matchedSex;
          updateField("biological_sex", biologicalSex);
        }

        const matchedGender = genderLabels.find(g => cleanLabel.includes(g));
        if (matchedGender && !genderPresentation) {
          genderPresentation = matchedGender;
          updateField("gender_presentation", genderPresentation);

          if (!biologicalSex && (matchedGender === "male" || matchedGender === "female")) {
            biologicalSex = matchedGender;
            updateField("biological_sex", biologicalSex);
          }
        }
        break;
      }

      case "age": {
        if (ageRange) break;
        const normalizedAge = normalizeAgeRange(normalized);
        if (normalizedAge && !isGenericLabel(normalizedAge)) {
          ageRange = normalizedAge;
          updateField("age_range", ageRange);
        }
        break;
      }

      case "build": {
        if (!bodyType) {
          bodyType = normalized.slice(0, 80);
          updateField("body_type", bodyType);
        }
        break;
      }

      case "height": {
        if (!heightClass) {
          heightClass = normalized.slice(0, 60);
          updateField("height_class", heightClass);
        }
        break;
      }

      case "face": {
        if (!facialArchetype) {
          facialArchetype = normalized.slice(0, 100);
          updateField("facial_archetype", facialArchetype);
        }
        break;
      }

      case "voice": {
        if (!voiceQuality) {
          voiceQuality = normalized.slice(0, 60);
          updateField("voice_quality", voiceQuality);
        }
        break;
      }

      case "clothing": {
        const cleanKey = rawLabel.replace(/[^a-zA-Z0-9\s_-]/g, "").trim();
        if (cleanKey && !wardrobeSignals[cleanKey]) {
          wardrobeSignals[cleanKey] = {
            value: normalized,
            source: evidenceSource,
            confidence: traitConfidence,
          };
        }
        break;
      }

      case "ethnicity": {
        const cleanEth = normalized.replace(/[^a-zA-Z\s\/-]/g, "").trim();
        if (cleanEth && cleanEth.length > 2 && !isGenericLabel(cleanEth)) {
          if (!ethnicity?.includes(cleanEth)) {
            ethnicity = [...(ethnicity || []), cleanEth];
            updateField("ethnicity", cleanEth);
          }
        }
        break;
      }

      case "social_class": {
        if (!socialClass && !isGenericLabel(normalized)) {
          socialClass = normalized.slice(0, 60);
          updateField("social_class", socialClass);
        }
        break;
      }

      case "role": {
        if (!roleArchetype && !isGenericLabel(normalized)) {
          roleArchetype = normalized.slice(0, 60);
          updateField("role_archetype", roleArchetype);
        }
        break;
      }

      default:
        // skin, hair, posture, marker, other — stay in JSON only
        break;
    }
  }

  if (biologicalSex) result.biological_sex = biologicalSex;
  if (genderPresentation) result.gender_presentation = genderPresentation;
  if (ageRange) result.age_range = ageRange;
  if (ethnicity && ethnicity.length > 0) result.ethnicity = ethnicity;
  if (bodyType) result.body_type = bodyType;
  if (heightClass) result.height_class = heightClass;
  if (facialArchetype) result.facial_archetype = facialArchetype;
  if (voiceQuality) result.voice_quality = voiceQuality;
  if (Object.keys(wardrobeSignals).length > 0) result.wardrobe_signals = wardrobeSignals;
  if (socialClass) result.social_class = socialClass;
  if (roleArchetype) result.role_archetype = roleArchetype;

  result.identity_evidence = {};
  for (const [field, sources] of Object.entries(evidence)) {
    result.identity_evidence[field] = [...new Set(sources)].join("; ");
  }
  result.identity_confidence = { ...confidence };
  result.identity_inference_type = {};
  for (const field of Object.keys(confidence)) {
    if (!result.identity_inference_type[field]) {
      result.identity_inference_type[field] = inferenceTypes[field] || "ai_extraction";
    }
  }

  return result;
}

function mergeIdentitySignatures(
  existing: Record<string, any>,
  incoming: Record<string, any>,
): Record<string, any> {
  const result = { ...existing };

  for (const [key, value] of Object.entries(incoming)) {
    if (!value) continue;
    if (key === "signature" && typeof value === "object") {
      result.signature = { ...(result.signature || {}), ...value };
    } else if (key === "binding_markers" && Array.isArray(value)) {
      const existingMarkers = result.binding_markers || [];
      const existingLabels = new Set(existingMarkers.map((m: any) => m.label));
      const novel = value.filter((m: any) => !existingLabels.has(m.label));
      result.binding_markers = [...existingMarkers, ...novel];
    } else if (key === "evidence_traits" && Array.isArray(value)) {
      const existingTraits = result.evidence_traits || [];
      const existingLabels = new Set(existingTraits.map((t: any) => t.label));
      const novel = value.filter((t: any) => !existingLabels.has(t.label));
      result.evidence_traits = [...existingTraits, ...novel];
    } else if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      result[key] = { ...(result[key] || {}), ...value };
    } else {
      result[key] = value;
    }
  }

  return result;
}

function backfillIdentityFromSignature(
  identitySignature: any,
  existingStructured: Record<string, any>,
): Record<string, any> {
  if (!identitySignature) return {};

  const result: Record<string, any> = {};
  const sig = identitySignature;

  const needsFill = (field: string) =>
    existingStructured[field] === null || existingStructured[field] === undefined;

  const inner = sig.signature || sig;

  // Age
  if (needsFill("age_range") && !result.age_range) {
    if (typeof inner.age === "string" && inner.age.length > 2) result.age_range = inner.age;
    else if (typeof inner.age === "object" && inner.age) {
      const ageVal = inner.age.value || inner.age.label || "";
      if (ageVal.length > 2) result.age_range = ageVal;
    } else if (sig.age && typeof sig.age === "string") result.age_range = sig.age;
  }

  // Gender/sex
  if (needsFill("biological_sex") && !result.biological_sex) {
    const genderRaw = inner.gender || sig.gender || "";
    const genderVal = typeof genderRaw === "string" ? genderRaw.toLowerCase() :
      typeof genderRaw === "object" ? (genderRaw.value || genderRaw.label || "") : "";
    const clean = genderVal.replace(/[^a-z]/g, "").trim();
    if (clean === "male" || clean === "female") result.biological_sex = clean;
  }

  // Ethnicity
  if (needsFill("ethnicity") && !result.ethnicity) {
    const ethRaw = inner.ethnicity || sig.ethnicity || "";
    if (Array.isArray(ethRaw) && ethRaw.length > 0) {
      result.ethnicity = ethRaw.filter((e: any) => typeof e === "string" && e.length > 1);
    } else if (typeof ethRaw === "string" && ethRaw.length > 2) {
      result.ethnicity = [ethRaw];
    }
  }

  // Height
  if (needsFill("height_class") && !result.height_class) {
    const bodyHeight = inner.body?.height || inner.body?.height_estimate || sig.height || "";
    const bodyHeightVal = typeof bodyHeight === "string" ? bodyHeight :
      typeof bodyHeight === "object" ? (bodyHeight.value || bodyHeight.label || "") : "";
    if (bodyHeightVal && bodyHeightVal.length > 2) result.height_class = bodyHeightVal;
  }

  // Body type
  if (needsFill("body_type") && !result.body_type) {
    const bodyVal = inner.body?.build || inner.body?.type ||
      inner.build || sig.build || "";
    const bodyStr = typeof bodyVal === "string" ? bodyVal :
      typeof bodyVal === "object" ? (bodyVal.value || bodyVal.label || "") : "";
    if (bodyStr && bodyStr.length > 2) result.body_type = bodyStr;
  }

  // Voice
  if (needsFill("voice_quality") && !result.voice_quality) {
    const voiceRaw = inner.voice || sig.voice || "";
    const voiceVal = typeof voiceRaw === "string" ? voiceRaw :
      typeof voiceRaw === "object" ? (voiceRaw.value || voiceRaw.label || "") : "";
    if (voiceVal && voiceVal.length > 2) result.voice_quality = voiceVal;
  }

  // Social class
  if (needsFill("social_class") && !result.social_class) {
    const classRaw = inner.social_class || sig.social_class || "";
    const classVal = typeof classRaw === "string" ? classRaw :
      typeof classRaw === "object" ? (classRaw.value || classRaw.label || "") : "";
    if (classVal && classVal.length > 2) result.social_class = classVal;
  }

  // Role archetype
  if (needsFill("role_archetype") && !result.role_archetype) {
    const roleRaw = inner.role || sig.role || "";
    const roleVal = typeof roleRaw === "string" ? roleRaw :
      typeof roleRaw === "object" ? (roleRaw.value || roleRaw.label || "") : "";
    if (roleVal && roleVal.length > 2) result.role_archetype = roleVal;
  }

  // Face archetype
  if (needsFill("facial_archetype") && !result.facial_archetype) {
    const faceRaw = inner.face || sig.face || "";
    const faceObj = typeof faceRaw === "object" ? faceRaw : null;
    if (faceObj) {
      const faceParts = [
        faceObj.shape || faceObj.type || faceObj.archetype || "",
        faceObj.eyes || "",
        faceObj.nose || "",
        faceObj.jaw || "",
      ].filter(Boolean);
      if (faceParts.length > 0) {
        result.facial_archetype = faceParts.join(", ").slice(0, 100);
      }
    } else if (typeof faceRaw === "string" && faceRaw.length > 2) {
      result.facial_archetype = faceRaw;
    }
  }

  return result;
}

function extractIdentitySignature(row: any): any {
  if (!row) return null;
  if (row.identity_signature) return row.identity_signature;
  const sig: any = {};
  if (row.age_range) sig.age = row.age_range;
  if (row.biological_sex) sig.gender = row.biological_sex;
  if (row.body_type) sig.build = row.body_type;
  if (row.ethnicity) sig.ethnicity = row.ethnicity;
  if (row.height_class) sig.height = row.height_class;
  if (Object.keys(sig).length === 0) return null;
  return { signature: sig };
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

function makeTrait(label: string, category: string, confidence: string = "high",
  evidence_source?: string): Trait {
  return { label, category, confidence, evidence_source };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. buildStructuredIdentityFromTraits — age_range
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: extracts age_range from age category trait", () => {
  const traits = [makeTrait("40s weathered", "age", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.age_range, "40s");
});

Deno.test("buildIdentity: first age trait wins (first-write-wins)", () => {
  const traits = [
    makeTrait("30s youthful", "age", "high"),
    makeTrait("40s weathered", "age", "high"),
  ];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.age_range, "30s", "first high-confidence age wins");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. buildStructuredIdentityFromTraits — gender
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: extracts biological_sex from male/female gender trait", () => {
  const traits = [makeTrait("male", "gender", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.biological_sex, "male");
});

Deno.test("buildIdentity: extracts gender_presentation alongside biological_sex", () => {
  const traits = [makeTrait("masculine", "gender", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.gender_presentation, "masculine");
  // masculine doesn't match male exactly after cleanup, so no biological_sex
});

Deno.test("buildIdentity: gender presentation infers biological_sex when matching", () => {
  const traits = [makeTrait("female gender", "gender", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.biological_sex, "female");
  assertEquals(result.gender_presentation, "female");
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. buildStructuredIdentityFromTraits — ethnicity, body_type, height_class
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: extracts ethnicity array", () => {
  const traits = [makeTrait("Caucasian", "ethnicity", "medium")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.ethnicity, ["Caucasian"]);
});

Deno.test("buildIdentity: extracts body_type from build category", () => {
  const traits = [makeTrait("athletic build", "build", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.body_type, "athletic");
});

Deno.test("buildIdentity: extracts height_class from height category", () => {
  const traits = [makeTrait("tall 6ft 2in", "height", "medium")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.height_class, "tall 6ft 2in");
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. buildStructuredIdentityFromTraits — face, voice
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: extracts facial_archetype from face category", () => {
  const traits = [makeTrait("angular jaw, sharp features", "face", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.facial_archetype, "angular jaw, sharp features");
});

Deno.test("buildIdentity: extracts voice_quality from voice category", () => {
  const traits = [makeTrait("deep baritone", "voice", "medium")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.voice_quality, "deep baritone");
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. buildStructuredIdentityFromTraits — wardrobe, social_class, role
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: extracts wardrobe_signals from clothing category", () => {
  const traits = [makeTrait("black leather jacket", "clothing", "medium")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assert(result.wardrobe_signals, "wardrobe_signals present");
  assertEquals(result.wardrobe_signals["black leather jacket"].value, "black leather jacket");
});

Deno.test("buildIdentity: extracts social_class", () => {
  const traits = [makeTrait("upper class", "social_class", "medium")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.social_class, "upper class");
});

Deno.test("buildIdentity: extracts role_archetype", () => {
  const traits = [makeTrait("wise mentor", "role", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.role_archetype, "wise mentor");
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. buildStructuredIdentityFromTraits — generic label rejection
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: generic label 'age' is rejected", () => {
  const traits = [makeTrait("age", "age", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.age_range, undefined, "generic 'age' label should be rejected");
});

Deno.test("buildIdentity: generic label 'eyes' is rejected", () => {
  const traits = [makeTrait("eyes", "face", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.facial_archetype, undefined);
});

Deno.test("buildIdentity: specific 'hazel eyes' is accepted", () => {
  const traits = [makeTrait("hazel eyes", "face", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.facial_archetype, "hazel eyes");
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. buildStructuredIdentityFromTraits — confidence tracking
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: tracks identity_confidence per field", () => {
  const traits = [makeTrait("40s weathered", "age", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.identity_confidence?.age_range, "high");
});

Deno.test("buildIdentity: tracks identity_inference_type per field", () => {
  const traits = [makeTrait("40s weathered", "age", "high")];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.identity_inference_type?.age_range, "explicit_canon");
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. buildStructuredIdentityFromTraits — non-human entity awareness
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: non-human entity with 2+ markers skips gender", () => {
  const traits = [
    makeTrait("divine being", "other", "high"),
    makeTrait("glowing eyes", "face", "high"),
    makeTrait("male", "gender", "high"),
  ];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.biological_sex, undefined, "non-human skips biological_sex");
});

Deno.test("buildIdentity: non-human entity with < 2 markers still processes gender", () => {
  const traits = [
    makeTrait("glowing eyes", "face", "high"),
    makeTrait("male", "gender", "high"),
  ];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.biological_sex, "male", "single marker doesn't trigger non-human skip");
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. buildStructuredIdentityFromTraits — empty traits
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: empty traits returns {}", () => {
  const result = buildStructuredIdentityFromTraits([], "strong");
  assertEquals(result, {}, "empty traits should return empty object");
});

Deno.test("buildIdentity: null traits returns {}", () => {
  const result = buildStructuredIdentityFromTraits(null as any, "strong");
  assertEquals(result, {});
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. buildStructuredIdentityFromTraits — evidence tracking
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildIdentity: tracks identity_evidence with deduplicated source strings", () => {
  const traits = [
    makeTrait("40s weathered", "age", "high", "canon:character"),
  ];
  const result = buildStructuredIdentityFromTraits(traits, "strong");
  assertEquals(result.identity_evidence?.age_range, "canon:character");
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. normalizeValue — category suffix stripping
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("normalizeValue: strips 'age' suffix from '40s age'", () => {
  assertEquals(normalizeValue("40s age", "age"), "40s");
});

Deno.test("normalizeValue: strips 'gender' suffix from 'male gender'", () => {
  assertEquals(normalizeValue("male gender", "gender"), "male");
});

Deno.test("normalizeValue: strips 'build' suffix from 'athletic build'", () => {
  assertEquals(normalizeValue("athletic build", "build"), "athletic");
});

Deno.test("normalizeValue: strips 'appearance' suffix from 'tired appearance'", () => {
  assertEquals(normalizeValue("tired appearance", "age"), "tired");
});

Deno.test("normalizeValue: does not strip non-matching suffix", () => {
  assertEquals(normalizeValue("rugged face", "build"), "rugged face");
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. normalizeValue — appearance/look stripping
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("normalizeValue: strips 'appears in 30s' → '30s'", () => {
  assertEquals(normalizeValue("appears in 30s", "age"), "30s");
});

Deno.test("normalizeValue: strips 'appears to be in their 40s' → '40s'", () => {
  assertEquals(normalizeValue("appears to be in their 40s", "age"), "40s");
});

Deno.test("normalizeValue: strips leading 'a' or 'an'", () => {
  assertEquals(normalizeValue("a tall figure", "build"), "tall figure");
  assertEquals(normalizeValue("an imposing presence", "build"), "imposing presence");
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. normalizeAgeRange — decade parsing
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("normalizeAgeRange: '40s' → '40s'", () => {
  assertEquals(normalizeAgeRange("40s"), "40s");
});

Deno.test("normalizeAgeRange: 'appears in 30s' → '30s'", () => {
  assertEquals(normalizeAgeRange("appears in 30s"), "30s");
});

Deno.test("normalizeAgeRange: '25 years old' → '20s'", () => {
  assertEquals(normalizeAgeRange("25 years old"), "20s");
});

Deno.test("normalizeAgeRange: '32 years old' → '30s'", () => {
  assertEquals(normalizeAgeRange("32 years old"), "30s");
});

Deno.test("normalizeAgeRange: '8 years old' → 'child'", () => {
  assertEquals(normalizeAgeRange("8 years old"), "child");
});

Deno.test("normalizeAgeRange: '17 year old' → 'teen'", () => {
  assertEquals(normalizeAgeRange("17 year old"), "teen");
});

Deno.test("normalizeAgeRange: '65 years old' → '60s+'", () => {
  assertEquals(normalizeAgeRange("65 years old"), "60s+");
});

Deno.test("normalizeAgeRange: '25-35' range → '25-35'", () => {
  assertEquals(normalizeAgeRange("25-35"), "25-35");
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. normalizeAgeRange — known age bands
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("normalizeAgeRange: 'middle-aged' → 'middle-aged'", () => {
  assertEquals(normalizeAgeRange("middle-aged"), "middle-aged");
});

Deno.test("normalizeAgeRange: 'elderly' → 'elderly'", () => {
  assertEquals(normalizeAgeRange("elderly"), "elderly");
});

Deno.test("normalizeAgeRange: 'ageless' → 'ageless'", () => {
  assertEquals(normalizeAgeRange("ageless"), "ageless");
});

Deno.test("normalizeAgeRange: '' → ''", () => {
  assertEquals(normalizeAgeRange(""), "");
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. normalizeBiologicalSex — strict male/female
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("normalizeBiologicalSex: 'male' → 'male'", () => {
  assertEquals(normalizeBiologicalSex("male"), "male");
});

Deno.test("normalizeBiologicalSex: 'female' → 'female'", () => {
  assertEquals(normalizeBiologicalSex("female"), "female");
});

Deno.test("normalizeBiologicalSex: 'male gender' → 'male' (after stripping)", () => {
  assertEquals(normalizeBiologicalSex("male gender"), "male");
});

Deno.test("normalizeBiologicalSex: 'non-binary' → undefined", () => {
  assertEquals(normalizeBiologicalSex("non-binary"), undefined);
});

Deno.test("normalizeBiologicalSex: '' → undefined", () => {
  assertEquals(normalizeBiologicalSex(""), undefined);
});

Deno.test("normalizeBiologicalSex: 'unknown' → undefined", () => {
  assertEquals(normalizeBiologicalSex("unknown"), undefined);
});

// ══════════════════════════════════════════════════════════════════════════════
// 16. isGenericLabel
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("isGenericLabel: 'age' is generic", () => {
  assert(isGenericLabel("age"));
});

Deno.test("isGenericLabel: 'eyes' is generic", () => {
  assert(isGenericLabel("eyes"));
});

Deno.test("isGenericLabel: 'social class' is generic (multi-word)", () => {
  assert(isGenericLabel("social class"));
});

Deno.test("isGenericLabel: '40s weathered' is NOT generic", () => {
  assertEquals(isGenericLabel("40s weathered"), false);
});

Deno.test("isGenericLabel: 'hazel eyes' is NOT generic (two words, specific)", () => {
  assertEquals(isGenericLabel("hazel eyes"), false);
});

Deno.test("isGenericLabel: 'Age' (capitalized) is still generic", () => {
  assert(isGenericLabel("Age"));
});

// ══════════════════════════════════════════════════════════════════════════════
// 17. isNonHumanEntity
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("isNonHumanEntity: 2+ mythic markers returns true", () => {
  const traits = [
    makeTrait("divine celestial being", "other"),
    makeTrait("glowing eyes", "face"),
  ];
  assert(isNonHumanEntity(traits));
});

Deno.test("isNonHumanEntity: 0-1 markers returns false", () => {
  const traits = [
    makeTrait("glowing eyes", "face"),
  ];
  assertEquals(isNonHumanEntity(traits), false);
});

Deno.test("isNonHumanEntity: empty array returns false", () => {
  assertEquals(isNonHumanEntity([]), false);
});

Deno.test("isNonHumanEntity: null returns false", () => {
  assertEquals(isNonHumanEntity(null as any), false);
});

// ══════════════════════════════════════════════════════════════════════════════
// 18. mergeIdentitySignatures — top-level field merge
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("mergeSignatures: top-level primitive fields overridden by incoming", () => {
  const existing = { status: "draft", version: 1 };
  const incoming = { status: "complete" };
  const result = mergeIdentitySignatures(existing, incoming);
  assertEquals(result.status, "complete");
  assertEquals(result.version, 1, "unchanged fields preserved");
});

// ══════════════════════════════════════════════════════════════════════════════
// 19. mergeIdentitySignatures — signature sub-object merge
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("mergeSignatures: signature sub-object merges shallowly", () => {
  const existing = { signature: { age: "40s", build: "athletic" } };
  const incoming = { signature: { age: "50s", height: "tall" } };
  const result = mergeIdentitySignatures(existing, incoming);
  assertEquals(result.signature.age, "50s", "overwritten");
  assertEquals(result.signature.build, "athletic", "preserved");
  assertEquals(result.signature.height, "tall", "appended");
});

// ══════════════════════════════════════════════════════════════════════════════
// 20. mergeIdentitySignatures — binding_markers append (no dupes)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("mergeSignatures: binding_markers append novel markers only", () => {
  const existing = { binding_markers: [{ label: "scar" }, { label: "tattoo" }] };
  const incoming = { binding_markers: [{ label: "tattoo" }, { label: "glasses" }] };
  const result = mergeIdentitySignatures(existing, incoming);
  assertEquals(result.binding_markers.length, 3, "only 'glasses' is novel");
  assert(result.binding_markers.map((m: any) => m.label).includes("glasses"));
});

Deno.test("mergeSignatures: null/undefined values in incoming are skipped", () => {
  const existing = { name: "test" };
  const incoming: Record<string, any> = { name: null, other: undefined };
  const result = mergeIdentitySignatures(existing, incoming);
  assertEquals(result.name, "test", "null should not overwrite");
});

// ══════════════════════════════════════════════════════════════════════════════
// 21. mergeIdentitySignatures — evidence_traits append (no dupes)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("mergeSignatures: evidence_traits deduplicates by label", () => {
  const existing = { evidence_traits: [{ label: "blue eyes", confidence: "high" }] };
  const incoming = { evidence_traits: [
    { label: "blue eyes", confidence: "medium" },
    { label: "tall", confidence: "low" },
  ]};
  const result = mergeIdentitySignatures(existing, incoming);
  assertEquals(result.evidence_traits.length, 2);
  assertEquals(result.evidence_traits[0].label, "blue eyes");
});

// ══════════════════════════════════════════════════════════════════════════════
// 22. backfillIdentityFromSignature — Format D
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("backfillIdentity: Format D signature populates age_range", () => {
  const sig = { signature: { age: "40s" } };
  const result = backfillIdentityFromSignature(sig, {});
  assertEquals(result.age_range, "40s");
});

Deno.test("backfillIdentity: Format D signature with object sub-field", () => {
  const sig = {
    signature: {
      gender: { value: "male", confidence: "high" },
      age: { label: "30s" },
    },
  };
  const result = backfillIdentityFromSignature(sig, {});
  assertEquals(result.biological_sex, "male");
  assertEquals(result.age_range, "30s");
});

Deno.test("backfillIdentity: Format D with body sub-object for height", () => {
  const sig = { signature: { body: { build: "athletic", height_estimate: "6ft" } } };
  const result = backfillIdentityFromSignature(sig, {});
  assertEquals(result.body_type, "athletic");
  assertEquals(result.height_class, "6ft");
});

Deno.test("backfillIdentity: Format D with face sub-object constructs facial_archetype", () => {
  const sig = { signature: { face: { shape: "oval", eyes: "hazel", jaw: "strong" } } };
  const result = backfillIdentityFromSignature(sig, {});
  assert(result.facial_archetype?.includes("oval"), "face shape included");
  assert(result.facial_archetype?.includes("hazel"), "eyes included");
  assert(result.facial_archetype?.includes("strong"), "jaw included");
});

// ══════════════════════════════════════════════════════════════════════════════
// 23. backfillIdentityFromSignature — Legacy flat format
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("backfillIdentity: legacy flat format with direct fields", () => {
  const sig = { age: "50s", gender: "female", build: "slim" };
  const result = backfillIdentityFromSignature(sig, {});
  assertEquals(result.age_range, "50s");
  assertEquals(result.biological_sex, "female");
  assertEquals(result.body_type, "slim");
});

Deno.test("backfillIdentity: legacy flat format with ethnicity array", () => {
  const sig = { ethnicity: ["Caucasian", "Hispanic"] };
  const result = backfillIdentityFromSignature(sig, {});
  assertEquals(result.ethnicity, ["Caucasian", "Hispanic"]);
});

Deno.test("backfillIdentity: legacy flat format with ethnicity string", () => {
  const sig = { ethnicity: "Asian" };
  const result = backfillIdentityFromSignature(sig, {});
  assertEquals(result.ethnicity, ["Asian"]);
});

// ══════════════════════════════════════════════════════════════════════════════
// 24. backfillIdentityFromSignature — NEVER overwrites existing
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("backfillIdentity: does NOT overwrite existing non-null value", () => {
  const existing = { age_range: "30s", biological_sex: "female" };
  const sig = { signature: { age: "50s", gender: "male" } };
  const result = backfillIdentityFromSignature(sig, existing);
  assertEquals(result.age_range, undefined, "existing '30s' should not be overwritten");
  assertEquals(result.biological_sex, undefined, "existing 'female' should not be overwritten");
});

Deno.test("backfillIdentity: fills null/undefined existing fields", () => {
  const existing = { age_range: null, biological_sex: undefined };
  const sig = { signature: { age: "50s", gender: "male" } };
  const result = backfillIdentityFromSignature(sig, existing);
  assertEquals(result.age_range, "50s");
  assertEquals(result.biological_sex, "male");
});

// ══════════════════════════════════════════════════════════════════════════════
// 25. extractIdentitySignature — prefers identity_signature column
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractIdentitySignature: returns identity_signature if present", () => {
  const row = { identity_signature: { signature: { age: "40s" } } };
  const result = extractIdentitySignature(row);
  assertEquals(result, { signature: { age: "40s" } });
});

// ══════════════════════════════════════════════════════════════════════════════
// 26. extractIdentitySignature — constructs from structured fields fallback
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractIdentitySignature: constructs from structured fields when no identity_signature", () => {
  const row = { age_range: "40s", biological_sex: "male", body_type: "athletic" };
  const result = extractIdentitySignature(row);
  assertEquals(result, { signature: { age: "40s", gender: "male", build: "athletic" } });
});

Deno.test("extractIdentitySignature: falls back with partial structured fields", () => {
  const row = { age_range: "20s", height_class: "tall" };
  const result = extractIdentitySignature(row);
  assert(result?.signature?.age, "20s");
  assert(result?.signature?.height, "tall");
});

// ══════════════════════════════════════════════════════════════════════════════
// 27. extractIdentitySignature — null/empty returns null
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractIdentitySignature: null row returns null", () => {
  assertEquals(extractIdentitySignature(null), null);
});

Deno.test("extractIdentitySignature: row with no identity fields returns null", () => {
  assertEquals(extractIdentitySignature({}), null);
});

Deno.test("extractIdentitySignature: row with non-identity fields returns null", () => {
  assertEquals(extractIdentitySignature({ name: "test", version: 3 }), null);
});