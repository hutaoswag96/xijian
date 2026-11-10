(function(root){
 'use strict';
 const period=d=>{if(!d)return '最新报告期';const y=d.slice(0,4),md=d.slice(5);return md==='09-30'?y+'年前三季度':md==='06-30'?y+'年上半年':md==='03-31'?y+'年一季度':md==='12-31'?y+'年全年':d};
 function describe(a){
  if(!a||a.status!=='review')return null;
  const first=a.blockers?.[0]||'',f=a.financial||{},p=period(f.reportDate);
  if(first.includes('来源冲突'))return {kind:'data',label:'数据待核对',title:'数据未核对一致，暂停信号',summary:first,action:'无需提交审核。系统会重新获取数据；可查看两家来源的具体差异。',resume:'两家来源核对一致且其他检查通过后，系统自动重新判断。',tab:'financials'};
  if(first.includes('归母净利润同比下降超过30%'))return {kind:'earnings',label:'盈利风险',title:'盈利下滑，暂停买入',summary:`${p}归母净利润同比下降${Math.abs(f.profitGrowth).toFixed(2)}%，超过本模型30%的暂停阈值。`,action:'无需人工复核通过。当前不生成新增买入信号；盈利预警本身不代表必须卖出已有持仓。',resume:'后续已披露财报的归母净利润为正、同比降幅不超过30%，并且其他检查通过后，系统自动重新判断。调整为激进档不会解除这一条件。',tab:'financials'};
  if(first.includes('归母净利润非正'))return {kind:'earnings',label:'盈利风险',title:'归母净利润非正，暂停买入',summary:`${p}归母净利润为零或亏损，未通过本模型的盈利检查。`,action:'无需手动提交审核。当前不生成新增买入信号，也不自动判定必须卖出。',resume:'后续已披露财报恢复正利润、通过同比及其他检查后自动重新判断。',tab:'financials'};
  if(first.includes('分红下降超过20%'))return {kind:'dividend',label:'分红风险',title:'参考分红下降，暂停买入',summary:`策略参考分红较一年前同口径下降${Math.abs(a.dividendGrowth).toFixed(2)}%，超过本模型20%的暂停阈值。`,action:'无需人工勾选通过。当前暂停新增买入信号，参考价格不作为可执行建议。',resume:'所属期间与已实施分红更新、降幅不超过20%，且其他检查通过后自动重新判断。',tab:'dividends'};
  if(/风险警示|退市/.test(first))return {kind:'scope',label:'不适用',title:'该股票不适用通用区间',summary:first,action:'无需人工提交审核。当前通用模型不生成该股的买卖信号。',resume:'相关证券标记改变且其他适用条件通过后，系统才会重新评估。',tab:'strategy'};
  return {kind:'data',label:'资料待补齐',title:'资料或适用条件不足，暂停信号',summary:first||a.reason||'当前资料不足以形成可用判断。',action:'无需人工勾选通过。网站会自动更新资料；如历史不足或分红不连续，刷新不会立即解决。',resume:'缺失资料补齐、时间覆盖或分红连续性满足要求，且其他检查通过后自动重新判断。',tab:'strategy'};
 }
 root.XijianDecision={describe};
})(globalThis);
