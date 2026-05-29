#!/usr/bin/env node
/**
 * Use TypeScript scanner to tokenize the file and find the imbalance.
 * The scanner properly handles all string/comment/template edge cases.
 */
const ts = require('typescript');
const fs = require('fs');

const source = fs.readFileSync('/Users/laralane/code/iffy/supabase/functions/_shared/chunkRunner.ts', 'utf8');

// Create scanner
const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);

// Scan and count code-level braces
let token = scanner.scan();
let depth = 0;
let totalOpen = 0;
let totalClose = 0;
const unmatchedOpens = [];

while (token !== ts.SyntaxKind.EndOfFileToken) {
  const text = scanner.getTokenText();
  const pos = scanner.getTokenStart();
  const lineChar = getLineChar(source, pos);
  
  if (token === ts.SyntaxKind.OpenBraceToken) {
    depth++;
    totalOpen++;
    unmatchedOpens.push({ line: lineChar.line, col: lineChar.character, text: getContext(source, pos, 40) });
  } else if (token === ts.SyntaxKind.CloseBraceToken) {
    depth--;
    totalClose++;
    if (unmatchedOpens.length > 0) {
      unmatchedOpens.pop();
    }
  }
  
  token = scanner.scan();
}

console.log(`Total { tokens: ${totalOpen}`);
console.log(`Total } tokens: ${totalClose}`);
console.log(`Net depth at EOF: ${depth}`);
console.log(`Remaining on stack: ${unmatchedOpens.length}`);

if (unmatchedOpens.length > 0) {
  console.log('\n=== Unmatched opening braces ===');
  for (const b of unmatchedOpens) {
    console.log(`\nLine ${b.line}, col ${b.col}:`);
    console.log(`  Context: ${b.text}`);
  }
  console.log(`\n=== ROOT CAUSE ===`);
  const first = unmatchedOpens[0];
  console.log(`Line ${first.line}:${first.col} - ${first.text}`);
  showSourceContext(source, first.line, 3);
} else {
  console.log('\n=== Brace balance is PERFECT ===');
}

function getLineChar(source, pos) {
  const lines = source.substring(0, pos).split('\n');
  return { line: lines.length, character: lines[lines.length-1].length };
}

function getContext(source, pos, width) {
  const start = Math.max(0, pos - 20);
  const end = Math.min(source.length, pos + width);
  return source.substring(start, end).replace(/\n/g, '\\n').trim();
}

function showSourceContext(source, lineNum, contextLines) {
  const lines = source.split('\n');
  for (let i = Math.max(0, lineNum - contextLines - 1); i < Math.min(lines.length, lineNum + contextLines); i++) {
    const marker = i === lineNum - 1 ? ' >>>' : '    ';
    console.log(`${marker} ${i+1}: ${lines[i]}`);
  }
}