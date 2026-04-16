/**
 * VehicleAtomDetailDrawer — full attribute display for a vehicle atom
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import type { VehicleAtom, VehicleAtomAttributes } from '@/hooks/useVehicleAtoms';
import {
  Car, Clock, Gauge, Shield, User, Wrench, Volume2, DollarSign,
  AlertTriangle, CheckCircle2, Tag, Camera, Zap, MapPin, Star,
} from 'lucide-react';

interface VehicleAtomDetailDrawerProps {
  atom: VehicleAtom | null;
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

function ArrayField({
  icon,
  label,
  items,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
  color?: string;
}) {
  return (
    <Section icon={icon} label={label}>
      <TagList items={items} color={color} />
    </Section>
  );
}

function StatusChip({ value, type }: { value: string; type?: string }) {
  const accuracyColor =
    value === 'anachronistic'
      ? 'bg-red-500/15 text-red-400'
      : value === 'stylised'
        ? 'bg-amber-500/15 text-amber-400'
        : 'bg-emerald-500/15 text-emerald-400';

  const complexityColor =
    value === 'complex'
      ? 'bg-red-500/15 text-red-400'
      : value === 'moderate'
        ? 'bg-amber-500/15 text-amber-400'
        : 'bg-emerald-500/15 text-emerald-400';

  const budgetColor =
    value === 'prohibitively_expensive'
      ? 'bg-red-500/15 text-red-400'
      : value === 'expensive'
        ? 'bg-orange-500/15 text-orange-400'
        : value === 'moderate'
          ? 'bg-amber-500/15 text-amber-400'
          : 'bg-emerald-500/15 text-emerald-400';

  const colorClass =
    type === 'accuracy'
      ? accuracyColor
      : type === 'complexity'
        ? complexityColor
        : type === 'budget'
          ? budgetColor
          : 'bg-muted text-muted-foreground';

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${colorClass}`}>
      {value?.replace(/_/g, ' ')}
    </span>
  );
}

export function VehicleAtomDetailDrawer({
  atom,
  open,
  onOpenChange,
}: VehicleAtomDetailDrawerProps) {
  const a = atom?.attributes as VehicleAtomAttributes | null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] sm:w-[600px] p-0 flex flex-col overflow-y-auto">
        <SheetHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <Car className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <SheetTitle className="text-base font-semibold leading-tight">
                {a?.vehicle_type || atom?.canonical_name || 'Vehicle'}
              </SheetTitle>
            </div>
            {a?.readinessBadge && <ReadinessBadge badge={a.readinessBadge} />}
          </div>
          {a?.make_model && (
            <p className="text-xs text-muted-foreground pl-6">{a.make_model}</p>
          )}
        </SheetHeader>

        {a ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Status row */}
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span
                className={`flex items-center gap-1 ${
                  a.generationStatus === 'completed' || a.generationStatus === 'complete'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {a.generationStatus === 'completed' || a.generationStatus === 'complete' ? (
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
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {a.frequencyInScript} scene{a.frequencyInScript !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Vehicle type + era */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Car className="h-3 w-3" />} label="Vehicle Type">
                {a.vehicle_type || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
              <Section icon={<Clock className="h-3 w-3" />} label="Era Alignment">
                {a.era_alignment || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
            </div>

            {/* Make/model + period accuracy */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Tag className="h-3 w-3" />} label="Make / Model">
                {a.make_model || (
                  <span className="text-xs text-muted-foreground italic">Not identified</span>
                )}
              </Section>
              <Section icon={<CheckCircle2 className="h-3 w-3" />} label="Period Accuracy">
                {a.period_accuracy ? (
                  <StatusChip value={a.period_accuracy} type="accuracy" />
                ) : (
                  <span className="text-xs text-muted-foreground italic">—</span>
                )}
              </Section>
            </div>

            {/* Ownership + character */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Shield className="h-3 w-3" />} label="Ownership">
                {a.ownership || (
                  <span className="text-xs text-muted-foreground italic">Unknown</span>
                )}
              </Section>
              <Section icon={<User className="h-3 w-3" />} label="Character Association">
                {a.character_association || (
                  <span className="text-xs text-muted-foreground italic">None specified</span>
                )}
              </Section>
            </div>

            {/* Condition + modification */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Wrench className="h-3 w-3" />} label="Condition">
                {a.condition || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
              <Section icon={<Gauge className="h-3 w-3" />} label="Modification Level">
                {a.modification_level ? (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    {a.modification_level.replace(/_/g, ' ')}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">—</span>
                )}
              </Section>
            </div>

            {/* Distinctive features */}
            {a.distinctive_features && (
              <Section icon={<Star className="h-3 w-3" />} label="Distinctive Features">
                {a.distinctive_features}
              </Section>
            )}

            {/* Visual complexity + set requirements */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<Camera className="h-3 w-3" />} label="Visual Complexity">
                {a.visual_complexity ? (
                  <StatusChip value={a.visual_complexity} type="complexity" />
                ) : (
                  <span className="text-xs text-muted-foreground italic">—</span>
                )}
              </Section>
              <Section icon={<Wrench className="h-3 w-3" />} label="Set Requirements">
                {a.set_requirements ? (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    {a.set_requirements.replace(/_/g, ' ')}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground italic">—</span>
                )}
              </Section>
            </div>

            {/* Driving context + sound */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<MapPin className="h-3 w-3" />} label="Driving Context">
                {a.driving_context || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
              <Section icon={<Volume2 className="h-3 w-3" />} label="Sound Profile">
                {a.sound_profile || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
            </div>

            {/* Budget + availability */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<DollarSign className="h-3 w-3" />} label="Budget Estimate">
                {a.budget_estimate ? (
                  <StatusChip value={a.budget_estimate} type="budget" />
                ) : (
                  <span className="text-xs text-muted-foreground italic">—</span>
                )}
              </Section>
              <Section icon={<Zap className="h-3 w-3" />} label="Availability Notes">
                {a.availability_notes || (
                  <span className="text-xs text-muted-foreground italic">Not specified</span>
                )}
              </Section>
            </div>

            {/* Arrays */}
            <ArrayField
              icon={<Camera className="h-3 w-3" />}
              label="Reference Images Needed"
              items={a.reference_images_needed || []}
            />

            <ArrayField
              icon={<Tag className="h-3 w-3" />}
              label="Casting Type Tags"
              items={a.casting_type_tags || []}
              color="bg-blue-500/10 text-blue-400"
            />

            {/* Anachronism flags — highlighted if any */}
            {a.anachronism_flags && a.anachronism_flags.length > 0 ? (
              <ArrayField
                icon={<AlertTriangle className="h-3 w-3 text-red-400" />}
                label="Anachronism Flags"
                items={a.anachronism_flags}
                color="bg-red-500/10 text-red-400"
              />
            ) : (
              <Section icon={<CheckCircle2 className="h-3 w-3 text-emerald-400" />} label="Anachronism Flags">
                <span className="text-xs text-emerald-400">None — period accurate</span>
              </Section>
            )}

            {/* Production notes */}
            {a.production_notes && (
              <Section icon={<Wrench className="h-3 w-3" />} label="Production Notes">
                <p className="text-sm text-muted-foreground leading-relaxed">{a.production_notes}</p>
              </Section>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No vehicle data available</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
