import https from 'node:https';
const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const TEAM_SLUG = process.env.VERCEL_TEAM || 'eshu002';
if (!TOKEN || !PROJECT_ID) {
  console.error('Set VERCEL_TOKEN and VERCEL_PROJECT_ID before running this script.');
  process.exit(1);
}
function req(path) { return new Promise((res,rej)=>{ const r=https.request({hostname:'api.vercel.com',path,headers:{Authorization:`Bearer ${TOKEN}`}},(rs)=>{let b='';rs.on('data',c=>b+=c);rs.on('end',()=>res(JSON.parse(b)))}); r.on('error',rej); r.end(); }); }
const d = await req(`/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_SLUG}&limit=5`);
for (const dep of d.deployments || []) {
  console.log(dep.state.padEnd(12), dep.url, new Date(dep.created).toISOString());
}
if (!d.deployments?.length) console.log('No deployments yet.');
