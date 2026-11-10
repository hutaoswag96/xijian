import {analyze} from './engine.mjs';
export function personalResearch(input){const a=analyze(input);return {version:'personal-research-5.0',status:a.status,reason:a.reason,thresholds:a.thresholds,history:a.history,blockers:a.blockers,warnings:a.warnings,rate:a.rate,risk:a.risk,study:a.study,validation:a.validation,dividendGrowth:a.dividendGrowth,continuity:a.continuity};}
