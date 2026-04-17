import type { VercelRequest, VercelResponse } from '@vercel/node';

export const maxDuration = 300;

const SUPABASE_URL = 'https://hdfderbphdobomkdjypc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const POSTGREST_HEADERS = {
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'apikey': SUPABASE_SERVICE_KEY,
  'Content-Type': 'application/json',
};

async function handleReverseEngineerStatus(body: { job_id?: string; project_id?: string }) {
  if (!body.job_id && !body.project_id) {
    throw new Error('job_id or project_id required');
  }

  if (body.job_id) {
    // Fetch single job by id via PostgREST
    const url = `${SUPABASE_URL}/rest/v1/narrative_units?id=eq.${encodeURIComponent(body.job_id)}&unit_type=eq.async_job&select=id,project_id,payload_json&limit=1`;
    const apiRes = await fetch(url, { headers: POSTGREST_HEADERS });
    if (!apiRes.ok) {
      const text = await apiRes.text();
      throw new Error(`PostgREST ${apiRes.status}: ${text.slice(0, 200)}`);
    }
    const rows: any[] = await apiRes.json();
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

  // Fetch all async_job units for a project
  const url = `${SUPABASE_URL}/rest/v1/narrative_units?project_id=eq.${encodeURIComponent(body.project_id!)}&unit_type=eq.async_job&select=id,project_id,payload_json&order=created_at.desc&limit=20`;
  const apiRes = await fetch(url, { headers: POSTGREST_HEADERS });
  if (!apiRes.ok) {
    const text = await apiRes.text();
    throw new Error(`PostgREST ${apiRes.status}: ${text.slice(0, 200)}`);
  }
  const rows: any[] = await apiRes.json();

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
