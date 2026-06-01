/**
 * Comprehensive edge case tests for screenplayParser.ts
 * Run: deno test --no-check --allow-import test_screenplay_parser.ts
 */
import { parseScreenplay } from './_shared/screenplayParser.ts';
import { assertEquals, assert } from 'jsr:@std/assert';

Deno.test("Standard screenplay with multiple scenes", () => {
  const script = `INT. HOUSE - DAY\n\nJohn sits at a table.\n\nJOHN\nHello.\n\nMARY\nHi.\n\nEXT. FIELD - NIGHT\n\nIt's dark.\n\nMARY\nLet's go.`;
  const result = parseScreenplay(script);
  assertEquals(result.metadata.scene_count, 2);
  assertEquals(result.scenes[0].slugline.includes('INT.'), true);
  assertEquals(result.scenes[0].location_raw, 'HOUSE');
  assertEquals(result.scenes[0].time_of_day, 'DAY');
  assertEquals(result.scenes[0].characters_present.includes('JOHN'), true);
  assertEquals(result.scenes[0].characters_present.includes('MARY'), true);
  assertEquals(result.scenes[1].location_raw, 'FIELD');
  assertEquals(result.scenes[1].time_of_day, 'NIGHT');
  assertEquals(result.scenes[0].dialogue_blocks.length, 2);
});

Deno.test("COLD OPEN and TEASER headings", () => {
  const script = `COLD OPEN\n\nA phone rings.\n\nMAN\nHello?\n\nINT. OFFICE - DAY\n\nNormal scene.\n\nTEASER\n\nSomething happens.`;
  const result = parseScreenplay(script);
  assert(result.scenes.length >= 3, `Should detect COLD OPEN + INT. + TEASER, got ${result.scenes.length}`);
  assert(result.scenes[0].slugline.includes('COLD OPEN'), 'First scene should be COLD OPEN');
  assertEquals(result.scenes[0].interior_exterior, '');
});

Deno.test("Orphaned scene numbers", () => {
  const script = `1\nINT. HOUSE - DAY\n\nAction.\n\n2\nEXT. FIELD - NIGHT\n\nMore action.`;
  const result = parseScreenplay(script);
  assertEquals(result.metadata.scene_count, 2);
  assertEquals(result.scenes[0].location_raw, 'HOUSE');
  assertEquals(result.scenes[1].location_raw, 'FIELD');
});

Deno.test("Embedded numbers: 1 1 EXT.", () => {
  const script = `1 1 EXT. BEACH - DAY\n\nWaves crash.\n\n2 2 INT. CAR - NIGHT\n\nEngine hums.`;
  const result = parseScreenplay(script);
  assertEquals(result.metadata.scene_count, 2);
  assertEquals(result.scenes[0].location_raw, 'BEACH');
  assertEquals(result.scenes[1].location_raw, 'CAR');
});

Deno.test("Bare INT.MOUNTAIN (no space)", () => {
  const script = `INT.MOUNTAIN - DAY\n\nA vista.\n\nEXT.HOUSE\n\nA building.`;
  const result = parseScreenplay(script);
  assert(result.metadata.scene_count >= 2, `Should detect bare sluglines, got ${result.metadata.scene_count}`);
  assertEquals(result.scenes[0].interior_exterior, 'INT');
  assertEquals(result.scenes[1].interior_exterior, 'EXT');
});

Deno.test("SCENE N — Description format", () => {
  const script = `SCENE 1 — THE MEETING\n\nThey meet.\n\nSCENE 2 — THE CHASE\n\nThey run.`;
  const result = parseScreenplay(script);
  assertEquals(result.metadata.scene_count, 2);
  assertEquals(result.scenes[0].location_raw, 'THE MEETING');
});

Deno.test("Transitions and character cues", () => {
  const script = `INT. ROOM - DAY\n\nCUT TO:\n\nJOHN\nI'm here.\n\nFADE OUT.`;
  const result = parseScreenplay(script);
  assertEquals(result.metadata.scene_count, 1);
  assertEquals(result.scenes[0].dialogue_blocks.length, 1);
  assertEquals(result.scenes[0].characters_present.includes('JOHN'), true);
});

Deno.test("Parenthetical extraction", () => {
  const script = `INT. ROOM - DAY\n\nJOHN\n(whispering)\nDon't make a sound.\n\nMARY\n(loudly)\nToo late!`;
  const result = parseScreenplay(script);
  assertEquals(result.scenes[0].parentheticals.length, 2);
  assertEquals(result.scenes[0].parentheticals[0].character, 'JOHN');
  assertEquals(result.scenes[0].parentheticals[0].direction, 'whispering');
  assertEquals(result.scenes[0].dialogue_blocks.length, 2);
});

Deno.test("Characters_present from dialogue content", () => {
  const script = `INT. HALL - DAY\n\nJOHN\nI'm here.\n\nMARY\nMe too.\n\nBOB\n(entering)\nHello all.`;
  const result = parseScreenplay(script);
  assertEquals(result.scenes[0].characters_present.length, 3);
  assert(result.scenes[0].characters_present.includes('JOHN'));
  assert(result.scenes[0].characters_present.includes('MARY'));
  assert(result.scenes[0].characters_present.includes('BOB'));
});

Deno.test("Empty script returns single fallback scene", () => {
  const script = `Just some text with no headings at all.\n\nSome action.\n\nSome dialogue maybe.`;
  const result = parseScreenplay(script);
  assertEquals(result.metadata.scene_count, 1);
  assertEquals(result.metadata.parse_method, 'fallback_single_scene');
});

Deno.test("Very short script returns single scene", () => {
  const result = parseScreenplay(`Hello world.`);
  assertEquals(result.metadata.scene_count, 1);
});

Deno.test("Provenance fields populated", () => {
  const result = parseScreenplay(`INT. X - DAY\n\nHi.`, {
    sourceDocumentVersionId: 'test-version-id',
    projectId: 'test-project-id',
  });
  const scene = result.scenes[0];
  assertEquals(typeof scene.source_hash, 'string');
  assertEquals(scene.source_hash.length, 8);
  assertEquals(scene.parser_version, '1.0.0');
  assertEquals(scene.extraction_method, 'regex');
  assertEquals(typeof scene.scene_start_offset, 'number');
  assertEquals(typeof scene.scene_end_offset, 'number');
});

Deno.test("Offsets are correct", () => {
  const script = `INT. A - DAY\n\nJOHN\nWord.\n\nEXT. B - NIGHT\n\nDONE.`;
  const result = parseScreenplay(script);
  assertEquals(result.scenes[0].scene_start_offset, 0);
  assert(result.scenes[0].scene_end_offset > result.scenes[0].scene_start_offset);
  assert(result.scenes[1].scene_start_offset >= result.scenes[0].scene_end_offset);
});

Deno.test("location_key normalization", () => {
  const script = `INT. BILL'S APARTMENT - DAY\n\nHi.`;
  const result = parseScreenplay(script);
  assertEquals(result.scenes[0].location_key, 'bill_s_apartment');
  assertEquals(result.scenes[0].location_raw, "BILL'S APARTMENT");
});

Deno.test("I/E. prefix handling", () => {
  const script = `I/E. HOUSE - DAY\n\nInside and out.\n\nINT/EXT. CAR - NIGHT\n\nInside car but also outside.`;
  const result = parseScreenplay(script);
  assert(result.metadata.scene_count >= 2, `Should detect I/E. and INT/EXT., got ${result.metadata.scene_count}`);
  assertEquals(result.scenes[0].interior_exterior, 'I/E');
  assertEquals(result.scenes[1].interior_exterior, 'INT/EXT');
});

Deno.test("Multiple dash variants for time_of_day", () => {
  const script = `INT. HOUSE - DAY\n\nFirst.\n\nEXT. FIELD – NIGHT\n\nSecond.\n\nINT. CAR — DAWN\n\nThird.`;
  const result = parseScreenplay(script);
  assertEquals(result.metadata.scene_count, 3);
  assertEquals(result.scenes[0].time_of_day, 'DAY');
  assertEquals(result.scenes[1].time_of_day, 'NIGHT');
  assertEquals(result.scenes[2].time_of_day, 'DAWN');
});

Deno.test("Fade in / Fade out handling", () => {
  const script = `FADE IN:\n\nINT. ROOM - DAY\n\nAction.\n\nFADE OUT.\n\nEXT. FIELD - NIGHT\n\nMore action.\n\nTHE END`;
  const result = parseScreenplay(script);
  assertEquals(result.metadata.scene_count, 2);
});

console.log("=== All tests defined ===");
