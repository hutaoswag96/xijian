import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),out=path.join(root,'docs');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
fs.cpSync('public',out,{recursive:true});fs.mkdirSync(path.join(out,'public'),{recursive:true});for(const name of ['risk-profiles.js','investment-state.js'])fs.copyFileSync('public/'+name,path.join(out,'public',name));
fs.cpSync('lib/market',path.join(out,'lib/market'),{recursive:true});let provider=fs.readFileSync(path.join(out,'lib/market/providers.mjs'),'utf8').replace('new TextDecoder(encoding)','new TextDecoder(\'utf-8\')');fs.writeFileSync(path.join(out,'lib/market/providers.mjs'),provider);
fs.copyFileSync('github/pages-bridge.js',path.join(out,'pages-bridge.js'));
let html=fs.readFileSync('frontend/index.html','utf8').replaceAll('src="/','src="./').replaceAll('href="/','href="./');html=html.replace('<script src="./icons.js','<script src="./pages-bridge.js?v=1" defer></script><script src="./icons.js');
html=html.replace('<main id="main"', '<div class="github-notice" id="githubDataMode">GitHub访问版 · 行情直接查询，失败时尝试带日期的快照 · 个人记录仅保存在本机</div><main id="main"');html=html.replace('仅供本人研究','个人研究参考');
fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'.nojekyll'),'');
fs.appendFileSync(path.join(out,'workspace.css'),'\n.github-notice{margin:12px 24px 0;padding:9px 12px;font-size:11px;line-height:1.7;color:#66746a;background:#f3f5ed;border-radius:8px}@media(max-width:600px){.github-notice{margin:10px 16px 0}}\n');
let mine=fs.readFileSync(path.join(out,'mine-ui.js'),'utf8');const a=mine.indexOf('function mineAccount('),b=mine.indexOf('\n',a);mine=mine.slice(0,a)+`function mineAccount(){return \`\${mineHeading('本机备份与恢复')}<div class="mine-subpage"><section class="mine-panel"><h2>GitHub访问版使用本机记录</h2><p>不需要ChatGPT账号。自选、持仓、交易和到账分红只保存在当前浏览器，不会上传到公开仓库。原网站账号备份不会在这里公开或自动迁移。</p><a class="btn primary" href="#mine/data">导出或恢复本机备份</a></section></div>\`}\n`+mine.slice(b+1);
mine=mine.replaceAll('主动保存 · 换设备恢复','本机导出 · 文件恢复').replaceAll('账号备份与恢复','本机备份与恢复').replaceAll('当前没有个股','当前没有个股');
const f=mine.indexOf('function mineFeedback('),e=mine.indexOf('\n',f);mine=mine.slice(0,f)+`function mineFeedback(){return \`\${mineHeading('问题反馈')}<div class="mine-subpage"><section class="mine-panel"><p>GitHub访问版没有独立反馈后端，不能显示虚假的提交成功。</p><a class="btn primary" href="https://github.com/hutaoswag96/xijian/issues/new" target="_blank" rel="noopener noreferrer">到GitHub反馈</a><p>请描述页面和操作，不要公开持仓、成本或其他个人信息。</p></section></div>\`}\n`+mine.slice(e+1);fs.writeFileSync(path.join(out,'mine-ui.js'),mine);
let app=fs.readFileSync(path.join(out,'app.js'),'utf8').replace('r.stale=false;r.loadingDetails','r.stale=r.snapshotExpired===true;r.loadingDetails');fs.writeFileSync(path.join(out,'app.js'),app);
console.log('GitHub Pages build prepared in docs/');

let ghMine=fs.readFileSync(path.join(out,'mine-ui.js'),'utf8');ghMine+=`
mineDocuments.privacy={intro:'GitHub访问版使用本机记录，不接入原网站账号备份。',sections:[['个人记录','自选、持仓、交易和到账分红保存在当前浏览器。不会上传到公开仓库。请导出文件保存，更换设备时可导入。'],['行情查询','浏览器会向公开行情来源请求股票代码等查询资料；第三方可能看到网络请求信息，不会接收持仓成本或完整账本。'],['数据快照','仓库只保存公开市场数据。快照会标注日期，过期时暂停参考，不冒充实时行情。'],['反馈','GitHub反馈需自行登录GitHub并主动提交；请勿公开个人持仓、密码或其他敏感信息。']]};
mineDocuments.help.sections=mineDocuments.help.sections.map(v=>v[0]==='备份与恢复'?['备份与恢复','本版仅本机保存，请在数据管理导出完整文件，在其他设备导入。恢复会替换本机记录，不自动合并。']:v);
mineDocuments.about.sections=mineDocuments.about.sections.filter(v=>v[0]!=='账号与发布');
`;fs.writeFileSync(path.join(out,'mine-ui.js'),ghMine);

let terms=fs.readFileSync(path.join(out,'mine-ui.js'),'utf8');terms+='\nmineDocuments.terms.intro="GitHub网页访问版：公开资料计算与个人本机记录。";\nmineDocuments.terms.sections=mineDocuments.terms.sections.map(v=>v[0]==="功能范围"?["功能范围","提供股息资料、历史位置和透明规则参考，个人记录保存在本机。不自动下单、不保证收益；网页上线不代表取得投顾、行情分发或小程序资质。"]:v);\n';fs.writeFileSync(path.join(out,'mine-ui.js'),terms);
