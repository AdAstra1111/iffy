import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DocumentClassification {
  doc_type: 'screenplay' | 'treatment' | 'concept_brief' | 'beat_sheet' | 'character_bible' | 'story_outline' | 'pitch_document' | 'episode_grid' | 'market_sheet' | 'deck' | 'other';
  confidence: 'high' | 'medium' | 'low';
  lane: 'feature_film' | 'vertical_drama' | 'ambiguous';
  reasoning: string;
  key_signals: string[];
}

export function useDocumentClassifier() {
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState<DocumentClassification | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classify = async (file: File): Promise<DocumentClassification | null> => {
    setClassifying(true);
    setError(null);
    try {
      // Read first 2000 chars
      const text = await file.slice(0, 2000).text();
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const resp = await fetch('/api/supabase-proxy/functions/v1/classify-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text }),
      });

      if (!resp.ok) {
        // Fallback: simple heuristic classifier if edge function doesn't exist yet
        return fallbackClassify(text, file.name);
      }

      const data = await resp.json();
      const result: DocumentClassification = {
        doc_type: data.doc_type || 'other',
        confidence: data.confidence || 'low',
        lane: data.lane || 'ambiguous',
        reasoning: data.reasoning || '',
        key_signals: data.key_signals || [],
      };
      setClassification(result);
      return result;
    } catch (e: any) {
      setError(e.message);
      // Fallback to heuristic
      return fallbackClassify(await file.slice(0, 2000).text(), file.name);
    } finally {
      setClassifying(false);
    }
  };

  return { classify, classifying, classification, error, clear: () => setClassification(null) };
}

function fallbackClassify(text: string, fileName: string): DocumentClassification {
  const lower = text.toLowerCase();
  const signals: string[] = [];
  let doc_type: DocumentClassification['doc_type'] = 'other';
  
  // Screenplay signals
  if (/^(int\.?|ext\.?|int\/ext\.?)\b/m.test(text) && text.includes('\n')) {
    signals.push('Scene headings detected (INT./EXT.)');
  }
  
  // Treatment signals
  if (lower.includes('treatment') && (lower.includes('act ') || lower.includes('protagonist') || lower.length > 5000)) {
    doc_type = 'treatment';
    signals.push('Treatment language detected');
    if (/act one|act two|act three|act 1|act 2|act 3/i.test(text)) signals.push('Act structure present');
  }
  
  // Beat sheet signals
  if (/\bbeat \b/i.test(text) && (text.match(/\bbeat \b/gi)?.length || 0) > 3) {
    doc_type = 'beat_sheet';
    signals.push('Beat structure detected');
  }
  
  // Character bible signals
  if (/character bible|character profile|character breakdown|character description/i.test(text)) {
    doc_type = 'character_bible';
    signals.push('Character bible format detected');
  }
  
  // Concept brief signals  
  if (/concept|logline|genre|tone|target audience|comparable/i.test(text) && text.length < 3000) {
    doc_type = 'concept_brief';
    signals.push('Concept brief format detected');
  }
  
  // Story outline signals
  if (/outline|summary|synopsis|chapter|part \b/i.test(text) && lower.includes('character')) {
    doc_type = 'story_outline';
    signals.push('Story outline format detected');
  }
  
  // Episode grid signals
  if (/episode \b.*\bepisode \b|episode \b.*\bseason\b|episode \b.*\bhook\b/i.test(text)) {
    doc_type = 'episode_grid';
    signals.push('Episode/season structure detected');
  }
  
  // Lane inference
  let lane: DocumentClassification['lane'] = 'ambiguous';
  if (/episode|season|chapter \b|episode \b+\b hook|cliffhanger/i.test(lower)) {
    lane = 'vertical_drama';
    signals.push('Vertical drama signals (episodes/seasons)');
  } else if (doc_type === 'screenplay' || /\bpages?\b.*\b(90|120|100)\b/i.test(text)) {
    lane = 'feature_film';
    signals.push('Feature film signals (page count)');
  }
  
  const confidence: DocumentClassification['confidence'] = signals.length >= 2 ? 'high' : signals.length >= 1 ? 'medium' : 'low';
  
  return {
    doc_type,
    confidence,
    lane,
    reasoning: `Fallback heuristic: ${signals.join(', ') || 'no clear signals'}`,
    key_signals: signals.slice(0, 5),
  };
}
