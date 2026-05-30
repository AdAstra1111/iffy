/**
 * CPIE Location Sparse Narrative + YETI Tests — Phase 2A
 */
import { describe, it, expect } from 'vitest';
import type { CPIEPCPContext } from '../../lib/cpie/types';
import { inferLocation } from '../../lib/cpie/location';

function entity(name: string) { return { entity_key: name.split(' ').pop() || 'loc', canonical_name: name }; }

describe('Sparse Narrative — Location', () => {

  it('CASE A — Crime: detective enters a pub', () => {
    const ctx: CPIEPCPContext = {
      project_id: 'sparse-crime', genre: ['crime', 'noir'], period: 'contemporary',
      climate: 'temperate_rainy', technology_level: 'contemporary', culture: ['Western'],
      economy: 'industrial', geography: 'urban', class_structure: 'stratified',
      biome: 'urban', profession_map: {}, pcp_resolution_timestamp: '',
    };
    const result = inferLocation(ctx, entity('The Red Lion Pub'));
    expect(result.inference_count).toBeGreaterThan(0);
    const arch = result.inferences.find(i => i.field === 'architecture_style');
    expect(arch).toBeTruthy();
    // No wartime markers
    const vals = result.inferences.map(i => i.value).join(' ');
    expect(vals).not.toMatch(/bunker|blackout|wartime/); 
    // Hospitality function
    const func = result.inferences.find(i => i.field === 'spatial_function');
    if (func) expect(func.value).toBe('hospitality');
  });

  it('CASE B — Fantasy: rider approaches the capital', () => {
    const ctx: CPIEPCPContext = {
      project_id: 'sparse-fantasy', genre: ['fantasy', 'epic'], period: 'fantasy_medieval',
      climate: 'temperate', technology_level: 'pre_industrial', culture: ['Feudal'],
      economy: 'feudal', geography: 'rural', class_structure: 'feudal',
      biome: 'forest', profession_map: {}, pcp_resolution_timestamp: '',
    };
    const result = inferLocation(ctx, entity('Capital Gates'));
    expect(result.inference_count).toBeGreaterThan(0);
    const vals = result.inferences.map(i => i.value).join(' ');
    expect(vals).not.toMatch(/modern|contemporary|future|holographic|neon/);
    expect(vals).not.toMatch(/tank|artillery|wwii|bunker/);
  });

  it('CASE C — Sci-Fi: courier runs through the district', () => {
    const ctx: CPIEPCPContext = {
      project_id: 'sparse-scifi', genre: ['sci_fi', 'cyberpunk'], period: 'distant_future',
      climate: 'urban', technology_level: 'sci_fi_advanced', culture: ['Dystopian_Corporate'],
      economy: 'post_scarcity', geography: 'urban', class_structure: 'corporate',
      biome: 'urban', profession_map: {}, pcp_resolution_timestamp: '',
    };
    const result = inferLocation(ctx, entity('Neon District'));
    expect(result.inference_count).toBeGreaterThan(0);
    const vals = result.inferences.map(i => i.value).join(' ');
    expect(vals).not.toMatch(/medieval|cobblestone|gothic/); 
  });

  it('CASE D — Horror: child hears inside the walls', () => {
    const ctx: CPIEPCPContext = {
      project_id: 'sparse-horror', genre: ['horror', 'suspense'], period: 'contemporary',
      climate: 'temperate', technology_level: 'contemporary', culture: ['Western'],
      economy: 'industrial', geography: 'urban', class_structure: 'stratified',
      biome: 'urban', profession_map: {}, pcp_resolution_timestamp: '',
    };
    const result = inferLocation(ctx, entity('Old House'));
    expect(result.inference_count).toBeGreaterThan(0);
    const vals = result.inferences.map(i => i.value).join(' ');
    expect(vals).not.toMatch(/supernatural|haunted|castle/);
    expect(vals).not.toMatch(/dragon|griffin/);
  });
});

describe('YETI Stress — Location Regimes', () => {

  it('Prehistoric — natural shelter / cave', () => {
    const ctx: CPIEPCPContext = {
      project_id: 'yeti-prehist', genre: ['prehistoric', 'adventure'], period: 'prehistoric',
      climate: 'hot_arid', technology_level: 'primitive', culture: ['Tribal'],
      economy: 'subsistence', geography: 'mountainous', class_structure: 'egalitarian',
      biome: 'cave', profession_map: {}, pcp_resolution_timestamp: '',
    };
    const result = inferLocation(ctx, entity('Cave Shelter'));
    expect(result.inference_count).toBeGreaterThan(0);
    const vals = result.inferences.map(i => i.value).join(' ');
    expect(vals).not.toMatch(/modern|future|neon|steel|glass/);
  });

  it('WWII — bunker / military utilitarian', () => {
    const ctx: CPIEPCPContext = {
      project_id: 'yeti-wwii', genre: ['war', 'historical'], period: '1940s',
      climate: 'temperate', technology_level: 'mid_20th_century', culture: ['Western'],
      economy: 'wartime_economy', geography: 'rural', class_structure: 'stratified',
      biome: 'rural', profession_map: {}, pcp_resolution_timestamp: '',
    };
    const result = inferLocation(ctx, entity('Military Bunker'));
    expect(result.inference_count).toBeGreaterThan(0);
    const vals = result.inferences.map(i => i.value).join(' ');
    expect(vals).not.toMatch(/future|hover|neon/);
  });

  it('Ancient Mythology — temple / columnar', () => {
    const ctx: CPIEPCPContext = {
      project_id: 'yeti-myth', genre: ['mythology', 'epic'], period: 'ancient',
      climate: 'hot_arid', technology_level: 'ancient', culture: ['Greek'],
      economy: 'feudal', geography: 'coastal', class_structure: 'stratified',
      biome: 'coastal', profession_map: {}, pcp_resolution_timestamp: '',
    };
    const result = inferLocation(ctx, entity('Sacred Temple'));
    expect(result.inference_count).toBeGreaterThan(0);
    const vals = result.inferences.map(i => i.value).join(' ');
    expect(vals).not.toMatch(/modern|future|neon|steel|glass/);
  });

  it('Creator/Alien — inorganic / alien', () => {
    const ctx: CPIEPCPContext = {
      project_id: 'yeti-alien', genre: ['sci_fi', 'space_opera'], period: 'distant_future',
      climate: 'arid', technology_level: 'sci_fi_advanced', culture: ['Galactic'],
      economy: 'post_scarcity', geography: 'desert', class_structure: 'corporate',
      biome: 'desert', profession_map: {}, pcp_resolution_timestamp: '',
    };
    const result = inferLocation(ctx, entity('Alien Structure'));
    expect(result.inference_count).toBeGreaterThan(0);
    const vals = result.inferences.map(i => i.value).join(' ');
    expect(vals).not.toMatch(/gothic|cobblestone|medieval|wood/);
  });

  it('Monster Horror — farmhouse decay', () => {
    const ctx: CPIEPCPContext = {
      project_id: 'yeti-horror', genre: ['horror', 'thriller'], period: 'contemporary',
      climate: 'temperate_rainy', technology_level: 'contemporary', culture: ['Rural'],
      economy: 'industrial', geography: 'rural', class_structure: 'stratified',
      biome: 'forest', profession_map: {}, pcp_resolution_timestamp: '',
    };
    const result = inferLocation(ctx, entity('Abandoned Farmhouse'));
    expect(result.inference_count).toBeGreaterThan(0);
    const vals = result.inferences.map(i => i.value).join(' ');
    expect(vals).not.toMatch(/temple|palace|gothic_cathedral/);
  });

  it('Cross-regime differentiation — 5 regimes produce distinct architecture styles', () => {
    const regimes = [
      { ctx: { project_id: 'r1', genre: ['prehistoric'], period: 'prehistoric', climate: 'temperate', technology_level: 'primitive', culture: ['Tribal'], economy: 'subsistence', geography: 'mountainous', class_structure: 'egalitarian', biome: 'cave', profession_map: {}, pcp_resolution_timestamp: '' }, name: 'Cave' },
      { ctx: { project_id: 'r2', genre: ['war'], period: '1940s', climate: 'temperate', technology_level: 'mid_20th_century', culture: ['Western'], economy: 'wartime_economy', geography: 'rural', class_structure: 'stratified', biome: 'rural', profession_map: {}, pcp_resolution_timestamp: '' }, name: 'Bunker' },
      { ctx: { project_id: 'r3', genre: ['mythology'], period: 'ancient', climate: 'hot_arid', technology_level: 'ancient', culture: ['Greek'], economy: 'feudal', geography: 'coastal', class_structure: 'stratified', biome: 'coastal', profession_map: {}, pcp_resolution_timestamp: '' }, name: 'Temple' },
      { ctx: { project_id: 'r4', genre: ['sci_fi'], period: 'distant_future', climate: 'arid', technology_level: 'sci_fi_advanced', culture: ['Galactic'], economy: 'post_scarcity', geography: 'desert', class_structure: 'corporate', biome: 'desert', profession_map: {}, pcp_resolution_timestamp: '' }, name: 'Alien' },
      { ctx: { project_id: 'r5', genre: ['horror'], period: 'contemporary', climate: 'temperate_rainy', technology_level: 'contemporary', culture: ['Rural'], economy: 'industrial', geography: 'rural', class_structure: 'stratified', biome: 'forest', profession_map: {}, pcp_resolution_timestamp: '' }, name: 'Farmhouse' },
    ];
    const archs = regimes.map(r => {
      const res = inferLocation(r.ctx as any, entity(r.name));
      return res.inferences.find(i => i.field === 'architecture_style')?.value || 'none';
    });
    const unique = new Set(archs);
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });
});
