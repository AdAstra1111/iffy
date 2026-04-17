import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 300;

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = req.body ?? {};
    const result = await handleReverseEngineerStatus(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[re-status]', err?.message);
    return res.status(500).json({ error: err?.message });
  }
}
