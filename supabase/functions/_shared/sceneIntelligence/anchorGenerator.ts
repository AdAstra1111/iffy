/**
 * Anchor Generator — Scene Intelligence Package v1.2
 *
 * Generates deterministic dependency_anchors from scene_consequence
 * and scene data. Anchors are lightweight noun phrases for NDG tracing.
 * No ontology. No graph database. Just TEXT[].
 */

export function generateAnchors(
  sceneConsequence: string | null,
  characterKeys: string[],
  locationKey: string | null,
): string[] {
  if (!sceneConsequence) return [];

  const anchors: string[] = [];
  const lower = sceneConsequence.toLowerCase();

  // 1. Character involvement anchors
  for (const char of characterKeys) {
    const norm = char.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (lower.includes(char.toLowerCase().split(' ')[0]?.toLowerCase() || '')) {
      anchors.push(`${norm}_involved`);
    }
  }

  // 2. Location anchor
  if (locationKey) {
    anchors.push(`location_${locationKey.replace(/[^a-z0-9]/g, '_')}`);
  }

  // 3. Knowledge/revelation anchors: "reveal", "discovers", "finds", "uncovers"
  const revealMatch = sceneConsequence.match(/(?:reveals?|discovers?|finds?|uncovers?|learns?|realizes?)\s+(.+?)(?:\.|,|$)/i);
  if (revealMatch) {
    const obj = revealMatch[1].trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    anchors.push(`reveal_${obj}`);
    anchors.push(`knowledge_${obj}`);
  }

  // 4. Gain/loss anchors: "gain", "acquires", "obtains", "receives", "loses"
  const gainMatch = sceneConsequence.match(/(?:gains?|acquires?|obtains?|receives?|loses?|gets?)\s+(.+?)(?:\.|,|$)/i);
  if (gainMatch) {
    const obj = gainMatch[1].trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    anchors.push(obj);
  }

  // 5. Relationship anchors: "trust", "betray", "ally", "oppose", "confront", "reconcile"
  const relVerbs = ['trust', 'betray', 'ally', 'oppose', 'confront', 'reconcile', 'join', 'leave', 'help', 'save', 'threaten'];
  for (const verb of relVerbs) {
    if (lower.includes(verb)) {
      anchors.push(`relationship_${verb}_${sceneConsequence.substring(0, 20).toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
      break;
    }
  }

  // 6. Mission/progress anchors
  if (/mission|quest|objective|goal/i.test(lower)) {
    anchors.push(`mission_progress_${sceneConsequence.substring(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
  }

  // 7. Location change anchor
  if (/arrives?|enters?|leaves?|exits?|returns?|reaches?|approaches?/i.test(lower)) {
    anchors.push(`movement_${sceneConsequence.substring(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
  }

  // 8. Consequence significance — state change
  if (/changes?|transforms?|shifts?|turns?|becomes/i.test(lower)) {
    anchors.push(`state_change_${sceneConsequence.substring(0, 25).toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
  }

  return [...new Set(anchors)].slice(0, 8); // Max 8 anchors per scene
}
