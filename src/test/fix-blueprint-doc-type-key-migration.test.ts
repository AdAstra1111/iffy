/**
 * Static structural validation tests for the fix_blueprint doc_type_key migration.
 *
 * Migration: 20260526_fix_blueprint.sql
 *
 * This migration renames doc_type_key values from 'blueprint' to 'treatment'
 * in the project_active_docs table. It is a data-backfill migration that should
 * be idempotent — running it multiple times produces the same result.
 *
 * These tests validate the SQL structure without needing a live Supabase database.
 *
 * Run: npx vitest run src/test/fix-blueprint-doc-type-key-migration.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20260526_fix_blueprint.sql',
);

interface ParsedUpdateMigration {
  updateExists: boolean;
  tableName: string | null;
  setColumn: string | null;
  setFromValue: string | null;
  setToValue: string | null;
  whereColumn: string | null;
  whereEquals: string | null;
  hasExplicitWhere: boolean;
  hasSchemaQualifier: boolean;
  isIdempotent: boolean; // UPDATE same value for both old and new is harmless
}

function parseMigrationSQL(content: string): ParsedUpdateMigration {
  const result: ParsedUpdateMigration = {
    updateExists: false,
    tableName: null,
    setColumn: null,
    setFromValue: null,
    setToValue: null,
    whereColumn: null,
    whereEquals: null,
    hasExplicitWhere: false,
    hasSchemaQualifier: false,
    isIdempotent: false,
  };

  // Match: UPDATE [schema.]table SET col = 'new_value' WHERE col = 'old_value'
  const updateMatch = content.match(
    /UPDATE\s+(?:public\.)?(\w+)\s+SET\s+(\w+)\s*=\s*'([^']+)'\s+WHERE\s+(\w+)\s*=\s*'([^']+)'/i,
  );
  if (updateMatch) {
    result.updateExists = true;
    result.tableName = updateMatch[1];
    result.setColumn = updateMatch[2];
    result.setToValue = updateMatch[3];
    result.whereColumn = updateMatch[4];
    result.whereEquals = updateMatch[5];
    result.hasSchemaQualifier = content.includes('public.');
    result.hasExplicitWhere = true;

    // Idempotent if re-applying the UPDATE where the WHERE value equals
    // the SET value already — no rows will match on second run
    // (SET toValue WHERE col = fromValue — after first run, all are 'treatment',
    //  second run WHERE col = 'blueprint' finds nothing)
    result.isIdempotent = true;
  }

  return result;
}

describe('fix_blueprint doc_type_key migration — structural validation', () => {
  let migrationContent: string;

  beforeAll(() => {
    migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  });

  it('migration file exists and is readable', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    expect(migrationContent.length).toBeGreaterThan(0);
  });

  describe('UPDATE statement structure', () => {
    it('has an UPDATE statement', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.updateExists).toBe(true);
    });

    it('targets project_active_docs table', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.tableName).toBe('project_active_docs');
    });

    it('updates doc_type_key column', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.setColumn).toBe('doc_type_key');
    });

    it('sets doc_type_key from blueprint (where value) to treatment (set value)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.whereEquals).toBe('blueprint');
      expect(parsed.setToValue).toBe('treatment');
    });

    it('has an explicit WHERE clause', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.hasExplicitWhere).toBe(true);
    });

    it('WHERE clause filters on doc_type_key = blueprint (only renames, not all rows)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.whereColumn).toBe('doc_type_key');
      expect(parsed.whereEquals).toBe('blueprint');
    });
  });

  describe('Safety and idempotency', () => {
    it('is idempotent — running again changes no rows (WHERE finds no matches)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.isIdempotent).toBe(true);
      // Verify: the WHERE uses the OLD value, SET uses the NEW value
      // After first run, no rows have doc_type_key = 'blueprint' anymore
      expect(parsed.whereEquals).not.toBe(parsed.setToValue);
    });

    it('does not contain DELETE or INSERT statements', () => {
      const dmlContent = migrationContent
        .replace(/--.*$/gm, '')
        .replace(/UPDATE\s+.*?;/gis, '');
      expect(dmlContent).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(dmlContent).not.toMatch(/\bINSERT\s+INTO\b/i);
    });

    it('has exactly one SQL statement (single UPDATE)', () => {
      const statements = migrationContent
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      expect(statements.length).toBe(1);
      expect(statements[0]).toMatch(/^UPDATE/i);
    });

    it('has proper semicolon termination', () => {
      expect(migrationContent.trim()).toMatch(/;\s*$/);
    });
  });
});