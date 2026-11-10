/**
 * Xijian fiscal-period replacement reference model 3.0.0.
 * All yields are percentage points, cash is CNY per share, raw OHLC prices.
 * This is an interpretable rule model, not an LLM or an optimized predictor.
 */
import '../../public/risk-profiles.js';
export const RISK_PROFILES=globalThis.XijianRisk.profiles;
export const riskProfile=globalThis.XijianRisk.get;
export const MODEL_VERSION='dividend-period-3.0.0';
export const DAY=86400000;
export const dateOnly=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):null;
export const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const round=(n,d=4)=>Number.isFinite(n)?Number(n.toFixed(d)):null;
const stamp=d=>Date.parse(`${d}T00:00:00Z`);
export function daysBetween(a,b){return (stamp(b)-stamp(a))/DAY}
export function chinaDate(now=new Date()){return new Date(now.getTime()+8*3600000).toISOString().slice(0,10)}
export function shiftYears(d,n){const t=new Date(stamp(d)),month=t.getUTCMonth();t.setUTCFullYear(t.getUTCFullYear()+n);if(t.getUTCMonth()!==month)t.setUTCDate(0);return t.toISOString().slice(0,10)}
export function quantile(values,p){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const t=(a.length-1)*p,l=Math.floor(t);return a[l]+(a[Math.ceil(t)]-a[l])*(t-l)}
const implemented=progress=>/^(实施(?:分配)?|已实施)$/.test(String(progress||'').trim());
export function normalizeDividends(rows,asOf=chinaDate()){
 const seen=new Map();
 for(const r of rows){
  const ex=dateOnly(r.EX_DIVIDEND_DATE),announced=dateOnly(r.NOTICE_DATE)||dateOnly(r.PLAN_NOTICE_DATE),report=dateOnly(r.REPORT_DATE);
  if(!ex||ex>asOf||!implemented(r.ASSIGN_PROGRESS)||announced&&announced>asOf)continue;
  const cash=finite(r.PRETAX_BONUS_RMB),bonus=finite(r.BONUS_RATIO)||0,transfer=finite(r.IT_RATIO)||0;
  if(cash===null&&bonus===0&&transfer===0)continue;
  const profile=String(r.IMPL_PLAN_PROFILE||'');
  const e={exDate:ex,recordDate:dateOnly(r.EQUITY_RECORD_DATE),announcementDate:announced,reportDate:report,cashPerShare:Math.max(0,(cash||0)/10),shareFactor:1+(bonus+transfer)/10,profile,special:/特别|特殊|特别股息/.test(profile),eps:finite(r.BASIC_EPS),shares:finite(r.TOTAL_SHARES)};
  // One implemented event per fiscal period/ex-date; later revised notices supersede.
  const key=`${report||''}:${ex}`;const prev=seen.get(key);
  if(!prev||(announced||'')>=(prev.announcementDate||''))seen.set(key,e);
 }
 return [...seen.values()].sort((a,b)=>a.exDate.localeCompare(b.exDate));
}
const knownAt=(e,asOf)=>e.exDate<=asOf&&(!e.announcementDate||e.announcementDate<=asOf);
const shareFactor=(events,from,to,inclusive=true)=>events.filter(e=>knownAt(e,to)&&(inclusive?e.exDate>=from:e.exDate>from)).reduce((p,e)=>p*(e.shareFactor||1),1);
export function rollingDividendBasis(events,asOf){
 const start=shiftYears(asOf,-1),known=events.filter(e=>knownAt(e,asOf));
 const components=known.filter(e=>e.exDate>start&&e.cashPerShare>0).map(e=>{
  const factor=shareFactor(known,e.exDate,asOf),adjustedCashPerShare=e.cashPerShare/factor;
  return {exDate:e.exDate,reportDate:e.reportDate,announcementDate:e.announcementDate,cashPerShare:e.cashPerShare,shareFactor:factor,adjustedCashPerShare:round(adjustedCashPerShare,8),special:!!e.special,included:!e.special,profile:e.profile||''};
 });
 const sum=filter=>round(components.filter(filter).reduce((s,e)=>s+e.adjustedCashPerShare,0),8);
 return {id:'ttm-ordinary-implemented',label:'滚动12个月普通现金股息（已实施）',startExclusive:start,endInclusive:asOf,cashPerShare:sum(e=>e.included),totalCashPerShare:sum(()=>true),specialCashPerShare:sum(e=>e.special),components};
}
export function ttmDividend(events,asOf,{excludeSpecial=false}={}){const b=rollingDividendBasis(events,asOf);return excludeSpecial?b.cashPerShare:b.totalCashPerShare}
export function normalizeDividendPlans(rows,asOf=chinaDate()){
 const latest=new Map();
 for(const r of rows){const announced=dateOnly(r.NOTICE_DATE)||dateOnly(r.PLAN_NOTICE_DATE),report=dateOnly(r.REPORT_DATE),ex=dateOnly(r.EX_DIVIDEND_DATE);if(!announced||announced>asOf)continue;const key=report||ex||`${announced}:${r.IMPL_PLAN_PROFILE||''}`,prior=latest.get(key);if(!prior||announced>=prior.announcementDate)latest.set(key,{row:r,announcementDate:announced})}
 return [...latest.values()].flatMap(({row:r,announcementDate})=>{
  const exDate=dateOnly(r.EX_DIVIDEND_DATE),progress=String(r.ASSIGN_PROGRESS||''),cash=finite(r.PRETAX_BONUS_RMB),profile=String(r.IMPL_PLAN_PROFILE||'');
  if(cash===null||cash<=0||/不分|取消|终止|撤销/.test(progress)||implemented(progress)&&exDate&&exDate<=asOf)return [];
  return [{reportDate:dateOnly(r.REPORT_DATE),announcementDate,exDate,cashPerShare:cash/10,progress,profile,special:/特别|特殊/.test(profile),included:false}];
 }).sort((a,b)=>b.announcementDate.localeCompare(a.announcementDate));
}
export function annualDividends(events,asOf){
 const map=new Map();
 for(const e of events){if(!e.reportDate||!knownAt(e,asOf))continue;const year=e.reportDate.slice(0,4);const factor=events.filter(x=>x.exDate>=e.exDate&&x.exDate<=asOf).reduce((p,x)=>p*x.shareFactor,1);const v=map.get(year)||{year,cashPerShare:0,special:0,events:0};v.cashPerShare+=e.cashPerShare/factor;if(e.special)v.special+=e.cashPerShare/factor;v.events++;map.set(year,v)}
 return [...map.values()].sort((a,b)=>a.year.localeCompare(b.year)).map(v=>({...v,cashPerShare:round(v.cashPerShare),special:round(v.special)}));
}
export function inferIndustry(income,name=''){
 const label=income?.industry||'';
 if(/银行/.test(label+name))return {kind:'bank',name:label||'银行',premium:1.8,focus:'资产质量、资本约束与分红覆盖'};
 if(/保险/.test(label)||/中国平安|中国人寿|中国太保|新华保险/.test(name))return {kind:'insurance',name:label||'保险',premium:2.2,focus:'偿付能力与持续分红'};
 if(/煤炭|钢铁|水泥|建材|石油|化工|有色|采掘/.test(label))return {kind:'cyclical',name:label,premium:2.8,focus:'周期利润、现金流与分红下修'};
 if(/电力|公用事业|水电|燃气|通信|运营商/.test(label)||/中国移动|中国电信|中国联通|长江电力/.test(name))return {kind:'defensive',name:label||'公用事业／通信',premium:1.5,focus:'资本开支、债务与分红持续性'};
 return {kind:'general',name:label||'待分类',premium:2.2,focus:'盈利质量与分红连续性'};
}
export function thresholdsFrom(values,rate,premium,risk='balanced'){
 const profile=riskProfile(risk);
 const q={p20:quantile(values,.2),p35:quantile(values,.35),p75:quantile(values,.75),p90:quantile(values,.9),p95:quantile(values,.95)};
 if(Object.values(q).some(v=>v===null)||!Number.isFinite(rate))return null;
 const historicalEntry=quantile(values,profile.buyQuantile),floor=rate+premium,buyLow=Math.max(historicalEntry,floor);
 const sellHigh=Math.max(.4,Math.min(q.p35,buyLow-.6));
 return {quantiles:Object.fromEntries(Object.entries(q).map(([k,v])=>[k,round(v)])),risk:profile.id,buyPercentile:profile.buyQuantile*100,historicalEntry:round(historicalEntry),buyYield:round(buyLow),sellYield:round(sellHigh),rateFloor:round(floor),premium,rate};
}
export function priceAtYield(dividend,yieldThreshold){return dividend>0&&yieldThreshold>0?round(dividend/(yieldThreshold/100),2):null}
export function classify(y,thresholds){if(!Number.isFinite(y)||y<=0)return 'review';if(y>=thresholds.buyYield)return 'buy';if(y<=thresholds.sellYield)return 'sell';return 'hold'}
// Fiscal-year comparison only; strategy thresholds use the period reference below.
// Its final distribution must already be implemented at that historical date.
export function fiscalDividend(events,asOf,{excludeSpecial=true}={}){
 const known=events.filter(e=>e.exDate<=asOf&&(!e.announcementDate||e.announcementDate<=asOf));
 const finals=known.filter(e=>e.reportDate?.endsWith('-12-31')).sort((a,b)=>b.reportDate.localeCompare(a.reportDate));
 if(!finals.length)return {year:null,cashPerShare:null,components:[],effectiveDate:null};
 const year=finals[0].reportDate.slice(0,4),components=known.filter(e=>e.reportDate?.startsWith(year+'-'));
 let cash=0;
 for(const e of components){if(excludeSpecial&&e.special)continue;const factor=known.filter(x=>x.exDate>=e.exDate).reduce((p,x)=>p*x.shareFactor,1);cash+=e.cashPerShare/factor}
 return {year,cashPerShare:round(cash),components:components.map(e=>({reportDate:e.reportDate,cashPerShare:e.cashPerShare,exDate:e.exDate})),effectiveDate:components.map(e=>e.exDate).sort().at(-1)||null};
}
// Causal rolling fiscal reference: completed year + new interim - matching old interim.
// No expiry at the cash-payment anniversary; every selected event remains auditable.
export function periodDividendBasis(events,asOf){
 const known=events.filter(e=>knownAt(e,asOf)),ordinary=known.filter(e=>!e.special&&e.reportDate&&e.cashPerShare>=0);
 const final=ordinary.filter(e=>e.reportDate.endsWith('-12-31')).sort((a,b)=>b.reportDate.localeCompare(a.reportDate))[0];
 const empty={id:'period-replacement-3.0',label:'策略参考股息率（按所属期间替换）',asOf,baseYear:null,cashPerShare:null,components:[],replaced:[],blockers:[]};
 if(!final)return {...empty,blockers:['缺少已实施完整财年的所属期间资料，无法构建策略参考基数']};
 const year=final.reportDate.slice(0,4),base=ordinary.filter(e=>e.reportDate.startsWith(year+'-')),newer=ordinary.filter(e=>e.reportDate.slice(0,4)>year&&!e.reportDate.endsWith('-12-31'));
 const newYear=newer.length?newer.map(e=>e.reportDate.slice(0,4)).sort().at(-1):null,newEvents=newer.filter(e=>e.reportDate.startsWith(newYear+'-'));
 const priorInterim=base.filter(e=>!e.reportDate.endsWith('-12-31')),cut=newEvents.map(e=>e.reportDate.slice(5)).sort().at(-1);
 // A single midyear payment may be tagged Q2 or Q3 by different public tables.
 // Treat those as one interim slot; quarterly schedules use the YTD cutoff.
 const oneInterim=priorInterim.length===1&&newEvents.length===1&&['06-30','09-30'].includes(priorInterim[0].reportDate.slice(5))&&['06-30','09-30'].includes(cut);
 const replaced=cut?priorInterim.filter(e=>oneInterim||e.reportDate.slice(5)<=cut):[];
 const selected=base.filter(e=>!replaced.includes(e)).concat(newEvents),components=selected.map(e=>{const factor=shareFactor(known,e.exDate,asOf);return {...e,adjustedCashPerShare:round(e.cashPerShare/factor,8),shareFactor:factor,included:true,role:e.reportDate.slice(0,4)===year?'保留的完整财年分红':'替换后的新期间分红'}});
 const blockers=[];if(Number(asOf.slice(0,4))-Number(year)>2||newYear&&Number(newYear)!==Number(year)+1)blockers.push('完整财年资料过旧或中间财年缺失，暂停期间替换策略');
 const last=ordinary.map(e=>e.exDate).sort().at(-1);if(last&&daysBetween(last,asOf)>550)blockers.push('普通分红超过18个月未更新，暂停沿用旧基数');
 if(known.some(e=>!e.reportDate&&e.cashPerShare>0&&!e.special&&e.exDate>=final.exDate))blockers.push('新分红缺少所属期间，无法安全替换，暂停信号');
 return {...empty,baseYear:year,newYear,effectiveDate:components.map(e=>e.exDate).sort().at(-1),cashPerShare:round(components.reduce((n,e)=>n+e.adjustedCashPerShare,0),8),components,replaced:replaced.map(e=>({...e,role:'已被新期间替换',included:false})),blockers};
}
export function buildSeries(prices,events,asOf){return prices.filter(p=>p.date<=asOf).map(p=>{
 const fiscal=fiscalDividend(events,p.date),basis=periodDividendBasis(events,p.date),actual=rollingDividendBasis(events,p.date),ordinary=basis.cashPerShare;
 return {...p,dividend:ordinary,yield:ordinary!==null&&p.close>0?round(ordinary/p.close*100):null,basisReady:basis.blockers.length===0,strategyBaseYear:basis.baseYear,windowStart:actual.startExclusive,dividendCount:basis.components.length,specialDividend:actual.specialCashPerShare,fiscalYear:fiscal.year,fiscalDividend:fiscal.cashPerShare,fiscalYield:fiscal.cashPerShare>0&&p.close>0?round(fiscal.cashPerShare/p.close*100):null,ttmDividend:actual.cashPerShare,ttmYield:p.close>0?round(actual.cashPerShare/p.close*100):null};
})}
export function studyHighYieldWindows(series,events){
 // A causal event study of high-yield windows, NOT a backtest of the current full model.
 // Each threshold uses only earlier observations; samples cannot overlap.
 const samples=[],horizon=126;
 for(let i=252;i+horizon+1<series.length;i++){
  const train=series.slice(Math.max(0,i-756),i).filter(p=>p.basisReady!==false).map(p=>p.yield).filter(v=>Number.isFinite(v)&&v>=0);if(train.length<240)continue;
  const low=quantile(train,.75),p=series[i];
  if(!(p.basisReady!==false&&p.yield>0&&p.yield>=low))continue;
  const entry=series[i+1],exit=series[i+1+horizon];
  if(!entry?.open||entry.volume<=0||entry.high===entry.low||entry.open/p.close>1.095)continue;
  let shares=1,cash=0,peak=entry.open,maxDrawdown=0;
  for(const day of series.slice(i+1,i+2+horizon)){
   // Buying on an ex-date does not acquire that day's dividend entitlement.
   if(day.date>entry.date)for(const event of events.filter(e=>e.exDate===day.date)){cash+=shares*event.cashPerShare;shares*=event.shareFactor}
   const value=shares*day.close+cash;peak=Math.max(peak,value);maxDrawdown=Math.min(maxDrawdown,value/peak-1);
  }
  if(exit.volume<=0||exit.high===exit.low)continue;
  samples.push({signalDate:p.date,entryDate:entry.date,exitDate:exit.date,entryPrice:entry.open,exitPrice:exit.close,signalYield:p.yield,trainingThreshold:round(low),returnPct:round(((shares*exit.close+cash)/entry.open-1-.002)*100,2),maxDrawdownPct:round(maxDrawdown*100,2)});
  i+=horizon;
 }
 return {name:'历史高股息窗口观察',horizon:126,count:samples.length,positiveCount:samples.filter(s=>s.returnPct>0).length,averageReturn:samples.length?round(samples.reduce((a,b)=>a+b.returnPct,0)/samples.length,2):null,winRate:samples.length>=10?round(samples.filter(s=>s.returnPct>0).length/samples.length*100,1):null,samples,notes:['这是股息率不低于历史P75的事件观察，不是完整模型回测或未来上涨概率。','阈值只用信号日前252—756个交易日数据；次日开盘进入，持有126个交易日；事件不重叠。','现金分红按除息权益应计，不再投资；合计扣除0.2%情景成本，并非实际个人税费。','未模拟完整停复牌、涨跌停排队、冲击成本、退市和财报历史版本；未核全配股等公司行动。','样本少于10个不展示胜率；无论样本数多少，都不承诺预测有效。']};
}
const ordinaryAnnual=(events,year,asOf)=>events.filter(e=>knownAt(e,asOf)&&e.reportDate?.startsWith(year+'-')&&!e.special).reduce((n,e)=>n+e.cashPerShare/shareFactor(events,e.exDate,asOf),0);
export function analyze({quote,prices=[],events=[],income=[],rates=[],errors=[],dataChecks=[],risk='balanced',asOf=chinaDate()}){
 const latest=quote?.date||prices.at(-1)?.date||asOf,price=quote?.price||prices.at(-1)?.close||null;
 const latestIncome=income.filter(x=>x.noticeDate&&x.noticeDate<=asOf).sort((a,b)=>b.reportDate.localeCompare(a.reportDate))[0]||null;
 const industry=inferIndustry(latestIncome,quote?.name||'');
 const cutoff=shiftYears(latest,-3),series=buildSeries(prices,events,latest),recent=series.filter(p=>p.date>=cutoff),values=recent.filter(p=>p.basisReady).map(p=>p.yield).filter(v=>Number.isFinite(v)&&v>=0);
 const actualBasis=rollingDividendBasis(events,latest),basis=periodDividendBasis(events,latest),ordinary=basis.cashPerShare,currentYield=price>0&&ordinary!==null?ordinary/price*100:null;
 const fiscal=fiscalDividend(events,latest),allYears=annualDividends(events,latest);
 const previousEnd=shiftYears(latest,-1),previousFactor=shareFactor(events,previousEnd,latest,false),previousDividend=periodDividendBasis(events,previousEnd).cashPerShare/previousFactor;
 const dividendGrowth=previousDividend>0?(ordinary/previousDividend-1)*100:null;
 const continuity=[0,1,2].map(n=>{const year=String(Number(basis.baseYear)-n);return {year,cashPerShare:ordinaryAnnual(events,year,latest)}});
 const rate=rates.filter(r=>r.date<=latest&&r.tenYear>0).sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
 const profile=riskProfile(risk),premium=Math.max(.5,industry.premium+profile.premiumDelta);
 const thresholds=rate?thresholdsFrom(values,rate.tenYear,premium,profile.id):null;
 const warnings=[],blockers=[];
 for(const check of dataChecks){if(check.blocking)blockers.push(`${check.section}来源冲突：${check.message}`);else if(check.status==='limited')warnings.push(`${check.section}交叉校验受限：${check.message}`)}
 blockers.push(...basis.blockers);
 if(!quote?.price)blockers.push('最新报价暂不可用');
 if(!price||!(ordinary>0))blockers.push('没有可用的期间替换分红基数');
 if(!events.length)blockers.push('未取得已实施分红记录');
 if(values.length<500||!recent.length||daysBetween(recent[0].date,latest)<1000||values.length/Math.max(1,recent.length)<.8)blockers.push('近三年有效策略参考股息率样本不足');
 if(continuity.some(w=>!(w.cashPerShare>0)))blockers.push('最近三个完整财年的普通分红不连续或资料不足');
 if(!latestIncome)blockers.push('缺少最新财务资料，无法检查盈利风险');
 if(!rate||daysBetween(rate.date,asOf)>14)blockers.push('利率参照缺失或过期');
 if(quote?.date&&daysBetween(quote.date,asOf)>10)blockers.push('行情超过十个自然日未更新');
 if(prices.length&&daysBetween(prices.at(-1).date,latest)>10)blockers.push('历史行情尚未更新至报价日期');
 if(latestIncome&&daysBetween(latestIncome.noticeDate,asOf)>220)blockers.push('最新财报披露时间已过久');
 if(latestIncome?.profit!==null&&latestIncome?.profit<=0)blockers.push('最新披露归母净利润非正，暂停普通买入规则');
 if(latestIncome?.profitGrowth!==null&&latestIncome?.profitGrowth<-30)blockers.push('最新披露归母净利润同比下降超过30%');
 if(dividendGrowth!==null&&dividendGrowth<-20)blockers.push('策略参考分红下降超过20%（相对一年前同口径基数）');
 if(/ST|退/.test(quote?.name||''))blockers.push('风险警示或退市标记，不适用通用区间');
 if(thresholds&&thresholds.rateFloor>thresholds.quantiles.p95*1.3)warnings.push('利率加风险补偿门槛高于历史常见区间，当前更适合观察');
 if(actualBasis.specialCashPerShare>0)warnings.push('数据源明确标记的特别分红已单列，未计入普通股息率和买卖门槛。');
 warnings.push('策略基数按所属期间替换：最近已实施完整财年，加新期间普通分红，减去上年对应期间分红；不按派息日满12个月删除，不平滑价格。参考基数不是未来派息承诺。');
 warnings.push('未实施预案不计入策略。公开结构化数据不能识别全部特别分红或所有企业风险，门槛未经收益优化。');
 if(errors.length)warnings.push(...errors.map(e=>`${e.section}：${e.message}`));
 const status=blockers.length||!thresholds?'review':classify(currentYield,thresholds);
 let reason=blockers[0]||'';
 if(!blockers.length&&thresholds){if(status==='buy')reason=`策略参考股息率达到或高于${profile.label}档的买入门槛 ${thresholds.buyYield.toFixed(2)}%，进入买入空间，可按仓位约束分批评估。`;else if(status==='sell')reason=`策略参考股息率达到或低于减仓门槛 ${thresholds.sellYield.toFixed(2)}%，有持仓时评估分批减仓。`;else reason='策略参考股息率位于买入线与减仓线之间，继续观察。'}
 const study={...studyHighYieldWindows(series,events),basisId:basis.id};
 return {version:MODEL_VERSION,risk:profile,asOf:latest,price,dividend:actualBasis.totalCashPerShare,ordinaryDividend:ordinary,basis,actualBasis,
  ttmOrdinaryDividend:actualBasis.cashPerShare,ttmYield:price>0?round(actualBasis.cashPerShare/price*100):null,specialDividend:actualBasis.specialCashPerShare,totalYield:price>0?round(actualBasis.totalCashPerShare/price*100):null,yield:round(currentYield),
  fiscalReference:{year:fiscal.year,ordinaryDividend:fiscal.cashPerShare,yield:price>0&&fiscal.cashPerShare>0?round(fiscal.cashPerShare/price*100):null,effectiveDate:fiscal.effectiveDate,components:fiscal.components},
  status,reason,industry,thresholds:thresholds?{...thresholds,basisId:basis.id,buyPrice:priceAtYield(ordinary,thresholds.buyYield),sellPrice:priceAtYield(ordinary,thresholds.sellYield)}:null,rate,
  history:{basisId:basis.id,start:recent[0]?.date||null,end:recent.at(-1)?.date||null,samples:values.length,coverage:round(values.length/Math.max(1,recent.length)),percentile:currentYield!==null&&values.length?round(values.filter(v=>v<=currentYield).length/values.length*100,1):null},
  annual:allYears.slice(-7),continuity,dividendGrowth:round(dividendGrowth,1),dividendComparison:{previousEnd,previousDividend:round(previousDividend,8),shareFactor:previousFactor},financial:latestIncome,blockers:[...new Set(blockers)],warnings,
  series:series.filter(p=>p.date>=shiftYears(latest,-10)).map(({date,close,yield:y,dividend,fiscalYear,fiscalYield,fiscalDividend,windowStart,dividendCount,specialDividend,ttmYield,ttmDividend,basisReady,strategyBaseYear})=>({date,close,yield:y,dividend,fiscalYear,fiscalYield,fiscalDividend,windowStart,dividendCount,specialDividend,ttmYield,ttmDividend,basisReady,strategyBaseYear})),study,
  validation:{status:'未做收益优化',label:'透明规则模型，非上涨概率预测',walkForward:'事件观察与完整模型验证分开展示'}};
}
