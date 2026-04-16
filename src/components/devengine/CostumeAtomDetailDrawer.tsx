/**
 * CostumeAtomDetailDrawer — full attribute display for a costume atom
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  Shirt, Palette, Star, Layers, Users, MapPin, Sparkles, Wrench,
  AlertTriangle, CheckCircle2, TrendingUp, Package, Scissors,
} from 'lucide-react';
import type { CostumeAtom, CostumeAtomAttributes } from '@/hooks/useCostumeAtoms';

interface CostumeAtomDetailDrawerProps {
  atom: CostumeAtom | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ReadinessBadge({ badge }: { badge: string }) {
  const map: Record<string, { label: string; className: string }> = {
    foundation: { label: 'Foundation', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    rich: { label: 'Rich', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    verified: { label: 'Verified', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  };
  const s = map[badge] || map.foundation;
  return <Badge className={`border ${s.className}`}>{s.label}</Badge>;
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

function TagList({
  items,
  color = 'bg-muted text-muted-foreground',
}: {
  items: string[];
  color?: string;
}) {
  if (!items || items.length === 0)
    return <span className="text-xs text-muted-foreground italic">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={i} className={`text-xs px-2 py-0.5 rounded ${color}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

function ColorDots({ colors }: { colors: string[] }) {
  if (!colors || colors.length === 0)
    return <span className="text-xs text-muted-foreground italic">None</span>;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {colors.map((color, i) => (
        <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-3.5 w-3.5 rounded-full border border-border/50"
            style={{ backgroundColor: color.toLowerCase() }}
          />
          {color}
        </span>
      ))}
    </div>
  );
}

export function CostumeAtomDetailDrawer({
  atom,
  open,
  onOpenChange,
}: CostumeAtomDetailDrawerProps) {
  const a = atom?.attributes as CostumeAtomAttributes | null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] sm:w-[600px] p-0 flex flex-col overflow-y-auto">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <Shirt className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <SheetTitle className="text-base font-semibold leading-tight">
                {a?.characterName
                  ? `${a.characterName} — Primary Costume`
                  : atom?.canonical_name || 'Costume'}
              </SheetTitle>
            </div>
            {a?.readinessBadge && <ReadinessBadge badge={a.readinessBadge} />}
          </div>
        </SheetHeader>

        {a ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Status row */}
            <div className="flex items-center gap-3 text-xs">
              <span
                className={`flex items-center gap-1 ${
                  a.generationStatus === 'completed'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {a.generationStatus === 'completed' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {a.generationStatus}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Confidence:{' '}
                {a.confidence != null
                  ? `${a.confidence > 1 ? a.confidence : Math.round(a.confidence * 100)}%`
                  : '—'}
              </span>
            </div>

            {/* Era + Silhouette */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Sparkles className="h-3 w-3" />} label="Era Alignment">
                {a.eraAlignment || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
              <Section icon={<Layers className="h-3 w-3" />} label="Silhouette">
                {a.silhouette || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
            </div>

            {/* Primary Outfit */}
            <Section icon={<Shirt className="h-3 w-3" />} label="Primary Outfit">
              {a.primaryOutfit || (
                <span className="text-xs text-muted-foreground italic">Not specified</span>
              )}
            </Section>

            {/* Character Signal */}
            <Section icon={<Star className="h-3 w-3" />} label="Character Signal">
              {a.characterSignal || (
                <span className="text-xs text-muted-foreground italic">Not specified</span>
              )}
            </Section>

            {/* Dominant Colors */}
            <Section icon={<Palette className="h-3 w-3" />} label="Dominant Colors">
              <ColorDots colors={a.dominantColors || []} />
            </Section>

            {/* Fabric & Texture */}
            <Section icon={<Layers className="h-3 w-3" />} label="Fabric & Texture">
              <TagList items={a.fabricAndTexture || []} />
            </Section>

            {/* Key Pieces */}
            <Section icon={<Package className="h-3 w-3" />} label="Key Pieces">
              <TagList items={a.keyPieces || []} color="bg-primary/10 text-primary" />
            </Section>

            {/* Distinctive Elements */}
            <Section icon={<Star className="h-3 w-3" />} label="Distinctive Elements">
              <TagList items={a.distinctiveElements || []} />
            </Section>

            {/* Fit & Movement + Condition */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Scissors className="h-3 w-3" />} label="Fit & Movement">
                {a.fitAndMovement || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
              <Section icon={<Shirt className="h-3 w-3" />} label="Condition">
                {a.condition || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
            </div>

            {/* Associated Locations + Characters */}
            <Section icon={<MapPin className="h-3 w-3" />} label="Associated Locations">
              <TagList items={a.associatedLocations || []} />
            </Section>
            <Section icon={<Users className="h-3 w-3" />} label="Associated Characters">
              <TagList items={a.associatedCharacters || []} />
            </Section>

            {/* Wardrobe Evolution */}
            {a.wardrobeEvolution && a.wardrobeEvolution.length > 0 && (
              <Section icon={<TrendingUp className="h-3 w-3" />} label="Wardrobe Evolution">
                <div className="space-y-2">
                  {a.wardrobeEvolution.map((evo, i) => (
                    <div key={i} className="bg-muted/50 rounded px-3 py-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-primary">{evo.act}</span>
                      </div>
                      <p className="text-xs text-foreground">{evo.description}</p>
                      {evo.trigger && (
                        <p className="text-xs text-muted-foreground italic">Trigger: {evo.trigger}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Alternate Outfits */}
            {a.alternateOutfits && a.alternateOutfits.length > 0 && (
              <Section icon={<Shirt className="h-3 w-3" />} label="Alternate Outfits">
                <div className="space-y-2">
                  {a.alternateOutfits.map((outfit, i) => (
                    <div key={i} className="bg-muted/50 rounded px-3 py-2 space-y-1">
                      {outfit.sceneSlugline && (
                        <p className="text-xs font-medium text-muted-foreground">
                          {outfit.sceneSlugline}
                        </p>
                      )}
                      <p className="text-xs text-foreground">{outfit.description}</p>
                      {outfit.reasonForChange && (
                        <p className="text-xs text-muted-foreground italic">
                          Reason: {outfit.reasonForChange}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Production Complexity */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Wrench className="h-3 w-3" />} label="Production Complexity">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    a.productionComplexity === 'complex'
                      ? 'bg-red-500/15 text-red-400'
                      : a.productionComplexity === 'moderate'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  {a.productionComplexity || 'moderate'}
                </span>
              </Section>
              <Section icon={<Package className="h-3 w-3" />} label="Budget Estimate">
                {a.costumeBudgetEstimate || (
                  <span className="text-xs text-muted-foreground italic">Not estimated</span>
                )}
              </Section>
            </div>

            {/* Wardrobe Requirements */}
            <Section icon={<Wrench className="h-3 w-3" />} label="Wardrobe Requirements">
              <TagList items={a.wardrobeRequirements || []} />
            </Section>

            {/* Special Considerations */}
            {a.specialConsiderations && a.specialConsiderations.length > 0 && (
              <Section
                icon={<AlertTriangle className="h-3 w-3" />}
                label="Special Considerations"
              >
                <TagList
                  items={a.specialConsiderations}
                  color="bg-amber-500/10 text-amber-400"
                />
              </Section>
            )}

            {/* Wig / Hair System */}
            {a.wigOrHairSystem && (
              <Section icon={<Scissors className="h-3 w-3" />} label="Wig / Hair System">
                {a.wigOrHairSystem}
              </Section>
            )}

            {/* Makeup Requirements */}
            {a.makeupRequirements && a.makeupRequirements.length > 0 && (
              <Section icon={<Sparkles className="h-3 w-3" />} label="Makeup Requirements">
                <TagList items={a.makeupRequirements} />
              </Section>
            )}

            {/* Reference Image Terms */}
            {a.referenceImageTerms && a.referenceImageTerms.length > 0 && (
              <Section icon={<Star className="h-3 w-3" />} label="Reference Image Terms">
                <TagList
                  items={a.referenceImageTerms}
                  color="bg-blue-500/10 text-blue-400"
                />
              </Section>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No costume data available</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
