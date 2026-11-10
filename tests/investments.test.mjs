import test from 'node:test';import assert from 'node:assert/strict';
import '../public/investment-state.js';const I=globalThis.XijianInvestments;
const t=(id,kind,quantity,price,extra={})=>({id,symbol:'sh601318',name:'中国平安',kind,quantity,price,at:'2026-11-01T10:00',fee:0,...extra});
test('groups overlap, all stocks remain separate, and deleting a group never removes a position or selection',()=>{
 let s=I.group(I.empty(),{name:'消费',symbols:['sh601318']});s=I.group(s,{name:'央企',symbols:['sh601318']});assert.equal(s.groups.length,2);assert.ok(s.groups.every(g=>g.symbols.includes('sh601318')));
 s=I.stockOptions(s,'sh601318',s.groups.map(g=>g.id),true);assert.deepEqual(s.featured,['sh601318']);s=I.putTrade(s,t('a','opening',100,40));
 const reduced=I.removeGroup(s,s.groups[0].id);assert.equal(reduced.groups.length,1);assert.deepEqual(reduced.featured,['sh601318']);assert.equal(I.project(reduced.ledger).positions.sh601318.quantity,100);
 assert.throws(()=>I.group(s,{name:'央企'}),/重复/);assert.throws(()=>I.group(s,{name:' '}),/名称/);
 const removed=I.removeWatch(s,'sh601318');assert.deepEqual(removed.featured,[]);assert.ok(removed.groups.every(g=>g.symbols.length===0));assert.equal(removed.ledger.length,1);
});
test('weighted cost includes buy fees, partial sales retain unit cost and realize only sold shares',()=>{
 const p=I.project([t('a','opening',100,10),t('b','buy',100,20,{fee:10}),t('c','sell',50,30,{fee:5})]).positions.sh601318;
 assert.equal(p.quantity,150);assert.equal(p.averageCost,15.05);assert.equal(p.cost,2257.5);assert.equal(p.realized,742.5);assert.equal(p.fees,15);
 const q=I.project([t('a','buy',100,10),t('b','sell',100,9)]).positions.sh601318;assert.equal(q.quantity,0);assert.equal(q.cost,0);assert.equal(q.realized,-100);
});
test('chronological replay rejects backdated oversells, invalid opening records, negative fees and future records',()=>{
 assert.throws(()=>I.project([t('a','opening',100,10),t('b','sell',101,20)]),/超过/);
 assert.throws(()=>I.project([t('a','buy',100,10,{at:'2026-11-02T10:00'}),t('b','sell',50,20)]),/超过/);
 assert.throws(()=>I.project([t('a','buy',100,10),t('b','opening',100,20)]),/首条/);
 for(const r of [t('a','buy',.5,20),t('a','buy',10,0),t('a','sell',10,2,{fee:30}),t('a','buy',10,20,{fee:-1}),t('a','buy',10,20,{at:'2099-01-01T10:00'}),t('a','buy',10,20,{at:'2026-02-30T10:00'})])assert.throws(()=>I.project([r]));
});
test('editing and reversible cancellations replay later trades before committing and keep original state intact',()=>{
 let s=I.putTrade(I.empty(),t('a','opening',100,10));s=I.putTrade(s,t('b','sell',60,20));
 assert.throws(()=>I.voidTrade(s,'a'),/超过/);assert.throws(()=>I.putTrade(s,t('a','opening',50,10)),/超过/);assert.equal(s.ledger[0].quantity,100);
 s=I.voidTrade(s,'b');assert.equal(I.project(s.ledger).positions.sh601318.quantity,100);s=I.voidTrade(s,'b',false);assert.equal(I.project(s.ledger).positions.sh601318.quantity,40);
 s=I.putTrade(s,t('c','adjust',80,5));assert.equal(I.project(s.ledger).positions.sh601318.cost,400);assert.equal(I.project(s.ledger).positions.sh601318.realized,600);
});
test('imports validate the entire ledger and preserve v1 marks as pending without inventing quantities',()=>{
 const v1=I.importBackup({version:1,watch:[{symbol:'sh601318',name:'中国平安'}],holdings:{sh601318:true}});assert.deepEqual(v1.workspace.pending,['sh601318']);assert.equal(v1.workspace.ledger.length,0);assert.deepEqual(v1.workspace.featured,[]);
 const s=I.putTrade({...v1.workspace},t('a','opening',200,40));assert.equal(s.pending.length,0);const restored=I.importBackup({version:2,watch:v1.watch,workspace:s});assert.equal(I.project(restored.workspace.ledger).positions.sh601318.quantity,200);
 assert.throws(()=>I.importBackup({version:2,watch:v1.watch,workspace:{...s,ledger:[...s.ledger,t('b','sell',201,50)]}}),/超过/);
});
test('trade-advice function is absent; receipts are actual amounts and do not change position cost',()=>{
 assert.equal(I.signal,undefined);let w=I.putTrade(I.empty(),{id:'opening',symbol:'sh601318',name:'平安',kind:'opening',at:'2025-01-01T12:00',quantity:100,price:50,fee:0});
 w=I.putReceipt(w,{id:'r1',symbol:'sh601318',date:'2025-07-01',amount:123.45});assert.equal(I.receiptTotal(w),123.45);assert.equal(I.project(w.ledger).positions.sh601318.cost,5000);
 w=I.putReceipt(w,{...w.receipts[0],amount:200});assert.equal(I.receiptTotal(w),200);w=I.voidReceipt(w,'r1');assert.equal(I.receiptTotal(w),0);w=I.voidReceipt(w,'r1',false);assert.equal(I.receiptTotal(w),200);
 assert.throws(()=>I.putReceipt(w,{id:'r2',symbol:'sh601318',date:'2099-01-01',amount:10}),/未来/);assert.throws(()=>I.putReceipt(w,{id:'r2',symbol:'sh601318',date:'2025-01-01',amount:.001}),/两位/);
 const imported=I.importBackup({version:3,watch:[],workspace:w});assert.equal(imported.workspace.receipts.length,1);
});
