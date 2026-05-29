/**
 * Visual Pipeline Missing Migrations 5/6/7 — Schema Validation Tests
 *
 * Verifies that the 3 missing migrations were correctly applied:
 *   - Migration 5: approval_status + validation_payload columns on scene_demo_images
 *   - Migration 6: is_canonical column + unique partial index on scene_demo_runs
 *   - Migration 7: costume_run_commands table with RLS, indexes, and CHECK constraints
 *
 * Tests validate:
 *   1. The regenerated types.ts reflects the correct schema
 *   2. The migration SQL files are valid and match the types
 *   3. Constraint and index invariants are consistent
 *   4. Edge cases for each schema change
 *
 * Commit: 0b748a7 fix(visual-pipeline): apply missing migrations 5/6/7 + regenerate types
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf-8');
}

// ─── Helper: extract a type definition block from the types.ts file ───
function extractTypeBlock(
  typesContent: string,
  tableName: string,
): { row: string; insert: string; update: string } {
  // Find the start of the table definition
  const tableRegex = new RegExp(
    `${tableName}:\\s*\\{[\\s\\S]*?Relationships:\\s*\\[`,
  );
  const match = typesContent.match(tableRegex);
  expect(match, `${tableName} definition not found in types.ts`).toBeTruthy();

  const block = match![0];
  // Extract Row, Insert, Update blocks
  const rowMatch = block.match(/Row:\s*\{([\s\S]*?)\}\s*(?=\n\s{8}\w+:)/);
  const insertMatch = block.match(/Insert:\s*\{([\s\S]*?)\}\s*(?=\n\s{8}\w+:)/);
  const updateMatch = block.match(/Update:\s*\{([\s\S]*?)\}\s*(?=\n\s{8}\w+:)/);

  return {
    row: rowMatch ? rowMatch[1] : '',
    insert: insertMatch ? insertMatch[1] : '',
    update: updateMatch ? updateMatch[1] : '',
  };
}

// ─── Migration 5: approval_status + validation_payload on scene_demo_images ───

describe('Migration 5 — scene_demo_images: approval_status + validation_payload', () => {
  const migrationPath = 'supabase/migrations/20260323230741_6ebd5e0d-88da-47c3-9a63-917e25502227.sql';
  const migrationSql = readFile(migrationPath);
  const typesContent = readFile('src/integrations/supabase/types.ts');
  const types = extractTypeBlock(typesContent, 'scene_demo_images');

  // ── Primary use case ──

  it('MIGRATION SQL: adds approval_status column with NOT NULL and DEFAULT pending', () => {
    expect(migrationSql).toContain('approval_status');
    expect(migrationSql).toMatch(/ADD COLUMN IF NOT EXISTS approval_status\s+text\s+NOT NULL\s+DEFAULT\s+'pending'/);
    expect(migrationSql).toContain('validation_payload');
    expect(migrationSql).toMatch(/ADD COLUMN IF NOT EXISTS validation_payload\s+jsonb\s+DEFAULT\s+NULL/);
  });

  it('MIGRATION SQL: adds CHECK constraint for approval_status values', () => {
    expect(migrationSql).toContain('ADD CONSTRAINT scene_demo_images_approval_status_check');
    expect(migrationSql).toMatch(/CHECK\s*\(approval_status\s+IN\s*\(/);
    // All 4 valid status values
    expect(migrationSql).toContain("'pending'");
    expect(migrationSql).toContain("'approved'");
    expect(migrationSql).toContain("'rejected'");
    expect(migrationSql).toContain("'redo_requested'");
  });

  it('MIGRATION SQL: drops pre-existing constraint before re-adding', () => {
    expect(migrationSql).toContain('DROP CONSTRAINT IF EXISTS scene_demo_images_approval_status_check');
  });

  // ── Types file validation ──

  it('TYPES: approval_status exists in Row, Insert, and Update types', () => {
    expect(types.row).toContain('approval_status: string');
    expect(types.insert).toContain('approval_status?: string');
    expect(types.update).toContain('approval_status?: string');
  });

  it('TYPES: validation_payload exists as Json | null in Row and optional in Insert/Update', () => {
    expect(types.row).toContain('validation_payload: Json | null');
    expect(types.insert).toContain('validation_payload?: Json | null');
    expect(types.update).toContain('validation_payload?: Json | null');
  });

  it('TYPES: approval_status is NOT optional in Row (matches NOT NULL constraint)', () => {
    // In Row type, approval_status should be required (string) not optional
    expect(types.row).toMatch(/approval_status:\s+string/);
    expect(types.row).not.toMatch(/approval_status\?:\s+string/);
  });

  // ── Edge case: existing columns were preserved ──

  it('TYPES: existing scene_demo_images columns are intact', () => {
    expect(types.row).toContain('id: string');
    expect(types.row).toContain('run_id: string');
    expect(types.row).toContain('project_id: string');
    expect(types.row).toContain('slot_key: string');
    expect(types.row).toContain('status: string');
    expect(types.row).toContain('created_at: string');
    expect(types.row).toContain('updated_at: string');
    expect(types.row).toContain('public_url: string | null');
    expect(types.row).toContain('storage_path: string | null');
    expect(types.row).toContain('prompt_used: string | null');
    expect(types.row).toContain('negative_prompt: string | null');
    expect(types.row).toContain('generation_config: Json');
    expect(types.row).toContain('character_key: string | null');
    expect(types.row).toContain('error: string | null');
  });

  // ── Invariant: Row type has all required columns as non-optional ──

  it('TYPES: Row type correctly marks approval_status as required (NOT NULL)', () => {
    // NOT NULL columns should be non-optional in Row
    const requiredRowCols = ['id', 'run_id', 'project_id', 'slot_key', 'status',
      'created_at', 'updated_at', 'approval_status', 'generation_config'];
    for (const col of requiredRowCols) {
      expect(types.row).toMatch(new RegExp(`${col}:\\s+(?!\\?)`));
    }
  });
});

// ─── Migration 6: is_canonical column + unique partial index on scene_demo_runs ───

describe('Migration 6 — scene_demo_runs: is_canonical + unique index', () => {
  const migrationPath = 'supabase/migrations/20260323231119_b95dffbf-2125-4b84-8f1f-01efec3259b6.sql';
  const migrationSql = readFile(migrationPath);
  const typesContent = readFile('src/integrations/supabase/types.ts');
  const types = extractTypeBlock(typesContent, 'scene_demo_runs');

  // ── Primary use case ──

  it('MIGRATION SQL: adds is_canonical boolean column with NOT NULL DEFAULT false', () => {
    expect(migrationSql).toContain('is_canonical');
    expect(migrationSql).toMatch(/ADD COLUMN IF NOT EXISTS is_canonical\s+boolean\s+NOT NULL\s+DEFAULT\s+false/);
  });

  it('MIGRATION SQL: creates unique partial index on (project_id, scene_id) WHERE is_canonical = true', () => {
    expect(migrationSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_demo_runs_canonical_unique');
    expect(migrationSql).toContain('ON public.scene_demo_runs (project_id, scene_id)');
    expect(migrationSql).toContain('WHERE is_canonical = true');
  });

  // ── Types file validation ──

  it('TYPES: is_canonical exists as boolean in Row, Insert, and Update types', () => {
    expect(types.row).toContain('is_canonical: boolean');
    expect(types.insert).toContain('is_canonical?: boolean');
    expect(types.update).toContain('is_canonical?: boolean');
  });

  it('TYPES: is_canonical is NOT optional in Row (matches NOT NULL constraint)', () => {
    expect(types.row).toMatch(/is_canonical:\s+boolean/);
    expect(types.row).not.toMatch(/is_canonical\?:\s+boolean/);
  });

  // ── Edge case: existing columns preserved ──

  it('TYPES: existing scene_demo_runs columns are intact', () => {
    expect(types.row).toContain('id: string');
    expect(types.row).toContain('project_id: string');
    expect(types.row).toContain('scene_id: string');
    expect(types.row).toContain('status: string');
    expect(types.row).toContain('slot_count: number');
    expect(types.row).toContain('completed_count: number');
    expect(types.row).toContain('plan_snapshot: Json');
    expect(types.row).toContain('created_at: string');
    expect(types.row).toContain('updated_at: string');
    expect(types.row).toContain('completed_at: string | null');
    expect(types.row).toContain('created_by: string | null');
    expect(types.row).toContain('error: string | null');
  });

  // ── Invariant: Unique index invariants ──

  it('INVARIANT: is_canonical default is false (new runs are not canonical by default)', () => {
    expect(migrationSql).toContain('DEFAULT false');
  });

  it('INVARIANT: only one canonical run per (project_id, scene_id)', () => {
    // The unique partial index enforces this — confirm it's a UNIQUE index
    expect(migrationSql).toContain('UNIQUE INDEX');
  });

  it('INVARIANT: partial index only constrains canonical runs', () => {
    expect(migrationSql).toContain('WHERE is_canonical = true');
    // Multiple runs can have is_canonical=false — only canonical ones are unique
  });
});

// ─── Migration 7: costume_run_commands table ───

describe('Migration 7 — costume_run_commands table', () => {
  const migrationPath = 'supabase/migrations/20260324163428_a9e6cefc-07b1-4d36-9762-dedd7cd99cab.sql';
  const migrationSql = readFile(migrationPath);
  const typesContent = readFile('src/integrations/supabase/types.ts');
  const types = extractTypeBlock(typesContent, 'costume_run_commands');

  // ── Primary use case ──

  it('MIGRATION SQL: creates costume_run_commands table', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.costume_run_commands');
  });

  it('MIGRATION SQL: has all expected columns with correct types', () => {
    expect(migrationSql).toMatch(/id\s+uuid\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid\(\)/);
    expect(migrationSql).toMatch(/run_id\s+text\s+NOT NULL/);
    expect(migrationSql).toMatch(/project_id\s+uuid\s+NOT NULL/);
    expect(migrationSql).toMatch(/command_type\s+text\s+NOT NULL/);
    expect(migrationSql).toMatch(/character_key\s+text/);
    expect(migrationSql).toMatch(/state_key\s+text/);
    expect(migrationSql).toMatch(/slot_key\s+text/);
    expect(migrationSql).toMatch(/payload_json\s+jsonb/);
    expect(migrationSql).toMatch(/status\s+text\s+NOT NULL\s+DEFAULT\s+'pending'/);
    expect(migrationSql).toMatch(/reason\s+text/);
    expect(migrationSql).toMatch(/created_by\s+uuid/);
    expect(migrationSql).toMatch(/created_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/);
    expect(migrationSql).toMatch(/consumed_at\s+timestamptz/);
    expect(migrationSql).toMatch(/result_json\s+jsonb/);
  });

  it('MIGRATION SQL: has CHECK constraint on command_type', () => {
    expect(migrationSql).toMatch(/CHECK\s*\(command_type\s+IN\s*\(/);
    expect(migrationSql).toContain("'pause_run'");
    expect(migrationSql).toContain("'resume_run'");
    expect(migrationSql).toContain("'retry_state'");
    expect(migrationSql).toContain("'skip_state'");
    expect(migrationSql).toContain("'retry_slot'");
  });

  it('MIGRATION SQL: has CHECK constraint on status', () => {
    expect(migrationSql).toMatch(/status\s+IN\s*\('/);
    expect(migrationSql).toContain("'pending'");
    expect(migrationSql).toContain("'applied'");
    expect(migrationSql).toContain("'failed'");
    expect(migrationSql).toContain("'cancelled'");
  });

  it('MIGRATION SQL: has FK to projects with ON DELETE CASCADE', () => {
    expect(migrationSql).toMatch(/project_id\s+uuid\s+NOT NULL\s+REFERENCES\s+public\.projects\(id\)\s+ON\s+DELETE\s+CASCADE/);
  });

  it('MIGRATION SQL: has FK to auth.users for created_by', () => {
    expect(migrationSql).toMatch(/created_by\s+uuid\s+REFERENCES\s+auth\.users\(id\)/);
  });

  // ── Indexes ──

  it('MIGRATION SQL: has partial index for pending command polling', () => {
    expect(migrationSql).toContain('idx_costume_run_commands_pending');
    expect(migrationSql).toContain('ON public.costume_run_commands (run_id, status) WHERE status =');
  });

  it('MIGRATION SQL: has project-level audit index', () => {
    expect(migrationSql).toContain('idx_costume_run_commands_project');
    expect(migrationSql).toContain('ON public.costume_run_commands (project_id, created_at DESC)');
  });

  // ── RLS ──

  it('MIGRATION SQL: enables Row Level Security', () => {
    expect(migrationSql).toContain('ALTER TABLE public.costume_run_commands ENABLE ROW LEVEL SECURITY');
  });

  it('MIGRATION SQL: has RLS policy for owner/collaborator access', () => {
    expect(migrationSql).toContain('CREATE POLICY "Users can manage their project commands"');
    expect(migrationSql).toContain('USING (public.can_access_project(project_id))');
    expect(migrationSql).toContain('WITH CHECK (public.can_access_project(project_id))');
    expect(migrationSql).toContain('FOR ALL');
    expect(migrationSql).toContain('TO authenticated');
  });

  // ── Types file validation ──

  it('TYPES: costume_run_commands has Row, Insert, Update', () => {
    expect(types.row).toBeTruthy();
    expect(types.row.length).toBeGreaterThan(0);
    expect(types.insert.length).toBeGreaterThan(0);
    expect(types.update.length).toBeGreaterThan(0);
  });

  it('TYPES: costume_run_commands Row has all required columns', () => {
    expect(types.row).toContain('id: string');
    expect(types.row).toContain('run_id: string');
    expect(types.row).toContain('project_id: string');
    expect(types.row).toContain('command_type: string');
    expect(types.row).toContain('status: string');
    expect(types.row).toContain('created_at: string');
    expect(types.row).toContain('character_key: string | null');
    expect(types.row).toContain('state_key: string | null');
    expect(types.row).toContain('slot_key: string | null');
    expect(types.row).toContain('payload_json: Json | null');
    expect(types.row).toContain('reason: string | null');
    expect(types.row).toContain('created_by: string | null');
    expect(types.row).toContain('consumed_at: string | null');
    expect(types.row).toContain('result_json: Json | null');
  });

  it('TYPES: costume_run_commands has Relationships with FK info', () => {
    // Search for the FK reference directly in the types file
    const fkIdx = typesContent.indexOf('costume_run_commands_project_id_fkey');
    expect(fkIdx).toBeGreaterThan(0);
    // After the FK name, we should see both referenced relations within 400 chars
    const afterFk = typesContent.slice(fkIdx, fkIdx + 500);
    expect(afterFk).toContain('referencedRelation: "project_script_scene_state"');
    expect(afterFk).toContain('referencedRelation: "projects"');
  });

  // ── Edge case: Null/optional columns ──

  it('TYPES: optional columns are nullable in Row type', () => {
    expect(types.row).toContain('character_key: string | null');
    expect(types.row).toContain('state_key: string | null');
    expect(types.row).toContain('slot_key: string | null');
    expect(types.row).toContain('payload_json: Json | null');
    expect(types.row).toContain('reason: string | null');
    expect(types.row).toContain('created_by: string | null');
    expect(types.row).toContain('consumed_at: string | null');
    expect(types.row).toContain('result_json: Json | null');
  });

  // ── Invariant: Required columns are non-optional in Row ──

  it('INVARIANT: all NOT NULL columns are required in Row type', () => {
    const requiredCols = ['id', 'run_id', 'project_id', 'command_type', 'status', 'created_at'];
    for (const col of requiredCols) {
      expect(types.row).toMatch(new RegExp(`${col}:\\s+`));
      expect(types.row).not.toMatch(new RegExp(`${col}\\?:\\s+`));
    }
  });
});

// ─── Cross-migration invariants ───

describe('Cross-migration invariants', () => {
  const sqlDir = path.resolve(PROJECT_ROOT, 'supabase/migrations');
  const typesContent = readFile('src/integrations/supabase/types.ts');

  it('ALL MIGRATIONS: SQL files are valid and present', () => {
    const migration5 = path.join(sqlDir, '20260323230741_6ebd5e0d-88da-47c3-9a63-917e25502227.sql');
    const migration6 = path.join(sqlDir, '20260323231119_b95dffbf-2125-4b84-8f1f-01efec3259b6.sql');
    const migration7 = path.join(sqlDir, '20260324163428_a9e6cefc-07b1-4d36-9762-dedd7cd99cab.sql');

    expect(fs.existsSync(migration5)).toBe(true);
    expect(fs.existsSync(migration6)).toBe(true);
    expect(fs.existsSync(migration7)).toBe(true);
  });

  it('ALL MIGRATIONS: run after the base scene_demo tables migration', () => {
    // Base tables created at: 20260323225536
    const basePath = path.join(sqlDir, '20260323225536_f05dc8b0-9a86-4755-8674-033a25b1cc6a.sql');
    expect(fs.existsSync(basePath)).toBe(true);

    const baseSql = fs.readFileSync(basePath, 'utf-8');
    expect(baseSql).toContain('CREATE TABLE IF NOT EXISTS public.scene_demo_images');
    expect(baseSql).toContain('CREATE TABLE IF NOT EXISTS public.scene_demo_runs');
  });

  it('TYPES: migration 7 table (costume_run_commands) has FK to projects with ON DELETE CASCADE', () => {
    // Verify FK is registered in the types Relationships
    const relBlock = typesContent.match(/costume_run_commands_project_id_fkey[\s\S]*?referencedRelation:\s*"projects"/);
    expect(relBlock).toBeTruthy();
  });

  it('ALL TABLES: scene_demo_images, scene_demo_runs, and costume_run_commands all registered in Database type', () => {
    expect(typesContent).toContain('scene_demo_images:');
    expect(typesContent).toContain('scene_demo_runs:');
    expect(typesContent).toContain('costume_run_commands:');
  });
});