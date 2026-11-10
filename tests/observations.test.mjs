import test from 'node:test';
import assert from 'node:assert/strict';
import {observe} from '../lib/market/observations.mjs';
import {handleMarketRequest} from '../lib/market/server.mjs';
const events=[{reportDate:'2024-12-31',exDate:'2025-06-01',announcementDate:'2025-05-01',cashPerShare:2,shareFactor:1},{reportDate:'2025-06-30',exDate:'2025-10-01',announcementDate:'2025-09-01',cashPerShare:.5,shareFactor:1}];
test('data response has reproducible dividend arithmetic and no advice, percentiles or performance forecasts',()=>{
 const a=observe({quote:{date:'2025-11-01',price:50},events,prices:[{date:'2025-05-01',close:40},{date:'2025-07-01',close:40},{date:'2025-11-01',close:50}],asOf:'2025-11-01'});
 assert.equal(a.yield,5);assert.equal(a.ordinaryDividend,2.5);assert.equal(a.series[0].yield,null);assert.equal(a.series[1].yield,5);
 for(const key of ['thresholds','status','risk','study','rate','blockers','reason'])assert.equal(a[key],undefined);assert.equal(a.history.percentile,undefined);
});
test('private stock endpoint returns isolated research and safe pauses when required data is unavailable',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('fixture offline')};try{const r=await handleMarketRequest(new Request('https://site.test/api/stock?symbol=sh600999&risk=aggressive'));const b=await r.json();assert.equal(b.sources.length,5);assert.equal(b.analysis.research.version,'personal-research-5.0');assert.equal(b.analysis.research.status,'review');assert.ok(b.analysis.research.blockers.length>0);assert.equal(b.analysis.thresholds,undefined);assert.equal(b.analysis.status,undefined);assert.equal(b.analysis.study,undefined);assert.equal(b.analysis.version,'dividend-data-4.0.0');assert.equal((await handleMarketRequest(new Request('https://site.test/api/rates'))).status,404)}finally{globalThis.fetch=original}
});
