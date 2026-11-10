(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'—';
 function payoutChart(timeline){
  const rows=[...timeline].sort((a,b)=>a.year.localeCompare(b.year)).slice(-6);if(!rows.length)return '';
  const w=360,h=210,left=35,right=38,top=22,bottom=30,base=h-bottom,pw=w-left-right,ph=base-top,step=pw/rows.length;
  const max=Math.max(1,...rows.flatMap(r=>[Math.max(0,r.cashAmount),Math.max(0,r.profit)]))/1e8;
  const cashTop=Math.ceil(max/5)*5,cashBottom=Math.min(0,...rows.map(r=>Math.floor(r.profit/1e8/5)*5)),ratioTop=Math.max(100,Math.ceil(Math.max(0,...rows.map(r=>r.payout||0))/25)*25);
  const x=i=>left+(i+.5)*step,cy=v=>base-(v/1e8-cashBottom)/(cashTop-cashBottom)*ph,ry=v=>base-v/ratioTop*ph;
  const path=rows.reduce((v,r,i)=>Number.isFinite(r.payout)?v+`${i&&Number.isFinite(rows[i-1].payout)?'L':'M'}${x(i)},${ry(r.payout)} `:v,'');
  return `<div class="payout-history"><div class="payout-legend"><span><i class="profit-key"></i>归母净利润</span><span><i class="cash-key"></i>现金分红</span><span><i class="ratio-key"></i>支付率</span></div><svg class="payout-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="最近${rows.length}个完整财年的归母净利润、派现总额与股利支付率，详细数字可展开下方年度数据"><text x="0" y="12" class="payout-axis">亿元</text>${[0,.5,1].map(t=>`<path d="M${left},${base-t*ph}H${w-right}" stroke="#e7ece8" stroke-dasharray="3 4"/><text x="${left-6}" y="${base-t*ph+4}" text-anchor="end" class="payout-axis">${number(cashBottom+t*(cashTop-cashBottom),0)}</text><text x="${w-right+6}" y="${base-t*ph+4}" class="payout-axis">${number(t*ratioTop,0)}%</text>`).join('')}${rows.map((r,i)=>`<g><title>${esc(r.year)}年：归母净利润${number(r.profit/1e8)}亿元，现金分红${number(r.cashAmount/1e8)}亿元，支付率${number(r.payout)}%${r.estimated?'（测算）':''}</title><rect x="${x(i)-step*.28}" y="${Math.min(cy(r.profit),cy(0))}" width="${step*.24}" height="${Math.abs(cy(0)-cy(r.profit))}" fill="#7b98bc" rx="1"/><rect x="${x(i)+step*.04}" y="${cy(r.cashAmount)}" width="${step*.24}" height="${cy(0)-cy(r.cashAmount)}" fill="#9fc3c1" rx="1"/><text x="${x(i)}" y="${h-9}" text-anchor="middle" class="payout-axis">${esc(r.year)}</text></g>`).join('')}<path d="${path}" fill="none" stroke="#ca9461" stroke-width="1.8"/>${rows.map((r,i)=>Number.isFinite(r.payout)?`<circle cx="${x(i)}" cy="${ry(r.payout)}" r="3" fill="#ca9461"><title>${esc(r.year)}：${number(r.payout)}%${r.estimated?'（测算）':''}</title></circle>`:'').join('')}</svg><p class="data-caption">按所属财年汇总，不是每日支付率；亏损年度支付率留空。</p><details class="payout-data" data-disclosure="payout-annual"><summary>查看年度金额与支付率</summary><div class="data-table-wrap"><table class="data-table"><thead><tr><th>财年</th><th>净利润 / 亿元</th><th>派现 / 亿元</th><th>支付率</th></tr></thead><tbody>${rows.slice().reverse().map(r=>`<tr><td>${esc(r.year)}</td><td>${number(r.profit/1e8)}</td><td>${number(r.cashAmount/1e8)}</td><td>${number(r.payout)}%${r.estimated?'<small>测算</small>':''}</td></tr>`).join('')}</tbody></table></div></details></div>`;
 }
 function schemes(record){
  const groups=new Map(),known=new Set();
  for(const [status,events] of [['已实施',record.dividends||[]],['待实施',record.dividendPlans||[]]])for(const event of events){
   const key=[event.reportDate,event.exDate,event.cashPerShare].join('|');if(known.has(key))continue;known.add(key);
   const year=/^\d{4}/.exec(event.reportDate||'')?.[0]||'所属年度待核';if(!groups.has(year))groups.set(year,[]);groups.get(year).push({...event,status});
  }
  const years=[...groups.keys()].sort().reverse();
  return `<section class="detail-panel dividend-schemes"><div class="payout-heading"><h3>年度分红方案</h3><span>${years.length} 个年度 · 税前</span></div><p class="data-caption">按报告所属年度归组，点击年份查看各次分红。</p>${years.map(year=>{
   const rows=groups.get(year).sort((a,b)=>String(b.reportDate).localeCompare(String(a.reportDate))||String(b.exDate).localeCompare(String(a.exDate))),done=rows.filter(r=>r.status==='已实施'),pending=rows.length-done.length;
   return `<details class="dividend-year" data-disclosure="dividend-${esc(year)}"><summary><span><b>${esc(year)}${/^\d/.test(year)?' 年':''}</b><small>${done.length} 次已实施${pending?' · '+pending+' 项待实施':''}</small></span><span>${rows.length} 项方案<span class="year-chevron">⌄</span></span></summary><div class="dividend-year-body">${rows.map(r=>`<div class="scheme-row"><div><b>${esc(r.reportDate||'期间待核')}</b><small>${r.status==='已实施'?'除息':'预计除息'} ${esc(r.exDate||'待定')}</small></div><div><strong>10 派 ${number(r.cashPerShare*10,3).replace(/0+$/,'').replace(/\.$/,'')} 元</strong><span class="scheme-status ${r.status==='待实施'?'pending':''}">${esc(r.status==='待实施'?r.progress||'预案／待实施':r.status)}${r.special?' · 特别分红':''}</span></div></div>`).join('')}</div></details>`;
  }).join('')||'<p>暂无可用分红记录。</p>'}<p class="data-caption">预案单独标记，不计入已实施参考基数和个人到账。表内为事件当时每股金额；送转调整后的计算基数可在下方查看。来源未提供的“不分配”年度不补造为零。</p></section>`;
 }
 root.XijianDividend={payoutChart,schemes};
})(globalThis);
