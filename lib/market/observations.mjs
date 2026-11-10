// Objective observations only. No thresholds, ranking, forecasts or trade advice.
import {chinaDate,periodDividendBasis,annualDividends,inferIndustry,shiftYears} from './engine.mjs';
export const DATA_VERSION='dividend-data-4.0.0';
const rounded=n=>Number.isFinite(n)?Number(n.toFixed(6)):null;
export function observe({quote,prices=[],events=[],income=[],asOf=chinaDate()}){
 const date=quote?.date||prices.at(-1)?.date||asOf,price=quote?.price||prices.at(-1)?.close||null;
 const rawBasis=periodDividendBasis(events,date),{blockers,...base}=rawBasis;
 const basis={...base,id:'implemented-period-reference-v4',label:'参考股息率（已实施分红，按所属期间替换）'};
 const financial=income.filter(f=>f.noticeDate&&f.noticeDate<=asOf).sort((a,b)=>b.reportDate.localeCompare(a.reportDate))[0]||null;
 const start=shiftYears(date,-10),series=prices.filter(p=>p.date<=date&&p.date>=start).map(p=>{
  const b=periodDividendBasis(events,p.date);return {date:p.date,close:p.close,open:p.open,dividend:b.cashPerShare,yield:b.cashPerShare!==null&&p.close>0?rounded(b.cashPerShare/p.close*100):null,dividendCount:b.components.length};
 });
 return {version:DATA_VERSION,asOf:date,price,yield:basis.cashPerShare!==null&&price>0?rounded(basis.cashPerShare/price*100):null,ordinaryDividend:basis.cashPerShare,basis,
  industry:{name:inferIndustry(financial,quote?.name||'').name},financial,annual:annualDividends(events,date),series,
  history:{samples:series.length},note:'仅展示已公告、已实施分红与历史价格的算术结果；不计算买卖参考价，不生成操作建议。参考股息率不等同于滚动12个月或含预案口径。'};
}
