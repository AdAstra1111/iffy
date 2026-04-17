import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 300;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hdfderbphdobomkdjypc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // This handles the base path only - subpaths go to [...path]/route.ts
  const path = (req.query.path as string) || '';
  if (!path) {
    return res.status(400).json({ error: 'No path provided' });
  }
  const targetUrl = `${SUPABASE_URL}/${path}`;
  const apikey = req.headers['x-supabase-key'] as string || SUPABASE_ANON_KEY;
  const authorization = req.headers['authorization'] as string || `Bearer ${SUPABASE_ANON_KEY}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apikey,
        'Authorization': authorization,
        'x-supabase-client-platform': 'web',
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method || '')
        ? JSON.stringify(req.body)
        : undefined,
    });
    const data = await response.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(response.status).send(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Proxy failed' });
  }
}
