/**
 * fdx-export.ts — Convert IFFY screenplay text to Final Draft (.fdx) format.
 *
 * Parses plaintext following screenplay formatting conventions:
 *   INT./EXT. SLUGLINE — DAY/NIGHT  → Scene Heading
 *   CHARACTER NAME (all caps)       → Character
 *   (parenthetical)                 → Parenthetical
 *   Dialogue text                   → Dialogue
 *   FADE IN / FADE OUT / CUT TO    → Transition
 *   **bold** / *italic*            → Rich text
 *
 * Output: downloadable FDX XML string.
 */

export interface FDXExportOptions {
  title: string;
  author?: string;
  draftDate?: string;
}

/**
 * Parse screenplay plaintext into Final Draft XML.
 */
export function convertToFDX(plaintext: string, options: FDXExportOptions): string {
  const lines = plaintext.split('\n').map(l => l.trimEnd());
  const { title, author = 'IFFY', draftDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) } = options;

  // Track content elements
  const elements: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';
    const prevLine = i > 0 ? lines[i - 1] : '';

    // Skip empty lines (but add paragraph breaks between scenes)
    if (line.trim() === '') {
      i++;
      continue;
    }

    const classification = classifyLine(line, prevLine, nextLine);

    switch (classification) {
      case 'Scene Heading': {
        // Text before — is the location, after — is the time of day
        const match = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
        const location = match ? match[1].trim() : line;
        const timeOfDay = match ? match[2].trim() : '';
        elements.push(wrapElement('Scene Heading', line, { location, timeOfDay }));
        break;
      }
      case 'Character':
        elements.push(wrapElement('Character', cleanCharacterName(line)));
        break;
      case 'Parenthetical':
        elements.push(wrapElement('Parenthetical', line));
        break;
      case 'Dialogue':
        elements.push(wrapElement('Dialogue', line));
        break;
      case 'Transition':
        elements.push(wrapElement('Transition', line));
        break;
      case 'Action':
        elements.push(wrapElement('Action', line));
        break;
      case 'Shot':
        elements.push(wrapElement('Shot', line));
        break;
      default:
        elements.push(wrapElement('Action', line));
    }

    i++;
  }

  // Verify content structure — every Scene Heading should have a preceding paragraph break
  return buildFDXDocument(elements, title, author, draftDate);
}

/**
 * Classify a line of screenplay text.
 */
function classifyLine(line: string, prevLine: string, nextLine: string): string {
  const trimmed = line.trim();

  // Empty lines are not classified
  if (trimmed === '') return 'Empty';

  // Scene headings: INT./EXT. or I/E
  if (/^(INT|EXT|INT\.|EXT\.|I\/E|INT\/EXT)\b/.test(trimmed)) {
    return 'Scene Heading';
  }

  // Transitions: FADE IN, FADE OUT, CUT TO, DISSOLVE TO, etc.
  if (/^(FADE IN|FADE OUT|FADE TO|CUT TO|DISSOLVE TO|SMASH CUT TO|MATCH CUT TO|JUMP CUT TO|IRIS IN|IRIS OUT|TIME CUT TO)$/i.test(trimmed)) {
    return 'Transition';
  }

  // Shots: ANGLE ON, CLOSE ON, POV, etc.
  if (/^(ANGLE ON|CLOSE ON|POV|FAVOR ON|WIDER ON|TIGHT ON|BACK TO|INTERCUT|SERIES OF SHOTS|MONTAGE|TITLE|SUPER|CREDITS|OVER BLACK)$/i.test(trimmed)) {
    return 'Shot';
  }

  // Scene numbers like "SCENE 1", "SCENE 2"
  if (/^SCENE\s+\d+/i.test(trimmed)) {
    return 'Action';
  }

  // Parentheticals: (whispering), (beat), etc.
  if (/^\(/.test(trimmed) && /\)$/.test(trimmed)) {
    return 'Parenthetical';
  }

  // Character names: ALL CAPS, preceded by empty line or action, followed by dialogue
  if (
    /^[A-Z][A-Z\s.\-']{1,40}$/.test(trimmed) &&
    !/^(INT|EXT|I\/E)\b/.test(trimmed) &&
    !/^[A-Z]{2,5}:/.test(trimmed) &&
    trimmed.length > 1
  ) {
    const prevEmpty = prevLine.trim() === '' || /^(Action|Scene Heading)$/.test(classifyLine(prevLine, '', ''));
    if (prevEmpty) {
      return 'Character';
    }
  }

  // Character extensions: (V.O.), (O.S.), (CONT'D)
  if (/^\([A-Z.\s']+\)$/.test(trimmed)) {
    return 'Parenthetical';
  }

  // Default: Action (dialogue falls here — it's surrounded by Character + Parenthetical context)
  // But if prev line is Character or Parenthetical, this is Dialogue
  const prevClassification = prevLine ? classifyLine(prevLine, '', '') : '';
  if (prevClassification === 'Character' || prevClassification === 'Parenthetical') {
    return 'Dialogue';
  }

  return 'Action';
}

/**
 * Clean character name: remove extensions like (V.O.), (O.S.), (CONT'D)
 */
function cleanCharacterName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Escape XML special characters.
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert IFFY rich text (**bold**, *italic*) to FDX rich text.
 */
function convertRichText(text: string): string {
  // Bold: **text** → <Bold>text</Bold>
  text = text.replace(/\*\*(.+?)\*\*/g, '<Bold>$1</Bold>');
  // Italic: *text* → <Italic>text</Italic>
  text = text.replace(/\*(.+?)\*/g, '<Italic>$1</Italic>');
  return text;
}

/**
 * Wrap a content element in FDX XML.
 */
function wrapElement(type: string, text: string, attrs: Record<string, string> = {}): string {
  const escaped = escapeXML(text);
  const richText = convertRichText(escaped);

  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeXML(v)}"`)
    .join('');

  return `    <Paragraph Type="${type}"${attrStr}>
      <Text>${richText}</Text>
    </Paragraph>`;
}

/**
 * Build the complete FDX XML document.
 */
function buildFDXDocument(elements: string[], title: string, author: string, draftDate: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${elements.join('\n')}
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Type="Title">
        <Text>${escapeXML(title)}</Text>
      </Paragraph>
      <Paragraph Type="Author">
        <Text>${escapeXML(author)}</Text>
      </Paragraph>
      <Paragraph Type="DraftDate">
        <Text>${escapeXML(draftDate)}</Text>
      </Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>`;
}

/**
 * Trigger a browser download of an FDX file.
 */
export function downloadFDX(fdxContent: string, filename: string): void {
  const blob = new Blob([fdxContent], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.fdx') ? filename : `${filename}.fdx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export a screenplay version as FDX and trigger download.
 */
export function exportVersionAsFDX(
  plaintext: string,
  title: string,
  author?: string,
  draftDate?: string,
): string {
  return convertToFDX(plaintext, { title, author, draftDate });
}