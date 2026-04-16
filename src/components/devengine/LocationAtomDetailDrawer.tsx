/**
 * LocationAtomDetailDrawer — full attribute display for a location atom
 */
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LocationAtom, LocationAtomAttributes } from '@/hooks/useLocationAtoms';
import { useLocationVisualDatasets, type LocationVisualDataset } from '@/hooks/useLocationVisualDatasets';
import {
  MapPin, Clock, Building2, Palette, Lightbulb, Ear, Thermometer, CloudRain,
  Target, Users, Film, Sparkles, Wrench, Volume2, Camera, Star, AlertTriangle, CheckCircle2
} from 'lucide-react';

interface LocationAtomDetailDrawerProps {
  atom: LocationAtom | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
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

export function LocationAtomDetailDrawer({ atom, open, onOpenChange, projectId }: LocationAtomDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'attributes' | 'visual'>('attributes');
  const { data: datasets } = useLocationVisualDatasets(projectId);
  const a = atom?.attributes as LocationAtomAttributes | null;
  // Find visual dataset for this location
  const locationDataset = (datasets || []).find(
    (d: LocationVisualDataset) => d.location_name === atom?.entity_name || d.location_name === a?.canonicalName
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] sm:w-[600px] p-0 flex flex-col overflow-y-auto">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <SheetTitle className="text-base font-semibold leading-tight">
                {a?.canonicalName || atom?.entity_name || 'Location'}
              </SheetTitle>
            </div>
            {a?.readinessBadge && <ReadinessBadge badge={a.readinessBadge} />}
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
            <div className="flex items-center gap-3 text-xs">
              <span className={`flex items-center gap-1 ${a.generationStatus === 'completed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {a.generationStatus === 'completed' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {a.generationStatus}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">Confidence: {a.confidence != null ? `${a.confidence > 1 ? a.confidence : Math.round(a.confidence * 100)}%` : '—'}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{a.frequencyInScript} scene{a.frequencyInScript !== 1 ? 's' : ''}</span>
            </div>

            {/* Tab switcher */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="mb-4 h-8">
                <TabsTrigger value="attributes" className="text-xs">Attributes</TabsTrigger>
                <TabsTrigger value="visual" className="text-xs">
                  Visual Dataset
                  {locationDataset ? '' : ' — None'}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="attributes" className="space-y-5">
                {/* Era + Period */}
                <div className="grid grid-cols-2 gap-4">
              <Section icon={<Clock className="h-3 w-3" />} label="Era">
                {a.era || <span className="text-xs text-muted-foreground italic">Not specified</span>}
              </Section>
              <Section icon={<Clock className="h-3 w-3" />} label="Period">
                {a.period || <span className="text-xs text-muted-foreground italic">Not specified</span>}
              </Section>
            </div>

            {/* Architecture + Setting */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Building2 className="h-3 w-3" />} label="Architecture Style">
                {a.architectureStyle || <span className="text-xs text-muted-foreground italic">Not specified</span>}
              </Section>
              <Section icon={<Camera className="h-3 w-3" />} label="Setting Type">
                {a.settingType || <span className="text-xs text-muted-foreground italic">—</span>}
              </Section>
            </div>

            {/* Visual complexity + production complexity */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Palette className="h-3 w-3" />} label="Visual Complexity">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  a.visualComplexity === 'high' ? 'bg-red-500/15 text-red-400' :
                  a.visualComplexity === 'medium' ? 'bg-amber-500/15 text-amber-400' :
                  'bg-emerald-500/15 text-emerald-400'
                }`}>{a.visualComplexity || 'medium'}</span>
              </Section>
              <Section icon={<Wrench className="h-3 w-3" />} label="Production Complexity">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  a.productionComplexity === 'complex' ? 'bg-red-500/15 text-red-400' :
                  a.productionComplexity === 'moderate' ? 'bg-amber-500/15 text-amber-400' :
                  'bg-emerald-500/15 text-emerald-400'
                }`}>{a.productionComplexity || 'moderate'}</span>
              </Section>
            </div>

            {/* Dominant colors + lighting */}
            <ArrayField icon={<Palette className="h-3 w-3" />} label="Dominant Colors" items={a.dominantColors || []} />
            <Section icon={<Lightbulb className="h-3 w-3" />} label="Lighting Character">
              {a.lightingCharacter || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Sensory */}
            <ArrayField icon={<Ear className="h-3 w-3" />} label="Sensory Texture" items={a.sensoryTexture || []} />
            <Section icon={<Volume2 className="h-3 w-3" />} label="Acoustic Character">
              {a.acousticCharacter || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>
            <Section icon={<Thermometer className="h-3 w-3" />} label="Temperature Impression">
              {a.temperatureImpression || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Atmospheric mood */}
            <ArrayField icon={<CloudRain className="h-3 w-3" />} label="Atmospheric Mood" items={a.atmosphericMood || []} />

            {/* Narrative function */}
            <Section icon={<Target className="h-3 w-3" />} label="Narrative Function">
              {a.narrativeFunction || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Thematic symbolism */}
            <Section icon={<Star className="h-3 w-3" />} label="Thematic Symbolism">
              {a.thematicSymbolism || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Signature architectural features */}
            <ArrayField icon={<Building2 className="h-3 w-3" />} label="Signature Architectural Features" items={a.signatureArchitecturalFeatures || []} />

            {/* Key scenes */}
            {a.keyScenes && a.keyScenes.length > 0 && (
              <Section icon={<Film className="h-3 w-3" />} label="Key Scenes">
                <div className="space-y-1.5">
                  {a.keyScenes.map((scene, i) => (
                    <div key={i} className="text-xs bg-muted/50 rounded px-2 py-1.5 text-muted-foreground">
                      {scene}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Associated characters */}
            <ArrayField icon={<Users className="h-3 w-3" />} label="Associated Characters" items={a.associatedCharacters || []} />

            {/* Production */}
            <Section icon={<Camera className="h-3 w-3" />} label="Soundstage Viability">
              {a.soundstageViability || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>
            <ArrayField icon={<Wrench className="h-3 w-3" />} label="Set Requirements" items={a.setRequirements || []} />
            <ArrayField icon={<AlertTriangle className="h-3 w-3" />} label="Special Considerations" items={a.specialConsiderations || []} />

            {/* Casting */}
            <Section icon={<Users className="h-3 w-3" />} label="Casting Suggestions">
              {a.castingSuggestions || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Mood board */}
            {a.moodBoardReference && (
              <Section icon={<Sparkles className="h-3 w-3" />} label="Mood Board Reference">
                <span className="text-xs text-muted-foreground">{a.moodBoardReference}</span>
              </Section>
            )}
              </TabsContent>

              <TabsContent value="visual" className="space-y-5">
                {locationDataset ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Section icon={<Star className="h-3 w-3" />} label="Status Tier">
                        <span className="text-xs">{locationDataset.status_tier || '—'}</span>
                      </Section>
                      <Section icon={<Wrench className="h-3 w-3" />} label="Craft Level">
                        <span className="text-xs">{locationDataset.craft_level || '—'}</span>
                      </Section>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Section icon={<Palette className="h-3 w-3" />} label="Status Expression">
                        <span className="text-xs">{locationDataset.status_expression_mode || '—'}</span>
                      </Section>
                      <Section icon={<CheckCircle2 className="h-3 w-3" />} label="Freshness">
                        <span className={`text-xs px-2 py-0.5 rounded ${locationDataset.freshness_status === 'fresh' ? 'bg-emerald-500/15 text-emerald-400' : locationDataset.freshness_status === 'stale' ? 'bg-red-500/15 text-red-400' : 'bg-muted text-muted-foreground'}`}>{locationDataset.freshness_status || '—'}</span>
                      </Section>
                    </div>
                    {/* Spatial Intent */}
                    {locationDataset.spatial_intent && (
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground">Spatial Intent</span>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-xs"><span className="text-muted-foreground">Purpose: </span>{locationDataset.spatial_intent.purpose || '—'}</div>
                          <div className="text-xs"><span className="text-muted-foreground">Symmetry: </span>{locationDataset.spatial_intent.symmetry || '—'}</div>
                          <div className="text-xs"><span className="text-muted-foreground">Flow: </span>{locationDataset.spatial_intent.flow || '—'}</div>
                        </div>
                      </div>
                    )}
                    {/* Material Hierarchy */}
                    {locationDataset.material_hierarchy && (
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground">Material Hierarchy</span>
                        <div className="space-y-0.5">
                          <div className="text-xs"><span className="text-muted-foreground">Primary: </span>{locationDataset.material_hierarchy.primary?.join(', ') || '—'}</div>
                          <div className="text-xs"><span className="text-muted-foreground">Secondary: </span>{locationDataset.material_hierarchy.secondary?.join(', ') || '—'}</div>
                          <div className="text-xs text-red-400"><span className="text-muted-foreground">Forbidden: </span>{locationDataset.material_hierarchy.forbidden?.join(', ') || '—'}</div>
                        </div>
                      </div>
                    )}
                    {/* Slots */}
                    {[
                      { key: 'slot_establishing', label: 'Establishing' },
                      { key: 'slot_atmosphere', label: 'Atmosphere' },
                      { key: 'slot_architectural_detail', label: 'Architectural Detail' },
                      { key: 'slot_time_variant', label: 'Time Variant' },
                      { key: 'slot_surface_language', label: 'Surface Language' },
                      { key: 'slot_motif', label: 'Motif' },
                    ].map(({ key, label }) => {
                      const slot = (locationDataset as any)[key];
                      if (!slot) return null;
                      return (
                        <div key={key} className="border border-border/40 rounded px-3 py-2 space-y-1">
                          <span className="text-xs font-semibold text-muted-foreground">{label}</span>
                          {slot.primary_truths?.length > 0 && (
                            <div className="text-xs"><span className="text-emerald-400 font-medium">Primary: </span>{slot.primary_truths.join(', ')}</div>
                          )}
                          {slot.secondary_truths?.length > 0 && (
                            <div className="text-xs"><span className="text-blue-400 font-medium">Secondary: </span>{slot.secondary_truths.join(', ')}</div>
                          )}
                          {slot.forbidden_dominance?.length > 0 && (
                            <div className="text-xs text-red-400"><span className="font-medium">Forbidden: </span>{slot.forbidden_dominance.join(', ')}</div>
                          )}
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    <Sparkles className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    <p>No visual dataset for this location yet.</p>
                    <p className="mt-1">Visual datasets are built during the production design stage.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No location data available</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
