// Opt-in production smoke test. Uses disposable .invalid logins and deletes them.
import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';
const origin='https://hutaoswag96.github.io',base='https://xijian-sync-tao-1110.hutaobest.chatgpt.site',cleanup=[];
async function request(path,{method='GET',body,token,status=200}={}){const preflight=method==='OPTIONS',url=base+(preflight?path:'/v1/transport'),headers={Origin:origin,...(preflight?{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}:{'Content-Type':'text/plain;charset=UTF-8',Accept:'application/json'})};const r=await fetch(url,{method:preflight?'OPTIONS':'POST',headers,...(!preflight?{body:JSON.stringify({path,method,token,payload:body})}:{}),signal:AbortSignal.timeout(20000)});if(r.status!==status)throw Error(`${method} ${path}: expected ${status}, received ${r.status}; external connectivity not verified`);assert.equal(r.headers.get('access-control-allow-origin'),origin);return r.status===204?null:r.json()}

async function makeUser(){const email='smoke-'+randomUUID()+'@xijian.invalid',password=randomBytes(24).toString('base64url'),data=await request('/v1/register',{method:'POST',body:{email,password}}),u={...data,email,password};cleanup.push(u);return u}
try{
 const health=await request('/health');assert.equal(health.ok,true);await request('/v1/register',{method:'OPTIONS',status:204});
 const a=await makeUser(),b=await makeUser();assert.notEqual(a.user.id,b.user.id);
 const backup={version:3,watch:[{symbol:'sh601318',name:'生产冒烟测试'}],workspace:{version:1,groups:[],featured:[],ledger:[],pending:[],receipts:[]},prefs:{chartPeriod:'5y',researchRisk:'balanced'}};
 const saved=await request('/v1/data',{method:'PUT',token:a.token,body:{revision:0,backup}});assert.equal(saved.revision,1);
 assert.equal((await request('/v1/data',{token:b.token})).backup,null);assert.equal((await request('/v1/data',{token:a.token})).backup.watch[0].name,'生产冒烟测试');
 await request('/v1/data',{method:'PUT',token:a.token,body:{revision:0,backup},status:409});
 const login=await request('/v1/login',{method:'POST',body:{email:a.email,password:a.password}});assert.equal(login.user.id,a.user.id);
 const password=randomBytes(24).toString('base64url'),recovered=await request('/v1/recover',{method:'POST',body:{email:a.email,password,recoveryCode:a.recoveryCode}});const oldToken=a.token;a.token=recovered.token;a.password=password;
 await request('/v1/session',{token:oldToken,status:401});assert.equal((await request('/v1/data',{token:a.token})).revision,1);
 console.log('PASS: safelisted browser transport, exact preflight, external health, CORS, registration, login, data isolation, sync, revision conflicts, recovery and old-session invalidation');
}finally{for(const u of cleanup){await request('/v1/account',{method:'DELETE',token:u.token,body:{password:u.password,confirmation:'注销息见账号'}})}if(cleanup.length)console.log('Disposable test accounts deleted')}
