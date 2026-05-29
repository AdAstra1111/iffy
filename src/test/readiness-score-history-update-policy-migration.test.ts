/**
 * Static structural validation tests for the readiness_score_history UPDATE policy migration.
 *
 * Migration: 20260526210000_add_readiness_score_history_update_policy.sql
 *
 * The original migration (20260210233408) created the readiness_score_history table with
 * SELECT and INSERT policies but no UPDATE policy. This caused upsert re-saves to fail (403).
 * This migration adds the missing UPDATE policy.
 *
 * These tests validate the SQL structure without needing a live Supabase database.
 *
 * Run: npx vitest run src/test/readiness-score-history-update-policy-migration.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20260526210000_add_readiness_score_history_update_policy.sql',
);

interface ParsedUpdatePolicy {
  createExists: boolean;
  policyName: string | null;
  tableName: string | null;
  command: string | null;
  role: string | null;
  usingPresent: boolean;
  withCheckPresent: boolean;
  referencesHasProjectAccess: boolean;
  referencesProjectId: boolean;
  referencesAuthUid: boolean;
  referencesUserId: boolean;
  dropExists: boolean;
  dropName: string | null;
}

function parseMigrationSQL(content: string): ParsedUpdatePolicy {
  const policy: ParsedUpdatePolicy = {
    dropExists: false,
    dropName: null,
    createExists: false,
    policyName: null,
    tableName: null,
    command: null,
    role: null,
    usingPresent: false,
    withCheckPresent: false,
    referencesHasProjectAccess: false,
    referencesProjectId: false,
    referencesAuthUid: false,
    referencesUserId: false,
  };

  // Check DROP POLICY IF EXISTS (may or may not be present; this migration doesn't need one)
  const dropMatch = content.match(
    /DROP\s+POLICY\s+IF\s+EXISTS\s+"([^"]+)"\s+ON\s+(\S+)/i,
  );
  if (dropMatch) {
    policy.dropExists = true;
    policy.dropName = dropMatch[1];
  }

  // Check CREATE POLICY: "Project members can update own score history" ON readiness_score_history FOR UPDATE
  const createMatch = content.match(
    /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(\S+)\s+FOR\s+(UPDATE)/i,
  );
  if (createMatch) {
    policy.createExists = true;
    policy.policyName = createMatch[1];
    policy.tableName = createMatch[2];
    policy.command = createMatch[3];
  }

  // Check TO authenticated
  const roleMatch = content.match(/\bTO\s+(authenticated|public|anon)\b/i);
  if (roleMatch) {
    policy.role = roleMatch[1].toLowerCase();
  }

  // Check USING clause
  if (/USING\s*\(/i.test(content)) {
    policy.usingPresent = true;
  }

  // Check WITH CHECK clause
  if (/WITH\s+CHECK\s*\(/i.test(content)) {
    policy.withCheckPresent = true;
  }

  // Check has_project_access reference
  if (/has_project_access\s*\(/i.test(content)) {
    policy.referencesHasProjectAccess = true;
  }

  // Check project_id (unqualified) reference
  if (/\bproject_id\b/.test(content)) {
    policy.referencesProjectId = true;
  }

  // Check auth.uid() reference
  if (/auth\.uid\(\)/.test(content)) {
    policy.referencesAuthUid = true;
  }

  // Check user_id reference
  if (/\buser_id\b/.test(content)) {
    policy.referencesUserId = true;
  }

  return policy;
}

describe('readiness_score_history UPDATE policy migration — structural validation', () => {
  let migrationContent: string;

  beforeAll(() => {
    migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  });

  it('migration file exists and is readable', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    expect(migrationContent.length).toBeGreaterThan(0);
  });

  describe('CREATE POLICY structure', () => {
    it('has CREATE POLICY statement', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.createExists).toBe(true);
    });

    it('is an UPDATE policy (not SELECT/INSERT/DELETE)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.command).toBe('UPDATE');
    });

    it('targets public.readiness_score_history table', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.tableName).toContain('readiness_score_history');
    });

    it('grants TO authenticated role', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.role).toBe('authenticated');
    });

    it('has USING clause', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.usingPresent).toBe(true);
    });

    it('has WITH CHECK clause', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.withCheckPresent).toBe(true);
    });
  });

  describe('RLS check logic', () => {
    it('USING references has_project_access(auth.uid(), project_id)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.referencesHasProjectAccess).toBe(true);
      expect(parsed.referencesAuthUid).toBe(true);
      expect(parsed.referencesProjectId).toBe(true);
    });

    it('WITH CHECK references auth.uid() = user_id AND has_project_access', () => {
      // Extract the WITH CHECK clause
      const wcMatch = migrationContent.match(
        /WITH\s+CHECK\s*\(([\s\S]*?)\)\s*;?\s*$/i,
      );
      expect(wcMatch).not.toBeNull();
      if (wcMatch) {
        const withCheck = wcMatch[1];
        expect(withCheck).toContain('auth.uid()');
        expect(withCheck).toContain('user_id');
        expect(withCheck).toContain('has_project_access');
      }
    });

    it('USING clause does NOT check user_id (any project member can update any history row)', () => {
      const usingMatch = migrationContent.match(
        /USING\s*\(([\s\S]*?)\)\s*WITH\s+CHECK/i,
      );
      expect(usingMatch).not.toBeNull();
      if (usingMatch) {
        const usingClause = usingMatch[1];
        // The USING clause should only check project access, not user_id
        expect(usingClause).toContain('has_project_access');
        expect(usingClause).not.toContain('user_id');
      }
    });
  });

  describe('Policy naming convention', () => {
    it('policy name is descriptive and matches the pattern', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.policyName).toMatch(/^Project members can \w+ own score history$/);
      expect(parsed.policyName).toContain('update');
    });
  });

  describe('Edge cases — SQL safety', () => {
    it('does not contain any data DML (INSERT/UPDATE/DELETE on data)', () => {
      // Strip comments, policy DDL, and the UPDATE fix blueprint file reference
      // (but there's only one file here so no cross-contamination)
      const cleaned = migrationContent
        .replace(/--.*$/gm, '')
        .replace(/CREATE\s+POLICY.*?FOR\s+(SELECT|INSERT|UPDATE|DELETE).*?;/gis, '')
        .replace(/DROP\s+POLICY.*?;/gis, '');

      // The only remaining SQL should be the DDL itself, not data modifications
      const remainingDML = cleaned.match(
        /\bINSERT\s+INTO\b|\bUPDATE\s+(?!ON\b)(?!SET\b)|\bDELETE\s+FROM\b/gi,
      );
      expect(remainingDML).toBeNull();
    });

    it('has proper semicolon placement — the migration is a single statement ending with ;', () => {
      const statements = migrationContent
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      expect(statements.length).toBe(1);
      // The single non-empty statement should contain a CREATE POLICY (after comments)
      const hasCreatePolicy = /CREATE\s+POLICY/i.test(statements[0]);
      expect(hasCreatePolicy).toBe(true);
      expect(migrationContent.trim()).toMatch(/;\s*$/);
    });
  });
});