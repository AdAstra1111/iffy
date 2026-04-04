import type { VercelRequest, VercelResponse } from '@vercel/node';

const SUPABASE_URL = 'https://mbwreoglhudppiwaxlsp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1id3Jlb2dsaHVkcHBpd2F4bHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjQzMTQsImV4cCI6MjA4NjE0MDMxNH0.JHrca9E7mBjWeS-Hyuky68ikEud83V8YWeAZkrIpSzk';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract the path after /api/supabase-proxy/
  const pathParts = (req.params as any)?.path;
  if (!pathParts) {
    return res.status(400).json({ error: 'No path provided' });
  }
  const path = Array.isArray(pathParts) ? pathParts.join('/') : pathParts;
  const targetUrl = `${SUPABASE_URL}/${path}`;

  // Extract relevant headers
  const apikey = req.headers['x-supabase-key'] || SUPABASE_ANON_KEY;
  const authorization = req.headers['authorization'] || `Bearer ${SUPABASE_ANON_KEY}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apikey as string,
        'Authorization': authorization as string,
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
