import {chinaDate,dateOnly,finite,shiftYears,normalizeDividends,normalizeDividendPlans} from './engine.mjs';
import {resolveSources,compareQuotes,compareHistory,compareDividends,compareFinance,compareRates} from './verification.mjs';

const memo=new Map();
const USER_AGENT='Mozilla/5.0 (compatible; Xijian/1.0; private dividend research)';
export function validSymbol(v){return typeof v==='string'&&/^(sh(?:60|68)\d{4}|sz(?:00|30)\d{4}|bj[489]\d{5})$/.test(v)}
export function symbolFor(code){if(!/^\d{6}$/.test(code))return null;const s=/^6/.test(code)?'sh'+code:/^[03]/.test(code)?'sz'+code:/^[489]/.test(code)?'bj'+code:null;return validSymbol(s)?s:null}
export async function cached(key,ttl,fn){
 const now=Date.now(),v=memo.get(key);if(v&&v.until>now)return v.value;
 // Only completed JSON values may be shared across Worker requests. A pending
 // fetch promise belongs to its originating request's I/O context.
 const work=(async()=>{
  const cache=globalThis.caches?.default,req=new Request(`https://xijian-cache.invalid/v1/${encodeURIComponent(key)}`);
  if(cache){try{const hit=await cache.match(req);if(hit){const packet=await hit.json();if(packet.until>now){memo.set(key,packet);return packet.value}}}catch{}}
  const value=await fn(),effectiveTtl=value.verification?.status&&value.verification.status!=='verified'?Math.min(ttl,60000):ttl,packet={value,until:Date.now()+effectiveTtl};memo.set(key,packet);if(memo.size>300)memo.delete(memo.keys().next().value);
  if(cache)try{await cache.put(req,new Response(JSON.stringify(packet),{headers:{'Content-Type':'application/json','Cache-Control':`public,max-age=${Math.floor(effectiveTtl/1000)}`}}))}catch{}
  return value;
 })();return work;
}
async function request(url,{encoding='utf-8',referer='https://data.eastmoney.com/'}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
 try{const r=await fetch(url,{headers:{'User-Agent':USER_AGENT,Referer:referer,Accept:'application/json,text/plain,text/html,*/*'},signal:controller.signal});if(!r.ok)throw new Error(`上游返回 ${r.status}`);const data=await r.arrayBuffer();if(data.byteLength>4e6)throw new Error('上游结果超出读取限制');return new TextDecoder('utf-8').decode(data)}catch(e){throw new Error(e.name==='AbortError'?'数据源响应超时':e.message)}finally{clearTimeout(timer)}
}
export function emUrl(report,code='',{size=80,sort='REPORT_DATE',page=1,columns='ALL',filter=''}={}){
 const url=new URL('https://datacenter-web.eastmoney.com/api/data/v1/get');const fields={reportName:report,columns,pageSize:String(size),pageNumber:String(page),sortColumns:sort,sortTypes:'-1',source:'WEB',client:'WEB'};
 if(code)fields.filter=`(SECURITY_CODE="${code}")`;else if(filter)fields.filter=filter;
 for(const [k,v] of Object.entries(fields))url.searchParams.set(k,v);return url.href;
}
async function em(report,code,options){const j=JSON.parse(await request(emUrl(report,code,options)));if(j.success!==true||!j.result?.data){if(j.code===9201||j.result===null&&j.message==='返回数据为空')return [];throw new Error('财务数据源未返回有效记录')}return j.result.data}
export function parseQuote(text,symbol){const m=text.match(new RegExp(`v_${symbol}="([^"\\n]*)"`));if(!m)throw new Error('该股票暂无可用行情');const p=m[1].split('~'),price=finite(p[3]);if(p.length<33||p[2]!==symbol.slice(2)||!(price>0)||!/^\d{14}$/.test(p[30]||''))throw new Error('行情字段不完整');const t=p[30],date=`${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`;return {symbol,code:p[2],name:p[1],price,previousClose:finite(p[4]),open:finite(p[5]),high:finite(p[33]),low:finite(p[34]),change:finite(p[32]),volume:finite(p[6]),date,time:`${t.slice(8,10)}:${t.slice(10,12)}:${t.slice(12,14)}`,timestamp:`${date}T${t.slice(8,10)}:${t.slice(10,12)}:${t.slice(12,14)}+08:00`,source:'腾讯证券',sourceUrl:`https://gu.qq.com/${symbol}/gp`,fetchedAt:new Date().toISOString()}}
export function parseSinaQuote(text,symbol){
 const m=text.match(new RegExp(`hq_str_${symbol}="([^"\\n]*)"`));if(!m)throw new Error('新浪未返回该股票报价');
 const p=m[1].split(','),price=finite(p[3]),previousClose=finite(p[2]),date=dateOnly(p[30]),time=p[31];
 if(!(price>0)||!(previousClose>0)||!date||!/^\d{2}:\d{2}:\d{2}$/.test(time||''))throw new Error('新浪行情字段不完整');
 return {symbol,code:symbol.slice(2),name:p[0],price,previousClose,open:finite(p[1]),high:finite(p[4]),low:finite(p[5]),change:(price/previousClose-1)*100,volume:finite(p[8])/100,date,time,timestamp:`${date}T${time}+08:00`,source:'新浪财经',sourceUrl:`https://finance.sina.com.cn/realstock/company/${symbol}/nc.shtml`,fetchedAt:new Date().toISOString()};
}
export async function quote(symbol){return cached(`quote-v2:${symbol}`,30e3,()=>resolveSources([
 {name:'腾讯证券',url:`https://gu.qq.com/${symbol}/gp`,load:async()=>parseQuote(await request('https://qt.gtimg.cn/q='+symbol,{encoding:'gb18030',referer:'https://gu.qq.com/'}),symbol)},
 {name:'新浪财经',url:`https://finance.sina.com.cn/realstock/company/${symbol}/nc.shtml`,load:async()=>parseSinaQuote(await request('https://hq.sinajs.cn/list='+symbol,{encoding:'gb18030',referer:'https://finance.sina.com.cn/'}),symbol)}
],compareQuotes,{choose:values=>[...values].sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0]}))}
export function parseHistory(json,symbol){const j=typeof json==='string'?JSON.parse(json):json;const a=j.data?.[symbol]?.day;if(j.code!==0||!Array.isArray(a))throw new Error('未取得未复权历史行情');return a.map(v=>({date:dateOnly(v[0]),open:finite(v[1]),close:finite(v[2]),high:finite(v[3]),low:finite(v[4]),volume:finite(v[5])})).filter(v=>v.date&&v.close>0&&v.open>0)}
async function tencentHistory(symbol){
 const end=chinaDate(),cuts=[-11,-8,-5,-2,0].map(year=>shiftYears(end,year));
 const chunks=await Promise.all(cuts.slice(0,-1).map(async(from,i)=>{
  const text=await request(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,${from},${cuts[i+1]},1000,`,{referer:'https://gu.qq.com/'}),j=JSON.parse(text),stock=j.data?.[symbol];
  // A successful empty pre-listing interval does not invalidate later history.
  if(j.code===0&&stock&&!stock.day&&!stock.qfqday&&!stock.hfqday)return [];
  return parseHistory(j,symbol);
 }));
 const unique=new Map(chunks.flat().map(p=>[p.date,p]));if(!unique.size)throw new Error('腾讯未返回有效历史日线');return {data:[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)),source:'腾讯证券 · 未复权日线',sourceUrl:`https://gu.qq.com/${symbol}/gp`,fetchedAt:new Date().toISOString()};
}
export function parseEmHistory(json){
 const j=typeof json==='string'?JSON.parse(json):json;if(j.rc!==0||!Array.isArray(j.data?.klines)||!j.data.klines.length)throw new Error('东方财富未返回未复权日线');
 return j.data.klines.map(row=>{const v=row.split(',');return {date:dateOnly(v[0]),open:finite(v[1]),close:finite(v[2]),high:finite(v[3]),low:finite(v[4]),volume:finite(v[5])}}).filter(p=>p.date&&p.close>0&&p.open>0).sort((a,b)=>a.date.localeCompare(b.date));
}
export async function history(symbol){return cached(`history-v3-11y:${symbol}:${chinaDate()}`,6*3600e3,()=>resolveSources([
 {name:'腾讯证券 · 未复权日线',url:`https://gu.qq.com/${symbol}/gp`,load:()=>tencentHistory(symbol)},
 {name:'东方财富 · 未复权日线',url:`https://quote.eastmoney.com/${symbol}.html`,load:async()=>{
  const start=shiftYears(chinaDate(),-11).replaceAll('-',''),end=chinaDate().replaceAll('-','');
  const data=parseEmHistory(await request(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${symbol.startsWith('sh')?1:0}.${symbol.slice(2)}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=0&beg=${start}&end=${end}&lmt=4000`));
  if(!data.length)throw new Error('未取得有效的未复权日线');
  return {data,source:'东方财富 · 未复权日线',sourceUrl:`https://quote.eastmoney.com/${symbol}.html`,fetchedAt:new Date().toISOString()};
 }}
],compareHistory,{asOf:chinaDate(),choose:values=>[...values].sort((a,b)=>b.data.length-a.data.length||b.data.at(-1).date.localeCompare(a.data.at(-1).date))[0]}))}
function sinaDividendRows(text){
 const body=text.split('id="sharebonus_1"')[1]?.split('</table>')[0];if(!body)throw new Error('备用分红源格式变化');const rows=[];
 for(const row of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>x[1].replace(/<[^>]*>/g,'').replace(/&nbsp;/g,'').trim());if(cells.length<7||!dateOnly(cells[0]))continue;rows.push({EX_DIVIDEND_DATE:cells[5],NOTICE_DATE:cells[0],PRETAX_BONUS_RMB:finite(cells[3]),BONUS_RATIO:finite(cells[1]),IT_RATIO:finite(cells[2]),ASSIGN_PROGRESS:cells[4],EQUITY_RECORD_DATE:cells[6],REPORT_DATE:null,IMPL_PLAN_PROFILE:`10股派${cells[3]}元（新浪备用记录，所属财年待核）`})}
 return rows;
}
export function parseSinaDividends(text,asOf=chinaDate()){return normalizeDividends(sinaDividendRows(text),asOf)}
export function parseSinaDividendPlans(text,asOf=chinaDate()){return normalizeDividendPlans(sinaDividendRows(text),asOf)}
export async function dividends(symbol){return cached(`dividends-v3-ttm-plans:${symbol}:${chinaDate()}`,2*3600e3,()=>{
 const code=symbol.slice(2),emLink=`https://data.eastmoney.com/yjfp/detail/${code}.html`,sinaLink=`https://vip.stock.finance.sina.com.cn/corp/go.php/vISSUE_ShareBonus/stockid/${code}.phtml`;
 return resolveSources([
  {name:'东方财富 · 分红送转',url:emLink,load:async()=>{const rows=await em('RPT_SHAREBONUS_DET',code,{size:100,sort:'REPORT_DATE'});return {data:normalizeDividends(rows),plans:normalizeDividendPlans(rows),plansAvailable:true,source:'东方财富 · 分红送转',sourceUrl:emLink,fetchedAt:new Date().toISOString()}}},
  {name:'新浪财经 · 分红记录',url:sinaLink,load:async()=>{const text=await request(sinaLink,{encoding:'gb18030',referer:'https://finance.sina.com.cn/'});return {data:parseSinaDividends(text),plans:parseSinaDividendPlans(text),plansAvailable:true,source:'新浪财经 · 分红记录',sourceUrl:sinaLink,fetchedAt:new Date().toISOString(),note:'备用源缺少所属财年，不影响按除息日计算滚动股息；财年对照可能不可用，特别分红识别受原始标记限制'}}}
 ],compareDividends,{asOf:chinaDate()});
})}
export function normalizeIncome(rows){return rows.map(r=>({reportDate:dateOnly(r.REPORT_DATE),noticeDate:dateOnly(r.NOTICE_DATE),industry:String(r.INDUSTRY_NAME||''),revenue:finite(r.TOTAL_OPERATE_INCOME)??finite(r.OPERATE_INCOME),revenueKind:finite(r.TOTAL_OPERATE_INCOME)!==null?'total':'operating',revenueLabel:finite(r.TOTAL_OPERATE_INCOME)!==null?'营业总收入':'营业收入',profit:finite(r.PARENT_NETPROFIT),profitGrowth:finite(r.PARENT_NETPROFIT_RATIO),revenueGrowth:finite(r.TOI_RATIO),eps:finite(r.BASIC_EPS)})).filter(r=>r.reportDate&&r.noticeDate).sort((a,b)=>a.reportDate.localeCompare(b.reportDate))}
const compactDate=v=>dateOnly(String(v||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'));
export function parseSinaIncome(json,asOf=chinaDate()){
 const j=typeof json==='string'?JSON.parse(json):json,reports=j.result?.data?.report_list;if(!reports)throw new Error('新浪利润表格式变化');
 const data=Object.entries(reports).map(([date,r])=>{
  if(r.rCurrency!=='CNY'||r.rType!=='合并期末')return null;
  const fields=r.data||[],find=(codes,titles)=>codes.map(c=>fields.find(x=>x.item_field===c&&finite(x.item_value)!==null)).find(Boolean)||titles.map(t=>fields.find(x=>x.item_title===t&&finite(x.item_value)!==null)).find(Boolean);
  // Total revenue includes subsidiary finance/insurance income. Never prefer
  // the operating-revenue child row just because it appears earlier in JSON.
  const total=find(['BIZTOTINCO','TOTBIZINCO'],['营业总收入']),revenue=total||find(['BIZINCO'],['营业收入']),profit=find(['NETPARESHARPROF','PARENETP'],['归属于母公司所有者的净利润','归属于母公司的净利润']),eps=find(['BASICEPS'],['基本每股收益']);
  return {reportDate:compactDate(date),noticeDate:compactDate(r.publish_date),industry:'',revenue:finite(revenue?.item_value),revenueKind:total?'total':'operating',revenueLabel:total?'营业总收入':'营业收入',profit:finite(profit?.item_value),profitGrowth:finite(profit?.item_tongbi)===null?null:Number(profit.item_tongbi)*100,revenueGrowth:finite(revenue?.item_tongbi)===null?null:Number(revenue.item_tongbi)*100,eps:finite(eps?.item_value)};
 }).filter(r=>r&&r.reportDate&&r.noticeDate&&r.noticeDate<=asOf&&r.profit!==null&&r.revenue!==null).sort((a,b)=>a.reportDate.localeCompare(b.reportDate));
 if(!data.length)throw new Error('新浪未返回人民币合并利润表');return data;
}
export async function finance(symbol){return cached(`income-v3:${symbol}:${chinaDate()}`,6*3600e3,()=>resolveSources([
 {name:'东方财富 · 利润表',url:`https://data.eastmoney.com/bbsj/${symbol.slice(2)}/lrb.html`,load:async()=>{const data=normalizeIncome(await em('RPT_DMSK_FN_INCOME',symbol.slice(2),{size:16})).filter(r=>r.noticeDate<=chinaDate());if(!data.length)throw new Error('没有已披露的利润表');return {data,source:'东方财富 · 利润表',sourceUrl:`https://data.eastmoney.com/bbsj/${symbol.slice(2)}/lrb.html`,fetchedAt:new Date().toISOString()}}},
 {name:'新浪财经 · 利润表',url:`https://vip.stock.finance.sina.com.cn/corp/go.php/vFD_FinanceSummary/stockid/${symbol.slice(2)}.phtml`,load:async()=>({data:parseSinaIncome(await request(`https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022?paperCode=${symbol}&source=lrb&type=0&page=1&num=16`,{referer:'https://finance.sina.com.cn/'})),source:'新浪财经 · 利润表',sourceUrl:`https://vip.stock.finance.sina.com.cn/corp/go.php/vFD_FinanceSummary/stockid/${symbol.slice(2)}.phtml`,fetchedAt:new Date().toISOString()})}
],compareFinance,{choose:values=>[...values].sort((a,b)=>b.data.at(-1).reportDate.localeCompare(a.data.at(-1).reportDate))[0]}))}
async function emRates(){
 const rows=await em('RPTA_WEB_TREASURYYIELD','',{size:20,sort:'SOLAR_DATE'});const data=rows.map(r=>({date:dateOnly(r.SOLAR_DATE),twoYear:finite(r.EMM00588704),fiveYear:finite(r.EMM00166462),tenYear:finite(r.EMM00166466),thirtyYear:finite(r.EMM00166469)})).filter(r=>r.date&&r.tenYear>0).sort((a,b)=>a.date.localeCompare(b.date));if(!data.length)throw new Error('未取得中国十年期国债收益率');return {data,source:'东方财富 · 中国国债收益率',sourceUrl:'https://data.eastmoney.com/cjsj/zmgzsyl.html',fetchedAt:new Date().toISOString()};
}
const CHINABOND_URL='https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/more?locale=cn_zh';
export function parseChinaBond(text){
 const clean=text.replace(/<!--[\s\S]*?-->/g,''),table=clean.split('id="gjqxData"')[1]?.split('</table>')[0];
 const date=dateOnly(clean.match(/id="gzr"[^>]*value="([^"]+)"/)?.[1]);
 const row=table?.match(/<tr[^>]*>\s*<td[^>]*>\s*中债国债收益率曲线\s*<\/td>([\s\S]*?)<\/tr>/)?.[1];
 const values=row?[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x=>finite(x[1].replace(/<[^>]+>/g,'').trim())):[];
 if(!date||values.length!==8||!(values[6]>0)||date>chinaDate())throw new Error('中债国债曲线格式变化或日期无效');
 return [{date,twoYear:null,fiveYear:values[4],tenYear:values[6],thirtyYear:values[7]}];
}
export async function rates(){return cached('treasury-v2:'+chinaDate(),3600e3,()=>resolveSources([
 {name:'东方财富 · 中国国债收益率',url:'https://data.eastmoney.com/cjsj/zmgzsyl.html',load:emRates},
 {name:'中债 · 国债到期收益率曲线',url:CHINABOND_URL,load:async()=>({data:parseChinaBond(await request(CHINABOND_URL,{referer:'https://yield.chinabond.com.cn/'})),source:'中债 · 国债到期收益率曲线',sourceUrl:CHINABOND_URL,fetchedAt:new Date().toISOString()})}
],compareRates,{choose:values=>[...values].sort((a,b)=>b.data.at(-1).date.localeCompare(a.data.at(-1).date))[0]}))}
export async function search(query){
 if(typeof query!=='string'||query.length<2||query.length>24||!/^[\p{Script=Han}a-zA-Z0-9\s]+$/u.test(query))return [];
 return cached(`search:${query}`,3600e3,async()=>{
  const text=await request('https://smartbox.gtimg.cn/s3/?q='+encodeURIComponent(query)+'&t=all',{encoding:'gb18030',referer:'https://gu.qq.com/'});const raw=text.match(/v_hint="([\s\S]*?)"\s*;?\s*$/)?.[1];if(raw===undefined)throw new Error('股票搜索暂不可用');let decoded;try{decoded=JSON.parse('"'+raw+'"')}catch{throw new Error('股票搜索格式变化')}
  return decoded.split('^').map(v=>v.split('~')).filter(v=>v[4]==='GP-A'&&validSymbol(v[0]+v[1])).slice(0,15).map(v=>({symbol:v[0]+v[1],code:v[1],name:v[2],abbreviation:v[3]}));
 });
}
