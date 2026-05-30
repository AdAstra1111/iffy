const { createClient } = require('@supabase/supabase-js');

async function main() {
  const env = require('fs').readFileSync('/Users/laralane/code/iffy/.env.local','utf8');
  const srk = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim().replace(/"/g,'');
  const supabase = createClient('https://hdfderbphdobomkdjypc.supabase.co', srk);

  const pid = 'b6ae36fb-805b-4ff5-84ba-91fbccd46334';
  
  const { data, error } = await supabase.functions.invoke('auto-run', {
    body: { action: 'start', projectId: pid }
  });

  if (error) {
    console.log('Error:', error.message);
    const ctx = error.context || {};
    console.log('Context:', JSON.stringify(ctx).slice(0,500));
  } else {
    console.log(JSON.stringify(data).slice(0,1000));
  }
}
main();
