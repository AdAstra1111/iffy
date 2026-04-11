import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 300;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hdfderbphdobomkdjypc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZmRlcmJwaGRvYm9ta2RqeXBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzODg2NjEsImV4cCI6MjA5MDk2NDY2MX0.wLiw8PxIZ_ABt-y6ORhlZlHk1LOJujb-OqurX8wP_N1c';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract the path after /api/supabase-proxy/
  const pathParts = (req.query.path as string | string[]) || '';
  const pathStr = Array.isArray(pathParts) ? pathParts.join('/') : pathParts;
  if (!pathStr) {
    return res.status(400).json({ error: 'No path provided' });
  }
  const targetUrl = `${SUPABASE_URL}/${pathStr}`;

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
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message || 'Proxy failed' });
  }
}
