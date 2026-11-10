import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/auto-data.js';
const create=globalThis.XijianAuto.createLoader;

test('empty-cache startup requests only selected symbols and populates them automatically',async()=>{
 const watch=['sh601318','sz000001'],received=new Map(),calls=[];
 const loader=create({getWatch:()=>watch,load:async s=>{calls.push(s);received.set(s,{price:10});return true}});
 await loader.refresh();assert.deepEqual(calls.sort(),[...watch].sort());assert.equal(received.size,2);
 assert.equal(await loader.enqueue('sh600000'),false);assert.equal(calls.length,2);
});
test('initial failure and partial data retry automatically until complete',async()=>{
 let attempts=0;const waits=[];
 const loader=create({getWatch:()=>['sh601318'],load:async()=>{attempts++;if(attempts===1)throw new Error('network');return attempts>=3},wait:async ms=>{waits.push(ms)}});
 assert.equal(await loader.enqueue('sh601318'),true);assert.equal(attempts,3);assert.deepEqual(waits,[1500,4000]);
});
test('overlapping startup, foreground and manual requests deduplicate in the browser',async()=>{
 let done,calls=0;const loader=create({getWatch:()=>['sh601318'],load:async()=>{calls++;await new Promise(r=>{done=r});return true}});
 const a=loader.enqueue('sh601318'),b=loader.enqueue('sh601318');assert.equal(a,b);assert.equal(calls,1);done();assert.equal(await a,true);assert.equal(loader.size,0);
});
test('newly added symbol starts fetching even while another refresh is running',async()=>{
 const watch=['sh601318'];const releases={},started=[];
 const loader=create({getWatch:()=>watch,concurrency:2,load:async s=>{started.push(s);await new Promise(r=>{releases[s]=r});return true}});
 const first=loader.refresh();watch.push('sz000001');const added=loader.enqueue('sz000001');assert.deepEqual(started,watch);releases.sz000001();assert.equal(await added,true);releases.sh601318();await first;
});
test('removed queued symbols are not queried; failures release the queue for a later automatic pass',async()=>{
 const watch=['sh601318','sz000001'],calls=[];let release;
 const loader=create({getWatch:()=>watch,concurrency:1,retryDelays:[],load:async s=>{calls.push(s);if(s==='sh601318')await new Promise(r=>{release=r});return false}});
 const a=loader.refresh();watch.pop();release();await a;assert.deepEqual(calls,['sh601318']);assert.equal(loader.size,0);
 const b=loader.enqueue('sh601318');release();assert.equal(await b,false);assert.equal(calls.length,2);
});
