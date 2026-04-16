/**
 * CreatureAtomDetailDrawer — full attribute display for a creature atom
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import type { CreatureAtom, CreatureAtomAttributes } from '@/hooks/useCreatureAtoms';
import {
  PawPrint, Dna, Eye, Ear, Wind, Heart, Film, Wrench,
  AlertTriangle, CheckCircle2, Shield, Banknote, Package, Camera, Tag, Leaf
} from 'lucide-react';

interface CreatureAtomDetailDrawerProps {
  atom: CreatureAtom | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function BudgetBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    moderate: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    very_high: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <Badge className={`border ${map[value] || map.moderate}`}>
      {value?.replace('_', ' ') || 'moderate'}
    </Badge>
  );
}

function CGIBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    trained_animal: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    practical_effects: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    puppet: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    full_CGI: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  };
  return (
    <Badge className={`border ${map[value] || map.practical_effects}`}>
      {value?.replace('_', ' ') || 'practical effects'}
    </Badge>
  );
}

export function CreatureAtomDetailDrawer({ atom, open, onOpenChange }: CreatureAtomDetailDrawerProps) {
  const a = atom?.attributes as CreatureAtomAttributes | null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] sm:w-[600px] p-0 flex flex-col overflow-y-auto">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <PawPrint className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <SheetTitle className="text-base font-semibold leading-tight capitalize">
                {a?.species_name || atom?.canonical_name || 'Creature'}
              </SheetTitle>
            </div>
            {a?.budget_category && <BudgetBadge value={a.budget_category} />}
          </div>
          {atom?.canonical_name && a?.species_name && a.species_name !== atom.canonical_name && (
            <p className="text-xs text-muted-foreground pl-6">
              Canonical: {atom.canonical_name}
            </p>
          )}
        </SheetHeader>

        {a ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Status row */}
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className={`flex items-center gap-1 ${a.generationStatus === 'completed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {a.generationStatus === 'completed' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {a.generationStatus || 'stub'}
              </span>
              {a.occurrences_in_script != null && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{a.occurrences_in_script} occurrence{a.occurrences_in_script !== 1 ? 's' : ''}</span>
                </>
              )}
              <span className="text-muted-foreground">·</span>
              <CGIBadge value={a.CGI_requirements} />
            </div>

            {/* Creature type + species */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Dna className="h-3 w-3" />} label="Creature Type">
                <span className="capitalize">{a.creature_type || '—'}</span>
              </Section>
              <Section icon={<Dna className="h-3 w-3" />} label="Species Accuracy">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  a.species_accuracy === 'real_world' ? 'bg-emerald-500/15 text-emerald-400' :
                  a.species_accuracy === 'fictional' ? 'bg-purple-500/15 text-purple-400' :
                  'bg-amber-500/15 text-amber-400'
                }`}>
                  {a.species_accuracy?.replace('_', ' ') || '—'}
                </span>
              </Section>
            </div>

            {/* Behaviour class + cultural accuracy */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Heart className="h-3 w-3" />} label="Behaviour Class">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  a.behaviour_class === 'wild' || a.behaviour_class === 'feral' ? 'bg-red-500/15 text-red-400' :
                  a.behaviour_class === 'trained' ? 'bg-blue-500/15 text-blue-400' :
                  a.behaviour_class === 'CGI_only' ? 'bg-purple-500/15 text-purple-400' :
                  'bg-emerald-500/15 text-emerald-400'
                }`}>
                  {a.behaviour_class?.replace('_', ' ') || '—'}
                </span>
              </Section>
              <Section icon={<Eye className="h-3 w-3" />} label="Period Accuracy">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  a.cultural_period_accuracy === 'accurate' ? 'bg-emerald-500/15 text-emerald-400' :
                  a.cultural_period_accuracy === 'anachronistic' ? 'bg-red-500/15 text-red-400' :
                  'bg-amber-500/15 text-amber-400'
                }`}>
                  {a.cultural_period_accuracy || 'accurate'}
                </span>
              </Section>
            </div>

            {/* Role in story */}
            <Section icon={<Film className="h-3 w-3" />} label="Role in Story">
              {a.role_in_story || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Physical description */}
            <Section icon={<Eye className="h-3 w-3" />} label="Physical Description">
              {a.physical_description || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Distinctive markings */}
            <Section icon={<Tag className="h-3 w-3" />} label="Distinctive Markings">
              {a.distinctive_markings || <span className="text-xs text-muted-foreground italic">None noted</span>}
            </Section>

            {/* Movement + sound */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Wind className="h-3 w-3" />} label="Movement Pattern">
                {a.movement_pattern || <span className="text-xs text-muted-foreground italic">Not specified</span>}
              </Section>
              <Section icon={<Ear className="h-3 w-3" />} label="Sound Profile">
                {a.sound_profile || <span className="text-xs text-muted-foreground italic">Not specified</span>}
              </Section>
            </div>

            {/* CGI / Production approach */}
            <Section icon={<Camera className="h-3 w-3" />} label="CGI Requirements">
              <div className="space-y-1">
                <CGIBadge value={a.CGI_requirements} />
                {a.practical_effects_notes && (
                  <p className="text-xs text-muted-foreground mt-1">{a.practical_effects_notes}</p>
                )}
              </div>
            </Section>

            {/* Handling */}
            <Section icon={<Shield className="h-3 w-3" />} label="Handling Requirements">
              {a.handling_requirements || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Budget + availability */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Banknote className="h-3 w-3" />} label="Budget Category">
                <BudgetBadge value={a.budget_category} />
              </Section>
              <Section icon={<Package className="h-3 w-3" />} label="Availability">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  a.availability === 'readily_available' ? 'bg-emerald-500/15 text-emerald-400' :
                  a.availability === 'custom_build' ? 'bg-red-500/15 text-red-400' :
                  'bg-amber-500/15 text-amber-400'
                }`}>
                  {a.availability?.replace(/_/g, ' ') || '—'}
                </span>
              </Section>
            </div>

            {/* Reference images */}
            <ArrayField icon={<Camera className="h-3 w-3" />} label="Reference Images Needed" items={a.reference_images_needed || []} />

            {/* Casting tags */}
            <ArrayField icon={<Tag className="h-3 w-3" />} label="Casting Type Tags" items={a.casting_type_tags || []} />

            {/* Animal welfare */}
            <Section icon={<Leaf className="h-3 w-3" />} label="Animal Welfare Notes">
              {a.animal_welfare_notes || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>

            {/* Production notes */}
            <Section icon={<Wrench className="h-3 w-3" />} label="Production Notes">
              {a.production_notes || <span className="text-xs text-muted-foreground italic">Not specified</span>}
            </Section>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No creature data available</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
