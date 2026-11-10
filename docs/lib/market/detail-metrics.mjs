// Optional research display only. These observations never enter analyze().
import {chinaDate,dateOnly,finite,shiftYears} from './engine.mjs';
import {cached,emUrl,dividends} from './providers.mjs';
const round=n=>Number.isFinite(n)?Number(n.toFixed(4)):null;
async function json(url){
 const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0',Referer:'https://emweb.securities.eastmoney.com/'},signal:AbortSignal.timeout(8500)});
 if(!response.ok)throw Error(`来源返回 ${response.status}`);
 const buffer=await response.arrayBuffer();if(buffer.byteLength>4e6)throw Error('来源返回的数据超出限制');
 return JSON.parse(new TextDecoder().decode(buffer));
}
async function report(name,code,options){const j=await json(emUrl(name,code,options));if(!j.success||!Array.isArray(j.result?.data))throw Error('来源未返回有效数据');return j.result}
export function normalizeValuations(rows,code,asOf){
 const seen=new Map();
 for(const row of rows){const date=dateOnly(row.TRADE_DATE);if(row.SECURITY_CODE!==code||!date||date>asOf)continue;const pe=finite(row.PE_TTM),pb=finite(row.PB_MRQ);seen.set(date,{date,pe:pe>0?pe:null,pb:pb>0?pb:null,peReason:pe>0?'':pe!==null&&pe<=0?'亏损或盈利非正，PE不适用':'PE资料缺失',pbReason:pb>0?'':pb!==null&&pb<=0?'净资产非正，PB不适用':'PB资料缺失'})}
 return [...seen.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function buildPayoutTimeline({cash=[],financials=[],events=[],plans=[],profile,capital=[],asOf}){
 if(!profile)return {timeline:[],reason:'股份类别资料缺失，支付率口径待核对'};
 // The A-share F10 cash aggregate excludes H/B-share distributions, whereas
 // consolidated parent profit includes them. Do not mix these scopes.
 if(profile.STR_CODEB||(profile.STR_CODEH&&!capital.length))return {timeline:[],reason:'分红源仅含A股金额，多类别股份的全公司支付率口径待核对'};
 const years=new Map();
 for(const row of cash){const year=String(row.STATISTICS_YEAR||''),amount=finite(row.TOTAL_DIVIDEND);if(!/^\d{4}$/.test(year)||year>=asOf.slice(0,4)||amount===null)continue;years.set(year,amount)}
 const timeline=[];
 for(const [year,aCashAmount] of years){
  let amount=aCashAmount,estimated=false;
  if(plans.some(p=>p.reportDate?.startsWith(year+'-')))continue;
  const fs=financials.filter(f=>dateOnly(f.REPORT_DATE)===year+'-12-31'&&dateOnly(f.NOTICE_DATE)<=asOf&&['CNY','人民币'].includes(f.CURRENCY)).sort((a,b)=>String(b.NOTICE_DATE).localeCompare(String(a.NOTICE_DATE)))[0];
  const components=events.filter(e=>e.reportDate?.startsWith(year+'-')&&e.exDate<=asOf&&(!e.announcementDate||e.announcementDate<=asOf));
  if(!fs||!components.some(e=>e.reportDate===year+'-12-31'))continue;
  if(profile.STR_CODEH){
   // The source's disclosed A-share cash already excludes treasury shares.
   // Only add H-share cash when every event has a matching historical capital base.
   // Equal RMB dividend rights and H-share eligibility remain assumptions: label as estimate.
   let hCash=0,valid=true;
   for(const event of components){
    const cap=capital.filter(c=>dateOnly(c.END_DATE)&&dateOnly(c.END_DATE)<=event.exDate).sort((a,b)=>String(b.END_DATE).localeCompare(String(a.END_DATE)))[0];
    const h=finite(cap?.H_FREE_SHARE),total=finite(cap?.TOTAL_SHARES),perShare=finite(event.cashPerShare);
    if(!cap||!(h>0)||!(total>h)||perShare===null||!Number.isFinite(event.shares)||Math.abs(total-event.shares)>1||[cap.B_FREE_SHARE,cap.LIMITED_B_SHARES,cap.LIMITED_H_SHARES,cap.OTHER_FREE_SHARES].some(v=>Number(v)>0)){valid=false;break}
    hCash+=h*perShare;
   }
   if(!valid)continue;
   amount+=hCash;estimated=true;
  }
  const profit=finite(fs.PARENTNETPROFIT),noticeDate=dateOnly(fs.NOTICE_DATE);if(profit===null||!noticeDate)continue;
  const effectiveDate=[noticeDate,...components.flatMap(e=>[e.exDate,e.announcementDate].filter(Boolean))].sort().at(-1);
  if(effectiveDate>asOf)continue;
  timeline.push({year,effectiveDate,payout:profit>0?round(amount/profit*100):null,reason:profit>0?'':'归母净利润非正，支付率不适用',cashAmount:amount,aCashAmount,estimated,scopeNote:estimated?'A股实派金额＋按除息时H股股数和同额人民币每股股息补算；假设H股均有分红权，不作为公告原值':'来源披露的A股派现金额；公司无H／B股',profit,noticeDate,includesSpecial:true});
 }
 return {timeline:timeline.sort((a,b)=>a.year.localeCompare(b.year)),reason:timeline.length?'':'完整财年分红总额、实施记录或同范围股本资料不足'};
}
async function valuationHistory(symbol,asOf){
 const code=symbol.slice(2),start=shiftYears(asOf,-10),make=page=>{const u=new URL(emUrl('RPT_VALUEANALYSIS_DET',code,{size:500,sort:'TRADE_DATE',page,columns:'SECURITY_CODE,TRADE_DATE,PE_TTM,PB_MRQ'}));u.searchParams.set('filter',`(SECURITY_CODE="${code}")(TRADE_DATE>='${start}')`);return u.href};
 const first=await json(make(1));if(!first.success||!Array.isArray(first.result?.data))throw Error('未取得PE／PB历史');
 const pages=first.result.pages||1;if(pages>9)throw Error('估值历史分页超出预期');
 const rest=await Promise.all(Array.from({length:pages-1},(_,i)=>json(make(i+2))));
 if(rest.some(j=>!j.success||!Array.isArray(j.result?.data)))throw Error('估值历史部分分页读取失败');
 return normalizeValuations(first.result.data.concat(rest.flatMap(j=>j.result.data)),code,asOf);
}
export async function detailMetrics(symbol){
 const asOf=chinaDate();return cached(`detail-display-v3:${symbol}:${asOf}`,30*60e3,async()=>{
  const code=symbol.slice(2),f10=`https://emweb.securities.eastmoney.com/PC_HSF10`,full=symbol.toUpperCase();
  const results=await Promise.allSettled([
   valuationHistory(symbol,asOf),
   json(`${f10}/BonusFinancing/PageAjax?code=${full}`),
   report('RPT_F10_FINANCE_MAINFINADATA',code,{size:100,columns:'SECURITY_CODE,REPORT_DATE,NOTICE_DATE,PARENTNETPROFIT,CURRENCY'}),
   dividends(symbol),
   json(`${f10}/CompanySurvey/PageAjax?code=${full}`),
   json(`${f10}/CapitalStockStructure/PageAjax?code=${full}`)
  ]);
  const get=i=>results[i].status==='fulfilled'?results[i].value:null,errors=results.map((r,i)=>r.status==='rejected'?`${['估值历史','分红总额','年度利润','实施分红','股份类别','历史股本'][i]}：${r.reason?.message||'暂不可用'}`:null).filter(Boolean);
  const valuations=get(0)||[],d=get(3),profile=get(4)?.jbzl?.find(p=>p.SECURITY_CODE===code),cash=(get(1)?.lnfhrz||[]).filter(p=>p.SECURITY_CODE===code);
  const payout=buildPayoutTimeline({cash,financials:(get(2)?.data||[]).filter(f=>f.SECURITY_CODE===code),events:d?.data||[],plans:d?.plans||[],profile,capital:(get(5)?.lngbbd||[]).filter(c=>c.SECURITY_CODE===code),asOf}),latest=valuations.at(-1),lastPayout=payout.timeline.at(-1);
  return {...(errors.length?{verification:{status:'limited'}}:{}),asOf,valuations,payoutTimeline:payout.timeline,latest:{pe:latest?.pe??null,pb:latest?.pb??null,valuationDate:latest?.date||null,peReason:latest?.peReason||'PE资料暂不可用',pbReason:latest?.pbReason||'PB资料暂不可用',payout:lastPayout?.payout??null,payoutYear:lastPayout?.year||null,payoutReason:lastPayout?.reason||payout.reason},errors,
   sources:[{label:'PE-TTM／PB-MRQ历史',url:`https://data.eastmoney.com/gzfx/detail/${code}.html`},{label:'财年现金分红总额',url:`${f10}/BonusFinancing/Index?type=web&code=${full}`},{label:'历史股本',url:`${f10}/CapitalStockStructure/Index?type=web&code=${full}`},{label:'年度归母净利润',url:`https://data.eastmoney.com/bbsj/${code}/lrb.html`}],
   note:'展示指标不参与买卖策略。支付率按同财年现金分红总额／归母净利润计算，含特别分红、不含回购；仅在财报披露且年度分红实施后定位。历史数据可能受来源后续修订影响。'};
 });
}
