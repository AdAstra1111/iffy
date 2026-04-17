import type { VercelRequest, VercelResponse } from '@vercel/node';

const PROJECT_REF = process.env.SUPABASE_URL ?? 'hdfderbphdobomkdjypc';
const MANAGEMENT_PAT = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { job_id, project_id } = req.body ?? {};
  if (!job_id && !project_id) {
    return res.status(400).json({ error: 'job_id or project_id required' });
  }

  try {
    let query: string;
    if (job_id) {
      query = `SELECT id, project_id, payload_json FROM narrative_units WHERE id = '${job_id}' AND unit_type = 'async_job' LIMIT 1;`;
    } else {
      query = `SELECT id, project_id, payload_json FROM narrative_units WHERE project_id = '${project_id}' AND unit_type = 'async_job' ORDER BY created_at DESC LIMIT 20;`;
    }

    const apiRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MANAGEMENT_PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!apiRes.ok) {
      const text = await apiRes.text();
      return res.status(apiRes.status).json({ error: `Management API ${apiRes.status}: ${text}` });
    }

    const rows: any[] = await apiRes.json();
    if (job_id) {
      if (!rows.length) return res.status(404).json({ error: 'Job not found' });
      const d = rows[0];
      const p = d.payload_json || {};
      return res.status(200).json({
        job_id: d.id,
        project_id: d.project_id,
        status: p.status,
        current_stage: p.current_stage,
        stages: p.stages,
        result: p.result,
        error: p.error,
        created_at: p.created_at,
        updated_at: p.updated_at,
      });
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
    return res.status(200).json({ jobs });

  } catch (err: any) {
    console.error('[reverse-engineer-status-proxy]', err?.message);
    return res.status(500).json({ error: err?.message });
  }
}
