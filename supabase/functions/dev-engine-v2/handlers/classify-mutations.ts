import { SupabaseClient, createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { composeSystem, resolveGateway } from "../_shared/llm.ts";
import { MODELS } from "../_shared/llm.ts";
import { toEntityKey } from "../_shared/narrativeEntityEngine.ts";
import { ENTITY_EXTRACTION_SYSTEM } from "../prompts/entity-extraction.ts";

// Topology note categories that trigger graph mutation proposals
// These match the valid categories in notes.ts for character_bible
export const TOPOLOGY_NOTE_CATEGORIES = new Set([
  "missing_character",
  "cast_balance",
]);

export interface ClassifyMutationsInput {
  projectId: string;
  documentId: string;
  versionId: string;
  approvedNotes: Array<{
    id?: string;
    note_key?: string;
    category?: string;
    description?: string;
    note?: string;
    impact?: string;
    severity?: string;
    [key: string]: any;
  }>;
}

export interface TopologyNoteResult {
  note_id: string;
  proposal: {
    mutation_type: string;
    entity_type: string;
    proposal_json: Record<string, any>;
  } | null;
  error?: string;
}

export interface ClassifyMutationsOutput {
  ok: boolean;
  topology_notes: string[];
  cosmetic_notes: string[];
  proposals: any[];
}

export async function classifyMutationsHandler(
  supabase: SupabaseClient,
  serviceSupabase: SupabaseClient,
  input: ClassifyMutationsInput
): Promise<ClassifyMutationsOutput> {
  const { projectId, approvedNotes } = input;
  const topologyNotes: string[] = [];
  const cosmeticNotes: string[] = [];
  const proposals: any[] = [];

  // 1. Separate topology notes from cosmetic notes
  for (const note of (approvedNotes || [])) {
    const cat = (note.category || '').toLowerCase();
    if (TOPOLOGY_NOTE_CATEGORIES.has(cat)) {
      topologyNotes.push(note.id || note.note_key || '');
    } else {
      cosmeticNotes.push(note.id || note.note_key || '');
    }
  }

  // 2. If no topology notes, return empty classification
  if (topologyNotes.length === 0) {
    return { ok: true, topology_notes: [], cosmetic_notes: cosmeticNotes, proposals: [] };
  }

  // 3. For each topology note, extract entity details via LLM
  for (const note of (approvedNotes || [])) {
    const cat = (note.category || '').toLowerCase();
    if (!TOPOLOGY_NOTE_CATEGORIES.has(cat)) continue;

    const noteId = note.id || note.note_key || '';
    const noteText = note.note || note.description || '';

    try {
      // Call LLM to extract entity details
      const { text: extractionText } = await composeSystem(
        ENTITY_EXTRACTION_SYSTEM,
        `Extract character entity from this development note:\n\n${noteText}\n\nReturn JSON: { "name": string, "role": string, "description": string, "confidence": number }`,
        { model: MODELS.BALANCED, temperature: 0.2 }
      );

      // Parse the LLM response
      let extracted: { name?: string; role?: string; description?: string; confidence?: number } = {};
      try {
        // Try to parse JSON from the response
        const cleaned = extractionText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        extracted = JSON.parse(cleaned);
      } catch {
        // If JSON parse fails, try to extract via regex
        const nameMatch = extractionText.match(/"name"\s*:\s*"([^"]+)"/);
        const roleMatch = extractionText.match(/"role"\s*:\s*"([^"]+)"/);
        const descMatch = extractionText.match(/"description"\s*:\s*"([^"]+)"/);
        const confMatch = extractionText.match(/"confidence"\s*:\s*([0-9.]+)/);
        extracted = {
          name: nameMatch?.[1] || '',
          role: roleMatch?.[1] || 'supporting',
          description: descMatch?.[1] || '',
          confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
        };
      }

      // Validate extraction
      const name = extracted.name?.trim();
      if (!name) {
        console.warn(`[classify-mutations] No character entity could be extracted from note ${noteId}: "${noteText.slice(0, 100)}"`);
        continue;
      }

      const role = extracted.role?.trim().toLowerCase() || 'supporting';
      const validRoles = ['protagonist', 'antagonist', 'supporting', 'supporting_cast', 'ensemble'];
      const validatedRole = validRoles.includes(role) ? role : 'supporting';
      const description = extracted.description?.trim() || `New character "${name}" as described in development note.`;
      const confidence = typeof extracted.confidence === 'number' ? Math.max(0, Math.min(1, extracted.confidence)) : 0.5;

      // 4. Generate entity_key
      const entityKey = toEntityKey('CHAR', name);

      // 5. Check for duplicate entity_key
      const { data: existingEntity } = await supabase
        .from('narrative_entities')
        .select('id')
        .eq('project_id', projectId)
        .eq('entity_key', entityKey)
        .maybeSingle();

      if (existingEntity) {
        console.warn(`[classify-mutations] Entity already exists for key ${entityKey} in project ${projectId}`);
        // Create proposal with zero confidence — flagged as duplicate
        const { data: duplicateProposal } = await serviceSupabase
          .from('graph_mutation_proposals')
          .insert({
            project_id: projectId,
            source_note_id: noteId,
            mutation_type: 'add_entity',
            entity_type: 'character',
            proposal_json: {
              proposed_name: name,
              proposed_role: validatedRole,
              proposed_description: description,
              entity_key: entityKey,
              rationale: `Duplicate — entity key ${entityKey} already exists. Note: "${noteText.slice(0, 200)}"`,
              confidence: 0,
              editor_notes: `Entity with key ${entityKey} already exists. This proposal is flagged as a potential duplicate.`,
            },
            proposal_status: 'pending',
          })
          .select()
          .single();

        if (duplicateProposal) {
          proposals.push({ ...duplicateProposal, _duplicate_warning: true });
        }
        continue;
      }

      // 6. Insert into graph_mutation_proposals
      const { data: newProposal, error: insertError } = await serviceSupabase
        .from('graph_mutation_proposals')
        .insert({
          project_id: projectId,
          source_note_id: noteId,
          mutation_type: 'add_entity',
          entity_type: 'character',
          proposal_json: {
            proposed_name: name,
            proposed_role: validatedRole,
            proposed_description: description,
            entity_key: entityKey,
            rationale: `Note: "${noteText.slice(0, 200)}"`,
            confidence: confidence,
          },
          proposal_status: 'pending',
        })
        .select()
        .single();

      if (insertError) {
        console.error(`[classify-mutations] Failed to insert proposal for note ${noteId}:`, insertError);
        continue;
      }

      if (newProposal) {
        proposals.push(newProposal);
      }

    } catch (err: any) {
      console.error(`[classify-mutations] Error processing note ${noteId}:`, err?.message || err);
    }
  }

  return {
    ok: true,
    topology_notes: topologyNotes,
    cosmetic_notes: cosmeticNotes,
    proposals,
  };
}