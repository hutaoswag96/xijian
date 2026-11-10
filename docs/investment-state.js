(function(root){
 'use strict';
 const symbolOK=s=>typeof s==='string'&&/^(sh(?:60|68)\d{4}|sz(?:00|30)\d{4}|bj[489]\d{5})$/.test(s);
 const fail=message=>{throw Error(message)};
 let sequence=0;
 const id=()=>root.crypto?.randomUUID?.()||'local-'+Date.now().toString(36)+'-'+(++sequence).toString(36)+'-'+Math.random().toString(36).slice(2,8);
 const now=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,16);
 const dateOK=at=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)&&Number.isFinite(Date.parse(at+'Z'))&&new Date(at+'Z').toISOString().slice(0,16)===at;
 const unique=a=>[...new Set(a)];
 const symbolList=a=>{if(!Array.isArray(a)||a.length>100||!a.every(symbolOK))fail('股票清单格式无效');return unique(a)};
 function normalizeTrade(t){
  if(!t||typeof t!=='object'||!symbolOK(t.symbol)||!['opening','buy','sell','adjust'].includes(t.kind))fail('交易记录的股票或类型无效');
  if(typeof t.id!=='string'||!/^[\w-]{1,100}$/.test(t.id)||!dateOK(t.at)||t.at>now())fail('请填写有效且不晚于现在的交易时间');
  if(typeof t.quantity!=='number'||!Number.isSafeInteger(t.quantity)||t.quantity<0||t.quantity>1e9||t.kind!=='adjust'&&t.quantity===0)fail('股数须为正整数；调整后的股数可为零');
  if(typeof t.price!=='number'||!Number.isFinite(t.price)||t.price<0||t.price>1e6||['buy','sell'].includes(t.kind)&&t.price===0)fail('请填写有效价格；买卖价格须大于零');
  const fee=t.fee??0;if(typeof fee!=='number'||!Number.isFinite(fee)||fee<0||fee>1e9||t.quantity*t.price>1e12)fail('费用或交易金额超出有效范围');
  if(!['buy','sell'].includes(t.kind)&&fee!==0)fail('期初或调整记录直接使用单位成本，无需另填费用');
  if(t.kind==='sell'&&fee>t.quantity*t.price)fail('卖出费用不能大于成交金额');
  return {id:t.id,symbol:t.symbol,name:String(t.name||t.symbol.slice(2)).slice(0,40),kind:t.kind,at:t.at,quantity:t.quantity,price:t.price,fee,note:String(t.note||'').slice(0,120),voided:t.voided===true};
 }
 function project(input){
  if(!Array.isArray(input)||input.length>5000)fail('交易记录格式无效或超过5000条');
  const ids=new Set(),ledger=input.map(t=>{const r=normalizeTrade(t);if(ids.has(r.id))fail('交易记录编号重复');ids.add(r.id);return r});
  const positions={},entries=Object.create(null);
  for(const t of ledger.map((t,index)=>({...t,index})).sort((a,b)=>a.at.localeCompare(b.at)||a.index-b.index)){
   if(t.voided)continue;
   const p=positions[t.symbol]??={symbol:t.symbol,name:t.name,quantity:0,cost:0,averageCost:0,realized:0,fees:0,records:0,lastAt:t.at};
   if(t.kind==='opening'&&p.records)fail(t.name+'：期初持仓必须是首条记录，后续请使用买入或调整');
   if(t.kind==='opening'||t.kind==='buy'){p.quantity+=t.quantity;p.cost+=t.quantity*t.price+t.fee;p.fees+=t.fee}
   else if(t.kind==='adjust'){p.quantity=t.quantity;p.cost=t.quantity*t.price}
   else{if(t.quantity>p.quantity)fail(t.name+'：'+t.at.replace('T',' ')+'卖出股数超过当时持仓 '+p.quantity+' 股');const soldCost=p.averageCost*t.quantity;p.realized+=t.quantity*t.price-t.fee-soldCost;p.cost-=soldCost;p.quantity-=t.quantity;p.fees+=t.fee}
   if(p.quantity===0)p.cost=0;
   p.averageCost=p.quantity?p.cost/p.quantity:0;p.name=t.name;p.records++;p.lastAt=t.at;
   entries[t.id]={quantity:p.quantity,averageCost:p.averageCost,realized:p.realized};
  }
  return {ledger,positions,entries};
 }
 function normalizeWorkspace(value={}){
  if(!value||typeof value!=='object'||value.version!==1)fail('自选分组或持仓数据版本无效');
  if(!Array.isArray(value.featured)||!Array.isArray(value.ledger)||!Array.isArray(value.pending))fail('分组、精选或持仓账本不完整，拒绝覆盖原数据');
  if(!Array.isArray(value.groups)||value.groups.length>20)fail('最多创建20个自选分组');
  const names=new Set(),ids=new Set(),groups=value.groups.map(g=>{
   const name=String(g?.name||'').trim();if(!name||name.length>16||typeof g.id!=='string'||!/^[\w-]{1,100}$/.test(g.id))fail('分组名称须为1—16个字');
   if(names.has(name.toLowerCase())||ids.has(g.id))fail('分组名称或编号重复');names.add(name.toLowerCase());ids.add(g.id);
   return {id:g.id,name,symbols:symbolList(g.symbols)};
  });
  const {ledger,positions}=project(value.ledger||[]),pending=symbolList(value.pending||[]);
  if(Object.keys(positions).length>100)fail('持仓账本最多记录100只股票');
  return {version:1,groups,featured:symbolList(value.featured||[]),ledger,pending,receipts:normalizeReceipts(value.receipts||[])};
 }
 const empty=()=>({version:1,groups:[],featured:[],ledger:[],pending:[],receipts:[]});
 function group(state,{groupId=null,name,symbols=[]}){
  if(groupId&&!state.groups.some(g=>g.id===groupId))fail('分组已不存在');
  const next={id:groupId||id(),name,symbols};return normalizeWorkspace({...state,groups:groupId?state.groups.map(g=>g.id===groupId?next:g):state.groups.concat(next)});
 }
 function removeGroup(state,groupId){return normalizeWorkspace({...state,groups:state.groups.filter(g=>g.id!==groupId)})}
 function stockOptions(state,symbol,groupIds,featured){
  if(!symbolOK(symbol)||!Array.isArray(groupIds)||groupIds.some(g=>!state.groups.some(x=>x.id===g)))fail('股票或分组无效');
  return normalizeWorkspace({...state,groups:state.groups.map(g=>({...g,symbols:unique(groupIds.includes(g.id)?g.symbols.concat(symbol):g.symbols.filter(s=>s!==symbol))})),featured:unique(featured?state.featured.concat(symbol):state.featured.filter(s=>s!==symbol))});
 }
 function removeWatch(state,symbol){return normalizeWorkspace({...state,groups:state.groups.map(g=>({...g,symbols:g.symbols.filter(s=>s!==symbol)})),featured:state.featured.filter(s=>s!==symbol)})}
 function putTrade(state,trade){
  const t=normalizeTrade(trade),exists=state.ledger.some(r=>r.id===t.id),ledger=exists?state.ledger.map(r=>r.id===t.id?t:r):state.ledger.concat(t);
  if(exists&&state.ledger.find(r=>r.id===t.id).symbol!==t.symbol)fail('编辑记录不能更改股票，请撤销后重新录入');
  return normalizeWorkspace({...state,ledger,pending:state.pending.filter(s=>s!==t.symbol)});
 }
 function voidTrade(state,tradeId,voided=true){if(!state.ledger.some(t=>t.id===tradeId))fail('交易记录不存在');return normalizeWorkspace({...state,ledger:state.ledger.map(t=>t.id===tradeId?{...t,voided}:t)})}
 function normalizeReceipt(value){
  if(!value||typeof value.id!=='string'||!/^[\w-]{1,100}$/.test(value.id)||!symbolOK(value.symbol))fail('分红记录的编号或股票代码无效');
  const date=value.date;if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>now().slice(0,10))fail('到账日期须为有效日期，不能填写未来日期');
  if(typeof value.amount!=='number'||!Number.isFinite(value.amount)||value.amount<=0||value.amount>1e10||Math.abs(value.amount*100-Math.round(value.amount*100))>1e-5)fail('请填写实际到账金额，最多两位小数');
  return {id:value.id,symbol:value.symbol,name:String(value.name||value.symbol.slice(2)).slice(0,40),date,amount:Math.round(value.amount*100)/100,note:String(value.note||'').slice(0,120),voided:value.voided===true};
 }
 function normalizeReceipts(values){if(!Array.isArray(values)||values.length>5000)fail('分红到账记录格式无效或超过5000条');const ids=new Set();return values.map(v=>{const r=normalizeReceipt(v);if(ids.has(r.id))fail('分红到账记录编号重复');ids.add(r.id);return r})}
 function putReceipt(state,value){const r=normalizeReceipt(value),old=(state.receipts||[]).find(v=>v.id===r.id);if(old&&old.symbol!==r.symbol)fail('编辑到账记录不能更改股票');return normalizeWorkspace({...state,receipts:old?state.receipts.map(v=>v.id===r.id?r:v):(state.receipts||[]).concat(r)})}
 function voidReceipt(state,id,voided=true){if(!(state.receipts||[]).some(v=>v.id===id))fail('分红到账记录不存在');return normalizeWorkspace({...state,receipts:state.receipts.map(v=>v.id===id?{...v,voided}:v)})}
 function receiptTotal(state,symbol=null){return Math.round((state.receipts||[]).filter(v=>!v.voided&&(!symbol||v.symbol===symbol)).reduce((sum,v)=>sum+v.amount,0)*100)/100}
 function importBackup(value){
  if(!value||![1,2,3].includes(value.version)||!Array.isArray(value.watch)||value.watch.length>30||!value.watch.every(s=>symbolOK(s?.symbol)&&typeof s.name==='string'&&s.name.length<=40))fail('不是有效的息见自选与持仓备份');
  const watch=[...new Map(value.watch.map(s=>[s.symbol,{symbol:s.symbol,name:s.name.slice(0,30)}])).values()];
  let workspace=value.version>=2?normalizeWorkspace(value.workspace):{...empty(),pending:watch.filter(s=>value.holdings?.[s.symbol]===true).map(s=>s.symbol)};
  workspace={...workspace,groups:workspace.groups.map(g=>({...g,symbols:g.symbols.filter(s=>watch.some(w=>w.symbol===s))})),featured:workspace.featured.filter(s=>watch.some(w=>w.symbol===s))};
  return {watch,workspace,prefs:value.prefs&&typeof value.prefs==='object'?value.prefs:{}};
 }
 root.XijianInvestments={id,now,symbolOK,normalizeTrade,project,normalizeWorkspace,empty,group,removeGroup,stockOptions,removeWatch,putTrade,voidTrade,normalizeReceipt,normalizeReceipts,putReceipt,voidReceipt,receiptTotal,importBackup};
})(globalThis);
