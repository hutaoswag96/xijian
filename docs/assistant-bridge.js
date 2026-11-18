'use strict';
// 息见 · 助理桥前端。负责：探测本机助理桥、推送操作快照、读取分析建议、渲染建议卡片。
// 上行（网页→本地）走 127.0.0.1 的 XHR；不通时静默跳过，网页功能不受影响。
// 下行（建议→网页）优先读本机桥，其次读同源 assistant/advice.json（这样手机和他人设备也能看到已发布建议）。
(function () {
  const ORIGIN = 'http://127.0.0.1:47821';
  const SEALED = './assistant/advice.enc.json';
  const KEY_STORE = 'xijian.assistant.seal';
  const state = {online: false, probing: false, lastSync: null, advice: null, adviceSource: null, requests: [], error: '', syncing: false, timer: null, locked: false, sealed: null, sealError: '', unlocking: false};
  let queued = false;

  function request(method, path, body, timeout = 3000) {
    return new Promise((resolve, reject) => {
      let xhr;
      try { xhr = new XMLHttpRequest(); } catch { reject(Error('浏览器不支持本机连接')); return; }
      xhr.open(method, ORIGIN + path, true);
      xhr.timeout = timeout;
      xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
      xhr.onload = () => {
        let data = null;
        try { data = JSON.parse(xhr.responseText); } catch { data = null; }
        if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data);
        else reject(Object.assign(Error(data?.error || '本机助理桥返回异常'), {status: xhr.status}));
      };
      xhr.onerror = () => reject(Error('本机助理桥未运行'));
      xhr.ontimeout = () => reject(Error('本机助理桥连接超时'));
      xhr.send(body === undefined ? null : JSON.stringify(body));
    });
  }

  function snapshot() {
    try {
      if (typeof window.xijianAssistantSnapshot === 'function') return window.xijianAssistantSnapshot();
    } catch (error) {
      state.error = error.message;
    }
    return null;
  }

  async function sync() {
    const data = snapshot();
    if (!data || state.syncing) { queued = true; return; }
    state.syncing = true;
    try {
      const result = await request('POST', '/sync', {snapshot: data}, 6000);
      state.online = true;
      state.error = '';
      state.lastSync = new Date().toISOString();
      if (result.adviceVersion && (!state.advice || result.adviceVersion !== state.advice.version || result.adviceUpdatedAt !== state.advice.updatedAt)) void loadAdvice();
    } catch (error) {
      state.online = false;
      state.error = error.message;
    } finally {
      state.syncing = false;
      if (queued) { queued = false; syncSoon(); }
    }
  }

  function syncSoon() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => { state.timer = null; void sync(); }, 900);
  }

  async function loadAdvice() {
    try {
      const local = await request('GET', '/advice', undefined, 3000);
      state.online = true;
      if (local && Array.isArray(local.items)) {
        state.advice = local;
        state.adviceSource = '本机助理';
        state.error = '';
        refreshViews();
        return state.advice;
      }
    } catch (error) {
      state.online = false;
      state.error = error.message;
    }
    const sealed = await loadSealed();
    if (sealed) return sealed;
    refreshViews();
    return null;
  }

  // ---- 加密快照：电脑关机时的只读兜底 ----
  function b64buf(text) {
    const raw = atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function buf64(buffer) {
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return btoa(text);
  }
  function cacheRead() {
    try { return JSON.parse(localStorage.getItem(KEY_STORE) || 'null'); } catch { return null; }
  }
  function cacheWrite(value) {
    try { localStorage.setItem(KEY_STORE, JSON.stringify(value)); } catch {}
  }
  function cacheClear() {
    try { localStorage.removeItem(KEY_STORE); } catch {}
  }
  async function deriveRaw(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', salt: b64buf(salt), iterations: iter, hash: 'SHA-256'}, base, 256);
    return buf64(bits);
  }
  async function decryptSealed(sealed, raw) {
    const key = await crypto.subtle.importKey('raw', b64buf(raw), {name: 'AES-GCM'}, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64buf(sealed.iv)}, key, b64buf(sealed.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  function applySealed(data, sealed) {
    state.advice = data;
    state.adviceSource = '加密快照';
    state.sealed = sealed;
    refreshViews();
  }
  async function loadSealed() {
    if (!('crypto' in window) || !crypto.subtle) return null;
    let sealed = null;
    try {
      const response = await fetch(SEALED + '?t=' + Date.now(), {cache: 'no-store'});
      if (!response.ok) return null;
      sealed = await response.json();
    } catch { return null; }
    if (!sealed || !sealed.ct) return null;
    state.sealed = sealed;
    const cached = cacheRead();
    if (cached && cached.salt === sealed.salt && cached.iter === sealed.iter) {
      try {
        const data = await decryptSealed(sealed, cached.raw);
        state.locked = false;
        state.sealError = '';
        applySealed(data, sealed);
        return data;
      } catch {
        cacheClear();
        state.sealError = '本机记住的密钥已失效，请重新输入口令';
      }
    }
    state.locked = true;
    return null;
  }
  async function unlock(pass) {
    if (!state.sealed) await loadSealed();
    if (!state.sealed) { state.sealError = '没有找到可用的快照文件'; refreshViews(); return false; }
    if (state.unlocking) return false;
    state.unlocking = true;
    try {
      const raw = await deriveRaw(pass, state.sealed.salt, state.sealed.iter);
      const data = await decryptSealed(state.sealed, raw);
      cacheWrite({salt: state.sealed.salt, iter: state.sealed.iter, raw});
      state.locked = false;
      state.sealError = '';
      applySealed(data, state.sealed);
      if (typeof toast === 'function') toast('快照已解锁');
      return true;
    } catch {
      state.sealError = '口令不正确';
      refreshViews();
      if (typeof toast === 'function') toast('口令不正确');
      return false;
    } finally {
      state.unlocking = false;
    }
  }

  async function loadRequests() {
    try {
      const data = await request('GET', '/requests', undefined, 2500);
      state.requests = Array.isArray(data.requests) ? data.requests : [];
    } catch { state.requests = []; }
  }

  async function probe() {
    if (state.probing) return state.online;
    state.probing = true;
    try {
      const data = await request('GET', '/health', undefined, 2000);
      state.online = data?.ok === true;
      state.error = '';
    } catch (error) {
      state.online = false;
      state.error = error.message;
    } finally {
      state.probing = false;
    }
    return state.online;
  }

  function adviceFor(symbol) {
    const items = state.advice?.items;
    if (!Array.isArray(items)) return null;
    return items.find(v => v && v.symbol === symbol) || null;
  }

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const tagOf = item => item?.tag || item?.action || '观察';
  const tagClass = tag => /击球|买/.test(tag) ? 'buy' : /抛球|减|卖/.test(tag) ? 'sell' : 'watch';
  function ago(iso) {
    if (!iso) return '尚未生成';
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return String(iso);
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    if (m < 1440) return Math.round(m / 60) + ' 小时前';
    return new Date(t).toLocaleDateString('zh-CN');
  }

  function cardBadge(symbol) {
    const item = adviceFor(symbol);
    if (!item) return '';
    return `<span class="advice-chip ${tagClass(tagOf(item))}" title="${esc(item.plan || '')}">助理 · ${esc(tagOf(item))}</span>`;
  }

  function strip() {
    const items = state.advice?.items || [];
    const count = items.length;
    const pending = state.requests.length;
    const status = state.online ? '本机桥已连接' : '本机桥未连接';
    const line = count ? `最近建议更新 ${ago(state.advice.updatedAt)} · ${state.adviceSource}` : '还没有生成建议';
    return `<a class="assistant-strip" href="#assistant">
      <span class="assistant-strip-icon" aria-hidden="true">AI</span>
      <span class="assistant-strip-copy"><b>投资助理${count ? ` · ${count} 条建议` : ''}${pending ? ` · ${pending} 条待分析` : ''}</b><small>${esc(line)} · ${esc(status)}</small></span>
      <span class="assistant-strip-go">查看 ›</span></a>`;
  }

  function itemCard(item, dense = false) {
    const tag = tagOf(item);
    const reasons = Array.isArray(item.why) ? item.why.filter(Boolean) : [];
    const basis = Array.isArray(item.basis) ? item.basis.filter(Boolean) : [];
    const zones = [item.buyZone ? `<div><span>买入区</span><b>${esc(item.buyZone)}</b></div>` : '', item.trimZone ? `<div><span>减仓区</span><b>${esc(item.trimZone)}</b></div>` : ''].filter(Boolean).join('');
    return `<article class="advice-card ${tagClass(tag)}">
      <div class="advice-head"><div><b>${esc(item.name || String(item.symbol || '').slice(2))}</b><small>${esc(String(item.symbol || '').slice(2))}${item.confidence ? ' · 把握度 ' + esc(item.confidence) : ''}${item.horizon ? ' · ' + esc(item.horizon) : ''}</small></div><span class="advice-tag ${tagClass(tag)}">${esc(tag)}${item.action ? ' · ' + esc(item.action) : ''}</span></div>
      ${zones ? `<div class="advice-zones">${zones}</div>` : ''}
      ${item.plan ? `<p class="advice-plan">${esc(item.plan)}</p>` : ''}
      ${reasons.length ? `<ul class="advice-why">${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      ${dense ? '' : `<details class="advice-detail"><summary>依据与失效条件</summary>${basis.length ? `<ul>${basis.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}${item.invalidate ? `<p class="advice-invalidate">何时失效：${esc(item.invalidate)}</p>` : ''}${item.positionAdvice ? `<p>持仓处理：${esc(item.positionAdvice)}</p>` : ''}<p class="advice-meta">数据截至 ${esc(item.asOf || '—')}${item.generatedBy ? ' · ' + esc(item.generatedBy) : ''}</p></details>`}
      <div class="advice-foot"><button class="text-link" data-action="assistant-ask" data-symbol="${esc(item.symbol)}">请助理重新分析</button></div>
    </article>`;
  }

  function detailBlock(symbol) {
    const item = adviceFor(symbol);
    if (!item) return `<section class="detail-panel assistant-detail-empty"><h3>投资助理</h3><p class="form-help">${state.locked ? '离线快照尚未解锁，先到「投资助理」页输入口令即可查看建议。' : '这只股票还没有助理建议。点击下方按钮提交分析请求，助理生成后会显示在这里。'}</p><button class="btn small" data-action="assistant-ask" data-symbol="${esc(symbol)}">请助理分析这只股票</button></section>`;
    return `<section class="detail-panel assistant-detail"><div class="assistant-detail-head"><h3>投资助理建议</h3></div>${itemCard(item)}<p class="form-help">助理建议基于公开资料与网页记录，由本人本地分析生成，不自动下单，也不代表收益承诺。</p></section>`;
  }

  function lockPanel() {
    return `<section class="assistant-panel assistant-lock"><div class="assistant-lock-head"><h2>读取加密快照</h2><span class="advice-chip">离线可用</span></div>
      <p>本机助理没有连上。发布到网页上的那份建议是加密的，输入一次口令就能看，本设备会记住密钥。</p>
      <form id="assistantUnlockForm" class="assistant-unlock-form"><input id="assistantPass" name="pass" type="password" autocomplete="current-password" placeholder="输入口令" required><button class="btn primary" type="submit">解锁</button></form>
      ${state.sealError ? `<p class="assistant-lock-error">${esc(state.sealError)}</p>` : ''}
      <p class="form-help">快照更新于 ${esc(ago(state.sealed?.updatedAt))}，共 ${esc(state.sealed?.items ?? 0)} 条。口令只在这台设备上用于解密，不会上传。</p></section>`;
  }

  function page() {
    const items = state.advice?.items || [];
    const general = state.advice?.general || [];
    const pending = state.requests;
    const statusLine = state.online
      ? `<span class="assistant-status on">本机桥已连接 · 网页操作会实时同步到本地</span>`
      : `<span class="assistant-status off">本机桥未连接 · ${state.locked ? '快照已加密，待解锁' : state.adviceSource ? '当前显示' + esc(state.adviceSource) : '暂无离线快照'}</span>`;
    return `<div class="page-heading"><div><div class="eyebrow">PERSONAL INVESTMENT ASSISTANT</div><h1>投资助理</h1><p>自选与持仓的操作会同步到本机；助理分析后把结论写回这里。</p></div><div class="heading-actions"><button class="btn" data-action="assistant-sync">立即同步</button><button class="btn primary" data-action="assistant-pick">添加分析请求</button></div></div>
      <section class="assistant-panel">${statusLine}
        <div class="assistant-meta-row"><div><span>最近同步</span><b>${state.lastSync ? ago(state.lastSync) : '—'}</b></div><div><span>建议更新</span><b>${ago(state.advice?.updatedAt || state.sealed?.updatedAt)}</b></div><div><span>待分析</span><b>${pending.length} 只</b></div><div><span>建议条数</span><b>${items.length}</b></div></div>
      </section>
      ${state.locked && !items.length ? lockPanel() : ''}
      ${pending.length ? `<section class="assistant-panel"><h2>待分析请求</h2><div class="assistant-requests">${pending.map(r => `<div class="assistant-request"><b>${esc(r.name)}</b><small>${esc(String(r.symbol).slice(2))} · ${esc(r.at.slice(0, 16).replace('T', ' '))}${r.note ? ' · ' + esc(r.note) : ''}</small><span>等待助理处理</span></div>`).join('')}</div><p class="form-help">这些请求已记录在本地 pending 队列，助理下一次分析时会读到。</p></section>` : ''}
      ${general.length ? `<section class="assistant-panel"><h2>组合提示</h2><ul class="assistant-general">${general.map(g => `<li>${esc(g)}</li>`).join('')}</ul></section>` : ''}
      <section class="assistant-panel"><h2>个股建议</h2>${items.length ? `<div class="advice-list">${items.map(item => itemCard(item)).join('')}</div>` : state.locked ? `<p class="form-help">解锁后显示上次封存的建议。</p>` : `<div class="empty-state"><b>还没有助理建议</b><p>先在自选里添加股票，再把想要结论的提交给助理。</p><button class="btn primary" data-action="assistant-pick">提交分析请求</button></div>`}</section>
      <p class="form-help">助理建议由本人在本地结合公开资料、历史分红和你录入的持仓生成，属于个人研究记录；不构成对外荐股，不自动下单，不保证收益。</p>`;
  }

  function refreshViews() {
    try {
      const body = document.getElementById('assistantBody');
      if (body) {
        // 重绘时保住正在输入的口令，避免后台刷新把输入框清空
        const old = document.getElementById('assistantPass');
        const keep = old ? {value: old.value, focused: document.activeElement === old} : null;
        body.innerHTML = page();
        if (keep) {
          const next = document.getElementById('assistantPass');
          if (next) {
            next.value = keep.value;
            if (keep.focused) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
          }
        }
        if (typeof hydrateIcons === 'function') hydrateIcons();
      }
      const strip = document.getElementById('assistantStrip');
      if (strip) strip.innerHTML = stripContent();
      if (document.getElementById('detailDialog')?.open && typeof detailSymbol === 'string' && typeof renderDetail === 'function') renderDetail();
      if (typeof render === 'function' && typeof currentPage === 'function' && currentPage() === 'dashboard') render();
    } catch {}
  }

  function stripContent() {
    const items = state.advice?.items || [];
    const count = items.length;
    const pending = state.requests.length;
    const line = count ? `最近建议 ${ago(state.advice.updatedAt)} · ${state.adviceSource}` : state.locked ? '快照已加密，点开输入口令' : '还没有生成建议';
    return `<span class="assistant-strip-icon" aria-hidden="true">AI</span><span class="assistant-strip-copy"><b>投资助理${count ? ` · ${count} 条建议` : ''}${pending ? ` · ${pending} 条待分析` : ''}</b><small>${esc(line)} · ${esc(state.online ? '本机桥已连接' : '本机桥未连接')}</small></span><span class="assistant-strip-go">查看 ›</span>`;
  }

  async function ask(symbol, note = '') {
    const name = (typeof nameOf === 'function' ? nameOf(symbol) : '') || String(symbol).slice(2);
    try {
      const data = await request('POST', '/request', {symbol, name, note}, 5000);
      state.online = true;
      state.error = '';
      await loadRequests();
      refreshViews();
      if (typeof toast === 'function') toast(`已提交 ${name} 的分析请求，助理下次分析会处理`);
      return data;
    } catch (error) {
      state.online = false;
      state.error = error.message;
      if (typeof toast === 'function') toast('本机助理桥未连接，请求未提交。请确认本地助理服务已启动。');
      refreshViews();
      return null;
    }
  }

  function pick() {
    const list = (typeof watch === 'object' && Array.isArray(watch) ? watch : []).map(w => `<option value="${esc(w.symbol)}">${esc(w.name)} ${esc(w.symbol.slice(2))}</option>`).join('');
    const d = document.getElementById('assistantPickDialog');
    if (!d) return;
    d.innerHTML = `<div class="dialog-header"><div><h2>提交分析请求</h2><p>请求会写入本机队列，助理处理完成后建议会显示在投资助理页。</p></div><button class="icon-button" data-action="close" aria-label="关闭窗口">×</button></div><form class="dialog-content" id="assistantPickForm"><div class="form-row"><label for="assistantSymbol">股票</label>${list ? `<select id="assistantSymbol" name="symbol">${list}</select>` : `<input id="assistantSymbol" name="symbol" placeholder="六位代码，例如 600036" required>`}</div><div class="form-row"><label for="assistantNote">想问什么（选填）</label><input id="assistantNote" name="note" maxlength="200" placeholder="例如：现在能不能加仓，还是先等等"></div><button class="btn primary block" type="submit">提交请求</button></form>`;
    if (typeof openDialog === 'function') openDialog('assistantPickDialog');
  }

  document.addEventListener('submit', async event => {
    if (event.target.id !== 'assistantUnlockForm') return;
    event.preventDefault();
    const form = event.target;
    const pass = String(new FormData(form).get('pass') || '');
    const button = form.querySelector('[type=submit]');
    if (!pass) return;
    button.disabled = true;
    button.textContent = '解密中';
    await unlock(pass);
    if (document.getElementById('assistantUnlockForm') === form) {
      button.disabled = false;
      button.textContent = '解锁';
      form.querySelector('input').value = '';
    }
  });

  document.addEventListener('submit', async event => {
    if (event.target.id !== 'assistantPickForm') return;
    event.preventDefault();
    const form = event.target, data = new FormData(form);
    let symbol = String(data.get('symbol') || '').trim();
    if (/^\d{6}$/.test(symbol)) symbol = (symbol[0] === '6' ? 'sh' : /[03]/.test(symbol[0]) ? 'sz' : 'bj') + symbol;
    if (!/^(sh(?:60|68)\d{4}|sz(?:00|30)\d{4}|bj[489]\d{5})$/.test(symbol)) { if (typeof toast === 'function') toast('请输入有效股票代码'); return; }
    form.querySelector('[type=submit]').disabled = true;
    await ask(symbol, String(data.get('note') || ''));
    form.querySelector('[type=submit]').disabled = false;
    document.getElementById('assistantPickDialog')?.close();
  });

  document.addEventListener('click', event => {
    const el = event.target.closest?.('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'assistant-ask') { event.preventDefault(); void ask(el.dataset.symbol); return; }
    if (action === 'assistant-sync') { event.preventDefault(); void sync().then(() => loadAdvice()).then(refreshViews); return; }
    if (action === 'assistant-pick') { event.preventDefault(); pick(); }
  });

  window.XijianAssistant = {
    state, probe, sync, syncSoon, loadAdvice, loadRequests, refreshViews,
    page, strip: stripContent, cardBadge, detailBlock, adviceFor, ask, unlock, loadSealed,
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await probe();
    await Promise.all([loadAdvice(), loadRequests()]);
    const first = snapshot();
    if (state.online && first) void sync();
    refreshViews();
    setInterval(() => { if (!document.hidden && state.online) void loadAdvice(); }, 60000);
    setInterval(() => { if (!document.hidden && state.online) void loadRequests(); }, 120000);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { void probe().then(ok => { if (ok) { void sync(); void loadAdvice(); } else if (!state.advice || state.locked) { void loadAdvice(); } }); } });
})();
