const fs = require('fs');
const src = fs.readFileSync('src/hooks/useDevEngineV2.ts','utf8');

const concurrencyCode = `
// Concurrency limiter — prevents Chrome 6-connection-per-host limit exhaustion
// when 20+ hooks call dev-engine-v2 simultaneously on page load.
const ENGINE_V2_MAX_CONCURRENT = 3;
let engineV2InFlight = 0;
const engineV2Queue = [];

async function acquireEngineV2Slot() {
  if (engineV2InFlight < ENGINE_V2_MAX_CONCURRENT) { engineV2InFlight++; return; }
  return new Promise(r => engineV2Queue.push(() => { engineV2InFlight++; r(); }));
}
function releaseEngineV2Slot() {
  engineV2InFlight--;
  const next = engineV2Queue.shift();
  if (next) next();
}
`;

// Find the function boundaries
const funcStart = src.indexOf('async function callEngineV2');
let depth = 0;
let funcEnd = funcStart;
for (let i = funcStart; i < src.length; i++) {
  if (src[i] === '{') depth++;
  if (src[i] === '}') {
    depth--;
    if (depth === 0) { funcEnd = i; break; }
  }
}

const oldFunc = src.slice(funcStart, funcEnd + 1);

// Build new function by inserting acquire/release
const lines = oldFunc.split('\n');
const newLines = [];
let inBody = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('async function callEngineV2')) {
    newLines.push(line.replace('{', '{'));
    newLines.push('  await acquireEngineV2Slot();');
    newLines.push('  try {');
    inBody = true;
  } else if (inBody && line.trim() === 'return result;') {
    newLines.push('    return result;');
    newLines.push('  } finally {');
    newLines.push('    releaseEngineV2Slot();');
    newLines.push('  }');
    inBody = false;
  } else if (inBody) {
    newLines.push(line);
  }
}

const newFunc = newLines.join('\n');
const result = src.replace(oldFunc, concurrencyCode + '\n' + newFunc);
fs.writeFileSync('src/hooks/useDevEngineV2.ts', result);
console.log('OK');
