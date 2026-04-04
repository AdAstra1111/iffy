/**
 * CharacterBrief — Collapsible casting profile display for character lanes.
 * Shows physical, emotional, narrative profiles + evidence provenance.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, User, Heart, Clapperboard, AlertCircle, CheckCircle2, Database, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { buildCharacterCastingProfile, type CharacterCastingProfile } from '@/lib/aiCast/castingProfile';

interface CharacterBriefProps {
  projectId: string;
  characterKey: string;
  defaultOpen?: boolean;
}

export function CharacterBrief({ projectId, characterKey, defaultOpen = false }: CharacterBriefProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [showSources, setShowSources] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['casting-profile', projectId, characterKey],
    queryFn: () => buildCharacterCastingProfile(projectId, characterKey),
    enabled: !!projectId && !!characterKey,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (!profile) return null;

  const strengthColor = profile.evidence_strength === 'strong'
    ? 'text-green-400'
    : profile.evidence_strength === 'partial'
    ? 'text-amber-400'
    : 'text-red-400';

  const strengthLabel = profile.evidence_strength === 'strong'
    ? 'Strong evidence'
    : profile.evidence_strength === 'partial'
    ? 'Partial evidence'
    : profile.evidence_strength === 'weak'
    ? 'Weak evidence'
    : 'No evidence';

  return (
    <div className="rounded-lg border border-border/30 bg-card/30">
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/20 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-foreground">Character Brief</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">
            {profile.completeness}% complete
          </Badge>
          <span className={cn('text-[9px]', strengthColor)}>
            • {strengthLabel}
          </span>
        </div>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <Progress value={profile.completeness} className="h-1" />

          {/* Physical */}
          <ProfileSection icon={User} label="Physical" color="text-blue-400">
            <ProfileChips items={[
              profile.physical.gender && `Gender: ${profile.physical.gender}`,
              profile.physical.age_range && `Age: ${profile.physical.age_range}`,
              profile.physical.ethnicity && `Ethnicity: ${profile.physical.ethnicity}`,
              profile.physical.body_type && `Build: ${profile.physical.body_type}`,
              profile.physical.height && `Height: ${profile.physical.height}`,
              ...profile.physical.key_visual_traits,
            ]} />
          </ProfileSection>

          {/* Emotional */}
          <ProfileSection icon={Heart} label="Emotional" color="text-rose-400">
            <ProfileChips items={[
              ...profile.emotional.core_traits,
              profile.emotional.emotional_range && `Range: ${profile.emotional.emotional_range}`,
            ]} />
          </ProfileSection>

          {/* Narrative */}
          <ProfileSection icon={Clapperboard} label="Narrative" color="text-amber-400">
            <ProfileChips items={[
              profile.narrative.role_type && `Role: ${profile.narrative.role_type}`,
              profile.narrative.archetype && `Archetype: ${profile.narrative.archetype}`,
              profile.narrative.energy_level && `Energy: ${profile.narrative.energy_level}`,
              profile.narrative.scene_count > 0 && `${profile.narrative.scene_count} scenes`,
              ...profile.narrative.scene_evidence,
            ]} />
          </ProfileSection>

          {/* Evidence Sources */}
          <div className="space-y-1">
            <button
              onClick={(e) => { e.stopPropagation(); setShowSources(!showSources); }}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Database className="h-3 w-3" />
              <span>
                {profile.sources.filter(s => s.contributed).length} sources contributing
                {profile.missing_sources.length > 0 && ` · ${profile.missing_sources.length} available but unused`}
              </span>
              {showSources ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            </button>

            {showSources && (
              <div className="ml-4 space-y-0.5">
                {profile.sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[9px]">
                    {s.contributed ? (
                      <CheckCircle2 className="h-2.5 w-2.5 text-green-400" />
                    ) : s.available ? (
                      <FileText className="h-2.5 w-2.5 text-amber-400" />
                    ) : (
                      <AlertCircle className="h-2.5 w-2.5 text-muted-foreground/50" />
                    )}
                    <span className={cn(
                      s.contributed ? 'text-foreground' : 'text-muted-foreground',
                    )}>
                      {s.source_type.replace(/_/g, ' ')}
                      {s.contributed && s.record_count > 0 && ` (${s.record_count})`}
                      {!s.available && ' — not in project'}
                      {s.available && !s.contributed && ' — no character data'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {profile.completeness < 30 && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              <span>
                {profile.evidence_strength === 'none'
                  ? 'No character evidence found — check document extraction'
                  : 'Limited character data — casting will use broader search'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileSection({
  icon: Icon,
  label,
  color,
  children,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3 w-3', color)} />
        <span className="text-[10px] font-medium text-foreground">{label}</span>
      </div>
      {children}
    </div>
  );
}

function ProfileChips({ items }: { items: (string | false | null | undefined)[] }) {
  const filtered = items.filter(Boolean) as string[];

  if (filtered.length === 0) {
    return <span className="text-[10px] text-muted-foreground italic">No data</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {filtered.map((item, i) => (
        <Badge
          key={i}
          variant="outline"
          className="text-[9px] h-4 px-1.5 font-normal text-muted-foreground border-border/50"
        >
          {item}
        </Badge>
      ))}
    </div>
  );
}
