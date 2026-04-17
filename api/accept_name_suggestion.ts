import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 60;

const SUPABASE_URL = 'https://hdfderbphdobomkdjypc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const POSTGREST_HEADERS = {
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'apikey': SUPABASE_SERVICE_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { suggestion_id, project_id } = req.body as {
      suggestion_id?: string;
      project_id?: string;
    };

    if (!suggestion_id || !project_id) {
      return res.status(400).json({ error: 'suggestion_id and project_id are required' });
    }

    // Fetch the suggestion
    const suggestionUrl = `${SUPABASE_URL}/rest/v1/name_review_suggestions?id=eq.${encodeURIComponent(suggestion_id)}&project_id=eq.${encodeURIComponent(project_id)}&select=*&limit=1`;
    const sugRes = await fetch(suggestionUrl, { headers: POSTGREST_HEADERS });
    if (!sugRes.ok) {
      const text = await sugRes.text();
      return res.status(sugRes.status).json({ error: `Failed to fetch suggestion: ${text.slice(0, 200)}` });
    }
    const suggestions: any[] = await sugRes.json();
    if (!suggestions.length) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    const suggestion = suggestions[0];

    if (suggestion.matched_entity_id) {
      // Fetch the matched entity to get its canonical_name
      const entityUrl = `${SUPABASE_URL}/rest/v1/narrative_entities?id=eq.${encodeURIComponent(suggestion.matched_entity_id)}&select=id,canonical_name,meta_json&limit=1`;
      const entRes = await fetch(entityUrl, { headers: POSTGREST_HEADERS });
      if (!entRes.ok) {
        const text = await entRes.text();
        return res.status(entRes.status).json({ error: `Failed to fetch entity: ${text.slice(0, 200)}` });
      }
      const entities: any[] = await entRes.json();
      if (!entities.length) {
        return res.status(404).json({ error: 'Matched entity not found' });
      }
      const entity = entities[0];

      // Add extracted_name as an alias (variant) on the canonical entity
      const meta = (entity.meta_json || {}) as Record<string, any>;
      const variants: string[] = meta.variant_names || [];
      const upperAlias = (suggestion.extracted_name || '').toUpperCase().trim();
      if (!variants.includes(upperAlias)) {
        variants.push(upperAlias);
        meta.variant_names = variants;

        const updateUrl = `${SUPABASE_URL}/rest/v1/narrative_entities?id=eq.${encodeURIComponent(entity.id)}`;
        const updateRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: POSTGREST_HEADERS,
          body: JSON.stringify({ meta_json: meta }),
        });
        if (!updateRes.ok) {
          const text = await updateRes.text();
          return res.status(updateRes.status).json({ error: `Failed to update entity: ${text.slice(0, 200)}` });
        }
      }

      // Also add to narrative_entity_aliases with alias_type = 'user_taught'
      const aliasUrl = `${SUPABASE_URL}/rest/v1/narrative_entity_aliases`;
      const aliasRes = await fetch(aliasUrl, {
        method: 'POST',
        headers: { ...POSTGREST_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify([{
          project_id,
          canonical_entity_id: suggestion.matched_entity_id,
          alias_name: upperAlias,
          source: 'user_taught',
          alias_type: 'user_taught',
          confidence: 1.0,
          reason: `Accepted from name_review_suggestions: ${suggestion.reason}`,
        }]),
      });
      if (!aliasRes.ok) {
        // Non-fatal — log but continue
        console.error('[accept_name_suggestion] alias insert failed:', await aliasRes.text());
      }
    }

    // Mark suggestion as approved (or delete it)
    const updateUrl = `${SUPABASE_URL}/rest/v1/name_review_suggestions?id=eq.${encodeURIComponent(suggestion_id)}`;
    const updateRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: POSTGREST_HEADERS,
      body: JSON.stringify({ status: 'approved' }),
    });
    if (!updateRes.ok) {
      const text = await updateRes.text();
      return res.status(updateRes.status).json({ error: `Failed to update suggestion: ${text.slice(0, 200)}` });
    }

    return res.status(200).json({ ok: true, suggestion_id, merged_into: suggestion.matched_entity_id });
  } catch (err: any) {
    console.error('[accept_name_suggestion]', err);
    return res.status(500).json({ error: err.message });
  }
}
