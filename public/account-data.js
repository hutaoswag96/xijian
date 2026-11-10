'use strict';
let accountState={loaded:false,loading:false,authenticated:false,backupAvailable:false,hasBackup:false,revision:0,updatedAt:null,error:null},feedbackDraft='';
async function userRequest(path,{method='GET',body}={}){const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});let data;try{data=await r.json()}catch{throw Error('服务返回异常，请稍后重试')}if(!r.ok)throw Error(data.error||'本次操作未完成');return data}
async function loadAccount(force=false){if(accountState.loading||accountState.loaded&&!force)return;accountState.loading=true;try{const status=await userRequest('/api/account');Object.assign(accountState,status,{error:null});if(status.authenticated&&status.backupAvailable){const meta=await userRequest('/api/user-data?meta=1');Object.assign(accountState,meta)}}catch(e){accountState.error=e.message}finally{accountState.loading=false;accountState.loaded=true;if(currentPage()==='mine'&&['home','account','data'].includes(mineSection()))render()}}
async function handleCloudAction(action,el){if(el)el.disabled=true;try{
 if(action==='cloud-refresh'){await loadAccount(true);return}if(action==='cloud-save'&&workspaceLoadError)throw Error('本机资料尚未通过校验，不能覆盖账号备份；请先导出当前数据检查。');if(!accountState.authenticated||!accountState.backupAvailable)throw Error('请先连接当前网站账号，服务可用后再操作。');
 if(action==='cloud-save'){
  if(accountState.hasBackup&&!confirm('这会用当前设备的完整记录替换账号备份，不会自动合并。账号备份日期：'+accountState.updatedAt+'。是否继续？'))return;
  const result=await userRequest('/api/user-data',{method:'PUT',body:{backup:backupData(),revision:accountState.revision}});Object.assign(accountState,result,{hasBackup:true});toast('已保存到当前网站账号；本机数据保留');
 }else if(action==='cloud-load'){
  const data=await userRequest('/api/user-data');if(!data.backup)throw Error('当前账号还没有备份');
  const checked=XijianInvestments.importBackup(data.backup);if(!confirm('将恢复账号备份：'+checked.watch.length+'只自选、'+checked.workspace.ledger.length+'条交易、'+checked.workspace.receipts.length+'条分红。恢复会替换本机记录。请先导出当前备份。是否继续？'))return;
  await restoreUserBackup(data.backup);Object.assign(accountState,{revision:data.revision,updatedAt:data.updatedAt,hasBackup:true});toast('账号备份已恢复到本机');
 }else if(action==='cloud-delete'){
  if(!confirm('删除当前账号保存的备份内容？本机记录不会删除。'))return;
  await userRequest('/api/user-data',{method:'DELETE',body:{revision:accountState.revision,confirmation:'删除账号备份'}});toast('账号备份内容已删除，本机记录保留');
 }
 await loadAccount(true);
 }catch(e){toast(e.message);accountState.error=e.message;if(currentPage()==='mine')render()}finally{if(el)el.disabled=false}}
async function submitMineFeedback(form){const text=String(new FormData(form).get('description')||'').trim(),error=form.querySelector('[data-feedback-error]'),button=form.querySelector('button[type=submit]');if(!text||text.length>2000){error.hidden=false;error.textContent='请填写2000字以内的问题描述';return}if(button){button.disabled=true;button.textContent='正在提交…'}try{const ticket=await userRequest('/api/feedback',{method:'POST',body:{description:text}});feedbackDraft='';form.reset();error.hidden=true;const result=form.querySelector('[data-feedback-result]');if(result){result.hidden=false;result.textContent='已提交，反馈编号：'+ticket.ticket+'。这表示已存入反馈系统，不代表已经处理。'}toast('反馈已提交，编号已显示')}catch(e){feedbackDraft=text;error.hidden=false;error.textContent=e.message+'。填写内容已保留，可重试。'}finally{if(button){button.disabled=false;button.textContent='提交反馈'}}}
async function loadFeedbackHistory(){const target=document.getElementById('feedbackHistory');if(!target)return;try{const data=await userRequest('/api/feedback');target.innerHTML=data.tickets.length?data.tickets.map(t=>`<article class="ledger-row"><b>已提交 · ${esc(t.id.slice(0,8))}</b><p>${esc(t.description)}</p><small>${esc(t.created_at)}</small></article>`).join(''):'<p>暂无已提交反馈。</p>'}catch(e){target.textContent=e.message}}
