// Compare normalized observations, never provider-specific dividend-yield fields.
const result=(status,message,details=[])=>({status,message,details,blocking:status==='conflict'});
const near=(a,b,absolute,relative=0)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=Math.max(absolute,Math.max(Math.abs(a),Math.abs(b))*relative);
export function compareQuotes(a,b){
 if(a.date!==b.date)return result('limited','报价日期不同，采用较新的报价；本次未完成同日校验');
 const lag=Math.abs(Date.parse(a.timestamp)-Date.parse(b.timestamp));
 if(lag>120000)return result('limited','报价时刻相差超过2分钟，不将盘中价格变化误报为数据错误');
 if(!near(a.previousClose,b.previousClose,.011))return result('conflict','同日昨收价不一致，暂停行动信号');
 const tolerance=lag<=5000?.001:.005;
 return near(a.price,b.price,.02,tolerance)?result('verified','同日相近时刻的报价一致（允许行情延迟）',[
  {label:a.source,value:`¥${a.price.toFixed(2)} · ${a.date} ${a.time}`},{label:b.source,value:`¥${b.price.toFixed(2)} · ${b.date} ${b.time}`}])
 :result('conflict','相近时刻的报价差异超过容差，暂停行动信号',[
  {label:a.source,value:`¥${a.price.toFixed(2)} · ${a.time}`},{label:b.source,value:`¥${b.price.toFixed(2)} · ${b.time}`}]);
}
export function compareHistory(a,b,asOf){
 const other=new Map(b.data.map(p=>[p.date,p]));
 // Intraday daily candles are unfinished and cannot be compared as closes.
 const windowStart=new Date(asOf+'T00:00:00Z');windowStart.setUTCFullYear(windowStart.getUTCFullYear()-10);const cutoff=windowStart.toISOString().slice(0,10);
 // Extra pre-window prices only warm up the causal study; the displayed
 // history and current strategy are verified within their ten-year window.
 const common=a.data.filter(p=>p.date>=cutoff&&p.date<asOf&&other.has(p.date));
 if(common.length<20)return result('limited','共同的已收盘交易日不足20个，暂不能完成历史校验');
 const bad=common.filter(p=>!near(p.close,other.get(p.date).close,.011));
 if(bad.length)return result('conflict',`${common.length}个共同交易日中，${bad.length}日的未复权收盘价不一致`,bad.slice(-3).map(p=>({label:p.date,value:`${a.source} ¥${p.close} / ${b.source} ¥${other.get(p.date).close}`})));
 const start=common[0].date,end=common.at(-1).date,aa=a.data.filter(p=>p.date>=start&&p.date<=end),bb=b.data.filter(p=>p.date>=start&&p.date<=end);
 if(aa.length!==bb.length)return result('limited','共同收盘价一致，但部分交易日缺失；保留覆盖更完整的日线');
 return result('verified',`近十年窗口内${common.length}个共同交易日的未复权收盘价一致`);
}
export function compareDividends(a,b,asOf){
 const cutoff=String(Number(asOf.slice(0,4))-6)+asOf.slice(4),aa=a.data.filter(e=>e.exDate>=cutoff),bb=b.data.filter(e=>e.exDate>=cutoff),other=new Map(bb.map(e=>[e.exDate,e]));
 const common=aa.filter(e=>other.has(e.exDate));
 const bad=common.filter(e=>!near(e.cashPerShare,other.get(e.exDate).cashPerShare,.0001)||!near(e.shareFactor,other.get(e.exDate).shareFactor,.00001));
 if(bad.length)return result('conflict',`${bad.length}笔已实施分红的税前每股金额或送转比例不一致`,bad.slice(-3).map(e=>({label:e.exDate,value:`${a.source} ¥${e.cashPerShare} / ${b.source} ¥${other.get(e.exDate).cashPerShare}`})));
 if(!aa.length&&!bb.length)return result('limited','两个来源均未列出近六年已实施分红；不等同于已确认不分红');
 const missing=aa.filter(e=>!other.has(e.exDate)).concat(bb.filter(e=>!aa.some(x=>x.exDate===e.exDate)));
 if(missing.length)return result('conflict',`近六年有${missing.length}笔分红仅被一个来源列出，待核对实施记录`,missing.slice(-3).map(e=>({label:e.exDate,value:`税前每股 ¥${e.cashPerShare}`})));
 return result('verified',`${common.length}笔实施日期、税前每股金额与送转比例一致；备用源不校验所属财年`);
}
export function compareFinance(a,b){
 const latestA=a.data.at(-1),latestB=b.data.at(-1);
 if(!latestA||!latestB||latestA.reportDate!==latestB.reportDate)return result('limited','最新报告期尚未对齐，采用较新的已披露报告，暂未完成同期间校验');
 const comparisons=['revenue','profit'].map(k=>{
  const valueA=latestA[k],valueB=latestB[k],missing=!Number.isFinite(valueA)||!Number.isFinite(valueB),match=near(valueA,valueB,10000,.001);
  const basisMismatch=k==='revenue'&&latestA.revenueKind&&latestB.revenueKind&&latestA.revenueKind!==latestB.revenueKind&&!match;
  return {key:k,label:k==='profit'?'归母净利润':'营收',reportDate:latestA.reportDate,unit:'CNY',sourceA:a.source,sourceB:b.source,valueA,valueB,basisA:k==='revenue'?latestA.revenueLabel||'营收':'合并归母净利润',basisB:k==='revenue'?latestB.revenueLabel||'营收':'合并归母净利润',differencePct:missing?null:Math.max(Math.abs(valueA),Math.abs(valueB))===0?0:Math.abs(valueA-valueB)/Math.max(Math.abs(valueA),Math.abs(valueB))*100,status:missing?'missing':basisMismatch?'basis':match?'match':'conflict'};
 });
 if(Number.isFinite(latestA.profitGrowth)&&Number.isFinite(latestB.profitGrowth))comparisons.push({key:'profitGrowth',label:'归母净利润同比',reportDate:latestA.reportDate,unit:'pct',sourceA:a.source,sourceB:b.source,valueA:latestA.profitGrowth,valueB:latestB.profitGrowth,differencePct:Math.abs(latestA.profitGrowth-latestB.profitGrowth),status:near(latestA.profitGrowth,latestB.profitGrowth,.1)?'match':'conflict'});
 const bad=comparisons.filter(c=>c.status==='conflict'),limited=comparisons.filter(c=>['basis','missing'].includes(c.status));
 const v=bad.length?result('conflict',`${latestA.reportDate} ${bad.map(c=>c.label).join('、')}两源数值不一致；属于数据校验提示，请查看差异`):limited.length?result('limited',`${latestA.reportDate} ${limited.map(c=>c.label).join('、')}科目不同或字段缺失，不能直接比较`):result('verified',`${latestA.reportDate} 营收、归母净利润已按人民币元核对（容差0.1%）`);
 return {...v,comparisons,reportDate:latestA.reportDate};
}
export function compareRates(a,b){
 const other=new Map(b.data.map(r=>[r.date,r]));const common=a.data.filter(r=>other.has(r.date)),last=common.at(-1);
 if(!last)return result('limited','国债数据日期不同，采用较新日期；尚未完成同日校验');
 if(!near(last.tenYear,other.get(last.date).tenYear,.01))return result('conflict',`${last.date} 十年期国债收益率差异超过0.01个百分点`,[{label:a.source,value:last.tenYear+'%'},{label:b.source,value:other.get(last.date).tenYear+'%'}]);
 return result('verified',`${last.date} 十年期国债收益率一致（容差0.01个百分点）`);
}
export async function resolveSources(loaders,compare,{choose=values=>values[0],asOf}={}){
 const settled=await Promise.allSettled(loaders.map(s=>s.load()));
 const attempts=settled.map((r,i)=>({source:loaders[i].name,sourceUrl:loaders[i].url,status:r.status==='fulfilled'?'ok':'error',...(r.status==='rejected'?{message:r.reason?.message||'读取失败'}:{fetchedAt:r.value.fetchedAt})}));
 const values=settled.filter(r=>r.status==='fulfilled').map(r=>r.value);
 if(!values.length)throw new Error(attempts.map(a=>`${a.source}：${a.message}`).join('；'));
 const selected=choose(values),verification=values.length>1?compare(values[0],values[1],asOf):result('limited','仅一个来源可用，已自动使用可用来源，尚未完成交叉校验');
 return {...selected,fallback:settled[0].status==='rejected',verification:{...verification,checkedAt:new Date().toISOString(),attempts}};
}
