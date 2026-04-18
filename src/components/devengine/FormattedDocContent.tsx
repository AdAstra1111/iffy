/**
 * FormattedDocContent — renders document content intelligently.
 * Detects JSON and renders structured documents (character bibles, etc.)
 * as readable prose instead of raw JSON. Falls back to markdown rendering
 * for plain-text documents (concept briefs, treatments, etc.).
 */
import { useState } from 'react';
import { Code, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';

interface Props {
  text: string;
  editable?: boolean;
  onChange?: (val: string) => void;
  className?: string;
}

// Field display labels
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  age: 'Age',
  role: 'Role',
  physical_description: 'Physical Description',
  first_impression: 'First Impression',
  backstory: 'Backstory',
  motivation: 'Motivation',
  arc: 'Character Arc',
  relationships: 'Relationships',
  voice: 'Voice',
  dialogue_style: 'Dialogue Style',
  secrets: 'Secrets',
  strengths: 'Strengths',
  weaknesses: 'Weaknesses',
  fears: 'Fears',
  goals: 'Goals',
  flaw: 'Fatal Flaw',
  fatal_flaw: 'Fatal Flaw',
  want: 'Want',
  need: 'Need',
  wound: 'Wound',
  ghost: 'Ghost',
  lie: 'The Lie They Believe',
  truth: 'The Truth',
  change: 'Change / Arc',
  traits: 'Key Traits',
  signature_behaviours: 'Signature Behaviours',
  signature_behaviors: 'Signature Behaviours',
  episode_appearances: 'Episode Appearances',
  casting_notes: 'Casting Notes',
  notes: 'Notes',
  // Beat / moment shared fields
  number: 'Number',
  title: 'Title',
  description: 'Description',
  summary: 'Summary',
  // Beat-specific fields
  page_range: 'Page Range',
  emotional_shift: 'Emotional Shift',
  protagonist_state: 'Protagonist State',
  dramatic_function: 'Dramatic Function',
  // Generic display helpers
  comparable_titles: 'Comparable Titles',
  target_audience: 'Target Audience',
  genre: 'Genre',
  subgenre: 'Subgenre',
  tone: 'Tone',
  tone_tags: 'Tone Tags',
  themes: 'Themes',
  premise: 'Premise',
  central_question: 'Central Question',
  world_building_notes: 'World Building Notes',
};

/** Beat card — for beat_sheet and similar beat-pattern documents */
function BeatCard({ beat, index }: { beat: Record<string, any>; index: number }) {
  const num = beat.number ?? index + 1;
  const name = beat.name || beat.title || `Beat ${num}`;
  const page = beat.page_range || beat.page || '';

  const excludeKeys = new Set(['number', 'name', 'title', 'page_range', 'page']);
  const fields = Object.entries(beat).filter(([k, v]) => !excludeKeys.has(k) && v != null && v !== '');

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c49a3d', whiteSpace: 'nowrap' }}>
            Beat {num}
          </span>
          {page && (
            <span style={{ fontSize: '0.65rem', color: 'rgba(138,136,128,0.7)' }}>
              p. {page}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground, #e2e0dc)', marginTop: '0.2rem', lineHeight: 1.3 }}>
          {name}
        </div>
      </div>

      {beat.description && (
        <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'rgba(226,224,220,0.85)', marginBottom: fields.length > 0 ? '0.85rem' : 0, whiteSpace: 'pre-wrap' }}>
          {beat.description}
        </div>
      )}

      {fields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.75rem' }}>
          {fields.map(([key, value]) => {
            const label = FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const displayValue = Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? null : String(value);
            if (displayValue === null) return null;
            return (
              <div key={key}>
                <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(138,136,128,0.7)', marginBottom: '0.15rem' }}>{label}</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(226,224,220,0.75)', lineHeight: 1.5 }}>{displayValue}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Moment card — for story_outline and similar entry-pattern documents */
function MomentCard({ entry, index }: { entry: Record<string, any>; index: number }) {
  const num = entry.number ?? index + 1;
  const title = entry.title || entry.name || `Moment ${num}`;

  const excludeKeys = new Set(['number', 'title', 'name']);
  const fields = Object.entries(entry).filter(([k, v]) => !excludeKeys.has(k) && v != null && v !== '');

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c49a3d', whiteSpace: 'nowrap' }}>
          Moment {num}
        </span>
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground, #e2e0dc)', marginBottom: '0.5rem', lineHeight: 1.3 }}>
        {title}
      </div>
      {entry.description && (
        <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'rgba(226,224,220,0.85)', whiteSpace: 'pre-wrap' }}>
          {entry.description}
        </div>
      )}
      {fields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.75rem' }}>
          {fields.map(([key, value]) => {
            const label = FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const displayValue = Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? null : String(value);
            if (displayValue === null) return null;
            return (
              <div key={key}>
                <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(138,136,128,0.7)', marginBottom: '0.15rem' }}>{label}</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(226,224,220,0.75)', lineHeight: 1.5 }}>{displayValue}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CharacterCard({ char, index }: { char: Record<string, any>; index: number }) {
  const name = char.name || char.character_name || `Character ${index + 1}`;
  const role = char.role || char.character_role || '';

  const excludeKeys = new Set(['name', 'character_name', 'role', 'character_role']);
  const fields = Object.entries(char).filter(([k]) => !excludeKeys.has(k));

  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      paddingBottom: '2rem',
      marginBottom: '2rem',
    }}>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{
          fontSize: '1rem',
          fontWeight: 600,
          color: 'var(--foreground, #e2e0dc)',
          marginBottom: '0.2rem',
        }}>
          {name}
        </div>
        {role && (
          <div style={{
            fontSize: '0.7rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#c49a3d',
            opacity: 0.8,
          }}>
            {role}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {fields.map(([key, value]) => {
          if (!value || value === '' || value === null) return null;
          const label = FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const displayValue = Array.isArray(value)
            ? value.join(', ')
            : typeof value === 'object'
              ? JSON.stringify(value, null, 2)
              : String(value);

          return (
            <div key={key}>
              <div style={{
                fontSize: '0.65rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(138,136,128,0.7)',
                marginBottom: '0.2rem',
              }}>
                {label}
              </div>
              <div style={{
                fontSize: '0.85rem',
                lineHeight: 1.65,
                color: 'rgba(226,224,220,0.85)',
                whiteSpace: 'pre-wrap',
              }}>
                {displayValue}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tryParseJSON(text: string): any | null {
  const trimmed = text.trim();
  // Try direct parse first (content starts with { or [)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch { /* fall through to extraction */ }
  }
  // Try extracting the first JSON object/array even if there's leading text
  // Handles formats like "CHARACTERS\n{...}" or markdown-wrapped JSON
  const start = trimmed.search(/[{[]/);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* not JSON */ }
  }
  return null;
}

function renderJSON(parsed: any) {
  // Array of characters
  if (Array.isArray(parsed)) {
    // Check if it's an array of character objects
    if (parsed.length > 0 && typeof parsed[0] === 'object') {
      // Determine dispatch: beat pattern (number+name), moment pattern (number+title), or character
      const first = parsed[0];
      const isBeatArray = first.number != null && (first.name != null || first.title != null) && (first.page_range != null || first.dramatic_function != null || first.emotional_shift != null);
      const isMomentArray = first.number != null && first.title != null && first.description != null && !first.backstory && !first.arc;
      const isCharacterArray = first.name != null || first.character_name != null || first.role != null;

      if (isBeatArray) {
        return (
          <div>
            {parsed.map((item, i) => <BeatCard key={i} beat={item} index={i} />)}
          </div>
        );
      }
      if (isMomentArray) {
        return (
          <div>
            {parsed.map((item, i) => <MomentCard key={i} entry={item} index={i} />)}
          </div>
        );
      }
      if (isCharacterArray) {
        return (
          <div>
            {parsed.map((item, i) => <CharacterCard key={i} char={item} index={i} />)}
          </div>
        );
      }
      // Array of primitive values
      return (
        <ul style={{ paddingLeft: '1.25rem', color: 'rgba(226,224,220,0.85)', fontSize: '0.85rem', lineHeight: 1.7 }}>
          {parsed.map((item, i) => (
            <li key={i}>{String(item)}</li>
          ))}
        </ul>
      );
    }
    // Simple array
    return (
      <ul style={{ paddingLeft: '1.25rem', color: 'rgba(226,224,220,0.85)', fontSize: '0.85rem', lineHeight: 1.7 }}>
        {parsed.map((item: any, i: number) => (
          <li key={i}>{String(item)}</li>
        ))}
      </ul>
    );
  }

  // Unwrap common wrapper keys: CHARACTER_BIBLE, character_bible, CHARACTERS, BEATS, ENTRIES, ACT_BREAKS, etc.
  const WRAPPER_KEYS = ['CHARACTER_BIBLE', 'character_bible', 'CHARACTERS', 'characters_list', 'cast', 'BEATS', 'ENTRIES', 'beats', 'entries', 'ACT_BREAKS', 'act_breaks'];
  for (const wk of WRAPPER_KEYS) {
    if (parsed[wk] && typeof parsed[wk] === 'object') {
      return renderJSON(parsed[wk]);
    }
  }

  // Object with a "characters" key
  if (parsed.characters && Array.isArray(parsed.characters)) {
    return (
      <div>
        {parsed.characters.map((char: any, i: number) => (
          <CharacterCard key={i} char={char} index={i} />
        ))}
      </div>
    );
  }

  // Act breaks pattern: array of objects with act_number + description (from treatment documents)
  if ((parsed.act_breaks || parsed.ACT_BREAKS) && Array.isArray(parsed.act_breaks || parsed.ACT_BREAKS)) {
    const actBreaks = parsed.act_breaks || parsed.ACT_BREAKS;
    return (
      <div>
        {actBreaks.map((item: any, i: number) => {
          const actNum = item.act_number ?? item.actNumber ?? i + 1;
          const desc = item.description || '';
          return (
            <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c49a3d', marginBottom: '0.4rem' }}>
                Act {actNum}
              </div>
              {desc && (
                <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'rgba(226,224,220,0.85)', whiteSpace: 'pre-wrap' }}>
                  {desc}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Beat pattern: array of objects with number + name (beat_sheet, episode_beats, etc.)
  // Detect: has number field + name field + NO typical character fields (backstory, arc, want, need)
  if (parsed.beats && Array.isArray(parsed.beats)) {
    return (
      <div>
        {parsed.beats.map((beat: any, i: number) => (
          <BeatCard key={i} beat={beat} index={i} />
        ))}
      </div>
    );
  }

  // Treatment document: treatment prose (string) + optional act_breaks
  // Display: prose first, then act breaks as a structured section
  if (typeof parsed.treatment === 'string') {
    return (
      <div>
        {parsed.treatment && (
          <div style={{ fontSize: '0.85rem', lineHeight: 1.75, color: 'rgba(226,224,220,0.88)', whiteSpace: 'pre-wrap', marginBottom: '2rem' }}>
            {parsed.treatment}
          </div>
        )}
        {parsed.act_breaks && Array.isArray(parsed.act_breaks) && parsed.act_breaks.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(138,136,128,0.7)', marginBottom: '1rem' }}>Act Structure</div>
            {(parsed.act_breaks || []).map((item: any, i: number) => {
              const actNum = item.act_number ?? item.actNumber ?? i + 1;
              const desc = item.description || '';
              return (
                <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.85rem', marginBottom: '0.85rem' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c49a3d', marginBottom: '0.3rem' }}>
                    Act {actNum}
                  </div>
                  {desc && (
                    <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'rgba(226,224,220,0.78)', whiteSpace: 'pre-wrap' }}>
                      {desc}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Treatment narrative: prose stored in treatment_narrative field (legacy format)
  if (parsed.treatment_narrative && typeof parsed.treatment_narrative === 'string') {
    return (
      <div style={{ fontSize: '0.85rem', lineHeight: 1.75, color: 'rgba(226,224,220,0.88)', whiteSpace: 'pre-wrap' }}>
        {parsed.treatment_narrative}
      </div>
    );
  }

  // Story outline / moment pattern: array of objects with number + title
  if (parsed.entries && Array.isArray(parsed.entries)) {
    return (
      <div>
        {parsed.entries.map((entry: any, i: number) => (
          <MomentCard key={i} entry={entry} index={i} />
        ))}
      </div>
    );
  }

  // Single character object (has name or role — not a beat or moment)
  if (parsed.name || parsed.role || parsed.character_name) {
    // Exclude beat/moment objects that accidentally have a 'name' or 'title' field
    const isBeat = parsed.number != null && (parsed.page_range != null || parsed.dramatic_function != null);
    const isMoment = parsed.number != null && parsed.description != null && parsed.title != null;
    if (isBeat) return <BeatCard beat={parsed} index={0} />;
    if (isMoment) return <MomentCard entry={parsed} index={0} />;
    return <CharacterCard char={parsed} index={0} />;
  }

  // Single beat object (has number + name but arrived as a lone object)
  if (parsed.number != null && (parsed.name || parsed.title)) {
    const isMoment = parsed.description != null;
    if (isMoment) return <MomentCard entry={parsed} index={0} />;
    return <BeatCard beat={parsed} index={0} />;
  }

  // Generic object — render as labelled fields
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {Object.entries(parsed).map(([key, value]) => {
        if (!value) return null;
        const label = FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const display = Array.isArray(value)
          ? (typeof value[0] === 'object' ? null : value.join(', '))
          : typeof value === 'object' ? null : String(value);

        if (display === null && Array.isArray(value) && typeof value[0] === 'object') {
          return (
            <div key={key}>
              <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(138,136,128,0.7)', marginBottom: '0.5rem' }}>{label}</div>
              {value.map((item: any, i: number) => (
                <CharacterCard key={i} char={item} index={i} />
              ))}
            </div>
          );
        }

        return (
          <div key={key}>
            <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(138,136,128,0.7)', marginBottom: '0.2rem' }}>{label}</div>
            <div style={{ fontSize: '0.85rem', lineHeight: 1.65, color: 'rgba(226,224,220,0.85)', whiteSpace: 'pre-wrap' }}>{display || JSON.stringify(value, null, 2)}</div>
          </div>
        );
      })}
    </div>
  );
}

function isLikelyMarkdown(text: string): boolean {
  const trimmed = text.trim();
  // Markdown headers, bold, italic, bullet lists, or section-like formatting
  return /^#{1,6}\s|\*{1,2}[^*]+\*{1,2}|^\*[\s\*]|^[a-zA-Z][\s_][a-zA-Z]/.test(trimmed);
}

export function FormattedDocContent({ text, editable, onChange, className }: Props) {
  const [viewMode, setViewMode] = useState<'formatted' | 'raw' | 'editing'>(
    editable ? 'editing' : 'formatted'
  );
  const parsed = tryParseJSON(text);
  const isJSON = parsed !== null;
  const isMarkdown = !isJSON && isLikelyMarkdown(text);

  // ── RAW TEXTAREA ──────────────────────────────────────────────────────────
  if (viewMode === 'raw') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem', gap: '0.5rem' }}>
          {isMarkdown && (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground"
              onClick={() => setViewMode(editable ? 'editing' : 'formatted')}>
              <Eye className="h-3 w-3" /> Formatted
            </Button>
          )}
          {isJSON && (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground"
              onClick={() => setViewMode('formatted')}>
              <Eye className="h-3 w-3" /> Formatted view
            </Button>
          )}
        </div>
        <textarea
          className={className || "w-full min-h-[300px] max-h-[70vh] overflow-y-auto text-sm text-foreground whitespace-pre-wrap font-body leading-relaxed bg-transparent border-none outline-none resize-none focus:ring-0"}
          value={text}
          onChange={e => onChange?.(e.target.value)}
          readOnly={!editable}
          placeholder="Start writing here…"
        />
      </div>
    );
  }

  // ── JSON — formatted JSON ─────────────────────────────────────────────────
  if (isJSON) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground"
            onClick={() => setViewMode('raw')}>
            <Code className="h-3 w-3" /> Raw
          </Button>
        </div>
        <div style={{ minHeight: 300, maxHeight: '70vh', overflowY: 'auto' }}>
          {renderJSON(parsed)}
        </div>
      </div>
    );
  }

  // ── MARKDOWN — rendered markdown ────────────────────────────────────────
  if (isMarkdown) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem', gap: '0.5rem' }}>
          {editable && (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground"
              onClick={() => setViewMode('editing')}>
              <Code className="h-3 w-3" /> Edit
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground"
            onClick={() => setViewMode('raw')}>
            <Code className="h-3 w-3" /> Raw
          </Button>
        </div>
        <div
          className="markdown-body"
          style={{ minHeight: 300, maxHeight: '70vh', overflowY: 'auto', fontSize: '0.85rem', lineHeight: 1.75, color: 'rgba(226,224,220,0.9)' }}
        >
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      </div>
    );
  }

  // ── FALLBACK: plain text ────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        {editable && (
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground"
            onClick={() => setViewMode('editing')}>
            <Code className="h-3 w-3" /> Edit
          </Button>
        )}
      </div>
      {viewMode === 'editing' || editable ? (
        <textarea
          className={className || "w-full min-h-[300px] max-h-[70vh] overflow-y-auto text-sm text-foreground whitespace-pre-wrap font-body leading-relaxed bg-transparent border-none outline-none resize-none focus:ring-0"}
          value={text}
          onChange={e => onChange?.(e.target.value)}
          readOnly={!editable}
          placeholder="Start writing here…"
        />
      ) : (
        <pre className="whitespace-pre-wrap text-sm text-foreground font-body leading-relaxed">
          {text}
        </pre>
      )}
    </div>
  );
}
