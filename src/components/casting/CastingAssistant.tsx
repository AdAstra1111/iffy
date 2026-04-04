/**
 * CastingAssistant — Refinement panel for adjusting casting search parameters.
 * Allows structured control over physical, styling, and presence dimensions.
 * Persists per-character in session state.
 */
import { useState, useCallback, useMemo } from 'react';
import {
  Settings2, RotateCcw, X, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { interpretCastingNotes } from '@/lib/aiCast/castingNoteInterpreter';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RefinementState {
  height: string;
  build: string;
  skin_tone: string;
  hair_color: string;
  hair_length: string;
  age_refinement: string;
  presence_modifiers: string[];
}

export const EMPTY_REFINEMENT: RefinementState = {
  height: '',
  build: '',
  skin_tone: '',
  hair_color: '',
  hair_length: '',
  age_refinement: '',
  presence_modifiers: [],
};

export function hasActiveRefinements(state: RefinementState): boolean {
  return !!(
    state.height || state.build || state.skin_tone ||
    state.hair_color || state.hair_length || state.age_refinement ||
    state.presence_modifiers.length > 0
  );
}

export function refinementToEdgePayload(state: RefinementState) {
  if (!hasActiveRefinements(state)) return null;
  const payload: Record<string, any> = {};
  if (state.height) payload.height = state.height;
  if (state.build) payload.build = state.build;
  if (state.skin_tone) payload.skin_tone = state.skin_tone;
  if (state.hair_color) payload.hair_color = state.hair_color;
  if (state.hair_length) payload.hair_length = state.hair_length;
  if (state.age_refinement) payload.age_refinement = state.age_refinement;
  if (state.presence_modifiers.length > 0) payload.presence_modifiers = state.presence_modifiers;
  return payload;
}

// ── Options ──────────────────────────────────────────────────────────────────

const HEIGHT_OPTIONS = ['', 'short', 'average', 'tall', 'very tall'];
const BUILD_OPTIONS = ['', 'slim', 'lean', 'average', 'athletic', 'muscular', 'heavy', 'stocky'];
const SKIN_TONE_OPTIONS = ['', 'fair', 'light', 'olive', 'medium', 'tan', 'brown', 'dark', 'deep'];
const HAIR_COLOR_OPTIONS = ['', 'black', 'dark brown', 'brown', 'auburn', 'red', 'blonde', 'platinum', 'grey', 'white'];
const HAIR_LENGTH_OPTIONS = ['', 'shaved', 'buzz cut', 'short', 'medium', 'long', 'very long'];
const AGE_OPTIONS = ['', 'younger (18-25)', 'young adult (25-35)', 'mid-range (35-45)', 'mature (45-55)', 'senior (55+)'];

const PRESENCE_MODIFIERS = [
  'more intense', 'softer', 'more intimidating', 'more charismatic',
  'more vulnerable', 'more commanding', 'more mysterious', 'more approachable',
  'more rugged', 'more refined', 'more enigmatic', 'more grounded',
];

// ── Component ────────────────────────────────────────────────────────────────

interface CastingAssistantProps {
  characterName: string;
  state: RefinementState;
  onChange: (state: RefinementState) => void;
  onApply: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Free-text notes managed by parent */
  freeTextNotes?: string;
  onFreeTextNotesChange?: (notes: string) => void;
}

export function CastingAssistant({
  characterName,
  state,
  onChange,
  onApply,
  open,
  onOpenChange,
  freeTextNotes = '',
  onFreeTextNotesChange,
}: CastingAssistantProps) {
  const update = useCallback((patch: Partial<RefinementState>) => {
    onChange({ ...state, ...patch });
  }, [state, onChange]);

  const togglePresence = useCallback((modifier: string) => {
    const current = state.presence_modifiers;
    const next = current.includes(modifier)
      ? current.filter(m => m !== modifier)
      : [...current, modifier].slice(0, 4); // max 4
    onChange({ ...state, presence_modifiers: next });
  }, [state, onChange]);

  const handleReset = () => onChange({ ...EMPTY_REFINEMENT });

  const activeCount = [
    state.height, state.build, state.skin_tone,
    state.hair_color, state.hair_length, state.age_refinement,
  ].filter(Boolean).length + state.presence_modifiers.length;

  const noteInterp = useMemo(() => {
    return freeTextNotes ? interpretCastingNotes(freeTextNotes) : null;
  }, [freeTextNotes]);

  const hasAnyInput = activeCount > 0 || !!freeTextNotes?.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4 text-primary" />
            Casting Assistant — {characterName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Refine physical and presence attributes. Changes will generate new candidates matching your direction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Free-text natural language input */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3 text-primary" />
              Natural Language Direction
            </h4>
            <Textarea
              value={freeTextNotes}
              onChange={e => onFreeTextNotesChange?.(e.target.value)}
              placeholder='e.g. "extremely beautiful chinese 20-25 female" or "looks like Idris Elba but younger, more dangerous"'
              className="text-[11px] min-h-[60px] resize-none"
              rows={3}
            />
            {noteInterp?.normalizedSummary && (
              <div className="space-y-1">
                <p className="text-[9px] text-muted-foreground font-medium">Detected:</p>
                <div className="flex flex-wrap gap-1">
                  {noteInterp.hardConstraints.gender && (
                    <Badge className="text-[8px] h-4 px-1.5 bg-destructive/15 text-destructive border-destructive/30">
                      {noteInterp.hardConstraints.gender}
                    </Badge>
                  )}
                  {noteInterp.hardConstraints.ageMin != null && noteInterp.hardConstraints.ageMax != null && (
                    <Badge className="text-[8px] h-4 px-1.5 bg-destructive/15 text-destructive border-destructive/30">
                      {noteInterp.hardConstraints.ageMin}–{noteInterp.hardConstraints.ageMax}
                    </Badge>
                  )}
                  {noteInterp.hardConstraints.ethnicity?.map(e => (
                    <Badge key={e} className="text-[8px] h-4 px-1.5 bg-destructive/15 text-destructive border-destructive/30">
                      {e}
                    </Badge>
                  ))}
                  {noteInterp.softPreferences.attractiveness && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5">
                      {noteInterp.softPreferences.attractiveness}
                    </Badge>
                  )}
                  {noteInterp.softPreferences.build && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5">
                      {noteInterp.softPreferences.build}
                    </Badge>
                  )}
                  {noteInterp.softPreferences.vibe?.map(v => (
                    <Badge key={v} variant="outline" className="text-[8px] h-4 px-1.5">
                      {v}
                    </Badge>
                  ))}
                  {noteInterp.softPreferences.hair && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1.5">
                      {noteInterp.softPreferences.hair}
                    </Badge>
                  )}
                  {noteInterp.softPreferences.energy?.map(e => (
                    <Badge key={e} variant="outline" className="text-[8px] h-4 px-1.5">
                      {e}
                    </Badge>
                  ))}
                  {noteInterp.likeness.references.map((ref, i) => (
                    <Badge key={i} className="text-[8px] h-4 px-1.5 bg-primary/15 text-primary border-primary/30">
                      ≈ {ref.reference_people.join(' + ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Physical Filters */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-medium text-foreground">Physical</h4>
            <div className="grid grid-cols-2 gap-2">
              <FilterSelect label="Height" value={state.height} options={HEIGHT_OPTIONS} onChange={v => update({ height: v })} />
              <FilterSelect label="Build" value={state.build} options={BUILD_OPTIONS} onChange={v => update({ build: v })} />
              <FilterSelect label="Skin Tone" value={state.skin_tone} options={SKIN_TONE_OPTIONS} onChange={v => update({ skin_tone: v })} />
              <FilterSelect label="Hair Color" value={state.hair_color} options={HAIR_COLOR_OPTIONS} onChange={v => update({ hair_color: v })} />
              <FilterSelect label="Hair Length" value={state.hair_length} options={HAIR_LENGTH_OPTIONS} onChange={v => update({ hair_length: v })} />
              <FilterSelect label="Age Range" value={state.age_refinement} options={AGE_OPTIONS} onChange={v => update({ age_refinement: v })} />
            </div>
          </div>

          {/* Presence Modifiers */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-medium text-foreground">Presence / Style</h4>
            <div className="flex flex-wrap gap-1.5">
              {PRESENCE_MODIFIERS.map(mod => (
                <button
                  key={mod}
                  onClick={() => togglePresence(mod)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[10px] border transition-colors',
                    state.presence_modifiers.includes(mod)
                      ? 'bg-primary/15 text-primary border-primary/40'
                      : 'bg-muted/20 text-muted-foreground border-border/40 hover:border-border/60',
                  )}
                >
                  {mod}
                </button>
              ))}
            </div>
          </div>

          {/* Active summary */}
          {activeCount > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                {activeCount} active
              </Badge>
              <button onClick={handleReset} className="flex items-center gap-0.5 hover:text-foreground transition-colors">
                <RotateCcw className="h-2.5 w-2.5" /> Reset
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { onApply(); onOpenChange(false); }}
            disabled={!hasAnyInput}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Generate with Refinements
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Select Filter ────────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <Select value={value || 'any'} onValueChange={v => onChange(v === 'any' ? '' : v)}>
        <SelectTrigger className="h-7 text-[11px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any" className="text-[11px]">Any</SelectItem>
          {options.filter(Boolean).map(opt => (
            <SelectItem key={opt} value={opt} className="text-[11px]">{opt}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
