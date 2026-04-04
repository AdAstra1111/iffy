/**
 * CharacterWardrobePanel — Review UI for extracted character wardrobe profiles.
 * Renders through the canonical effective profile resolver — no raw reads.
 */

import { useState } from 'react';
import { useCharacterWardrobe } from '@/hooks/useCharacterWardrobe';
import { useCanonicalTemporalTruth } from '@/hooks/useCanonicalTemporalTruth';
import { resolveEffectiveProfile, type EffectiveWardrobeProfile } from '@/lib/visual/effectiveProfileResolver';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ChevronDown, Shirt, Sparkles, Eye } from 'lucide-react';

interface Props {
  projectId: string;
}

export function CharacterWardrobePanel({ projectId }: Props) {
  const {
    extraction, coverage, loading, hasCanon,
    extract, extracting,
  } = useCharacterWardrobe(projectId);
  const { temporalTruth } = useCanonicalTemporalTruth(projectId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading wardrobe data…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground flex items-center gap-1.5">
            <Shirt className="h-4 w-4" /> Character Wardrobe Profiles
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Per-character wardrobe identity, state matrix, and costume change logic.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1.5"
          onClick={() => extract()}
          disabled={extracting || !hasCanon}
        >
          {extracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {extraction ? 'Re-extract' : 'Extract Wardrobes'}
        </Button>
      </div>

      {coverage && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          <Badge variant="outline">{coverage.profiles} characters</Badge>
          <Badge variant="outline">{coverage.totalStates} states</Badge>
          <Badge variant="outline" className="text-green-600">{coverage.explicitStates} explicit</Badge>
          <Badge variant="outline" className="text-amber-600">{coverage.inferredStates} inferred</Badge>
          <Badge variant="outline">v{coverage.version}</Badge>
        </div>
      )}

      {extraction && extraction.profiles.length > 0 ? (
        <div className="space-y-2">
          {extraction.profiles.map((profile) => (
            <CharacterProfileCard
              key={profile.character_id_or_key}
              profile={profile}
              states={extraction.state_matrix[profile.character_id_or_key] || []}
              temporalTruth={temporalTruth}
            />
          ))}
        </div>
      ) : !extraction ? (
        <p className="text-xs text-muted-foreground">
          No wardrobe profiles extracted yet. Click Extract to analyze characters.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          No characters found in canon.
        </p>
      )}
    </div>
  );
}

// ── Per-Character Card ──

function CharacterProfileCard({
  profile,
  states,
  temporalTruth,
}: {
  profile: ReturnType<typeof import('@/lib/visual/characterWardrobeExtractor').getCharacterWardrobeProfile> & {};
  states: ReturnType<typeof import('@/lib/visual/characterWardrobeExtractor').getCharacterWardrobeStates>;
  temporalTruth: import('@/lib/visual/temporalTruthResolver').TemporalTruth | null;
}) {
  const [open, setOpen] = useState(false);
  const ep = profile ? resolveEffectiveProfile(profile, temporalTruth) : null;
  if (!profile) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border border-border/30 bg-card/30 overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-foreground truncate">{profile.character_name}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {profile.class_status_expression}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 ${
                  profile.confidence === 'high' ? 'text-green-600 border-green-500/30' :
                  profile.confidence === 'medium' ? 'text-amber-600 border-amber-500/30' :
                  'text-muted-foreground'
                }`}
              >
                {profile.confidence}
              </Badge>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3 border-t border-border/20 pt-3">
            {/* Identity Summary — always use effective profile when available */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Identity</p>
              <p className="text-xs text-foreground">
                {/* IEL: raw wardrobe_identity_summary fallback only when no temporal truth exists (ep is null) */}
                {ep?.effective_identity_summary ?? profile.wardrobe_identity_summary}
              </p>
            </div>

            {/* Signature Garments & Accessories — always use effective garments */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Garments</p>
                <div className="flex flex-wrap gap-1">
                  {/* IEL: Always prefer effective_signature_garments. Raw fallback only when
                       no effective profile could be resolved (no temporal truth available). */}
                  {(ep?.effective_signature_garments ?? profile.signature_garments).length > 0
                    ? (ep?.effective_signature_garments ?? profile.signature_garments).map((g, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{g}</Badge>
                    ))
                    : <span className="text-[10px] text-muted-foreground">None extracted</span>}
                </div>
                {ep && ep.excluded_garments.length > 0 && (
                  <div className="mt-1">
                    <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Era-excluded</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {ep.excluded_garments.map((ex, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground/50 border-muted-foreground/20 line-through">
                          {ex.item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Accessories</p>
                <div className="flex flex-wrap gap-1">
                  {profile.signature_accessories.length > 0 ? profile.signature_accessories.map((a, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{a}</Badge>
                  )) : <span className="text-[10px] text-muted-foreground">None extracted</span>}
                </div>
              </div>
            </div>

            {/* Language Fields */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-muted-foreground">Silhouette:</span>{' '}
                <span className="text-foreground">{profile.silhouette_language}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Fabric:</span>{' '}
                <span className="text-foreground">{profile.fabric_language}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Palette:</span>{' '}
                <span className="text-foreground">{profile.palette_logic}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Damage/Wear:</span>{' '}
                <span className="text-foreground">{profile.damage_wear_logic}</span>
              </div>
            </div>

            {/* Variation Fields */}
            <div className="space-y-1 text-[11px]">
              <div><span className="text-muted-foreground">Public/Private:</span> <span className="text-foreground">{profile.public_private_variation}</span></div>
              <div><span className="text-muted-foreground">Labor/Formality:</span> <span className="text-foreground">{profile.labor_formality_variation}</span></div>
              <div><span className="text-muted-foreground">Ceremonial:</span> <span className="text-foreground">{profile.ceremonial_variation}</span></div>
            </div>

            {/* Constraints */}
            {profile.costume_constraints.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Constraints</p>
                <ul className="text-[11px] text-foreground space-y-0.5">
                  {profile.costume_constraints.map((c, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-muted-foreground">•</span> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* State Matrix */}
            {states.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Wardrobe States ({states.length})
                </p>
                <div className="space-y-1.5">
                  {states.map((state) => (
                    <div key={state.state_key} className="flex items-start gap-2 text-[11px]">
                      <Badge
                        variant="outline"
                        className={`text-[9px] shrink-0 mt-0.5 ${
                          state.explicit_or_inferred === 'explicit'
                            ? 'text-green-600 border-green-500/30'
                            : 'text-amber-600 border-amber-500/30'
                        }`}
                      >
                        {state.explicit_or_inferred === 'explicit' ? 'E' : 'I'}
                      </Badge>
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{state.label}</span>
                        <span className="text-muted-foreground ml-1">— {state.rationale}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
