import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 300;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hdfderbphdobomkdjypc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function handleReverseEngineerStatus(body: { job_id?: string; project_id?: string }) {
  const mgmtPat = SUPABASE_SERVICE_KEY;
  const projectRef = 'hdfderbphdobomkdjypc';
  
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
  // Extract [...path] from URL — Vercel Node API routes encode catch-all as query param
  // For [...path], Vercel encodes the full path as req.query.path
  const path = (req.query.path as string) || '';
  const urlPath = req.url ?? '';
  console.log('[proxy] request url:', urlPath, 'query.path:', path);

  // Bypass: reverse-engineer-status via Management API
  if (path === 'reverse-engineer-status') {
    try {
      const body = req.body ?? {};
      const result = await handleReverseEngineerStatus(body);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[proxy] reverse-engineer-status error:', err?.message);
      return res.status(500).json({ error: err?.message });
    }
  }

  // Default: forward to Supabase REST API
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
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message || 'Proxy failed' });
  }
}
