/**
 * PropAtomDetailDrawer — full attribute display for a prop atom
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import type { PropAtom, PropAtomAttributes } from '@/hooks/usePropAtoms';
import {
  Package, Tag, Palette, Layers, Wrench, Target, Users, MapPin,
  Star, TrendingUp, Film, AlertTriangle, CheckCircle2, DollarSign,
  Scissors, Shield, Search, RefreshCw
} from 'lucide-react';

interface PropAtomDetailDrawerProps {
  atom: PropAtom | null;
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

function PropTypeBadge({ propType }: { propType: string }) {
  const map: Record<string, string> = {
    held: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    set_dressing: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    vehicle: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    wardrobe_item: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
    weapon: 'bg-red-500/15 text-red-400 border-red-500/30',
    document: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    technology: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    food: 'bg-green-500/15 text-green-400 border-green-500/30',
    flora: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    other: 'bg-muted text-muted-foreground border-border',
  };
  const cls = map[propType] || map.other;
  const label = propType?.replace('_', ' ') || 'unknown';
  return (
    <Badge className={`border capitalize ${cls}`}>{label}</Badge>
  );
}

function Section({
  icon, label, children,
}: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
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

function TagList({ items, color = 'bg-muted text-muted-foreground' }: { items: string[]; color?: string }) {
  if (!items || items.length === 0) return <span className="text-xs text-muted-foreground italic">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={i} className={`text-xs px-2 py-0.5 rounded ${color}`}>{item}</span>
      ))}
    </div>
  );
}

function ArrayField({ icon, label, items }: { icon: React.ReactNode; label: string; items: string[] }) {
  return (
    <Section icon={icon} label={label}>
      <TagList items={items} />
    </Section>
  );
}

export function PropAtomDetailDrawer({ atom, open, onOpenChange }: PropAtomDetailDrawerProps) {
  const a = atom?.attributes as PropAtomAttributes | null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] sm:w-[600px] p-0 flex flex-col overflow-y-auto">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <Package className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <SheetTitle className="text-base font-semibold leading-tight">
                {a?.canonicalName || atom?.canonical_name || 'Prop'}
              </SheetTitle>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {a?.propType && <PropTypeBadge propType={a.propType} />}
              {a?.readinessBadge && <ReadinessBadge badge={a.readinessBadge} />}
            </div>
          </div>
          {a?.aliases && a.aliases.length > 0 && (
            <p className="text-xs text-muted-foreground pl-6">
              Also known as: {a.aliases.join(', ')}
            </p>
          )}
        </SheetHeader>

        {a ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Status row */}
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className={`flex items-center gap-1 ${a.generationStatus === 'completed' || a.generationStatus === 'complete' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {a.generationStatus === 'completed' || a.generationStatus === 'complete'
                  ? <CheckCircle2 className="h-3 w-3" />
                  : <AlertTriangle className="h-3 w-3" />}
                {a.generationStatus}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Confidence: {a.confidence != null ? `${a.confidence > 1 ? a.confidence : Math.round(a.confidence * 100)}%` : '—'}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {a.frequencyInScript} scene{a.frequencyInScript !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Physical description */}
            <Section icon={<Package className="h-3 w-3" />} label="Physical Description">
              {a.physicalDescription || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Physical attributes */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Palette className="h-3 w-3" />} label="Primary Color">
                {a.primaryColor || <span className="text-xs text-muted-foreground italic">—</span>}
              </Section>
              <Section icon={<Tag className="h-3 w-3" />} label="Size">
                {a.sizeCategory ? (
                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                    {a.sizeCategory}
                  </span>
                ) : <span className="text-xs text-muted-foreground italic">—</span>}
              </Section>
            </div>

            <Section icon={<Tag className="h-3 w-3" />} label="Condition">
              {a.condition || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            <ArrayField icon={<Layers className="h-3 w-3" />} label="Material Composition" items={a.materialComposition || []} />
            <ArrayField icon={<Star className="h-3 w-3" />} label="Distinctive Features" items={a.distinctiveFeatures || []} />

            {/* Narrative */}
            <Section icon={<Target className="h-3 w-3" />} label="Narrative Function">
              {a.narrativeFunction || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            <Section icon={<Star className="h-3 w-3" />} label="Symbolic Meaning">
              {a.symbolicMeaning || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Appearance */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Film className="h-3 w-3" />} label="First Appearance">
                {a.firstAppearance || <span className="text-xs text-muted-foreground italic">—</span>}
              </Section>
              <Section icon={<Film className="h-3 w-3" />} label="Last Appearance">
                {a.lastAppearance || <span className="text-xs text-muted-foreground italic">—</span>}
              </Section>
            </div>

            <ArrayField icon={<Film className="h-3 w-3" />} label="Usage Contexts" items={a.usageContexts || []} />

            {/* Associations */}
            <ArrayField icon={<Users className="h-3 w-3" />} label="Associated Characters" items={a.associatedCharacters || []} />
            <ArrayField icon={<MapPin className="h-3 w-3" />} label="Associated Locations" items={a.associatedLocations || []} />

            {/* State changes */}
            {a.stateChanges && a.stateChanges.length > 0 && (
              <Section icon={<RefreshCw className="h-3 w-3" />} label="State Changes">
                <div className="space-y-2">
                  {a.stateChanges.map((change, i) => (
                    <div key={i} className="text-xs bg-muted/50 rounded px-2 py-2 space-y-1">
                      <div className="font-medium text-foreground">{change.sceneSlugline}</div>
                      <div className="text-muted-foreground">
                        {change.previousState} → <span className="text-foreground">{change.newState}</span>
                      </div>
                      {change.trigger && (
                        <div className="text-muted-foreground italic">Trigger: {change.trigger}</div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Production */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Wrench className="h-3 w-3" />} label="Production Complexity">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  a.productionComplexity === 'complex' ? 'bg-red-500/15 text-red-400' :
                  a.productionComplexity === 'moderate' ? 'bg-amber-500/15 text-amber-400' :
                  'bg-emerald-500/15 text-emerald-400'
                }`}>{a.productionComplexity || 'moderate'}</span>
              </Section>
              <Section icon={<DollarSign className="h-3 w-3" />} label="Budget Estimate">
                {a.propBudgetEstimate || <span className="text-xs text-muted-foreground italic">—</span>}
              </Section>
            </div>

            <ArrayField icon={<Scissors className="h-3 w-3" />} label="Fabrication Requirements" items={a.fabricationRequirements || []} />
            <ArrayField icon={<Shield className="h-3 w-3" />} label="Special Handling" items={a.specialHandling || []} />
            <ArrayField icon={<Search className="h-3 w-3" />} label="Reference Image Terms" items={a.referenceImageTerms || []} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No prop data available</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
