/**
 * productionDesign — Deterministic production design system for lookbook world coherence.
 *
 * Resolves material palette, architecture style, and environment rules from canon.
 * Ensures all generated world/environment images share consistent physical reality.
 *
 * ENRICHMENT: When VisualCanonSignals are available via PDEnrichmentBundle,
 * this resolver merges upstream visual intent into PD truth. The enrichment is
 * ADDITIVE — it does NOT replace canonical PD resolution from project canon.
 * PD resolver remains the truth owner for production design.
 */

import type { PDEnrichmentBundle } from '@/lib/visual/visualCanonEnrichment';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProductionDesign {
  material_palette: string[];
  architecture_style: string;
  environment_rules: string[];
  /** Whether visual canon enrichment was applied */
  enrichment_applied?: boolean;
  /** Enrichment provenance */
  enrichment_source_version_id?: string | null;
}

// ── Default ──────────────────────────────────────────────────────────────────

export function getDefaultProductionDesign(): ProductionDesign {
  return {
    material_palette: ['natural wood', 'stone', 'fabric'],
    architecture_style: 'naturalistic contemporary',
    environment_rules: ['Grounded in physical reality', 'No fantastical elements unless canon-specified'],
  };
}

// ── Canon Resolver ───────────────────────────────────────────────────────────

/**
 * Resolve production design from project canon.
 * Extracts material/architecture/environment cues deterministically.
 *
 * ENRICHMENT: If pdEnrichment is provided (from VisualCanonSignals), it merges
 * additional materials, motifs, exclusions, and palette context. The enrichment
 * is additive — canonical PD resolution remains the truth owner.
 *
 * ARCHITECTURE: pdEnrichment must be a PDEnrichmentBundle from
 * visualCanonEnrichment.ts — never raw visual_canon_brief prose.
 */
export function resolveProductionDesignFromCanon(
  canonJson: Record<string, unknown> | null,
  pdEnrichment?: PDEnrichmentBundle | null,
): ProductionDesign {
  if (!canonJson) return getDefaultProductionDesign();

  const materials: string[] = [];
  const envRules: string[] = [];

  // Extract from world description
  const worldDesc = typeof canonJson.world_description === 'string' ? canonJson.world_description : '';
  const setting = typeof canonJson.setting === 'string' ? canonJson.setting : '';
  const combined = `${worldDesc} ${setting}`.toLowerCase();

  // Material palette inference from keywords
  const MATERIAL_KEYWORDS: Record<string, string> = {
    'wood': 'natural wood', 'timber': 'timber', 'stone': 'stone', 'marble': 'marble',
    'concrete': 'concrete', 'steel': 'steel', 'glass': 'glass', 'brick': 'brick',
    'ceramic': 'ceramic', 'clay': 'clay', 'fabric': 'fabric', 'silk': 'silk',
    'leather': 'leather', 'paper': 'paper', 'bamboo': 'bamboo', 'iron': 'iron',
    'gold': 'gold', 'copper': 'copper', 'bronze': 'bronze', 'straw': 'straw',
    'thatch': 'thatch', 'lacquer': 'lacquer', 'porcelain': 'porcelain',
  };

  for (const [keyword, material] of Object.entries(MATERIAL_KEYWORDS)) {
    if (combined.includes(keyword) && !materials.includes(material)) {
      materials.push(material);
    }
  }

  // Architecture style inference
  let architecture = 'naturalistic contemporary';
  const ARCH_KEYWORDS: Array<[string[], string]> = [
    [['feudal', 'castle', 'keep', 'fortress'], 'feudal/medieval'],
    [['edo', 'shogunate', 'samurai', 'daimyo'], 'traditional Japanese'],
    [['victorian', 'georgian', 'edwardian'], 'Victorian/Georgian'],
    [['modern', 'skyscraper', 'apartment'], 'modern urban'],
    [['rural', 'farm', 'village', 'cottage'], 'rural vernacular'],
    [['palace', 'court', 'throne'], 'palatial/aristocratic'],
    [['temple', 'shrine', 'monastery'], 'sacred/religious'],
    [['industrial', 'factory', 'warehouse'], 'industrial'],
    [['colonial', 'plantation'], 'colonial'],
    [['gothic', 'cathedral'], 'gothic'],
    [['art deco', 'nouveau'], 'art deco/nouveau'],
    [['brutalist'], 'brutalist'],
  ];

  for (const [keywords, style] of ARCH_KEYWORDS) {
    if (keywords.some(k => combined.includes(k))) {
      architecture = style;
      break;
    }
  }

  // Environment rules from canon
  if (canonJson.world_rules && Array.isArray(canonJson.world_rules)) {
    envRules.push(
      ...canonJson.world_rules
        .filter((r: any) => typeof r === 'string')
        .slice(0, 5),
    );
  }

  // Era-based environment rules
  const era = typeof canonJson.era === 'string' ? canonJson.era
    : typeof canonJson.period === 'string' ? canonJson.period
    : typeof canonJson.time_period === 'string' ? canonJson.time_period
    : '';

  if (era) {
    envRules.push(`Period: ${era} — all materials, technology, and architecture must be plausible for this era`);
  }

  // Costume language
  const costume = typeof canonJson.costume_language === 'string' ? canonJson.costume_language
    : typeof canonJson.wardrobe === 'string' ? canonJson.wardrobe
    : '';
  if (costume) {
    envRules.push(`Costume/wardrobe: ${costume}`);
  }

  // Fallback if nothing extracted
  if (materials.length === 0) {
    materials.push('natural wood', 'stone', 'fabric');
  }
  if (envRules.length === 0) {
    envRules.push('Grounded in physical reality');
  }

  // ── Visual Canon Enrichment (additive, non-authoritative) ──
  let enrichmentApplied = false;
  let enrichmentSourceVersionId: string | null = null;

  if (pdEnrichment) {
    enrichmentApplied = true;
    enrichmentSourceVersionId = pdEnrichment.source_version_id;

    // Merge material signals (deduplicate)
    for (const ms of pdEnrichment.material_signals) {
      const mat = ms.material.toLowerCase();
      if (mat && !materials.some(m => m.toLowerCase() === mat)) {
        materials.push(ms.material);
      }
    }

    // Merge exclusion signals as environment anti-rules
    for (const ex of pdEnrichment.exclusion_signals) {
      if (ex.excluded_element) {
        envRules.push(`EXCLUDE: ${ex.excluded_element} — ${ex.reason}`);
      }
    }

    // Merge motif recurrence hints
    for (const motif of pdEnrichment.motif_signals.slice(0, 3)) {
      if (motif.motif) {
        envRules.push(`Motif recurrence: ${motif.motif} (${motif.meaning})`);
      }
    }

    // PD philosophy as environment context (structured summary, not prose)
    if (pdEnrichment.pd_philosophy_summary) {
      envRules.push(`PD philosophy: ${pdEnrichment.pd_philosophy_summary.slice(0, 200)}`);
    }

    // Era classification reinforcement
    if (pdEnrichment.era_classification && !envRules.some(r => r.startsWith('Period:'))) {
      envRules.push(`Period: ${pdEnrichment.era_classification}`);
    }
  }

  return {
    material_palette: materials.slice(0, 12),
    architecture_style: architecture,
    environment_rules: envRules.slice(0, 10),
    enrichment_applied: enrichmentApplied,
    enrichment_source_version_id: enrichmentSourceVersionId,
  };
}

/**
 * Serialize production design into a prompt-injectable directive.
 */
export function serializeProductionDesign(pd: ProductionDesign): string {
  const lines = [
    '[PRODUCTION DESIGN — WORLD CONSISTENCY]',
    `MATERIALS: ${pd.material_palette.join(', ')}`,
    `ARCHITECTURE: ${pd.architecture_style}`,
  ];
  if (pd.environment_rules.length > 0) {
    lines.push('ENVIRONMENT RULES:');
    for (const rule of pd.environment_rules) {
      lines.push(`  - ${rule}`);
    }
  }
  lines.push('', 'All imagery must respect these production design constraints for world coherence.');
  return lines.join('\n');
}

/**
 * Compute a deterministic hash for production design provenance.
 */
export function hashProductionDesign(pd: ProductionDesign): string {
  return `${pd.architecture_style}|${pd.material_palette.sort().join(',')}`;
}
