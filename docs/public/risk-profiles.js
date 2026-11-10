(function(root){
 'use strict';
 // Shared by the browser and the rule engine: percentages are policy assumptions.
 const profiles=Object.freeze([
  {id:'cautious',label:'稳健',buyQuantile:.8,premiumDelta:.4,description:'等待更高股息位置，买入门槛最严格'},
  {id:'moderate',label:'偏稳健',buyQuantile:.75,premiumDelta:.2,description:'介于稳健与均衡之间，适度增加可评估区间'},
  {id:'balanced',label:'均衡',buyQuantile:.7,premiumDelta:0,description:'历史P70起评估，比旧版P75适度放宽'},
  {id:'growth',label:'进取',buyQuantile:.6,premiumDelta:-.2,description:'从历史P60起评估，接受较低股息率与较高买入价'},
  {id:'aggressive',label:'激进',buyQuantile:.5,premiumDelta:-.5,description:'从历史中位数起评估，估值余量更小，波动承受要求更高'}
 ].map(Object.freeze));
 const get=id=>profiles.find(p=>p.id===id)||profiles[2];
 root.XijianRisk=Object.freeze({profiles,get,valid:id=>profiles.some(p=>p.id===id)});
})(globalThis);
