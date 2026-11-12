import test from 'node:test';import assert from 'node:assert/strict';
import {periodDividendBasis,rollingDividendBasis,buildSeries} from '../lib/market/engine.mjs';
const e=(reportDate,exDate,cashPerShare,extra={})=>({reportDate,exDate,announcementDate:exDate,cashPerShare,shareFactor:1,special:false,...extra});
const gree=[e('2022-06-30','2023-02-27',1),e('2022-12-31','2023-08-09',1),e('2023-12-31','2024-08-28',2.38),e('2024-06-30','2025-05-15',1),e('2024-12-31','2025-08-29',2),e('2025-09-30','2026-01-23',1),e('2025-12-31','2026-08-27',2)];
test('Gree: payment gaps and overlaps never create the zero, one-day dip or doubled annual payment in the reference',()=>{
 for(const date of ['2024-08-09','2024-08-27'])assert.equal(periodDividendBasis(gree,date).cashPerShare,2);
 assert.equal(rollingDividendBasis(gree,'2024-08-09').cashPerShare,0);
 assert.equal(periodDividendBasis(gree,'2025-08-28').cashPerShare,2.38);assert.equal(rollingDividendBasis(gree,'2025-08-28').cashPerShare,1);
 for(const date of ['2026-01-23','2026-02-13','2026-08-27','2026-08-28','2026-08-31'])assert.equal(periodDividendBasis(gree,date).cashPerShare,3);
 assert.equal(rollingDividendBasis(gree,'2026-02-13').cashPerShare,4);assert.equal(rollingDividendBasis(gree,'2026-08-27').cashPerShare,5);
 const [p]=buildSeries([{date:'2026-02-13',close:38.37}],gree,'2026-02-13');assert.equal(p.yield,7.8186);assert.equal(p.ttmYield,10.4248);
});
test('quarterly records replace only the corresponding year-to-date slots and preserve later baseline quarters',()=>{
 const es=[e('2024-03-31','2024-05-01',.1),e('2024-06-30','2024-08-01',.2),e('2024-09-30','2024-11-01',.3),e('2024-12-31','2025-03-01',.4),e('2025-03-31','2025-05-01',.15),e('2025-06-30','2025-08-01',.25)];
 assert.equal(periodDividendBasis(es,'2025-06-01').cashPerShare,1.05);assert.equal(periodDividendBasis(es,'2025-09-01').cashPerShare,1.1);
});
test('a real cut changes the basis immediately; future payments and special distributions never boost it',()=>{
 const es=[e('2024-06-30','2024-10-01',1),e('2024-12-31','2025-06-01',2),e('2025-06-30','2025-10-01',.5),e('2025-12-31','2026-06-01',1),e('2025-09-30','2025-11-01',20,{special:true})];
 assert.equal(periodDividendBasis(es,'2025-09-30').cashPerShare,3);assert.equal(periodDividendBasis(es,'2025-10-01').cashPerShare,2.5);assert.equal(periodDividendBasis(es,'2026-06-01').cashPerShare,1.5);
});
test('stale references, a missing intermediate year, and undated new periods cannot silently produce action',()=>{
 assert.ok(periodDividendBasis(gree,'2029-01-01').blockers.length>0);
 const es=[e('2023-12-31','2024-06-01',2),e('2025-06-30','2025-10-01',1)];assert.ok(periodDividendBasis(es,'2025-11-01').blockers.length>0);
 assert.ok(periodDividendBasis([e('2024-12-31','2025-06-01',2),e(null,'2025-10-01',1)],'2025-11-01').blockers.length>0);
});
test('share actions normalize retained and replaced reference amounts; historical basis cannot see later announcements',()=>{
 const es=[e('2024-06-30','2024-10-01',1),e('2024-12-31','2025-06-01',2),e('2025-06-30','2025-10-01',.5,{shareFactor:2})];
 assert.equal(periodDividendBasis(es,'2025-09-30').cashPerShare,3);assert.equal(periodDividendBasis(es,'2025-10-01').cashPerShare,1.25);
 const late=es.map(x=>({...x,announcementDate:'2026-01-01'}));assert.equal(periodDividendBasis(late,'2025-11-01').cashPerShare,null);
});

test('Shenhua: introducing interim payments cannot inflate last year to 3.24 and manufacture a 38% cut',async()=>{const {analyze}=await import('../lib/market/engine.mjs');const es=[e('2022-12-31','2023-07-05',2.55),e('2023-12-31','2024-07-08',2.26),e('2024-12-31','2025-07-07',2.26),e('2025-06-30','2025-11-10',.98),e('2025-12-31','2026-07-13',1.03),e('2026-06-30','2026-10-26',.98)];const prior=periodDividendBasis(es,'2025-11-11');assert.equal(prior.cashPerShare,2.26);assert.equal(prior.deferred.length,1);assert.equal(prior.components.length,1);const input={quote:{price:49,date:'2026-11-11',name:'中国神华'},events:es,asOf:'2026-11-11'};const a=analyze(input);assert.equal(a.ordinaryDividend,2.01);assert.equal(a.yield,4.102);assert.equal(a.dividendComparison.previousDividend,2.26);assert.equal(a.dividendGrowth,-11.1);assert.ok(!a.blockers.some(v=>v.includes('分红下降超过20%')));const cut=analyze({...input,events:es.map(v=>v.reportDate==='2026-06-30'?{...v,cashPerShare:.1}:v)});assert.ok(cut.blockers.some(v=>v.includes('分红下降超过20%')));assert.equal(periodDividendBasis(es,'2026-07-12').cashPerShare,2.26);assert.equal(periodDividendBasis(es,'2026-07-13').cashPerShare,2.01)});
