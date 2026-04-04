import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { function: fn, params } = req.body || {};
  
  if (!fn) {
    return res.status(400).json({ error: 'No function name provided' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' });
  }

  try {
    switch (fn) {
      case 'generate-pitch': {
        const { ideas, projectId } = params || {};
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: `Generate a structured pitch document for: ${JSON.stringify(ideas)}. Return valid JSON with this structure: { "pitches": [{ "title", "logline", "synopsis", "genre", "tone", "targetAudience", "comparableTitles", "uniqueAngle" }] }. Only respond with valid JSON.`
              }
            ],
            max_tokens: 2048,
          }),
        });
        const data = await response.json();
        return res.status(200).json(data);
      }

      case 'idea-to-project': {
        const { idea, title } = params || {};
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: `Create a project concept brief from this idea: ${idea}. Title: ${title}. Return valid JSON with: { "title", "logline", "synopsis", "genre", "tone", "targetAudience", "comparableTitles" }. Only respond with valid JSON.`
              }
            ],
            max_tokens: 1024,
          }),
        });
        const data = await response.json();
        return res.status(200).json(data);
      }

      case 'extract-documents': {
        const { projectId, documentContent } = params || {};
        // For now, just acknowledge receipt
        // Full implementation would extract structured data from documentContent
        return res.status(200).json({ 
          success: true, 
          projectId,
          message: 'Document extraction placeholder — implement based on document type' 
        });
      }

      default:
        return res.status(404).json({ error: `Unknown function: ${fn}` });
    }
  } catch (error: any) {
    console.error(`Error in llm proxy for ${fn}:`, error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
