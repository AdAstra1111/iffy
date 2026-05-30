const { createClient } = require('@supabase/supabase-js');

async function main() {
  const env = require('fs').readFileSync('/Users/laralane/code/iffy/.env.local','utf8');
  const srk = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim();
  srk = srk.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  const supabase = createClient('https://hdfderbphdobomkdjypc.supabase.co', srk);
  const pid = '9404a383-5cdc-4f06-92aa-2ca70973c556';
  const fresh = { isStale: false, reasons: [] };

  // Clear stale_risk for cast
  await supabase.from('project_visual_stage_governance')
    .update({ stale_risk: fresh })
    .eq('project_id', pid)
    .eq('stage_id', 'cast');

  console.log('Cleared cast stale. Calling evaluate...');

  // Use supabase.functions.invoke via the supabase client
  // (it uses the service_role key internally through the anon key + auth header)
  // Actually, supabase.functions.invoke is browser-only. Let me use HTTP.
  
  // Simple HTTP call:
  const https = require('https');
  const b64 = Buffer.from(srk + ':').toString('base64');
  const authHeader = 'Bearer ' + srk;
  
  const postData = JSON.stringify({ projectId: pid });
  const opts = {
    hostname: 'hdfderbphdobomkdjypc.supabase.co',
    path: '/functions/v1/evaluate-visual-governance',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const data = await new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  console.log('\nFINAL STATE:');
  for (const s of data.stages) {
    const sr = s.stale_risk;
    const stale = sr ? sr.isStale : false;
    const reasons = sr ? sr.reasons.map(r => r.label).join('; ') : '(none)';
    console.log(s.stage_id.padEnd(20), '|', s.computed_status.padEnd(15), '| stale=' + String(stale).padEnd(5), '|', reasons);
  }
  
  const locked = data.stages.filter(s => ['locked','approved'].includes(s.computed_status));
  const clean = locked.filter(s => !s.stale_risk?.isStale && s.eligibility_state.eligible && !s.blocker_codes);
  console.log('\nClean locked/approved:', clean.length + '/' + locked.length);
  if (clean.length === locked.length) {
    console.log('RESULT: PASS');
  } else {
    console.log('RESULT: FAIL');
  }
}
main();
