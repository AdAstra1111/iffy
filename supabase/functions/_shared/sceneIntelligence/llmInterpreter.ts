/**
 * LLM Interpretation Module — Scene Intelligence Package v1.2
 *
 * Layer 3 extraction: LLM only for fields where deterministic
 * extraction cannot provide the answer.
 * Every field includes evidence_excerpt and confidence.
 */

export interface LLMInterpretationResult {
  scene_objective: InterpretedField | null;
  scene_consequence: InterpretedField | null;
  scene_consequence_significance: InterpretedField | null;
  dramatic_question: InterpretedField | null;
  subtext_summary: InterpretedField | null;
  scene_conflict: InterpretedField | null;
  residue_created: InterpretedField | null;
}

export interface InterpretedField {
  value: string;
  evidence_excerpt: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface LLMInput {
  sceneNumber: number;
  title: string;
  locationKey: string;
  characterKeys: string[];
  content: string;
  summary: string;
  actionLines: string[];
  dialogueBlocks: string[];
  emotionalMarkers: string[];
  narrativeBeat?: {
    emotionalImpact?: string;
    structuralFunction?: string;
  };
}

/**
 * Build a constrained LLM prompt for scene interpretation fields.
 * The LLM is only asked for fields that cannot be extracted via regex
 * or inferred from existing atoms.
 */
export function buildLLMPrompt(input: LLMInput): string {
  return `You are a scene analyst for a film production company. Extract ONLY the fields requested from this scene data. Do NOT invent information not present in the evidence. Every field must include an evidence excerpt from the script text.

SCENE ${input.sceneNumber} — ${input.title}
LOCATION: ${input.locationKey}
CHARACTERS PRESENT: ${input.characterKeys.join(', ')}

SCRIPT TEXT:
${(input.content || input.summary || '').substring(0, 2000)}

ACTION LINES EXTRACTED:
${(input.actionLines || []).join('\n')}

DIALOGUE BLOCKS:
${(input.dialogueBlocks || []).join('\n')}

${input.narrativeBeat ? `NARRATIVE BEAT TYPE: ${input.narrativeBeat.structuralFunction || 'unclassified'}
EMOTIONAL IMPACT: ${input.narrativeBeat.emotionalImpact || 'unstated'}` : ''}

Return ONLY these fields. Each must have a "value", "evidence_excerpt" (direct quote from script), and "confidence" ("high", "medium", or "low"). If you cannot determine a field, set it to null.

1. scene_objective: What this scene is trying to achieve narratively
2. scene_consequence: What is different at the END of this scene compared to the beginning — what changed
3. scene_consequence_significance: "minor", "moderate", "major", or "critical" — how important this scene's consequence is to the overall story
4. dramatic_question: The question the audience is asking during this scene
5. subtext_summary: What's really happening beneath the dialogue — unspoken tensions, hidden agendas
6. scene_conflict: The central tension or friction driving this scene
7. residue_created: The emotional or narrative residue this scene leaves — what the audience feels or knows after`;
}

export function parseLLMResponse(raw: string): LLMInterpretationResult {
  const result: LLMInterpretationResult = {
    scene_objective: null,
    scene_consequence: null,
    scene_consequence_significance: null,
    dramatic_question: null,
    subtext_summary: null,
    scene_conflict: null,
    residue_created: null,
  };

  // Simple JSON parser — expects LLM to return JSON
  try {
    // Try to extract JSON from response (may be wrapped in markdown code blocks)
    let jsonStr = raw;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const parsed = JSON.parse(jsonStr);

    for (const field of Object.keys(result)) {
      const val = parsed[field];
      if (val && val.value) {
        (result as any)[field] = {
          value: val.value,
          evidence_excerpt: val.evidence_excerpt || 'Not provided',
          confidence: val.confidence || 'low',
        };
      }
    }
  } catch {
    // If JSON parsing fails, try line-by-line extraction
    const lines = raw.split('\n');
    let currentField: string | null = null;
    
    for (const line of lines) {
      const fieldMatch = line.match(/^(scene_objective|scene_consequence|scene_consequence_significance|dramatic_question|subtext_summary|scene_conflict|residue_created):\s*(.+)/i);
      if (fieldMatch) {
        currentField = fieldMatch[1];
        const val = fieldMatch[2].trim();
        if (val && val !== 'null' && val !== 'N/A') {
          (result as any)[currentField] = {
            value: val,
            evidence_excerpt: 'Extracted from LLM response',
            confidence: 'low',
          };
        }
      }
    }
  }

  return result;
}

export async function interpretWithLLM(
  input: LLMInput,
  apiKey: string,
  gatewayUrl: string,
): Promise<LLMInterpretationResult> {
  const prompt = buildLLMPrompt(input);
  
  const resp = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-preview-04-17',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.1, // Low temperature for deterministic output
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.warn(`[LLM Interpreter] API error: ${resp.status} — ${err.substring(0, 200)}`);
    return {
      scene_objective: null,
      scene_consequence: null,
      scene_consequence_significance: null,
      dramatic_question: null,
      subtext_summary: null,
      scene_conflict: null,
      residue_created: null,
    };
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return parseLLMResponse(content);
}
