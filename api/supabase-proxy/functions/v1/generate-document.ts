import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 300;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hdfderbphdobomkdjypc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const targetUrl = `${SUPABASE_URL}/functions/v1/generate-document`;
  const apikey = req.headers['x-supabase-key'] as string || SUPABASE_ANON_KEY;
  const authorization = req.headers['authorization'] as string || `Bearer ${SUPABASE_ANON_KEY}`;

  console.log('[proxy/functions/v1/generate-document] forwarding to supabase');

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apikey,
        'Authorization': authorization,
        'x-supabase-client-platform': 'web',
      },
      body: req.body ? JSON.stringify(req.body) : undefined,
    });
    const data = await response.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(response.status).send(data);
  } catch (error: any) {
    console.error('[proxy] error:', error);
    return res.status(500).json({ error: error.message || 'Proxy failed' });
  }
}
