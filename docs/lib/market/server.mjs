import {personalResearch} from './personal-research.mjs?v=20261112-dividend';
import {chinaDate} from './engine.mjs?v=20261112-dividend';
import {observe,DATA_VERSION} from './observations.mjs?v=20261112-dividend';
import * as provider from './providers.mjs?v=20261112-dividend';
import {detailMetrics} from './detail-metrics.mjs?v=20261112-dividend';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const sourceStatus=(section,result)=>result.status==='fulfilled'?{section,status:'ok',source:result.value.source,sourceUrl:result.value.sourceUrl,fetchedAt:result.value.fetchedAt,note:result.value.note||null,fallback:!!result.value.fallback,verification:result.value.verification||null}:{section,status:'error',message:result.reason?.message||'数据暂不可用'};
export async function handleMarketRequest(request){
 const url=new URL(request.url),p=url.pathname;if(!p.startsWith('/api/'))return null;
 if(request.method!=='GET')return json({error:'只支持只读查询'},405);
 if(p==='/api/health')return json({status:'ok',version:DATA_VERSION,date:chinaDate(),dataMode:'live-public',execution:'private-personal-research',storage:'device-and-account-backup'});
 if(p==='/api/detail-metrics'){
  const symbol=url.searchParams.get('symbol');if(!provider.validSymbol(symbol))return json({error:'请输入有效的A股代码'},400);
  try{return json({symbol,...await detailMetrics(symbol)})}catch(e){return json({error:e.message},502)}
 }
 if(p==='/api/quote'){
  const symbol=url.searchParams.get('symbol');if(!provider.validSymbol(symbol))return json({error:'请输入有效的自选股票代码'},400);
  try{return json({symbol,quote:await provider.quote(symbol)})}catch(e){return json({error:e.message},502)}
 }
 if(p==='/api/search'){try{return json({data:await provider.search(url.searchParams.get('q')||''),source:'腾讯证券'})}catch(e){return json({error:e.message,data:[]},502)}}

 if(p==='/api/stock'){
  const symbol=url.searchParams.get('symbol');if(!provider.validSymbol(symbol))return json({error:'请输入有效的沪深北 A 股代码'},400);
  
  const sections=['行情','历史价格','分红','财务','利率'];
  const rr=await Promise.allSettled([provider.quote(symbol),provider.history(symbol),provider.dividends(symbol),provider.finance(symbol),provider.rates()]);
  const sources=rr.map((r,i)=>sourceStatus(sections[i],r)),get=i=>rr[i].status==='fulfilled'?rr[i].value:null;
  const q=get(0),h=get(1),d=get(2),f=get(3),errors=sources.filter(s=>s.status!=='ok');
  const analysis=observe({quote:q,prices:h?.data||[],events:d?.data||[],income:f?.data||[]});
  analysis.research=personalResearch({quote:q,prices:h?.data||[],events:d?.data||[],income:f?.data||[],rates:get(4)?.data||[],errors,dataChecks:sources.filter(s=>s.verification).map(s=>({section:s.section,...s.verification})),risk:url.searchParams.get('risk')||'balanced'});
  return json({symbol,code:symbol.slice(2),name:q?.name||symbol.slice(2),quote:q,analysis,dividends:d?.data||[],dividendPlans:d?.plans||[],dividendPlansAvailable:d?.plansAvailable===true,financials:f?.data||[],sources,receivedAt:new Date().toISOString(),partial:errors.length>0});
 }
 return json({error:'接口不存在'},404);
}
