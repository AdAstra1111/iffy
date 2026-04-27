import type { VercelRequest, VercelResponse } from '@vercel/node';
export const maxDuration = 300;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = 'functions/v1/infer-criteria';
  const targetUrl = `https://hdfderbphdobomkdjypc.supabase.co/${path}`;
  const apikey = req.headers['x-supabase-key'] as string || '';
  const authorization = req.headers['authorization'] as string || `Bearer ${apikey}`;
  try {
    const response = await fetch(targetUrl, {
      method: req.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apikey,
        'Authorization': authorization,
        'x-supabase-client-platform': 'web',
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method || '') ? JSON.stringify(req.body) : undefined,
    });
    const data = await response.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(response.status).send(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Proxy failed' });
  }
}