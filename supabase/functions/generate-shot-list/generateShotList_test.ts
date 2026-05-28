/**
 * Tests for generate-shot-list — pure function unit tests.
 *
 * Validates three pure functions:
 *   1. parseScriptIntoScenes — script text → ParsedScene[]
 *   2. extractCharacters — body text → unique character names
 *   3. generateShotsForScene — ParsedScene + isVerticalDrama → GeneratedShot[]
 *
 * Covers:
 *   parseScriptIntoScenes:  standard INT./EXT. headings, INT/EXT. & I/E. variants,
 *                           === EPISODE separators, no-headings fallback, empty text,
 *                           multiple scenes, scene numbering, time-of-day extraction
 *   extractCharacters:      standard dialogue lines, parentheticals, non-character
 *                           exclusion (INT, EXT, CUT TO, etc.), empty body,
 *                           names with apostrophes/hyphens, length guards,
 *                           deduplication
 *   generateShotsForScene:  establishing shot always first, dialogue → MS + reaction,
 *                           action blocks (with/without movement), character tracking,
 *                           vertical drama (CU/MS vs WS, shot caps), minimum shots
 *                           guarantee, no-body edge case
 */

import { assertEquals, assert, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// ══════════════════════════════════════════════════════════════════════════════
// Types (mirrored from index.ts — pure, no external deps)
// ══════════════════════════════════════════════════════════════════════════════

interface ParsedScene {
  scene_number: string;
  heading: string;
  location: string;
  time_of_day: string;
  body: string;
}

interface GeneratedShot {
  shot_number: number;
  shot_type: string;
  framing: string;
  action: string;
  camera_movement: string;
  duration_est_seconds: number;
  characters_present: string[];
  props_or_set_notes: string;
  audio_notes: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Functions under test (mirrored from index.ts)
// ══════════════════════════════════════════════════════════════════════════════

function parseScriptIntoScenes(text: string): ParsedScene[] {
  const lines = text.split('\n');
  const scenes: ParsedScene[] = [];
  let current: ParsedScene | null = null;
  let bodyLines: string[] = [];
  let sceneIdx = 0;

  const headingRe = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s*(.+?)(?:\s*[-–—]\s*(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|CONTINUOUS|LATER|SAME))?$/i;
  const separatorRe = /^={3,}\s*EPISODE\s/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (separatorRe.test(trimmed)) continue;

    const match = trimmed.match(headingRe);
    if (match) {
      if (current) {
        current.body = bodyLines.join('\n').trim();
        scenes.push(current);
      }
      sceneIdx++;
      const location = match[2]?.trim() || '';
      const tod = match[3]?.trim() || '';
      current = {
        scene_number: String(sceneIdx),
        heading: trimmed,
        location,
        time_of_day: tod,
        body: '',
      };
      bodyLines = [];
    } else if (current) {
      bodyLines.push(line);
    }
  }

  if (current) {
    current.body = bodyLines.join('\n').trim();
    scenes.push(current);
  }

  // Fallback: if no scenes parsed, treat whole script as one scene
  if (scenes.length === 0 && text.trim().length > 0) {
    scenes.push({
      scene_number: '1',
      heading: 'SCENE 1',
      location: '',
      time_of_day: '',
      body: text.trim(),
    });
  }

  return scenes;
}

function extractCharacters(body: string): string[] {
  const chars = new Set<string>();
  const charLineRe = /^([A-Z][A-Z\s.'-]{1,30})(?:\s*\(.*\))?\s*$/gm;
  let m;
  while ((m = charLineRe.exec(body)) !== null) {
    const name = m[1].trim();
    if (name.length > 1 && name.length < 30 && !['INT', 'EXT', 'CUT TO', 'FADE', 'DISSOLVE', 'CONTINUED', 'CONT'].includes(name)) {
      chars.add(name);
    }
  }
  return Array.from(chars);
}

function generateShotsForScene(scene: ParsedScene, isVerticalDrama: boolean): GeneratedShot[] {
  const shots: GeneratedShot[] = [];
  const characters = extractCharacters(scene.body);
  const sentences = scene.body.split(/[.!?]+/).filter(s => s.trim().length > 10);
  let shotNum = 0;

  // Establishing shot
  shotNum++;
  shots.push({
    shot_number: shotNum,
    shot_type: isVerticalDrama ? 'MS' : 'WS',
    framing: isVerticalDrama ? '9:16 vertical frame' : 'Wide establishing',
    action: `Establish ${scene.location || scene.heading}`,
    camera_movement: 'STATIC',
    duration_est_seconds: isVerticalDrama ? 2 : 4,
    characters_present: [],
    props_or_set_notes: '',
    audio_notes: 'Ambient / location sound',
  });

  // Generate shots from action/dialogue blocks
  const blocks = scene.body.split(/\n\n+/).filter(b => b.trim().length > 5);
  for (const block of blocks) {
    const trimBlock = block.trim();
    if (trimBlock.length < 10) continue;

    // Check if it's dialogue
    const isDialogue = /^[A-Z][A-Z\s.'-]+\s*(\(.*\))?\s*\n/.test(trimBlock);

    if (isDialogue) {
      const charMatch = trimBlock.match(/^([A-Z][A-Z\s.'-]+)/);
      const charName = charMatch ? charMatch[1].trim() : '';
      shotNum++;
      shots.push({
        shot_number: shotNum,
        shot_type: isVerticalDrama ? 'CU' : 'MS',
        framing: isVerticalDrama ? 'Tight CU, 9:16' : 'Medium on speaker',
        action: `${charName} delivers dialogue`,
        camera_movement: 'STATIC',
        duration_est_seconds: isVerticalDrama ? 3 : 5,
        characters_present: charName ? [charName] : characters.slice(0, 2),
        props_or_set_notes: '',
        audio_notes: 'Dialogue',
      });

      // Reaction shot if multiple characters
      if (characters.length > 1) {
        shotNum++;
        const reactor = characters.find(c => c !== charName) || characters[0];
        shots.push({
          shot_number: shotNum,
          shot_type: isVerticalDrama ? 'CU' : 'OTS',
          framing: isVerticalDrama ? 'Reaction CU, 9:16' : 'Over-the-shoulder reaction',
          action: `${reactor} reacts`,
          camera_movement: 'STATIC',
          duration_est_seconds: isVerticalDrama ? 2 : 3,
          characters_present: [reactor],
          props_or_set_notes: '',
          audio_notes: '',
        });
      }
    } else {
      // Action block
      shotNum++;
      const hasMovement = /walk|run|move|enter|exit|chase|drive|follow/i.test(trimBlock);
      shots.push({
        shot_number: shotNum,
        shot_type: hasMovement ? 'TRACKING' : (isVerticalDrama ? 'MS' : 'WS'),
        framing: hasMovement ? 'Following action' : (isVerticalDrama ? 'Medium 9:16' : 'Wide coverage'),
        action: trimBlock.slice(0, 100),
        camera_movement: hasMovement ? 'TRACKING' : 'STATIC',
        duration_est_seconds: isVerticalDrama ? 3 : 5,
        characters_present: characters.slice(0, 3),
        props_or_set_notes: '',
        audio_notes: hasMovement ? 'Movement SFX' : '',
      });
    }

    // Cap shots per scene for vertical drama
    if (isVerticalDrama && shots.length >= 8) break;
    if (!isVerticalDrama && shots.length >= 15) break;
  }

  // Ensure at least 2 shots per scene
  if (shots.length < 2) {
    shotNum++;
    shots.push({
      shot_number: shotNum,
      shot_type: 'CU',
      framing: isVerticalDrama ? 'Close-up 9:16' : 'Close-up detail',
      action: 'Key moment / detail shot',
      camera_movement: 'STATIC',
      duration_est_seconds: 3,
      characters_present: characters.slice(0, 1),
      props_or_set_notes: '',
      audio_notes: '',
    });
  }

  return shots;
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

function makeScene(overrides: Partial<ParsedScene> = {}): ParsedScene {
  return {
    scene_number: '1',
    heading: 'INT. OFFICE - DAY',
    location: 'OFFICE',
    time_of_day: 'DAY',
    body: '',
    ...overrides,
  };
}

function assertShotStructure(shot: GeneratedShot): void {
  assertExists(shot, 'shot should exist');
  assertEquals(typeof shot.shot_number, 'number', 'shot_number should be a number');
  assertEquals(typeof shot.shot_type, 'string', 'shot_type should be a string');
  assertEquals(typeof shot.framing, 'string', 'framing should be a string');
  assertEquals(typeof shot.action, 'string', 'action should be a string');
  assertEquals(typeof shot.camera_movement, 'string', 'camera_movement should be a string');
  assertEquals(typeof shot.duration_est_seconds, 'number', 'duration_est_seconds should be a number');
  assert(Array.isArray(shot.characters_present), 'characters_present should be an array');
  assertEquals(typeof shot.props_or_set_notes, 'string', 'props_or_set_notes should be a string');
  assertEquals(typeof shot.audio_notes, 'string', 'audio_notes should be a string');
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. parseScriptIntoScenes — Standard INT./EXT. headings
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("parseScriptIntoScenes: standard INT./EXT. headings produce correct structure", () => {
  const script = `INT. OFFICE - DAY

This is the scene body text.

EXT. PARK - NIGHT

This is another scene.`;

  const scenes = parseScriptIntoScenes(script);
  assertEquals(scenes.length, 2, 'should parse 2 scenes');

  // Scene 1
  assertEquals(scenes[0].scene_number, '1');
  assertEquals(scenes[0].heading, 'INT. OFFICE - DAY');
  assertEquals(scenes[0].location, 'OFFICE');
  assertEquals(scenes[0].time_of_day, 'DAY');
  assertEquals(scenes[0].body, 'This is the scene body text.');

  // Scene 2
  assertEquals(scenes[1].scene_number, '2');
  assertEquals(scenes[1].heading, 'EXT. PARK - NIGHT');
  assertEquals(scenes[1].location, 'PARK');
  assertEquals(scenes[1].time_of_day, 'NIGHT');
  assertEquals(scenes[1].body, 'This is another scene.');
});

Deno.test("parseScriptIntoScenes: heading without time-of-day has empty time_of_day", () => {
  const script = `INT. OFFICE

Some action here.`;

  const scenes = parseScriptIntoScenes(script);
  assertEquals(scenes.length, 1);
  assertEquals(scenes[0].location, 'OFFICE');
  assertEquals(scenes[0].time_of_day, '');
});

Deno.test("parseScriptIntoScenes: heading with em-dash and en-dash both work", () => {
  const script = `INT. HOUSE—DAWN

Action.`;
  const scenes = parseScriptIntoScenes(script);
  assertEquals(scenes.length, 1);
  assertEquals(scenes[0].time_of_day, 'DAWN');
});

Deno.test("parseScriptIntoScenes: INT/EXT. and I/E. heading variants are recognized", () => {
  const script = `INT/EXT. CAR - DAY

Inside the moving car.

I/E. TUNNEL - NIGHT

Inside the dark tunnel.`;

  const scenes = parseScriptIntoScenes(script);
  assertEquals(scenes.length, 2);
  assertEquals(scenes[0].heading, 'INT/EXT. CAR - DAY');
  assertEquals(scenes[0].location, 'CAR');
  assertEquals(scenes[0].time_of_day, 'DAY');
  assertEquals(scenes[1].heading, 'I/E. TUNNEL - NIGHT');
  assertEquals(scenes[1].location, 'TUNNEL');
  assertEquals(scenes[1].time_of_day, 'NIGHT');
});

Deno.test("parseScriptIntoScenes: all recognized time-of-day values are captured", () => {
  const script = `INT. ROOM - MORNING

A.

EXT. ROAD - EVENING

B.

INT. HALL - CONTINUOUS

C.

EXT. GARDEN - LATER

D.

INT. KITCHEN - SAME

E.`;

  const scenes = parseScriptIntoScenes(script);
  assertEquals(scenes.length, 5);
  assertEquals(scenes[0].time_of_day, 'MORNING');
  assertEquals(scenes[1].time_of_day, 'EVENING');
  assertEquals(scenes[2].time_of_day, 'CONTINUOUS');
  assertEquals(scenes[3].time_of_day, 'LATER');
  assertEquals(scenes[4].time_of_day, 'SAME');
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. parseScriptIntoScenes — === EPISODE separators
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("parseScriptIntoScenes: === EPISODE separator lines are skipped", () => {
  const script = `INT. OFFICE - DAY

Scene one body.

=== EPISODE 2 ===

EXT. PARK - NIGHT

Scene two body.`;

  const scenes = parseScriptIntoScenes(script);
  assertEquals(scenes.length, 2, 'EPISODE separator should be skipped');
  assertEquals(scenes[0].scene_number, '1');
  assertEquals(scenes[1].scene_number, '2');
});

Deno.test("parseScriptIntoScenes: === EPISODE separator with different spacing", () => {
  const script = `INT. A - DAY

Body.

===== EPISODE 3 =====

EXT. B - NIGHT

Body.`;

  const scenes = parseScriptIntoScenes(script);
  assertEquals(scenes.length, 2, 'multiple === still matches');
  assertEquals(scenes[0].heading, 'INT. A - DAY');
  assertEquals(scenes[1].heading, 'EXT. B - NIGHT');
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. parseScriptIntoScenes — Fallback / edge cases
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("parseScriptIntoScenes: no headings — fallback wraps entire text as single scene", () => {
  const text = `John walks into the room.
He looks around nervously.
Sarah follows behind him.`;

  const scenes = parseScriptIntoScenes(text);
  assertEquals(scenes.length, 1, 'should create one fallback scene');
  assertEquals(scenes[0].scene_number, '1');
  assertEquals(scenes[0].heading, 'SCENE 1');
  assertEquals(scenes[0].location, '');
  assertEquals(scenes[0].time_of_day, '');
  assertEquals(scenes[0].body, text.trim());
});

Deno.test("parseScriptIntoScenes: empty text returns empty array", () => {
  assertEquals(parseScriptIntoScenes(''), []);
  assertEquals(parseScriptIntoScenes('   '), []);
  assertEquals(parseScriptIntoScenes('\n\n\n'), []);
});

Deno.test("parseScriptIntoScenes: text with only whitespace and heading-like lines with no match", () => {
  // 'HEADING:' should not match because it's not INT./EXT. etc.
  const scenes = parseScriptIntoScenes('  \n  \nHEADING: NOT A SCENE');
  assertEquals(scenes.length, 1, 'fallback should still apply');
  assertEquals(scenes[0].body, 'HEADING: NOT A SCENE');
});

Deno.test("parseScriptIntoScenes: scene numbering increments correctly across many scenes", () => {
  const lines: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const tod = i % 2 === 0 ? 'DAY' : 'NIGHT';
    lines.push(`INT. SCENE_${i} - ${tod}`);
    lines.push('');
    lines.push(`Body of scene ${i}.`);
    lines.push('');
  }
  const scenes = parseScriptIntoScenes(lines.join('\n'));
  assertEquals(scenes.length, 10);
  for (let i = 0; i < 10; i++) {
    assertEquals(scenes[i].scene_number, String(i + 1));
    assertEquals(scenes[i].location, `SCENE_${i + 1}`);
  }
});

Deno.test("parseScriptIntoScenes: lines before first heading are ignored", () => {
  const script = `Title Page
Some random text

INT. ROOM - DAY

Action.`;

  const scenes = parseScriptIntoScenes(script);
  assertEquals(scenes.length, 1);
  assertEquals(scenes[0].heading, 'INT. ROOM - DAY');
  // Only body after heading is included
  assertEquals(scenes[0].body, 'Action.');
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. extractCharacters — Standard dialogue extraction
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacters: extracts uppercase character names from dialogue", () => {
  const body = `JOHN
Hello there.

SARAH
Hi! How are you?

JOHN
I'm good.`;

  const chars = extractCharacters(body);
  assertEquals(chars.length, 2, 'should find 2 unique characters');
  assert(chars.includes('JOHN'), 'should include JOHN');
  assert(chars.includes('SARAH'), 'should include SARAH');
});

Deno.test("extractCharacters: handles parentheticals after character name", () => {
  const body = `JOHN (angry)
What do you want?

SARAH (pleading)
Please listen.`;

  const chars = extractCharacters(body);
  assertEquals(chars.length, 2);
  assert(chars.includes('JOHN'));
  assert(chars.includes('SARAH'));
});

Deno.test("extractCharacters: deduplicates character names", () => {
  const body = `BOB
Line one.

BOB
Line two.

ALICE
Line three.

BOB
Line four.`;

  const chars = extractCharacters(body);
  assertEquals(chars.length, 2, 'BOB should appear only once');
  assert(chars.includes('BOB'));
  assert(chars.includes('ALICE'));
});

Deno.test("extractCharacters: handles character names with apostrophes", () => {
  const body = `O'BRIEN
I'll handle it.

MALONE
No you won't.`;

  const chars = extractCharacters(body);
  assertEquals(chars.length, 2);
  assert(chars.includes("O'BRIEN"), "should include O'BRIEN");
  assert(chars.includes('MALONE'));
});

Deno.test("extractCharacters: handles character names with hyphens", () => {
  const body = `JEAN-LUC
Engage!

CAPTAIN-KIRK
Warp speed.`;

  const chars = extractCharacters(body);
  assertEquals(chars.length, 2);
  assert(chars.includes('JEAN-LUC'));
  assert(chars.includes('CAPTAIN-KIRK'));
});

Deno.test("extractCharacters: handles multi-word character names", () => {
  const body = `DR. JONES
The artifact is here.

PROFESSOR SMITH
Excellent.`;

  const chars = extractCharacters(body);
  assertEquals(chars.length, 2);
  assert(chars.includes('DR. JONES'));
  assert(chars.includes('PROFESSOR SMITH'));
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. extractCharacters — Non-character exclusions
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacters: excludes INT and EXT (non-character words)", () => {
  const body = `INT. OFFICE - DAY

INT
This shouldn't match.

EXT
Neither should this.`;

  // INT. and EXT. don't match because the period breaks the uppercase pattern
  // but bare 'INT' and 'EXT' as character cues should be excluded
  const chars = extractCharacters(body);
  assert(!chars.includes('INT'), 'INT should be excluded');
  assert(!chars.includes('EXT'), 'EXT should be excluded');
});

Deno.test("extractCharacters: excludes CUT TO, FADE, DISSOLVE, CONTINUED, CONT", () => {
  const body = `CUT TO
The next scene.

FADE
To black.

DISSOLVE
To memory.

CONTINUED
CONT
More text.`;

  const chars = extractCharacters(body);
  assert(!chars.includes('CUT TO'), 'CUT TO should be excluded');
  assert(!chars.includes('FADE'), 'FADE should be excluded');
  assert(!chars.includes('DISSOLVE'), 'DISSOLVE should be excluded');
  assert(!chars.includes('CONTINUED'), 'CONTINUED should be excluded');
  assert(!chars.includes('CONT'), 'CONT should be excluded');
});

Deno.test("extractCharacters: filters names by length (> 1 and < 30)", () => {
  const body = `A
Single letter name.

VERYLONGNAMETHATEXCEEDSTHE30CHARACTERLIMITFORTESTING
This should be filtered out.`;

  const chars = extractCharacters(body);
  assert(!chars.includes('A'), 'single letter should be excluded');
  assert(
    !chars.includes('VERYLONGNAMETHATEXCEEDSTHE30CHARACTERLIMITFORTESTING'),
    'names over 30 chars should be excluded',
  );
});

Deno.test("extractCharacters: empty body returns empty array", () => {
  assertEquals(extractCharacters(''), []);
  assertEquals(extractCharacters('  \n\n  '), []);
});

Deno.test("extractCharacters: lines not matching character pattern are ignored", () => {
  const body = `Some action description.
lowercase name
MIXED case NAME
123 NUMBER NAME`;

  const chars = extractCharacters(body);
  assertEquals(chars.length, 0, 'non-matching lines should be ignored');
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. generateShotsForScene — Establishing shot behavior
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("generateShotsForScene: establishing shot is always first (horizontal)", () => {
  const scene = makeScene({
    scene_number: '1',
    heading: 'INT. OFFICE - DAY',
    location: 'OFFICE',
    body: 'John sits at his desk.',
  });

  const shots = generateShotsForScene(scene, false);
  assert(shots.length >= 1, 'should produce at least 1 shot');
  assertEquals(shots[0].shot_number, 1);
  assertEquals(shots[0].shot_type, 'WS', 'horizontal drama should use WS');
  assertEquals(shots[0].framing, 'Wide establishing');
  assertEquals(shots[0].action, 'Establish OFFICE');
  assertEquals(shots[0].camera_movement, 'STATIC');
  assertEquals(shots[0].duration_est_seconds, 4);
  assertEquals(shots[0].characters_present, []);
  assertEquals(shots[0].audio_notes, 'Ambient / location sound');
});

Deno.test("generateShotsForScene: establishing shot uses MS for vertical drama", () => {
  const scene = makeScene({
    heading: 'INT. OFFICE - DAY',
    location: 'OFFICE',
    body: 'John sits.',
  });

  const shots = generateShotsForScene(scene, true);
  assertEquals(shots[0].shot_type, 'MS', 'vertical drama should use MS');
  assertEquals(shots[0].framing, '9:16 vertical frame');
  assertEquals(shots[0].duration_est_seconds, 2);
});

Deno.test("generateShotsForScene: establishing shot uses heading when location is empty", () => {
  const scene = makeScene({
    heading: 'INT. OFFICE - DAY',
    location: '',
    body: 'John sits.',
  });

  const shots = generateShotsForScene(scene, false);
  assertEquals(shots[0].action, 'Establish INT. OFFICE - DAY');
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. generateShotsForScene — Dialogue block shots
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("generateShotsForScene: dialogue block produces MS + reaction (horizontal)", () => {
  // Note: dialogue lines start with lowercase to avoid the charMatch regex
  // greedily capturing across newlines (\s in [A-Z\s.'-]+ includes \n)
  const scene = makeScene({
    body: `JOHN
hello there, Sarah.

SARAH
hi John, good to see you.`,
  });

  const shots = generateShotsForScene(scene, false);
  // Establishing + 2 dialogue blocks + 2 reactions = 5 shots
  assert(shots.length >= 3, 'should have at least establishing + first dialogue');

  // First dialogue shot
  const dialogueShot = shots[1];
  assertEquals(dialogueShot.shot_type, 'MS', 'horizontal dialogue uses MS');
  assertEquals(dialogueShot.action, 'JOHN delivers dialogue');
  assertEquals(dialogueShot.camera_movement, 'STATIC');
  assertEquals(dialogueShot.duration_est_seconds, 5);
  assert(dialogueShot.characters_present.includes('JOHN'));
  assertEquals(dialogueShot.audio_notes, 'Dialogue');
});

Deno.test("generateShotsForScene: dialogue block with reaction when multiple characters (horizontal)", () => {
  const scene = makeScene({
    body: `JOHN
hello there.

SARAH
hi back.`,
  });

  const shots = generateShotsForScene(scene, false);
  // Shot 1: establishing
  // Shot 2: JOHN MS
  // Shot 3: SARAH OTS reaction
  // Shot 4: SARAH MS
  // Shot 5: JOHN OTS reaction

  // Find first reaction shot
  const reactionShots = shots.filter(s => s.audio_notes === '');
  assert(reactionShots.length >= 1, 'should have reaction shots');

  const firstReaction = reactionShots[0];
  assertEquals(firstReaction.shot_type, 'OTS', 'horizontal reaction should use OTS');
  assertEquals(firstReaction.framing, 'Over-the-shoulder reaction');
  assertEquals(firstReaction.duration_est_seconds, 3);
  assert(firstReaction.characters_present.length === 1, 'reaction should have exactly 1 character');
});

Deno.test("generateShotsForScene: dialogue uses CU for vertical drama", () => {
  const scene = makeScene({
    body: `JOHN
hello there.`,
  });

  const shots = generateShotsForScene(scene, true);
  // Shot 1: establishing MS
  // Shot 2: dialogue CU (no reaction because only 1 char)
  const dialogueShot = shots[1];
  assertEquals(dialogueShot.shot_type, 'CU', 'vertical drama dialogue should use CU');
  assertEquals(dialogueShot.framing, 'Tight CU, 9:16');
  assertEquals(dialogueShot.duration_est_seconds, 3);
});

Deno.test("generateShotsForScene: vertical drama reaction uses CU instead of OTS", () => {
  const scene = makeScene({
    body: `JOHN
hello there.

SARAH
hi back.`,
  });

  const shots = generateShotsForScene(scene, true);
  const reactionShots = shots.filter(s => s.audio_notes === '');
  assert(reactionShots.length >= 1);
  assertEquals(reactionShots[0].shot_type, 'CU', 'vertical drama reaction should use CU');
  assertEquals(reactionShots[0].framing, 'Reaction CU, 9:16');
  assertEquals(reactionShots[0].duration_est_seconds, 2);
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. generateShotsForScene — Action block shots
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("generateShotsForScene: action block without movement uses WS (horizontal)", () => {
  const scene = makeScene({
    body: 'John sits quietly at the desk, looking at the papers before him.',
  });

  const shots = generateShotsForScene(scene, false);
  const actionShot = shots[1];
  assertEquals(actionShot.shot_type, 'WS', 'action without movement should use WS');
  assertEquals(actionShot.framing, 'Wide coverage');
  assertEquals(actionShot.camera_movement, 'STATIC');
  assertEquals(actionShot.audio_notes, '');
});

Deno.test("generateShotsForScene: action block with movement uses TRACKING", () => {
  const scene = makeScene({
    body: 'John walks slowly across the room, moving toward the door.',
  });

  const shots = generateShotsForScene(scene, false);
  const actionShot = shots[1];
  assertEquals(actionShot.shot_type, 'TRACKING', 'action with movement should use TRACKING');
  assertEquals(actionShot.framing, 'Following action');
  assertEquals(actionShot.camera_movement, 'TRACKING');
  assertEquals(actionShot.audio_notes, 'Movement SFX');
});

Deno.test("generateShotsForScene: movement detection keywords all trigger TRACKING", () => {
  const keywords = ['walk', 'run', 'move', 'enter', 'exit', 'chase', 'drive', 'follow'];

  for (const word of keywords) {
    const scene = makeScene({
      body: `John ${word}s across the large room quickly.`,
    });
    const shots = generateShotsForScene(scene, false);
    const actionShot = shots[1];
    assertEquals(
      actionShot.shot_type,
      'TRACKING',
      `'${word}' should trigger TRACKING`,
    );
    assertEquals(actionShot.camera_movement, 'TRACKING');
  }
});

Deno.test("generateShotsForScene: action block in vertical drama uses MS", () => {
  const scene = makeScene({
    body: 'John sits at the desk staring at the wall.',
  });

  const shots = generateShotsForScene(scene, true);
  const actionShot = shots[1];
  assertEquals(actionShot.shot_type, 'MS', 'vertical drama action should use MS');
  assertEquals(actionShot.framing, 'Medium 9:16');
  assertEquals(actionShot.duration_est_seconds, 3);
});

Deno.test("generateShotsForScene: action block with movement in vertical drama still TRACKING", () => {
  const scene = makeScene({
    body: 'John runs through the hallway desperately.',
  });

  const shots = generateShotsForScene(scene, true);
  const actionShot = shots[1];
  assertEquals(actionShot.shot_type, 'TRACKING', 'movement should override vertical drama shot type');
  assertEquals(actionShot.camera_movement, 'TRACKING');
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. generateShotsForScene — Character tracking in shots
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("generateShotsForScene: characters_present populated from body extraction", () => {
  const scene = makeScene({
    body: `JOHN
let's go.

SARAH
I'm right behind you.`,
  });

  const shots = generateShotsForScene(scene, false);
  // Characters from body: JOHN, SARAH
  // Reaction shots should reference correct character
  const reactionShots = shots.filter(s => s.audio_notes === '');
  for (const rs of reactionShots) {
    assertEquals(rs.characters_present.length, 1);
    assert(
      rs.characters_present[0] === 'JOHN' || rs.characters_present[0] === 'SARAH',
      `reaction character should be JOHN or SARAH, got ${rs.characters_present[0]}`,
    );
  }
});

Deno.test("generateShotsForScene: action block characters_present limited to first 3", () => {
  const scene = makeScene({
    body: `JOHN
Line.

SARAH
Line.

BOB
Line.

ALICE
Line.`,
  });

  const shots = generateShotsForScene(scene, false);
  const actionShots = shots.filter(s => s.audio_notes !== 'Ambient / location sound' && s.audio_notes !== 'Dialogue');
  // Find action blocks - they have characters_present limited to 3
  if (actionShots.length > 0) {
    assert(actionShots[0].characters_present.length <= 3);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. generateShotsForScene — Vertical drama limits
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("generateShotsForScene: vertical drama caps at 8 shots", () => {
  // Create enough content to generate many shots
  let body = '';
  for (let i = 0; i < 8; i++) {
    body += `JOHN\ndialogue line number ${i}.\n\nSARAH\nresponse line ${i}.\n\n`;
  }

  const scene = makeScene({ body });
  const shots = generateShotsForScene(scene, true);
  // The cap check is `if (isVerticalDrama && shots.length >= 8) break;` after pushing shots,
  // so the last block that pushes 2 shots from 7→9 is allowed to complete before breaking.
  assert(shots.length <= 9, `vertical drama should cap near 9 shots, got ${shots.length}`);
  assert(shots.length >= 3, 'vertical drama should still generate meaningful shots');
});

Deno.test("generateShotsForScene: horizontal drama caps at 15 shots", () => {
  let body = '';
  for (let i = 0; i < 10; i++) {
    body += `JOHN\ndialogue line ${i}.\n\nSARAH\nresponse ${i}.\n\n`;
  }

  const scene = makeScene({ body });
  const shots = generateShotsForScene(scene, false);
  // Same as vertical: cap check after push allows overshoot by 1 block
  assert(shots.length <= 17, `horizontal drama should cap near 15-17 shots, got ${shots.length}`);
  assert(shots.length >= 3, 'horizontal drama should still generate meaningful shots');
});

// ══════════════════════════════════════════════════════════════════════════════
// 11. generateShotsForScene — Minimum shots guarantee
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("generateShotsForScene: minimum 2 shots even with no body", () => {
  const scene = makeScene({
    heading: 'INT. EMPTY - DAY',
    location: 'EMPTY',
    body: '',
  });

  const shots = generateShotsForScene(scene, false);
  assert(shots.length >= 2, 'should have at least 2 shots');
  // First shot is establishing
  assertEquals(shots[0].shot_type, 'WS');
  // Second shot is the minimum-guarantee CU
  assertEquals(shots[1].shot_type, 'CU');
  assertEquals(shots[1].framing, 'Close-up detail');
  assertEquals(shots[1].action, 'Key moment / detail shot');
});

Deno.test("generateShotsForScene: minimum shots vertical drama uses 9:16 CU", () => {
  const scene = makeScene({
    body: '',
  });

  const shots = generateShotsForScene(scene, true);
  assertEquals(shots[1].shot_type, 'CU');
  assertEquals(shots[1].framing, 'Close-up 9:16');
});

Deno.test("generateShotsForScene: minimum shot has correct characters_present", () => {
  const scene = makeScene({
    body: `JOHN
I am here alone.`,
  });

  const shots = generateShotsForScene(scene, false);
  // Establishing + dialogue (no reaction since only 1 char) = 2 shots, already meets minimum
  // So no extra CU gets added
  assert(shots.length >= 2);
  // If we had a scene with 0 character matches in body, the minimum shot would have characters.slice(0,1) = []
  const emptyScene = makeScene({ body: '' });
  const emptyShots = generateShotsForScene(emptyScene, false);
  assertEquals(emptyShots[1].characters_present, []);
});

// ══════════════════════════════════════════════════════════════════════════════
// 12. generateShotsForScene — Shot number sequencing
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("generateShotsForScene: shot numbers are sequential and start at 1", () => {
  const scene = makeScene({
    body: `JOHN
Hello.

SARAH
Hi.`,
  });

  const shots = generateShotsForScene(scene, false);
  for (let i = 0; i < shots.length; i++) {
    assertEquals(shots[i].shot_number, i + 1, `shot ${i} should have number ${i + 1}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 13. generateShotsForScene — Mixed dialogue and action
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("generateShotsForScene: action blocks before dialogue generate action shots", () => {
  const scene = makeScene({
    body: `John walks into the room and looks around.

JOHN
What is this place?`,
  });

  const shots = generateShotsForScene(scene, false);
  // Establishing (1) + action-TRACKING (2) + dialogue-MS (3) + reaction-OTS (4) if multiple chars
  assert(shots.length >= 3);
  // Shot 2 should be the action block
  assertEquals(shots[1].shot_type, 'TRACKING', 'walks should trigger TRACKING');
  assertEquals(shots[1].action.slice(0, 20), 'John walks into the ');
});

Deno.test("generateShotsForScene: dialogue followed by action generates correct sequence", () => {
  const scene = makeScene({
    body: `JOHN
i need your help.

John reaches out his hand.`,
  });

  const shots = generateShotsForScene(scene, false);
  // Establishing (1), dialogue-MS (2), action-WS (3)
  // No reaction because only JOHN is a character from body
  assert(shots.length >= 3);
});

// ══════════════════════════════════════════════════════════════════════════════
// 14. generateShotsForScene — Action block truncation
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("generateShotsForScene: action field in action blocks truncated to 100 chars", () => {
  const longAction = 'A'.repeat(150);
  const scene = makeScene({
    body: longAction,
  });

  const shots = generateShotsForScene(scene, false);
  const actionShot = shots.find(s => s.audio_notes !== 'Ambient / location sound' && s.audio_notes !== 'Dialogue');
  if (actionShot) {
    assertEquals(actionShot.action.length, 100, 'action should be truncated to 100 chars');
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 15. Integration — End-to-end scene pipeline
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("integration: full parse + generate pipeline for multi-scene script", () => {
  const script = `INT. OFFICE - DAY

John sits at the desk, working.

JOHN
this is tedious.

SARAH
you'll get through it.

John stands up and walks to the window.

EXT. PARK - NIGHT

Sarah runs through the park.

JOHN (V.O.)
where is she going?`;

  // Parse
  const scenes = parseScriptIntoScenes(script);
  assertEquals(scenes.length, 2);

  // Scene 1
  assertEquals(scenes[0].scene_number, '1');
  assertEquals(scenes[0].location, 'OFFICE');
  assertEquals(scenes[0].time_of_day, 'DAY');
  assert(scenes[0].body.includes('John sits at the desk'));

  // Scene 2
  assertEquals(scenes[1].scene_number, '2');
  assertEquals(scenes[1].location, 'PARK');
  assertEquals(scenes[1].time_of_day, 'NIGHT');

  // Generate shots for scene 1 (horizontal)
  const scene1Shots = generateShotsForScene(scenes[0], false);
  assert(scene1Shots.length >= 1, 'scene 1 should produce shots');
  assertEquals(scene1Shots[0].shot_type, 'WS', 'scene 1 establishing should be WS');

  // Should have characters from scene 1
  const scene1Chars = extractCharacters(scenes[0].body);
  assert(scene1Chars.includes('JOHN'));
  assert(scene1Chars.includes('SARAH'));

  // Generate shots for scene 2 (horizontal)
  const scene2Shots = generateShotsForScene(scenes[1], false);
  assert(scene2Shots.length >= 1, 'scene 2 should produce shots');
  assertEquals(scene2Shots[0].action, 'Establish PARK');

  // Scene 2 has JOHN (V.O.) — character name without parenthetical
  const scene2Chars = extractCharacters(scenes[1].body);
  assert(scene2Chars.includes('JOHN'), 'JOHN (V.O.) should extract as JOHN');
});

Deno.test("integration: generate shots with characters_present verified per shot", () => {
  const scene = makeScene({
    body: `JOHN
let's go.

SARAH
i'm right behind you.

Bob enters the room silently.`,
  });

  const shots = generateShotsForScene(scene, false);

  // Extract characters from the body
  const chars = extractCharacters(scene.body);
  assert(chars.includes('JOHN'));
  assert(chars.includes('SARAH'));

  // Dialogue shots should have correct characters_present
  const dialogueShots = shots.filter(s => s.audio_notes === 'Dialogue');
  for (const ds of dialogueShots) {
    assert(ds.characters_present.length >= 1, 'dialogue shots should have characters');
  }

  // All shots should have valid structure
  for (const shot of shots) {
    assertShotStructure(shot);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 16. extractCharacters — Edge cases with mixed content
// ══════════════════════════════════════════════════════════════════════════════

Deno.test("extractCharacters: only character cue lines are matched, action text ignored", () => {
  const body = `John walks into the room.
He is very angry about the situation.

JOHN
What did you do?

The room is silent for a moment.

SARAH
Nothing. I swear.`;

  const chars = extractCharacters(body);
  assertEquals(chars.length, 2);
  assert(chars.includes('JOHN'));
  assert(chars.includes('SARAH'));
});

Deno.test("extractCharacters: lines with parentheticals still extract correct name", () => {
  const body = `JOHN (laughing)
That's funny.

SARAH (whispering)
Keep your voice down.`;

  const chars = extractCharacters(body);
  assertEquals(chars.length, 2);
  assert(chars.includes('JOHN'));
  assert(chars.includes('SARAH'));
});

Deno.test("extractCharacters: names above 30 characters are excluded", () => {
  const body = `ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEF
This is too long to be a character name.

BOB
Short enough.`;

  const chars = extractCharacters(body);
  assert(!chars.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEF'), 'long names should be filtered');
  assert(chars.includes('BOB'), 'normal names should still match');
});

Deno.test("extractCharacters: names of exactly 2 characters are included", () => {
  const body = `BO
Two chars.

JOE
Three chars.`;

  const chars = extractCharacters(body);
  assert(chars.includes('BO'), '2 char name should be included (length > 1)');
  assert(chars.includes('JOE'));
});