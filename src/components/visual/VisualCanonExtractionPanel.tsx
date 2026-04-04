/**
 * VisualCanonExtractionPanel — Creative Design Primitives surface.
 *
 * ROLE: derived_artistic_synthesis (per UI_SURFACE_BOUNDARIES.CREATIVE_DESIGN_PRIMITIVES)
 * Shows derived artistic visual systems from project canon — NOT canonical truth, NOT signals.
 * Upstream truth belongs to Source Truth. Structured signals belong to VisualCanonSignals.
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { useVisualCanonExtraction } from '@/hooks/useVisualCanonExtraction';
import { VISUAL_CANON_CATEGORIES, type VisualCanonPrimitive, type VisualCanonCategory } from '@/lib/visual/visualCanonExtractor';

interface Props {
  projectId: string;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const cls = confidence === 'high'
    ? 'bg-green-500/10 text-green-600 border-green-500/20'
    : confidence === 'medium'
      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
      : 'bg-muted text-muted-foreground border-border/30';
  return <Badge className={`text-[9px] ${cls}`}>{confidence}</Badge>;
}

function PrimitiveCard({ primitive }: { primitive: VisualCanonPrimitive }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border/30 bg-card/30 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{primitive.label}</span>
        <ConfidenceBadge confidence={primitive.confidence} />
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
        {primitive.evidence_text}
      </p>

      {primitive.source_excerpt && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Hide' : 'Show'} excerpt
        </button>
      )}

      {expanded && primitive.source_excerpt && (
        <p className="text-[10px] text-muted-foreground/80 italic border-l-2 border-primary/20 pl-2 mt-1">
          "…{primitive.source_excerpt}…"
        </p>
      )}

      <div className="flex flex-wrap gap-1 mt-1">
        {primitive.linked_characters.map(c => (
          <Badge key={c} variant="outline" className="text-[9px] border-blue-500/30 text-blue-600">
            {c}
          </Badge>
        ))}
        {primitive.thematic_functions.slice(0, 3).map(t => (
          <Badge key={t} variant="outline" className="text-[9px]">
            {t}
          </Badge>
        ))}
        {primitive.visual_functions.slice(0, 2).map(v => (
          <Badge key={v} variant="outline" className="text-[9px] border-purple-500/30 text-purple-600">
            {v}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function CategorySection({ category, primitives }: {
  category: typeof VISUAL_CANON_CATEGORIES[number];
  primitives: VisualCanonPrimitive[];
}) {
  const [open, setOpen] = useState(primitives.length > 0);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-foreground">{category.label}</h4>
          <Badge variant="outline" className="text-[9px]">{primitives.length}</Badge>
        </div>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      {open && (
        primitives.length > 0 ? (
          <div className="grid gap-2">
            {primitives.map(p => <PrimitiveCard key={p.key} primitive={p} />)}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground/60 italic pl-2">
            No primitives extracted for this category.
          </p>
        )
      )}
    </div>
  );
}

export function VisualCanonExtractionPanel({ projectId }: Props) {
  const {
    extraction, coverage, loading, hasCanon, extract, extracting,
  } = useVisualCanonExtraction(projectId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading visual canon…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary/70" />
            Creative Design Primitives
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Derived artistic visual systems from upstream source truth — not canonical truth itself.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => extract()}
          disabled={extracting || !hasCanon}
          className="text-xs h-7"
        >
          {extracting ? (
            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Extracting…</>
          ) : (
            <><Sparkles className="h-3 w-3 mr-1" /> {extraction ? 'Re-extract' : 'Extract'}</>
          )}
        </Button>
      </div>

      {/* Coverage summary */}
      {coverage && (
        <div className="rounded-lg border border-border/30 bg-card/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground">
              {coverage.total} primitives extracted
            </span>
            <span className="text-[10px] text-muted-foreground">
              v{coverage.version} • {new Date(coverage.extracted_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VISUAL_CANON_CATEGORIES.map(cat => {
              const count = coverage[cat.key as keyof typeof coverage];
              return (
                <Badge
                  key={cat.key}
                  variant="outline"
                  className={`text-[9px] ${typeof count === 'number' && count > 0
                    ? 'border-green-500/30 text-green-600'
                    : 'border-border/30 text-muted-foreground/50'
                  }`}
                >
                  {cat.label}: {typeof count === 'number' ? count : 0}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {!hasCanon && (
        <p className="text-xs text-muted-foreground italic">
          No canon data available. Add project canon first.
        </p>
      )}

      {/* Category sections */}
      {extraction && (
        <div className="space-y-4">
          {VISUAL_CANON_CATEGORIES.map(cat => (
            <CategorySection
              key={cat.key}
              category={cat}
              primitives={extraction[cat.key] || []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
