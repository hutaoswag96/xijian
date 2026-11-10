'use strict';
// One bounded queue for the current watchlist. Retry partial reads, not market-wide scans.
globalThis.XijianAuto={createLoader({getWatch,load,onAttempt=()=>{},onSettled=()=>{},concurrency=3,retryDelays=[1500,4000],wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const pending=new Map(),queue=[];let active=0;
 const selected=s=>getWatch().includes(s);
 async function run(job){let success=false;try{
  for(let attempt=0;attempt<=retryDelays.length;attempt++){
   if(!selected(job.symbol))break;
   if(attempt)await wait(retryDelays[attempt-1]);
   if(!selected(job.symbol))break;
   try{onAttempt(job.symbol,attempt);success=await load(job.symbol)===true}catch{success=false}
   if(success)break;
  }
 }finally{active--;pending.delete(job.symbol);try{onSettled(job.symbol,success)}catch{}job.resolve(success);pump()}}
 function pump(){while(active<concurrency&&queue.length){const job=queue.shift();active++;void run(job)}}
 function enqueue(symbol){if(!selected(symbol))return Promise.resolve(false);if(pending.has(symbol))return pending.get(symbol);let resolve;const promise=new Promise(r=>{resolve=r});pending.set(symbol,promise);queue.push({symbol,resolve});pump();return promise}
 return {enqueue,refresh:()=>Promise.all([...new Set(getWatch())].map(enqueue)),get size(){return pending.size}};
}};
