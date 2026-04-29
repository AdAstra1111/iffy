/**
 * Deterministic autofill extractor for seed pack documents.
 * Reads plaintext from seed docs and parses sections via regex/headings
 * to populate project fields. NO LLM calls.
 */
import { supabase } from '@/integrations/supabase/client';

interface SeedDoc {
  doc_type: string;
  plaintext: string;
}

export interface AutofillResult {
  comparable_titles?: string;
  target_audience?: string;
  tone?: string;
  genres?: string[];
  pitchLogline?: string;
  pitchPremise?: string;
  guardrails_overrides?: Record<string, any>;
  story_setup?: Record<string, string>;
}

/** Fetch current-version plaintext for seed doc types */
export async function loadSeedDocs(projectId: string): Promise<SeedDoc[]> {
  // Get seed documents
  const { data: docs } = await supabase
    .from('project_documents')
    .select('id, doc_type')
    .eq('project_id', projectId)
    .in('doc_type', ['market_positioning', 'creative_brief', 'canon', 'nec', 'project_overview', 'concept_brief']);

  if (!docs || docs.length === 0) return [];

  // Get current versions with plaintext
  const docIds = docs.map(d => d.id);
  const { data: versions } = await supabase
    .from('project_document_versions')
    .select('document_id, plaintext')
    .in('document_id', docIds)
    .eq('is_current', true);

  if (!versions) return [];

  const result: SeedDoc[] = [];
  for (const doc of docs) {
    const ver = versions.find(v => v.document_id === doc.id);
    const text = ver?.plaintext || '';
    if (text.trim()) {
      result.push({ doc_type: doc.doc_type, plaintext: text });
    }
  }
  return result;
}

/** Extract a section between a heading and the next heading */
function extractSection(text: string, headingPattern: RegExp): string {
  const match = text.match(headingPattern);
  if (!match) return '';
  const startIdx = match.index! + match[0].length;
  // Find next heading (## or **Heading**)
  const rest = text.slice(startIdx);
  const nextHeading = rest.match(/\n(?:#{1,3}\s|[*]{2}[A-Z])/);
  const section = nextHeading ? rest.slice(0, nextHeading.index!) : rest;
  return section.trim();
}

/** Extract bullet items from a section */
function extractBullets(section: string): string[] {
  return section
    .split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(l => l.length > 0 && l.length < 200);
}

/** Deterministic extraction from seed doc plaintext */
export function extractAutofill(seedDocs: SeedDoc[]): AutofillResult {
  const result: AutofillResult = {};
  const guardrails: Record<string, any> = {};
  const storySetup: Record<string, string> = {};

  for (const doc of seedDocs) {
    const text = doc.plaintext;

    if (doc.doc_type === 'market_positioning') {
      // Extract comparable titles
      const compSection = extractSection(text, /(?:#{1,3}\s*)?(?:Comparable|Comp|Reference)\s*(?:Titles?|Projects?|Works?)/i);
      if (compSection) {
        const titles = extractBullets(compSection).slice(0, 8);
        if (titles.length > 0) {
          result.comparable_titles = titles.join(', ');
        }
      }

      // Extract target audience
      const audSection = extractSection(text, /(?:#{1,3}\s*)?(?:Target\s*)?Audience/i);
      if (audSection) {
        // Take first meaningful line
        const lines = audSection.split('\n').map(l => l.trim()).filter(l => l.length > 5);
        if (lines.length > 0) {
          result.target_audience = lines[0].replace(/^[-•*]\s*/, '').slice(0, 200);
        }
      }

      // Extract genre
      const genreSection = extractSection(text, /(?:#{1,3}\s*)?Genre/i);
      if (genreSection) {
        const genreLines = extractBullets(genreSection).slice(0, 4);
        if (genreLines.length > 0) {
          result.genres = genreLines.map(g => g.toLowerCase().replace(/[^a-z\s-]/g, '').trim()).filter(Boolean);
        }
      }
    }

    if (doc.doc_type === 'creative_brief') {
      // Extract tone
      const toneSection = extractSection(text, /(?:#{1,3}\s*)?(?:Tone|Voice|Style)/i);
      if (toneSection) {
        const lines = toneSection.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        if (lines.length > 0) {
          result.tone = lines[0].replace(/^[-•*]\s*/, '').slice(0, 150);
          guardrails.voice_style = lines.slice(0, 3).join('; ');
        }
      }

      // Extract logline
      const logSection = extractSection(text, /(?:#{1,3}\s*)?(?:Logline|Log\s*Line|One[- ]?Liner)/i);
      if (logSection) {
        const line = logSection.split('\n').map(l => l.trim()).find(l => l.length > 10);
        if (line) {
          result.pitchLogline = line.replace(/^[-•*"]\s*/, '').replace(/"$/, '').slice(0, 300);
        }
      }

      // Extract premise
      const premiseSection = extractSection(text, /(?:#{1,3}\s*)?(?:Premise|Synopsis|Summary)/i);
      if (premiseSection) {
        result.pitchPremise = premiseSection.slice(0, 500);
      }

      // Extract genre if not already found
      if (!result.genres) {
        const genreSection = extractSection(text, /(?:#{1,3}\s*)?Genre/i);
        if (genreSection) {
          const genreLines = extractBullets(genreSection).slice(0, 4);
          if (genreLines.length > 0) {
            result.genres = genreLines.map(g => g.toLowerCase().replace(/[^a-z\s-]/g, '').trim()).filter(Boolean);
          }
        }
      }
    }

    if (doc.doc_type === 'canon') {
      // Extract world rules / constraints as guardrail notes
      const rulesSection = extractSection(text, /(?:#{1,3}\s*)?(?:World\s*Rules?|Constraints?|Canon\s*Rules?|Mandatories)/i);
      if (rulesSection) {
        guardrails.canon_constraints = rulesSection.slice(0, 500);
      }

      // Extract protagonist identity — key section in canon
      const protSection = extractSection(text, /(?:#{1,3}\s*)?(?:Protagonist|Core\s*Concept|Central\s*Question|Story\s*Engine)/i);
      if (protSection) {
        const firstPara = protSection.split('\n').map(l => l.trim()).filter(l => l.length > 20)[0];
        if (firstPara) storySetup.protagonist = firstPara.slice(0, 400);
      }

      // Extract relationship / character tension axis
      const relSection = extractSection(text, /(?:#{1,3}\s*)?(?:Relationship|Tension\s*Axis|Character\s*Engine|Key\s*Relationship)/i);
      if (relSection) {
        const firstPara = relSection.split('\n').map(l => l.trim()).filter(l => l.length > 20)[0];
        if (firstPara) storySetup.relationships = firstPara.slice(0, 400);
      }

      // Extract premise / core concept as story setup
      const premiseSection = extractSection(text, /(?:#{1,3}\s*)?(?:Premise|Premise\s*Statement|Central\s*Premise)/i);
      if (premiseSection && !storySetup.protagonist) {
        const firstPara = premiseSection.split('\n').map(l => l.trim()).filter(l => l.length > 20)[0];
        if (firstPara) storySetup.premise = firstPara.slice(0, 400);
      }

      // Extract logline if not already found
      if (!result.pitchLogline) {
        const logSection = extractSection(text, /(?:#{1,3}\s*)?(?:Logline|Log\s*Line|One[- ]?Liner)/i);
        if (logSection) {
          const line = logSection.split('\n').map(l => l.trim()).find(l => l.length > 10);
          if (line) {
            result.pitchLogline = line.replace(/^[-•*"]\s*/, '').replace(/"$/, '').slice(0, 300);
          }
        }
      }
    }

    // ── concept_brief — rich character information (protagonist, antagonist, tension) ──
    // concept_brief plaintext contains: LOGLINE, PREMISE, THEMES, CENTRAL QUESTION, WORLD BUILDING
    // These sections have rich character info even without explicit "Protagonist" headings.
    // We must extract from PREMISE (character names + roles + arcs) and WORLD BUILDING.
    if (doc.doc_type === 'concept_brief') {
      // Extract premise (usually contains protagonist + antagonist + arc description)
      const premiseSection = extractSection(text, /(?:#{1,3}\s*)?(?:PREMISE|Premise\s*Statement|Central\s*Premise|Story\s*Premise)/i);
      if (premiseSection) {
        const firstPara = premiseSection.split('\n').map(l => l.trim()).filter(l => l.length > 30)[0];
        if (firstPara) {
          // If no protagonist extracted yet, use premise as protagonist context
          if (!storySetup.protagonist) {
            storySetup.protagonist = firstPara.slice(0, 500);
          }
          // Always populate premise if we have a good paragraph
          storySetup.premise = firstPara.slice(0, 500);
        }
      }

      // Extract logline (character names appear here)
      const logSection = extractSection(text, /(?:#{1,3}\s*)?(?:LOGLINE|Logline|Log\s*Line|One[- ]?Liner)/i);
      if (logSection) {
        const line = logSection.split('\n').map(l => l.trim()).find(l => l.length > 20);
        if (line) {
          result.pitchLogline = line.replace(/^[-•*"]\s*/, '').replace(/"$/, '').slice(0, 300);
          // If no protagonist yet, logline is a good fallback
          if (!storySetup.protagonist) {
            storySetup.protagonist = line.slice(0, 300);
          }
        }
      }

      // Extract central question — drives character engine
      const cqSection = extractSection(text, /(?:#{1,3}\s*)?(?:CENTRAL\s*QUESTION|Central\s*Question|Story\s*Question|Dramatic\s*Question)/i);
      if (cqSection) {
        const firstPara = cqSection.split('\n').map(l => l.trim()).filter(l => l.length > 20)[0];
        if (firstPara) storySetup.stakes = firstPara.slice(0, 400);
      }

      // Extract world building — sets character context
      const wbSection = extractSection(text, /(?:#{1,3}\s*)?(?:WORLD\s*BUILDING|World\s*Building|Setting|Environment)/i);
      if (wbSection) {
        const firstPara = wbSection.split('\n').map(l => l.trim()).filter(l => l.length > 30)[0];
        if (firstPara) storySetup.world = firstPara.slice(0, 400);
      }

      // Extract themes — drives character arcs
      const themesSection = extractSection(text, /(?:#{1,3}\s*)?(?:THEMES?|Core\s*Themes?|Key\s*Themes?)/i);
      if (themesSection) {
        const bullets = extractBullets(themesSection).slice(0, 6);
        if (bullets.length > 0) {
          storySetup.themes = bullets.join(', ');
        }
      }

      // Extract genre — used for story_setup tone inference
      const genreSection = extractSection(text, /(?:#{1,3}\s*)?(?:GENRE|Subgenre)/i);
      if (genreSection && !result.genres) {
        const genreLines = extractBullets(genreSection).slice(0, 3);
        if (genreLines.length > 0) {
          result.genres = genreLines.map(g => g.toLowerCase().replace(/[^a-z\s-]/g, '').trim()).filter(Boolean);
        }
      }
    }

    if (doc.doc_type === 'project_overview') {
      // Fallback logline/premise from overview
      if (!result.pitchLogline) {
        const logSection = extractSection(text, /(?:#{1,3}\s*)?(?:Logline|Log\s*Line)/i);
        if (logSection) {
          const line = logSection.split('\n').map(l => l.trim()).find(l => l.length > 10);
          if (line) result.pitchLogline = line.replace(/^[-•*"]\s*/, '').replace(/"$/, '').slice(0, 300);
        }
      }
      if (!result.pitchPremise) {
        const premiseSection = extractSection(text, /(?:#{1,3}\s*)?(?:Premise|Synopsis|Overview|Summary)/i);
        if (premiseSection) result.pitchPremise = premiseSection.slice(0, 500);
      }
    }
  }

  if (Object.keys(guardrails).length > 0) {
    result.guardrails_overrides = guardrails;
  }
  if (Object.keys(storySetup).length > 0) {
    result.story_setup = storySetup;
  }

  return result;
}

/** Apply autofill results to the project (merge, don't overwrite existing) */
export async function applyAutofillToProject(projectId: string, autofill: AutofillResult): Promise<void> {
  // Fetch current project to merge
  const { data: proj } = await supabase
    .from('projects')
    .select('comparable_titles, target_audience, tone, genres, guardrails_config')
    .eq('id', projectId)
    .single();

  const updates: Record<string, any> = {};

  // Only fill empty fields
  if (autofill.comparable_titles && !proj?.comparable_titles) {
    updates.comparable_titles = autofill.comparable_titles;
  }
  if (autofill.target_audience && !proj?.target_audience) {
    updates.target_audience = autofill.target_audience;
  }
  if (autofill.tone && !proj?.tone) {
    updates.tone = autofill.tone;
  }
  if (autofill.genres && (!proj?.genres || (proj.genres as string[]).length === 0)) {
    updates.genres = autofill.genres;
  }

  // Merge guardrails
  if (autofill.guardrails_overrides || autofill.story_setup) {
    const gc = (proj?.guardrails_config as any) || {};
    gc.overrides = gc.overrides || {};

    if (autofill.guardrails_overrides) {
      gc.overrides.autofill = { ...((gc.overrides as any).autofill || {}), ...autofill.guardrails_overrides };
    }

    // Populate story_setup — this feeds the dev engine's protagonist/relationship context
    if (autofill.story_setup) {
      const existingStorySetup = gc.overrides.story_setup || {};
      gc.overrides.story_setup = { ...existingStorySetup, ...autofill.story_setup };
    }

    updates.guardrails_config = gc;
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('projects').update(updates).eq('id', projectId);
  }
}
