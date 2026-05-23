/**
 * Tests for: Fix location seeding in Visual Source Truth
 *
 * Commit 7a8bb32 — 2 files changed:
 *   1. src/hooks/useCanonLocations.ts — Add string handling for locations/settings/key_locations
 *      + scene title fallback extraction via slugline regex
 *   2. src/components/visual/SourceTruthDashboard.tsx — Add title to scene mapping + SGV fallback
 *      query for locations not found in scene_index
 *
 * Root cause 1: canonJson.locations is a string ("Study;Ballroom;Library") but seedFromCanon
 *   only handled arrays via Array.isArray(). String input was always skipped.
 * Root cause 2: scene_index.location_key is often null for beat-sheet/story-outline docs.
 * Root cause 3: handleExtractLocations didn't pass scene title to seedFromCanon for fallback.
 *
 * Test approach: static analysis of source files to verify the fix patterns
 */

import { describe, it, expect } from 'vitest';

const HOOK_PATH = '/Users/laralane/code/iffy/src/hooks/useCanonLocations.ts';
const DASHBOARD_PATH = '/Users/laralane/code/iffy/src/components/visual/SourceTruthDashboard.tsx';

// ════════════════════════════════════════════════════════════════════════════════
// FIX 1: seedFromCanon string-to-array conversion for locations/settings/key_locations
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 1 — seedFromCanon string-to-array conversion for locations/settings/key_locations', () => {

  // ── PRIMARY USE CASE: STRING LOCATIONS PARSED ────────────────────────────────

  it('uses let (not const) for rawLocArr to allow string-to-array reassignment', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must use 'let' to allow reassignment when string is detected
    expect(src).toContain('let rawLocArr = canonJson?.locations ?? canonJson?.settings ?? canonJson?.key_locations');
  });

  it('checks typeof rawLocArr === "string" before splitting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must detect string-typed locations
    expect(src).toContain("typeof rawLocArr === 'string' && rawLocArr.length > 0");
  });

  it('splits string on semicolon, newline, and comma delimiters', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must split on semicolon, newline, and comma
    expect(src).toContain('split(/[;,;\\n]+/).map');
  });

  it('maps each split item to { name: s.trim() } object', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must transform each substring to a { name } object with trimmed value
    expect(src).toContain(".map((s: string) => ({ name: s.trim() }))");
  });

  it('filters out empty strings and "Unknown" entries after split', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must filter out empty/Unknown entries to avoid seeding garbage
    expect(src).toContain(".filter((s: { name: string }) => s.name.length > 0 && s.name !== 'Unknown')");
  });

  // ── EDGE CASE: FIELD IS ALREADY AN ARRAY ─────────────────────────────────────

  it('preserves existing array handling for locations/settings/key_locations', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The Array.isArray check must still exist for array-typed locations
    expect(src).toContain('if (Array.isArray(locArr))');
    // The string-vs-object branching inside must be preserved
    expect(src).toContain("typeof loc === 'string'");
    expect(src).toContain("loc.name || loc.location_name || loc.setting");
  });

  // ── EDGE CASE: ALL THREE FIELDS (locations, settings, key_locations) ────────

  it('checks locations first, then settings, then key_locations via nullish coalescing', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must check locations first, fallback to settings, then key_locations
    expect(src).toContain('canonJson?.locations ?? canonJson?.settings ?? canonJson?.key_locations');
  });

  // ── EDGE CASE: EMPTY LOCATIONS STRING ────────────────────────────────────────

  it('guards against empty string with rawLocArr.length > 0 check', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Empty string must not enter the split path
    expect(src).toContain("typeof rawLocArr === 'string' && rawLocArr.length > 0");
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 2: Slugline fallback — extract location from scene.title
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 2 — Slugline fallback extraction from scene.title', () => {

  // ── PRIMARY USE CASE: TITLE FALLBACK WHEN NO LOCATION ────────────────────────

  it('checks scene.title when scene has no location or setting', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must enter slugline fallback when locName is empty and scene.title exists
    expect(src).toContain('} else if (!locName && scene.title) {');
  });

  it('uses regex matching INT./EXT./I/E./INT/EXT. prefixes for slugline detection', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must match standard slugline prefixes INT., EXT., I/E., INT/EXT
    // Note: regex literal in source has escaped dots: INT\., EXT\., I\/E\., INT\/EXT
    expect(src).toContain('INT\\.');
    expect(src).toContain('EXT\\.');
    expect(src).toContain('I\\/E\\.');
    expect(src).toContain('INT\\/EXT');
  });

  it('uses case-insensitive regex for slugline matching', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The regex must be case-insensitive (i flag)
    expect(src).toContain('(?:INT\\.|EXT\\.|I\\/E\\.|INT\\/EXT\\.?)');
    expect(src).toContain('$/i');
  });

  it('extracts location name from the first capture group', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // After successful match, extract from group 1
    expect(src).toContain('const tLoc = slugMatch[1].trim()');
  });

  it('deduplicates slugline-extracted locations against already-seen names', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must check seenNames before adding slugline-extracted location
    expect(src).toContain("!seenNames.has(tLoc.toLowerCase())");
  });

  // ── EDGE CASE: SCENE WITH TITLE BUT NO SLUGLINE CONTENT ──────────────────────

  it('gracefully skips scenes where title has no slugline pattern', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The if(slugMatch) guard prevents null dereference for non-slugline titles
    expect(src).toContain('if (slugMatch) {');
  });

  // ── INVARIANT: locName IS const, tLoc IS let-like ────────────────────────────

  it('declares locName as const (unchanged from original — slugline uses separate tLoc variable)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The slugline fallback uses a separate tLoc variable rather than reassigning locName
    // This is valid because the check is in the else-if branch
    expect(src).toMatch(/const locName = \(scene\.location \|\| scene\.setting \|\| ''\)\.trim\(\)/);
    expect(src).toContain('const tLoc = slugMatch[1].trim()');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIX 3: SourceTruthDashboard — scene title passthrough + SGV fallback
// ════════════════════════════════════════════════════════════════════════════════

describe('Fix 3 — SourceTruthDashboard scene title passthrough and SGV fallback', () => {

  // ── PRIMARY USE CASE: SCENE TITLE PASSED THROUGH ─────────────────────────────

  it('passes scene title in the scene mapping for handleExtractLocations', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Must include title: s.title || '' in scene mapping
    expect(src).toContain("title: s.title || ''");
  });

  it('passes title alongside location, setting, and scene_key in scene map', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // The title field must be inside the map return object alongside other fields
    const mapBlock = src.match(/\.map\(s => \({[\s\S]*?title: s\.title \|\| ''[\s\S]*?}\)\);/);
    expect(mapBlock).not.toBeNull();
  });

  // ── SGV FALLBACK: SCENE_GRAPH_VERSIONS QUERY ────────────────────────────────

  it('queries scene_graph_versions for locations when scene_index has null location_key', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Must query scene_graph_versions for locations
    expect(src).toContain(".from('scene_graph_versions')");
    expect(src).toContain(".select('scene_id, location, slugline')");
    expect(src).toContain(".eq('project_id', projectId)");
    expect(src).toContain(".not('location', 'is', null)");
  });

  it('orders SGV results by version_number descending to get latest per scene', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Must order by version_number descending (latest version wins)
    expect(src).toContain(".order('version_number', { ascending: false })");
  });

  it('deduplicates SGV results by scene_id to avoid duplicate scenes', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Must deduplicate by scene_id
    expect(src).toContain('const seenIds = new Set<string>()');
    expect(src).toContain('if (seenIds.has(row.scene_id)) continue;');
    expect(src).toContain('seenIds.add(row.scene_id)');
  });

  // ── SGV FALLBACK: DEDUP AGAINST EXISTING LOCATIONS ──────────────────────────

  it('deduplicates SGV locations against existing scene_index locations to avoid duplicates', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Must build existingLocNames set from combined.scenes before SGV fallback
    expect(src).toContain('const existingLocNames = new Set(');
    // Must check against existingLocNames before adding
    expect(src).toContain('!locName || existingLocNames.has(locName.toLowerCase())');
    expect(src).toContain('existingLocNames.add(locName.toLowerCase())');
  });

  // ── SGV FALLBACK: SCENES ARRAY CREATED IF MISSING ───────────────────────────

  it('creates combined.scenes array if it does not exist before pushing SGV scenes', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Must handle the case where sceneIdx has no scenes but SGV has locations
    expect(src).toContain("if (!combined.scenes) combined.scenes = [];");
  });

  // ── REGRESSION: EXISTING handleExtractLocations STRUCTURE PRESERVED ──────────

  it('still passes canonJson.locations/settings/key_locations/world_description/setting through', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // All existing canonJson passthroughs must still be present
    // Note: source uses (canonJson as any).world_description due to TypeScript casting
    expect(src).toContain('combined.locations = canonJson.locations');
    expect(src).toContain('(canonJson as any).world_description')
  });

  it('still maps scene location from location_key as fallback', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Must still set location from location_key (existing behavior)
    expect(src).toContain("location: s.location_key || ''");
    expect(src).toContain("setting: s.location_key || ''");
  });

  it('still strikes combined scene data from sceneIdx.scenes.map before SGV fallback', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Scene index scenes must be mapped before SGV fallback runs
    // The existingLocNames building confirms this ordering
    expect(src).toContain('(combined.scenes || []).map((s: any) =>');
  });

  // ── INVARIANT: seedFromCanon CALLED WITH COMBINED DATA ──────────────────────

  it('reassembles combined canonJson and passes to seedLocationsMutation', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Must call mutateAsync with combined canonJson
    expect(src).toContain('await seedLocationsMutation.mutateAsync({ canonJson: combined, documentSources: docIds })');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// INVARIANT: ERROR HANDLING AND ROBUSTNESS
// ════════════════════════════════════════════════════════════════════════════════

describe('Invariant — Error handling and robustness', () => {

  it('still throws when no locations are found after all extraction paths', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Must still throw error when no locations can be extracted from any source
    expect(src).toContain("throw new Error('No locations found in story data')");
  });

  it('still has world_description fallback when string locations and scene index yield nothing', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The world_description "Primary World" fallback is existing behavior — must preserve it
    expect(src).toContain("name: 'Primary World'");
    expect(src).toContain("worldDesc.slice(0, 500)");
  });

  it('still limits upsert to 20 locations (existing cap)', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The 20-location cap is existing behavior
    expect(src).toContain('.slice(0, 20)');
  });

  it('handleExtractLocations tries catch gracefully — error handled by mutation toast', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // The try-catch wrapper must be present with empty catch (error toast handled by mutation)
    const lines = src.split('\n');
    const tryIdx = lines.findIndex(l => l.includes('try {'));
    const catchIdx = lines.findIndex(l => l.includes('} catch {'));
    const finallyIdx = lines.findIndex(l => l.includes('} finally {'));

    expect(tryIdx).toBeGreaterThan(0);
    expect(catchIdx).toBeGreaterThan(tryIdx);
    expect(finallyIdx).toBeGreaterThan(catchIdx);
  });

  it('sets and clears locationExtracting loading state', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // Must show loading state management
    expect(src).toContain('setLocationExtracting(true)');
    expect(src).toContain('setLocationExtracting(false)');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// REGRESSION: EXISTING useCanonLocations BEHAVIOR INTACT
// ════════════════════════════════════════════════════════════════════════════════

describe('Regression — Existing useCanonLocations behavior preserved', () => {

  it('still handles string-type location items inside array -> { name }', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The existing string-type item handling inside the loop must be preserved
    expect(src).toContain("if (typeof loc === 'string')");
    expect(src).toContain("if (name && name !== 'Unknown')");
  });

  it('still handles object-type location items with all property mappings', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // All existing property mappings must be preserved
    expect(src).toContain('interior_or_exterior: loc.interior_or_exterior || loc.int_ext || undefined');
    expect(src).toContain('importance: loc.importance_level || loc.story_importance || \'secondary\'');
    expect(src).toContain('characters: loc.characters || loc.associated_characters || []');
  });

  it('still upserts with onConflict for project_id,normalized_name', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The upsert conflict resolution must be preserved
    expect(src).toContain("onConflict: 'project_id,normalized_name'");
  });

  it('still shows success toast with location count on completion', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // The success toast behavior must be preserved
    expect(src).toContain('toast.success(`Seeded ${data.length} location(s) from story`)');
  });

  it('still invalidates canon-locations query cache on success', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Query cache invalidation must be preserved
    expect(src).toContain("qc.invalidateQueries({ queryKey: ['canon-locations', projectId] })");
  });

  it('still shows error toast when seeding fails', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // Error toast must be preserved
    expect(src).toContain('toast.error(`Location seeding failed: ${e.message}`)');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// INTEGRATION: COMBINED FLOW — SGV → seedFromCanon → slugline fallback
// ════════════════════════════════════════════════════════════════════════════════

describe('Integration — Combined flow: SGV fallback + seedFromCanon + slugline fallback', () => {

  it('SGV scenes in handleExtractLocations are passed to seedFromCanon for title-less slugline processing', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // SGV-added scenes include location and setting but no title
    // They flow into seedFromCanon's scene extraction path
    expect(src).toContain('location: locName');
    expect(src).toContain('setting: locName');
    // Note: SGV scenes don't pass title — meaning they rely on location/setting being set
  });

  it('handleExtractLocations calls seedLocationsMutation.mutateAsync with combined canonJson', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(DASHBOARD_PATH, 'utf-8');

    // The full combined object (canonJson + sceneIdx scenes + SGV scenes) flows to seedFromCanon
    expect(src).toContain('await seedLocationsMutation.mutateAsync({ canonJson: combined, documentSources: docIds })');
  });

  it('seedFromCanon processes both string locations AND scene index scenes in one pass', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(HOOK_PATH, 'utf-8');

    // String-to-array conversion happens BEFORE scene extraction
    // Lines 68-71 (string handling) → lines 72-96 (array processing) → lines 111-138 (scene processing)
    const stringCheckIdx = src.indexOf("typeof rawLocArr === 'string'");
    const sceneCheckIdx = src.indexOf("Array.isArray(canonJson?.scenes)");

    expect(stringCheckIdx).toBeGreaterThan(0);
    expect(sceneCheckIdx).toBeGreaterThan(stringCheckIdx);
  });
});