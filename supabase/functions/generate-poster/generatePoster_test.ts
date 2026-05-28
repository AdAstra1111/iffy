/**
 * Tests for generate-poster — image style policy, world lock, and prompt assembly.
 *
 * Covers:
 *   1. resolveImageStylePolicy — animation formats, graphic genres, default
 *   2. Case insensitivity in format/genre matching
 *   3. Partial/contains matching in genre lookup
 *   4. PHOTOREAL_DIRECTIVES and PHOTOREAL_NEGATIVES constants
 *   5. deriveWorldLock — era detection and prohibition logic
 *   6. buildStrategyContext — genre motif lookup, tone visual, comp reference
 *   7. buildStrategyPrompt — prompt block assembly
 *   8. Format/genre priority: animation before graphic
 */

import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Types (mirrored from index.ts)
// ══════════════════════════════════════════════════════════════════════════════

type ImageStyleMode = 'photorealistic_cinematic' | 'stylised_animation' | 'stylised_graphic' | 'stylised_experimental' | 'stylised_period_painterly';

interface ImageStylePolicy {
  mode: ImageStyleMode;
  rationale: string;
  styleDirectives: string;
  negativeStyleConstraints: string;
  isDefault: boolean;
}

interface WorldLock {
  era: string;
  geography: string;
  culture: string;
  architecture: string;
  wardrobe: string;
  technology: string;
  prohibitions: string[];
}

interface PosterPromptInputs {
  title: string;
  format: string;
  genres: string[];
  tone: string;
  budget_range: string;
  target_audience: string;
  comparable_titles: string;
  assigned_lane: string | null;
  logline: string | null;
  canon_summary: string | null;
  characters: string | null;
  conflict: string | null;
  themes: string | null;
  world_setting: string | null;
  worldLock: WorldLock;
}

interface StrategyContext {
  title: string;
  logline: string | null;
  characters: string | null;
  worldSetting: string | null;
  conflict: string | null;
  themes: string | null;
  primaryGenre: string;
  genreVisual: string;
  toneVisual: string;
  compReference: string;
  worldLock: WorldLock;
  writerCredit: string;
  companyCredit: string;
  stylePolicy: ImageStylePolicy;
}

// ══════════════════════════════════════════════════════════════════════════════
// Constants (mirrored from index.ts)
// ══════════════════════════════════════════════════════════════════════════════

const PHOTOREAL_DIRECTIVES = [
  'Photorealistic cinematic imagery',
  'Shot on high-end cinema camera (ARRI Alexa / RED Monstro aesthetic)',
  'Real-world materials, textures, and surfaces',
  'Believable natural or motivated lighting',
  'Cinematic depth of field with professional lens characteristics',
  'Grounded, tactile, physically plausible composition',
  'Premium theatrical realism — this should look like a still from a major motion picture',
].join('. ');

const PHOTOREAL_NEGATIVES = [
  'painterly', 'illustrative', 'cartoon', 'anime', 'graphic-novel style',
  'concept art rendering', 'abstract', 'surreal', 'watercolor',
  'oil painting', 'sketch', 'line art', 'cel-shaded', 'pop art',
  'storybook illustration', 'digital painting', 'CGI render look',
  'overly stylised', 'artificial looking', 'plastic skin texture',
  'uncanny valley', 'stock photo aesthetic',
].join(', ');

const ANIMATION_FORMATS = ['animation', 'anim-feature', 'anim-series', 'animated'];
const GRAPHIC_GENRES = ['graphic-novel', 'comic', 'manga'];

// ══════════════════════════════════════════════════════════════════════════════
// Functions under test (mirrored from index.ts)
// ══════════════════════════════════════════════════════════════════════════════

function resolveImageStylePolicy(format: string, genres: string[]): ImageStylePolicy {
  const f = format.toLowerCase();
  const gs = genres.map(g => g.toLowerCase());

  if (ANIMATION_FORMATS.some(af => f.includes(af))) {
    return {
      mode: 'stylised_animation', rationale: `Animation format: ${format}`, isDefault: false,
      styleDirectives: 'Stylised animated visual language. Bold shapes, expressive character design. Professional animation studio quality.',
      negativeStyleConstraints: 'photorealistic, live-action, stock photo, uncanny valley, cheap CGI',
    };
  }
  if (gs.some(g => GRAPHIC_GENRES.some(gg => g.includes(gg)))) {
    return {
      mode: 'stylised_graphic', rationale: `Graphic genre: ${gs.join(', ')}`, isDefault: false,
      styleDirectives: 'Graphic novel / comic book visual style. Bold ink work, dramatic panel composition.',
      negativeStyleConstraints: 'photorealistic, live-action, stock photo',
    };
  }
  return {
    mode: 'photorealistic_cinematic', rationale: 'Default — photorealistic cinematic', isDefault: true,
    styleDirectives: PHOTOREAL_DIRECTIVES,
    negativeStyleConstraints: PHOTOREAL_NEGATIVES,
  };
}

function deriveWorldLock(inputs: Omit<PosterPromptInputs, "worldLock">): WorldLock {
  const ws = (inputs.world_setting || "").toLowerCase();
  const cs = (inputs.canon_summary || "").toLowerCase();
  const combined = `${ws} ${cs} ${inputs.logline || ""} ${inputs.themes || ""}`.toLowerCase();
  const genres = inputs.genres.map(g => g.toLowerCase());

  // Detect era
  let era = "contemporary";
  if (/feudal|samurai|shogun|edo|sengoku|medieval japan/i.test(combined)) era = "feudal Japan";
  else if (/medieval|middle ages|crusade|knight/i.test(combined)) era = "medieval Europe";
  else if (/victorian|1800s|19th century|gaslight/i.test(combined)) era = "Victorian era";
  else if (/renaissance|1500s|16th century/i.test(combined)) era = "Renaissance";
  else if (/ancient rome|roman empire|gladiator/i.test(combined)) era = "ancient Rome";
  else if (/ancient greece|sparta|athen/i.test(combined)) era = "ancient Greece";
  else if (/colonial|1700s|18th century|revolution/i.test(combined)) era = "18th century colonial";
  else if (/1920s|jazz age|prohibition|gatsby/i.test(combined)) era = "1920s";
  else if (/1940s|world war ii|wwii|ww2|blitz/i.test(combined)) era = "1940s wartime";
  else if (/1950s|post.?war|cold war/i.test(combined)) era = "1950s";
  else if (/1960s|sixties|civil rights/i.test(combined)) era = "1960s";
  else if (/1970s|seventies|disco/i.test(combined)) era = "1970s";
  else if (/1980s|eighties/i.test(combined)) era = "1980s";
  else if (/1990s|nineties/i.test(combined)) era = "1990s";
  else if (/futur|2[1-9]\d\d|space|dystop|cyberpunk/i.test(combined)) era = "near-future or futuristic";
  else if (/prehistoric|stone age|cave/i.test(combined)) era = "prehistoric";

  // Detect geography/culture
  let geography = "unspecified";
  let culture = "unspecified";
  if (/japan|tokyo|kyoto|osaka|samurai|shogun/i.test(combined)) { geography = "Japan"; culture = "Japanese"; }
  else if (/korea|seoul|korean/i.test(combined)) { geography = "Korea"; culture = "Korean"; }
  else if (/china|beijing|shanghai|chinese|dynasty/i.test(combined)) { geography = "China"; culture = "Chinese"; }
  else if (/india|mumbai|delhi|bollywood|indian/i.test(combined)) { geography = "India"; culture = "Indian"; }
  else if (/nigeria|lagos|nollywood|african/i.test(combined)) { geography = "West Africa"; culture = "West African"; }
  else if (/london|british|england|uk|scottish|wales/i.test(combined)) { geography = "United Kingdom"; culture = "British"; }
  else if (/paris|french|france/i.test(combined)) { geography = "France"; culture = "French"; }
  else if (/new york|los angeles|american|usa|united states/i.test(combined)) { geography = "United States"; culture = "American"; }
  else if (/mexico|mexican|cartel/i.test(combined)) { geography = "Mexico"; culture = "Mexican"; }
  else if (/brazil|brazilian|rio/i.test(combined)) { geography = "Brazil"; culture = "Brazilian"; }
  else if (/middle east|arab|persian|iran|iraq/i.test(combined)) { geography = "Middle East"; culture = "Middle Eastern"; }
  else if (/scandinav|viking|norse|sweden|norway|denmark/i.test(combined)) { geography = "Scandinavia"; culture = "Scandinavian/Norse"; }

  const archMap: Record<string, string> = {
    "feudal Japan": "traditional Japanese architecture — wooden temples, sliding shoji screens, tiled roofs, castle keeps",
    "medieval Europe": "stone castles, Gothic cathedrals, thatched villages",
    "Victorian era": "ornate Victorian buildings, gas-lit streets, industrial architecture",
    "contemporary": "modern architecture appropriate to the setting",
  };
  const wardrobeMap: Record<string, string> = {
    "feudal Japan": "traditional Japanese garments — kimono, hakama, samurai armor, period-accurate clothing",
    "medieval Europe": "medieval European clothing — tunics, armor, cloaks",
    "Victorian era": "Victorian-era clothing — long coats, corsets, top hats",
    "contemporary": "modern clothing appropriate to the setting and characters",
  };

  const architecture = archMap[era] || `architecture consistent with ${era} ${geography !== "unspecified" ? geography : "setting"}`;
  const wardrobe = wardrobeMap[era] || `clothing consistent with ${era} ${culture !== "unspecified" ? culture : "setting"}`;

  let technology = "no anachronistic technology";
  if (era === "feudal Japan") technology = "no modern technology, no electronics, no firearms — only period weapons and tools";
  else if (era.includes("medieval")) technology = "no modern technology — only medieval tools, weapons, and crafts";
  else if (era === "contemporary") technology = "modern technology appropriate to setting";
  else if (era.includes("futur")) technology = "futuristic technology consistent with the setting";

  const prohibitions: string[] = [];

  if (!genres.includes("sci-fi") && !era.includes("futur")) {
    prohibitions.push("NO sci-fi imagery, NO spaceships, NO alien worlds, NO futuristic technology, NO neon cyberpunk");
  }
  if (!genres.includes("fantasy") && !combined.includes("magic")) {
    prohibitions.push("NO fantasy creatures, NO dragons, NO magic spells, NO wizards");
  }
  if (era === "feudal Japan") {
    prohibitions.push(
      "NO European/Western architecture or clothing",
      "NO colonial American imagery",
      "NO Victorian or Regency aesthetics",
      "NO modern cityscapes or skyscrapers",
      "NO guns or modern weapons",
    );
  }
  if (geography === "Japan" || culture === "Japanese") {
    prohibitions.push("NO non-Japanese cultural elements unless explicitly in the story");
  }
  if (!genres.includes("romance")) {
    prohibitions.push("NO romantic novel cover aesthetic");
  }
  if (!genres.includes("western")) {
    prohibitions.push("NO Wild West or American frontier imagery");
  }
  prohibitions.push(
    "NO stock photo aesthetic",
    "NO AI-generated artifacts or glitches",
    "NO cartoonish or anime style unless the project is animation",
  );

  return { era, geography, culture, architecture, wardrobe, technology, prohibitions };
}

const toneVisuals: Record<string, string> = {
  dark: "moody shadows, desaturated palette, noir-inspired lighting",
  light: "warm golden light, hopeful atmosphere, soft focus backgrounds",
  gritty: "raw textures, urban decay, handheld documentary feel",
  comedic: "bright natural colors, dynamic composition, playful energy",
  thriller: "high contrast, tension-filled composition, cool blue tones",
  dramatic: "deep cinematic shadows, rich warm tones, emotional weight",
  horror: "deep blacks, unsettling atmosphere, eerie fog, cold tones",
  romantic: "soft bokeh, warm sunset tones, intimate framing",
  epic: "sweeping vista, grand scale, dramatic sky, golden hour",
  satirical: "sharp contrast, bold framing, high-saturation photography",
  whimsical: "warm soft tones, magical-hour lighting, intimate atmosphere",
  suspenseful: "high contrast, silhouettes, tension, atmospheric haze",
};

const genreMotifs: Record<string, string> = {
  drama: "emotional portraiture, dramatic lighting",
  thriller: "shadowy figures, tension, urban nightscape",
  horror: "darkness, isolation, dread",
  comedy: "vibrant colors, expressive characters",
  "sci-fi": "futuristic elements, technological atmosphere",
  romance: "intimate composition, warm tones",
  action: "dynamic movement, explosive energy",
  crime: "noir aesthetics, urban grit",
  mystery: "obscured faces, fog, enigmatic composition",
  fantasy: "otherworldly landscapes, atmospheric depth",
  war: "epic scale, visceral intensity, smoke and earth",
  western: "vast landscapes, dusty atmosphere, golden light",
  musical: "vibrant stage lighting, performance energy",
  animation: "stylised animated visual language, bold shapes, professional animation quality",
  documentary: "authentic textures, photographic realism",
  "true-crime": "evidence board aesthetic, cold case atmosphere",
};

const POSTER_STRATEGIES = [
  {
    key: "character",
    label: "Character Focus",
    briefing: (ctx: StrategyContext) =>
      `Cinematic key art for "${ctx.title}". ` +
      `The lead character dominates the frame — intense emotional expression, cinematic close-up or medium shot. ` +
      (ctx.characters ? `Character: ${ctx.characters}. ` : "") +
      `Set in ${ctx.worldLock.era}, ${ctx.worldLock.geography !== "unspecified" ? ctx.worldLock.geography : "the story's world"}. ` +
      `${ctx.worldLock.wardrobe}. ${ctx.worldLock.architecture} visible in background. ` +
      `${ctx.toneVisual}. ` +
      `Full cinematic composition filling the entire frame — use every inch for storytelling.`,
  },
  {
    key: "world",
    label: "World / Environment",
    briefing: (ctx: StrategyContext) =>
      `Cinematic key art for "${ctx.title}". ` +
      `The setting dominates — vast, atmospheric, cinematic scale. ` +
      (ctx.worldSetting ? `Setting: ${ctx.worldSetting}. ` : "") +
      `Set in ${ctx.worldLock.era}, ${ctx.worldLock.geography !== "unspecified" ? ctx.worldLock.geography : "the story's world"}. ` +
      `${ctx.worldLock.architecture}. ` +
      `Any human figure is small or silhouetted against the landscape. ` +
      `Epic composition, sweeping vista. ${ctx.toneVisual}. ` +
      `Full cinematic composition — use the entire canvas for the world.`,
  },
  {
    key: "conflict",
    label: "Conflict / Action",
    briefing: (ctx: StrategyContext) =>
      `Cinematic key art for "${ctx.title}". ` +
      `Captures the central conflict — dynamic tension, confrontation, high stakes. ` +
      (ctx.conflict ? `Conflict: ${ctx.conflict}. ` : "") +
      `Set in ${ctx.worldLock.era}, ${ctx.worldLock.geography !== "unspecified" ? ctx.worldLock.geography : "the story's world"}. ` +
      `${ctx.worldLock.wardrobe}. ${ctx.worldLock.technology}. ` +
      `Dramatic angles, sense of motion and danger. ${ctx.toneVisual}. ` +
      `Full cinematic composition — no reserved blank areas, use every part of the frame.`,
  },
  {
    key: "prestige",
    label: "Symbolic / Prestige",
    briefing: (ctx: StrategyContext) =>
      `Prestige festival-style cinematic key art for "${ctx.title}". ` +
      `Minimalist, metaphor-driven, symbolic. A24 / Cannes aesthetic. ` +
      (ctx.themes ? `Themes: ${ctx.themes}. ` : "") +
      `Visual elements drawn from ${ctx.worldLock.era} ${ctx.worldLock.culture !== "unspecified" ? ctx.worldLock.culture : ""} world. ` +
      `Restrained color palette, elegant negative space. ${ctx.toneVisual}. ` +
      `Full atmospheric composition filling the entire canvas — no empty zones.`,
  },
  {
    key: "commercial",
    label: "Commercial / High-Concept",
    briefing: (ctx: StrategyContext) =>
      `Commercial cinematic key art for "${ctx.title}". ` +
      `Bold, clear visual hook — sells from across a room. ` +
      (ctx.logline ? `Hook: ${ctx.logline.slice(0, 150)}. ` : "") +
      `Set in ${ctx.worldLock.era}, ${ctx.worldLock.geography !== "unspecified" ? ctx.worldLock.geography : "the story's world"}. ` +
      `${ctx.worldLock.wardrobe}. Strong focal point. ${ctx.toneVisual}. Mainstream appeal. ` +
      `Full cinematic composition — use the entire frame, no blank zones.`,
  },
  {
    key: "genre",
    label: "Genre Pure",
    briefing: (ctx: StrategyContext) =>
      `Genre-forward cinematic key art for "${ctx.title}" that fully commits to ${ctx.primaryGenre} genre conventions. ` +
      `Every visual cue signals the genre immediately — ${ctx.genreVisual || "dramatic cinematography"}. ` +
      `Set in ${ctx.worldLock.era}, ${ctx.worldLock.geography !== "unspecified" ? ctx.worldLock.geography : "the story's world"}. ` +
      `${ctx.worldLock.wardrobe}. ${ctx.worldLock.architecture}. ${ctx.toneVisual}. ` +
      `Full cinematic composition — fill the entire frame with genre-defining imagery.`,
  },
] as const;

function buildStrategyContext(inputs: PosterPromptInputs, branding: { companyName: string; writerCredit: string }): StrategyContext {
  const primaryGenre = inputs.genres[0] || "drama";
  const toneVisual = toneVisuals[inputs.tone?.toLowerCase()] || "cinematic atmosphere, professional lighting";
  const genreVisual = inputs.genres
    .map(g => genreMotifs[g?.toLowerCase()] || "")
    .filter(Boolean)
    .join(", ");

  let compReference = "";
  if (inputs.comparable_titles) {
    const comps = inputs.comparable_titles.split(",").map(s => s.trim()).filter(Boolean).slice(0, 3);
    if (comps.length > 0) compReference = `Visual inspiration from posters of films like ${comps.join(", ")}. `;
  }

  const stylePolicy = resolveImageStylePolicy(inputs.format, inputs.genres);

  return {
    title: inputs.title,
    logline: inputs.logline,
    characters: inputs.characters,
    worldSetting: inputs.world_setting,
    conflict: inputs.conflict,
    themes: inputs.themes,
    primaryGenre,
    genreVisual,
    toneVisual,
    compReference,
    worldLock: inputs.worldLock,
    writerCredit: branding.writerCredit,
    companyCredit: branding.companyName,
    stylePolicy,
  };
}

function buildStrategyPrompt(strategy: typeof POSTER_STRATEGIES[number], ctx: StrategyContext, vsalBlock?: string | null): string {
  const base = strategy.briefing(ctx);

  const stylePolicyBlock = [
    `IMAGE STYLE POLICY (MANDATORY):`,
    `${ctx.stylePolicy.styleDirectives}`,
    `DO NOT render in these styles: ${ctx.stylePolicy.negativeStyleConstraints}`,
  ].join("\n");

  const worldLockBlock = [
    `CRITICAL WORLD CONSTRAINTS:`,
    `- Era: ${ctx.worldLock.era}`,
    ctx.worldLock.geography !== "unspecified" ? `- Geography: ${ctx.worldLock.geography}` : null,
    ctx.worldLock.culture !== "unspecified" ? `- Culture: ${ctx.worldLock.culture}` : null,
    `- Architecture: ${ctx.worldLock.architecture}`,
    `- Wardrobe: ${ctx.worldLock.wardrobe}`,
    `- Technology: ${ctx.worldLock.technology}`,
  ].filter(Boolean).join("\n");

  const prohibitions = ctx.worldLock.prohibitions.length > 0
    ? `ABSOLUTE PROHIBITIONS:\n${ctx.worldLock.prohibitions.join("\n")}\n${ctx.stylePolicy.negativeStyleConstraints}`
    : `ABSOLUTE PROHIBITIONS:\n${ctx.stylePolicy.negativeStyleConstraints}`;

  const textTreatment = [
    `POSTER TEXT TREATMENT (CRITICAL — READ CAREFULLY):`,
    `- DO NOT render any text, titles, names, credits, or billing blocks on the image`,
    `- DO NOT invent actor names, producer names, studio names, or any credits`,
    `- DO NOT add any typography, lettering, or text overlays of any kind`,
    `- DO NOT render title cards, credit blocks, or any written words`,
    `- Generate ONLY the visual key art / background image — pure artwork, zero text`,
    `- Text, title, and billing block will be composited separately by the rendering system`,
  ].join("\n");

  const composition = [
    `CINEMATIC POSTER COMPOSITION (MANDATORY):`,
    `- This image is the KEY ART for a theatrical movie poster — treat it with that gravity`,
    `- The composition must use the ENTIRE canvas from top to bottom — no empty zones`,
    `- DO NOT leave a black, dark, or empty area at the bottom of the image`,
    `- DO NOT create a "safe zone" or "text zone" — the compositor handles all text overlays`,
    `- Fill the entire frame with cinematic visual storytelling:`,
    `  TOP: atmospheric sky, vignette, or environmental context`,
    `  MIDDLE: primary visual subject (character, scene, symbolic element)`,
    `  BOTTOM: continue the composition — environment, ground, atmosphere, details`,
    `- Think of classic theatrical movie posters: the artwork goes edge to edge`,
    `- Use dramatic cinematic lighting: motivated sources, depth, atmosphere`,
    `- Strong focal point with clear visual hierarchy`,
    `- Portrait 2:3 aspect ratio`,
    `- The overall feel must be PREMIUM THEATRICAL — as if printed 27"×40" for a cinema lobby`,
    ctx.stylePolicy.mode === 'photorealistic_cinematic'
      ? `- Photorealistic 4K quality — shot on ARRI Alexa or RED, professional cinematography`
      : `- High production value ${ctx.stylePolicy.mode.replace(/_/g, ' ')} rendering — studio quality`,
    `- Color grade should feel cohesive and intentional, not flat or over-saturated`,
    `- CRITICAL: The image must look complete on its own — a full cinematic painting, not a cropped fragment`,
  ].join("\n");

  const blocks = [base, stylePolicyBlock, ctx.compReference, worldLockBlock, prohibitions, textTreatment, composition];

  if (vsalBlock) {
    blocks.push(vsalBlock);
  }

  return blocks.filter(Boolean).join("\n\n");
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

function makeDefaultWorldLock(): WorldLock {
  return {
    era: "contemporary",
    geography: "unspecified",
    culture: "unspecified",
    architecture: "modern architecture appropriate to the setting",
    wardrobe: "modern clothing appropriate to the setting and characters",
    technology: "modern technology appropriate to setting",
    prohibitions: [
      "NO sci-fi imagery, NO spaceships, NO alien worlds, NO futuristic technology, NO neon cyberpunk",
      "NO fantasy creatures, NO dragons, NO magic spells, NO wizards",
      "NO romantic novel cover aesthetic",
      "NO Wild West or American frontier imagery",
      "NO stock photo aesthetic",
      "NO AI-generated artifacts or glitches",
      "NO cartoonish or anime style unless the project is animation",
    ],
  };
}

function makeDefaultInputs(overrides: Partial<PosterPromptInputs> = {}): PosterPromptInputs {
  return {
    title: "Test Film",
    format: "film",
    genres: ["drama"],
    tone: "dramatic",
    budget_range: "medium",
    target_audience: "adults",
    comparable_titles: "",
    assigned_lane: null,
    logline: null,
    canon_summary: null,
    characters: null,
    conflict: null,
    themes: null,
    world_setting: null,
    worldLock: makeDefaultWorldLock(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. resolveImageStylePolicy — ANIMATION FORMATS
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("resolveImageStylePolicy: animation format returns stylised_animation", () => {
  const result = resolveImageStylePolicy("animation", ["drama"]);
  assertEquals(result.mode, "stylised_animation");
  assertEquals(result.isDefault, false);
  assertStringIncludes(result.rationale, "Animation format: animation");
});

Deno.test("resolveImageStylePolicy: anim-feature format returns stylised_animation", () => {
  const result = resolveImageStylePolicy("anim-feature", []);
  assertEquals(result.mode, "stylised_animation");
});

Deno.test("resolveImageStylePolicy: anim-series format returns stylised_animation", () => {
  const result = resolveImageStylePolicy("anim-series", []);
  assertEquals(result.mode, "stylised_animation");
});

Deno.test("resolveImageStylePolicy: animated format returns stylised_animation", () => {
  const result = resolveImageStylePolicy("animated", ["comedy"]);
  assertEquals(result.mode, "stylised_animation");
});

Deno.test("resolveImageStylePolicy: animation format has correct style directives", () => {
  const result = resolveImageStylePolicy("animation", []);
  assertEquals(result.styleDirectives,
    "Stylised animated visual language. Bold shapes, expressive character design. Professional animation studio quality.");
  assertEquals(result.negativeStyleConstraints,
    "photorealistic, live-action, stock photo, uncanny valley, cheap CGI");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. resolveImageStylePolicy — GRAPHIC GENRES
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("resolveImageStylePolicy: graphic-novel genre returns stylised_graphic", () => {
  const result = resolveImageStylePolicy("film", ["graphic-novel"]);
  assertEquals(result.mode, "stylised_graphic");
  assertEquals(result.isDefault, false);
  assertStringIncludes(result.rationale, "Graphic genre:");
});

Deno.test("resolveImageStylePolicy: comic genre returns stylised_graphic", () => {
  const result = resolveImageStylePolicy("series", ["comic"]);
  assertEquals(result.mode, "stylised_graphic");
});

Deno.test("resolveImageStylePolicy: manga genre returns stylised_graphic", () => {
  const result = resolveImageStylePolicy("film", ["manga"]);
  assertEquals(result.mode, "stylised_graphic");
});

Deno.test("resolveImageStylePolicy: graphic genre has correct style directives", () => {
  const result = resolveImageStylePolicy("film", ["comic"]);
  assertEquals(result.styleDirectives,
    "Graphic novel / comic book visual style. Bold ink work, dramatic panel composition.");
  assertEquals(result.negativeStyleConstraints,
    "photorealistic, live-action, stock photo");
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. resolveImageStylePolicy — DEFAULT (photorealistic_cinematic)
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("resolveImageStylePolicy: film with drama genre returns photorealistic_cinematic", () => {
  const result = resolveImageStylePolicy("film", ["drama"]);
  assertEquals(result.mode, "photorealistic_cinematic");
  assertEquals(result.isDefault, true);
  assertEquals(result.rationale, "Default — photorealistic cinematic");
});

Deno.test("resolveImageStylePolicy: default uses PHOTOREAL_DIRECTIVES and PHOTOREAL_NEGATIVES constants", () => {
  const result = resolveImageStylePolicy("series", ["thriller"]);
  assertEquals(result.styleDirectives, PHOTOREAL_DIRECTIVES);
  assertEquals(result.negativeStyleConstraints, PHOTOREAL_NEGATIVES);
});

Deno.test("resolveImageStylePolicy: empty format and genres returns default", () => {
  const result = resolveImageStylePolicy("", []);
  assertEquals(result.mode, "photorealistic_cinematic");
  assertEquals(result.isDefault, true);
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. resolveImageStylePolicy — CASE INSENSITIVITY & PARTIAL MATCHES
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("resolveImageStylePolicy: case-insensitive format matching — Animation", () => {
  const result = resolveImageStylePolicy("Animation", ["drama"]);
  assertEquals(result.mode, "stylised_animation");
});

Deno.test("resolveImageStylePolicy: case-insensitive genre matching — Comic", () => {
  const result = resolveImageStylePolicy("film", ["Comic"]);
  assertEquals(result.mode, "stylised_graphic");
});

Deno.test("resolveImageStylePolicy: partial match in genre — graphic-novel-adaptation", () => {
  // The lookup uses `g.includes(gg)` so "graphic-novel-adaptation" contains "graphic-novel"
  const result = resolveImageStylePolicy("film", ["graphic-novel-adaptation"]);
  assertEquals(result.mode, "stylised_graphic");
});

Deno.test("resolveImageStylePolicy: partial match in genre — manga-inspired-action", () => {
  // "manga-inspired-action" contains "manga"
  const result = resolveImageStylePolicy("series", ["manga-inspired-action"]);
  assertEquals(result.mode, "stylised_graphic");
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. resolveImageStylePolicy — PRIORITY: animation beats graphic
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("resolveImageStylePolicy: animation format takes priority over graphic genre", () => {
  // Format checked first — even with graphic genres, animation format wins
  const result = resolveImageStylePolicy("animation", ["comic"]);
  assertEquals(result.mode, "stylised_animation", "animation format checked before graphic genre");
});

Deno.test("resolveImageStylePolicy: anim-feature format beats graphic genre", () => {
  const result = resolveImageStylePolicy("anim-feature", ["graphic-novel"]);
  assertEquals(result.mode, "stylised_animation");
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. PHOTOREAL_DIRECTIVES / PHOTOREAL_NEGATIVES — constant values
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("constant: PHOTOREAL_DIRECTIVES includes ARRI Alexa reference", () => {
  assertStringIncludes(PHOTOREAL_DIRECTIVES, "ARRI Alexa");
  assertStringIncludes(PHOTOREAL_DIRECTIVES, "Cinematic depth of field");
  assertStringIncludes(PHOTOREAL_DIRECTIVES, "Premium theatrical realism");
});

Deno.test("constant: PHOTOREAL_NEGATIVES includes all prohibited styles", () => {
  assertStringIncludes(PHOTOREAL_NEGATIVES, "painterly");
  assertStringIncludes(PHOTOREAL_NEGATIVES, "anime");
  assertStringIncludes(PHOTOREAL_NEGATIVES, "cartoon");
  assertStringIncludes(PHOTOREAL_NEGATIVES, "CGI render look");
  assertStringIncludes(PHOTOREAL_NEGATIVES, "uncanny valley");
  assertStringIncludes(PHOTOREAL_NEGATIVES, "stock photo aesthetic");
});

Deno.test("constant: ANIMATION_FORMATS has all 4 entries", () => {
  assertEquals(ANIMATION_FORMATS, ["animation", "anim-feature", "anim-series", "animated"]);
});

Deno.test("constant: GRAPHIC_GENRES has all 3 entries", () => {
  assertEquals(GRAPHIC_GENRES, ["graphic-novel", "comic", "manga"]);
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. deriveWorldLock — ERA DETECTION
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deriveWorldLock: feudal Japan era from world_setting", () => {
  const inputs = makeDefaultInputs({
    world_setting: "Edo period Japan, samurai clans",
    genres: ["action"],
  });
  const lock = deriveWorldLock(inputs);
  assertEquals(lock.era, "feudal Japan");
  assertEquals(lock.geography, "Japan");
  assertEquals(lock.culture, "Japanese");
  assert(lock.architecture.includes("traditional Japanese architecture"));
  assert(lock.wardrobe.includes("kimono"));
  assert(lock.technology.includes("no modern technology"));
  // Should include Japan-specific prohibitions
  assert(lock.prohibitions.some(p => p.includes("non-Japanese cultural elements")));
});

Deno.test("deriveWorldLock: medieval Europe era from canon_summary", () => {
  const inputs = makeDefaultInputs({
    canon_summary: "A knight's quest in the middle ages",
    genres: ["fantasy"],
  });
  const lock = deriveWorldLock(inputs);
  assertEquals(lock.era, "medieval Europe");
  assertEquals(lock.technology, "no modern technology — only medieval tools, weapons, and crafts");
});

Deno.test("deriveWorldLock: futuristic era from themes", () => {
  const inputs = makeDefaultInputs({
    themes: "cyberpunk dystopia, space colonization",
    genres: ["sci-fi"],
  });
  const lock = deriveWorldLock(inputs);
  assertEquals(lock.era, "near-future or futuristic");
  assertEquals(lock.technology, "futuristic technology consistent with the setting");
});

Deno.test("deriveWorldLock: Victorian era from world_setting", () => {
  const inputs = makeDefaultInputs({
    world_setting: "Victorian London, gaslight districts",
    genres: ["mystery"],
  });
  const lock = deriveWorldLock(inputs);
  assertEquals(lock.era, "Victorian era");
  assertEquals(lock.geography, "United Kingdom");
});

Deno.test("deriveWorldLock: contemporary default when no era cues found", () => {
  const inputs = makeDefaultInputs({
    world_setting: "A small suburban town",
    genres: ["drama"],
  });
  const lock = deriveWorldLock(inputs);
  assertEquals(lock.era, "contemporary");
  assertEquals(lock.geography, "unspecified");
  assertEquals(lock.technology, "modern technology appropriate to setting");
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. deriveWorldLock — PROHIBITION LOGIC
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deriveWorldLock: sci-fi genre suppresses space prohibition", () => {
  const inputs = makeDefaultInputs({
    genres: ["sci-fi"],
    themes: "space colonies",
  });
  const lock = deriveWorldLock(inputs);
  // Should NOT have the sci-fi prohibition since genre includes sci-fi
  assert(!lock.prohibitions.some(p => p.includes("NO sci-fi imagery")),
    "sci-fi genre should suppress the sci-fi prohibition");
});

Deno.test("deriveWorldLock: fantasy genre suppresses fantasy prohibition", () => {
  const inputs = makeDefaultInputs({
    genres: ["fantasy"],
    world_setting: "magical realm",
  });
  const lock = deriveWorldLock(inputs);
  assert(!lock.prohibitions.some(p => p.includes("NO fantasy creatures")),
    "fantasy genre should suppress the fantasy prohibition");
});

Deno.test("deriveWorldLock: romance genre suppresses romantic novel prohibition", () => {
  const inputs = makeDefaultInputs({
    genres: ["romance"],
  });
  const lock = deriveWorldLock(inputs);
  assert(!lock.prohibitions.some(p => p.includes("NO romantic novel")),
    "romance genre should suppress the romance prohibition");
});

Deno.test("deriveWorldLock: non-fantasy project gets fantasy prohibition", () => {
  const inputs = makeDefaultInputs({
    genres: ["drama"],
    world_setting: "a normal town",
  });
  const lock = deriveWorldLock(inputs);
  assert(lock.prohibitions.some(p => p.includes("NO fantasy creatures")),
    "non-fantasy project should include the fantasy prohibition");
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. deriveWorldLock — GEOGRAPHY DETECTION
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("deriveWorldLock: Korean geography from world_setting", () => {
  const inputs = makeDefaultInputs({
    world_setting: "Seoul, South Korea",
    genres: ["drama"],
  });
  const lock = deriveWorldLock(inputs);
  assertEquals(lock.geography, "Korea");
  assertEquals(lock.culture, "Korean");
});

Deno.test("deriveWorldLock: French geography from logline", () => {
  const inputs = makeDefaultInputs({
    logline: "A detective in Paris uncovers a conspiracy",
  });
  const lock = deriveWorldLock(inputs);
  assertEquals(lock.geography, "France");
  assertEquals(lock.culture, "French");
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. buildStrategyContext — GENRE VISUAL, TONE VISUAL, COMP REFERENCE
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildStrategyContext: genreVisual concatenates matching motifs", () => {
  const inputs = makeDefaultInputs({
    genres: ["drama", "thriller"],
    worldLock: makeDefaultWorldLock(),
  });
  const ctx = buildStrategyContext(inputs, { companyName: "Test Co", writerCredit: "Test Writer" });
  assertStringIncludes(ctx.genreVisual, "emotional portraiture");
  assertStringIncludes(ctx.genreVisual, "shadowy figures");
});

Deno.test("buildStrategyContext: toneVisual maps to correct entry", () => {
  const inputs = makeDefaultInputs({
    tone: "horror",
    worldLock: makeDefaultWorldLock(),
  });
  const ctx = buildStrategyContext(inputs, { companyName: "Test Co", writerCredit: "Test Writer" });
  assertEquals(ctx.toneVisual, "deep blacks, unsettling atmosphere, eerie fog, cold tones");
});

Deno.test("buildStrategyContext: compReference built from comparable_titles", () => {
  const inputs = makeDefaultInputs({
    comparable_titles: "Inception, The Matrix, Blade Runner",
    worldLock: makeDefaultWorldLock(),
  });
  const ctx = buildStrategyContext(inputs, { companyName: "Test Co", writerCredit: "Test Writer" });
  assertStringIncludes(ctx.compReference, "Inception");
  assertStringIncludes(ctx.compReference, "The Matrix");
  assertStringIncludes(ctx.compReference, "Blade Runner");
  assertStringIncludes(ctx.compReference, "Visual inspiration from posters");
});

Deno.test("buildStrategyContext: empty comparable_titles yields empty compReference", () => {
  const inputs = makeDefaultInputs({
    comparable_titles: "",
    worldLock: makeDefaultWorldLock(),
  });
  const ctx = buildStrategyContext(inputs, { companyName: "Test Co", writerCredit: "Test Writer" });
  assertEquals(ctx.compReference, "");
});

Deno.test("buildStrategyContext: unknown tone falls back to default", () => {
  const inputs = makeDefaultInputs({
    tone: "nonexistent-tone",
    worldLock: makeDefaultWorldLock(),
  });
  const ctx = buildStrategyContext(inputs, { companyName: "Test Co", writerCredit: "Test Writer" });
  assertEquals(ctx.toneVisual, "cinematic atmosphere, professional lighting");
});

Deno.test("buildStrategyContext: unknown genre yields empty string (filtered out)", () => {
  const inputs = makeDefaultInputs({
    genres: ["unknown-genre"],
    worldLock: makeDefaultWorldLock(),
  });
  const ctx = buildStrategyContext(inputs, { companyName: "Test Co", writerCredit: "Test Writer" });
  assertEquals(ctx.genreVisual, "");
});

Deno.test("buildStrategyContext: primaryGenre uses first genre, defaults to drama", () => {
  const inputs = makeDefaultInputs({
    genres: [],
    worldLock: makeDefaultWorldLock(),
  });
  const ctx = buildStrategyContext(inputs, { companyName: "Test Co", writerCredit: "Test Writer" });
  assertEquals(ctx.primaryGenre, "drama");
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. buildStrategyPrompt — PROMPT ASSEMBLY
// ══════════════════════════════════════════════════════════════════════════════

function makeStrategyCtx(overrides: Partial<StrategyContext> = {}): StrategyContext {
  return {
    title: "Test Film",
    logline: null,
    characters: "Jane Doe",
    worldSetting: "A dystopian city",
    conflict: "Survival against the system",
    themes: "Redemption, Freedom",
    primaryGenre: "drama",
    genreVisual: "emotional portraiture, dramatic lighting",
    toneVisual: "deep cinematic shadows, rich warm tones, emotional weight",
    compReference: "Visual inspiration from posters of films like Blade Runner. ",
    worldLock: makeDefaultWorldLock(),
    writerCredit: "Written by Sebastian Street",
    companyCredit: "Paradox House",
    stylePolicy: resolveImageStylePolicy("film", ["drama"]),
    ...overrides,
  };
}

Deno.test("buildStrategyPrompt: includes strategy briefing", () => {
  const ctx = makeStrategyCtx();
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[0], ctx);
  assertStringIncludes(prompt, 'Cinematic key art for "Test Film"');
  assertStringIncludes(prompt, "lead character dominates the frame");
});

Deno.test("buildStrategyPrompt: includes IMAGE STYLE POLICY block", () => {
  const ctx = makeStrategyCtx();
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[2], ctx);
  assertStringIncludes(prompt, "IMAGE STYLE POLICY (MANDATORY)");
  assertStringIncludes(prompt, "Photorealistic cinematic imagery");
  assertStringIncludes(prompt, "DO NOT render in these styles");
});

Deno.test("buildStrategyPrompt: includes CRITICAL WORLD CONSTRAINTS block", () => {
  const ctx = makeStrategyCtx();
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[1], ctx);
  assertStringIncludes(prompt, "CRITICAL WORLD CONSTRAINTS:");
  assertStringIncludes(prompt, "- Era: contemporary");
  assertStringIncludes(prompt, "- Technology:");
});

Deno.test("buildStrategyPrompt: includes ABSOLUTE PROHIBITIONS block", () => {
  const ctx = makeStrategyCtx();
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[3], ctx);
  assertStringIncludes(prompt, "ABSOLUTE PROHIBITIONS:");
  assertStringIncludes(prompt, "NO fantasy creatures");
  assertStringIncludes(prompt, "NO stock photo aesthetic");
});

Deno.test("buildStrategyPrompt: includes POSTER TEXT TREATMENT block", () => {
  const ctx = makeStrategyCtx();
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[4], ctx);
  assertStringIncludes(prompt, "POSTER TEXT TREATMENT");
  assertStringIncludes(prompt, "DO NOT invent actor names");
  assertStringIncludes(prompt, "Generate ONLY the visual key art");
});

Deno.test("buildStrategyPrompt: includes CINEMATIC POSTER COMPOSITION block", () => {
  const ctx = makeStrategyCtx();
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[5], ctx);
  assertStringIncludes(prompt, "CINEMATIC POSTER COMPOSITION (MANDATORY)");
  assertStringIncludes(prompt, "Portrait 2:3 aspect ratio");
  assertStringIncludes(prompt, 'printed 27"×40"');
  // Photorealistic mode should include ARRI Alexa reference
  assertStringIncludes(prompt, "Photorealistic 4K quality");
  assertStringIncludes(prompt, "ARRI Alexa");
});

Deno.test("buildStrategyPrompt: compReference included when present", () => {
  const ctx = makeStrategyCtx({
    compReference: "Visual inspiration from posters of films like Blade Runner. ",
  });
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[0], ctx);
  assertStringIncludes(prompt, "Visual inspiration from posters");
});

Deno.test("buildStrategyPrompt: VSAL block injected when provided", () => {
  const ctx = makeStrategyCtx();
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[0], ctx, "VSAL: Use approved visual style authority lock.");
  assertStringIncludes(prompt, "VSAL: Use approved visual style authority lock.");
});

Deno.test("buildStrategyPrompt: non-photorealistic mode uses correct composition line", () => {
  const ctx = makeStrategyCtx({
    stylePolicy: resolveImageStylePolicy("animation", ["comedy"]),
  });
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[0], ctx);
  assertStringIncludes(prompt, "High production value stylised animation rendering");
  assertStringIncludes(prompt, "Stylised animated visual language");
});

Deno.test("buildStrategyPrompt: worldLock with geography includes geography line", () => {
  const inputs = makeDefaultInputs({
    world_setting: "Edo period Japan, samurai clans",
    genres: ["action"],
  });
  const lock = deriveWorldLock(inputs);
  const ctx = makeStrategyCtx({
    worldLock: lock,
  });
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[1], ctx);
  assertStringIncludes(prompt, "- Geography: Japan");
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. toneVisuals — ALL ENTRIES PRESENT
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("constant: toneVisuals has all 12 entries defined", () => {
  const expectedKeys = ["dark", "light", "gritty", "comedic", "thriller", "dramatic", "horror", "romantic", "epic", "satirical", "whimsical", "suspenseful"];
  for (const key of expectedKeys) {
    assert(key in toneVisuals, `Missing toneVisual entry: ${key}`);
    assert(typeof toneVisuals[key] === "string" && toneVisuals[key].length > 0, `Empty toneVisual entry: ${key}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. genreMotifs — ALL ENTRIES PRESENT
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("constant: genreMotifs has all 16 entries defined", () => {
  const expectedKeys = ["drama", "thriller", "horror", "comedy", "sci-fi", "romance", "action", "crime", "mystery", "fantasy", "war", "western", "musical", "animation", "documentary", "true-crime"];
  for (const key of expectedKeys) {
    assert(key in genreMotifs, `Missing genreMotif entry: ${key}`);
    assert(typeof genreMotifs[key] === "string" && genreMotifs[key].length > 0, `Empty genreMotif entry: ${key}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. POSTER_STRATEGIES — ALL 6 STRATEGIES DEFINED
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("constant: POSTER_STRATEGIES has all 6 strategies", () => {
  assertEquals(POSTER_STRATEGIES.length, 6);
  const keys = POSTER_STRATEGIES.map(s => s.key);
  assertEquals(keys, ["character", "world", "conflict", "prestige", "commercial", "genre"]);
  const labels = POSTER_STRATEGIES.map(s => s.label);
  assertEquals(labels, ["Character Focus", "World / Environment", "Conflict / Action", "Symbolic / Prestige", "Commercial / High-Concept", "Genre Pure"]);
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. buildStrategyPrompt — WORLD / ENVIRONMENT strategy specificity
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("buildStrategyPrompt: world strategy includes silhouetted figure phrasing", () => {
  const ctx = makeStrategyCtx();
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[1], ctx);
  assertStringIncludes(prompt, "silhouetted against the landscape");
  assertStringIncludes(prompt, "sweeping vista");
});

Deno.test("buildStrategyPrompt: prestige strategy includes A24 / Cannes aesthetic", () => {
  const ctx = makeStrategyCtx({
    themes: "Redemption, Freedom",
  });
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[3], ctx);
  assertStringIncludes(prompt, "A24 / Cannes aesthetic");
  assertStringIncludes(prompt, "Themes: Redemption, Freedom");
});

Deno.test("buildStrategyPrompt: commercial strategy includes logline hook", () => {
  const ctx = makeStrategyCtx({
    logline: "In a world where AI controls everything, one hacker must break the system.",
  });
  const prompt = buildStrategyPrompt(POSTER_STRATEGIES[4], ctx);
  assertStringIncludes(prompt, "Hook:");
  assertStringIncludes(prompt, "one hacker must break the system");
});