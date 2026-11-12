import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
function harness(initial={}){
 const elements=new Map(),storage=new Map(Object.entries(initial).map(([k,v])=>['xijian_live_v1_'+k,JSON.stringify(v)])),calls=[],counts=new Map(),listeners={};
 const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',open:false,scrollTop:0,classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},focus(){},showModal(){this.open=true},close(){this.open=false}});return elements.get(id)};
 const document={hidden:false,activeElement:null,getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(n,fn){(listeners[n]??=[]).push(fn)}};
 class Form{constructor(form){this.values=form.values||{}}get(k){return this.values[k]??null}getAll(k){return Array.isArray(this.values[k])?this.values[k]:this.values[k]?[this.values[k]]:[]}}
 let feedbackError=false;
 const ctx=vm.createContext({document,location:{hash:''},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{innerWidth:350,scrollY:0,scrollTo(){},addEventListener(){}},requestAnimationFrame:fn=>fn(),URL,AbortController,AbortSignal,FormData:Form,Blob,icon:()=>'',hydrateIcons(){},confirm:()=>true,setInterval(){},clearTimeout(){},setTimeout(fn,ms){if(ms<5000)queueMicrotask(fn);return 1},fetch:async(url,options={})=>{
  const u=new URL(url,'https://example.test');calls.push(u.pathname+u.search);const symbol=u.searchParams.get('symbol');const q={name:'测试股票',price:50,date:'2026-11-05',time:'15:00:00',change:0};let data;
  if(u.pathname==='/api/account')data={authenticated:true,backupAvailable:true};
  else if(u.pathname==='/api/user-data')data={hasBackup:false,backup:null,revision:0};
  else if(u.pathname==='/api/feedback'){if(feedbackError)throw Error('网络中断');data=options.method==='POST'?{ticket:'receipt-123',status:'submitted'}:{tickets:[]}}
  else if(u.pathname==='/api/quote')data={symbol,quote:q};
  else if(u.pathname==='/api/detail-metrics')data={valuations:[],payoutTimeline:[],sources:[],latest:{}};
  else{assert.equal(u.pathname,'/api/stock');const n=(counts.get(symbol)||0)+1;counts.set(symbol,n);const partial=n===1;data={symbol,name:q.name,quote:q,partial,sources:['行情','历史价格','分红','财务','利率'].map((section,i)=>({section,status:partial&&i===2?'error':'ok'})),dividends:[{reportDate:'2025-12-31',exDate:'2026-06-01',cashPerShare:2,shareFactor:1}],analysis:{version:'dividend-data-4.0.0',asOf:q.date,price:50,yield:4,ordinaryDividend:2,industry:{name:'测试'},history:{samples:2},basis:{id:'implemented-period-reference-v4',baseYear:'2025',components:[{reportDate:'2025-12-31',exDate:'2026-06-01',adjustedCashPerShare:2}]},series:[{date:'2026-11-04',close:49,yield:4.08,dividend:2},{date:'2026-11-05',close:50,yield:4,dividend:2}]}}}
  return {ok:true,json:async()=>data};
 }});
 for(const file of ['auto-data','history-chart','investment-state','workspace-ui','account-data','mine-ui','dividend-research','personal-research','app'])vm.runInContext(fs.readFileSync('public/'+file+'.js','utf8'),ctx);
 return {ctx,element,storage,calls,counts,listeners,run:code=>vm.runInContext(code,ctx),setFeedbackError:v=>feedbackError=v};
}
test('new user starts empty; adding saves immediately without waiting and retries only the selected stock',async()=>{
 const h=harness();await h.run('activeRefresh');assert.equal(h.run('watch.length'),0);assert.equal(h.calls.length,0);assert.ok(h.element('main').innerHTML.includes('从第一只自选开始'));
 h.run("addImmediate('sh601318','中国平安',true)");assert.equal(h.run('watch.length'),1);assert.equal(h.run('featuredWatch().length'),1);assert.ok(h.element('main').innerHTML.includes('中国平安'));
 await h.run("watchLoader.enqueue('sh601318')");assert.equal(h.counts.get('sh601318'),2);assert.equal(h.run('records.sh601318.stale'),false);assert.ok(h.calls.every(u=>u.includes('sh601318')));
 h.run("openDetail('sh601318')");const detail=h.element('detailDialog').innerHTML;assert.ok(detail.includes('参考股息率'));assert.ok(detail.includes('数据来源与核对'));assert.ok(detail.includes('价格与股息记录'));
 for(const bad of ['自动下单','保证上涨'])assert.ok(!detail.includes(bad),bad);
 h.run("records.sh601318.analysis.research={version:'personal-research-5.0',status:'hold',reason:'区间内观察',risk:{id:'balanced',label:'均衡',buyQuantile:.7},history:{percentile:61},thresholds:{buyPrice:45,sellPrice:65,buyYield:5,sellYield:3},blockers:[],study:{count:0,samples:[],winRate:null,averageReturn:null}};renderDetail()");const restored=h.element('detailDialog').innerHTML;assert.ok(restored.includes('买入参考价上限'));assert.ok(restored.includes('data-threshold-line="buy"'));assert.ok(restored.includes('近三年股息率历史位置'));h.run("selectDetailTab('strategy')");assert.ok(h.element('detailDialog').innerHTML.includes('历史高股息窗口检验'));
 h.run("selectDetailTab('dividends')");await new Promise(r=>setImmediate(r));assert.ok(h.element('detailDialog').innerHTML.includes('分红方案'));
});
test('migration preserves user collections and ledger but invalidates advice caches and removes risk/cap settings',async()=>{
 const h=harness({watch:[{symbol:'sz002056',name:'横店东磁'}],records:{sz002056:{analysis:{version:'dividend-period-3.0.0',thresholds:{buyPrice:10},status:'buy'}}},preferences:{risk:'aggressive',cap:20,chartPeriod:'5y'},changes:[{to:'buy'}],holdings:{sz002056:true},modelVersion:'dividend-period-3.0.0'});
 assert.equal(h.run('watch.length'),1);assert.equal(h.run('workspace.pending.length'),1);assert.equal(h.run('prefs.cap'),undefined);assert.equal(h.run('prefs.risk'),undefined);assert.equal(h.run('prefs.chartPeriod'),'5y');assert.equal(h.run('latestChanges.length'),0);
 assert.ok(!h.run('preferencesForm()').includes('仓位上限'));assert.ok(h.run('preferencesForm()').includes('参考门槛严格程度'));assert.equal(h.run('backupData().version'),3);await h.run('activeRefresh');
});
test('receipts enter actual cash only, survive backup and do not alter cost or produce portfolio advice',async()=>{
 const h=harness();await h.run('activeRefresh');h.run("workspace=XijianInvestments.putTrade(workspace,{id:'open',symbol:'sh601318',kind:'opening',at:'2025-01-01T10:00',quantity:100,price:50,fee:0});workspace=XijianInvestments.putReceipt(workspace,{id:'r',symbol:'sh601318',date:'2025-06-01',amount:120.5})");
 assert.equal(h.run("positionOf('sh601318').cost"),5000);const page=h.run('holdingsPage()');assert.ok(page.includes('¥120.50'));assert.ok(page.includes('分红到账'));assert.ok(!page.includes('买入参考价'));assert.equal(h.run('backupData().workspace.receipts.length'),1);
});
test('feedback submits only text, shows persisted receipt, and retains draft when networking fails',async()=>{
 const h=harness();await h.run('activeRefresh');const error={hidden:true,textContent:''},result={hidden:true,textContent:''},button={disabled:false,textContent:''},form={values:{description:'小屏按钮显示异常'},querySelector:s=>s==='[data-feedback-error]'?error:s==='[data-feedback-result]'?result:button,reset(){this.resetCalled=true}};h.ctx.form=form;
 h.setFeedbackError(true);await h.run('submitMineFeedback(form)');assert.equal(form.resetCalled,undefined);assert.ok(error.textContent.includes('填写内容已保留'));assert.equal(h.run('feedbackDraft'),'小屏按钮显示异常');
 h.setFeedbackError(false);await h.run('submitMineFeedback(form)');assert.ok(result.textContent.includes('receipt-123'));assert.equal(form.resetCalled,true);assert.equal(h.run('feedbackDraft'),'');
});
