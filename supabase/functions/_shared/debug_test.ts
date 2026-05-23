import { statesAreEquivalent } from "./holographic-canon.ts";

// Debug attractor comparison
const a = {
  stateId: "state-1",
  projectId: "proj-test-1",
  computedAt: "2026-01-01T00:00:00Z",
  inputHash: "abc123",
  modelVersion: 1,
  attractors: {
    alice: { entityKey: "alice", entityType: "character", label: "Alice", position: [0.1, 0.2, 0.3], canonicalMass: 0.8, resolutionDensity: 0.9, stability: 0.85, constitutionalLayer: "core" },
    bob: { entityKey: "bob", entityType: "character", label: "Bob", position: [0.4, 0.5, 0.6], canonicalMass: 0.6, resolutionDensity: 0.7, stability: 0.75, constitutionalLayer: "core" },
  },
  tensionVectors: {},
  obligationField: [],
  resolutionDensity: { perAttractor: {}, perScene: {}, fieldAggregate: 0.75 },
  thermodynamics: { totalEnergy: 0.65, entropy: 0.4, narrativeTemperature: "temperate", interferenceNoise: 0.2, resonanceStability: 0.7, dominantRegime: "sustaining" },
};

const b = {
  ...a,
  attractors: {
    ...a.attractors,
    alice: { ...a.attractors.alice, canonicalMass: 0.9 },
  },
};

console.log("A attractors JSON:", JSON.stringify(a.attractors, Object.keys(a.attractors).sort()));
console.log("B attractors JSON:", JSON.stringify(b.attractors, Object.keys(b.attractors).sort()));
console.log("Equal?:", JSON.stringify(a.attractors, Object.keys(a.attractors).sort()) === JSON.stringify(b.attractors, Object.keys(b.attractors).sort()));
console.log("statesAreEquivalent:", statesAreEquivalent(a as any, b as any));
