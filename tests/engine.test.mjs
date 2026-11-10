import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDividends,ttmDividend,quantile,priceAtYield,thresholdsFrom,classify,analyze,buildSeries,studyHighYieldWindows,fiscalDividend,rollingDividendBasis,periodDividendBasis,normalizeDividendPlans,shiftYears,RISK_PROFILES,riskProfile} from '../lib/market/engine.mjs';
import {parseQuote,parseHistory,normalizeIncome,validSymbol,parseSinaDividends,parseSinaDividendPlans} from '../lib/market/providers.mjs';

const event=(date,cash,extra={})=>({exDate:date,announcementDate:date,reportDate:date,cashPerShare:cash,shareFactor:1,special:false,...extra});
test('dividend unit conversion, implemented-only, no future events, revision deduplication',()=>{
 const rows=[{EX_DIVIDEND_DATE:'2026-06-10',NOTICE_DATE:'2026-06-01',REPORT_DATE:'2025-12-31',PRETAX_BONUS_RMB:20,ASSIGN_PROGRESS:'实施分配'}, {EX_DIVIDEND_DATE:'2026-06-10',NOTICE_DATE:'2026-06-02',REPORT_DATE:'2025-12-31',PRETAX_BONUS_RMB:22,ASSIGN_PROGRESS:'实施分配'}, {EX_DIVIDEND_DATE:'2027-01-01',PRETAX_BONUS_RMB:100,ASSIGN_PROGRESS:'实施分配'}, {EX_DIVIDEND_DATE:'2026-08-01',PRETAX_BONUS_RMB:100,ASSIGN_PROGRESS:'董事会预案'}];
 const es=normalizeDividends(rows,'2026-11-03');assert.equal(es.length,1);assert.equal(es[0].cashPerShare,2.2);
});
test('TTM excludes boundary/future dividends and normalizes cash after bonus shares',()=>{
 const es=[event('2025-11-03',9),event('2026-02-01',2),event('2026-06-01',1,{shareFactor:2}),event('2026-12-01',100)];
 assert.equal(ttmDividend(es,'2026-11-03'),1.5);assert.equal(ttmDividend(es,'2026-02-02'),11);
});
test('special dividends excluded only when explicitly identified',()=>{const es=[event('2026-01-01',2),event('2026-03-01',5,{special:true})];assert.equal(ttmDividend(es,'2026-11-03'),7);assert.equal(ttmDividend(es,'2026-11-03',{excludeSpecial:true}),2)});
test('price threshold converts one yield line; zero dividends cannot form a price threshold',()=>{assert.equal(priceAtYield(2.5,5),50);assert.equal(priceAtYield(2.5,6),41.67);assert.equal(priceAtYield(0,5),null);assert.equal(priceAtYield(2.5,0),null)});
test('buy space includes the boundary and every higher yield, with separate sell and observation spaces',()=>{assert.equal(quantile([1,2,3,4],.5),2.5);const t=thresholdsFrom([3,4,5,6],2,2.2);assert.ok(t.buyYield>=4.2);assert.ok(t.sellYield<t.buyYield);assert.equal(classify(t.buyYield,t),'buy');assert.equal(classify(t.buyYield+10,t),'buy');assert.equal(classify(100000,t),'buy');assert.equal(classify(t.sellYield,t),'sell');assert.equal(classify(t.sellYield/2,t),'sell');assert.equal(classify((t.sellYield+t.buyYield)/2,t),'hold');assert.equal(classify(null,t),'review')});
test('lack of history, income and rate suppresses actionable buy even at high yield',()=>{const a=analyze({quote:{name:'测试',price:10,date:'2026-11-03'},events:[event('2026-05-01',1)],asOf:'2026-11-03'});assert.equal(a.status,'review');assert.ok(a.blockers.length>=3);assert.equal(a.thresholds,null)});
test('historical yields do not leak future dividends',()=>{const p=[{date:'2025-01-01',close:10},{date:'2026-01-01',close:10}];const s=buildSeries(p,[event('2025-05-01',2,{reportDate:'2024-12-31'})],'2026-01-01');assert.equal(s[0].yield,null);assert.equal(s[1].yield,20)});
test('quote parser preserves provider timestamp, prices and source',()=>{const fields=Array(40).fill('');fields[1]='测试股份';fields[2]='600000';fields[3]='12.34';fields[4]='12';fields[30]='20261103150000';fields[32]='2.83';const q=parseQuote(`v_sh600000="${fields.join('~')}";`,'sh600000');assert.equal(q.price,12.34);assert.equal(q.date,'2026-11-03');assert.equal(q.time,'15:00:00');assert.throws(()=>parseQuote('bad','sh600000'))});
test('raw history is required: adjusted rows must not silently masquerade as raw',()=>{assert.throws(()=>parseHistory({code:0,data:{sh600000:{qfqday:[['2026-01-01',1,2]]}}},'sh600000'));assert.equal(parseHistory({code:0,data:{sh600000:{day:[['2026-01-01','10','11','12','9',1]]}}},'sh600000')[0].close,11)});
test('financial zero and negative profits are preserved and symbols reject injection',()=>{assert.equal(normalizeIncome([{REPORT_DATE:'2026-09-30',NOTICE_DATE:'2026-10-30',PARENT_NETPROFIT:0}])[0].profit,0);assert.equal(validSymbol('sh601318'),true);assert.equal(validSymbol('sh601318&url=x'),false);assert.equal(validSymbol('sh510300'),false)});
test('Sina fallback never invents fiscal years',()=>{const x=parseSinaDividends('<table id="sharebonus_1"><tr><td>2026-05-01</td><td>0</td><td>0</td><td>12</td><td>实施</td><td>2026-06-01</td><td>2026-05-31</td></tr></table>','2026-11-03');assert.equal(x[0].cashPerShare,1.2);assert.equal(x[0].reportDate,null)});
test('Sina fallback keeps its pending plan separate from implemented dividends',()=>{
 const html='<table id="sharebonus_1"><tr><td>2026-05-01</td><td>0</td><td>0</td><td>12</td><td>实施</td><td>2026-06-01</td><td>2026-05-31</td></tr><tr><td>2026-10-01</td><td>0</td><td>0</td><td>8</td><td>董事会预案</td><td>--</td><td>--</td></tr></table>';
 const events=parseSinaDividends(html,'2026-11-03'),plans=parseSinaDividendPlans(html,'2026-11-03');assert.equal(events.length,1);assert.equal(plans.length,1);assert.equal(plans[0].cashPerShare,.8);assert.equal(plans[0].reportDate,null);assert.equal(plans[0].included,false);assert.equal(ttmDividend(events,'2026-11-03'),1.2);
});
test('event study refuses to invent a win rate from small samples',()=>{const s=studyHighYieldWindows([],[]);assert.equal(s.count,0);assert.equal(s.averageReturn,null);assert.equal(s.winRate,null)});

function healthyFixture(){
 const prices=[];for(let t=Date.parse('2020-11-01');t<=Date.parse('2026-11-03');t+=86400000){const d=new Date(t);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)prices.push({date:d.toISOString().slice(0,10),open:49,close:50+6*Math.sin(prices.length/37),high:58,low:42,volume:100})}
 return {quote:{name:'测试股份',price:50,date:'2026-11-03'},prices,events:Array.from({length:7},(_,i)=>event(`${2020+i}-05-01`,2,{reportDate:`${2019+i}-12-31`})),income:[{reportDate:'2026-09-30',noticeDate:'2026-10-29',profit:100,profitGrowth:10,industry:'电力'}],rates:[{date:'2026-11-03',tenYear:1.6}],asOf:'2026-11-03'};
}
test('complete healthy input can form intervals without falsely blocking it',()=>{const a=analyze(healthyFixture());assert.deepEqual(a.blockers,[]);assert.ok(a.thresholds.buyPrice<a.thresholds.sellPrice);assert.ok(a.history.samples>500)});
test('non-positive profit overrides an otherwise calculable interval',()=>{const f=healthyFixture();f.income[0].profit=0;const a=analyze(f);assert.equal(a.status,'review');assert.ok(a.blockers.some(v=>v.includes('净利润非正')))});
test('large dividend cut suppresses ordinary buying',()=>{const f=healthyFixture();f.events.at(-1).cashPerShare=1;const a=analyze(f);assert.equal(a.status,'review');assert.ok(a.blockers.some(v=>v.includes('分红下降超过20%')))});
test('outdated quote and interest rate do not produce fresh action signals',()=>{const f=healthyFixture();f.asOf='2026-11-25';const a=analyze(f);assert.equal(a.status,'review');assert.ok(a.blockers.some(v=>v.includes('利率参照')));assert.ok(a.blockers.some(v=>v.includes('行情超过')))});
test('future-dated financial announcements are not used',()=>{const f=healthyFixture();f.income[0].noticeDate='2026-12-01';const a=analyze(f);assert.equal(a.financial,null);assert.equal(a.status,'review')});

const pinganEvents=[event('2022-10-20',.92,{reportDate:'2022-06-30'}),event('2023-06-14',1.5,{reportDate:'2022-12-31'}),event('2023-10-25',.93,{reportDate:'2023-06-30'}),event('2024-07-26',1.5,{reportDate:'2023-12-31'}),event('2024-10-18',.93,{reportDate:'2024-06-30'}),event('2025-06-30',1.62,{reportDate:'2024-12-31'}),event('2025-10-24',.95,{reportDate:'2025-06-30'}),event('2026-06-10',1.75,{reportDate:'2025-12-31'}),event('2026-09-10',.98,{reportDate:'2026-06-30'})];
test('a payment anniversary affects actual TTM only, not the period reference',()=>{
 const p=[{date:'2024-06-13',close:41.4},{date:'2024-06-14',close:41.3}];const s=buildSeries(p,pinganEvents,'2024-06-14');
 assert.equal(s[0].dividend,2.43);assert.equal(s[1].dividend,2.43);assert.equal(s[1].ttmDividend,.93);assert.equal(s[0].fiscalDividend,2.42);assert.equal(s[1].fiscalDividend,2.42);assert.ok(s[1].ttmYield<2.3);assert.ok(s[1].fiscalYield>5.8);
});
test('TTM keeps both actual payments when dates overlap; fiscal comparison remains separate',()=>{
 assert.equal(fiscalDividend(pinganEvents,'2026-06-10').cashPerShare,2.7);
 assert.equal(Number(ttmDividend(pinganEvents,'2026-06-10').toFixed(2)),4.32);
 assert.equal(fiscalDividend(pinganEvents,'2026-11-03').cashPerShare,2.7);
 assert.equal(Number(ttmDividend(pinganEvents,'2026-11-03').toFixed(2)),2.73);
});
test('new interim payment cannot replace a complete annual reference',()=>{assert.equal(fiscalDividend(pinganEvents,'2026-09-11').year,'2025');assert.equal(fiscalDividend(pinganEvents,'2026-09-11').cashPerShare,2.7)});
test('new annual dividend changes basis only after implementation, never backfilled',()=>{assert.equal(fiscalDividend(pinganEvents,'2026-06-09').year,'2024');assert.equal(fiscalDividend(pinganEvents,'2026-06-09').cashPerShare,2.55);assert.equal(fiscalDividend(pinganEvents,'2026-06-10').year,'2025')});
test('fiscal cash normalizes share actions and refuses undated fiscal records',()=>{assert.equal(fiscalDividend([event('2025-06-01',2,{reportDate:'2024-12-31',shareFactor:2})],'2026-01-01').cashPerShare,1);assert.equal(fiscalDividend([event('2025-06-01',2,{reportDate:null})],'2026-01-01').cashPerShare,null)});

test('five profiles progressively widen the eligible buy range under historical and rate-dominated conditions',()=>{
 assert.deepEqual(RISK_PROFILES.map(p=>p.id),['cautious','moderate','balanced','growth','aggressive']);
 for(const [values,rate] of [[Array.from({length:101},(_,i)=>2+i*.06),1.6],[[2,2.1,2.2,2.3],3]]){
  const bands=RISK_PROFILES.map(p=>thresholdsFrom(values,rate,2.2+p.premiumDelta,p.id));
  for(let i=0;i<bands.length;i++){
   const b=bands[i];assert.ok(b.buyYield>=b.rateFloor);assert.ok(b.sellYield<b.buyYield);assert.equal(b.buyPercentile,RISK_PROFILES[i].buyQuantile*100);
   if(i){assert.ok(b.buyYield<bands[i-1].buyYield);assert.ok(priceAtYield(2.7,b.buyYield)>priceAtYield(2.7,bands[i-1].buyYield))}
  }
 }
 assert.equal(riskProfile('unknown').id,'balanced');assert.equal(riskProfile('moderate').label,'偏稳健');assert.equal(riskProfile('aggressive').label,'激进');
});
test('profile changes are applied end to end and aggressive cannot bypass earnings or source-conflict checks',()=>{
 const fixture=healthyFixture(),results=RISK_PROFILES.map(p=>analyze({...fixture,risk:p.id}));
 assert.equal(results[1].risk.id,'moderate');assert.equal(results[4].thresholds.buyPercentile,50);assert.ok(results[4].thresholds.buyYield<results[0].thresholds.buyYield);
 for(const p of RISK_PROFILES){
  const a=analyze({...fixture,risk:p.id,income:[{...fixture.income[0],profit:0}],dataChecks:[{section:'分红',blocking:true,message:'金额冲突'}]});
  assert.equal(a.status,'review');assert.ok(a.blockers.some(s=>s.includes('净利润非正')));assert.ok(a.blockers.some(s=>s.includes('来源冲突')));
 }
});

test('very high yields remain buy signals when other checks pass, but earnings and source conflicts retain priority',()=>{
 const f=healthyFixture();f.quote.price=1;const a=analyze(f);assert.equal(a.status,'buy');assert.ok(a.yield>a.thresholds.buyYield*10);
 f.income[0].profitGrowth=-40;assert.equal(analyze(f).status,'review');
 f.income[0].profitGrowth=10;assert.equal(analyze({...f,dataChecks:[{section:'行情',blocking:true,message:'价格冲突'}]}).status,'review');
});
test('ten-year chart data is separate from the three-year threshold training window and never backfills future dividends',()=>{
 const f=healthyFixture();f.prices=[];for(let t=Date.parse('2014-01-01');t<=Date.parse(f.asOf);t+=86400000){const d=new Date(t);if(d.getUTCDay()%6)f.prices.push({date:d.toISOString().slice(0,10),open:50,close:50,high:51,low:49,volume:100})}
 f.events=Array.from({length:13},(_,i)=>event(`${2014+i}-05-01`,2,{reportDate:`${2013+i}-12-31`}));
 const a=analyze(f);assert.equal(a.series[0].date,'2016-11-03');assert.ok(a.series.length>2400);assert.ok(a.history.samples<800);assert.ok(a.history.start>='2023-11-03');assert.ok(a.series.every(p=>p.date<=a.asOf));
});

test('twelve calendar months clamp leap anniversaries and differ correctly from a fixed 365-day shortcut',()=>{
 assert.equal(shiftYears('2024-02-29',-1),'2023-02-28');
 const b=rollingDividendBasis([event('2023-02-28',10),event('2023-03-01',2),event('2024-02-29',1),event('2024-03-01',99)],'2024-02-29');
 assert.equal(b.startExclusive,'2023-02-28');assert.equal(b.cashPerShare,3);assert.equal(b.components.length,2);
});
test('pending plans, future implementations and cancelled revisions are separate and can never enter normalized cash',()=>{
 const row=(report,progress,ex,notice='2026-08-01')=>({REPORT_DATE:report,ASSIGN_PROGRESS:progress,EX_DIVIDEND_DATE:ex,NOTICE_DATE:notice,PRETAX_BONUS_RMB:10,IMPL_PLAN_PROFILE:'10派10元'});
 const rows=[row('2025-12-31','实施分配','2026-06-01'),row('2026-06-30','董事会预案',null),row('2026-09-30','实施分配','2026-12-01'),row('2026-03-31','尚未实施','2026-09-01'),row('2024-12-31','董事会预案',null),row('2024-12-31','取消分配',null,'2026-09-01'),row('2027-03-31','董事会预案',null,'2027-01-01')];
 const events=normalizeDividends(rows,'2026-11-03'),plans=normalizeDividendPlans(rows,'2026-11-03');assert.equal(events.length,1);assert.equal(plans.length,3);assert.ok(plans.every(p=>p.included===false));assert.ok(!plans.some(p=>p.reportDate==='2024-12-31'));assert.equal(ttmDividend(events,'2026-11-03'),1);
});
test('basis contributions reconcile ordinary and special amounts and adjust only through known share actions',()=>{
 const es=[event('2026-01-01',2),event('2026-03-01',4,{special:true}),event('2026-06-01',0,{shareFactor:2}),event('2026-12-01',0,{shareFactor:3})];
 const b=rollingDividendBasis(es,'2026-11-03');assert.equal(b.cashPerShare,1);assert.equal(b.specialCashPerShare,2);assert.equal(b.totalCashPerShare,3);assert.equal(b.components.filter(x=>x.included).length,1);assert.equal(b.components[0].shareFactor,2);assert.equal(b.components.reduce((n,x)=>n+x.adjustedCashPerShare,0),b.totalCashPerShare);
 const f=healthyFixture();f.events.push(event('2026-07-01',0,{shareFactor:2}));f.quote.price=25;const a=analyze(f);assert.equal(a.ordinaryDividend,1);assert.equal(a.dividendGrowth,0);assert.ok(!a.blockers.some(x=>x.includes('分红下降')));
});
test('Hengdian regression: number, percentile, thresholds, inverted prices and history all use the period-replacement reference',()=>{
 const f=healthyFixture();f.events=f.events.filter(e=>e.exDate<'2025-01-01').concat([event('2025-05-30',.45219,{reportDate:'2024-12-31'}),event('2025-09-30',.38,{reportDate:'2025-06-30'}),event('2026-06-18',.6,{reportDate:'2025-12-31'}),event('2026-10-12',.2299934,{reportDate:'2026-06-30'})]);f.quote={...f.quote,name:'横店东磁',price:17.08};
 const a=analyze(f);assert.equal(a.version,'dividend-period-3.0.0');assert.equal(a.ordinaryDividend,.8299934);assert.equal(a.yield,4.8594);assert.equal(a.fiscalReference.ordinaryDividend,.98);assert.equal(a.fiscalReference.yield,5.7377);assert.equal(a.basis.components.length,2);
 assert.equal(a.thresholds.buyPrice,priceAtYield(.8299934,a.thresholds.buyYield));assert.equal(a.thresholds.sellPrice,priceAtYield(.8299934,a.thresholds.sellYield));
 const samples=a.series.filter(p=>p.date>=a.history.start).map(p=>p.yield).filter(Number.isFinite);
 assert.deepEqual(a.thresholds.quantiles,thresholdsFrom(samples,a.rate.tenYear,a.thresholds.premium).quantiles);assert.equal(a.history.percentile,Number((samples.filter(v=>v<=.8299934/17.08*100).length/samples.length*100).toFixed(1)));
 assert.equal(a.history.basisId,a.basis.id);assert.equal(a.thresholds.basisId,a.basis.id);assert.equal(a.study.basisId,a.basis.id);assert.equal(a.series.at(-1).dividend,.8299934);
});
test('special cash does not raise primary yield, prices or buy thresholds, and missing period metadata pauses the reference but preserves actual TTM',()=>{
 const f=healthyFixture(),base=analyze(f);f.events.push(event('2026-08-01',20,{special:true}));const special=analyze(f);
 assert.equal(special.yield,base.yield);assert.deepEqual(special.thresholds,base.thresholds);assert.equal(special.specialDividend,20);assert.ok(special.totalYield>special.yield);assert.ok(special.actualBasis.components.some(c=>c.special&&!c.included));
 const unknownFiscal=analyze({...f,events:f.events.map(e=>({...e,reportDate:null}))});assert.equal(unknownFiscal.fiscalReference.year,null);assert.equal(unknownFiscal.status,'review');assert.equal(unknownFiscal.yield,null);assert.equal(unknownFiscal.ttmYield,base.ttmYield);
});
test('known zero rolling dividends remain zero observations instead of disappearing from the history distribution',()=>{
 const s=buildSeries([{date:'2025-04-01',close:10},{date:'2025-06-01',close:10},{date:'2026-06-02',close:10}],[event('2025-05-01',1)],'2026-06-02');assert.equal(s[0].yield,null);assert.equal(s[1].ttmYield,10);assert.equal(s[2].ttmYield,0);assert.equal(s[1].yield,null);
});
