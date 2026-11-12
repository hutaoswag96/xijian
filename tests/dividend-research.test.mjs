import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('public/dividend-research.js','utf8'),ctx);const D=ctx.XijianDividend;
test('schemes directly show every payment, keep multiple payments, special dividends and proposals separate, and escape source text',()=>{
 const html=D.schemes({dividends:[{reportDate:'2025-06-30',exDate:'2025-10-01',cashPerShare:1},{reportDate:'2025-12-31',exDate:'2026-07-01',cashPerShare:2,special:true}],dividendPlans:[{reportDate:'2026-06-30',cashPerShare:1,progress:'<script>bad</script>'}]});
 assert.equal((html.match(/class="scheme-row"/g)||[]).length,3);assert.ok(!html.includes('<details'));assert.ok(html.includes('dividend-scheme-scroll'));assert.ok(html.includes('特别分红'));assert.ok(html.includes('10 派 20 元'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
test('annual cash and profit comparison shows losses without inventing a payout rate',()=>{
 const html=D.payoutChart([{year:'2024',profit:-2e8,cashAmount:1e8,payout:null},{year:'2025',profit:5e8,cashAmount:2e8,payout:40,estimated:true}]);
 assert.ok(html.includes('-2.00'));assert.ok(html.includes('测算'));assert.ok(!/NaN|Infinity/.test(html));assert.ok(html.includes('支付率留空'));assert.equal(D.payoutChart([]),'');
});

test('a century of dividends remains directly readable within one scrolling region, without per-year disclosure clicks',()=>{const dividends=Array.from({length:100},(_,i)=>({reportDate:(1926+i)+'-12-31',exDate:(1927+i)+'-06-01',cashPerShare:1}));const html=D.schemes({dividends});assert.equal((html.match(/class="scheme-row"/g)||[]).length,100);assert.ok(html.includes('1926-12-31'));assert.ok(html.includes('2025-12-31'));assert.ok(!html.includes('<details'));assert.ok(html.includes('tabindex="0"'));assert.ok(html.includes('约显示10条'))});
