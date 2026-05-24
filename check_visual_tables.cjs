const {readFileSync}=require("fs");
const {createClient}=require("@supabase/supabase-js");
const e=readFileSync("/Users/laralane/code/iffy/.env.local","utf8");
const u=e.match(/VITE_SUPABASE_URL="(.+?)"/)[1];
const k=e.match(/SUPABASE_SERVICE_ROLE_KEY="(.+?)"/)[1];
const sb=createClient(u,k,{auth:{persistSession:false}});
async function main(){
  const q="SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%visual%' OR table_name LIKE '%set%'";
  const{data:d}=await sb.rpc("exec_sql",{query:q});
  if(d&&d.length>0){console.log("Tables found:",d.map(x=>x.table_name).join(", "));}
  else{console.log("No visual/set tables found");}
}
main().catch(e=>console.error("ERR:",e.message));