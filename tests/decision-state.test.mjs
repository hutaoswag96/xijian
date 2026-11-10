import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(fs.readFileSync('public/decision-state.js','utf8'),context);const describe=context.XijianDecision.describe;
test('Conch earnings pause explains actual cumulative decline, no manual approval, and exact automatic recovery criteria',()=>{
 const d=describe({status:'review',blockers:['最新披露归母净利润同比下降超过30%'],financial:{reportDate:'2026-09-30',profit:2742644048,profitGrowth:-56.89}});
 assert.equal(d.kind,'earnings');assert.equal(d.label,'盈利风险');assert.match(d.summary,/2026年前三季度.*56.89%/);assert.match(d.action,/无需人工/);assert.match(d.resume,/不超过30%/);assert.match(d.resume,/其他检查通过/);assert.match(d.resume,/激进档不会解除/);
});
test('data conflicts are not described as earnings risk or recovered by waiting only for earnings',()=>{
 const d=describe({status:'review',blockers:['财务来源冲突：数值不同','最新披露归母净利润同比下降超过30%'],financial:{profitGrowth:-56.89}});
 assert.equal(d.kind,'data');assert.equal(d.label,'数据待核对');assert.match(d.resume,/来源核对一致/);
});
test('non-positive profit and dividend cuts stay paused while high yield alone requires no manual review',()=>{
 assert.equal(describe({status:'review',blockers:['最新披露归母净利润非正，暂停普通买入规则'],financial:{reportDate:'2026-09-30',profit:0}}).kind,'earnings');
 assert.equal(describe({status:'review',blockers:['滚动12个月普通分红下降超过20%'],dividendGrowth:-25}).label,'分红风险');
 assert.equal(describe({status:'buy',blockers:[],yield:90,thresholds:{buyYield:5,sellYield:3}}),null);
 assert.equal(describe({status:'buy',blockers:[]}),null);assert.equal(describe({status:'hold',blockers:[]}),null);
});
