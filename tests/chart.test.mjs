import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('public/history-chart.js','utf8'),ctx);const C=ctx.XijianChart;
const record={name:'测试公司',analysis:{asOf:'2026-11-03',series:Array.from({length:1096},(_,i)=>({date:new Date(Date.parse('2023-11-04')+i*86400000).toISOString().slice(0,10),close:50+i/100,yield:5-i/1000,ttmYield:5-i/1000,dividend:2.5,fiscalYield:4,fiscalDividend:2,fiscalYear:'2024'})),thresholds:{buyYield:5,sellYield:3,buyPrice:50,sellPrice:80}},dividends:[]};

test('yield and time axes adapt to width, including days when zoomed into a short period',()=>{
 const s=C.niceScale([3.1,5.99]);assert.ok(s.ticks.length>=5);assert.ok(s.lo<=3.1&&s.hi>=5.99);
 assert.equal(C.niceScale([0,1]).digits,2);assert.equal(C.niceScale([0,10]).digits,1);
 assert.ok(C.dateTicks('2023-11-03','2026-11-03',640).length>C.dateTicks('2023-11-03','2026-11-03',240).length);
 const ticks=C.dateTicks('2026-10-20','2026-11-03',300);assert.ok(ticks.length>=2);assert.notEqual(ticks[0].label,ticks.at(-1).label);
});
test('selection finds real trading dates around weekends and outside edges',()=>{
 const s=[{date:'2026-10-30'},{date:'2026-11-02'},{date:'2026-11-03'}];assert.equal(C.nearest(s,Date.parse('2026-11-01')),1);assert.equal(C.nearest(s,Date.parse('2020-01-01')),0);assert.equal(C.nearest(s,Date.parse('2030-01-01')),2);
});
test('phone charts devote most of their width to data and keep endpoint labels inside the plot',()=>{
 for(const width of [288,304,359,414]){
  const m=C.createModel(record,{width,height:230});assert.equal(m.w,width);assert.equal(m.h,230);assert.ok(m.plotWidth/width>.83);
  const ticks=C.dateTicks(m.series[0].date,m.series.at(-1).date,m.plotWidth);assert.ok(ticks.length>=3);assert.equal(ticks[0].date,m.series[0].date);assert.equal(ticks.at(-1).date,m.series.at(-1).date);
  const html=C.render(record,{width,height:230});assert.match(html,/text-anchor="start" class="chart-axis-label"/);assert.match(html,/text-anchor="end" class="chart-axis-label"/);
 }
 const landscape=C.createModel(record,{width:796,height:180});assert.equal(landscape.w,796);assert.equal(landscape.h,180);assert.ok(landscape.plotWidth>700);
});
test('chart retains the main line and point tooltip, without a slider, permanent crosshair, or area below the line',()=>{
 const m=C.createModel(record),html=C.render(record);assert.ok(m.series.length>1000);assert.ok(html.includes('data-chart-tooltip'));assert.ok(html.includes('visibility="hidden"'));assert.ok(html.includes('tabindex="0"'));assert.ok(!html.includes('data-chart-zoom'));assert.ok(!html.includes('data-chart-pan'));assert.ok(!html.includes('chart-zoom-buttons'));
 assert.ok(!html.includes('chartScrub'));assert.ok(!html.includes('data-cross-x'));assert.ok(!html.includes('data-cross-y'));assert.ok(!html.includes('opacity=".055"'));assert.ok(!html.includes('data-space='));
});
function harness(source=record,period='3y'){
 const handlers={},nodes=new Map();let viewWindow=null,selectedDate=null,picked=null;
 const getModel=()=>C.createModel(source,{period,width:360,viewWindow,selectedDate});
 const node=s=>{if(!nodes.has(s))nodes.set(s,{style:{},attrs:{},setAttribute(k,v){this.attrs[k]=v}});return nodes.get(s)};
 const container={clientWidth:360,querySelector:s=>s==='.history-plot'?svg:node(s)};
 const svg={closest:s=>s==='.history-plot'?svg:s==='[data-history-chart]'?container:null,getBoundingClientRect:()=>({left:10,width:360}),setPointerCapture(){},contains:()=>false,focus(){},setAttribute(k,v){node('svg').attrs[k]=v}};
 ctx.document={addEventListener:(name,fn)=>handlers[name]=fn,querySelector:()=>container};
 C.attach({getModel,getContainer:()=>container,onSelect:(i,p)=>{selectedDate=p.date;picked=i},onViewChange:r=>{viewWindow=r}});
 const emit=(type,extra={})=>{let prevented=false;const e={type,target:svg,pointerId:1,pointerType:'touch',button:0,clientX:180,clientY:120,preventDefault(){prevented=true},...extra};handlers[type](e);return prevented};
 return {getModel,container,node,emit,getWindow:()=>viewWindow,getPicked:()=>picked};
}
test('tap and mouse hover show the exact date and yield without adding persistent guide lines',()=>{
 const h=harness();h.emit('pointerdown');h.emit('pointerup');assert.ok(h.getPicked()!==null);assert.match(h.node('.chart-point-readout').textContent,/股息率/);assert.equal(h.node('[data-chart-dot]').attrs.visibility,'visible');assert.ok(h.node('[data-chart-tooltip]').innerHTML.includes('未复权股价'));
 h.emit('pointermove',{pointerType:'mouse',clientX:10+h.getModel().left});assert.equal(h.getPicked(),0);
});
test('pinch spreads fingers to zoom in around their center, and moving the zoomed view remains bounded',()=>{
 const h=harness(),before=h.getModel();h.emit('pointerdown',{pointerId:1,clientX:120});h.emit('pointerdown',{pointerId:2,clientX:240});h.emit('pointermove',{pointerId:1,clientX:80});h.emit('pointermove',{pointerId:2,clientX:280});
 const after=h.getModel();assert.ok(after.span<before.span*.7);assert.ok(after.start>=after.baseStart);assert.ok(after.end<=after.baseEnd);
 h.emit('pointerup',{pointerId:2,clientX:280});h.emit('pointerup',{pointerId:1,clientX:80});
 const center=(after.start+after.end)/2;h.emit('pointerdown',{clientX:160});h.emit('pointermove',{clientX:220});h.emit('pointerup',{clientX:220});const panned=h.getModel();assert.ok((panned.start+panned.end)/2<center);assert.ok(panned.start>=panned.baseStart);
});
test('double tap zooms and double tap again restores the selected year range',()=>{
 const h=harness();for(let i=0;i<2;i++){h.emit('pointerdown');h.emit('pointerup')}assert.equal(h.getModel().zoomed,true);
 for(let i=0;i<2;i++){h.emit('pointerdown');h.emit('pointerup')}assert.equal(h.getWindow(),null);assert.equal(h.getModel().zoomed,false);
});
test('vertical one-finger movement leaves page scrolling available; two-finger chart gestures are handled locally',()=>{
 const h=harness();h.emit('pointerdown');assert.equal(h.emit('pointermove',{clientY:160,clientX:182}),false);assert.equal(h.getWindow(),null);h.emit('pointercancel');
 assert.equal(h.emit('touchstart',{touches:[{},{}]}),true);
});
test('keyboard arrows select adjacent days, plus/minus zoom, and zero restores the range',()=>{
 const h=harness();h.emit('keydown',{key:'ArrowLeft'});const i=h.getPicked();h.emit('keydown',{key:'ArrowLeft'});assert.equal(h.getPicked(),i-1);
 h.emit('keydown',{key:'+'});assert.equal(h.getModel().zoomed,true);h.emit('keydown',{key:'0'});assert.equal(h.getModel().zoomed,false);
});
test('zoom math enforces a two-week minimum and clamps panning and zoom-out to the available history',()=>{
 const m=C.createModel(record);const near=C.zoomWindow(m,100000,.2);assert.ok(near[1]-near[0]>=14*86400000);const n=C.createModel(record,{viewWindow:near});const left=C.panWindow(n,10000),right=C.panWindow(n,-10000);assert.equal(left[0],m.baseStart);assert.equal(right[1],m.baseEnd);
 const full=C.zoomWindow(n,.00001);assert.equal(full[0],m.baseStart);assert.equal(full[1],m.baseEnd);
});
test('1/3/5/10-year selections remain distinct, and short histories show every available day without padding',()=>{
 const series=[];for(let t=Date.parse('2015-01-01');t<=Date.parse('2026-11-03');t+=86400000)series.push({date:new Date(t).toISOString().slice(0,10),close:50,yield:5,ttmYield:5});const r={...record,analysis:{...record.analysis,series}};
 for(const [period,cutoff] of [['1y','2025-11-03'],['3y','2023-11-03'],['5y','2021-11-03'],['10y','2016-11-03']]){const m=C.createModel(r,{period});assert.equal(m.series[0].date,cutoff);assert.equal(m.limited,false)}
 const short={...r,analysis:{...r.analysis,series:series.filter(p=>p.date>='2023-03-01')}};const m=C.createModel(short,{period:'10y'});assert.equal(m.series[0].date,'2023-03-01');assert.equal(m.series.length,short.analysis.series.length);assert.equal(m.limited,true);assert.match(C.render(short,{period:'10y'}),/历史不足 10 年/);
});
test('public charts never resurrect buy/sell lines or colored zones from legacy records',()=>{
 for(const kind of ['yield','price']){const m=C.createModel(record,{kind});assert.equal(m.zones.length,0);const html=C.render(record,{kind});assert.ok(!html.includes('data-threshold-line'));assert.ok(!html.includes('买入空间'));assert.ok(!html.includes('减仓空间'))}
});

test('a zoomed viewport can cross the ten-year history by keyboard without toolbar buttons',()=>{
 const series=[];for(let t=Date.parse('2016-11-04');t<=Date.parse('2026-11-03');t+=86400000)series.push({date:new Date(t).toISOString().slice(0,10),close:50,yield:5});
 const r={...record,analysis:{...record.analysis,series}},h=harness(r,'10y');
 for(let i=0;i<3;i++)h.emit('keydown',{key:'+'});const first=h.getModel();assert.ok(first.span<1.3*365.2425*86400000);
 for(let i=0;i<40;i++)h.emit('keydown',{key:'PageUp'});const early=h.getModel();assert.equal(early.start,early.baseStart);assert.ok(Math.abs(early.span-first.span)<1);
 for(let i=0;i<40;i++)h.emit('keydown',{key:'PageDown'});const late=h.getModel();assert.equal(late.end,late.baseEnd);assert.ok(Math.abs(late.span-first.span)<1);assert.ok(early.series.at(-1).date<late.series[0].date);
 h.emit('keydown',{key:'0'});assert.equal(h.getModel().zoomed,false);
});
test('viewport redraw preserves the exact SVG object that owns pointer capture',()=>{
 const stableSvg={innerHTML:'old graph',attrs:{},setAttribute(k,v){this.attrs[k]=v}},incomingSvg={innerHTML:'new graph',attributes:[{name:'viewBox',value:'0 0 360 260'}]};
 const oldParts=new Map(),newParts=new Map();for(const key of ['.chart-range-note','.chart-window-summary','.chart-point-readout','.chart-interactions','.chart-legend']){oldParts.set(key,{innerHTML:'old'});newParts.set(key,{innerHTML:'new'})}
 const tip={hidden:false};const old={querySelector:s=>s==='.history-plot'?stableSvg:s==='[data-chart-tooltip]'?tip:oldParts.get(s)},next={querySelector:s=>s==='.history-plot'?incomingSvg:newParts.get(s)};
 assert.equal(C.patch(old,next),true);assert.equal(old.querySelector('.history-plot'),stableSvg);assert.equal(stableSvg.innerHTML,'new graph');assert.equal(stableSvg.attrs.viewBox,'0 0 360 260');assert.equal(oldParts.get('.chart-window-summary').innerHTML,'new');assert.equal(tip.hidden,true);
});

test('removed actual-cash, fiscal-yield and payout chart modes cannot be rendered',()=>{
 for(const kind of ['ttm','fiscal','payout'])assert.equal(C.createModel(record,{kind}),null);
 const html=C.render(record);assert.ok(!html.includes('data-chart-pan'));assert.ok(!html.includes('data-chart-zoom'));assert.ok(!html.includes('实际12个月'));assert.ok(!html.includes('财年对照'));
});
test('all detail indicators share the price timeline, zoom window, date ticks and selected day despite missing history',()=>{
 const r={...record,detailMetrics:{valuations:record.analysis.series.slice(-30).map(p=>({date:p.date,pe:16,pb:2.6})),payoutTimeline:[{year:'2024',effectiveDate:'2025-06-18',payout:45}],latest:{}}};
 const opts={period:'3y',width:325,selectedDate:'2025-01-02',viewWindow:[Date.parse('2024-12-01'),Date.parse('2025-10-01')]},main=C.createModel(r,opts);
 for(const kind of ['pe','pb','price']){const m=C.createModel(r,{...opts,kind});assert.equal(m.start,main.start);assert.equal(m.end,main.end);assert.equal(m.series[m.selected].date,main.series[main.selected].date);assert.deepEqual(C.dateTicks(m.series[0].date,m.series.at(-1).date,m.plotWidth),C.dateTicks(main.series[0].date,main.series.at(-1).date,main.plotWidth));if(['pe','pb'].includes(kind))assert.equal(m.zones.length,0)}
 assert.equal(C.createModel(r,{...opts,kind:'pe'}).hasData,false);assert.match(C.render(r,{...opts,kind:'pe'}),/该区间暂无PE-TTM数据/);
});
test('missing valuation segments are never bridged or changed to zero',()=>{
 const r={...record,detailMetrics:{valuations:[{date:'2025-01-02',pe:10,pb:2},{date:'2025-01-06',pe:11,pb:2.1}],latest:{}}};
 const pe=C.createModel(r,{kind:'pe'}),path=C.linePath(pe);assert.equal((path.match(/M/g)||[]).length,2);assert.ok(!path.includes('L'));assert.ok(!path.includes('NaN'));assert.equal(C.enrichedSeries(r).find(p=>p.date==='2025-01-03').pe,null);
});

test('dividend research keeps the same yield history and gestures without decision-zone overlays',()=>{
 const a=C.createModel(record,{kind:'yield'}),b=C.createModel(record,{kind:'yield',showStrategyZones:false});
 assert.equal(a.zones.length,0);assert.equal(b.zones.length,0);assert.deepEqual(b.series,a.series);assert.equal(b.baseStart,a.baseStart);assert.equal(b.baseEnd,a.baseEnd);
});

test('private research overlays cover full high/low spaces; stale, blocked and data-only records cannot show active lines',()=>{
 const r={...record,analysis:{...record.analysis,research:{version:'personal-research-5.0',status:'hold',thresholds:record.analysis.thresholds}}};
 const y=C.createModel(r,{kind:'yield'}),p=C.createModel(r,{kind:'price'});assert.equal(y.zones.length,2);assert.equal(y.zones[0].direction,'above');assert.equal(y.zones[1].direction,'below');assert.equal(p.zones[0].direction,'below');assert.equal(p.zones[1].direction,'above');
 const rect=C.zoneRect(y,y.zones[0]);assert.equal(rect.y,y.top);assert.equal(C.createModel({...r,stale:true}).zones.length,0);assert.equal(C.createModel({...r,analysis:{...r.analysis,research:{...r.analysis.research,status:'review'}}}).zones.length,0);assert.equal(C.createModel(r,{showStrategyZones:false}).zones.length,0);
});
