
import { computeObligationTopology, computeTensionField, computeObligationCharge, computeDeferredIntimacy, computeNarrativeDensity } from "./obligation-topology.ts";
import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";

const options = {
    projectId: "proj-balanced",
    sceneId: "scene-balanced",
    sceneNumber: 1,
    sceneText: "A balanced scene with moderate everything.",
    characterKeys: ["CHAR_A", "CHAR_B", "CHAR_C"],
    beats: [
      { beatType: "transitional", short: "Scene unfolds", characters: ["CHAR_A"] },
      { beatType: "transitional", short: "More development", characters: ["CHAR_B"] },
    ],
};

const result = computeObligationTopology(options);

console.log("TENSION aggregateScore:", result.tensionField.aggregateScore);
console.log("TENSION aggregateDirection:", result.tensionField.aggregateDirection);
console.log("TENSION pairTensions:", JSON.stringify(result.tensionField.pairTensions));
console.log("OBLIGATION chargeScore:", result.obligationCharge.chargeScore);
console.log("OBLIGATION outstanding:", result.obligationCharge.outstanding.length);
console.log("OBLIGATION overdue:", result.obligationCharge.overdueCount);
console.log("DEFERRED aggregateIndex:", result.deferredIntimacy.aggregateIndex);
console.log("DEFERRED pairStates:", JSON.stringify(result.deferredIntimacy.pairStates));
console.log("DENSITY score:", result.narrativeDensity.score);
console.log("DENSITY band:", result.narrativeDensity.band);
console.log("NARRATIVE_PRESSURE:", result.narrativePressure);
console.log("DOMINANT_MODE:", result.dominantMode);
console.log("SIGNALS:", JSON.stringify(result.signals));
