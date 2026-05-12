
import { describe, it, expect } from 'vitest';

// ── Interfaces ──
interface CharBibleSection {
  name: string;
  role: string;
  header: string;
  body: string;
  sectionType: 'character' | 'relationship_dynamics' | 'ensemble_notes';
}

// ── isAffected (inline copy) ──
function buildIsAffected(allNoteText: string) {
  return (section: CharBibleSection): boolean => {
    if (section.sectionType === 'relationship_dynamics') {
      const rdKeywords = /\b(relationship|dynamic|character dynamic|paired dynamic)\b/i;
      return rdKeywords.test(allNoteText);
    }
    if (section.sectionType === 'ensemble_notes') {
      const enKeywords = /\b(ensemble|group|team note|cast dynamic|ensemble dynamics)\b/i;
      return enKeywords.test(allNoteText);
    }
    const nameLower = section.name.toLowerCase();
    const namePattern = new RegExp(
      nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );
    return namePattern.test(allNoteText);
  };
}

describe('Diagnostic', () => {
  it('should diagnose RD keywords', () => {
    const rdKeywords = /\b(relationship|dynamic|character dynamic|paired dynamic)\b/i;
    const text = 'Need to improve character dynamics and paired dynamics';
    console.log('RD keywords match for text:', text, '->', rdKeywords.test(text));
    // Check individual patterns
    console.log('relationship:', /\brelationship\b/i.test(text));
    console.log('dynamic:', /\bdynamic\b/i.test(text));
    console.log('character dynamic:', /\bcharacter dynamic\b/i.test(text));
    console.log('paired dynamic:', /\bpaired dynamic\b/i.test(text));
    // The issue: "dynamics" has an 's' - so \bdynamic\b doesn't match "dynamics"
    // because 's' is a word char, so no boundary between 'c' and 's'
    expect(rdKeywords.test(text)).toBe(true);  // Expect FAILURE
  });

  it('should diagnose EN keywords', () => {
    const enKeywords = /\b(ensemble|group|team note|cast dynamic|ensemble dynamics)\b/i;
    const text = 'The ensemble dynamics need work and cast dynamic';
    console.log('EN keywords match for text:', text, '->', enKeywords.test(text));
    console.log('ensemble:', /\bensemble\b/i.test(text));
    console.log('cast dynamic:', /\bcast dynamic\b/i.test(text));
    console.log('ensemble dynamics:', /\bensemble dynamics\b/i.test(text));
    expect(enKeywords.test(text)).toBe(true);  // Expect FAILURE? Actually let me check
  });

  it('should diagnose extractDocHeader', () => {
    // Simulate inline implementation
    function extractDocHeader(fullText: string): string {
      const firstSectionMatch = fullText.match(/^##\s+/m);
      const firstSectionIndex = firstSectionMatch ? firstSectionMatch.index! : 0;
      return firstSectionIndex > 0 ? fullText.slice(0, firstSectionIndex) : '';
    }
    
    const text = '# Just a title\nSome text without any ## sections.';
    const match = text.match(/^##\s+/m);
    console.log('Match result:', match);
    // No match -> firstSectionIndex = 0 -> returns '' (because 0 > 0 is false)
    // But test expects: '# Just a title\nSome text without any ## sections.'
    const result = extractDocHeader(text);
    console.log('Result:', JSON.stringify(result));
    console.log('Expected:', JSON.stringify(text));
  });

  it('should diagnose body content', () => {
    function parseCharacterBibleSections(fullText: string): CharBibleSection[] {
      const sections: CharBibleSection[] = [];
      const lines = fullText.split('\n');
      const headerRegex = /^##\s+\d+\.\s+(.+?)\s+\(([^)]+)\)\s*$/;
      const nonCharHeaderRegex = /^##\s+(RELATIONSHIP DYNAMICS|ENSEMBLE NOTES)\s*$/i;
      let currentName = '';
      let currentRole = '';
      let currentHeader = '';
      let currentStart = -1;
      let currentSectionType: CharBibleSection['sectionType'] = 'character';

      for (let i = 0; i < lines.length; i++) {
        const charMatch = lines[i].match(headerRegex);
        const nonCharMatch = lines[i].match(nonCharHeaderRegex);
        if (charMatch || nonCharMatch) {
          if (currentName && currentStart >= 0) {
            const bodyLines = lines.slice(currentStart, i);
            sections.push({ name: currentName, role: currentRole, header: currentHeader, body: bodyLines.join('\n'), sectionType: currentSectionType });
          }
          if (charMatch) {
            currentName = charMatch[1].trim();
            currentRole = charMatch[2].trim();
            currentHeader = lines[i];
            currentSectionType = 'character';
          } else if (nonCharMatch) {
            const headerName = nonCharMatch[1].trim().toUpperCase();
            currentName = headerName;
            currentRole = '';
            currentHeader = lines[i];
            currentSectionType = headerName === 'RELATIONSHIP DYNAMICS' ? 'relationship_dynamics' : 'ensemble_notes';
          }
          currentStart = i;
        }
      }
      if (currentName && currentStart >= 0) {
        const bodyLines = lines.slice(currentStart);
        sections.push({ name: currentName, role: currentRole, header: currentHeader, body: bodyLines.join('\n'), sectionType: currentSectionType });
      }
      return sections;
    }

    const text = '## 1. Ann (Lead)\n\nAnn is the protagonist.\nShe drives the plot.\n\n## 2. Bob (Supporting)\n\nBob helps.';
    const sections = parseCharacterBibleSections(text);
    console.log('Section count:', sections.length);
    console.log('Section 0 body (repr):', JSON.stringify(sections[0].body));
    console.log('Expected (repr):', JSON.stringify('## 1. Ann (Lead)\n\nAnn is the protagonist.\nShe drives the plot.'));
  });
  
  it('should diagnose false positive Ann vs Annie', () => {
    const isAffected = buildIsAffected('Annie is a great character. Man vs nature theme.');
    const ann: CharBibleSection = { name: 'Ann', role: 'Lead', header: '## 1. Ann (Lead)', body: '...', sectionType: 'character' };
    const result = isAffected(ann);
    console.log('Ann in "Annie":', result);
    console.log('Pattern ann:', /ann/i.test('Annie'));
    // The code does NOT use word boundaries, so "ann" matches in "Annie"
    // Test expects false but code returns true
    expect(result).toBe(false);
  });
});
