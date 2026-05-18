/**
 * Static structural validation tests for the RLS UPDATE policy migration.
 *
 * These tests verify the migration SQL file is structurally correct without
 * needing a live Supabase database. They parse the SQL text and verify:
 *   - DROP POLICY IF EXISTS is present
 *   - CREATE POLICY has correct structure
 *   - Policy name follows conventions
 *   - USING and WITH CHECK are both present for UPDATE
 *   - has_project_access is referenced correctly
 *   - column references are unqualified (consistent with existing)
 *
 * Run: npx vitest run src/test/rls-update-policy-migration.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/20260518000000_add_update_policy_project_document_versions.sql',
);

interface ParsedPolicy {
  dropExists: boolean;
  dropName: string | null;
  createExists: boolean;
  policyName: string | null;
  tableName: string | null;
  command: string | null;
  usingPresent: boolean;
  withCheckPresent: boolean;
  referencesHasProjectAccess: boolean;
  referencesDocumentId: boolean;
  referencesAuthUid: boolean;
  joinsProjectDocuments: boolean;
}

function parseMigrationSQL(content: string): ParsedPolicy {
  const policy: ParsedPolicy = {
    dropExists: false,
    dropName: null,
    createExists: false,
    policyName: null,
    tableName: null,
    command: null,
    usingPresent: false,
    withCheckPresent: false,
    referencesHasProjectAccess: false,
    referencesDocumentId: false,
    referencesAuthUid: false,
    joinsProjectDocuments: false,
  };

  // Check DROP POLICY IF EXISTS
  const dropMatch = content.match(
    /DROP\s+POLICY\s+IF\s+EXISTS\s+"([^"]+)"\s+ON\s+(\S+)/i,
  );
  if (dropMatch) {
    policy.dropExists = true;
    policy.dropName = dropMatch[1];
  }

  // Check CREATE POLICY
  const createMatch = content.match(
    /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(\S+)\s+FOR\s+(UPDATE)/i,
  );
  if (createMatch) {
    policy.createExists = true;
    policy.policyName = createMatch[1];
    policy.tableName = createMatch[2];
    policy.command = createMatch[3];
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

  // Check document_id (unqualified) reference
  if (/\bdocument_id\b/.test(content)) {
    policy.referencesDocumentId = true;
  }

  // Check auth.uid() reference
  if (/auth\.uid\(\)/.test(content)) {
    policy.referencesAuthUid = true;
  }

  // Check JOIN to project_documents
  if (/FROM\s+public\.project_documents\s+pd/i.test(content)) {
    policy.joinsProjectDocuments = true;
  }

  return policy;
}

describe('RLS UPDATE policy migration - static structural validation', () => {
  let migrationContent: string;

  beforeAll(() => {
    migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8');
  });

  it('migration file exists and is readable', () => {
    expect(fs.existsSync(MIGRATION_PATH)).toBe(true);
    expect(migrationContent.length).toBeGreaterThan(0);
  });

  describe('DROP POLICY IF EXISTS', () => {
    it('has DROP POLICY IF EXISTS before CREATE', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.dropExists).toBe(true);
    });

    it('drop policy name matches create policy name', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.dropName).toBe(parsed.policyName);
    });
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

    it('targets project_document_versions table', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.tableName).toContain('project_document_versions');
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
    it('references has_project_access(auth.uid(), ...)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.referencesHasProjectAccess).toBe(true);
      expect(parsed.referencesAuthUid).toBe(true);
    });

    it('references document_id unqualified (matches existing policies)', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.referencesDocumentId).toBe(true);
    });

    it('joins project_documents table with pd alias', () => {
      const parsed = parseMigrationSQL(migrationContent);
      expect(parsed.joinsProjectDocuments).toBe(true);
    });
  });

  describe('Policy naming convention', () => {
    it('policy name follows "Users can <verb> versions on accessible docs" pattern', () => {
      const parsed = parseMigrationSQL(migrationContent);
      const pattern = /^Users can \w+ versions on accessible docs$/;
      expect(parsed.policyName).toMatch(pattern);
      // Specifically: "update"
      expect(parsed.policyName).toContain('update');
    });
  });

  describe('Edge cases - SQL safety', () => {
    it('does not contain any DML (INSERT/UPDATE/DELETE on data)', () => {
      // The migration should only define policies, not modify data
      // Remove all policy DDL statements first
      const dmlWithoutPolicy = migrationContent
        .replace(/--.*$/gm, '')  // Strip comments first — comments use "UPDATE" in prose
        .replace(/CREATE\s+POLICY.*?FOR\s+(SELECT|INSERT|UPDATE|DELETE).*?;/gis, '')
        .replace(/DROP\s+POLICY.*?;/gis, '');

      // After removing policy statements, there should be no INSERT/UPDATE/DELETE
      // Use word boundary checks that don't match inside DDL keywords
      const remainingDML = dmlWithoutPolicy.match(
        /\bINSERT\s+INTO\b|\bUPDATE\s+(?!ON\b)(?!SET\b)|\bDELETE\s+FROM\b/gi,
      );
      expect(remainingDML).toBeNull();
    });

    it('has consistent semicolon placement', () => {
      // Each statement should end with semicolon
      const statements = migrationContent
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      expect(statements.length).toBeGreaterThanOrEqual(2); // DROP + CREATE
    });
  });
});

describe('Policy consistency with existing policies', () => {
  it('existing SELECT policy matching pattern', () => {
    // The SELECT policy uses:
    // USING (EXISTS (SELECT 1 FROM public.project_documents pd
    //   WHERE pd.id = document_id
    //   AND public.has_project_access(auth.uid(), pd.project_id)))
    const migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8');

    // Verify the USING clause structure matches the existing SELECT policy
    const usingMatch = migrationContent.match(/USING\s*\(([\s\S]*?)\)\s*WITH\s+CHECK/i);
    if (usingMatch) {
      const usingClause = usingMatch[1];
      expect(usingClause).toContain('EXISTS');
      expect(usingClause).toContain('SELECT 1');
      expect(usingClause).toContain('public.project_documents');
      expect(usingClause).toContain('pd.id = document_id');
      expect(usingClause).toContain('public.has_project_access(auth.uid(), pd.project_id)');
    }
  });

  it('WITH CHECK clause matches USING (standard Supabase pattern)', () => {
    const migrationContent = fs.readFileSync(MIGRATION_PATH, 'utf-8');

    const usingMatch = migrationContent.match(/USING\s*\(([\s\S]*?)\)\s*WITH\s+CHECK\s*\(([\s\S]*?)\)\s*;/i);
    if (usingMatch) {
      const usingClause = usingMatch[1].trim();
      const withCheckClause = usingMatch[2].trim();

      // For simple access-check policies, USING and WITH CHECK should be identical
      // (both check that the user has project access to the document)
      expect(usingClause.replace(/\s+/g, ' ')).toBe(
        withCheckClause.replace(/\s+/g, ' '),
      );
    }
  });
});
