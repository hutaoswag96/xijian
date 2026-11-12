// Browser-only transport for GitHub Pages. Only fixed public market sources are allowed.
(function(){
 'use strict';
 const nativeFetch=window.fetch.bind(window),base=new URL('.',document.currentScript.src);let seq=0,market;
 // The account transport only accepts the fixed backend and v1 paths. It never runs provider code.
 window.XijianAccountFetch=(input,options={})=>{const u=new URL(input);if(u.origin!=='https://xijian-sync-tao-1110.hutaobest.chatgpt.site'||!u.pathname.startsWith('/v1/'))return Promise.reject(Error('未允许的账号服务'));return nativeFetch(u.href,{...options,credentials:'omit',referrerPolicy:'no-referrer'})};
 const allowed=new Set(['qt.gtimg.cn','hq.sinajs.cn','smartbox.gtimg.cn','web.ifzq.gtimg.cn','push2his.eastmoney.com','datacenter-web.eastmoney.com','emweb.securities.eastmoney.com','quotes.sina.cn','vip.stock.finance.sina.com.cn','yield.chinabond.com.cn']);
 const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=utf-8'}});
 const note=text=>{const el=document.getElementById('githubDataMode');if(el)el.textContent=text};
 function rawScriptData(url,{globalName,callbackName,charset='utf-8',signal}={}){return new Promise((resolve,reject)=>{
  const frame=document.createElement('iframe'),token=crypto.randomUUID();frame.hidden=true;frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';let done=false;
  const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timer);window.removeEventListener('message',message);signal?.removeEventListener('abort',abort);frame.remove();error?reject(error):resolve(data)};
  const abort=()=>finish(new DOMException('Aborted','AbortError')),message=e=>{if(e.source!==frame.contentWindow||e.data?.token!==token)return;e.data.error?finish(Error(e.data.error)):finish(null,e.data.data)},timer=setTimeout(()=>finish(Error('行情源连接超时')),7000);
  if(signal?.aborted){abort();return}signal?.addEventListener('abort',abort,{once:true});window.addEventListener('message',message);
  const config=JSON.stringify({url,globalName,callbackName,charset,token}).replaceAll('<','\\u003c');
  frame.srcdoc='<script>const c='+config+';let payload;if(c.callbackName)self[c.callbackName]=v=>payload=v;const s=document.createElement("script");s.charset=c.charset;s.referrerPolicy="no-referrer";s.src=c.url;s.onload=()=>parent.postMessage({token:c.token,data:c.globalName?self[c.globalName]:payload},"*");s.onerror=()=>parent.postMessage({token:c.token,error:"行情源暂不可达"},"*");document.head.append(s);<\/script>';
  document.body.append(frame);
 })}
 const globals=new Map();
 function scriptData(url,options={}){if(!options.globalName)return rawScriptData(url,options);const key=options.globalName,work=(globals.get(key)||Promise.resolve()).catch(()=>{}).then(()=>rawScriptData(url,options));globals.set(key,work);const clean=()=>{if(globals.get(key)===work)globals.delete(key)};work.then(clean,clean);return work}
 async function upstream(url,options){const u=new URL(url),cb='xijian_jsonp_'+(++seq),signal=options?.signal;
  if(!allowed.has(u.hostname))throw Error('未允许的行情来源');
  if(u.hostname==='qt.gtimg.cn'||u.hostname==='hq.sinajs.cn'||u.hostname==='smartbox.gtimg.cn'){
   const isHint=u.hostname==='smartbox.gtimg.cn',symbol=(u.searchParams.get('list')||(u.pathname.startsWith('/q=')?u.pathname.slice(3):u.search.slice(1).replace(/^q=/,''))),name=isHint?'v_hint':u.hostname==='qt.gtimg.cn'?'v_'+symbol:'hq_str_'+symbol;
   const value=await scriptData(u.href,{globalName:name,charset:'gb18030',signal});return new Response(name+'='+JSON.stringify(value)+';');
  }
  if(u.hostname==='web.ifzq.gtimg.cn'){u.searchParams.set('_var',cb);const value=await scriptData(u.href,{globalName:cb,signal});delete window[cb];return response(value)}
  if(u.hostname==='datacenter-web.eastmoney.com'||u.hostname==='push2his.eastmoney.com'){u.searchParams.set(u.hostname.startsWith('push2his')?'cb':'callback',cb);return response(await scriptData(u.href,{callbackName:cb,signal}))}
  // Non-JSONP sources may allow CORS. Failure remains explicit; no proxy or embedded credentials.
  return nativeFetch(u.href,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
 }
 async function snapshot(symbol,kind,risk){const r=await nativeFetch(new URL('data/'+symbol+(kind==='detail'?'.detail':'')+'.json',base),{cache:'no-cache'});if(!r.ok)throw Error('该股票尚无可用快照，直接行情源也未取得资料。稍后可重试。');const data=await r.json();if(data.symbol!==symbol)throw Error('快照代码不匹配');const at=data.receivedAt||data.snapshotAt||data.asOf;if(kind==='stock'&&data.githubPrices&&data.githubRates){const {observe}=await import(new URL('lib/market/observations.mjs?v=20261112-dividend',base));data.analysis=observe({quote:data.quote,prices:data.githubPrices,events:data.dividends,income:data.financials});const {personalResearch}=await import(new URL('lib/market/personal-research.mjs?v=20261112-dividend',base));data.analysis.research=personalResearch({quote:data.quote,prices:data.githubPrices,events:data.dividends,income:data.financials,rates:data.githubRates,risk,errors:(data.sources||[]).filter(s=>s.status!=='ok'),dataChecks:(data.sources||[]).filter(s=>s.verification).map(s=>({section:s.section,...s.verification}))})}data.snapshotAt=at;data.snapshotExpired=Date.now()-Date.parse(at)>72*3600e3;note('当前使用 '+symbol.slice(2)+' 的数据快照：'+String(at).slice(0,16).replace('T',' ')+'；不是实时行情。');return data}
 window.fetch=async(input,options={})=>{
  const raw=typeof input==='string'?input:input.url||String(input),u=new URL(raw,location.href);
  if(u.origin!==location.origin)return upstream(u.href,options);
  if(!u.pathname.startsWith('/api/'))return nativeFetch(input,options);
  if(u.pathname==='/api/account')return response({authenticated:false,backupAvailable:false,provider:'github-pages',wechatConnected:false});
  if(['/api/user-data','/api/feedback'].includes(u.pathname))return response({error:'GitHub访问版不接入原网站账号服务；请使用本机导出和恢复。'},503);
  market??=import(new URL('lib/market/server.mjs?v=20261112-dividend',base));const symbol=u.searchParams.get('symbol');
  try{const result=await (await market).handleMarketRequest(new Request(u.href));const data=await result.clone().json();
   if(u.pathname==='/api/stock'&&(!data.quote?.price||data.analysis?.yield===null)){try{return response(await snapshot(symbol,'stock',u.searchParams.get('risk')))}catch{}}
   if(u.pathname==='/api/detail-metrics'&&(!data.latest?.payout||data.errors?.length)){try{return response(await snapshot(symbol,'detail'))}catch{}}
   if(u.pathname==='/api/search'&&(!result.ok||!data.data?.length)){const q=u.searchParams.get('q')||'';if(/^\d{6}$/.test(q)){const s=(q[0]==='6'?'sh':/[03]/.test(q[0])?'sz':'bj')+q;return response({data:[{symbol:s,code:q,name:q}]})}}
   return result;
  }catch(error){try{if(symbol&&u.pathname==='/api/stock')return response(await snapshot(symbol,'stock'));if(symbol&&u.pathname==='/api/detail-metrics')return response(await snapshot(symbol,'detail'))}catch{}
   return response({error:'行情读取暂未完成：'+error.message,data:[]},502);
  }
 };
})();
