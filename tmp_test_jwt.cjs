const JWT = require("fs").readFileSync(__dirname + "/tmp_jwt.txt", "utf8").trim();
async function main() {
  const url = "https://hdfderbphdobomkdjypc.supabase.co/functions/v1/extract-scene-index";
  const pid = "8a62605d-a239-438d-9b31-7c83429cb17c";

  // Try projectId
  let resp = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": "Bearer " + JWT},
    body: JSON.stringify({ projectId: pid }),
    signal: AbortSignal.timeout(120_000)
  });
  let t = await resp.text();
  console.log("projectId:", resp.status, t.substring(0, 300));

  // Try each known param name
  for (const key of ["project_id", "projectid"]) {
    resp = await fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json", "Authorization": "Bearer " + JWT},
      body: JSON.stringify({ [key]: pid }),
      signal: AbortSignal.timeout(30_000)
    });
    t = await resp.text();
    console.log(key + ":", resp.status, t.substring(0, 200));
  }
}
main();