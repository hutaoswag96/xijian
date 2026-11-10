(function(root){'use strict';
 function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v}
 const content=b=>b?{version:3,watch:b.watch,workspace:b.workspace,prefs:b.prefs}:null;
 const stamp=b=>JSON.stringify(canonical(content(b)));
 function hasRecords(b){return !!(b&&(b.watch?.length||['groups','featured','ledger','pending','receipts'].some(k=>b.workspace?.[k]?.length)||b.prefs?.researchRisk!=='balanced'||b.prefs?.chartPeriod!=='3y'))}
 function decision({local,remote,base,sameOwner}){
  if(stamp(local)===stamp(remote))return 'equal';
  if(!sameOwner&&hasRecords(local))return 'conflict';
  if(!remote){if(base&&hasRecords(local))return 'conflict';return 'push'}
  if(!hasRecords(local)&&!base)return 'pull';
  if(base){const l=stamp(local)===stamp(base),r=stamp(remote)===stamp(base);if(l)return 'pull';if(r)return 'push'}
  return 'conflict';
 }
 root.XijianSyncCore={content,stamp,hasRecords,decision};
})(globalThis);
