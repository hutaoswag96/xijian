// Entry is a product choice. Account data remains protected by server authorization.
(function(){
 'use strict';
 const storageKey='xijian_entry_mode_v1';let mode='locked',view='welcome',returnView='welcome',onChange=()=>{},lastView='',notice='';
 const hasSession=()=>!!emailSession?.token;
 try{if(sessionStorage.getItem(storageKey)==='guest'&&!hasSession())mode='guest'}catch{}
 const host=()=>document.getElementById('entryContent');
 const mark=`<span class="entry-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M7 23V14m6 9V9m6 14V12m6 11V5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></span>`;
 const brand=()=>`<div class="entry-brand">${mark}<span>息见<small>DIVIDEND INSIGHT</small></span></div>`;
 function visibility(){const locked=mode==='locked';document.documentElement.dataset.entry=locked?'locked':'open';const gate=document.getElementById('entryGate');if(gate)gate.hidden=!locked;if(locked){document.title='欢迎来到息见';const main=document.getElementById('main');if(main)main.innerHTML='';document.querySelectorAll('dialog[open]').forEach(d=>d.close())}}
 function refresh(force=false){
  visibility();if(mode!=='locked')return;const target=host();if(!target)return;
  const signature=view==='auth'?'auth:'+emailFormMode:view==='welcome'?'welcome:'+hasSession()+':'+notice:view;
  if(!force&&lastView===signature)return;lastView=signature;
  if(view==='welcome'){
   target.innerHTML=`${brand()}<div class="entry-intro"><p class="entry-eyebrow">从分红，读懂一家企业</p><h1 id="entryTitle">欢迎来到息见</h1><p>看清股息高低，<br class="entry-mobile-break">记好每一笔分红。</p></div><div class="entry-topics" aria-label="主要功能"><span>股息研究</span><span>自选整理</span><span>分红记账</span></div>${hasSession()&&!notice?'<p class="entry-notice" role="status">正在确认登录状态，你也可以选择游客体验。</p>':''}${notice?`<p class="entry-notice" role="status">${esc(notice)}</p>`:''}<div class="entry-options"><button class="entry-option entry-primary" data-entry-action="register"><span><b>邮箱注册</b><small>保存个人记录，换设备继续使用</small></span><span aria-hidden="true">↗</span></button><button class="entry-option entry-guest" data-entry-action="guest"><span><b>游客体验</b><small>无需注册，记录保存在当前设备</small></span><span aria-hidden="true">→</span></button></div><p class="entry-login">已有账号？<button data-entry-action="login">邮箱登录</button></p><p class="entry-fineprint">选择一种方式，开启你的股息研究。<br>游客之后也可以注册并同步本机记录。</p><div class="entry-legal"><a href="#mine/terms">使用约定</a><span>·</span><a href="#mine/privacy">隐私说明</a></div>`;
  }else if(view==='auth'){
   target.innerHTML=`<button class="entry-back" data-entry-action="back">← 返回选择</button>${brand()}<div class="entry-auth-title"><h1 id="entryTitle">让记录随你同行</h1><p>自选与持仓，在不同设备上接着看。</p></div>${emailAuthForm()}<p class="entry-auth-guest"><button data-entry-action="guest">先以游客体验</button></p>`;
  }else{
   const d=mineDocuments[view],name=view==='privacy'?'隐私说明':'使用约定';
   target.innerHTML=`<button class="entry-back" data-entry-action="back">← 返回${returnView==='auth'?'注册／登录':'选择'}</button><article class="entry-document"><h1 id="entryTitle">${name}</h1><p>${esc(d.intro)}</p>${d.sections.map(([t,s])=>`<section><h2>${esc(t)}</h2><p>${esc(s)}</p></section>`).join('')}</article>`;
  }
 }
 function store(value){try{value?sessionStorage.setItem(storageKey,value):sessionStorage.removeItem(storageKey)}catch{}}
 function enter(next,{accountPage=false,redirect=false}={}){mode=next;notice='';store(next);visibility();if(accountPage)location.hash='#mine/account';else if(redirect)location.hash='#dashboard';onChange();if(!accountPage)document.getElementById('main')?.focus({preventScroll:true})}
 window.XijianEntry={
  canEnter:()=>mode!=='locked',hasAccountAccess:()=>mode==='account',
  refresh,
  signedIn(options={}){enter('account',options)},
  signedOut(message=''){mode='locked';view='welcome';notice=message;lastView='';store(null);visibility();refresh(true);onChange()},
  attach(fn){onChange=fn},
  sessionError(message){notice=message;refresh()},
 };
 document.addEventListener('click',e=>{
  const gate=document.getElementById('entryGate');if(mode!=='locked'||!gate?.contains(e.target))return;
  const legal=e.target.closest('a[href="#mine/privacy"],a[href="#mine/terms"]');
  if(legal){e.preventDefault();returnView=view;view=legal.getAttribute('href').endsWith('privacy')?'privacy':'terms';refresh(true);gate.scrollTop=0;return}
  const button=e.target.closest('[data-entry-action]');if(!button)return;
  const action=button.dataset.entryAction;
  if(action==='guest'){
   // Choosing a guest session must never silently upload records using an old token.
   emailPaused=true;clearTimeout(emailTimer);emailSession=null;emailRecovery=null;emailConflict=null;emailError='';emailStatus='游客模式 · 记录保存在本机';try{sessionStorage.removeItem(EMAIL_SESSION_KEY)}catch{}
   enter('guest',{redirect:true});return;
  }
  if(action==='back'){view=['privacy','terms'].includes(view)?returnView:'welcome';refresh(true);return}
  if(action==='register'||action==='login'){view='auth';emailFormMode=action;refresh(true);document.getElementById('emailLogin')?.focus({preventScroll:true})}
 });
 refresh();
})();
