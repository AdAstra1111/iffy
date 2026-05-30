const { createClient } = require('@supabase/supabase-js');

async function main() {
  const env = require('fs').readFileSync('/Users/laralane/code/iffy/.env.local','utf8');
  const srk = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim().replace(/"/g,'');
  const supabase = createClient('https://hdfderbphdobomkdjypc.supabase.co', srk);

  const pid = 'b6ae36fb-805b-4ff5-84ba-91fbccd46334';

  // Generate beat sheet via HTTP
  const https = require('https');
  const body = JSON.stringify({ projectId: pid, docType: 'beat_sheet', mode: 'draft' });
  
  const result = await new Promise((resolve, reject) => {
    const opts = {
      hostname: 'hdfderbphdobomkdjypc.supabase.co',
      path: '/functions/v1/generate-document',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': 'Bearer *** + srk
      }
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { resolve({ raw: d.slice(0,500) }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log('Result keys:', Object.keys(result));
  if (result.error) console.log('ERROR:', result.error.slice?.(0,200) || result.error);
  else if (result.ok || result.document) console.log('SUCCESS');
  else console.log(JSON.stringify(result).slice(0, 500));
}
main();
