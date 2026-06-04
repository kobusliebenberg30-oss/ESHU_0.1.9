import https from 'node:https';
const TOKEN = 'vcp_7Sh5gn04dTINTS9iBqTXgT3Lk5zCJ4meDs7QSQuve4GIVM2GS90IgtPX';
const PROJECT_ID = 'prj_wtSBrngFsEM4sMEa20JNkolRsQQm';
const TEAM_SLUG = 'eshu002';
function req(path) { return new Promise((res,rej)=>{ const r=https.request({hostname:'api.vercel.com',path,headers:{Authorization:`Bearer ${TOKEN}`}},(rs)=>{let b='';rs.on('data',c=>b+=c);rs.on('end',()=>res(JSON.parse(b)))}); r.on('error',rej); r.end(); }); }
const d = await req(`/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_SLUG}&limit=5`);
for (const dep of d.deployments || []) {
  console.log(dep.state.padEnd(12), dep.url, new Date(dep.created).toISOString());
}
if (!d.deployments?.length) console.log('No deployments yet.');
