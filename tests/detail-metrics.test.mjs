import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeValuations,buildPayoutTimeline,detailMetrics} from '../lib/market/detail-metrics.mjs';
import {chinaDate} from '../lib/market/engine.mjs';
const fixture=()=>({asOf:'2026-11-05',profile:{SECURITY_CODE:'002056',STR_CODEH:null,STR_CODEB:null},cash:[{STATISTICS_YEAR:'2025',TOTAL_DIVIDEND:1569309766.08}],financials:[{REPORT_DATE:'2025-12-31',NOTICE_DATE:'2026-03-28',PARENTNETPROFIT:1851179500,CURRENCY:'CNY'}],events:[{reportDate:'2025-06-30',exDate:'2025-09-30',announcementDate:'2025-09-24'},{reportDate:'2025-12-31',exDate:'2026-06-18',announcementDate:'2026-06-11'}],plans:[]});
test('valuation rows preserve dates and units, reject other symbols and future rows, and distinguish missing from zero',()=>{
 const rows=[{SECURITY_CODE:'002056',TRADE_DATE:'2026-11-04',PE_TTM:16.04640525,PB_MRQ:2.61298244},{SECURITY_CODE:'002056',TRADE_DATE:'2026-11-03',PE_TTM:-3,PB_MRQ:null},{SECURITY_CODE:'002056',TRADE_DATE:'2026-11-06',PE_TTM:1,PB_MRQ:1},{SECURITY_CODE:'601318',TRADE_DATE:'2026-11-04',PE_TTM:2,PB_MRQ:2}];
 const values=normalizeValuations(rows,'002056','2026-11-05');assert.equal(values.length,2);assert.equal(values[1].pe,16.04640525);assert.equal(values[1].pb,2.61298244);assert.equal(values[0].pe,null);assert.match(values[0].peReason,/亏损/);assert.equal(values[0].pb,null);
});
test('payout uses the disclosed cash total including eligible-share exclusions, and becomes known only after implementation',()=>{
 const f=fixture(),r=buildPayoutTimeline(f);assert.equal(r.timeline.length,1);assert.equal(r.timeline[0].effectiveDate,'2026-06-18');assert.equal(r.timeline[0].payout,84.7735);assert.equal(r.timeline[0].cashAmount,1569309766.08);
 assert.equal(buildPayoutTimeline({...f,asOf:'2026-06-17'}).timeline.length,0);
 assert.equal(buildPayoutTimeline({...f,financials:[{...f.financials[0],NOTICE_DATE:'2026-07-01'}]}).timeline[0].effectiveDate,'2026-07-01');
});
test('A/H and A/B dividend-scope mismatches stay missing instead of understating the company-wide payout',()=>{
 for(const profile of [{STR_CODEH:'02318.HK'},{STR_CODEB:'900000'},null]){const r=buildPayoutTimeline({...fixture(),profile});assert.equal(r.timeline.length,0);assert.match(r.reason,/口径待核对/)}
});
test('pending years, missing final implementation, non-CNY profit and loss years cannot become normal payout points',()=>{
 const f=fixture();assert.equal(buildPayoutTimeline({...f,plans:[{reportDate:'2025-12-31'}]}).timeline.length,0);
 assert.equal(buildPayoutTimeline({...f,events:f.events.slice(0,1)}).timeline.length,0);
 assert.equal(buildPayoutTimeline({...f,financials:[{...f.financials[0],CURRENCY:'USD'}]}).timeline.length,0);
 const loss=buildPayoutTimeline({...f,financials:[{...f.financials[0],PARENTNETPROFIT:-1}]});assert.equal(loss.timeline[0].payout,null);assert.match(loss.timeline[0].reason,/非正/);
});
test('the optional provider uses valid date filters, loads every valuation page and queries only the selected stock',async()=>{
 const original=globalThis.fetch,urls=[],symbol='sh600098',code='600098',today=chinaDate(),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
 globalThis.fetch=async input=>{const url=new URL(input);urls.push(url.href);let body;
  if(url.searchParams.get('reportName')==='RPT_VALUEANALYSIS_DET'){
   assert.match(url.searchParams.get('filter'),/TRADE_DATE>='\d{4}-\d{2}-\d{2}'/);
   const page=Number(url.searchParams.get('pageNumber'));body={success:true,result:{pages:2,data:[{SECURITY_CODE:code,TRADE_DATE:page===1?today:yesterday,PE_TTM:10,PB_MRQ:1}]}};
  }else if(url.pathname.includes('CompanySurvey'))body={jbzl:[{SECURITY_CODE:code,STR_CODEH:null,STR_CODEB:null}]};
  else if(url.pathname.includes('BonusFinancing'))body={lnfhrz:[]};
  else if(url.hostname.includes('sina'))return new Response('<table id="sharebonus_1"></table>');
  else body={success:true,result:{data:[]}};
  return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
 };
 try{const d=await detailMetrics(symbol);assert.equal(d.valuations.length,2);assert.equal(d.latest.pe,10);assert.deepEqual(d.errors,[]);assert.equal(urls.filter(u=>u.includes('RPT_VALUEANALYSIS_DET')).length,2);assert.ok(urls.every(u=>decodeURIComponent(u).includes(code)))}finally{globalThis.fetch=original}
});

test('A/H reconstruction uses disclosed A cash and historical H shares, labels assumptions and matches Shenhua 2025 announcement',()=>{
 const f={...fixture(),profile:{STR_CODEH:'01088'},cash:[{STATISTICS_YEAR:'2025',TOTAL_DIVIDEND:35022528069.02}],financials:[{REPORT_DATE:'2025-12-31',NOTICE_DATE:'2026-03-28',PARENTNETPROFIT:52849000000,CURRENCY:'CNY'}],events:[{reportDate:'2025-06-30',exDate:'2025-11-10',announcementDate:'2025-11-01',cashPerShare:.98,shares:19868519955},{reportDate:'2025-12-31',exDate:'2026-07-13',announcementDate:'2026-07-01',cashPerShare:1.03,shares:21689434304}],capital:[{END_DATE:'2024-01-01',TOTAL_SHARES:19868519955,H_FREE_SHARE:3377482000},{END_DATE:'2026-04-01',TOTAL_SHARES:21689434304,H_FREE_SHARE:3377482000}]};
 const row=buildPayoutTimeline(f).timeline[0];assert.equal(row.estimated,true);assert.equal(row.cashAmount,41811266889.02);assert.equal(row.payout,79.1146);assert.match(row.scopeNote,/假设H股/);
 assert.equal(buildPayoutTimeline({...f,capital:f.capital.slice(1)}).timeline.length,0);
 assert.equal(buildPayoutTimeline({...f,capital:f.capital.map(c=>({...c,TOTAL_SHARES:c.TOTAL_SHARES+100}))}).timeline.length,0);
});
test('quarterly cumulative profit is never added; later revisions do not change which complete fiscal year is latest',()=>{
 const f=fixture();f.financials.push({...f.financials[0],REPORT_DATE:'2025-09-30',PARENTNETPROFIT:999999});
 assert.equal(buildPayoutTimeline(f).timeline[0].payout,84.7735);
});
