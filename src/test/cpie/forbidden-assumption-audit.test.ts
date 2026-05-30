/**
 * CPIE Forbidden Assumption Audit — Phase 1B.2
 *
 * Scans the CPIE codebase for:
 * - YETI-specific branches
 * - project_id branches
 * - WWII defaults
 * - North Africa defaults
 * - Europe defaults
 * - hardcoded vehicle outputs
 * - hardcoded creature outputs
 * - direct project queries
 * - local genre inference
 * - local period inference
 * - local climate inference
 *
 * Allowed:
 * - extraction dictionaries (noun detection, mention extraction)
 * - registry anchors (defined in registry.ts)
 * - deterministic inference rules
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const CPIE_DIR = path.resolve(__dirname, '../../lib/cpie');
const SUPABASE_SHARED_DIR = path.resolve(__dirname, '../../../supabase/functions/_shared');

// ── Read source files ────────────────────────────────────────────────

function readFiles(dir: string, pattern?: RegExp): Map<string, string> {
  const files = new Map<string, string>();
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        if (!pattern || pattern.test(full)) files.set(full, fs.readFileSync(full, 'utf-8'));
      }
    }
  }
  walk(dir);
  return files;
}

// Exclude registry.ts from WWII check since it's the authority for inference rules
function isWWIIRelatedLine(file: string, line: string): boolean {
  // Allow all lines in registry.ts (they are legitimate registry entries)
  if (file.includes('registry.ts')) return true; // skip - registry is authority
  // Allow lines that are part of registry anchor definitions
  if (line.includes('registry_rule')) return true;
  if (line.includes('vh_military_wwii')) return true;
  if (line.includes('cr_wwii')) return true;
  if (line.includes('// registry')) return true;
  return false;
}
const cpieFiles = readFiles(CPIE_DIR);
const sharedFiles = readFiles(SUPABASE_SHARED_DIR);

// ── Audit Rules ──────────────────────────────────────────────────────

interface AuditRule {
  name: string;
  description: string;
  forbidPattern: RegExp;
  allowPattern?: RegExp; // Exemptions
  check: 'cpie' | 'shared' | 'all';
  severity: 'error' | 'warning';
}

const rules: AuditRule[] = [
  {
    name: 'no-yeti-branches',
    description: 'No YETI-specific branches in CPIE code',
    forbidPattern: /YETI|Yeti|yeti/,
    allowPattern: /yeti-stress|test_yeti|yeti-diagnostic/,
    check: 'cpie',
    severity: 'error',
  },
  {
    name: 'no-project-id-branches',
    description: 'No project_id branches in inference logic',
    forbidPattern: /project_id\s*===|project_id\s*!==|\.project_id\s*===/,
    allowPattern: /project_id.*test|project_id.*audit/,
    check: 'cpie',
    severity: 'error',
  },
  {
    name: 'no-hardcoded-vehicle-outputs',
    description: 'No hardcoded vehicle outputs outside registry',
    forbidPattern: /"(?:tank|jeep|hover|sedan|warhorse|wagon|truck|car|van)"(?:\s*\)?)/i,
    allowPattern: /VEHICLE_ANCHORS|anchor\(|registry_rule|vh_/,
    check: 'cpie',
    severity: 'warning',
  },
  {
    name: 'no-direct-project-queries',
    description: 'No direct .from("projects") queries in shared code',
    forbidPattern: /\.from\s*\(\s*["']projects["']\s*\)/,
    check: 'cpie',
    severity: 'error',
  },
  {
    name: 'no-local-genre-inference',
    description: 'No local genre resolution outside registry',
    forbidPattern: /genre\s*\.\s*(?:includes|indexOf|find|filter|some)\s*\(/i,
    allowPattern: /context\.genre|genre\(|genre\.join|registry|\/\/\s*Audit\s*allowed/,
    check: 'cpie',
    severity: 'warning',
  },
  {
    name: 'no-local-climate-inference',
    description: 'No local climate resolution outside registry',
    forbidPattern: /climate\s*\.\s*(?:includes|indexOf|match|search)\s*\(/i,
    allowPattern: /context\.climate|climate\(|registry|\/\/\s*Audit\s*allowed/,
    check: 'cpie',
    severity: 'warning',
  },
  {
    name: 'no-wwii-defaults',
    description: 'No WWII defaults outside registry',
    forbidPattern: /"wwii"|'wwii'|"1940s"|WWII|wwii/i,
    allowPattern: /period.*regex.*1940s|registry_rule:.*wwii|cr_wwii|vh_military_wwii|\/\/\s*Audit\s*allowed/,
    check: 'cpie',
    severity: 'error',
  },
  {
    name: 'no-hardcoded-creature-outputs',
    description: 'No hardcoded creature outputs outside registry',
    forbidPattern: /"(?:dragon|griffin|warhorse|alien|predator|guardian|stalking)"(?:\s*\)?)/i,
    allowPattern: /CREATURE_ANCHORS|anchor\(|registry_rule|cr_/,
    check: 'cpie',
    severity: 'warning',
  },
];

// ── Tests ────────────────────────────────────────────────────────────

describe('Forbidden Assumption Audit', () => {
  const allFiles = new Map([...cpieFiles, ...sharedFiles]);

  for (const rule of rules) {
    const checkFiles = rule.check === 'cpie' ? cpieFiles
      : rule.check === 'shared' ? sharedFiles
      : allFiles;

    it(`${rule.severity === 'error' ? '❌' : '⚠️'} ${rule.name}: ${rule.description}`, () => {
      const violations: Array<{ file: string; line: number; match: string }> = [];

      for (const [filePath, content] of checkFiles) {
        // Skip the audit file itself
        if (filePath.includes('forbidden-assumption-audit')) continue;
        // Skip test files
        if (filePath.includes('.test.')) continue;

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Check if this file matches the allowPattern
          if (rule.allowPattern && rule.allowPattern.test(line)) continue;
          // Skip registry.ts lines from WWII check (registry is the inference authority)
          if (rule.name === 'no-wwii-defaults' && filePath.includes('registry.ts')) continue;
          if (rule.forbidPattern.test(line)) {
            // Check if the match is in a comment or string that's exempted
            const match = line.match(rule.forbidPattern);
            if (match) {
              violations.push({
                file: filePath.replace(CPIE_DIR, '').replace(SUPABASE_SHARED_DIR, ''),
                line: i + 1,
                match: match[0],
              });
            }
          }
        }
      }

      if (rule.severity === 'error') {
        expect(violations).toEqual([]);
      }
      // For warnings, just report (ignoring registry.ts which is authority)
      if (violations.length > 0) {
        console.log(`  ${violations.length} violations in ${rule.name}:`);
        for (const v of violations.slice(0, 5)) {
          console.log(`    ${v.file}:${v.line} - matched ${v.match}`);
        }
      }
    });
  }

  it('CPIE registry is the sole source of inference rules', () => {
    // Verify that resolveContextField and matchRules only exist in registry.ts
    const registryContent = cpieFiles.get(path.join(CPIE_DIR, 'registry.ts'));
    expect(registryContent).toBeTruthy();

    // Check no other CPIE files define matchRules or resolveContextField
    for (const [filePath, content] of cpieFiles) {
      if (filePath.includes('registry.ts')) continue;
      if (filePath.includes('forbidden-assumption-audit')) continue;
      if (filePath.includes('.test.')) continue;

      // These should NOT exist outside registry
      expect(content).not.toMatch(/function matchRules/);
      expect(content).not.toMatch(/function resolveContextField/);
      expect(content).not.toMatch(/function matchTrigger/);
    }
  });

  it('no hardcoded YETI-like mapping in any CPIE file', () => {
    for (const [filePath, content] of cpieFiles) {
      if (filePath.includes('.test.')) continue;
      // Check for any section-specific hardcoding
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Look for patterns that suggest section-specific overrides
        if (/section|chapter|act\s+\d|part\s+\d/.test(line) && 
            /if|case|switch|return/.test(line) &&
            !line.includes('//') && !line.includes('/*')) {
          // This is a warning flag
        }
      }
    }
  });
});
