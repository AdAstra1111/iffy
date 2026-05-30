/**
 * CDG Integrity Audit — SESS-ARCH-0026 Compliance.
 * Validates 10 structural invariants. Run: npx tsx scripts/cdg-integrity-audit.ts
 */
import { ALL_CDG_NODES, CDG_EDGES, getUpstreamDependencies, getDownstreamDependents, hashDependencyGraph } from '../src/lib/cdg/registry';
import { CDG_NODE_NAMES, CDG_REGEN_ORDER, CDG_NODE_DESCRIPTIONS, PCP_INVALIDATION_MATRIX, CDG_LAYER_ORDER, CDG_NODE_LAYERS, type CDGNodeID } from '../src/lib/cdg/types';
import { computeInvalidation, sortByRegenerationOrder } from '../src/lib/cdg/invalidator';
import { canTransition } from '../src/lib/cdg/status';
import { initProvenanceChain, extendProvenanceChain } from '../src/lib/cdg/provenance';
import { explainStaleness, getGovernanceDashboard, getAlerts } from '../src/lib/cdg/governance';
import { migrateCDGBootstrap } from '../src/lib/cdg/migration';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) { passed++; console.log('  OK ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ': ' + detail : '')); }
}

console.log('\n=== CDG INTEGRITY AUDIT ===\n');

// 1. Node completeness
console.log('1. NODE COMPLETENESS');
check('35 nodes', ALL_CDG_NODES.length === 35, 'got ' + ALL_CDG_NODES.length);
check('names', ALL_CDG_NODES.every(n => CDG_NODE_NAMES[n]));
check('descriptions', ALL_CDG_NODES.every(n => CDG_NODE_DESCRIPTIONS[n]));
check('layers', ALL_CDG_NODES.every(n => CDG_NODE_LAYERS[n]));
check('regen order', ALL_CDG_NODES.every(n => typeof CDG_REGEN_ORDER[n] === 'number'));

// 2. Layer distribution
console.log('\n2. LAYER DISTRIBUTION');
for (const l of CDG_LAYER_ORDER) {
  const count = ALL_CDG_NODES.filter(n => CDG_NODE_LAYERS[n] === l).length;
  check(l + ' has nodes', count > 0, 'count=' + count);
}

// 3. Edge coverage
console.log('\n3. EDGE COVERAGE');
check('65+ edges', CDG_EDGES.length >= 65, 'got ' + CDG_EDGES.length);
check('hash deterministic', hashDependencyGraph() === hashDependencyGraph());

// 4. No orphan nodes
console.log('\n4. ORPHAN CHECK');
for (const n of ALL_CDG_NODES) {
  const up = getUpstreamDependencies(n);
  const down = getDownstreamDependents(n);
  const layer = CDG_NODE_LAYERS[n];
  if (layer !== 'narrative') check(n + ' has upstream', up.length > 0);
  if (layer !== 'projection') check(n + ' has downstream', down.length > 0);
}

// 5. Invalidation matrix
console.log('\n5. INVALIDATION MATRIX');
const pcpNodes = ['P1','P2','P3','P4','P5','P6','P7','P8'];
const cpieNodes = ['C1','C2','C3','C4','C5','C6','C7'];
for (const p of pcpNodes) {
  check(p + ' in matrix', !!PCP_INVALIDATION_MATRIX[p]);
  const t = PCP_INVALIDATION_MATRIX[p];
  check(p + ' no dups', new Set(t).size === t.length);
  for (const x of t) check(p + ' -> ' + x + ' valid', cpieNodes.includes(x));
}
check('P2 covers all 7 CPIE', PCP_INVALIDATION_MATRIX['P2'].length === 7);
check('P7 covers only 2', PCP_INVALIDATION_MATRIX['P7'].length === 2);

// 6. Regen order
console.log('\n6. REGEN ORDER');
check('N nodes order 0', ALL_CDG_NODES.filter(n => n.startsWith('N')).every(n => CDG_REGEN_ORDER[n] === 0));
check('P nodes order 1', ALL_CDG_NODES.filter(n => n.startsWith('P')).every(n => CDG_REGEN_ORDER[n] === 1));
const sorted = sortByRegenerationOrder(['D1','C1','P2','S1'] as CDGNodeID[]);
check('sort correct', sorted.indexOf('P2') < sorted.indexOf('C1') && sorted.indexOf('C1') < sorted.indexOf('D1') && sorted.indexOf('D1') < sorted.indexOf('S1'));

// 7. State machine
console.log('\n7. STATE MACHINE');
const transitions: [string, string, boolean][] = [
  ['FRESH','STALE',true],['FRESH','CERTIFIED',true],['STALE','FRESH',true],
  ['STALE','INVALID',true],['CERTIFIED','STALE_WARNING',true],
  ['STALE_WARNING','STALE',true],['BLOCKED','STALE',true],
  ['STALE','CERTIFIED',false],['FRESH','INVALID',false],
];
for (const [from, to, expect] of transitions) {
  check(from + ' -> ' + to + ' = ' + expect, canTransition(from as any, to as any) === expect);
}

// 8. Provenance
console.log('\n8. PROVENANCE');
const chain = initProvenanceChain('D1.test', 'original', 0.9, 'extracted', ['source=A']);
const ext = extendProvenanceChain(chain, 'updated', 0.8, 'inferred', 'change', ['reason=B']);
check('original reasoning kept', ext.current_reasoning[0] === 'source=A');
check('new reasoning appended', ext.current_reasoning.includes('reason=B'));
check('count incremented', ext.regeneration_count === 1);
check('chain original immutable', chain.regeneration_count === 0 && chain.current_value === 'original');

// 9. Governance
console.log('\n9. GOVERNANCE');
const states = migrateCDGBootstrap('audit');
const now = new Date().toISOString();
for (const n of ['P2','C1','D1'] as CDGNodeID[]) {
  states.set(n, { ...states.get(n)!, status: 'STALE' as any, staleness_reason: 'test', last_updated: now });
}
const expl = explainStaleness('D1', states);
check('stale detected', expl.node.status === 'STALE');
check('trigger found', expl.triggered_by !== null);
check('cascade shown', expl.cascade.length >= 2);
const dash = getGovernanceDashboard(states);
check('dashboard 35 nodes', dash.total_nodes === 35 && dash.stale >= 3);
const alerts = getAlerts(states);
check('alerts generated', alerts.length >= 1);
check('valid severity', alerts.every(a => ['critical','warning','info'].includes(a.severity)));

// 10. Endurance
console.log('\n10. LIFECYCLE ENDURANCE');
for (let i = 0; i < 5; i++) {
  for (const p of pcpNodes) {
    const r = computeInvalidation(p as CDGNodeID);
    check('cycle' + i + ' ' + p + ' invalidates ' + r.directly_affected.length + ' CPIE', r.directly_affected.length > 0);
  }
}

console.log('\n=== RESULT: ' + passed + ' pass, ' + failed + ' fail, ' + (passed + failed) + ' total ===\n');
process.exit(failed > 0 ? 1 : 0);
