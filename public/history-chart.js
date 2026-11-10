(function(root){
 'use strict';
 const DAY=86400000,stamp=date=>Date.parse(date+'T00:00:00Z');
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const value=(v,suffix='',digits=2)=>Number.isFinite(v)?v.toFixed(digits)+suffix:'—';
 function niceScale(values){
  const min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*.08,.05),raw=(max+pad-Math.max(0,min-pad))/5;
  const power=10**Math.floor(Math.log10(raw)),fraction=raw/power,step=([1,2,2.5,5,10].find(n=>n>=fraction)||10)*power;
  const lo=Math.max(0,Math.floor((min-pad)/step)*step),hi=Math.ceil((max+pad)/step)*step;
  const ticks=Array.from({length:Math.round((hi-lo)/step)+1},(_,i)=>Number((lo+i*step).toFixed(8)));
  return {lo,hi,step,ticks,digits:Math.max(0,Math.min(8,-Math.floor(Math.log10(step))+(step/power===2.5?1:0)))};
 }
 function dateTicks(start,end,width){
  const days=(stamp(end)-stamp(start))/DAY,targetDays=Math.max(2,Math.floor(width/72));
  if(days<=90){const step=[1,2,3,7,14,30].find(n=>days/n<=targetDays)||30,ticks=[];for(let t=Math.ceil(stamp(start)/DAY/step)*step*DAY;t<=stamp(end);t+=step*DAY){const date=new Date(t).toISOString().slice(0,10);ticks.push({date,label:date.slice(5)})}return ticks.length>1?ticks:[{date:start,label:start.slice(5)},{date:end,label:end.slice(5)}]}
  if(width<420){const count=Math.max(3,Math.floor(width/80)+1);return Array.from({length:count},(_,i)=>{const date=new Date(stamp(start)+(stamp(end)-stamp(start))*i/(count-1)).toISOString().slice(0,10);return {date,label:date.slice(0,7).replace('-','/')}})}
  const first=new Date(stamp(start)),last=stamp(end),months=(last-stamp(start))/(30.44*DAY),target=Math.max(2,Math.floor(width/80));
  const step=[1,2,3,6,12,24,36].find(n=>months/n<=target)||48;
  let year=first.getUTCFullYear(),month=Math.ceil((first.getUTCMonth()+1)/step)*step;
  const ticks=[];
  for(let t=Date.UTC(year,month,1);t<=last;month+=step,t=Date.UTC(year,month,1)){
   const d=new Date(t),date=d.toISOString().slice(0,10);
   ticks.push({date,label:step>=12?date.slice(0,4):date.slice(0,7).replace('-','/')});
  }
  if(ticks.length<2)return [{date:start,label:start.slice(0,7).replace('-','/')},{date:end,label:end.slice(0,7).replace('-','/')}];
  return ticks;
 }
 function nearest(series,time){
  let lo=0,hi=series.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(stamp(series[mid].date)<time)lo=mid+1;else hi=mid}
  return lo>0&&Math.abs(stamp(series[lo-1].date)-time)<=Math.abs(stamp(series[lo].date)-time)?lo-1:lo;
 }
 function clampWindow(range,baseStart,baseEnd){
  const full=Math.max(DAY,baseEnd-baseStart),min=Math.min(14*DAY,full),span=Math.max(min,Math.min(full,range[1]-range[0]));
  const start=Math.max(baseStart,Math.min(baseEnd-span,range[0]));return [start,start+span];
 }
 function zoomWindow(m,factor,anchor=.5){const span=m.span/factor,at=m.start+Math.max(0,Math.min(1,anchor))*m.span;return clampWindow([at-anchor*span,at+(1-anchor)*span],m.baseStart,m.baseEnd)}
 function panWindow(m,ratio){return clampWindow([m.start-ratio*m.span,m.end-ratio*m.span],m.baseStart,m.baseEnd)}
 const spanText=ms=>ms>=330*DAY?`约${(ms/(365.2425*DAY)).toFixed(1)}年`:ms>=45*DAY?`约${(ms/(30.44*DAY)).toFixed(1)}个月`:`约${Math.max(1,Math.round(ms/DAY))}天`;
 const metricInfo=kind=>({price:{key:'close',label:'未复权股价',unit:'',prefix:'¥'},pe:{key:'pe',label:'PE-TTM',unit:'倍'},pb:{key:'pb',label:'PB-MRQ',unit:'倍'}}[kind]||{key:'yield',label:'参考股息率',unit:'%'});
 const metricCache=new WeakMap();
 function enrichedSeries(record){
  const series=record.analysis.series||[],metrics=record.detailMetrics;if(!metrics)return series;
  const cached=metricCache.get(series);if(cached?.metrics===metrics)return cached.series;
  const byDate=new Map((metrics.valuations||[]).map(v=>[v.date,v]));
  const result=series.map(p=>{const v=byDate.get(p.date);return {...p,pe:v?.pe??null,pb:v?.pb??null,peReason:v?.peReason||'该日PE资料缺失',pbReason:v?.pbReason||'该日PB资料缺失'}});
  metricCache.set(series,{metrics,series:result});return result;
 }
 function linePath(m){let path='',connected=false;for(const p of m.series){if(!Number.isFinite(p[m.k])){connected=false;continue}const x=m.x(p).toFixed(2),y=m.y(p[m.k]).toFixed(2);path+=connected?` L${x},${y}`:` M${x},${y}`;connected=true}return path.trim()}
 function createModel(record,{kind='yield',period='3y',width=700,height=260,index=null,selectedDate=null,viewWindow=null,showStrategyZones=true}={}){
  if(!['yield','price','pe','pb'].includes(kind))return null;
  const a=record.analysis,metric=metricInfo(kind),k=metric.key,years=({'1y':1,'3y':3,'5y':5,'10y':10})[period]||3;
  const cut=new Date(stamp(a.asOf));cut.setUTCFullYear(cut.getUTCFullYear()-years);const cutoff=cut.toISOString().slice(0,10);
  const available=enrichedSeries(record).filter(p=>p.date<=a.asOf&&Number.isFinite(p.close));if(!available.length)return null;
  let series=available.filter(p=>p.date>=cutoff);if(!series.length)series=available;
  const limited=stamp(available[0].date)>stamp(cutoff)+10*DAY,baseSeries=series,baseStart=stamp(series[0].date),baseEnd=stamp(series.at(-1).date);
  let [start,end]=viewWindow?clampWindow(viewWindow,baseStart,baseEnd):[baseStart,baseEnd];
  series=baseSeries.filter(p=>stamp(p.date)>=start&&stamp(p.date)<=end);
  if(!series.length){const i=nearest(baseSeries,(start+end)/2);series=baseSeries.slice(Math.max(0,i-2),Math.min(baseSeries.length,i+3));start=stamp(series[0].date);end=stamp(series.at(-1).date)}
  const zoomed=end-start<baseEnd-baseStart-1;
  const research=a.research,thresholds=research?.thresholds;
  const zones=!showStrategyZones||record.stale||research?.version!=='personal-research-5.0'||research.status==='review'||!thresholds||!['yield','price'].includes(kind)?[]:[
   {side:'buy',value:kind==='price'?thresholds.buyPrice:thresholds.buyYield,direction:kind==='price'?'below':'above'},
   {side:'sell',value:kind==='price'?thresholds.sellPrice:thresholds.sellYield,direction:kind==='price'?'above':'below'}
  ].filter(z=>Number.isFinite(z.value));
  const values=series.map(p=>p[k]).filter(Number.isFinite),scale=niceScale(values.length||zones.length?values.concat(zones.map(z=>z.value)):[0,1]);
  const w=Math.max(200,width),h=Math.max(180,height),compact=w<=520,left=compact?38:46,right=compact?8:12,top=16,bottom=32,plotWidth=w-left-right,plotHeight=h-top-bottom;
  const span=Math.max(DAY,end-start);
  const x=p=>left+(stamp(p.date)-start)/span*plotWidth,y=v=>top+(scale.hi-v)/(scale.hi-scale.lo)*plotHeight;
  const selected=selectedDate?nearest(series,stamp(selectedDate)):Math.max(0,Math.min(series.length-1,index??series.length-1));
  return {series,k,kind,metric,dataStart:baseSeries.find(p=>Number.isFinite(p[k]))?.date,dataEnd:baseSeries.findLast(p=>Number.isFinite(p[k]))?.date,hasData:values.length>0,zones,scale,w,h,left,right,top,bottom,plotWidth,plotHeight,start,end,span,x,y,selected,years,limited,baseStart,baseEnd,zoomed};
 }
 function zoneRect(m,z){const line=Math.max(m.top,Math.min(m.h-m.bottom,m.y(z.value)));return {x:m.left,y:z.direction==='above'?m.top:line,width:m.plotWidth,height:z.direction==='above'?line-m.top:m.h-m.bottom-line}}
 const position=(m,p)=>(stamp(p.date)-m.start)/m.span*100;
 function text(p,kind){const metric=metricInfo(kind);if(kind==='pe'||kind==='pb')return `${p.date} · 股价 ¥${value(p.close)} · ${metric.label} ${value(p[metric.key],metric.unit)}${Number.isFinite(p[metric.key])?'':' · '+(p[metric.key+'Reason']||'资料缺失')}`;return `${p.date} · 股价 ¥${value(p.close)} · 参考股息率 ${value(p.yield,'%')} · 每股普通分红基数 ¥${value(p.dividend)}`}
 function tooltip(p,kind){const metric=metricInfo(kind);return `<b>${escape(p.date)}</b><span>${metric.label}<strong>${metric.prefix||''}${value(p[metric.key],metric.unit)}</strong></span>${kind==='price'?`<span>股息率<strong>${value(p.yield,'%')}</strong></span>`:`<span>未复权股价<strong>¥${value(p.close)}</strong></span>`}${kind==='pe'||kind==='pb'?`<small>${Number.isFinite(p[metric.key])?'数据源对应交易日的历史估值':escape(p[metric.key+'Reason']||'资料缺失')}</small>`:`<small>参考分红基数 ¥${value(p.dividend)}${Number.isFinite(p.dividendCount)?' · '+p.dividendCount+' 笔':''}</small>`}`}

 function render(record,options){
  const m=createModel(record,options);if(!m)return '<p class="form-help">暂无可绘制的有效历史数据。</p>';
  const {series,k,kind,zones,scale,w,h,left,right,top,bottom,x,y}=m,p=series[m.selected],sx=x(p),sy=Number.isFinite(p[k])?y(p[k]):top;
  const path=linePath(m);
  const events=(['yield','price'].includes(kind)?record.dividends||[]:[]).filter(e=>stamp(e.exDate)>=m.start&&stamp(e.exDate)<=m.end).map(e=>{const i=nearest(series,stamp(e.exDate));return series[i].date===e.exDate?{...e,p:series[i]}:null}).filter(e=>e&&Number.isFinite(e.p[k]));
  const gradients=zones.map(z=>`<linearGradient id="${z.side}Space" x1="0" y1="${z.direction==='above'?1:0}" x2="0" y2="${z.direction==='above'?0:1}"><stop offset="0%" stop-color="${z.side==='buy'?'#d6818d':'#81ab91'}" stop-opacity=".025"/><stop offset="100%" stop-color="${z.side==='buy'?'#d6818d':'#81ab91'}" stop-opacity=".105"/></linearGradient>`).join('');
  const spaces=zones.map(z=>{const r=zoneRect(m,z);return `<rect data-space="${z.side}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="url(#${z.side}Space)"/><path data-threshold-line="${z.side}" d="M${left} ${y(z.value)}H${w-right}" stroke="${z.side==='buy'?'#bd6877':'#639174'}" stroke-width="1.1" stroke-dasharray="${z.side==='buy'?'none':'5 3'}"><title>${z.side==='buy'?'买入线':'减仓线'} ${kind==='price'?'¥':''}${value(z.value,kind==='price'?'':'%')}</title></path>`}).join('');
  return `<div class="history-chart" data-history-chart><div class="chart-range-note"><span>${series[0].date} — ${series.at(-1).date}</span><span>${series.length} 个交易日</span></div><div class="chart-window-summary"><span>总范围 ${spanText(m.baseEnd-m.baseStart)}</span><b>当前显示 ${spanText(m.span)}</b></div>${m.limited?`<p class="chart-coverage-note">${m.metric.label}历史不足 ${m.years} 年，已展示全部可用历史；不补造缺失年份。</p>`:''}${['pe','pb'].includes(kind)?`<p class="chart-data-coverage">${m.dataStart?`${m.metric.label}可查范围 ${m.dataStart} — ${m.dataEnd}；缺失处留空`:'当前未取得可用的同口径历史'}</p>`:''}<div class="chart-plot-wrap"><svg class="chart-svg history-plot" style="height:${h}px" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="group" tabindex="0" aria-roledescription="交互式历史指标图表" aria-describedby="chartPointReadout" aria-label="${escape(record.name)}${m.metric.label}历史走势，轻触查看数值，双击或双指缩放，方向键逐日查看"><defs><clipPath id="historyClip"><rect x="${left}" y="${top}" width="${m.plotWidth}" height="${m.plotHeight}"/></clipPath>${gradients}</defs>${scale.ticks.map(v=>`<path d="M${left} ${y(v)}H${w-right}" stroke="#e1e8df" stroke-dasharray="3 4"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end" class="chart-axis-label">${value(v,['pe','pb'].includes(kind)?'':m.metric.unit,scale.digits)}</text>`).join('')}${dateTicks(series[0].date,series.at(-1).date,m.plotWidth).map(t=>`<path d="M${x(t)} ${top}V${h-bottom}" stroke="#eef1eb"/><text x="${x(t)}" y="${h-9}" text-anchor="${x(t)-left<28?'start':w-right-x(t)<28?'end':'middle'}" class="chart-axis-label">${t.label}</text>`).join('')}<g clip-path="url(#historyClip)">${spaces}<path d="${path}" fill="none" stroke="#2c6b4e" stroke-width="1.8" stroke-linejoin="round"/>${events.map(e=>`<circle cx="${x(e.p)}" cy="${y(e.p[k])}" r="3" fill="#cf9156" stroke="white" stroke-width="1"><title>${e.exDate} 除权除息 · 税前每股 ¥${e.cashPerShare}</title></circle>`).join('')}</g>${m.hasData?'':`<text x="${left+m.plotWidth/2}" y="${top+m.plotHeight/2}" text-anchor="middle" class="chart-axis-label">该区间暂无${m.metric.label}数据</text>`}<circle data-chart-dot cx="${sx}" cy="${sy}" r="4" visibility="hidden" fill="#2c6b4e" stroke="white" stroke-width="2"/></svg><div class="chart-tooltip" data-chart-tooltip hidden role="status"></div></div><div class="chart-point-readout" id="chartPointReadout" aria-live="polite">${escape(text(p,kind))}</div><div class="chart-interactions"><span>${m.zoomed?'左右拖动浏览 · 双指缩放 · 双击还原':'轻触查看数值 · 双指或双击放大'}</span></div><div class="chart-legend"><span><i></i>指标历史走势</span>${events.length?'<span><i style="background:#cf9156;border-radius:50%"></i>除权除息日</span>':''}${zones.map(z=>`<span><i class="threshold-swatch ${z.side}"></i>${z.side==='buy'?'买入空间':'减仓空间'}：${kind==='price'?'价格':'股息率'} ${z.direction==='above'?(kind==='price'?'≥':'≥'):'≤'} ${kind==='price'?'¥':''}${value(z.value,kind==='price'?'':'%')}</span>`).join('')}</div></div>`;
 }
 function select(container,m,index,{show=true,onSelect}={}){
  const i=Math.max(0,Math.min(m.series.length-1,index)),p=m.series[i],sx=m.x(p),sy=Number.isFinite(p[m.k])?m.y(p[m.k]):m.top;
  const dot=container.querySelector('[data-chart-dot]');dot?.setAttribute('cx',sx);dot?.setAttribute('cy',sy);dot?.setAttribute('visibility',show&&Number.isFinite(p[m.k])?'visible':'hidden');
  const label=container.querySelector('.chart-point-readout');if(label)label.textContent=text(p,m.kind);
  const svg=container.querySelector('.history-plot');svg?.setAttribute('aria-label',text(p,m.kind)+'。方向键逐日查看，加减键缩放，0键还原。');
  const tip=container.querySelector('[data-chart-tooltip]');if(tip){tip.hidden=!show;if(show){tip.innerHTML=tooltip(p,m.kind);const width=container.clientWidth||m.w,tipWidth=tip.offsetWidth||230,anchor=sx/m.w*width;tip.style.left=Math.max(8,Math.min(width-tipWidth-8,anchor+(sx/m.w>.55?-tipWidth-12:12)))+'px';tip.style.top=(sy/m.h>.5?'14px':'auto');tip.style.bottom=(sy/m.h>.5?'auto':'38px')}}
  onSelect?.(i,p);return i;
 }
 function patch(container,next){
  const svg=container.querySelector('.history-plot'),incoming=next.querySelector('.history-plot');if(!svg||!incoming)return false;
  // Keep the captured SVG and its ancestors in the document throughout a
  // drag. Replacing the entire chart releases pointer capture on touch apps.
  for(const attr of incoming.attributes)svg.setAttribute(attr.name,attr.value);
  svg.innerHTML=incoming.innerHTML;
  for(const selector of ['.chart-range-note','.chart-window-summary','.chart-point-readout','.chart-interactions','.chart-legend']){
   const target=container.querySelector(selector),source=next.querySelector(selector);if(target&&source)target.innerHTML=source.innerHTML;
  }
  const tip=container.querySelector('[data-chart-tooltip]');if(tip)tip.hidden=true;
  return true;
 }
 function update(container,record,options){const template=document.createElement('template');template.innerHTML=render(record,options);return patch(container,template.content)}
 function attach({getModel,getContainer=()=>document.querySelector('[data-history-chart]'),onSelect,onViewChange}){
  const pointers=new Map();let gesture=null,lastTap=null;
  const find=e=>e.target.closest?.('.history-plot');
  const ratio=(x,m,rect)=>Math.max(0,Math.min(1,((x-rect.left)/rect.width*m.w-m.left)/m.plotWidth));
  const view=range=>onViewChange?.(range);
  const pick=(e,svg)=>{const m=getModel(),c=getContainer();if(!m||!c)return;const rect=svg.getBoundingClientRect();select(c,m,nearest(m.series,m.start+ratio(e.clientX,m,rect)*m.span),{onSelect})};
  const startGesture=()=>{const list=[...pointers.values()],m=getModel();if(!m||!list.length)return;const rect=list[0].rect;
   if(list.length>=2){const [a,b]=list,distance=Math.hypot(b.x-a.x,b.y-a.y)||1,center=(a.x+b.x)/2,r=ratio(center,m,rect);gesture={mode:'pinch',m,rect,distance,anchor:m.start+r*m.span,moved:true};}
   else gesture={mode:'pan',m,rect,x:list[0].x,y:list[0].y,moved:false,hadPinch:gesture?.mode==='pinch'||gesture?.hadPinch};
  };
  document.addEventListener('pointerdown',e=>{const svg=find(e);if(!svg||e.button>0)return;
   pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType,rect:svg.getBoundingClientRect()});startGesture();
   if(e.pointerType==='mouse'){e.preventDefault();svg.focus({preventScroll:true});pick(e,svg)}
   try{svg.setPointerCapture(e.pointerId)}catch{}
  });
  document.addEventListener('pointermove',e=>{
   if(pointers.has(e.pointerId)&&gesture){const p=pointers.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;const list=[...pointers.values()],g=gesture;
    if(list.length>=2){e.preventDefault();const [a,b]=list,d=Math.hypot(b.x-a.x,b.y-a.y)||1,span=g.m.span*g.distance/d,r=ratio((a.x+b.x)/2,g.m,g.rect);view(clampWindow([g.anchor-r*span,g.anchor+(1-r)*span],g.m.baseStart,g.m.baseEnd));return}
    const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.abs(dx)>7&&Math.abs(dx)>Math.abs(dy)){g.moved=true;e.preventDefault();view(panWindow(g.m,dx/(g.rect.width*g.m.plotWidth/g.m.w)))}return;
   }
   const svg=find(e);if(svg&&e.pointerType==='mouse')pick(e,svg);
  },{passive:false});
  document.addEventListener('pointerup',e=>{if(!pointers.has(e.pointerId))return;const g=gesture,p=pointers.get(e.pointerId);pointers.delete(e.pointerId);
   if(!pointers.size){if(g&&!g.moved&&!g.hadPinch){const svg=getContainer()?.querySelector('.history-plot');if(svg)pick(e,svg);
     if(e.pointerType==='touch'){const now=Date.now();if(lastTap&&now-lastTap.time<330&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<26){const m=getModel();view(m.zoomed?null:zoomWindow(m,2,ratio(e.clientX,m,p.rect)));lastTap=null}else lastTap={time:now,x:e.clientX,y:e.clientY}}
    }gesture=null;
   }else startGesture();
  });
  document.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);if(!pointers.size)gesture=null;else startGesture();lastTap=null});
  document.addEventListener('touchstart',e=>{if(e.touches.length>=2&&find(e))e.preventDefault()},{passive:false});
  document.addEventListener('dblclick',e=>{const svg=find(e),m=getModel();if(!svg||!m)return;e.preventDefault();view(m.zoomed?null:zoomWindow(m,2,ratio(e.clientX,m,svg.getBoundingClientRect())))});
  document.addEventListener('wheel',e=>{const svg=find(e),m=getModel();if(!svg||!m||!e.ctrlKey&&!e.metaKey)return;e.preventDefault();view(zoomWindow(m,Math.exp(Math.max(-.3,Math.min(.3,-e.deltaY*.005))),ratio(e.clientX,m,svg.getBoundingClientRect())))},{passive:false});
  document.addEventListener('pointerout',e=>{const svg=find(e);if(svg&&e.pointerType==='mouse'&&!pointers.size&&!svg.contains(e.relatedTarget)){const c=getContainer();const tip=c?.querySelector('[data-chart-tooltip]');if(tip)tip.hidden=true;c?.querySelector('[data-chart-dot]')?.setAttribute('visibility','hidden')}});
  document.addEventListener('keydown',e=>{if(!find(e))return;const m=getModel(),c=getContainer();if(!m||!c)return;
   const step=({ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1})[e.key];
   if(step&&e.shiftKey){e.preventDefault();view(panWindow(m,step<0?.5:-.5))}
   else if(step){e.preventDefault();select(c,m,m.selected+step,{onSelect})}
   else if(e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();view(panWindow(m,e.key==='PageUp'?.5:-.5))}
   else if(e.key==='Home'||e.key==='End'){e.preventDefault();select(c,m,e.key==='Home'?0:m.series.length-1,{onSelect})}
   else if(['+','=','-','0','Escape'].includes(e.key)){e.preventDefault();if(e.key==='Escape'){c.querySelector('[data-chart-dot]')?.setAttribute('visibility','hidden');const tip=c.querySelector('[data-chart-tooltip]');if(tip)tip.hidden=true}else view(e.key==='0'?null:zoomWindow(m,e.key==='-'?.5:2));}
  });
 }
 root.XijianChart={niceScale,dateTicks,nearest,createModel,render,text,select,attach,zoneRect,clampWindow,zoomWindow,panWindow,update,patch,spanText,enrichedSeries,linePath,metricInfo};
})(globalThis);
