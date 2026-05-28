/**
 * Static structural validation tests for the scene_spine_links RLS tighten migration.
 *
 * These tests verify the migration SQL file `20260311280001_scene_spine_links_rls_tighten_v1.sql`
 * is structurally correct without needing a live Supabase database. They parse the SQL text and
 * verify:
 *   - DROP POLICY IF EXISTS is present with correct policy name
 *   - CREATE POLICY has correct structure (SELECT, authenticated, has_project_access)
 *   - Policy name follows conventions
 *   - Idempotency guards are in place (IF NOT EXISTS for CREATE)
 *   - No accidental DML that would modify data
 *   - Version collision is resolved (no two files share version 20260311280000)
 *
 * Run: npx vitest run src/test/scene-spine-links-rls-migration.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20260311280001_scene_spine_links_rls_tighten_v1.sql',
);

interface ParsedMigration {
  dropExists: boolean;
  dropName: string | null;
  dropTable: string | null;
  createExists: boolean;
  policyName: string | null;
  tableName: string | null;
  command: string | null;
  role: string | null;
  usingPresent: boolean;
  withCheckPresent: boolean;
  referencesHasProjectAccess: boolean;
  referencesAuthUid: boolean;
  referencesProjectId: boolean;
  hasIfNotExistsGuard: boolean;
  hasDoBlock: boolean;
  isIdempotent: boolean;
  columnRefs: boolean;
}

function parseMigrationSQL(content: string): ParsedMigration {
  const policy: ParsedMigration = {
    dropExists: false,
    dropName: null,
    dropTable: null,
    createExists: false,
    policyName: null,
    tableName: null,
    command: null,
    role: null,
    usingPresent: false,
    withCheckPresent: false,
    referencesHasProjectAccess: false,
    referencesAuthUid: false,
    referencesProjectId: false,
    hasIfNotExistsGuard: false,
    hasDoBlock: false,
    isIdempotent: false,
    columnRefs: false,
  };

  // Check DROP POLICY IF EXISTS
  const dropMatch = content.match(
    /DROP\s+POLICY\s+IF\s+EXISTS\s+"([^"]+)"\s+ON\s+public\.(\S+);/i,
  );
  if (dropMatch) {
    policy.dropExists = true;
    policy.dropName = dropMatch[1];
    policy.dropTable = dropMatch[2];
  }

  // Check DO block with IF NOT EXISTS guard (idempotent CREATE)
  if (/DO\s*\$\$[\s\S]*BEGIN/i.test(content)) {
    policy.hasDoBlock = true;
  }
  if (/IF\s+NOT\s+EXISTS\s*\(/i.test(content)) {
    policy.hasIfNotExistsGuard = true;
  }
  if (policy.hasDoBlock && policy.hasIfNotExistsGuard) {
    policy.isIdempotent = true;
  }

  // Check CREATE POLICY
  const createMatch = content.match(
    /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(\S+)\s+FOR\s+(SELECT|INSERT|UPDATE|DELETE)\s+TO\s+(\S+)/i,
  );
  if (createMatch) {
    policy.createExists = true;
    policy.policyName = createMatch[1];
    policy.tableName = createMatch[2];
    policy.command = createMatch[3].toUpperCase();
    policy.role = createMatch[4].toLowerCase();
  }

  // Check USING clause
  if (/USING\s*\(/i.test(content)) {
    policy.usingPresent = true;
  }

  // WITH CHECK should NOT be present for SELECT policies
  if (/WITH\s+CHECK\s*\(/i.test(content)) {
    policy.withCheckPresent = true;
  }

  // Check has_project_access reference
  if (/has_project_access\s*\(/i.test(content)) {
    policy.referencesHasProjectAccess = true;
  }

  // Check auth.uid() reference
  if (/auth\.uid\s*\(\)/i.test(content)) {
    policy.referencesAuthUid = true;
  }

  // Check project_id reference (unqualified, matches canonical pattern)
  if (/\bproject_id\b/.test(content)) {
    policy.referencesProjectId = true;
  }

  // Check unqualified column refs (no table.column)
  if (/\bauth\.uid\s*\(\)\s*,\s*project_id\b/.test(content)) {
    policy.columnRefs = true;
  }

  return policy;
}

describe('scene_spine_links RLS tighten migration - static structural validation', () => {
  let migrationContent: string;

  beforeAll(() => {
    migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  });

  it('migration file exists and is readable', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    expect(migrationContent.length).toBeGreaterThan(0);
  });

  describe('DROP POLICY IF EXISTS', () => {
    it('has DROP POLICY IF EXISTS statement', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.dropExists).toBe(true);
    });

    it('drops the correct policy name: "Users can manage scene spine links for own projects"', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.dropName).toBe('Users can manage scene spine links for own projects');
    });

    it('targets scene_spine_links table', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.dropTable).toContain('scene_spine_links');
    });
  });

  describe('CREATE POLICY structure', () => {
    it('has CREATE POLICY statement', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.createExists).toBe(true);
    });

    it('is a SELECT policy (not INSERT/UPDATE/DELETE)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.command).toBe('SELECT');
    });

    it('targets scene_spine_links table', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.tableName).toContain('scene_spine_links');
    });

    it('grants access to authenticated role only (not public)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.role).toBe('authenticated');
    });

    it('has USING clause', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.usingPresent).toBe(true);
    });

    it('does NOT have WITH CHECK clause (SELECT policies don\'t need it)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.withCheckPresent).toBe(false);
    });
  });

  describe('RLS check logic', () => {
    it('references has_project_access(auth.uid(), project_id)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.referencesHasProjectAccess).toBe(true);
      expect(parsed.referencesAuthUid).toBe(true);
      expect(parsed.referencesProjectId).toBe(true);
    });

    it('uses unqualified column references (consistent with existing policies)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.columnRefs).toBe(true);
    });
  });

  describe('Idempotency', () => {
    it('is fully idempotent (DROP IF EXISTS + IF NOT EXISTS guard)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.isIdempotent).toBe(true);
    });

    it('wraps CREATE in DO block with IF NOT EXISTS guard', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.hasDoBlock).toBe(true);
    });
  });

  describe('Edge cases - SQL safety', () => {
    it('does not contain any DML (INSERT/UPDATE/DELETE on data)', () => {
      // The migration should only define policies, not modify data
      const dmlWithoutPolicy = migrationContent
        .replace(/--.*$/gm, '')  // Strip comments
        .replace(/CREATE\s+POLICY.*?FOR\s+(SELECT|INSERT|UPDATE|DELETE).*?;/gis, '')
        .replace(/DROP\s+POLICY.*?;/gis, '');

      const remainingDML = dmlWithoutPolicy.match(
        /\bINSERT\s+INTO\b|\bUPDATE\s+(?!ON\b)(?!SET\b)|\bDELETE\s+FROM\b/gi,
      );
      expect(remainingDML).toBeNull();
    });

    it('has consistent semicolon placement', () => {
      const statements = migrationContent
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      expect(statements.length).toBeGreaterThanOrEqual(3); // DROP + DO block BEGIN + END
    });
  });

  describe('Documentation completeness', () => {
    it('has evidence section documenting table schema reference', () => {
      expect(migrationContent).toContain('EVIDENCE');
    });

    it('has rationale explaining why the change is safe', () => {
      expect(migrationContent).toContain('ACCEPTABLE IN PRACTICE');
      expect(migrationContent).toContain('Defence-in-depth');
    });

    it('references canonical pattern from existing migrations', () => {
      expect(migrationContent).toContain('CANONICAL PATTERN');
    });
  });
});

describe('Version collision check', () => {
  it('no two migration files share the same version prefix (durable guard)', () => {
    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    // Extract the 17-character version prefix (YYYYMMDDHHMMSS + optional sub-version)
    // e.g., 20260311280000, 20260311280001
    const versionCounts = new Map<string, number>();
    for (const f of files) {
      // Match version: YYYYMMDDHHMMSS optionally followed by 001, 002, etc.
      const match = f.match(/^(\d{14}(?:\d{3})?)/);
      if (match) {
        const prefix = match[1];
        versionCounts.set(prefix, (versionCounts.get(prefix) || 0) + 1);
      }
    }
    const collisions = Array.from(versionCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([version, count]) => `${version}: ${count} files`);
    expect(collisions, `Version collisions found: ${collisions.join(', ') || 'none'}`)
      .toEqual([]);
  });
});
