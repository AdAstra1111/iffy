import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 300;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hdfderbphdobomkdjypc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZmRlcmJwaGRvYm9ta2RqeXBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzODg2NjEsImV4cCI6MjA5MDk2NDY2MX0.wLiw8PxIZ_ABt-y6ORhlZlHk1LOJujb-OqurX8wP_N1c';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Special handler: reverse-engineer-status via Management API (bypasses broken Edge Function RLS)
async function handleReverseEngineerStatus(body: { job_id?: string; project_id?: string }): Promise<{ job_id?: string; project_id?: string; status?: string; current_stage?: string; stages?: any; result?: any; error?: string; created_at?: string; updated_at?: string; jobs?: any[] }> {
  const mgmtPat = SUPABASE_SERVICE_KEY;
  const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
  
  let query: string;
  if (body.job_id) {
    query = `SELECT id, project_id, payload_json FROM narrative_units WHERE id = '${body.job_id}' AND unit_type = 'async_job' LIMIT 1;`;
  } else if (body.project_id) {
    query = `SELECT id, project_id, payload_json FROM narrative_units WHERE project_id = '${body.project_id}' AND unit_type = 'async_job' ORDER BY created_at DESC LIMIT 20;`;
  } else {
    throw new Error('job_id or project_id required');
  }

  const apiRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mgmtPat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!apiRes.ok) {
    const text = await apiRes.text();
    throw new Error(`Management API ${apiRes.status}: ${text}`);
  }

  const rows: any[] = await apiRes.json();
  
  if (body.job_id) {
    if (!rows.length) throw new Error('Job not found');
    const d = rows[0];
    const p = d.payload_json || {};
    return {
      job_id: d.id,
      project_id: d.project_id,
      status: p.status,
      current_stage: p.current_stage,
      stages: p.stages,
      result: p.result,
      error: p.error,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }

  const allJobs = rows.filter((d: any) => d.payload_json?.job_type === 'reverse_engineer');
  const jobs = allJobs.map((d: any) => {
    const p = d.payload_json || {};
    return {
      job_id: d.id,
      project_id: d.project_id,
      status: p.status,
      current_stage: p.current_stage,
      stages: p.stages,
      result: p.result,
      error: p.error,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  });
  return { jobs };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Check for reverse-engineer-status request (bypass Edge Function RLS issue)
  const pathParts = (req.query.path as string | string[]) || '';
  const pathStr = Array.isArray(pathParts) ? pathParts.join('/') : pathParts;
  
  // DEBUG
  console.log('[supabase-proxy] pathStr:', pathStr, 'pathParts:', JSON.stringify(req.query.path));
  
  if (pathStr === 'reverse-engineer-status' || pathStr.startsWith('functions/v1/reverse-engineer-status')) {
    try {
      const body = req.body ?? {};
      const result = await handleReverseEngineerStatus(body);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[reverse-engineer-status proxy]', err?.message);
      return res.status(500).json({ error: err?.message });
    }
  }

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
