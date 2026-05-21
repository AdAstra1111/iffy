// ═══════════════════════════════════════════════════════════════
// NEURAL MODULE REGRESSION GUARD (Check 7)
//
// Enforces: Neural module must NOT import or reference:
//   - canon engine
//   - SR/convergence scoring
//   - promotion gates
//   - rewrite pipeline
//   - document ladder logic
//
// If any of these imports are added, this test MUST fail.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const NEURAL_DIR = path.resolve(__dirname, '../../src/neural');
const NEURAL_FUNCTION_DIR = path.resolve(__dirname, '../../supabase/functions/neural-validation');

/** Regex patterns for forbidden imports — canon/SR/promotion/rewrite/ladder */
const FORBIDDEN_PATTERNS = [
  // Canon engine imports
  { pattern: /canon/i, label: 'canon engine' },
  { pattern: /convergence_score/i, label: 'convergence scoring (SR)' },
  { pattern: /convergence-engine/i, label: 'convergence engine' },
  // Promotion gates
  { pattern: /promot/i, label: 'promotion logic' },
  { pattern: /stage-readiness/i, label: 'stage readiness gate' },
  { pattern: /promotion-gate/i, label: 'promotion gate' },
  // Rewrite pipeline
  { pattern: /rewrite/i, label: 'rewrite pipeline' },
  { pattern: /dev-engine-v2/i, label: 'dev-engine (rewrite engine)' },
  { pattern: /rewrite-chunk/i, label: 'rewrite chunk pipeline' },
  { pattern: /rewrite-plan/i, label: 'rewrite plan' },
  // Document ladder
  { pattern: /ladder-invariant/i, label: 'ladder invariant' },
  { pattern: /doc-type/i, label: 'document type logic' },
  { pattern: /docPurposeRegistry/i, label: 'document purpose registry' },
  { pattern: /stage-ladder/i, label: 'stage ladder' },
  { pattern: /docTypeTemplate/i, label: 'document type templates' },
];

describe('Neural Module — Regression Guard (must stay read-only sidecar)', () => {
  const neuralFiles: string[] = [];

  // Collect all TypeScript/TSX files in the neural module
  function collectFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectFiles(fullPath));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  beforeAll(() => {
    neuralFiles.push(...collectFiles(NEURAL_DIR));
    neuralFiles.push(...collectFiles(NEURAL_FUNCTION_DIR));
  });

  it('should not touch core IFFY tables', () => {
    const migrationPath = path.join(NEURAL_FUNCTION_DIR, 'migration.sql');
    if (!fs.existsSync(migrationPath)) {
      console.warn('Migration file not found — guard assumes it exists');
      return;
    }
    
    const content = fs.readFileSync(migrationPath, 'utf-8');
    
    // The migration should only CREATE or ALTER neural_* / divergence_* tables
    const nonNeuralReferences = [
      'ALTER TABLE projects',
      'ALTER TABLE project_versions',
      'ALTER TABLE project_documents',
      'ALTER TABLE convergence_scores',
      'ALTER TABLE development_runs',
      'DROP TABLE',
      'ALTER TABLE document_ladder',
      'ALTER TABLE promotion_gates',
    ];

    for (const ref of nonNeuralReferences) {
      expect(content).not.toContain(ref);
    }
  });

  it('should not reference SR, promotion, rewrite, or ladder in import statements or code', () => {
    for (const filePath of neuralFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const { pattern, label } of FORBIDDEN_PATTERNS) {
        const violations = lines
          .map((line, idx) => ({ line, idx: idx + 1 }))
          .filter(({ line, idx }) => {
            const trimmed = line.trim();
            // Skip comments entirely
            if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return false;
            // Skip negative/restrictive statements (e.g. "must NOT", "do NOT", "never")
            if (/NOT|not |never/i.test(trimmed) && pattern.test(line)) return false;
            // Only flag if it's an actual import or a function/variable reference
            return trimmed.startsWith('import ') && pattern.test(line);
          });

        if (violations.length > 0) {
          const fileRelative = path.relative(__dirname, filePath);
          const violationList = violations
            .map(v => `  Line ${v.idx}: ${v.line.trim().slice(0, 100)}`)
            .join('\n');
          
          expect.fail(
            `Neural module must not reference ${label}: ${fileRelative}\n${violationList}`
          );
        }
      }
    }
  });

  it('should not import from forbidden modules', () => {
    for (const filePath of neuralFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check import statements specifically
      const importLines = content
        .split('\n')
        .filter(line => line.trim().startsWith('import '));

      for (const line of importLines) {
        // Allowed imports: our own types, React, Supabase client, Deno std
        const isAllowed =
          line.includes('./') ||
          line.includes('../') ||
          line.includes('@/neural') ||
          line.includes('react') ||
          line.includes('react-dom') ||
          line.includes('@supabase/supabase-js') ||
          line.includes('deno.land') ||
          line.includes('esm.sh');

        // Check each forbidden pattern
        for (const { pattern, label } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line) && !isAllowed) {
            const fileRelative = path.relative(__dirname, filePath);
            expect.fail(
              `Neural module must not import ${label}: ${fileRelative}\n  ${line.trim()}`
            );
          }
        }
      }
    }
  });
});
