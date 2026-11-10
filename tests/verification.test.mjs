import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSources,compareQuotes,compareHistory,compareDividends,compareFinance,compareRates} from '../lib/market/verification.mjs';
import {parseSinaQuote,parseEmHistory,parseSinaIncome,parseChinaBond,normalizeIncome,quote as fetchQuote} from '../lib/market/providers.mjs';
import {analyze} from '../lib/market/engine.mjs';

const quote=(source='A',extra={})=>({source,price:54.59,previousClose:54.59,date:'2026-11-03',time:'15:00:00',timestamp:'2026-11-03T15:00:00+08:00',...extra});
test('a failed primary automatically falls back and cannot claim cross-verification',async()=>{
 const r=await resolveSources([{name:'A',load:async()=>{throw Error('offline')}},{name:'B',load:async()=>quote('B')}],compareQuotes);
 assert.equal(r.source,'B');assert.equal(r.fallback,true);assert.equal(r.verification.status,'limited');assert.equal(r.verification.attempts[0].status,'error');
 await assert.rejects(resolveSources([{name:'A',load:async()=>{throw Error('bad')}}],compareQuotes),/bad/);
});
test('newer quote wins but dates and delay are never falsely verified',async()=>{
 const r=await resolveSources([{name:'A',load:async()=>quote('A')},{name:'B',load:async()=>quote('B',{date:'2026-11-04',timestamp:'2026-11-04T09:31:00+08:00'})}],compareQuotes,{choose:v=>v[1]});
 assert.equal(r.date,'2026-11-04');assert.equal(r.verification.status,'limited');
 assert.equal(compareQuotes(quote(),quote('B',{timestamp:'2026-11-03T14:00:00+08:00'})).status,'limited');
 assert.equal(compareQuotes(quote(),quote('B',{price:50})).blocking,true);
 assert.equal(compareQuotes(quote(),quote('B')).status,'verified');
});
test('history uses common finished closes, ignores unfinished intraday changes and detects corrupted days',()=>{
 const data=Array.from({length:25},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,close:50}));
 const a={source:'A',data},b={source:'B',data:structuredClone(data)};
 b.data.at(-1).close=55;assert.equal(compareHistory(a,b,'2026-10-25').status,'verified');
 b.data[4].close=5;assert.equal(compareHistory(a,b,'2026-10-25').blocking,true);
});
test('pre-window warm-up rows do not invalidate the verified ten-year display and recent strategy inputs',()=>{
 const recent=Array.from({length:25},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,close:50}));
 const a={source:'A',data:[{date:'2016-01-04',close:34.02},...recent]},b={source:'B',data:[{date:'2016-01-04',close:34.05},...structuredClone(recent)]};
 assert.equal(compareHistory(a,b,'2026-11-04').status,'verified');b.data[5].close=5;assert.equal(compareHistory(a,b,'2026-11-04').blocking,true);
});
test('dividend verification catches amount and missing events without inventing a fiscal year',()=>{
 const e={exDate:'2026-06-10',cashPerShare:1.75,shareFactor:1};
 const a={source:'A',data:[{...e,reportDate:'2025-12-31'}]},b={source:'B',data:[e]};
 assert.equal(compareDividends(a,b,'2026-11-03').status,'verified');
 assert.equal(compareDividends(a,{...b,data:[{...e,cashPerShare:17.5}]},'2026-11-03').blocking,true);
 assert.equal(compareDividends(a,{...b,data:[]},'2026-11-03').blocking,true);
});
test('finance compares the same report period and rates compare common dates',()=>{
 const a={data:[{reportDate:'2026-09-30',revenue:100e8,profit:10e8,profitGrowth:10}]};
 assert.equal(compareFinance(a,a).status,'verified');
 assert.equal(compareFinance(a,{data:[{...a.data[0],reportDate:'2026-06-30'}]}).status,'limited');
 assert.equal(compareFinance(a,{data:[{...a.data[0],profit:9e8}]}).blocking,true);
 assert.equal(compareRates({data:[{date:'2026-11-03',tenYear:1.621}]},{data:[{date:'2026-11-03',tenYear:1.621}]}).status,'verified');
 assert.equal(compareRates({data:[{date:'2026-11-03',tenYear:1.621}]},{data:[{date:'2026-11-03',tenYear:3.6}]}).blocking,true);
});
test('source conflict suppresses model action and is exposed as the reason',()=>{
 const a=analyze({dataChecks:[{section:'分红',blocking:true,status:'conflict',message:'金额不一致'}]});
 assert.equal(a.status,'review');assert.match(a.reason,/分红来源冲突/);
});
test('alternate quote and raw daily parser preserve units and reject malformed prices',()=>{
 const f=Array(33).fill('0');Object.assign(f,{0:'测试',1:'54',2:'54.59',3:'54.49',4:'55',5:'53',8:'10000',30:'2026-11-04',31:'09:53:27'});
 const q=parseSinaQuote(`var hq_str_sh601318="${f.join(',')}";`,'sh601318');assert.equal(q.price,54.49);assert.equal(q.volume,100);assert.equal(q.date,'2026-11-04');
 assert.throws(()=>parseSinaQuote('bad','sh601318'));
 assert.equal(parseEmHistory({rc:0,data:{klines:['2026-11-03,54,54.59,55,53,100']}})[0].close,54.59);
 assert.throws(()=>parseEmHistory({rc:0,data:null}));
});
test('real quote provider queries only the requested stock and recovers from a primary HTTP failure',async()=>{
 const original=globalThis.fetch,urls=[],symbol='sh600099';
 const f=Array(33).fill('0');Object.assign(f,{0:'测试',2:'10',3:'10.5',30:'2026-11-04',31:'10:00:00'});
 globalThis.fetch=async url=>{urls.push(url);return String(url).includes('gtimg')?new Response('',{status:503}):new Response(`var hq_str_${symbol}="${f.join(',')}";`)};
 try{const r=await fetchQuote(symbol);assert.equal(r.source,'新浪财经');assert.equal(r.price,10.5);assert.equal(r.fallback,true);assert.equal(r.verification.status,'limited');assert.equal(urls.length,2);assert.ok(urls.every(u=>u.includes(symbol)))}finally{globalThis.fetch=original}
});
test('Sina financial parser uses parent profit, not total net profit, and converts YoY fractions',()=>{
 const r={rCurrency:'CNY',rType:'合并期末',publish_date:'20261029',data:[{item_field:'BIZINCO',item_value:'728134000000',item_tongbi:-.12583},{item_field:'NETPROFIT',item_value:'118567000000'},{item_field:'NETPARESHARPROF',item_value:'96645000000',item_tongbi:-.27256}]};
 const j={result:{data:{report_list:{20260930:r}}}};const data=parseSinaIncome(j,'2026-11-04');assert.equal(data[0].profit,96645000000);assert.ok(Math.abs(data[0].profitGrowth+27.256)<.00001);assert.equal(data[0].noticeDate,'2026-10-29');
 assert.throws(()=>parseSinaIncome(j,'2026-10-28'));assert.throws(()=>parseSinaIncome({result:{data:{report_list:{20260930:{...r,rCurrency:'USD'}}}}}));
});
test('ChinaBond parser excludes HTML comments to avoid wrong tenor offsets',()=>{
 const html='<input id="gzr" value="2026-11-03"><div id="gjqxData"><table><tr><td>中债国债收益率曲线</td><!--<td>99</td>-->'+[1.16,1.17,1.17,1.24,1.33,1.43,1.621,2.05].map(v=>`<td>${v}</td>`).join('')+'</tr></table></div>';
 const r=parseChinaBond(html);assert.equal(r[0].tenYear,1.621);assert.equal(r[0].fiveYear,1.33);assert.throws(()=>parseChinaBond(html.replace('1.621','--')));
});
test('Yili regression: total revenue must be compared to total revenue, not its operating-revenue child',()=>{
 const data=[{item_field:'BIZINCO',item_title:'营业收入',item_value:'93581518865.47'},
  {item_field:'BIZTOTINCO',item_title:'营业总收入',item_value:'93813317667.45'},
  {item_field:'INTEINCO',item_title:'利息收入',item_value:'231798801.98'},
  {item_field:'PARENETP',item_title:'归属于母公司所有者的净利润',item_value:'8803770151.52',item_tongbi:-.1556}];
 const sina=parseSinaIncome({result:{data:{report_list:{20260930:{rCurrency:'CNY',rType:'合并期末',publish_date:'20261030',data}}}}},'2026-11-04');
 const em=normalizeIncome([{REPORT_DATE:'2026-09-30',NOTICE_DATE:'2026-10-30',TOTAL_OPERATE_INCOME:93813317667.45,PARENT_NETPROFIT:8803770151.52,PARENT_NETPROFIT_RATIO:-15.56}]);
 assert.equal(sina[0].revenue,93813317667.45);assert.equal(sina[0].revenueKind,'total');
 const check=compareFinance({source:'东方财富',data:em},{source:'新浪',data:sina});assert.equal(check.status,'verified');assert.equal(check.comparisons[0].basisA,'营业总收入');assert.equal(check.comparisons[0].basisB,'营业总收入');
 const byTitle=data.map(r=>r.item_field==='BIZTOTINCO'?{...r,item_field:'new-field-name'}:r);
 assert.equal(parseSinaIncome({result:{data:{report_list:{20260930:{rCurrency:'CNY',rType:'合并期末',publish_date:'20261030',data:byTitle}}}}},'2026-11-04')[0].revenue,93813317667.45);
});
test('comparison identifies the exact differing metric, preserves missing values and separates incompatible revenue bases',()=>{
 const a={source:'A',data:[{reportDate:'2026-09-30',revenue:100e8,revenueKind:'total',revenueLabel:'营业总收入',profit:10e8}]};
 const b={source:'B',data:[{reportDate:'2026-09-30',revenue:99e8,revenueKind:'operating',revenueLabel:'营业收入',profit:10e8}]};
 const c=compareFinance(a,b);assert.equal(c.status,'limited');assert.equal(c.comparisons[0].status,'basis');
 b.data[0].profit=9e8;const bad=compareFinance(a,b);assert.equal(bad.blocking,true);assert.match(bad.message,/归母净利润/);assert.ok(!bad.message.includes('营收、'));assert.equal(bad.comparisons[1].valueB,9e8);
 b.data[0].profit=null;assert.equal(compareFinance(a,b).comparisons[1].status,'missing');
 assert.equal(normalizeIncome([{REPORT_DATE:'2026-09-30',NOTICE_DATE:'2026-10-30',TOTAL_OPERATE_INCOME:0,OPERATE_INCOME:100}])[0].revenue,0);
});
