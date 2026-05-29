#!/usr/bin/env node
/**
 * Use TypeScript compiler API to find exact brace mismatch.
 */
const ts = require('typescript');

const fs = require('fs');
const source = fs.readFileSync('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'utf8');

// Parse and get diagnostics
const sourceFile = ts.createSourceFile(
  'chunkRunner.ts',
  source,
  ts.ScriptTarget.Latest,
  true, // setParentNodes
  ts.ScriptKind.TS
);

// Check for parse errors
const parseDiagnostics = sourceFile.parseDiagnostics;
for (const d of parseDiagnostics) {
  const pos = d.file ? d.file.getLineAndCharacterOfPosition(d.start) : null;
  console.log(`Error: ${d.messageText}`);
  if (pos) console.log(`  at line ${pos.line + 1}, col ${pos.character + 1}`);
}

// Use the scanner to find the exact structure
console.log('\n--- Walking the AST for brace imbalance ---');

// Walk all nodes and find their positions
let depth = 0;
let maxDepth = 0;

function walk(node, depth) {
  if (depth > maxDepth) maxDepth = depth;
  if (depth > 50) {
    // Too deep, show where we are
    const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    const kind = ts.SyntaxKind[node.kind];
    console.log(`  Deep nesting at line ${pos.line+1}:${pos.character+1} to ${end.line+1}:${end.character+1} [${kind}]`);
  }
  ts.forEachChild(node, child => walk(child, depth + 1));
}

try {
  walk(sourceFile, 0);
} catch(e) {
  console.log(`Walk error: ${e.message}`);
}