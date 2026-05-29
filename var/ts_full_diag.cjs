#!/usr/bin/env node
/**
 * Full TS diagnostic report on chunkRunner.ts
 */
const ts = require('typescript');
const fs = require('fs');

const source = fs.readFileSync('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'utf8');

// Get all diagnostics from the full compiler
const compilerHost = ts.createCompilerHost({
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.ESNext,
  strict: false,
  noEmit: true,
  allowJs: true,
}, true);

// Create a program
const program = ts.createProgram({
  rootNames: ['/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts'],
  options: {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    strict: false,
    noEmit: true,
    allowJs: true,
    noResolve: true,
    skipLibCheck: true,
  },
  host: compilerHost,
});

const syntacticDiagnostics = program.getSyntacticDiagnostics();
const semanticDiagnostics = program.getSemanticDiagnostics();

console.log('=== Syntactic Diagnostics (parse errors) ===');
for (const d of syntacticDiagnostics) {
  if (d.file) {
    const pos = d.file.getLineAndCharacterOfPosition(d.start);
    console.log(`  ${d.file.fileName}:${pos.line+1}:${pos.character+1}: ${d.messageText}`);
  } else {
    console.log(`  ${d.messageText}`);
  }
}

console.log('\n=== Semantic Diagnostics (type errors) ===');
const parseErrors = semanticDiagnostics.filter(d => {
  const msg = String(d.messageText);
  return msg.includes('} expected') || msg.includes('{ expected');
});
for (const d of parseErrors) {
  if (d.file) {
    const pos = d.file.getLineAndCharacterOfPosition(d.start);
    console.log(`  ${d.file.fileName}:${pos.line+1}:${pos.character+1}: ${d.messageText}`);
  } else {
    console.log(`  ${d.messageText}`);
  }
}

console.log(`\nTotal syntactic: ${syntacticDiagnostics.length}`);
console.log(`Total semantic: ${semanticDiagnostics.length}`);