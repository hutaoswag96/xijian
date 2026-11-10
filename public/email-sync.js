'use strict';
const EMAIL_SYNC_ORIGIN='https://xijian-sync-tao-1110.hutaobest.chatgpt.site';
const EMAIL_META_KEY='xijian_email_sync_meta_v1',EMAIL_SESSION_KEY='xijian_email_session_v1';
let emailStaleTab=false,emailDeleteConfirm=false;
let emailSession=null,emailMeta={},emailBooted=false,emailBusy=false,emailApplying=false,emailTimer=null,emailConflict=null,emailRecovery=null,emailFormMode='login',emailPaused=false,emailStatus='游客模式 · 记录保存在本机',emailError='';
try{emailSession=JSON.parse(sessionStorage.getItem(EMAIL_SESSION_KEY)||'null');emailMeta=JSON.parse(localStorage.getItem(EMAIL_META_KEY)||'{}');if(!emailMeta||typeof emailMeta!=='object'||Array.isArray(emailMeta))emailMeta={};if(emailSession&&typeof emailSession!=='object')emailSession=null}catch{}
function emailLocal(){if(workspaceLoadError)throw Error('本机资料校验未通过，请先导出检查');const c=XijianInvestments.importBackup(backupData());return {version:3,...c}}
function emailMetaSave(value){localStorage.setItem(EMAIL_META_KEY,JSON.stringify(value));emailMeta=value}
function emailPaint(force=false){Object.assign(accountState,{loaded:true,loading:false,authenticated:!!emailSession?.user,hasBackup:!!emailMeta.base,backupAvailable:!!emailSession?.user,user:emailSession?.user||null});if(currentPage()==='mine'&&['home','account','data'].includes(mineSection())&&(force||!document.activeElement?.closest?.('#emailAuthForm')))render();const profile=document.querySelector('.mine-account small');if(profile)profile.textContent=emailStatus}
async function emailRequest(path,{method='GET',body,anonymous=false}={}){
 let r;try{r=await window.XijianAccountFetch(new URL(path,EMAIL_SYNC_ORIGIN),{method,mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json',...(!anonymous&&emailSession?.token?{Authorization:'Bearer '+emailSession.token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)})}catch{throw Error('未连接到云端，本机记录已保留；可稍后重试或导出文件')}
 let data;try{data=await r.json()}catch{throw Error('同步服务返回异常，本机记录已保留')}
 if(!r.ok){if(r.status===401&&!anonymous){emailPaused=true;emailStatus='登录已过期 · 本机记录保留'}throw Object.assign(Error(data.error||'同步未完成'),{status:r.status})}return data;
}
function emailSaveSession(data){const s={user:data.user,token:data.token,expiresAt:data.expiresAt};sessionStorage.setItem(EMAIL_SESSION_KEY,JSON.stringify(s));emailSession=s}
function beforeEmailMutation(){if(emailApplying)return;if(emailStaleTab)throw Error('其他标签页已更新本机资料，请刷新本页再修改');let current;try{current=JSON.parse(localStorage.getItem(EMAIL_META_KEY)||'{}')}catch{throw Error('同步信息读取失败，请先导出备份')};if(emailSession?.user&&current.ownerId&&current.ownerId!==emailSession.user.id)throw Error('本机记录属于其他账号，请先在“我的→邮箱登录与同步”处理');if(emailSession?.user&&emailMeta.ownerId&&current.ownerId!==emailMeta.ownerId)throw Error('其他标签页切换了账号，请刷新后再操作')}
function queueEmailSync(){if(emailApplying||!emailSession?.user||emailPaused||emailMeta.enabled!==true)return;clearTimeout(emailTimer);emailStatus='已存本机 · 等待同步';emailTimer=setTimeout(()=>void syncEmailData(),1200)}
function pauseEmailForLocalClear(){if(emailBusy)throw Error('正在同步，请完成后再清除本机记录');emailPaused=true;clearTimeout(emailTimer);emailConflict=null;emailStatus='已清除本机 · 自动同步已暂停';emailMetaSave({...emailMeta,base:null,enabled:false});emailPaint()}
function emailSnapshot(){const b=emailLocal();const k='xijian_before_cloud_restore_v1';localStorage.setItem(k,JSON.stringify(b));return b}
async function emailApply(backup,revision,updatedAt){
 emailSnapshot();emailApplying=true;
 try{await restoreUserBackup(backup);emailMetaSave({ownerId:emailSession.user.id,base:emailLocal(),revision,updatedAt,enabled:true});emailPaused=false;emailConflict=null;emailStatus='已同步 · '+new Date(updatedAt||Date.now()).toLocaleString('zh-CN');emailError=''}finally{emailApplying=false}
}
async function syncEmailData(){
 if(emailBusy||!emailSession?.user||emailPaused)return;emailBusy=true;emailStatus='正在同步…';
 try{
  beforeEmailMutation();const accountId=emailSession.user.id,remote=await emailRequest('/v1/data');if(emailSession?.user?.id!==accountId)return;
  const local=emailLocal(),sameOwner=emailMeta.ownerId===accountId||!emailMeta.ownerId,base=emailMeta.ownerId===accountId?emailMeta.base:null;
  const choice=XijianSyncCore.decision({local,remote:remote.backup,base,sameOwner});
  if(choice==='conflict'){
   emailConflict=remote;emailStatus='记录不同 · 请先选择保留方式';emailError='本机和云端各自保留，选择前不会覆盖任何一份。';return;
  }
  if(choice==='pull'){await emailApply(remote.backup,remote.revision,remote.updatedAt);return}
  let saved=remote;if(choice==='push')saved=await emailRequest('/v1/data',{method:'PUT',body:{revision:remote.revision,backup:local}});
  emailMetaSave({ownerId:accountId,base:local,revision:saved.revision,updatedAt:saved.updatedAt,enabled:true});emailConflict=null;emailError='';emailStatus='已同步 · '+new Date(saved.updatedAt||Date.now()).toLocaleString('zh-CN');
  if(XijianSyncCore.stamp(emailLocal())!==XijianSyncCore.stamp(local))queueEmailSync();
 }catch(e){emailError=e.message;emailStatus=e.status===409?'另一设备有更新 · 请重新同步':'未同步 · 本机记录保留'}finally{emailBusy=false;emailPaint()}
}
async function loadAccount(){if(emailBooted)return;emailBooted=true;accountState.loaded=true;
 if(!emailSession?.token){emailPaint();return}
 try{const r=await emailRequest('/v1/session');emailSession.user=r.user;
  if(emailMeta.ownerId&&emailMeta.ownerId!==r.user.id&&XijianSyncCore.hasRecords(emailLocal())){emailConflict=await emailRequest('/v1/data');emailPaused=true;emailStatus='本机来自其他账号 · 请选择恢复方式'}
  else if(emailMeta.enabled===false&&emailMeta.ownerId===r.user.id){emailPaused=true;emailStatus='自动同步已暂停 · 云端记录保留'}
  else{if(emailMeta.ownerId&&emailMeta.ownerId!==r.user.id)emailMetaSave({ownerId:r.user.id,base:null,enabled:true});await syncEmailData()}
 }catch(e){emailError=e.message;emailStatus='登录或网络待恢复 · 本机记录保留'}finally{emailPaint()}}
function emailCount(b){return b?`${b.watch.length}只自选 · ${b.workspace.groups.length}个分组 · ${b.workspace.ledger.length}条交易 · ${b.workspace.receipts.length}条分红`:'暂无云端记录'}
function emailAuthForm(){const mode=emailFormMode,register=mode==='register',recover=mode==='recover';return `<form id="emailAuthForm" class="mine-panel email-auth-form"><h2>${register?'免费创建账号':recover?'使用恢复码重设密码':'邮箱登录'}</h2><p>邮箱只作登录名，不发送验证邮件。请使用专属密码；注册后请保存恢复码。</p><div class="form-row"><label for="emailLogin">邮箱</label><input id="emailLogin" name="email" type="email" autocomplete="username" maxlength="254" required></div>${recover?'<div class="form-row"><label for="emailRecovery">账号恢复码</label><input id="emailRecovery" name="recoveryCode" autocomplete="off" required></div>':''}<div class="form-row"><label for="emailPassword">${recover?'新密码':'密码'}</label><input id="emailPassword" name="password" type="password" autocomplete="${register||recover?'new-password':'current-password'}" minlength="12" maxlength="128" required><p>至少12个字符，可使用密码管理器。密码和恢复码都丢失时无法找回。</p></div>${register||recover?'<div class="form-row"><label for="emailConfirmPassword">再次输入密码</label><input id="emailConfirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>':''}<p class="workspace-form-error" data-email-form-error role="alert" hidden></p><button class="btn primary" type="submit">${register?'注册并登录':recover?'重设密码':'登录'}</button><div class="email-auth-tabs"><button class="text-link" type="button" data-email-action="mode" data-mode="${register||recover?'login':'register'}">${register||recover?'已有账号，去登录':'免费注册'}</button>${recover?'':'<button class="text-link" type="button" data-email-action="mode" data-mode="recover">忘记密码</button>'}</div><p>登录后会上传自选、持仓、交易、分红到账和偏好至账号存储。查看<a href="#mine/privacy">隐私说明</a>。关闭此标签页后需重新登录。</p></form>`}
function mineAccount(){const user=emailSession?.user,foreign=user&&emailMeta.ownerId&&emailMeta.ownerId!==user.id;
 return `${mineHeading('邮箱登录与同步','游客可继续使用；登录后同步个人记录。')}<div class="mine-subpage">${emailRecovery?`<section class="mine-panel email-recovery"><h2>请先保存账号恢复码</h2><p>不发送找回邮件。此码可以重设密码，请妥善保存，不要交给他人。</p><code>${esc(emailRecovery)}</code><button class="btn primary" data-email-action="save-recovery">下载恢复码</button><button class="btn" data-email-action="ack-recovery">我已妥善保存</button></section>`:''}${user?`<section class="mine-panel"><div class="email-account-heading"><span class="mine-avatar">${icon('user')}</span><div><h2>${esc(user.email)}</h2><p>邮箱登录名 · 未验证邮箱归属</p></div></div><p class="email-sync-status" role="status">${esc(emailStatus)}</p>${emailError?`<p class="workspace-form-error" role="alert">${esc(emailError)}</p>`:''}<p>自选、分组、精选、持仓、交易、到账分红和研究偏好自动同步。行情不上传。页面打开时检查其他设备更新。</p><div class="account-backup-actions"><button class="btn primary" data-email-action="sync" ${emailBusy?'disabled':''}>${emailBusy?'正在同步…':'立即同步'}</button><button class="btn" data-email-action="pause">${emailPaused?'恢复自动同步':'暂停自动同步'}</button></div></section>${emailConflict?`<section class="mine-panel email-sync-conflict"><h2>${foreign?'切换账号前处理本机记录':'两份记录存在差异'}</h2><p>本机：${esc(emailCount(emailLocal()))}</p><p>云端：${esc(emailCount(emailConflict.backup))}</p><p>选择前请下载备份；恢复云端时另存一份本机恢复副本。</p><div class="account-backup-actions"><button class="btn" data-email-action="export-both">下载两份备份</button>${foreign?'':`<button class="btn" data-email-action="choose-local">以本机为准上传</button>`}<button class="btn primary" data-email-action="choose-cloud">${emailConflict.backup?'以云端为准恢复':'备份本机并从空白开始'}</button></div></section>`:''}<section class="mine-menu">${mineRow({label:'导出本机备份',symbol:'download',action:'export'})}<button class="mine-row" data-email-action="logout"><span class="mine-row-copy"><b>退出账号</b><small>本机记录保留，自动同步暂停</small></span>${icon('chevron')}</button></section><details class="mine-panel"><summary>账号与云端数据管理</summary><p>删除云端不删除本机；删除后会暂停自动同步。注销会永久删除该账号与云端记录。</p><button class="btn" data-email-action="delete-cloud">删除云端记录</button><button class="btn" data-email-action="delete-account">注销息见账号</button>${emailDeleteConfirm?'<form id="emailDeleteForm"><div class="form-row"><label for="deleteAccountPassword">账号密码</label><input type="password" id="deleteAccountPassword" name="password" autocomplete="current-password" required></div><div class="form-row"><label for="deleteAccountText">请输入“注销息见账号”</label><input id="deleteAccountText" name="confirmation" required></div><p data-email-delete-error role="alert" hidden></p><button class="btn" type="submit">永久注销</button></form>':''}</details>`:emailAuthForm()}<section class="mine-panel"><h2>本机备份仍可使用</h2>${emailStaleTab?'<button class="btn primary" data-email-action="reload">刷新并读取最新记录</button>':''}<p>免费试用不要求购买服务器。服务或网络不可用时，仍可导出文件、在其他设备导入。原私人网站的数据不会自动迁移。</p><a class="text-link" href="#mine/data">导出和恢复文件${icon('arrow')}</a><button class="text-link" data-email-action="previous-copy">下载上次恢复前的本机副本</button></section></div>`}
async function emailResolve(which){
 const remote=await emailRequest('/v1/data');emailConflict=remote;
 if(which==='local'){
  beforeEmailMutation();if(!confirm('用本机完整记录替换当前云端？请确认已下载两份备份。'))return;
  const local=emailLocal(),saved=await emailRequest('/v1/data',{method:'PUT',body:{revision:remote.revision,backup:local}});emailMetaSave({ownerId:emailSession.user.id,base:local,revision:saved.revision,updatedAt:saved.updatedAt,enabled:true});emailPaused=false;emailConflict=null;emailError='';emailStatus='已按本机记录同步';
 }else{
  if(!confirm('恢复当前云端记录？本机会替换，替换前另存恢复副本。'))return;
  const blank={version:3,watch:[],workspace:XijianInvestments.empty(),prefs:{chartPeriod:'3y',researchRisk:'balanced'}};
  await emailApply(remote.backup||blank,remote.revision,remote.updatedAt);
 }
}
document.addEventListener('submit',async e=>{if(e.target.id!=='emailAuthForm')return;e.preventDefault();const form=e.target,button=form.querySelector('[type=submit]'),error=form.querySelector('[data-email-form-error]'),f=new FormData(form),mode=emailFormMode;button.disabled=true;error.hidden=true;
 try{if(mode!=='login'&&f.get('password')!==f.get('confirmPassword'))throw Error('两次输入的密码不一致');const data=await emailRequest('/v1/'+({login:'login',register:'register',recover:'recover'})[mode],{method:'POST',anonymous:true,body:{email:f.get('email'),password:f.get('password'),...(mode==='recover'?{recoveryCode:f.get('recoveryCode')}:{})}});emailSaveSession(data);emailRecovery=data.recoveryCode||null;emailError='';emailPaused=false;form.reset();
  if(emailMeta.ownerId&&emailMeta.ownerId!==data.user.id&&XijianSyncCore.hasRecords(emailLocal())){emailConflict=await emailRequest('/v1/data');emailPaused=true;emailStatus='本机来自其他账号 · 请选择恢复方式'}else{if(emailMeta.ownerId&&emailMeta.ownerId!==data.user.id)emailMetaSave({ownerId:data.user.id,base:null,enabled:true});await syncEmailData()}emailPaint(true);
 }catch(err){error.hidden=false;error.textContent=err.message;error.focus?.()}finally{button.disabled=false}});
document.addEventListener('click',async e=>{const el=e.target.closest('[data-email-action]');if(!el)return;const action=el.dataset.emailAction;if(emailBusy&&action!=='save-recovery')return;el.disabled=true;
 try{
  if(action==='reload'){location.reload();return}if(action==='mode'){emailFormMode=el.dataset.mode;emailError='';emailPaint(true);return}
  if(action==='save-recovery'){downloadLocalJSON({email:emailSession?.user?.email,recoveryCode:emailRecovery,note:'息见账号恢复码，可重设密码，请保密。'},'息见-账号恢复码.json');return}
  if(action==='ack-recovery'){emailRecovery=null;emailPaint();return}
  if(action==='sync'){emailPaused=false;await syncEmailData();return}
  if(action==='pause'){emailPaused=!emailPaused;emailMetaSave({...emailMeta,enabled:!emailPaused});emailStatus=emailPaused?'自动同步已暂停 · 本机与云端保留':'正在恢复同步';if(!emailPaused)await syncEmailData()}
  if(action==='export-both'){downloadLocalJSON(emailLocal(),'息见-冲突前本机备份.json');if(emailConflict?.backup)downloadLocalJSON(emailConflict.backup,'息见-冲突前云端备份.json')}
  if(action==='choose-local'||action==='choose-cloud')await emailResolve(action==='choose-local'?'local':'cloud');
  if(action==='previous-copy'){const raw=localStorage.getItem('xijian_before_cloud_restore_v1');if(!raw)throw Error('暂无恢复前的本机副本');downloadLocalJSON(JSON.parse(raw),'息见-恢复前本机副本.json')}
  if(action==='logout'){
   if(!confirm('退出账号？未同步的本机记录会保留。共用设备请随后清除本机记录。'))return;
   try{await emailRequest('/v1/logout',{method:'POST',body:{}})}catch{}sessionStorage.removeItem(EMAIL_SESSION_KEY);emailSession=null;emailRecovery=null;emailConflict=null;emailPaused=true;emailMetaSave({...emailMeta,enabled:false});emailStatus='已退出 · 记录保留在本机';emailError='';
  }
  if(action==='delete-cloud'){
   if(prompt('输入“删除云端记录”确认。本机保留，自动同步将暂停。')!=='删除云端记录')return;
   const remote=await emailRequest('/v1/data');const r=await emailRequest('/v1/data',{method:'DELETE',body:{revision:remote.revision,confirmation:'删除云端记录'}});emailPaused=true;emailConflict=null;emailMetaSave({...emailMeta,base:null,revision:r.revision,enabled:false});emailStatus='云端记录已删除 · 自动同步暂停';
  }
  if(action==='delete-account'){emailDeleteConfirm=true;emailPaint(true)}
 }catch(err){emailError=err.message;toast(err.message)}finally{el.disabled=false;emailPaint(true)}});
window.addEventListener('online',()=>{if(!emailPaused)void syncEmailData()});
window.addEventListener('storage',e=>{if(['xijian_live_v1_watch','xijian_live_v1_workspaceExtras','xijian_live_v1_preferences'].includes(e.key)){emailStaleTab=true;emailPaused=true;emailStatus='其他标签页已修改记录 · 请刷新本页';emailPaint();return}if(e.key===EMAIL_META_KEY&&emailSession?.user){try{const current=JSON.parse(e.newValue||'{}');if(current.ownerId!==emailSession.user.id){emailPaused=true;emailStatus='其他标签页切换了账号 · 请刷新';emailPaint()}}catch{emailPaused=true}}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!emailPaused)void syncEmailData()});
document.addEventListener('DOMContentLoaded',()=>{void loadAccount();setInterval(()=>{if(!document.hidden&&!emailPaused)void syncEmailData()},30000)});
window.addEventListener('beforeunload',e=>{if(emailSession?.user&&emailMeta.enabled&&!emailPaused&&XijianSyncCore.stamp(emailLocal())!==XijianSyncCore.stamp(emailMeta.base)){e.preventDefault();e.returnValue=''}});
mineTitles.account='邮箱登录与同步';
mineDocuments.privacy={intro:'游客记录只在本机；邮箱登录后启用账号同步。',sections:[['账号与密码','邮箱作为未验证的登录名，不发送验证邮件或密码找回邮件。服务器保存独立盐值与密码校验值，不保存明文密码。恢复码只显示一次，服务端仅保存其校验值。登录凭据保存在当前标签页会话中。'],['同步记录','登录后将自选、分组、精选、持仓、交易、到账分红及偏好上传至账号存储。数据按账号隔离并加密存储；并非端到端加密，服务运营方可管理服务。个人记录不写入公开GitHub仓库，也不提供给行情数据源。'],['同步与冲突','页面打开期间自动检查和保存。同一份资料被两台设备分别修改时，暂停覆盖并保留两份记录供你选择。恢复前在本机另存一份副本。退出账号保留本机数据；共用设备请随后清理。'],['删除与备份','可删除云端记录、注销息见账号或清除本机数据。删除云端和清除本机后会暂停自动同步。导出备份含个人财务信息，请妥善保存。'],['服务与网络','账号后端使用现有Sites托管，前端使用GitHub Pages；网络和托管额度可能限制可用性。免费试用最多200个账号、单份记录1.5MB，不承诺无限额度。无法连接时保留本机记录，可使用文件备份。'],['访问日志','为防滥用，短期保存按时间段散列的访问限流标识；托管商可能保留其服务访问日志。市场资料直接查询第三方公开来源。']]};
mineDocuments.help.sections=mineDocuments.help.sections.map(v=>v[0]==='备份与恢复'?['备份与恢复','我的→邮箱登录与同步，免费注册并保存恢复码。同账号在其他设备登录即可同步。遇到记录冲突时先下载两份备份，再选择本机或云端。也可使用文件导出和导入。']:v);

document.addEventListener('submit',async e=>{if(e.target.id!=='emailDeleteForm')return;e.preventDefault();const form=e.target,f=new FormData(form),err=form.querySelector('[data-email-delete-error]'),button=form.querySelector('[type=submit]');button.disabled=true;try{if(f.get('confirmation')!=='注销息见账号')throw Error('请输入完整注销确认文字');await emailRequest('/v1/account',{method:'DELETE',body:{password:f.get('password'),confirmation:f.get('confirmation')}});sessionStorage.removeItem(EMAIL_SESSION_KEY);emailSession=null;emailRecovery=null;emailConflict=null;emailPaused=true;emailDeleteConfirm=false;emailMetaSave({...emailMeta,enabled:false});emailStatus='账号已注销 · 本机记录保留';emailError='';emailPaint(true)}catch(error){err.hidden=false;err.textContent=error.message}finally{button.disabled=false}});
