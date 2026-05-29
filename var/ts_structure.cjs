#!/usr/bin/env node
/**
 * Use TS compiler API to visualize the file structure.
 */
const ts = require('typescript');
const fs = require('fs');

const source = fs.readFileSync('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'utf8');

const sourceFile = ts.createSourceFile(
  'chunkRunner.ts', source,
  ts.ScriptTarget.Latest, true,
  ts.ScriptKind.TS
);

function nodeInfo(node, indent) {
  const kind = ts.SyntaxKind[node.kind];
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  
  let name = '';
  if (node.name) name = node.name.text || node.name.escapedText || '';
  
  console.log(`${indent}[${start.line+1}:${start.character+1}-${end.line+1}:${end.character+1}] ${kind} ${name}`);
  
  if (node.body && ts.isFunctionLike(node)) {
    // Show the body
    ts.forEachChild(node, child => {
      if (child === node.body) {
        nodeInfo(child, indent + '  ');
      }
    });
  } else {
    ts.forEachChild(node, child => nodeInfo(child, indent + '  '));
  }
}

// Show top-level statements
console.log('=== Top-level statements ===');
for (const stmt of sourceFile.statements) {
  nodeInfo(stmt, '');
}