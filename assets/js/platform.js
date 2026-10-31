/* ═══════════════════════════════════════════════════════════════════════════
   platform.js — v7
   Sign-in (email code, Google, password, access key), switching between
   accounts, the Admin console, and the Settings panes that talk to the
   platform: Telegram, the booking page and API keys.
   Loaded after main.js; it replaces the v6 sign-in functions by name.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var App = { booted: false };

/* ─── small helpers ─────────────────────────────────────────────────────── */
function appBaseUrl() { return location.origin + location.pathname; }

function qsParam(name) {
  try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
}

function dropParams(names) {
  try {
    var u = new URL(location.href);
    names.forEach(function (k) { u.searchParams.delete(k); });
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch (e) { /* not worth failing over */ }
}

function initialsOf(s) {
  s = String(s || '').trim();
  if (!s) return '?';
  if (s.indexOf('@') > 0 && s.indexOf(' ') < 0) s = s.split('@')[0].replace(/[._-]+/g, ' ');
  var parts = s.split(/\s+/).filter(Boolean);
  return ((parts[0] || '')[0] + ((parts[1] || '')[0] || '')).toUpperCase() || '?';
}

var ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' };
var STATUS_LABEL = { active: 'Active', invited: 'Invited', pending: 'Waiting', blocked: 'Switched off', removed: 'Removed' };

function roleChip(role) {
  var cls = role === 'owner' ? 'chip-good' : role === 'admin' ? 'chip-info' : role === 'viewer' ? 'chip-ghost' : 'chip-cold';
  return '<span class="chip ' + cls + '">' + esc(ROLE_LABEL[role] || role || 'Member') + '</span>';
}

function statusChip(status) {
  var cls = status === 'active' ? 'chip-good' : status === 'pending' ? 'chip-warm' : status === 'invited' ? 'chip-info' : 'chip-danger';
  return '<span class="chip ' + cls + '">' + esc(STATUS_LABEL[status] || status) + '</span>';
}

function niceErr(r) {
  if (!r) return 'No answer from the server.';
  if (r.error === 'NETWORK') return 'Cannot reach the server. Check your connection and try again.';
  if (r.error === 'NO_URL') return 'This dashboard is not connected to a backend yet.';
  return r.message || r.error || 'Something went wrong.';
}

function allWorkspaces() {
  if (Admin.ov && Admin.ov.workspaces) return Admin.ov.workspaces;
  return ((State.me && State.me.workspaces) || []);
}

function wsLabel(id) {
  var hit = null;
  allWorkspaces().forEach(function (w) { if (w.id === id) hit = w; });
  return hit ? hit.name : (id === 'main' ? 'Main' : id);
}

function emptyBox(title, note) {
  return '<div class="empty"><div class="empty-title">' + esc(title) + '</div>' + (note ? '<div class="empty-note">' + esc(note) + '</div>' : '') + '</div>';
}

function loadingBox(text) {
  return '<div class="loading-box"><span class="typing"><i></i><i></i><i></i></span><span class="small muted">' + esc(text || 'Loading…') + '</span></div>';
}

function toggleHtml(id, on, label, sub) {
  return '<label class="switch-row"><span class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '/><i></i></span>' +
    '<span class="grow"><span class="sr-label">' + esc(label) + '</span>' + (sub ? '<span class="sr-sub">' + esc(sub) + '</span>' : '') + '</span></label>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIGN-IN
   The default is a six-digit code emailed to an approved address. Google
   sign-in, the owner's password and access keys are there too, but tucked
   away so a new person sees one obvious thing to do.
   ═══════════════════════════════════════════════════════════════════════════ */
var Gate = { step: 'email', email: '', invite: '', requestToken: '', conf: null, confPromise: null, inviteChecked: false };

function gateErr(msg, ok) {
  var e = $('#gateErr');
  if (!e) return;
  e.textContent = msg || '';
  e.classList.toggle('ok', !!ok);
}

function gateBusy(on) {
  $$('#gate button, #gate input, #gate textarea').forEach(function (el) {
    if (el.closest('.gate-more summary')) return;
    el.disabled = !!on;
  });
}

function gateShowStep(step) {
  Gate.step = step;
  ['email', 'code', 'request', 'pending'].forEach(function (s) {
    var el = $('#gs-' + s);
    if (el) el.hidden = s !== step;
  });
  var sub = $('#gateSub');
  if (sub) {
    sub.textContent = step === 'code' ? 'Check your inbox for a 6-digit code.'
      : step === 'request' ? 'Your email is verified. Ask the admin to let you in.'
      : step === 'pending' ? 'Request sent.'
      : 'Sign in with your email — we send you a one-time code. No password to remember.';
  }
  var more = $('#gateMore');
  if (more) more.hidden = step !== 'email';
  if (step === 'code') { $('#gateCodeEmail').textContent = Gate.email; setTimeout(function () { var c = $('#gateCode'); if (c) { c.value = ''; c.focus(); } }, 50); }
  if (step === 'pending') $('#gatePendingEmail').textContent = Gate.email;
  if (step === 'request') $('#gateReqEmail').textContent = Gate.email;
}

function gateLoadConfig() {
  if (Gate.confPromise) return Gate.confPromise;
  Gate.confPromise = api('publicConfig', {}, { timeout: 20000 }).then(function (r) {
    if (!r || !r.success) { Gate.confPromise = null; return null; }
    Gate.conf = r;
    if (r.googleClientId && r.googleClientId !== Cfg.clientId) Cfg.clientId = r.googleClientId;
    if (r.aiName) setAiName(r.aiName);
    var brandEl = $('#gateBrand');
    if (brandEl && r.brand) brandEl.textContent = r.brand;
    return r;
  });
  return Gate.confPromise;
}

/* Google: only drawn when the backend has a client id, and never as an error
   message to someone who just wants to sign in. The admin console says what
   is missing instead. */
GoogleAuth.loadConfig = function () { return gateLoadConfig(); };
GoogleAuth.start = function () {
  var self = this;
  var wrap = $('#googleWrap');
  if (window.EV_DEMO && window.EV_DEMO.googleChooser) {
    if (wrap) wrap.hidden = false;
    var box = $('#googleBtn');
    if (box && !box.dataset.demo) {
      box.dataset.demo = '1';
      box.innerHTML = '<button class="btn google-btn" type="button" data-act="demo-google"><span class="g-logo">G</span> Sign in with Google</button>';
    }
    var or = $('#gateOr'); if (or) or.hidden = false;
    return;
  }
  gateLoadConfig().then(function (conf) {
    var enabled = !!(Cfg.clientId && (!conf || conf.googleEnabled !== false || Cfg.clientId));
    if (!enabled) { if (wrap) wrap.hidden = true; return; }
    if (wrap) wrap.hidden = false;
    self.started = true;
    self.render();
  });
};
/* v8: Google sign-in never fails silently any more. When the button cannot
   load, the gate says why in one line (and how to fix it lives in
   Admin → Platform → Google sign-in check). The script is also loaded on
   demand, so a slow network or a late async tag does not lose the button. */
/** Admin → Platform: what Google needs, with this site's own address filled in. */
function googleCheckHtml(c) {
  var id = (c && c.GOOGLE_CLIENT_ID) || Cfg.clientId || '';
  var ok = '<span class="chip chip-good">ok</span>', no = '<span class="chip chip-danger">missing</span>';
  return '<div class="kv">' +
      '<dt>Client ID</dt><dd>' + (id ? ok + ' <span class="tiny muted">' + esc(id.slice(0, 14)) + '…</span>' : no) + '</dd>' +
      '<dt>This site</dt><dd><code>' + esc(location.origin) + '</code> ' + copyBtn(location.origin, 'Copy') + '</dd>' +
      '<dt>Google script</dt><dd>' + (window.google && google.accounts && google.accounts.id ? ok : '<span class="chip chip-warm">not loaded on this page</span>') + '</dd>' +
      (GoogleAuth.lastError ? '<dt>Last problem</dt><dd class="small">' + esc(GoogleAuth.lastError) + '</dd>' : '') +
    '</div>' +
    '<ol class="g-steps small">' +
      '<li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud → Credentials ↗</a> and open the OAuth client whose ID is above (type: <b>Web application</b>).</li>' +
      '<li>Under <b>Authorized JavaScript origins</b> add <code>' + esc(location.origin) + '</code> (no slash at the end). Add your custom domain too if you have one.</li>' +
      '<li>Open <b>OAuth consent screen</b>. If it says <b>Testing</b>, press <b>Publish app</b> — or add every teammate under Test users. Otherwise Google blocks everyone but you.</li>' +
      '<li>Save, wait 5 minutes, then reload this page in a private window and try the Google button.</li>' +
    '</ol>' +
    '<div class="tiny muted">Teammates still need access here first (Admin → People). Google only proves who they are.</div>';
}

GoogleAuth.ensureScript = function () {
  if (window.google && google.accounts && google.accounts.id) return;
  if (document.querySelector('script[data-gsi]')) return;
  var has = [].some.call(document.scripts, function (s) { return /accounts\.google\.com\/gsi\/client/.test(s.src); });
  if (has && this.waited < 12) return;
  var s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true; s.defer = true; s.setAttribute('data-gsi', '1');
  document.head.appendChild(s);
};
GoogleAuth.fail = function (msg) {
  var box = $('#googleBtn');
  var w = $('#googleWrap'); if (w) w.hidden = false;
  if (box) box.innerHTML = '<div class="g-fail">' + icon('alert', 13) + '<span>' + esc(msg) + '</span></div>';
  var or = $('#gateOr'); if (or) or.hidden = false;
  GoogleAuth.lastError = msg;
};
GoogleAuth.render = function () {
  var box = $('#googleBtn');
  if (!box) return;
  // Rendered before, but the button has gone (sign out, theme change): draw again.
  if (this.rendered && box.querySelector('iframe, div[role="button"]')) return;
  this.rendered = false;
  if (!Cfg.clientId) { this.fail('Google sign-in is not set up yet. Use the email code below.'); return; }
  if (!(window.google && google.accounts && google.accounts.id)) {
    this.waited += 1;
    if (this.waited === 1 || this.waited === 12) this.ensureScript();
    if (this.waited > 48) { this.fail('Google could not load here (an ad blocker or a blocked network). Use the email code below.'); return; }
    var self = this;
    setTimeout(function () { self.render(); }, 250);
    return;
  }
  try {
    google.accounts.id.initialize({
      client_id: Cfg.clientId,
      callback: function (resp) {
        if (!resp || !resp.credential) { gateErr('Google returned nothing. Try again.'); return; }
        doLogin({ idToken: resp.credential });
      },
      auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true, itp_support: true
    });
    box.innerHTML = '';
    var width = Math.max(200, Math.min(320, (box.parentElement || box).clientWidth || 300));
    google.accounts.id.renderButton(box, {
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline',
      size: 'large', width: width, text: 'signin_with', shape: 'rectangular', logo_alignment: 'center'
    });
    this.rendered = true;
    var or = $('#gateOr'); if (or) or.hidden = false;
    // Google draws an empty frame when this site is not on the client's list
    // of allowed origins. Catch that and say so.
    var self2 = this;
    setTimeout(function () {
      var b = $('#googleBtn');
      if (b && !b.querySelector('iframe, div[role="button"]') && !$('#gate').hidden) {
        self2.fail('Google did not show its button for ' + location.origin + '. The admin must add this address under "Authorized JavaScript origins".');
      }
    }, 5000);
  } catch (e) {
    this.fail('Google sign-in could not start: ' + (e && e.message ? e.message : e));
    console.warn('Google sign-in could not start', e);
  }
};

function showGate(message) {
  $('#gate').hidden = false;
  $('#app').classList.remove('ready');
  document.body.classList.add('gated');
  gateErr(message || '');
  var setupBtn = $('#gateSetup');
  if (setupBtn) setupBtn.hidden = !!APP_CONFIG.apiUrl || !!window.EV_DEMO;
  gateShowStep(Gate.step === 'pending' || Gate.step === 'request' ? Gate.step : (Gate.step || 'email'));
  if (Gate.email && $('#gateEmail') && !$('#gateEmail').value) $('#gateEmail').value = Gate.email;
  if (!Cfg.url && !window.EV_DEMO) return;
  GoogleAuth.start();
  gateLoadConfig().then(function (conf) {
    var pw = $('#gatePwBlock');
    if (pw) pw.hidden = !!(conf && conf.passwordEnabled === false);
  });
  gateCheckInvite();
}

function hideGate() {
  $('#gate').hidden = true;
  $('#app').classList.add('ready');
  document.body.classList.remove('gated');
}

function gateCheckInvite(tokenArg, emailArg) {
  if (Gate.inviteChecked && !tokenArg) return;
  Gate.inviteChecked = true;
  var token = tokenArg || qsParam('invite');
  var email = emailArg || qsParam('email');
  if (!token) return;
  Gate.invite = token;
  if (email) { Gate.email = email.toLowerCase(); var el = $('#gateEmail'); if (el) el.value = Gate.email; }
  api('inviteInfo', { token: token }).then(function (r) {
    var box = $('#gateInvite');
    if (!box) return;
    if (r && r.success) {
      box.hidden = false;
      box.innerHTML = '<b>' + esc(r.invitedBy ? r.invitedBy.split('@')[0] : 'Your admin') + '</b> gave you access' +
        (r.workspace ? ' to <b>' + esc(r.workspace) + '</b>' : '') + '. Sign in with <b>' + esc(r.email) + '</b> to start.';
      if (r.email) { Gate.email = r.email; var e2 = $('#gateEmail'); if (e2) e2.value = r.email; }
    } else {
      box.hidden = false;
      box.classList.add('warn');
      box.textContent = niceErr(r);
    }
  });
}

function gateSendCode(resend) {
  var input = $('#gateEmail');
  var email = String((input && input.value) || Gate.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { gateErr('Type your email address.'); if (input) input.focus(); return; }
  if (!Cfg.url && !window.EV_DEMO) { openBackendSetup(); return; }
  Gate.email = email;
  gateBusy(true);
  gateErr(resend ? 'Sending a new code…' : 'Sending your code…', true);
  api('otpRequest', { email: email, appUrl: appBaseUrl() }, { timeout: 30000 }).then(function (r) {
    gateBusy(false);
    if (r && r.success) {
      gateShowStep('code');
      gateErr(resend ? 'A new code is on its way.' : '', true);
      return;
    }
    gateErr(r && r.error === 'NOT_INVITED' ? (r.message || 'This email has not been given access yet.') : niceErr(r));
  });
}

function gateVerify() {
  var el = $('#gateCode');
  var code = String((el && el.value) || '').replace(/\D/g, '');
  if (code.length !== 6) { gateErr('Type the 6-digit code from the email.'); return; }
  gateBusy(true);
  gateErr('Checking…', true);
  api('otpVerify', { email: Gate.email, code: code, invite: Gate.invite || '', appUrl: appBaseUrl() }, { timeout: 30000 }).then(function (r) {
    gateBusy(false);
    handleLoginResult(r);
    if (!(r && r.success) && Gate.step === 'code' && el) { el.focus(); el.select(); }
  });
}

function gateRequestAccess() {
  var name = String(($('#gateReqName') || {}).value || '').trim();
  var note = String(($('#gateReqNote') || {}).value || '').trim();
  if (name.length < 2) { gateErr('Type your name so the admin knows who is asking.'); return; }
  gateBusy(true);
  gateErr('Sending…', true);
  api('requestAccess', { requestToken: Gate.requestToken, name: name, note: note }).then(function (r) {
    gateBusy(false);
    if (r && r.success) { gateErr(''); gateShowStep('pending'); return; }
    gateErr(niceErr(r));
  });
}

function doLogin(credentials) {
  if (!Cfg.url && !window.EV_DEMO) { openBackendSetup(); return; }
  if (!credentials.idToken && !credentials.accessKey && !String(credentials.password || '').length) {
    gateErr('Type the password first.');
    return;
  }
  gateBusy(true);
  gateErr('Checking…', true);
  api('login', Object.assign({ appUrl: appBaseUrl() }, credentials), { timeout: 30000 }).then(function (r) {
    gateBusy(false);
    handleLoginResult(r);
  });
}

function handleLoginResult(r) {
  if (r && r.success && r.token) { onSignedIn(r); return; }
  if (r && r.error === 'NOT_INVITED') {
    if (r.email) Gate.email = r.email;
    if (r.canRequest) {
      Gate.requestToken = r.requestToken;
      var nm = $('#gateReqName');
      if (nm && r.name && !nm.value) nm.value = r.name;
      gateErr('');
      gateShowStep('request');
    } else {
      gateShowStep('email');
      gateErr(r.message || 'This email has not been given access yet. Ask the admin for an invite.');
    }
    return;
  }
  if (r && r.error === 'PENDING') {
    if (r.email) Gate.email = r.email;
    gateErr('');
    gateShowStep('pending');
    return;
  }
  gateErr(niceErr(r));
}

/** Everything the platform pages cached for whoever was signed in before. */
function resetPlatformCaches() {
  Admin.ov = null; Admin.audit = null; Admin.ai = null; Admin.usage = null; Admin.config = null;
  Admin.tg = null; Admin.keys = null; Admin.sessions = null; Admin.models = {}; Admin.tests = {};
  Admin.auditQ = { q: '', email: '', ws: '' };
  Settings7.booking = null; Settings7.keys = null; Settings7.aiStatus = null; Settings7.tgLink = null;
  State.ui.evoPlan = null;
  if (typeof Ai !== 'undefined') { Ai.chats = []; Ai.messages = []; Ai.activeChatId = null; Ai.loaded = false; Ai.status = null; }
  if (typeof LeadEvo !== 'undefined') { LeadEvo.leadId = null; LeadEvo.messages = []; }
}

function onSignedIn(res) {
  var whoBefore = Cfg.who;
  if (whoBefore !== (res.who || '')) resetPlatformCaches();
  Cfg.token = res.token;
  Cfg.who = res.who || '';
  var me = res.me || null;
  if (me) { Cfg.me = me; State.me = me; }
  var ids = (me && me.workspaces ? me.workspaces : []).map(function (w) { return w.id; });
  if (!Cfg.ws || (ids.length && ids.indexOf(Cfg.ws) < 0) || (whoBefore && whoBefore !== Cfg.who)) {
    Cfg.ws = (me && me.defaultWs && ids.indexOf(me.defaultWs) >= 0) ? me.defaultWs : (ids[0] || '');
  }
  if (Gate.invite) dropParams(['invite', 'email']);
  Gate.invite = '';
  Gate.step = 'email';
  gateErr('');
  hideGate();
  var isAdm = me && (me.role === 'owner' || me.role === 'admin');
  if (State.ui.page === 'admin' && !isAdm) State.ui.page = 'today';
  if (!App.booted) {
    switchPage(State.ui.page);
    boot();
  } else {
    resetState();
    loadCache();
    switchPage(State.ui.page);
    renderEverything();
    pullFromServer(true).then(function () { Outbox.flush(); refreshMe(); });
  }
  renderPlatformChrome();
  if (me && me.name) toast('Welcome' + (me.lastLoginAt ? ' back' : '') + ', ' + me.name.split(' ')[0], 'good');
}

/** Signs out on this device (or everywhere). Unsent edits stay on the device. */
function signOut(everywhere) {
  var token = Cfg.token;
  var finish = function () {
    Cfg.token = '';
    Cfg.me = null;
    State.me = null;
    // Cached lists of leads are wiped on sign-out, except for an account that
    // still has edits waiting to be sent — those are kept until they go out.
    try {
      var keep = {};
      Outbox.items.forEach(function (i) { keep['ev7:' + (i.ws || 'main') + ':cache'] = true; });
      Object.keys(localStorage).forEach(function (k) {
        if (/^ev7:.*:cache$/.test(k) && !keep[k]) localStorage.removeItem(k);
      });
    } catch (e) {}
    if (window.EV_DEMO && window.EV_DEMO.afterSignOut) { window.EV_DEMO.afterSignOut(); return; }
    location.reload();
  };
  if (everywhere) api('logoutAll', {}).then(finish);
  else api('logout', { token: token }).then(finish, finish);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACCOUNTS (workspaces) AND THE PERSON MENU
   ═══════════════════════════════════════════════════════════════════════════ */
function myWorkspaces() {
  var list = (State.me && State.me.workspaces) || [];
  return list.filter(function (w) { return w.status !== 'archived'; });
}

function currentWsName() {
  if (State.ws && State.ws.name) return State.ws.name;
  var id = Cfg.ws || 'main';
  var hit = null;
  myWorkspaces().forEach(function (w) { if (w.id === id) hit = w; });
  return hit ? hit.name : '';
}

function renderPlatformChrome() {
  var me = State.me || Cfg.me || null;
  if (me && !State.me) State.me = me;
  var admin = isAdminUser();
  var nav = $('#navAdmin');
  if (nav) nav.hidden = !admin;
  var mnav = $('#mnavAdmin');
  if (mnav) mnav.hidden = !admin;
  setBadge('nb-admin', State.pendingUsers || 0, (State.pendingUsers || 0) > 0);

  var btn = $('#btnMe');
  if (btn) {
    var label = (me && (me.name || me.email)) || Cfg.who || '';
    btn.innerHTML = me && me.picture
      ? '<img src="' + esc(me.picture) + '" alt="" referrerpolicy="no-referrer"/>'
      : '<span>' + esc(initialsOf(label)) + '</span>';
    btn.title = label ? label + ' — account menu' : 'Account';
  }

  var ws = $('#wsSwitch');
  if (ws) {
    var name = currentWsName();
    var many = myWorkspaces().length > 1 || admin;
    ws.hidden = !name && !many;
    ws.classList.toggle('static', !many);
    var lv = State.perm && State.perm.level;
    ws.innerHTML = '<span class="ws-dot"></span><span class="ws-name">' + esc(name || 'Account') + '</span>' +
      (lv === 'view' || lv === 'edit' ? '<span class="ws-level">' + (lv === 'view' ? 'View only' : 'Editor') + '</span>' : '') + (many ? icon('chev', 12) : '');
    ws.title = many ? 'Switch account' : name;
  }
  document.body.classList.toggle('is-viewer', isViewer());
}

function openWorkspacePicker() {
  var list = myWorkspaces();
  var admin = isAdminUser();
  if (list.length <= 1 && !admin) return;
  var cur = Cfg.ws || (State.ws && State.ws.id) || 'main';
  openModal({
    title: 'Switch account',
    narrow: true,
    noFocus: true,
    body: '<div class="ws-list">' + list.map(function (w) {
      return '<button class="ws-item' + (w.id === cur ? ' current' : '') + '" data-act="ws-pick" data-id="' + esc(w.id) + '">' +
        '<span class="ws-avatar">' + esc(initialsOf(w.name)) + '</span>' +
        '<span class="grow"><span class="ws-item-name">' + esc(w.name) + '</span>' +
        '<span class="tiny muted">' + (w.id === 'main' ? 'Main account' : 'Account') + (w.level ? ' · ' + esc(LEVEL_LABEL[w.level] || w.level) : '') + (w.status === 'paused' ? ' · paused' : '') + '</span></span>' +
        (w.id === cur ? '<span class="chip chip-good">Open</span>' : '') + '</button>';
    }).join('') + '</div>' +
    (admin ? '<div class="tiny muted">As an admin you can open every account. Changes you make inside one are recorded under your name.</div>' : ''),
    foot: (admin ? '<button class="btn" data-act="go-admin" data-value="accounts">Manage accounts</button>' : '') +
      '<button class="btn" data-act="close-modal">Close</button>'
  });
}

function switchWorkspace(id) {
  if (!id) return;
  closeModal();
  if (id === Cfg.ws) return;
  saveCache();
  if (State.ui.detailId && typeof closeDetail === 'function') closeDetail();
  Cfg.ws = id;
  resetState();
  loadCache();
  State.ws = State.ws && State.ws.id === id ? State.ws : { id: id, name: wsLabel(id) };
  State.ui.evoPlan = null;
  if (typeof Ai !== 'undefined') { Ai.chats = []; Ai.messages = []; Ai.activeChatId = null; Ai.loaded = State.ui.page === 'ai'; }
  if (typeof LeadEvo !== 'undefined') { LeadEvo.leadId = null; LeadEvo.messages = []; }
  Settings7.booking = null; Settings7.keys = null;
  renderEverything();
  renderPlatformChrome();
  toast('Opening ' + wsLabel(id) + '…');
  pullFromServer(false).then(function (ok) {
    if (ok) toast(currentWsName() + ' is open', 'good');
    if (State.ui.page === 'ai' && typeof loadChats === 'function') loadChats();
    if (State.ui.page === 'history' && typeof loadHistory === 'function') loadHistory();
    Outbox.flush();
  });
}

function openMeMenu() {
  var me = State.me || {};
  var tg = me.telegram || {};
  var many = myWorkspaces().length > 1 || isAdminUser();
  openModal({
    title: 'Your account',
    narrow: true,
    noFocus: true,
    body:
      '<div class="me-card"><span class="me-avatar">' + (me.picture ? '<img src="' + esc(me.picture) + '" alt="" referrerpolicy="no-referrer"/>' : esc(initialsOf(me.name || me.email || Cfg.who))) + '</span>' +
      '<span class="grow"><b>' + esc(me.name || (me.email || Cfg.who || '').split('@')[0]) + '</b><br/><span class="tiny muted">' + esc(me.email || Cfg.who || '') + '</span></span>' +
      roleChip(me.role) + '</div>' +
      '<div class="me-list">' +
      (many ? '<button class="me-item" data-act="ws-open">' + icon('pipeline', 15) + '<span class="grow">Switch account<br/><span class="tiny muted">Now: ' + esc(currentWsName() || '—') + '</span></span></button>' : '') +
      '<button class="me-item" data-act="settings-go" data-value="telegram">' + icon('tg', 15) + '<span class="grow">Telegram<br/><span class="tiny muted">' + (tg.linked ? 'Connected' + (tg.name ? ' as ' + esc(tg.name) : '') : 'Not connected — get your updates on your phone') + '</span></span></button>' +
      '<button class="me-item" data-act="settings-go" data-value="general">' + icon('settings', 15) + '<span class="grow">Settings</span></button>' +
      (isAdminUser() ? '<button class="me-item" data-act="go-admin" data-value="overview">' + icon('shield', 15) + '<span class="grow">Admin console' + (State.pendingUsers ? ' <span class="chip chip-warm">' + State.pendingUsers + ' waiting</span>' : '') + '</span></button>' : '') +
      '<button class="me-item mobile-only" data-act="theme-toggle">' + icon('eye', 15) + '<span class="grow">Light / dark</span></button>' +
      '</div>',
    foot: '<button class="btn btn-ghost btn-sm" data-act="sign-out-all" title="Ends every session on every device">Sign out everywhere</button>' +
      '<button class="btn btn-danger" data-act="logout">Sign out</button>'
  });
}

function refreshMe() {
  return api('me', {}).then(function (r) {
    if (r && r.success && r.me) {
      State.me = Object.assign({}, State.me || {}, r.me);
      Cfg.me = State.me;
      renderPlatformChrome();
    }
    return r;
  });
}

/** Today: a nudge for the admin while someone waits to be let in. */
function adminPendingBanner() {
  var n = State.pendingUsers || 0;
  if (!isAdminUser() || !n) return '';
  return '<div class="banner" data-act="go-admin" data-value="people">' + icon('bell', 15) +
    '<span class="grow"><b>' + n + (n > 1 ? ' people are' : ' person is') + ' waiting for access.</b> Approve to give them their own account.</span>' +
    '<span class="banner-cta">Review →</span></div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN CONSOLE
   ═══════════════════════════════════════════════════════════════════════════ */
var ADMIN_TABS = [
  ['overview', 'Overview'], ['people', 'People'], ['accounts', 'Accounts'], ['activity', 'Activity'],
  ['ai', 'AI providers'], ['telegram', 'Telegram'], ['platform', 'Platform'], ['api', 'API keys']
];

var Admin = {
  tab: 'overview', ov: null, audit: null, auditQ: { q: '', email: '', ws: '' }, ai: null, usage: null,
  config: null, tg: null, keys: null, sessions: null, models: {}, tests: {}, busy: {}, peopleFilter: 'all', peopleQ: ''
};

function adminTabFromStorage() {
  try { var t = localStorage.getItem('ev7_admin_tab'); if (t) Admin.tab = t; } catch (e) {}
}
adminTabFromStorage();

function adminLoad(kind, force) {
  if (Admin.busy[kind]) return Admin.busy[kind];
  var p;
  if (kind === 'ov') {
    p = api('adminOverview', { fresh: !!force }, { timeout: 120000 }).then(function (r) {
      if (r && r.success) {
        Admin.ov = r;
        State.pendingUsers = r.pending || 0;
      } else Admin.ovError = niceErr(r);
    });
  } else if (kind === 'audit') {
    p = api('adminAudit', { limit: 300, email: Admin.auditQ.email, ws: Admin.auditQ.ws, q: Admin.auditQ.q }).then(function (r) {
      Admin.audit = (r && r.success) ? r.audit : [];
    });
  } else if (kind === 'ai') {
    p = Promise.all([api('adminAiProviders', {}), api('adminAiUsage', { days: 14 }), api('aiStatus', {})]).then(function (rs) {
      if (rs[0] && rs[0].success) { Admin.ai = rs[0].providers; Admin.presets = rs[0].presets; }
      else Admin.aiError = niceErr(rs[0]);
      Admin.usage = (rs[1] && rs[1].success) ? rs[1].days : [];
      Admin.aiStatus = rs[2] && rs[2].success ? rs[2] : null;
    });
  } else if (kind === 'config') {
    p = api('adminGetConfig', {}).then(function (r) { Admin.config = (r && r.success) ? r.config : null; if (!r || !r.success) Admin.configError = niceErr(r); });
  } else if (kind === 'tg') {
    p = api('adminTelegramInfo', {}).then(function (r) { Admin.tg = (r && r.success) ? r : { error: niceErr(r) }; });
  } else if (kind === 'keys') {
    p = api('adminApiKeys', {}).then(function (r) { Admin.keys = (r && r.success) ? r.keys : []; });
  } else if (kind === 'sessions') {
    p = api('adminSessions', {}).then(function (r) { Admin.sessions = (r && r.success) ? r.sessions : []; });
  } else {
    p = Promise.resolve();
  }
  Admin.busy[kind] = p.then(function () { delete Admin.busy[kind]; renderAdmin(true); }, function () { delete Admin.busy[kind]; });
  return Admin.busy[kind];
}

function renderAdmin(force) {
  var host = $('#adminBody');
  if (!host) return;
  if (!isAdminUser()) {
    host.innerHTML = emptyBox('Admins only', 'Ask the owner if you need to manage people or accounts.');
    return;
  }
  var ae = document.activeElement;
  if (!force && host.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
  if (force && host.contains(ae) && /INPUT|TEXTAREA/.test(ae.tagName) && ae.value) return;
  var tab = Admin.tab;
  if (!ADMIN_TABS.some(function (t) { return t[0] === tab; })) tab = Admin.tab = 'overview';
  host.innerHTML =
    '<div class="settings-tabs" role="tablist">' + ADMIN_TABS.map(function (t) {
      var badge = t[0] === 'people' && State.pendingUsers ? ' <span class="tab-badge">' + State.pendingUsers + '</span>' : '';
      return '<button class="pill' + (tab === t[0] ? ' active' : '') + '" data-act="admin-tab" data-value="' + t[0] + '">' + esc(t[1]) + badge + '</button>';
    }).join('') + '</div>' +
    '<div id="adminPane">' + adminPaneHtml(tab) + '</div>';
}

function adminPaneHtml(tab) {
  switch (tab) {
    case 'overview': return adminOverviewHtml();
    case 'people': return adminPeopleHtml();
    case 'accounts': return adminAccountsHtml();
    case 'activity': return adminActivityHtml();
    case 'ai': return adminAiHtml();
    case 'telegram': return adminTelegramHtml();
    case 'platform': return adminPlatformHtml();
    case 'api': return adminApiHtml();
  }
  return '';
}

function needOv() {
  if (!Admin.ov) {
    adminLoad('ov');
    return Admin.ovError ? '<div class="card"><div class="card-body small" style="color:var(--danger)">' + esc(Admin.ovError) + '</div></div>' : loadingBox('Reading every account…');
  }
  return '';
}

function sumToday(usage) {
  var today = (usage || [])[0];
  if (!today || today.date !== Dates.today()) return { c: 0, e: 0 };
  var c = 0, e = 0;
  Object.keys(today.usage || {}).forEach(function (k) { if (k.charAt(0) === '_') return; c += today.usage[k].c || 0; e += today.usage[k].e || 0; });
  return { c: c, e: e };
}

/* ─── overview ── */
function adminOverviewHtml() {
  var wait = needOv();
  if (wait) return wait;
  var ov = Admin.ov;
  var users = ov.users || [], ws = ov.workspaces || [];
  var active = users.filter(function (u) { return u.status === 'active'; });
  var pending = users.filter(function (u) { return u.status === 'pending'; });
  var ai = sumToday(ov.aiUsage);
  var changes = ws.reduce(function (s, w) { return s + (w.changes7d || 0); }, 0);
  var newLeads = ws.reduce(function (s, w) { return s + (w.new7d || 0); }, 0);

  // The backend address lives only in this browser until config.js has it —
  // until then, people you invite and booking visitors cannot connect.
  var cfgMissing = !APP_CONFIG.apiUrl && Cfg.url && !window.EV_DEMO;
  var cfgLine = "apiUrl: '" + Cfg.url + "',";
  return (cfgMissing ? '<div class="card" style="border-color:var(--warm);margin-bottom:14px"><div class="card-body">' +
      '<div class="card-title" style="margin-bottom:6px">One step left: put the backend address in config.js</div>' +
      '<div class="small" style="margin-bottom:10px">This browser knows where the backend is, but the people you invite and the visitors to your booking link do not yet. In GitHub, open <b>assets/js/config.js</b>, press the pencil, and change the <code>apiUrl</code> line to this:</div>' +
      '<div class="api-doc"><code style="word-break:break-all">' + esc(cfgLine) + '</code></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn btn-sm btn-primary" data-act="copy" data-value="' + esc(cfgLine) + '">' + icon('copy', 12) + ' Copy the line</button></div>' +
      '</div></div>' : '') +
    '<div class="pane-head"><div class="tiny muted">Updated ' + esc(Fmt.ago(ov.generatedAt)) + '</div>' +
    '<button class="btn btn-sm" data-act="admin-refresh">' + icon('sync', 12) + ' Refresh</button></div>' +
    '<div class="stat-grid">' +
    statCard('Accounts', ws.filter(function (w) { return w.status !== 'archived'; }).length, ws.length + ' in total', 'var(--accent)', 'admin', 'accounts') +
    statCard('People', active.length, users.length + ' with access', 'var(--info)', 'admin', 'people') +
    statCard('Waiting', pending.length, pending.length ? 'need your approval' : 'nobody waiting', pending.length ? 'var(--hot)' : 'var(--ink-4)', 'admin', 'people') +
    statCard('New leads, 7 days', newLeads, changes + ' changes across accounts', 'var(--good)', 'admin', 'activity') +
    statCard('AI today', ai.c, ai.e ? ai.e + ' failed' : 'requests', 'var(--warm)', 'admin', 'ai') +
    '</div>' +
    (pending.length ? '<div class="card" style="margin-bottom:14px"><div class="card-head"><div class="card-title">Waiting for access</div></div><div class="card-body list-body">' +
      pending.map(pendingRowHtml).join('') + '</div></div>' : '') +
    '<div class="card" style="margin-bottom:14px"><div class="card-head"><div class="card-title">Accounts at a glance</div>' +
    '<button class="btn btn-sm" data-act="admin-tab" data-value="accounts">Manage</button></div><div class="card-body list-body">' +
    ws.filter(function (w) { return w.status !== 'archived'; }).map(wsGlanceHtml).join('') + '</div></div>' +
    '<div class="card"><div class="card-head"><div class="card-title">Latest across the platform</div>' +
    '<button class="btn btn-sm" data-act="admin-tab" data-value="activity">See all</button></div><div class="card-body list-body">' +
    (ov.audit || []).slice(0, 12).map(auditRowHtml).join('') + '</div></div>';
}

function pendingRowHtml(u) {
  return '<div class="list-row">' +
    '<span class="avatar">' + esc(initialsOf(u.name || u.email)) + '</span>' +
    '<div class="grow"><div class="lr-title">' + esc(u.name || u.email) + '</div>' +
    '<div class="tiny muted">' + esc(u.email) + ' · asked ' + esc(Fmt.ago(u.createdAt)) + '</div>' +
    (u.note ? '<div class="small" style="margin-top:3px">“' + esc(u.note) + '”</div>' : '') + '</div>' +
    '<div class="lr-actions"><button class="btn btn-sm btn-primary" data-act="admin-approve" data-value="' + esc(u.email) + '">Approve</button>' +
    '<button class="btn btn-sm" data-act="admin-reject" data-value="' + esc(u.email) + '">Reject</button></div></div>';
}

function wsGlanceHtml(w) {
  var who = Object.keys(w.whoToday || {}).map(function (e) { return e.split('@')[0] + ' ' + w.whoToday[e]; }).join(', ');
  return '<div class="list-row">' +
    '<span class="avatar ws">' + esc(initialsOf(w.name)) + '</span>' +
    '<div class="grow"><div class="lr-title">' + esc(w.name) + (w.status === 'paused' ? ' <span class="chip chip-warm">paused</span>' : '') + '</div>' +
    '<div class="tiny muted">' + esc(w.owner || '') + (w.lastActiveAt ? ' · active ' + esc(Fmt.ago(w.lastActiveAt)) : ' · no activity yet') + '</div>' +
    (w.error ? '<div class="tiny" style="color:var(--danger)">' + esc(w.error) + '</div>' : '') + '</div>' +
    '<div class="lr-stats">' +
    '<span class="mini-stat"><b>' + (w.leads || 0) + '</b> leads</span>' +
    '<span class="mini-stat"><b>' + (w.new7d || 0) + '</b> new 7d</span>' +
    '<span class="mini-stat" title="' + esc(who) + '"><b>' + (w.writesToday || 0) + '</b> today</span>' +
    '</div>' +
    '<div class="lr-actions"><button class="btn btn-sm" data-act="ws-pick" data-id="' + esc(w.id) + '">Open</button></div></div>';
}

function auditRowHtml(a) {
  return '<div class="audit-row"><span class="hist-time">' + esc(Fmt.ago(a.at)) + '</span>' +
    '<span class="grow"><b>' + esc(AUDIT_LABEL[a.action] || a.action) + '</b> ' + esc(a.detail || '') +
    '<span class="tiny muted"> — ' + esc(a.email || 'system') + (a.ws ? ' · ' + esc(wsLabel(a.ws)) : '') + (a.via && a.via !== 'app' ? ' · ' + esc(a.via) : '') + '</span></span></div>';
}

var AUDIT_LABEL = {
  login: 'Signed in', invite: 'Invited', approve: 'Approved', reject: 'Rejected', access_request: 'Asked for access',
  user_saved: 'Person updated', access_key: 'Access key', revoke_sessions: 'Signed out everywhere', logout_all: 'Signed out everywhere',
  workspace_created: 'Account created', workspace_saved: 'Account updated', ai_provider: 'AI provider', config: 'Settings',
  api_key: 'API key', telegram_linked: 'Telegram connected', telegram_unlinked: 'Telegram disconnected', telegram_webhook: 'Telegram bot',
  run_job: 'Ran', platform: 'Platform', calendar_repair: 'Calendar'
};

/* ─── people ── */
function adminPeopleHtml() {
  var wait = needOv();
  if (wait) return wait;
  var users = (Admin.ov.users || []).slice();
  var f = Admin.peopleFilter, q = Admin.peopleQ.toLowerCase();
  var counts = { all: users.length, active: 0, pending: 0, invited: 0, off: 0 };
  users.forEach(function (u) {
    if (u.status === 'active') counts.active++;
    else if (u.status === 'pending') counts.pending++;
    else if (u.status === 'invited') counts.invited++;
    else counts.off++;
  });
  var list = users.filter(function (u) {
    if (f === 'active' && u.status !== 'active') return false;
    if (f === 'pending' && u.status !== 'pending') return false;
    if (f === 'invited' && u.status !== 'invited') return false;
    if (f === 'off' && !(u.status === 'blocked' || u.status === 'removed')) return false;
    if (q && (u.name + ' ' + u.email).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) {
    var rank = { pending: 0, owner: 1 };
    var ra = a.status === 'pending' ? 0 : a.role === 'owner' ? 1 : 2, rb = b.status === 'pending' ? 0 : b.role === 'owner' ? 1 : 2;
    return ra - rb || String(b.lastLoginAt || '').localeCompare(String(a.lastLoginAt || ''));
  });

  return '<div class="pane-head"><div class="row">' +
    '<input class="input" id="peopleSearch" placeholder="Search people" value="' + esc(Admin.peopleQ) + '" style="max-width:220px"/>' +
    '<div class="pill-row">' + [['all', 'All'], ['active', 'Active'], ['pending', 'Waiting'], ['invited', 'Invited'], ['off', 'Switched off']].map(function (p) {
      return '<button class="pill' + (f === p[0] ? ' active' : '') + '" data-act="people-filter" data-value="' + p[0] + '">' + p[1] + ' <span class="muted">' + counts[p[0]] + '</span></button>';
    }).join('') + '</div></div></div>' +
    '<div class="card"><div class="card-body list-body">' +
    (list.length ? list.map(personRowHtml).join('') : emptyBox('Nobody here', 'Try another filter.')) +
    '</div></div>' +
    '<div class="tiny muted" style="margin-top:10px">Admins see and manage every account. Everyone else opens only the accounts ticked for them — as Manager, Editor or Viewer, with the pages, leads and money you choose. Press “Access” to change it.</div>';
}

var LEVEL_LABEL = { admin: 'Admin', manage: 'Manager', edit: 'Editor', view: 'Viewer' };
var LEVEL_HELP = {
  manage: 'Everything in this account — its settings, booking page and API keys too.',
  edit: 'Works the leads: adds, updates, logs calls and meetings. Cannot change the account’s setup.',
  view: 'Looks only. Cannot change anything.'
};
var SECTION_LIST = [['leads', 'Leads'], ['pipeline', 'Pipeline'], ['followups', 'Follow-ups'], ['meetings', 'Meetings'], ['notes', 'Notes & tasks'],
  ['history', 'History'], ['reports', 'Reports by date'], ['analytics', 'Pipeline overview'], ['ai', 'AI assistant'], ['messages', 'Messages'], ['docs', 'Documents'], ['archive', 'Archive']];

function levelChip(level) {
  var cls = level === 'admin' ? 'chip-good' : level === 'manage' ? 'chip-info' : level === 'view' ? 'chip-ghost' : 'chip-cold';
  return '<span class="chip ' + cls + '">' + esc(LEVEL_LABEL[level] || level) + '</span>';
}

/** "Main · Viewer · no ৳" chips for a person's row. */
function accessChipsHtml(u) {
  if (u.role === 'owner' || u.role === 'admin') return '<span class="acc-chip all">Every account</span>';
  var a = u.access || {};
  var ids = Object.keys(a);
  if (!ids.length) return '<span class="acc-chip none">No account yet</span>';
  return ids.map(function (id) {
    var e = a[id] || {};
    var off = e.sections ? Object.keys(e.sections).filter(function (k) { return e.sections[k] === false; }).length : 0;
    return '<span class="acc-chip lv-' + esc(e.level) + '">' + esc(wsLabel(id)) + ' · ' + esc(LEVEL_LABEL[e.level] || e.level) +
      (e.leads === 'own' ? ' · own leads' : '') + (e.money === false ? ' · no ৳' : '') + (off ? ' · ' + off + ' pages hidden' : '') + '</span>';
  }).join('');
}

function personRowHtml(u) {
  var expired = u.expiresAt && u.expiresAt < Dates.today();
  return '<div class="list-row">' +
    '<span class="avatar">' + (u.picture ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer"/>' : esc(initialsOf(u.name || u.email))) + '</span>' +
    '<div class="grow"><div class="lr-title">' + esc(u.name || u.email.split('@')[0]) + ' ' + roleChip(u.role) + (u.status !== 'active' ? ' ' + statusChip(u.status) : '') +
    (u.telegram ? ' <span class="chip chip-info" title="' + esc(u.tgName || '') + '">' + icon('tg', 10) + ' Telegram</span>' : '') +
    (u.expiresAt ? ' <span class="chip ' + (expired ? 'chip-danger' : 'chip-warm') + '">' + (expired ? 'ended ' : 'until ') + esc(Fmt.date(u.expiresAt)) + '</span>' : '') + '</div>' +
    '<div class="tiny muted">' + esc(u.email) + '</div>' +
    '<div class="acc-chips">' + accessChipsHtml(u) + '</div>' +
    '<div class="tiny muted">' + (u.lastLoginAt ? 'Last in ' + esc(Fmt.ago(u.lastLoginAt)) + ' · ' + (u.loginCount || 0) + ' sign-ins' : 'Has not signed in yet') + '</div></div>' +
    '<div class="lr-actions">' +
    (u.status === 'pending'
      ? '<button class="btn btn-sm btn-primary" data-act="admin-approve" data-value="' + esc(u.email) + '">Approve</button><button class="btn btn-sm" data-act="admin-reject" data-value="' + esc(u.email) + '">Reject</button>'
      : '<button class="btn btn-sm" data-act="admin-edit-user" data-value="' + esc(u.email) + '">' + icon('edit', 12) + ' Access</button>' +
        (u.status === 'invited' ? '<button class="btn btn-sm" data-act="admin-reinvite" data-value="' + esc(u.email) + '" title="New invite link">Link</button>' : '')) +
    (u.role !== 'owner' && u.email !== Cfg.who ? '<button class="btn btn-sm btn-ghost btn-icon danger-hover" data-act="v8-delete-user" data-value="' + esc(u.email) + '" title="Delete this person for good">' + icon('trash', 13) + '</button>' : '') +
    '</div></div>';
}

function wsOptions(selected, includeNone) {
  var list = allWorkspaces().filter(function (w) { return w.status !== 'archived'; });
  return (includeNone ? '<option value="">—</option>' : '') + list.map(function (w) {
    return '<option value="' + esc(w.id) + '"' + (w.id === selected ? ' selected' : '') + '>' + esc(w.name) + '</option>';
  }).join('');
}

/**
 * The access editor: one row per account. Tick = can open it. Each ticked
 * account gets a level, and "Customize" opens which leads, which pages, and
 * whether money, export and archiving are allowed.
 */
function accessEditorHtml(prefix, access) {
  access = access || {};
  var list = allWorkspaces().filter(function (w) { return w.status !== 'archived' || access[w.id]; });
  return '<div class="acc-editor" id="' + prefix + 'Acc">' +
    '<div class="acc-presets"><span class="tiny muted">Quick:</span>' +
    '<button type="button" class="pill" data-act="acc-preset" data-prefix="' + prefix + '" data-value="view">Viewer in all</button>' +
    '<button type="button" class="pill" data-act="acc-preset" data-prefix="' + prefix + '" data-value="edit">Editor in all</button>' +
    '<button type="button" class="pill" data-act="acc-preset" data-prefix="' + prefix + '" data-value="none">Untick all</button></div>' +
    list.map(function (w) {
      var e = access[w.id];
      var lv = e ? e.level : 'edit';
      var secs = (e && e.sections) || {};
      var custom = e && (e.leads === 'own' || e.money === false || e.sections);
      var name = prefix + 'L_' + w.id;
      return '<div class="acc-row' + (e ? ' on' : '') + '" data-ws="' + esc(w.id) + '">' +
        '<div class="acc-main">' +
        '<label class="acc-tick"><input type="checkbox" class="acc-on"' + (e ? ' checked' : '') + '/><span class="acc-name">' + esc(w.name) + '</span></label>' +
        '<select class="select acc-level" aria-label="Level in ' + esc(w.name) + '">' + ['manage', 'edit', 'view'].map(function (l) {
          return '<option value="' + l + '"' + (lv === l ? ' selected' : '') + '>' + LEVEL_LABEL[l] + '</option>';
        }).join('') + '</select>' +
        '<button type="button" class="btn btn-sm acc-more-btn' + (custom ? ' has-custom' : '') + '" data-act="acc-toggle">Customize</button>' +
        '</div>' +
        '<div class="acc-help tiny muted">' + esc(LEVEL_HELP[lv]) + '</div>' +
        '<div class="acc-detail" hidden>' +
        '<div class="acc-sub">Which leads</div>' +
        '<div class="seg">' +
        '<label><input type="radio" name="' + esc(name) + '" value="all"' + (!e || e.leads !== 'own' ? ' checked' : '') + '/><span>All leads</span></label>' +
        '<label><input type="radio" name="' + esc(name) + '" value="own"' + (e && e.leads === 'own' ? ' checked' : '') + '/><span>Only leads assigned to them</span></label></div>' +
        '<div class="acc-sub">Pages they see <span class="tiny muted">(Today is always there)</span></div>' +
        '<div class="chip-picks">' + SECTION_LIST.map(function (s) {
          return '<label class="pick"><input type="checkbox" class="acc-sec" value="' + s[0] + '"' + (secs[s[0]] === false ? '' : ' checked') + '/><span>' + esc(s[1]) + '</span></label>';
        }).join('') + '</div>' +
        '<div class="acc-sub">Also</div>' +
        '<label class="check-row"><input type="checkbox" class="acc-money"' + (e && e.money === false ? '' : ' checked') + '/> See deal values and pipeline money</label>' +
        '<label class="check-row"><input type="checkbox" class="acc-export"' + ((e && e.export !== undefined ? e.export : lv === 'manage') ? ' checked' : '') + '/> Export leads to CSV and take backups</label>' +
        '<label class="check-row"><input type="checkbox" class="acc-del"' + ((e && e.del !== undefined ? e.del : lv !== 'view') ? ' checked' : '') + '/> Archive, merge and delete</label>' +
        '<label class="check-row"><input type="checkbox" class="acc-api"' + ((e && e.api !== undefined ? e.api : lv === 'manage') ? ' checked' : '') + '/> API &amp; integrations (keys, webhooks, n8n, Chrome extension)</label>' +
        '</div></div>';
    }).join('') + '</div>';
}

function readAccessEditor(prefix) {
  var out = {};
  $$('#' + prefix + 'Acc .acc-row').forEach(function (row) {
    if (!$('.acc-on', row).checked) return;
    var e = { level: $('.acc-level', row).value };
    var leads = $('input[type="radio"]:checked', row);
    if (leads && leads.value === 'own') e.leads = 'own';
    var secs = {}, anyOff = false;
    $$('.acc-sec', row).forEach(function (c) { if (!c.checked) { secs[c.value] = false; anyOff = true; } });
    if (anyOff) e.sections = secs;
    if (!$('.acc-money', row).checked) e.money = false;
    e.export = $('.acc-export', row).checked;
    e.del = $('.acc-del', row).checked;
    if ($('.acc-api', row)) e.api = $('.acc-api', row).checked;
    out[row.dataset.ws] = e;
  });
  return out;
}

function wireAccessEditor(prefix) {
  var host = $('#' + prefix + 'Acc');
  if (!host || host.dataset.wired) return;
  host.dataset.wired = '1';
  host.addEventListener('change', function (ev) {
    var t = ev.target;
    var row = t.closest('.acc-row');
    if (!row) return;
    if (t.classList.contains('acc-on')) row.classList.toggle('on', t.checked);
    if (t.classList.contains('acc-level')) {
      $('.acc-help', row).textContent = LEVEL_HELP[t.value];
      if (t.value === 'view') { $('.acc-del', row).checked = false; if ($('.acc-api', row)) $('.acc-api', row).checked = false; }
      if (t.value === 'manage') { $('.acc-export', row).checked = true; $('.acc-del', row).checked = true; if ($('.acc-api', row)) $('.acc-api', row).checked = true; }
      if (!$('.acc-on', row).checked) { $('.acc-on', row).checked = true; row.classList.add('on'); }
    }
    if (!t.classList.contains('acc-on') && !t.classList.contains('acc-level') && !$('.acc-on', row).checked) {
      $('.acc-on', row).checked = true; row.classList.add('on');
    }
  });
}

/* Who gets what — shared by "Give someone access" and "Approve". */
function grantChoiceHtml(prefix, defName, opts) {
  opts = opts || {};
  var owner = State.me && State.me.role === 'owner';
  return '<div class="radio-list grant-kind" data-prefix="' + prefix + '">' +
    '<label class="radio-row"><input type="radio" name="' + prefix + 'Kind" value="own" checked/><span><b>Their own account</b>, ' +
    '<select class="select select-inline" id="' + prefix + 'Clone"><option value="settings">set up like (no leads)</option><option value="copy">an exact copy — duplicates every lead — of</option><option value="blank">blank — not like</option></select> ' +
    '<select class="select select-inline" id="' + prefix + 'From">' + wsOptions(Cfg.ws || 'main') + '</select><br/>' +
    '<span class="tiny muted">They manage it. Same stages, labels, templates and AI instructions; empty unless you pick the exact copy.</span></span></label>' +
    '<label class="radio-row"><input type="radio" name="' + prefix + 'Kind" value="custom"/><span><b>Access to accounts you choose</b><br/>' +
    '<span class="tiny muted">Tick the dashboards — yours, Rahim’s, any — and pick Manager, Editor or Viewer for each. Customize hides pages, money, or other people’s leads.</span></span></label>' +
    (owner ? '<label class="radio-row"><input type="radio" name="' + prefix + 'Kind" value="admin"/><span><b>Admin — everything</b><br/><span class="tiny muted">Every account, people, AI keys and the admin console. Only for people you trust fully.</span></span></label>' : '') +
    '</div>' +
    '<div class="field" id="' + prefix + 'NameWrap"><label>Account name</label><input class="input" id="' + prefix + 'WsName" value="' + esc(defName || '') + '" placeholder="Rahim\'s workspace"/></div>' +
    '<div id="' + prefix + 'CustomWrap" hidden>' + accessEditorHtml(prefix, opts.access || {}) + '</div>' +
    '<details class="more-opts"><summary class="small">Access ends on a date (optional)</summary>' +
    '<div class="field" style="margin-top:8px"><input class="input" type="date" id="' + prefix + 'Exp" min="' + Dates.today() + '" style="max-width:200px"/>' +
    '<div class="tiny muted">After this day they are signed out and cannot sign in. Good for freelancers and trials.</div></div></details>';
}

function wireGrantChoice(prefix) {
  var box = $('.grant-kind[data-prefix="' + prefix + '"]');
  if (!box) return;
  var sync = function () {
    var k = ($('input[name="' + prefix + 'Kind"]:checked') || {}).value || 'own';
    $('#' + prefix + 'NameWrap').hidden = k !== 'own';
    $('#' + prefix + 'CustomWrap').hidden = k !== 'custom';
  };
  box.addEventListener('change', sync);
  sync();
  wireAccessEditor(prefix);
}

function readGrantChoice(prefix) {
  var k = ($('input[name="' + prefix + 'Kind"]:checked') || {}).value || 'own';
  var exp = ($('#' + prefix + 'Exp') || {}).value || '';
  var out;
  if (k === 'admin') out = { role: 'admin', wsMode: 'none' };
  else if (k === 'custom') out = { role: 'member', wsMode: 'custom', access: readAccessEditor(prefix) };
  else out = { role: 'member', wsMode: 'new', cloneMode: ($('#' + prefix + 'Clone') || {}).value || 'settings', cloneFrom: ($('#' + prefix + 'From') || {}).value || 'main', wsName: (($('#' + prefix + 'WsName') || {}).value || '').trim() };
  if (exp) out.expiresAt = exp;
  return out;
}

function openInviteForm(prefillEmail) {
  openModal({
    title: 'Give someone access',
    wide: true,
    body:
      '<div class="field-row"><div class="field"><label>Email</label><input class="input" id="invEmail" type="email" placeholder="rahim@gmail.com" value="' + esc(prefillEmail || '') + '"/></div>' +
      '<div class="field"><label>Name</label><input class="input" id="invName" placeholder="Rahim"/></div></div>' +
      '<div class="field"><label>What they get</label>' + grantChoiceHtml('inv', '') + '</div>' +
      '<label class="row" style="cursor:pointer"><input type="checkbox" id="invMail" checked/> <span class="small">Email them the sign-in link</span></label>' +
      '<div class="tiny muted">They sign in with this email — a one-time code is emailed to them, or they use Sign in with Google. No password, no setup.</div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="admin-invite-send">Create access</button>'
  });
  wireGrantChoice('inv');
  var nameEl = $('#invName');
  if (nameEl) nameEl.addEventListener('input', function () {
    var w = $('#invWsName');
    if (w && (!w.value || w.dataset.auto === '1')) { w.value = nameEl.value ? nameEl.value.trim() + "'s workspace" : ''; w.dataset.auto = '1'; }
  });
}

function sendInvite() {
  var email = String(($('#invEmail') || {}).value || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Type a valid email address', 'warn'); return; }
  var body = Object.assign({
    email: email, name: (($('#invName') || {}).value || '').trim(),
    sendEmail: !!($('#invMail') || {}).checked, appUrl: appBaseUrl()
  }, readGrantChoice('inv'));
  if (body.wsMode === 'custom' && !Object.keys(body.access).length) { toast('Tick at least one account they can open', 'warn'); return; }
  var btn = $('[data-act="admin-invite-send"]');
  if (btn) { btn.disabled = true; btn.textContent = body.wsMode === 'new' ? 'Creating their account…' : 'Saving…'; }
  api('adminInvite', body, { timeout: 120000 }).then(function (r) {
    if (!r || !r.success) {
      if (btn) { btn.disabled = false; btn.textContent = 'Create access'; }
      toast(niceErr(r), 'err', 6000);
      return;
    }
    Admin.ov = null;
    adminLoad('ov', true);
    showInviteLink(r, email);
  });
}

function showInviteLink(r, email) {
  var link = r.link || '';
  var msg = 'You have access to the ' + ((Gate.conf && Gate.conf.brand) || 'Everstone') + ' Lead Tracker. Open this link and sign in with ' + email + ': ' + link;
  openModal({
    title: 'Access ready',
    narrow: true,
    noFocus: true,
    body:
      '<div class="small">' + (r.mailed ? '✅ The sign-in link was emailed to <b>' + esc(email) + '</b>.' : 'Send this link to <b>' + esc(email) + '</b>:') + '</div>' +
      (r.user ? '<div class="acc-chips">' + accessChipsHtml(r.user) + '</div>' : '') +
      (link ? '<div class="link-box"><code>' + esc(link) + '</code></div>' +
        '<div class="row"><button class="btn btn-sm" data-act="copy" data-value="' + esc(link) + '">' + icon('copy', 12) + ' Copy link</button>' +
        '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">' + icon('wa', 12) + ' WhatsApp</a>' +
        '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('Your Lead Tracker access') + '">' + icon('tg', 12) + ' Telegram</a></div>'
        : '<div class="small" style="color:var(--warm)">No link yet — set the dashboard address under Admin → Platform, then press “Link” on their row.</div>') +
      '<div class="tiny muted">The link works for 14 days. They can also just open the dashboard and sign in with this email.</div>',
    foot: '<button class="btn btn-primary" data-act="close-modal">Done</button>'
  });
}

function openApproveForm(email) {
  var u = ((Admin.ov && Admin.ov.users) || []).filter(function (x) { return x.email === email; })[0] || { email: email };
  openModal({
    title: 'Approve ' + (u.name || email),
    wide: true,
    body:
      '<div class="small">' + esc(u.name || '') + ' <span class="muted">' + esc(email) + '</span></div>' +
      (u.note ? '<div class="small quote">“' + esc(u.note) + '”</div>' : '') +
      '<div class="field"><label>What they get</label>' + grantChoiceHtml('ap', (u.name || email.split('@')[0]) + "'s workspace") + '</div>' +
      '<div class="tiny muted">They get an email saying they are in, and can sign in straight away.</div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="admin-approve-send" data-value="' + esc(email) + '">Approve</button>'
  });
  wireGrantChoice('ap');
}

function sendApprove(email) {
  var body = Object.assign({ email: email, appUrl: appBaseUrl() }, readGrantChoice('ap'));
  if (body.wsMode === 'custom' && !Object.keys(body.access).length) { toast('Tick at least one account they can open', 'warn'); return; }
  var btn = $('[data-act="admin-approve-send"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Setting up…'; }
  api('adminApprove', body, { timeout: 120000 }).then(function (r) {
    if (!r || !r.success) { if (btn) { btn.disabled = false; btn.textContent = 'Approve'; } toast(niceErr(r), 'err'); return; }
    closeModal();
    toast((r.user && (r.user.name || r.user.email)) + ' is in', 'good');
    State.pendingUsers = Math.max(0, (State.pendingUsers || 1) - 1);
    adminLoad('ov', true);
    renderChrome();
  });
}

function openEditUser(email) {
  var u = ((Admin.ov && Admin.ov.users) || []).filter(function (x) { return x.email === email; })[0];
  if (!u) return;
  var iAmOwner = State.me && State.me.role === 'owner';
  var isOwner = u.role === 'owner';
  var isAdmin = u.role === 'admin';
  var lockAdmin = isAdmin && !iAmOwner;
  openModal({
    title: (u.name || u.email) + ' — access',
    wide: true,
    body:
      '<div class="tiny muted">' + esc(u.email) + ' · added ' + esc(Fmt.ago(u.createdAt)) + (u.createdBy ? ' by ' + esc(u.createdBy) : '') + '</div>' +
      '<div class="field-row"><div class="field"><label>Name</label><input class="input" id="euName" value="' + esc(u.name || '') + '"/></div>' +
      '<div class="field"><label>Private note</label><input class="input" id="euNote" value="' + esc(u.note || '') + '" placeholder="Only admins see this"/></div></div>' +
      (isOwner
        ? '<div class="field"><label>Access</label><div class="small">' + roleChip('owner') + ' Everything, always.</div></div>'
        : '<div class="field"><label>Access</label><div class="radio-list grant-kind" data-prefix="eu">' +
          (iAmOwner || isAdmin ? '<label class="radio-row"><input type="radio" name="euKind" value="admin"' + (isAdmin ? ' checked' : '') + (lockAdmin ? ' disabled' : '') + '/><span><b>Admin — everything</b><br/><span class="tiny muted">Every account and the admin console.' + (lockAdmin ? ' Only the owner can change an admin.' : '') + '</span></span></label>' : '') +
          '<label class="radio-row"><input type="radio" name="euKind" value="custom"' + (!isAdmin ? ' checked' : '') + (lockAdmin ? ' disabled' : '') + '/><span><b>Custom access</b><br/><span class="tiny muted">Only the accounts ticked below, each with its own level.</span></span></label></div>' +
          '<div id="euCustomWrap"' + (isAdmin ? ' hidden' : '') + '>' + accessEditorHtml('eu', u.access || {}) + '</div></div>' +
          '<div class="field-row"><div class="field"><label>Opens first</label><select class="select" id="euDefault">' + wsOptions(u.defaultWs, true) + '</select></div>' +
          '<div class="field"><label>Access ends on (optional)</label><input class="input" type="date" id="euExp" value="' + esc(u.expiresAt || '') + '"/></div></div>') +
      (isOwner ? '' : toggleHtml('euActive', u.status === 'active' || u.status === 'invited', 'Access switched on', 'Switching off signs them out everywhere at once. Their data stays.')) +
      '<hr class="divider" style="margin:4px 0"/>' +
      '<div class="row"><button class="btn btn-sm" data-act="admin-key" data-value="' + esc(u.email) + '">' + icon('link', 12) + (u.hasKey ? ' New access key' : ' Make an access key') + '</button>' +
      '<button class="btn btn-sm" data-act="admin-revoke" data-value="' + esc(u.email) + '">Sign them out everywhere</button>' +
      '<button class="btn btn-sm" data-act="admin-audit-for" data-value="' + esc(u.email) + '">What they did</button></div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="admin-save-user" data-value="' + esc(u.email) + '">Save</button>'
  });
  var box = $('.grant-kind[data-prefix="eu"]');
  if (box) box.addEventListener('change', function () {
    var k = ($('input[name="euKind"]:checked') || {}).value;
    $('#euCustomWrap').hidden = k !== 'custom';
  });
  wireAccessEditor('eu');
}

function saveUserFromForm(email) {
  var u = ((Admin.ov && Admin.ov.users) || []).filter(function (x) { return x.email === email; })[0] || {};
  var patch = { email: email, name: ($('#euName') || {}).value || '', note: ($('#euNote') || {}).value || '' };
  if (u.role !== 'owner') {
    var kind = ($('input[name="euKind"]:checked') || {}).value || 'custom';
    if (!(u.role === 'admin' && !(State.me && State.me.role === 'owner'))) {
      patch.role = kind === 'admin' ? 'admin' : 'member';
      if (kind === 'custom') {
        patch.access = readAccessEditor('eu');
        if (!Object.keys(patch.access).length && $('#euActive') && $('#euActive').checked) { toast('Tick at least one account, or switch their access off', 'warn'); return; }
      }
    }
    patch.defaultWs = ($('#euDefault') || {}).value || '';
    patch.expiresAt = ($('#euExp') || {}).value || '';
    var on = !!($('#euActive') || {}).checked;
    if (!on) patch.status = 'blocked';
    else if (u.status === 'blocked' || u.status === 'removed') patch.status = 'active';
  }
  api('adminSaveUser', { user: patch }).then(function (r) {
    if (!r || !r.success) { toast(niceErr(r), 'err', 6000); return; }
    closeModal();
    toast('Access saved' + (r.user && r.user.telegram ? ' — they were told on Telegram' : ''), 'good');
    adminLoad('ov', true);
  });
}

/** Account-first view: everyone, and what they can do in this one account. */
function openWorkspaceAccess(wsId) {
  var users = ((Admin.ov && Admin.ov.users) || []).filter(function (u) { return u.status !== 'removed' && u.status !== 'pending'; });
  openModal({
    title: 'Who can open ' + wsLabel(wsId),
    wide: true,
    body: '<div class="tiny muted">Pick a level for each person. “No access” means the account does not exist for them. Pages, money and own-leads-only are under each person’s Access button.</div>' +
      '<div class="ws-access">' + users.map(function (u) {
        var admin = u.role === 'owner' || u.role === 'admin';
        var e = (u.access || {})[wsId];
        return '<div class="wsa-row" data-email="' + esc(u.email) + '" data-was="' + esc(e ? e.level : '') + '" data-wasleads="' + esc(e && e.leads === 'own' ? 'own' : 'all') + '">' +
          '<span class="avatar sm">' + esc(initialsOf(u.name || u.email)) + '</span>' +
          '<span class="grow"><b>' + esc(u.name || u.email.split('@')[0]) + '</b><br/><span class="tiny muted">' + esc(u.email) + '</span></span>' +
          (admin ? levelChip('admin') + '<span class="tiny muted">always</span>'
            : '<select class="select wsa-level">' + [['', 'No access'], ['manage', 'Manager'], ['edit', 'Editor'], ['view', 'Viewer']].map(function (o) {
                return '<option value="' + o[0] + '"' + ((e ? e.level : '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
              }).join('') + '</select>' +
              '<select class="select wsa-leads"' + (e ? '' : ' disabled') + '><option value="all">All leads</option><option value="own"' + (e && e.leads === 'own' ? ' selected' : '') + '>Only theirs</option></select>') +
          '</div>';
      }).join('') + '</div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="admin-ws-access-save" data-id="' + esc(wsId) + '">Save</button>'
  });
  $$('#modalBody .wsa-level').forEach(function (sel) {
    sel.addEventListener('change', function () { var l = sel.parentNode.querySelector('.wsa-leads'); if (l) l.disabled = !sel.value; });
  });
}

function saveWorkspaceAccess(wsId) {
  var people = [];
  $$('#modalBody .wsa-row').forEach(function (row) {
    var sel = $('.wsa-level', row);
    if (!sel) return;
    var leads = ($('.wsa-leads', row) || {}).value || 'all';
    if (sel.value === row.dataset.was && (!sel.value || leads === row.dataset.wasleads)) return;
    people.push({ email: row.dataset.email, level: sel.value, entry: sel.value ? { leads: leads } : undefined });
  });
  if (!people.length) { closeModal(); return; }
  api('adminSetWorkspaceAccess', { wsId: wsId, people: people }).then(function (r) {
    if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
    closeModal();
    toast('Access saved for ' + r.changed + (r.changed === 1 ? ' person' : ' people'), 'good');
    adminLoad('ov', true);
  });
}

/* ─── accounts ── */
function adminAccountsHtml() {
  var wait = needOv();
  if (wait) return wait;
  var ws = (Admin.ov.workspaces || []).slice().sort(function (a, b) {
    if (a.id === 'main') return -1; if (b.id === 'main') return 1;
    if ((a.status === 'archived') !== (b.status === 'archived')) return a.status === 'archived' ? 1 : -1;
    return String(b.lastActiveAt || '').localeCompare(String(a.lastActiveAt || ''));
  });
  var users = Admin.ov.users || [];
  return '<div class="pane-head"><div class="tiny muted">Every account keeps its leads in its own spreadsheet, so one can never see another’s.</div>' +
    '<button class="btn btn-primary btn-sm" data-act="admin-new-ws">' + icon('plus', 12) + ' New account</button></div>' +
    '<div class="ws-grid">' + ws.map(function (w) {
      var people = users.filter(function (u) { return u.status !== 'removed' && u.role !== 'owner' && u.role !== 'admin' && (u.access || {})[w.id]; });
      var who7 = Object.keys(w.who7d || {}).sort(function (a, b) { return w.who7d[b] - w.who7d[a]; }).slice(0, 4);
      return '<div class="card ws-card' + (w.status === 'archived' ? ' archived' : '') + '">' +
        '<div class="card-head"><div class="card-title"><span class="avatar ws sm">' + esc(initialsOf(w.name)) + '</span>' + esc(w.name) +
        (w.id === 'main' ? ' <span class="chip chip-good">main</span>' : '') + (w.status !== 'active' ? ' ' + '<span class="chip chip-warm">' + esc(w.status) + '</span>' : '') + '</div></div>' +
        '<div class="card-body">' +
        '<div class="ws-stats"><div><b>' + (w.leads || 0) + '</b><span>leads</span></div><div><b>' + (w.open || 0) + '</b><span>open</span></div>' +
        '<div><b>' + (w.new7d || 0) + '</b><span>new 7d</span></div><div><b>' + (w.changes7d || 0) + '</b><span>changes 7d</span></div></div>' +
        '<div class="tiny muted" style="margin-top:8px">' + (w.lastChange ? 'Last: ' + esc(w.lastChange.leadName || w.lastChange.type || '') + ' by ' + esc(String(w.lastChange.actor || '').replace(/^tg:/, '').split('@')[0]) + ' · ' + esc(Fmt.ago(w.lastChange.at)) : 'Nothing changed yet') + '</div>' +
        (who7.length ? '<div class="row" style="gap:4px;margin-top:6px">' + who7.map(function (e) { return '<span class="chip chip-ghost" title="' + esc(e) + '">' + esc(e.replace(/^tg:/, '').split('@')[0]) + ' · ' + w.who7d[e] + '</span>'; }).join('') + '</div>' : '') +
        '<div class="ws-people">' + (people.length ? people.map(function (u) {
          var e = u.access[w.id];
          return '<span class="acc-chip lv-' + esc(e.level) + '">' + esc(u.name || u.email.split('@')[0]) + ' · ' + esc(LEVEL_LABEL[e.level] || e.level) + (e.leads === 'own' ? ' · own' : '') + '</span>';
        }).join('') : '<span class="tiny muted">Only admins so far</span>') + '</div>' +
        (w.aiDailyLimit ? '<div class="tiny muted">AI limit: ' + w.aiDailyLimit + ' a day</div>' : '') +
        (w.bookingSlug ? '<div class="tiny muted">Booking link: ?book=' + esc(w.bookingSlug) + '</div>' : '') +
        '<div class="row" style="margin-top:10px;gap:6px">' +
        (w.status !== 'archived' ? '<button class="btn btn-sm btn-primary" data-act="ws-pick" data-id="' + esc(w.id) + '">Open</button>' : '') +
        '<button class="btn btn-sm" data-act="admin-ws-access" data-id="' + esc(w.id) + '">' + icon('shield', 12) + ' Who can open it</button>' +
        '<button class="btn btn-sm" data-act="admin-ws-activity" data-id="' + esc(w.id) + '">Activity</button>' +
        '<button class="btn btn-sm" data-act="admin-ws-edit" data-id="' + esc(w.id) + '">' + icon('edit', 12) + '</button>' +
        (w.sheetUrl ? '<a class="btn btn-sm" href="' + esc(w.sheetUrl) + '" target="_blank" rel="noopener" title="Open the spreadsheet">Sheet</a>' : '') +
        (w.id !== 'main' ? '<button class="btn btn-sm btn-ghost btn-icon danger-hover" data-act="v8-delete-ws" data-id="' + esc(w.id) + '" title="Delete this account for good">' + icon('trash', 13) + '</button>' : '') +
        '</div></div></div>';
    }).join('') + '</div>';
}

function openNewWorkspace() {
  var users = ((Admin.ov && Admin.ov.users) || []).filter(function (u) { return u.status !== 'removed'; });
  openModal({
    title: 'New account',
    body:
      '<div class="field"><label>Name</label><input class="input" id="nwName" placeholder="Rahim — Dhaka dentals"/></div>' +
      '<div class="field"><label>Start from</label><div class="radio-list">' +
      '<label class="radio-row"><input type="radio" name="nwMode" value="settings" checked/><span><b>Same dashboard as</b> <select class="select select-inline" id="nwFrom">' + wsOptions(Cfg.ws || 'main') + '</select><br/><span class="tiny muted">Stages, labels, templates and AI instructions — no leads.</span></span></label>' +
      '<label class="radio-row"><input type="radio" name="nwMode" value="copy"/><span><b>Exact copy, every lead included</b><br/><span class="tiny" style="color:var(--warm)">Duplicates all of that account’s leads into the new one. Usually you want the first option.</span></span></label>' +
      '<label class="radio-row"><input type="radio" name="nwMode" value="blank"/><span><b>Blank</b></span></label></div></div>' +
      '<div class="field"><label>Who can open it</label><div class="check-list">' + users.filter(function (u) { return u.role !== 'owner' && u.role !== 'admin'; }).map(function (u) {
        return '<div class="check-row nw-row"><span class="grow">' + esc(u.name || u.email) + ' <span class="tiny muted">' + esc(u.email) + '</span></span>' +
          '<select class="select select-inline nwLevel" data-email="' + esc(u.email) + '"><option value="">No access</option><option value="manage">Manager</option><option value="edit">Editor</option><option value="view">Viewer</option></select></div>';
      }).join('') + '</div><div class="tiny muted">Admins can always open every account.</div></div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="admin-new-ws-save">Create</button>'
  });
}

function createWorkspaceFromForm() {
  var name = String(($('#nwName') || {}).value || '').trim();
  if (!name) { toast('Give it a name', 'warn'); return; }
  var members = $$('.nwLevel').filter(function (c) { return c.value; }).map(function (c) { return { email: c.dataset.email, level: c.value }; });
  var btn = $('[data-act="admin-new-ws-save"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating the spreadsheet…'; }
  api('adminCreateWorkspace', {
    name: name, mode: ($('input[name="nwMode"]:checked') || {}).value || 'settings', source: ($('#nwFrom') || {}).value || 'main',
    owner: (members.filter(function (m) { return m.level === 'manage'; })[0] || {}).email || (State.me && State.me.email) || '', members: members
  }, { timeout: 150000 }).then(function (r) {
    if (!r || !r.success) { if (btn) { btn.disabled = false; btn.textContent = 'Create'; } toast(niceErr(r), 'err'); return; }
    closeModal();
    toast(name + ' created', 'good');
    refreshMe();
    adminLoad('ov', true);
  });
}

function openEditWorkspace(id) {
  var w = ((Admin.ov && Admin.ov.workspaces) || []).filter(function (x) { return x.id === id; })[0];
  if (!w) return;
  openModal({
    title: w.name,
    body:
      '<div class="field"><label>Name</label><input class="input" id="ewName" value="' + esc(w.name) + '"/></div>' +
      '<div class="field-row"><div class="field"><label>Owner (email)</label><input class="input" id="ewOwner" value="' + esc(w.owner || '') + '"/></div>' +
      '<div class="field"><label>AI requests a day (0 = no limit)</label><input class="input" type="number" min="0" id="ewLimit" value="' + esc(w.aiDailyLimit || 0) + '"/></div></div>' +
      '<div class="field"><label>Note</label><input class="input" id="ewNote" value="' + esc(w.note || '') + '"/></div>' +
      (w.id !== 'main' ? '<div class="field"><label>Status</label><select class="select" id="ewStatus">' +
        [['active', 'Active'], ['paused', 'Paused — people can look, the AI and the booking page stop'], ['archived', 'Archived — nobody but admins can open it']].map(function (s) {
          return '<option value="' + s[0] + '"' + (w.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
        }).join('') + '</select></div>' : '') +
      '<div class="tiny muted">Archiving never deletes the spreadsheet; it can be brought back any time.</div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="admin-ws-save" data-id="' + esc(w.id) + '">Save</button>'
  });
}

function saveWorkspaceFromForm(id) {
  var patch = { id: id, name: ($('#ewName') || {}).value, owner: ($('#ewOwner') || {}).value, aiDailyLimit: Number(($('#ewLimit') || {}).value) || 0, note: ($('#ewNote') || {}).value || '' };
  if ($('#ewStatus')) patch.status = $('#ewStatus').value;
  api('adminSaveWorkspace', { workspace: patch }).then(function (r) {
    if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
    closeModal();
    toast('Saved', 'good');
    refreshMe();
    adminLoad('ov', true);
  });
}

function openWorkspaceActivity(id) {
  openModal({ title: 'Activity — ' + wsLabel(id), wide: true, body: loadingBox('Reading the journal…'), foot: '<button class="btn" data-act="close-modal">Close</button>' });
  api('adminWorkspaceActivity', { wsId: id, limit: 150 }, { timeout: 60000 }).then(function (r) {
    if (!$('#modal').classList.contains('show')) return;
    if (!r || !r.success) { $('#modalBody').innerHTML = '<div class="small" style="color:var(--danger)">' + esc(niceErr(r)) + '</div>'; return; }
    var rows = r.activities || [];
    var who = (r.facets && r.facets.actor) || {};
    $('#modalBody').innerHTML =
      '<div class="row" style="gap:5px">' + Object.keys(who).sort(function (a, b) { return who[b] - who[a]; }).slice(0, 8).map(function (a) {
        return '<span class="count-pill">' + esc(String(a).replace(/^tg:/, '').split('@')[0]) + ' <b>' + who[a] + '</b></span>';
      }).join('') + '</div>' +
      (rows.length ? '<div class="hist-list">' + rows.map(function (a) {
        var head = historyHeadline(a).replace(/ data-act="open-lead"/g, '');
        var diff = a.field && (a.oldValue || a.newValue) && a.type !== 'created'
          ? '<div class="hist-diff">' + (a.oldValue ? '<span class="hist-old">' + esc(truncateText(Fmt.value(a.oldValue, a.field), 60)) + '</span>' : '') +
            '<span class="tiny muted">→</span>' + (a.newValue ? '<span class="hist-new">' + esc(truncateText(Fmt.value(a.newValue, a.field), 60)) + '</span>' : '<span class="tiny muted">cleared</span>') + '</div>' : '';
        return '<div class="audit-row"><span class="hist-time">' + esc(Fmt.ago(a.at)) + '</span><span class="grow">' + head + ' ' + actorChipAll(a.actor) + diff + '</span></div>';
      }).join('') + '</div>' : emptyBox('Nothing yet', 'Changes will show here as people work.'));
  });
}

/** Like actorChip, but always names the person — even when it is you. */
function actorChipAll(actor) {
  var a = String(actor || '');
  if (!a || a === 'app' || a === 'system') return '';
  var me = (State.me && State.me.email) || '';
  if (a === me) return ' <span class="chip chip-ghost">you</span>';
  return actorChip(a);
}

/* ─── activity ── */
function adminActivityHtml() {
  if (!Admin.audit) { adminLoad('audit'); return loadingBox(); }
  var users = (Admin.ov && Admin.ov.users) || [];
  var q = Admin.auditQ;
  return '<div class="pane-head"><div class="row">' +
    '<input class="input" id="auditQ" placeholder="Search" value="' + esc(q.q || '') + '" style="max-width:200px"/>' +
    '<select class="select" id="auditEmail" style="width:auto"><option value="">Everyone</option>' + users.map(function (u) {
      return '<option value="' + esc(u.email) + '"' + (q.email === u.email ? ' selected' : '') + '>' + esc(u.name || u.email) + '</option>';
    }).join('') + '</select>' +
    '<select class="select" id="auditWs" style="width:auto"><option value="">All accounts</option>' + wsOptions(q.ws).replace('<option value="' + esc(q.ws) + '" selected', '<option value="' + esc(q.ws) + '" selected') + '</select>' +
    '</div><button class="btn btn-sm" data-act="admin-audit-reload">' + icon('sync', 12) + ' Refresh</button></div>' +
    '<div class="card"><div class="card-body list-body">' +
    (Admin.audit.length ? Admin.audit.map(auditRowHtml).join('') : emptyBox('No activity matches', '')) +
    '</div></div>' +
    '<div class="tiny muted" style="margin-top:10px">Sign-ins, access changes and admin actions are recorded here. Lead-level changes inside an account are under Accounts → Activity.</div>';
}

/* ─── AI providers ── */
function adminAiHtml() {
  if (!Admin.ai) {
    adminLoad('ai');
    return Admin.aiError ? '<div class="small" style="color:var(--danger)">' + esc(Admin.aiError) + '</div>' : loadingBox();
  }
  var st = Admin.aiStatus || {};
  var presets = Admin.presets || {};
  var usage = Admin.usage || [];
  return '<div class="pane-head"><div class="small">' +
    (st.configured ? '<span class="chip chip-good">' + esc(aiName()) + ' is on</span> answering through ' + esc((st.providers || []).join(' → ')) : '<span class="chip chip-danger">No working provider</span> add one below') +
    '</div><button class="btn btn-primary btn-sm" data-act="ai-add-provider">' + icon('plus', 12) + ' Add a provider</button></div>' +
    '<div class="tiny muted" style="margin-bottom:12px">' + esc(aiName()) + ' tries these from the top. If a key runs out of credit, hits a rate limit or a provider is down, it moves to the next key, then the next provider — everyone in every account uses this list.</div>' +
    (Admin.ai.length ? Admin.ai.map(function (p, i) { return providerCardHtml(p, i, Admin.ai.length, presets); }).join('') : emptyBox('No providers yet', 'Add OpenRouter, Gemini, Groq or any OpenAI-compatible service.')) +
    '<div class="card" style="margin-top:14px"><div class="card-head"><div class="card-title">Usage, last 14 days</div></div><div class="card-body">' +
    (usage.length ? '<div class="table-wrap"><table class="mini-table"><thead><tr><th>Day</th><th>Requests</th><th>Failed</th><th>By account</th><th>By provider</th></tr></thead><tbody>' +
      usage.map(function (d) {
        var u = d.usage || {}, c = 0, e = 0, byWs = [], byP = [];
        Object.keys(u).forEach(function (k) {
          if (k === '_p') { Object.keys(u._p).forEach(function (pid) { byP.push(pid + ' ' + u._p[pid].c); }); return; }
          if (k.charAt(0) === '_') return;
          c += u[k].c || 0; e += u[k].e || 0; byWs.push(wsLabel(k) + ' ' + u[k].c);
        });
        return '<tr><td>' + esc(Fmt.shortDate(d.date)) + '</td><td class="num">' + c + '</td><td class="num">' + (e || '') + '</td><td class="tiny">' + esc(byWs.join(', ')) + '</td><td class="tiny">' + esc(byP.join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="small muted">No AI requests yet.</div>') +
    '</div></div>';
}

function providerCardHtml(p, i, n, presets) {
  var pre = presets[p.preset] || {};
  var models = Admin.models[p.id] || [];
  var listId = 'models_' + p.id;
  var test = Admin.tests[p.id];
  return '<div class="card prov-card' + (p.enabled ? '' : ' off') + '" data-pid="' + esc(p.id) + '">' +
    '<div class="card-head"><div class="card-title"><span class="prov-order">' + (i + 1) + '</span>' + esc(p.name) +
    ' <span class="chip chip-ghost">' + esc(pre.name || p.preset) + '</span>' + (p.keyCount ? '' : ' <span class="chip chip-danger">no key</span>') + '</div>' +
    '<div class="row" style="gap:4px">' +
    '<button class="btn btn-sm btn-icon" data-act="ai-move" data-id="' + esc(p.id) + '" data-dir="-1" title="Try earlier"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
    '<button class="btn btn-sm btn-icon" data-act="ai-move" data-id="' + esc(p.id) + '" data-dir="1" title="Try later"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>' +
    '<button class="btn btn-sm btn-icon" data-act="ai-delete" data-id="' + esc(p.id) + '" title="Remove">' + icon('trash', 12) + '</button></div></div>' +
    '<div class="card-body">' +
    toggleHtml('pv_on_' + p.id, p.enabled, 'Use this provider', '') +
    (p.preset === 'custom' || p.preset === 'openai' ? '<div class="field" style="margin-top:8px"><label>Base URL</label><input class="input pv-base" value="' + esc(p.base) + '" placeholder="https://…/v1"/></div>' : '') +
    '<div class="field-row-3" style="margin-top:8px">' +
    ['fast', 'power', 'vision'].map(function (t) {
      return '<div class="field"><label>' + (t === 'fast' ? 'Fast model (chat)' : t === 'power' ? 'Power model (audits, proposals)' : 'Vision model (images)') + '</label>' +
        '<input class="input pv-' + t + '" list="' + listId + '" value="' + esc(p[t] || '') + '" placeholder="' + esc(pre[t] || 'model id') + '"/></div>';
    }).join('') + '</div>' +
    (models.length ? '<datalist id="' + listId + '">' + models.slice(0, 400).map(function (m) { return '<option value="' + esc(m.id) + '">' + (m.free ? 'free' : '') + '</option>'; }).join('') + '</datalist>' : '') +
    '<div class="field" style="margin-top:8px"><label>Keys (' + p.keyCount + ')</label>' +
    '<div class="key-list">' + (p.keys || []).map(function (k, ki) {
      return '<span class="key-chip"><code>' + esc(k) + '</code><button class="copy-btn" data-act="ai-key-remove" data-id="' + esc(p.id) + '" data-index="' + ki + '" title="Remove this key">' + icon('x', 10) + '</button></span>';
    }).join('') + '</div>' +
    '<textarea class="textarea pv-add" rows="2" placeholder="Paste one or more new keys, one per line"></textarea></div>' +
    (test ? '<div class="test-box">' + test + '</div>' : '') +
    '<div class="row" style="margin-top:10px">' +
    '<button class="btn btn-sm btn-primary" data-act="ai-save" data-id="' + esc(p.id) + '">Save</button>' +
    '<button class="btn btn-sm" data-act="ai-test" data-id="' + esc(p.id) + '">Test every key</button>' +
    '<button class="btn btn-sm" data-act="ai-models" data-id="' + esc(p.id) + '">Fetch models</button>' +
    (pre.keyUrl ? '<a class="btn btn-sm btn-ghost" href="' + esc(pre.keyUrl) + '" target="_blank" rel="noopener">Get a key ↗</a>' : '') +
    '</div>' + (pre.note ? '<div class="tiny muted" style="margin-top:6px">' + esc(pre.note) + '</div>' : '') +
    '</div></div>';
}

function providerFormValues(id) {
  var card = $('.prov-card[data-pid="' + id + '"]');
  if (!card) return null;
  var add = String(($('.pv-add', card) || {}).value || '').split(/[\s,]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  var out = {
    id: id,
    enabled: !!($('#pv_on_' + id) || {}).checked,
    fast: ($('.pv-fast', card) || {}).value || '',
    power: ($('.pv-power', card) || {}).value || '',
    vision: ($('.pv-vision', card) || {}).value || '',
    addKeys: add
  };
  var base = $('.pv-base', card);
  if (base) out.base = base.value;
  return out;
}

function saveProvider(input, msg) {
  return api('adminSaveAiProvider', { provider: input }).then(function (r) {
    if (!r || !r.success) { toast(niceErr(r), 'err', 6000); return false; }
    Admin.ai = r.providers;
    api('aiStatus', {}).then(function (s) { if (s && s.success) { Admin.aiStatus = s; renderAdmin(true); } });
    renderAdmin(true);
    if (msg) toast(msg, 'good');
    return true;
  });
}

function openAddProvider() {
  var presets = Admin.presets || {};
  openModal({
    title: 'Add an AI provider',
    body:
      '<div class="field"><label>Provider</label><select class="select" id="apPreset">' + Object.keys(presets).map(function (k) {
        return '<option value="' + esc(k) + '">' + esc(presets[k].name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="tiny muted" id="apNote"></div>' +
      '<div class="field" id="apBaseWrap" hidden><label>Base URL</label><input class="input" id="apBase" placeholder="https://api.example.com/v1"/></div>' +
      '<div class="field"><label>API key(s)</label><textarea class="textarea" id="apKeys" rows="3" placeholder="One per line. Several free keys = more requests before a limit."></textarea></div>' +
      '<div class="tiny muted">Keys are stored in the backend’s Script Properties and never sent back to any browser in full.</div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="ai-add-save">Add</button>'
  });
  var sel = $('#apPreset');
  var upd = function () {
    var p = presets[sel.value] || {};
    $('#apNote').innerHTML = esc(p.note || '') + (p.keyUrl ? ' <a href="' + esc(p.keyUrl) + '" target="_blank" rel="noopener">Get a key ↗</a>' : '');
    $('#apBaseWrap').hidden = !(sel.value === 'custom');
  };
  sel.addEventListener('change', upd);
  upd();
}

/* ─── Telegram ── */
function adminTelegramHtml() {
  if (!Admin.tg) { adminLoad('tg'); return loadingBox('Asking Telegram…'); }
  if (!Admin.config) adminLoad('config');
  var t = Admin.tg;
  var users = ((Admin.ov && Admin.ov.users) || []);
  var linked = users.filter(function (u) { return u.telegram; });
  var owner = State.me && State.me.role === 'owner';
  var execUrl = Cfg.url || '';
  var webhookOk = t.webhook && execUrl && t.webhook.replace(/\?.*$/, '') === execUrl.replace(/\?.*$/, '');
  return '<div class="chart-grid">' +
    chartCard('The bot',
      (t.error ? '<div class="small" style="color:var(--danger)">' + esc(t.error) + '</div>' : '') +
      '<div class="kv"><dt>Bot</dt><dd>' + (t.bot ? '<a href="https://t.me/' + esc(t.bot) + '" target="_blank" rel="noopener">@' + esc(t.bot) + '</a>' : '<span class="muted">not set up</span>') + '</dd>' +
      '<dt>Commands</dt><dd>' + (t.webhook ? (webhookOk ? '<span class="chip chip-good">working</span>' : '<span class="chip chip-warm">pointed elsewhere</span>') : '<span class="chip chip-danger">not connected</span>') + '</dd>' +
      (t.pending ? '<dt>Waiting</dt><dd>' + t.pending + ' update(s)</dd>' : '') +
      (t.lastError ? '<dt>Last error</dt><dd class="small">' + esc(t.lastError) + ' <span class="muted">' + esc(Fmt.ago(t.lastErrorAt)) + '</span></dd>' : '') + '</div>' +
      '<div class="row" style="margin-top:12px"><button class="btn btn-sm btn-primary" data-act="tg-webhook">' + (t.webhook ? 'Reconnect' : 'Connect') + ' the bot to this app</button>' +
      '<button class="btn btn-sm" data-act="tg-test">Send me a test</button></div>' +
      '<div class="tiny muted" style="margin-top:8px">Connecting lets people use commands — /today, /find, /add, /note, /stats — and press the buttons under each message.</div>') +
    chartCard('Bot token',
      (owner ? '<div class="field"><label>Token from @BotFather</label><input class="input" id="cfgTgToken" value="' + esc((Admin.config && Admin.config.TG_TOKEN) || '') + '" placeholder="123456:ABC…"/></div>' +
        '<button class="btn btn-sm" data-act="cfg-save-tg" style="margin-top:8px">Save token</button>' +
        '<div class="tiny muted" style="margin-top:8px">Only change this to move to a new bot. After saving, press Connect.</div>'
        : '<div class="small muted">Only the owner can change the bot token.</div>')) +
    chartCard('Who gets messages',
      '<div class="small" style="margin-bottom:8px">Each person connects their own Telegram from <b>Settings → Telegram</b>. They get their own account’s brief, reminders and bookings; admins also get access requests and the 9 pm accounts report.</div>' +
      (linked.length ? linked.map(function (u) {
        return '<div class="list-row compact"><span class="avatar sm">' + esc(initialsOf(u.name || u.email)) + '</span><span class="grow small">' + esc(u.name || u.email) + ' <span class="tiny muted">' + esc(u.tgName || '') + '</span></span>' + roleChip(u.role) + '</div>';
      }).join('') : '<div class="small muted">Nobody yet.</div>') +
      '<button class="btn btn-sm" data-act="admin-run" data-value="accounts" style="margin-top:10px">Send the accounts report now</button>') +
    '</div>';
}

/* ─── platform ── */
function adminPlatformHtml() {
  if (!Admin.config) {
    adminLoad('config');
    return Admin.configError ? '<div class="small" style="color:var(--danger)">' + esc(Admin.configError) + '</div>' : loadingBox();
  }
  var c = Admin.config;
  var owner = State.me && State.me.role === 'owner';
  var jobs = [['digest', 'Morning digest'], ['brief', 'AI morning brief'], ['reminders', 'Reminders'], ['weekly', 'Weekly review'], ['monthly', 'Monthly report'], ['accounts', 'Accounts report'], ['backup', 'Backup every account'], ['calendarRepair', 'Free up booking days']];
  return '<div class="chart-grid">' +
    chartCard('Sharing and sign-in',
      '<div class="field"><label>Dashboard address (used in invite and booking links)</label><input class="input" id="cfgAppUrl" value="' + esc(c.APP_URL || '') + '" placeholder="' + esc(c.APP_URL_SEEN || appBaseUrl()) + '"/>' +
      (c.APP_URL_SEEN && !c.APP_URL ? '<div class="tiny muted">Seen in use: ' + esc(c.APP_URL_SEEN) + '</div>' : '') + '</div>' +
      '<div class="field" style="margin-top:10px"><label>Brand name</label><input class="input" id="cfgBrand" value="' + esc(c.BRAND_NAME || '') + '" placeholder="Everstone Digital"/></div>' +
      '<div class="field" style="margin-top:10px"><label>AI assistant name</label><input class="input" id="cfgAiName" value="' + esc(c.AI_NAME || '') + '" placeholder="Everstone Digital AI"/>' +
      '<div class="tiny muted">Shown in the menu, the chat, Telegram and how the AI introduces itself.</div></div>' +
      '<div class="field" style="margin-top:10px"><label>New people</label><select class="select" id="cfgPolicy">' +
      '<option value="request"' + (c.SIGNUP_POLICY !== 'invite' ? ' selected' : '') + '>Can ask for access — I approve each one</option>' +
      '<option value="invite"' + (c.SIGNUP_POLICY === 'invite' ? ' selected' : '') + '>Invite only — nobody can ask</option></select></div>' +
      '<div class="field" style="margin-top:10px"><label>Google sign-in client ID</label><input class="input" id="cfgGoogle" value="' + esc(c.GOOGLE_CLIENT_ID || '') + '" placeholder="…apps.googleusercontent.com"/>' +
      '<div class="tiny muted">Add ' + esc(location.origin) + ' as an authorised JavaScript origin on that client.</div></div>' +
      (owner ? '<div class="field" style="margin-top:10px"><label>Google client secret <span class="tiny muted">(for “Connect Google Calendar”)</span></label><input class="input" id="cfgGoogleSecret" value="' + esc(c.GOOGLE_CLIENT_SECRET || '') + '" placeholder="GOCSPX-…" autocomplete="off"/>' +
        '<div class="tiny muted">Same OAuth client as above → “Client secret”. Lets each account connect its own Google Calendar.</div></div>' : '') +
      '<div class="field" style="margin-top:10px"><label>PageSpeed API key (optional, makes audits faster)</label><input class="input" id="cfgPsi" value="' + esc(c.PSI_KEY || '') + '"/></div>' +
      (owner ? '<div class="field" style="margin-top:10px"><label>Other admins (emails, comma separated)</label><input class="input" id="cfgAdmins" value="' + esc(c.ADMIN_EMAILS || '') + '"/></div>' +
        '<div class="field" style="margin-top:10px"><label>Owner password (for “Other ways to sign in”)</label><input class="input" id="cfgPw" value="' + esc(c.APP_PASSWORD || '') + '"/></div>' : '') +
      '<button class="btn btn-primary btn-sm" data-act="cfg-save" style="margin-top:12px">Save</button>') +
    chartCard('Google sign-in check', googleCheckHtml(c)) +
    chartCard('Run now',
      '<div class="tiny muted" style="margin-bottom:8px">These also run on their own every day.</div>' +
      '<div class="row">' + jobs.map(function (j) { return '<button class="btn btn-sm" data-act="admin-run" data-value="' + j[0] + '">' + esc(j[1]) + '</button>'; }).join('') + '</div>' +
      '<hr class="divider"/>' +
      '<div class="small"><b>Schedules</b> <span class="muted">(' + (c.triggers || []).length + ')</span></div>' +
      '<div class="tiny muted" style="margin:4px 0 8px">' + esc((c.triggers || []).join(', ') || 'none — press Reinstall') + '</div>' +
      '<button class="btn btn-sm" data-act="admin-triggers">Reinstall schedules</button>') +
    chartCard('Where things live',
      '<div class="kv"><dt>Version</dt><dd>' + esc(c.version || '') + '</dd>' +
      '<dt>Owner</dt><dd>' + esc((c.ownerEmails || []).join(', ')) + '</dd>' +
      '<dt>Control Center</dt><dd><a href="' + esc(c.controlUrl) + '" target="_blank" rel="noopener">Open sheet ↗</a></dd>' +
      '<dt>Main account</dt><dd><a href="' + esc(c.mainSheetUrl) + '" target="_blank" rel="noopener">Open sheet ↗</a></dd>' +
      '<dt>Calendar repaired</dt><dd>' + esc(c.calendarRepaired ? Fmt.ago(c.calendarRepaired) : 'not yet') + '</dd></div>' +
      '<div class="tiny muted" style="margin-top:8px">The Control Center lists people, accounts, invites and the audit log. Every account’s leads stay in its own spreadsheet.</div>') +
    chartCard('Who is signed in',
      Admin.sessions ? (Admin.sessions.length ? Admin.sessions.slice(0, 40).map(function (s) {
        return '<div class="audit-row"><span class="grow small">' + esc(s.email) + ' <span class="tiny muted">' + esc(s.via || '') + '</span></span><span class="tiny muted">since ' + esc(Fmt.ago(s.created)) + '</span></div>';
      }).join('') : '<div class="small muted">No open sessions.</div>') : '<button class="btn btn-sm" data-act="admin-sessions">Show sessions</button>') +
    '</div>';
}

/* ─── API keys (all accounts) ── */
function adminApiHtml() {
  if (!Admin.keys) { adminLoad('keys'); return loadingBox(); }
  return '<div class="pane-head"><div class="tiny muted">Keys are made per account in Settings → API &amp; integrations. Here you see and revoke all of them.</div>' +
    '<button class="btn btn-sm" data-act="settings-go" data-value="api">Make a key for this account</button></div>' +
    '<div class="card"><div class="card-body list-body">' +
    (Admin.keys.length ? Admin.keys.map(function (k) { return apiKeyRowHtml(k, true); }).join('') : emptyBox('No API keys yet', '')) +
    '</div></div>';
}

function apiKeyRowHtml(k, showWs) {
  return '<div class="list-row' + (k.status !== 'active' ? ' dim' : '') + '">' +
    '<span class="avatar sm">' + icon('link', 12) + '</span>' +
    '<div class="grow"><div class="lr-title">' + esc(k.name) + ' <span class="chip ' + (k.scope === 'write' ? 'chip-warm' : 'chip-ghost') + '">' + (k.scope === 'write' ? 'read + write' : 'read only') + '</span>' +
    (k.status !== 'active' ? ' <span class="chip chip-danger">revoked</span>' : '') + '</div>' +
    '<div class="tiny muted"><code>' + esc(k.prefix) + '…</code>' + (showWs ? ' · ' + esc(wsLabel(k.ws)) : '') + ' · made ' + esc(Fmt.ago(k.createdAt)) +
    (k.lastUsedAt ? ' · used ' + esc(Fmt.ago(k.lastUsedAt)) : ' · never used') + '</div></div>' +
    (k.status === 'active' ? '<div class="lr-actions"><button class="btn btn-sm btn-danger" data-act="api-revoke" data-id="' + esc(k.id) + '">Revoke</button></div>' : '') +
    '</div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS PANES THAT TALK TO THE PLATFORM
   ═══════════════════════════════════════════════════════════════════════════ */
var Settings7 = { booking: null, bookingErr: '', keys: null, aiStatus: null, tgPoll: null, tgLink: null };

function settingsTabOpened(tab) {
  var saveBtn = $('#btnSaveSettings');
  if (saveBtn) saveBtn.hidden = ['telegram', 'booking', 'api', 'data'].indexOf(tab) >= 0;
  if (tab === 'telegram') { renderTgSettings(); refreshMe().then(function () { if (settingsTab() === 'telegram') renderTgSettings(); }); }
  if (tab === 'booking') renderBookingSettings();
  if (tab === 'api') renderApiSettings();
  if (tab === 'ai') renderAiStatusBox();
  if (tab === 'data') renderAccountBox();
}

function renderAiStatusBox() {
  var box = $('#aiStatusBox');
  if (!box) return;
  var draw = function (s) {
    if (!s) { box.textContent = 'Could not check.'; return; }
    box.innerHTML = s.configured
      ? '<span class="chip chip-good">Working</span> ' + esc((s.providers || []).join(' → ')) +
        '<div class="tiny muted" style="margin-top:6px">Fast: ' + (s.tiers.fast ? 'yes' : 'no') + ' · Power: ' + (s.tiers.power ? 'yes' : 'no') + ' · Images: ' + (s.tiers.vision ? 'yes' : 'no') + '</div>'
      : '<span class="chip chip-danger">Not set up</span> <span class="small">No AI provider has a key yet.</span>';
  };
  if (Settings7.aiStatus) draw(Settings7.aiStatus);
  api('aiStatus', {}).then(function (r) { Settings7.aiStatus = r && r.success ? r : null; draw(Settings7.aiStatus); });
}

function renderAccountBox() {
  var box = $('#accountBox');
  if (!box) return;
  var me = State.me || {};
  box.innerHTML =
    '<div class="kv"><dt>Name</dt><dd><input class="input" id="meName" value="' + esc(me.name || '') + '" style="max-width:240px"/></dd>' +
    '<dt>Email</dt><dd>' + esc(me.email || Cfg.who || '') + '</dd>' +
    '<dt>Role</dt><dd>' + roleChip(me.role) + '</dd>' +
    '<dt>This account</dt><dd>' + esc(currentWsName()) + '</dd></div>' +
    '<div class="row" style="margin-top:12px"><button class="btn btn-sm" data-act="me-save-name">Save name</button>' +
    '<button class="btn btn-sm" data-act="sign-out-all">Sign out on every device</button>' +
    '<button class="btn btn-sm btn-danger" data-act="logout">Sign out</button></div>';
}

/* ─── Telegram (per person) ── */
var NOTIFY_KINDS = [
  ['digest', 'Morning summary', 'What is due today, every morning'],
  ['brief', 'AI morning brief', 'Who to contact first, with messages ready to send'],
  ['reminders', 'Reminders', 'Follow-ups that come due, and meetings (times are set under “Meeting reminders” below)'],
  ['bookings', 'New bookings', 'Someone booked a call on your booking page'],
  ['weekly', 'Weekly review', 'Monday morning: how last week went'],
  ['monthly', 'Monthly report', 'On the 1st: last month’s leads, follow-ups, meetings and wins'],
  ['admin', 'Admin', 'Access requests, first sign-ins, the 9 pm accounts report'],
  ['security', 'Security', 'Wrong passwords and other warnings']
];

function renderTgSettings() {
  var host = $('#tgSettings');
  if (!host) return;
  var me = State.me || {};
  var tg = me.telegram || {};
  var n = me.notify || {};
  var admin = isAdminUser();
  var wsList = myWorkspaces();
  var body;
  if (tg.linked) {
    body =
      '<div class="tg-status ok">' + icon('tg', 22) + '<div class="grow"><b>Connected' + (tg.name ? ' as ' + esc(tg.name) : '') + '</b>' +
      '<div class="tiny muted">Messages for your account come to this chat. You can also work from there: /today, /find, /add, /note, /meetings, /stats.</div></div></div>' +
      '<div class="row" style="margin:10px 0 16px"><button class="btn btn-sm" data-act="tg-test">Send me a test</button>' +
      '<button class="btn btn-sm" data-act="tg-brief">Send today’s brief now</button>' +
      (tg.bot ? '<a class="btn btn-sm" href="https://t.me/' + esc(tg.bot) + '" target="_blank" rel="noopener">Open @' + esc(tg.bot) + ' ↗</a>' : '') +
      '<button class="btn btn-sm btn-ghost" data-act="tg-unlink">Disconnect</button></div>' +
      '<div class="section-title">What to send me</div>' +
      toggleHtml('nt_muted', !!n.muted, 'Pause everything', 'Nothing is sent until you switch this off.') +
      NOTIFY_KINDS.filter(function (k) { return admin || (k[0] !== 'admin' && k[0] !== 'security'); }).map(function (k) {
        return toggleHtml('nt_' + k[0], n[k[0]] !== false, k[1], k[2]);
      }).join('') +
      (wsList.length > 1 ? '<div class="field" style="margin-top:12px"><label>Commands work in</label><select class="select" id="ntWs" style="max-width:280px">' +
        wsList.map(function (w) { return '<option value="' + esc(w.id) + '"' + ((n.tgWs || me.defaultWs) === w.id ? ' selected' : '') + '>' + esc(w.name) + '</option>'; }).join('') +
        '</select><div class="tiny muted">You can also switch from the bot with /accounts.</div></div>' : '') +
      '<button class="btn btn-primary btn-sm" data-act="tg-save-notify" style="margin-top:12px">Save</button>';
  } else {
    var link = Settings7.tgLink;
    body =
      '<div class="tg-status">' + icon('tg', 22) + '<div class="grow"><b>Get your updates on Telegram</b>' +
      '<div class="tiny muted">Your morning brief, follow-up reminders, meeting alerts and new bookings — for your account only. You can add leads and notes from the chat too.</div></div></div>' +
      (link
        ? '<ol class="steps-list"><li>Open the bot: <a class="btn btn-sm btn-primary" href="' + esc(link.link) + '" target="_blank" rel="noopener">' + icon('tg', 12) + ' Open @' + esc(link.bot) + '</a></li>' +
          '<li>Press <b>Start</b> in Telegram.</li><li>Come back here — this page notices by itself.</li></ol>' +
          '<div class="tiny muted">The connect link works once, for 15 minutes.' + (link.webhookReady ? '' : ' <b>The admin still needs to press “Connect the bot” in Admin → Telegram</b> before this works.') + '</div>' +
          '<div class="row" style="margin-top:8px"><button class="btn btn-sm" data-act="copy" data-value="' + esc(link.link) + '">Copy link</button><button class="btn btn-sm" data-act="tg-check">I pressed Start</button></div>'
        : '<button class="btn btn-primary" data-act="tg-connect" style="margin-top:10px">' + icon('tg', 14) + ' Connect Telegram</button>');
  }
  host.innerHTML = '<div class="card-head"><div class="card-title">Telegram</div></div><div class="card-body">' + body + '</div>';
}

function startTgPolling() {
  stopTgPolling();
  var until = Date.now() + 4 * 60000;
  Settings7.tgPoll = setInterval(function () {
    if (Date.now() > until || State.ui.page !== 'settings') { stopTgPolling(); return; }
    refreshMe().then(function () {
      if (State.me && State.me.telegram && State.me.telegram.linked) {
        stopTgPolling();
        Settings7.tgLink = null;
        renderTgSettings();
        toast('Telegram connected', 'good');
      }
    });
  }, 4000);
}
function stopTgPolling() { if (Settings7.tgPoll) { clearInterval(Settings7.tgPoll); Settings7.tgPoll = null; } }

/* ─── booking page settings ── */
var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function renderBookingSettings(force) {
  var host = $('#bookingSettings');
  if (!host) return;
  if (!Settings7.booking || force) {
    if (!force) host.innerHTML = '<div class="card-body">' + loadingBox() + '</div>';
    api('bookingConfig', {}).then(function (r) {
      if (!r || !r.success) { host.innerHTML = '<div class="card-body small" style="color:var(--danger)">' + esc(niceErr(r)) + '</div>'; return; }
      Settings7.booking = r;
      drawBookingSettings();
    });
    if (!Settings7.booking) return;
  }
  drawBookingSettings();
}

function drawBookingSettings() {
  var host = $('#bookingSettings');
  if (!host || !Settings7.booking) return;
  var c = Settings7.booking, b = c.booking || {};
  var stages = (State.settings.stages || []).map(function (s) { return s.name; });
  var locs = ['Google Meet', 'Zoom', 'Phone call', 'WhatsApp call', 'In person'];
  var url = c.url;
  host.innerHTML =
    '<div class="card-head"><div class="card-title">Booking page</div>' +
    (url && b.enabled ? '<div class="row" style="gap:6px"><button class="btn btn-sm" data-act="copy" data-value="' + esc(url) + '">' + icon('copy', 12) + ' Copy link</button><a class="btn btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener">Open ↗</a></div>' : '') + '</div>' +
    '<div class="card-body">' +
    '<div class="tiny muted" style="margin-bottom:10px">People pick a free time, and the call lands here as a meeting with a lead attached. Only real meetings take a slot — a 30-minute call blocks 30 minutes (plus the gap you set), never the whole day. All-day reminders and events marked free never block anything.</div>' +
    toggleHtml('bkEnabled', !!b.enabled, 'Booking page is on', url ? url : 'Switch on to get your link') +
    '<div class="field-row" style="margin-top:12px"><div class="field"><label>Link name</label><div class="input-prefix"><span>?book=</span><input class="input" id="bkSlug" value="' + esc(c.slug || b.slug || '') + '" placeholder="your-name"/></div></div>' +
    '<div class="field"><label>Page title</label><input class="input" id="bkTitle" value="' + esc(b.title || '') + '"/></div></div>' +
    '<div class="field" style="margin-top:10px"><label>A line under the title</label><input class="input" id="bkIntro" value="' + esc(b.intro || '') + '" placeholder="A free 30-minute call about your Google ranking"/></div>' +
    '<div class="field" style="margin-top:10px"><label>Call lengths offered</label><div class="chip-picks">' + [15, 20, 30, 45, 60, 90].map(function (d) {
      return '<label class="pick"><input type="checkbox" class="bkDur" value="' + d + '"' + ((b.durations || []).indexOf(d) >= 0 ? ' checked' : '') + '/><span>' + d + ' min</span></label>';
    }).join('') + '</div></div>' +
    '<div class="field" style="margin-top:10px"><label>Days</label><div class="chip-picks">' + DOW.map(function (d, i) {
      return '<label class="pick"><input type="checkbox" class="bkDay" value="' + i + '"' + ((b.days || []).indexOf(i) >= 0 ? ' checked' : '') + '/><span>' + d + '</span></label>';
    }).join('') + '</div></div>' +
    '<div class="field-row-3" style="margin-top:10px">' +
    '<div class="field"><label>From</label><input class="input" type="time" id="bkStart" value="' + esc(b.start || '10:00') + '"/></div>' +
    '<div class="field"><label>Until</label><input class="input" type="time" id="bkEnd" value="' + esc(b.end || '19:00') + '"/></div>' +
    '<div class="field"><label>Start times every</label><select class="select" id="bkInterval">' + [15, 20, 30, 60].map(function (m) { return '<option value="' + m + '"' + (Number(b.interval) === m ? ' selected' : '') + '>' + m + ' min</option>'; }).join('') + '</select></div></div>' +
    '<div class="field-row-3" style="margin-top:10px">' +
    '<div class="field"><label>Gap around each call</label><select class="select" id="bkBuffer">' + [0, 5, 10, 15, 30].map(function (m) { return '<option value="' + m + '"' + (Number(b.buffer) === m ? ' selected' : '') + '>' + (m ? m + ' min' : 'none') + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label>Earliest booking</label><select class="select" id="bkNotice">' + [0, 1, 2, 3, 6, 12, 24, 48].map(function (h) { return '<option value="' + h + '"' + (Number(b.minNoticeHours) === h ? ' selected' : '') + '>' + (h ? h + ' h from now' : 'any time') + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label>How far ahead</label><select class="select" id="bkMax">' + [7, 14, 21, 30, 45, 60].map(function (d) { return '<option value="' + d + '"' + (Number(b.maxDays) === d ? ' selected' : '') + '>' + d + ' days</option>'; }).join('') + '</select></div></div>' +
    '<div class="field-row" style="margin-top:10px"><div class="field"><label>Where</label><select class="select" id="bkLoc">' + locs.map(function (l) { return '<option' + (b.location === l ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label>Meeting link (optional)</label><input class="input" id="bkLink" value="' + esc(b.link || '') + '" placeholder="https://meet.google.com/…"/></div></div>' +
    '<div class="field" style="margin-top:10px"><label>Put new bookings on stage</label><select class="select" id="bkStage"><option value="">Meeting in Progress (default)</option>' + stages.map(function (s) { return '<option' + (b.stage === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' +
    '<div class="field" style="margin-top:10px"><label>Thank-you note in the confirmation email</label><input class="input" id="bkThanks" value="' + esc(b.thanks || '') + '" placeholder="Looking forward to it — bring any questions about your website."/></div>' +
    '<div style="margin-top:12px">' +
    toggleHtml('bkAskPhone', b.askPhone !== false, 'Ask for a phone number', '') +
    toggleHtml('bkAskSite', b.askSite !== false, 'Ask for their website', '') +
    toggleHtml('bkAskCompany', b.askCompany !== false, 'Ask for the business name', '') +
    toggleHtml('bkInvite', b.inviteGuest !== false, 'Send the guest a calendar invite', '') +
    (c.canCheckCalendar ? toggleHtml('bkCal', b.checkCalendar !== false, 'Also skip times that are busy in my Google Calendar', 'Only timed events marked busy count. All-day events never block a day.') : '') +
    '</div>' +
    '<div class="row" style="margin-top:14px"><button class="btn btn-primary" data-act="bk-save">Save booking page</button>' +
    '<span class="tiny muted">Times are in ' + esc(c.tz || '') + '.</span></div>' +
    (b.enabled && c.preview && c.preview.length ? '<hr class="divider"/><div class="section-title">Next free days</div><div class="slot-preview">' + c.preview.map(function (d) {
      return '<div class="sp-day"><b>' + esc(Fmt.shortDate(d.date)) + '</b><span>' + d.slots.length + ' slots</span><span class="tiny muted">' + esc(d.slots.slice(0, 3).join(' · ')) + (d.slots.length > 3 ? '…' : '') + '</span></div>';
    }).join('') + '</div>' : '') +
    '</div>';
}

function readBookingForm() {
  var ck = function (id) { var el = $('#' + id); return el ? !!el.checked : undefined; };
  var v = function (id) { var el = $('#' + id); return el ? el.value : undefined; };
  var out = {
    enabled: ck('bkEnabled'), slug: v('bkSlug'), title: v('bkTitle'), intro: v('bkIntro'),
    durations: $$('.bkDur').filter(function (c) { return c.checked; }).map(function (c) { return Number(c.value); }),
    days: $$('.bkDay').filter(function (c) { return c.checked; }).map(function (c) { return Number(c.value); }),
    start: v('bkStart'), end: v('bkEnd'), interval: Number(v('bkInterval')), buffer: Number(v('bkBuffer')),
    minNoticeHours: Number(v('bkNotice')), maxDays: Number(v('bkMax')), location: v('bkLoc'), link: v('bkLink'),
    stage: v('bkStage'), thanks: v('bkThanks'), askPhone: ck('bkAskPhone'), askSite: ck('bkAskSite'), askCompany: ck('bkAskCompany'),
    inviteGuest: ck('bkInvite')
  };
  if ($('#bkCal')) out.checkCalendar = ck('bkCal');
  return out;
}

/* ─── API keys for this account ── */
function renderApiSettings() {
  var host = $('#apiSettings');
  if (!host) return;
  if (!Settings7.keys) {
    host.innerHTML = '<div class="card-body">' + loadingBox() + '</div>';
    api('apiKeys', {}).then(function (r) { Settings7.keys = (r && r.success) ? r.keys : []; drawApiSettings(); });
    return;
  }
  drawApiSettings();
}

function drawApiSettings() {
  var host = $('#apiSettings');
  if (!host) return;
  var base = Cfg.url || 'https://script.google.com/macros/s/…/exec';
  var keys = Settings7.keys || [];
  host.innerHTML =
    '<div class="card-head"><div class="card-title">API &amp; integrations</div><button class="btn btn-sm btn-primary" data-act="api-new">' + icon('plus', 12) + ' New key</button></div>' +
    '<div class="card-body">' +
    '<div class="small" style="margin-bottom:10px">Let another tool — your GBP tracker, a Chrome extension, Zapier, Make — read and add leads in <b>' + esc(currentWsName()) + '</b>. Each key belongs to this account only, and everything it changes shows in History under the key’s name.</div>' +
    (keys.length ? keys.map(function (k) { return apiKeyRowHtml(k, false); }).join('') : '<div class="small muted">No keys yet.</div>') +
    '<hr class="divider"/>' +
    '<div class="section-title">How to call it</div>' +
    '<div class="api-doc">' +
    apiDocRow('List or search leads', 'GET', base + '?key=evk_…&action=apiLeads&q=dental&stage=Proposal&updatedSince=2026-10-01') +
    apiDocRow('One lead with meetings, notes and history', 'GET', base + '?key=evk_…&action=apiLead&id=L…') +
    apiDocRow('Find by phone, website, email or name', 'GET', base + '?key=evk_…&action=apiFindLead&phone=01711…') +
    apiDocRow('Create or update (never duplicates)', 'POST', base + '\n{"apiKey":"evk_…","action":"apiUpsertLead","lead":{"name":"Smile Dental","phone":"+8801…","site":"smiledental.com","source":"GBP tracker","appendNote":"GBP score 62/100"}}') +
    apiDocRow('Log a call, message or audit', 'POST', base + '\n{"apiKey":"evk_…","action":"apiLogTouch","phone":"+8801…","type":"call","outcome":"Interested"}') +
    apiDocRow('Numbers for a dashboard', 'GET', base + '?key=evk_…&action=apiStats') +
    apiDocRow('Meetings', 'GET', base + '?key=evk_…&action=apiMeetings&from=2026-11-01&status=upcoming') +
    '</div>' +
    '<div class="tiny muted" style="margin-top:8px">POST bodies go as plain text (Content-Type: text/plain) so browsers skip the CORS preflight. A write key can also call any dashboard action — saveLead, saveMeeting, logTouch, aiAudit, aiSend.</div>' +
    '</div>';
}

function apiDocRow(title, method, example) {
  return '<div class="api-row"><div class="api-head"><span class="chip ' + (method === 'GET' ? 'chip-info' : 'chip-warm') + '">' + method + '</span> ' + esc(title) +
    '<button class="copy-btn" data-act="copy" data-value="' + esc(example) + '" title="Copy">' + icon('copy', 11) + '</button></div>' +
    '<pre>' + esc(example) + '</pre></div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */
Object.assign(ACTIONS, {
  /* sign-in */
  'gate-send-code': function () { gateSendCode(false); },
  'gate-resend': function () { gateSendCode(true); },
  'gate-verify': function () { gateVerify(); },
  'gate-back': function () { gateErr(''); gateShowStep('email'); var e = $('#gateEmail'); if (e) e.focus(); },
  'gate-request': function () { gateRequestAccess(); },
  'gate-key': function () {
    var k = String(($('#gateKey') || {}).value || '').trim();
    if (!k) { gateErr('Paste the access key first.'); return; }
    doLogin({ accessKey: k });
  },

  /* person + accounts */
  'me-menu': function () { openMeMenu(); },
  'ws-open': function () { openWorkspacePicker(); },
  'ws-pick': function (el) { switchWorkspace(el.dataset.id); },
  'sign-out-all': function () {
    confirmDialog('Sign out everywhere?', 'Every device signed in as you — phones, other browsers — will need to sign in again.', 'Sign out everywhere', function () { signOut(true); }, true);
  },
  'logout': function () {
    var mine = Outbox.sendable().length;
    closeModal();
    confirmDialog('Sign out?', mine
      ? mine + ' change(s) have not reached the sheet yet. They stay on this device and go out when you sign back in.'
      : 'You can sign back in with your email any time.', 'Sign out', function () { signOut(false); }, true);
  },
  'theme-toggle': function () {
    closeModal();
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  },
  'settings-go': function (el) {
    closeModal();
    State.ui.settingsTab = el.dataset.value || 'general';
    try { localStorage.setItem(LS.settingsTab, State.ui.settingsTab); } catch (e) {}
    var host = $('#settingsBody'); if (host) host.dataset.rendered = '';
    switchPage('settings');
  },
  'settings-tab': function (el) {
    State.ui.settingsTab = el.dataset.value;
    try { localStorage.setItem(LS.settingsTab, el.dataset.value); } catch (e) {}
    // Switch panes without re-drawing, so typed-but-unsaved values survive.
    $$('#settingsBody .settings-tabs .pill').forEach(function (b) { b.classList.toggle('active', b.dataset.value === el.dataset.value); });
    $$('#settingsBody .settings-pane').forEach(function (p) { p.hidden = p.dataset.pane !== el.dataset.value; });
    settingsTabOpened(el.dataset.value);
    var head = $('#settingsBody .settings-tabs'); if (head) head.scrollIntoView({ block: 'nearest' });
  },
  'go-admin': function (el) {
    closeModal();
    if (el.dataset.value) { Admin.tab = el.dataset.value; try { localStorage.setItem('ev7_admin_tab', Admin.tab); } catch (e) {} }
    if (el.dataset.value === 'people' || el.dataset.value === 'overview') adminLoad('ov');
    switchPage('admin');
  },
  'me-save-name': function () {
    api('saveMe', { name: ($('#meName') || {}).value || '' }).then(function (r) {
      if (r && r.success) { State.me = Object.assign({}, State.me, r.me); Cfg.me = State.me; renderPlatformChrome(); toast('Saved', 'good'); }
      else toast(niceErr(r), 'err');
    });
  },

  /* admin */
  'admin-tab': function (el) {
    Admin.tab = el.dataset.value;
    try { localStorage.setItem('ev7_admin_tab', Admin.tab); } catch (e) {}
    renderAdmin(true);
  },
  'admin-refresh': function () { Admin.ov = null; renderAdmin(true); adminLoad('ov', true); },
  'people-filter': function (el) { Admin.peopleFilter = el.dataset.value; renderAdmin(true); },
  'admin-invite': function () { openInviteForm(''); },
  'admin-invite-send': function () { sendInvite(); },
  'admin-reinvite': function (el) {
    var u = ((Admin.ov && Admin.ov.users) || []).filter(function (x) { return x.email === el.dataset.value; })[0] || {};
    api('adminInvite', { email: el.dataset.value, name: u.name || '', role: u.role || 'member', wsMode: 'none', sendEmail: false, appUrl: appBaseUrl() }).then(function (r) {
      if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
      showInviteLink(r, el.dataset.value);
    });
  },
  'admin-approve': function (el) { openApproveForm(el.dataset.value); },
  'admin-approve-send': function (el) { sendApprove(el.dataset.value); },
  'admin-reject': function (el) {
    confirmDialog('Reject ' + el.dataset.value + '?', 'They will not be able to sign in. You can still invite them later.', 'Reject', function () {
      api('adminReject', { email: el.dataset.value }).then(function (r) {
        if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
        toast('Rejected');
        State.pendingUsers = Math.max(0, (State.pendingUsers || 1) - 1);
        adminLoad('ov', true);
        renderChrome();
      });
    }, true);
  },
  'admin-edit-user': function (el) { openEditUser(el.dataset.value); },
  'admin-save-user': function (el) { saveUserFromForm(el.dataset.value); },
  'admin-key': function (el) {
    confirmDialog('Make an access key?', 'A key lets ' + el.dataset.value + ' sign in without an email code — handy for a shared office computer. Making a new one stops the old one working.', 'Make key', function () {
      api('adminAccessKey', { email: el.dataset.value }).then(function (r) {
        if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
        openModal({
          title: 'Access key for ' + r.email, narrow: true, noFocus: true,
          body: '<div class="small">Shown only this once. They paste it under <b>Other ways to sign in</b>.</div><div class="link-box"><code>' + esc(r.key) + '</code></div>' +
            '<button class="btn btn-sm" data-act="copy" data-value="' + esc(r.key) + '">' + icon('copy', 12) + ' Copy key</button>',
          foot: '<button class="btn btn-primary" data-act="close-modal">Done</button>'
        });
        adminLoad('ov', true);
      });
    });
  },
  'admin-revoke': function (el) {
    api('adminRevokeSessions', { email: el.dataset.value }).then(function (r) {
      toast(r && r.success ? 'Signed out of ' + r.ended + ' device(s)' : niceErr(r), r && r.success ? 'good' : 'err');
    });
  },
  'admin-audit-for': function (el) {
    closeModal();
    Admin.auditQ = { q: '', email: el.dataset.value, ws: '' };
    Admin.audit = null;
    Admin.tab = 'activity';
    renderAdmin(true);
  },
  'admin-audit-reload': function () { Admin.audit = null; renderAdmin(true); },
  'admin-new-ws': function () { openNewWorkspace(); },
  'admin-new-ws-save': function () { createWorkspaceFromForm(); },
  'admin-ws-edit': function (el) { openEditWorkspace(el.dataset.id); },
  'admin-ws-save': function (el) { saveWorkspaceFromForm(el.dataset.id); },
  'admin-ws-activity': function (el) { openWorkspaceActivity(el.dataset.id); },
  'admin-run': function (el) {
    var job = el.dataset.value;
    el.disabled = true;
    var label = el.textContent;
    el.textContent = 'Running…';
    api('adminRunJob', { job: job }, { timeout: 300000 }).then(function (r) {
      el.disabled = false; el.textContent = label;
      toast(r && r.success ? label + ' — done' : niceErr(r), r && r.success ? 'good' : 'err', 5000);
    });
  },
  'admin-triggers': function () {
    api('adminInstallTriggers', {}).then(function (r) {
      toast(r && r.success ? 'Schedules installed: ' + (r.triggers || []).length : niceErr(r), r && r.success ? 'good' : 'err');
      Admin.config = null; renderAdmin(true);
    });
  },
  'admin-sessions': function () { adminLoad('sessions'); },
  'cfg-save': function () {
    var c = { APP_URL: ($('#cfgAppUrl') || {}).value, BRAND_NAME: ($('#cfgBrand') || {}).value, AI_NAME: ($('#cfgAiName') || {}).value, SIGNUP_POLICY: ($('#cfgPolicy') || {}).value,
              GOOGLE_CLIENT_ID: ($('#cfgGoogle') || {}).value, PSI_KEY: ($('#cfgPsi') || {}).value };
    if ($('#cfgGoogleSecret')) c.GOOGLE_CLIENT_SECRET = $('#cfgGoogleSecret').value;
    if ($('#cfgAdmins')) c.ADMIN_EMAILS = $('#cfgAdmins').value;
    if ($('#cfgPw')) c.APP_PASSWORD = $('#cfgPw').value;
    api('adminSaveConfig', { config: c }).then(function (r) {
      if (!r || !r.success) { toast(niceErr(r), 'err', 6000); return; }
      toast('Saved', 'good');
      var an = (($('#cfgAiName') || {}).value || '').trim();
      try { localStorage.removeItem('ev7_ainame'); } catch (e) {}
      setAiName(an || 'Everstone Digital AI');
      Admin.config = null; Gate.confPromise = null; renderAdmin(true);
    });
  },
  'cfg-save-tg': function () {
    api('adminSaveConfig', { config: { TG_TOKEN: ($('#cfgTgToken') || {}).value } }).then(function (r) {
      if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
      toast('Token saved — now press Connect', 'good');
      Admin.tg = null; Admin.config = null; renderAdmin(true);
    });
  },
  'tg-webhook': function (el) {
    el.disabled = true;
    api('adminTelegramSetup', { execUrl: Cfg.url }).then(function (r) {
      el.disabled = false;
      toast(r && r.success ? 'Bot connected — try /help in Telegram' : niceErr(r), r && r.success ? 'good' : 'err', 6000);
      Admin.tg = null; renderAdmin(true);
    });
  },
  'api-revoke': function (el) {
    confirmDialog('Revoke this key?', 'Anything using it stops working straight away.', 'Revoke', function () {
      api(isAdminUser() ? 'adminRevokeApiKey' : 'apiKeyRevoke', { id: el.dataset.id }).then(function (r) {
        if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
        toast('Revoked');
        Admin.keys = null; Settings7.keys = null;
        if (State.ui.page === 'admin') renderAdmin(true); else renderApiSettings();
      });
    }, true);
  },

  /* access editor */
  'acc-toggle': function (el) {
    var row = el.closest('.acc-row');
    if (!row) return;
    var d = $('.acc-detail', row);
    d.hidden = !d.hidden;
    el.classList.toggle('active', !d.hidden);
    if (!d.hidden && !$('.acc-on', row).checked) { $('.acc-on', row).checked = true; row.classList.add('on'); }
  },
  'acc-preset': function (el) {
    var v = el.dataset.value;
    $$('#' + el.dataset.prefix + 'Acc .acc-row').forEach(function (row) {
      var on = v !== 'none';
      $('.acc-on', row).checked = on;
      row.classList.toggle('on', on);
      if (on) {
        $('.acc-level', row).value = v;
        $('.acc-help', row).textContent = LEVEL_HELP[v];
        $('.acc-del', row).checked = v !== 'view';
        $('.acc-export', row).checked = false;
      }
    });
  },
  'admin-ws-access': function (el) { openWorkspaceAccess(el.dataset.id); },
  'admin-ws-access-save': function (el) { saveWorkspaceAccess(el.dataset.id); },
  'assign-lead': function (el) {
    var l = getLead(el.dataset.id);
    if (!l) return;
    var members = (State.members || []).filter(function (m) { return m.level !== 'view'; });
    openModal({
      title: 'Assign ' + l.name, narrow: true, noFocus: true,
      body: '<div class="tiny muted">People who see only their own leads will see this one. Everyone with full access still does.</div>' +
        '<div class="ws-list">' + [{ email: '', name: 'Nobody', level: '' }].concat(members).map(function (m) {
          var cur = String(l.owner || '').toLowerCase() === m.email;
          return '<button class="ws-item' + (cur ? ' current' : '') + '" data-act="assign-pick" data-id="' + esc(l.id) + '" data-value="' + esc(m.email) + '">' +
            '<span class="ws-avatar">' + esc(m.email ? initialsOf(m.name) : '—') + '</span><span class="grow"><span class="ws-item-name">' + esc(m.name) + '</span>' +
            (m.email ? '<span class="tiny muted">' + esc(m.email) + ' · ' + esc(LEVEL_LABEL[m.level] || m.level) + (m.leads === 'own' ? ', own leads' : '') + '</span>' : '') + '</span>' +
            (cur ? '<span class="chip chip-good">now</span>' : '') + '</button>';
        }).join('') + '</div>'
    });
  },
  'assign-pick': function (el) {
    closeModal();
    Ops.saveLead({ id: el.dataset.id, owner: el.dataset.value }, { label: 'assign' });
    toast(el.dataset.value ? 'Assigned to ' + memberName(el.dataset.value) : 'Unassigned', 'good');
  },

  /* AI providers */
  'ai-add-provider': function () { openAddProvider(); },
  'ai-add-save': function () {
    var preset = ($('#apPreset') || {}).value;
    var keys = String(($('#apKeys') || {}).value || '').split(/[\s,]+/).filter(Boolean);
    var input = { preset: preset, addKeys: keys };
    if (preset === 'custom') input.base = ($('#apBase') || {}).value || '';
    saveProvider(input, 'Provider added').then(function (ok) { if (ok) closeModal(); });
  },
  'ai-save': function (el) { var v = providerFormValues(el.dataset.id); if (v) saveProvider(v, 'Saved'); },
  'ai-key-remove': function (el) { saveProvider({ id: el.dataset.id, removeKeys: [Number(el.dataset.index)] }, 'Key removed'); },
  'ai-move': function (el) {
    var idx = -1;
    (Admin.ai || []).forEach(function (p, i) { if (p.id === el.dataset.id) idx = i; });
    if (idx < 0) return;
    saveProvider({ id: el.dataset.id, position: idx + Number(el.dataset.dir) });
  },
  'ai-delete': function (el) {
    confirmDialog('Remove this provider?', 'Its keys are deleted from the backend too.', 'Remove', function () {
      api('adminDeleteAiProvider', { id: el.dataset.id }).then(function (r) {
        if (r && r.success) { Admin.ai = r.providers; renderAdmin(true); toast('Removed'); } else toast(niceErr(r), 'err');
      });
    }, true);
  },
  'ai-test': function (el) {
    Admin.tests[el.dataset.id] = loadingBox('Asking every key to say OK…');
    renderAdmin(true);
    api('adminTestAiProvider', { id: el.dataset.id, tier: 'fast' }, { timeout: 120000 }).then(function (r) {
      Admin.tests[el.dataset.id] = !r || !r.success ? '<span style="color:var(--danger)">' + esc(niceErr(r)) + '</span>'
        : r.results.map(function (x) {
          return '<div class="tiny">' + (x.ok ? '✅' : '❌') + ' <code>' + esc(x.key) + '</code> ' + (x.ok ? esc(x.model || '') + ' · ' + x.ms + ' ms' : esc(x.error || '')) + '</div>';
        }).join('');
      renderAdmin(true);
    });
  },
  'ai-models': function (el) {
    toast('Fetching models…');
    api('adminFetchModels', { id: el.dataset.id }, { timeout: 60000 }).then(function (r) {
      if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
      Admin.models[el.dataset.id] = r.models || [];
      var free = (r.models || []).filter(function (m) { return m.free; }).length;
      toast((r.models || []).length + ' models' + (free ? ', ' + free + ' free' : '') + ' — start typing in a model box', 'good', 5000);
      renderAdmin(true);
    });
  },

  /* Telegram (per person) */
  'tg-connect': function (el) {
    el.disabled = true;
    api('tgLinkCode', {}).then(function (r) {
      el.disabled = false;
      if (!r || !r.success) { toast(niceErr(r), 'err', 6000); return; }
      Settings7.tgLink = r;
      renderTgSettings();
      try { window.open(r.link, '_blank', 'noopener'); } catch (e) {}
      startTgPolling();
    });
  },
  'tg-check': function () {
    refreshMe().then(function () {
      if (State.me && State.me.telegram && State.me.telegram.linked) { Settings7.tgLink = null; stopTgPolling(); toast('Telegram connected', 'good'); }
      else toast('Not yet — press Start in Telegram, then try again', 'warn');
      renderTgSettings();
    });
  },
  'tg-unlink': function () {
    confirmDialog('Disconnect Telegram?', 'You will stop getting messages for your account until you connect again.', 'Disconnect', function () {
      api('tgUnlink', {}).then(function (r) {
        if (r && r.success) { refreshMe().then(renderTgSettings); toast('Disconnected'); } else toast(niceErr(r), 'err');
      });
    }, true);
  },
  'tg-test': function () {
    api('tgTest', {}).then(function (r) { toast(r && r.success ? 'Sent — check Telegram' : niceErr(r), r && r.success ? 'good' : 'err'); });
  },
  'tg-brief': function () { sendBriefToTelegram(false); },
  'tg-save-notify': function () {
    var n = { muted: !!($('#nt_muted') || {}).checked };
    NOTIFY_KINDS.forEach(function (k) { var el = $('#nt_' + k[0]); if (el) n[k[0]] = !!el.checked; });
    if ($('#ntWs')) n.tgWs = $('#ntWs').value;
    api('saveMe', { notify: n }).then(function (r) {
      if (r && r.success) { State.me = Object.assign({}, State.me, r.me); Cfg.me = State.me; toast('Saved', 'good'); renderTgSettings(); }
      else toast(niceErr(r), 'err');
    });
  },

  /* booking page */
  'bk-save': function (el) {
    var input = readBookingForm();
    if (input.enabled && !input.durations.length) { toast('Pick at least one call length', 'warn'); return; }
    if (input.enabled && !input.days.length) { toast('Pick at least one day', 'warn'); return; }
    el.disabled = true;
    api('saveBooking', { booking: input }).then(function (r) {
      el.disabled = false;
      if (!r || !r.success) { toast(niceErr(r), 'err', 6000); return; }
      Settings7.booking = r;
      if (r.booking) State.settings.booking = r.booking;
      drawBookingSettings();
      toast(r.booking && r.booking.enabled ? 'Booking page saved — your link is ready' : 'Saved', 'good');
    });
  },

  /* API keys */
  'api-new': function () {
    openModal({
      title: 'New API key', narrow: true,
      body: '<div class="field"><label>What is it for?</label><input class="input" id="akName" placeholder="GBP tracker"/></div>' +
        '<div class="field"><label>Access</label><select class="select" id="akScope"><option value="read">Read only — can look up leads and numbers</option><option value="write">Read and write — can add and update leads</option></select></div>',
      foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="api-create">Create key</button>'
    });
  },
  'api-create': function () {
    api('apiKeyCreate', { name: ($('#akName') || {}).value || 'API key', scope: ($('#akScope') || {}).value || 'read' }).then(function (r) {
      if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
      Settings7.keys = null; Admin.keys = null;
      openModal({
        title: 'Your new key', narrow: true, noFocus: true,
        body: '<div class="small">Copy it now — it is shown only once.</div><div class="link-box"><code>' + esc(r.key) + '</code></div>' +
          '<button class="btn btn-sm" data-act="copy" data-value="' + esc(r.key) + '">' + icon('copy', 12) + ' Copy key</button>',
        foot: '<button class="btn btn-primary" data-act="close-modal">Done</button>',
        onClose: function () { renderApiSettings(); }
      });
    });
  },

  /* calendar */
  'calendar-repair': function (el) {
    el.disabled = true;
    el.textContent = 'Working…';
    api('calendarRepair', {}, { timeout: 300000 }).then(function (r) {
      el.disabled = false;
      el.textContent = 'Free up my booking days';
      if (!r || !r.success) { toast(niceErr(r), 'err', 6000); return; }
      openModal({
        title: 'Booking days freed', narrow: true,
        body: '<div class="small">' + (r.fixed ? '<b>' + r.fixed + '</b> all-day follow-up event' + (r.fixed > 1 ? 's were' : ' was') + ' switched to <b>free</b>.' : 'Nothing needed fixing — every follow-up was already free.') +
          '</div><div class="small muted">' + (r.checked ? r.checked + ' events checked. ' : '') + 'Booking pages now only see your real meetings. If a day still looks full, check your booking tool’s “maximum bookings per day”.</div>',
        foot: '<button class="btn btn-primary" data-act="close-modal">Good</button>'
      });
    });
  }
});

/** "Send me the brief" — to my own Telegram, for the account I am in. */
function sendBriefToTelegram(ai) {
  toast(ai ? aiName() + ' is writing your brief…' : 'Sending…');
  api('briefMe', { ai: !!ai }, { timeout: 120000 }).then(function (r) {
    if (r && r.success) { toast('Sent to your Telegram', 'good'); return; }
    if (r && r.error === 'TG_NOT_LINKED') {
      openModal({
        title: 'Connect Telegram first', narrow: true,
        body: '<div class="small">Your Telegram is not connected to your account yet. It takes ten seconds.</div>',
        foot: '<button class="btn" data-act="close-modal">Later</button><button class="btn btn-primary" data-act="settings-go" data-value="telegram">Connect now</button>'
      });
      return;
    }
    toast(niceErr(r), 'err', 6000);
  });
}

/* ─── wiring that needs the DOM ─────────────────────────────────────────── */
function wirePlatformControls() {
  var email = $('#gateEmail');
  if (email) email.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); gateSendCode(false); } });
  var code = $('#gateCode');
  if (code) {
    code.addEventListener('input', function () {
      var d = code.value.replace(/\D/g, '').slice(0, 6);
      if (d !== code.value) code.value = d;
      if (d.length === 6) gateVerify();
    });
    code.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); gateVerify(); } });
  }
  var key = $('#gateKey');
  if (key) key.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ACTIONS['gate-key'](); } });

  // People search and the activity filters redraw as you type.
  document.addEventListener('input', debounce(function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'peopleSearch') {
      Admin.peopleQ = t.value;
      var pos = t.selectionStart;
      renderAdmin(true);
      var again = $('#peopleSearch'); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (x) {} }
    }
    if (t.id === 'auditQ') { Admin.auditQ.q = t.value; Admin.audit = null; adminLoad('audit'); }
  }, 260));
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'auditEmail') { Admin.auditQ.email = t.value; Admin.audit = null; renderAdmin(true); }
    if (t.id === 'auditWs') { Admin.auditQ.ws = t.value; Admin.audit = null; renderAdmin(true); }
  });

  var me = $('#btnMe'); if (me) me.addEventListener('click', openMeMenu);
  var ws = $('#wsSwitch'); if (ws) ws.addEventListener('click', openWorkspacePicker);

  // The old "brief" button built the text in the browser; it now asks the
  // server, which knows whose Telegram it is.
  var brief = $('#btnBriefTg');
  if (brief) {
    var fresh = brief.cloneNode(true);
    brief.parentNode.replaceChild(fresh, brief);
    fresh.addEventListener('click', function () { sendBriefToTelegram(false); });
  }

  // Mobile: the "More" tab opens the full menu as a sheet.
  var more = $('#mnavMore');
  if (more) more.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
  var shade = $('#navShade');
  if (shade) shade.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
  $$('.mnav-item[data-page]').forEach(function (b) {
    b.addEventListener('click', function () { document.body.classList.remove('nav-open'); switchPage(b.dataset.page); });
  });
  $$('.sidebar .nav-item').forEach(function (b) {
    b.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
  });

  var filt = $('#btnFilters');
  if (filt) filt.addEventListener('click', function () { document.body.classList.toggle('filters-open'); });

  var collapse = $('#btnCollapse');
  if (collapse) collapse.addEventListener('click', function () {
    var on = !document.body.classList.contains('nav-mini');
    document.body.classList.toggle('nav-mini', on);
    try { localStorage.setItem(LS.sidebar, on ? 'mini' : ''); } catch (e) {}
  });
  try { if (localStorage.getItem(LS.sidebar) === 'mini') document.body.classList.add('nav-mini'); } catch (e) {}
}

/* Pages and chrome hooks */
PAGE_RENDERERS.admin = function () { renderAdmin(false); };

var _switchPageV6 = switchPage;
switchPage = function (page) {
  if (page === 'admin' && !isAdminUser()) page = 'today';
  if (PAGE_SECTION[page] && !canSee(PAGE_SECTION[page])) { toast('That page is not part of your access.', 'warn'); page = 'today'; }
  _switchPageV6(page);
  document.body.classList.remove('nav-open');
  syncMobileNav();
};

var _renderChromeV6 = renderChrome;
renderChrome = function () {
  _renderChromeV6();
  renderPlatformChrome();
  applyPerm();
  syncMobileNav();
};

function syncMobileNav() {
  var page = State.ui.page;
  var main = ['today', 'leads', 'pipeline', 'followups'];
  $$('.mnav-item[data-page]').forEach(function (b) { b.classList.toggle('active', b.dataset.page === page); });
  var more = $('#mnavMore');
  if (more) more.classList.toggle('active', main.indexOf(page) < 0);
  var due = $('#nb-followups');
  var m = $('#mnb-followups');
  if (m && due) { m.textContent = due.textContent; m.style.display = due.style.display; m.classList.toggle('alert', due.classList.contains('alert')); }
  var f = State.ui.filters || {};
  var nf = ['stage', 'priority', 'source', 'label', 'health', 'added', 'ids'].filter(function (k) { return f[k] && (!Array.isArray(f[k]) || f[k].length); }).length + (f.sort && f.sort !== 'smart' ? 1 : 0);
  var fc = $('#filterCount');
  if (fc) fc.textContent = nf ? String(nf) : '';
  var t = $('#nb-today'), mt = $('#mnb-today');
  if (mt && t) { mt.textContent = t.textContent; mt.style.display = t.style.display; mt.classList.toggle('alert', t.classList.contains('alert')); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE SCREEN FOLLOWS THE ACCESS
   The server already refuses anything outside a person's access; this keeps
   the screen from offering it in the first place.
   ═══════════════════════════════════════════════════════════════════════════ */
var PAGE_SECTION = { leads: 'leads', pipeline: 'pipeline', followups: 'followups', meetings: 'meetings', notes: 'notes', reports: 'reports',
  history: 'history', analytics: 'analytics', ai: 'ai', messages: 'messages', docs: 'docs', archive: 'archive' };

function applyPerm() {
  var p = perm();
  var cl = document.body.classList;
  cl.toggle('perm-view', p.level === 'view');
  cl.toggle('perm-nomoney', p.money === false);
  cl.toggle('perm-noexport', !p.export);
  cl.toggle('perm-nodel', !p.del);
  cl.toggle('perm-noai', !canSee('ai'));
  cl.toggle('perm-nomanage', !canManageWs());
  cl.toggle('perm-own', p.leads === 'own');
  Object.keys(PAGE_SECTION).forEach(function (pg) {
    var ok = canSee(PAGE_SECTION[pg]);
    $$('.nav-item[data-page="' + pg + '"], .mnav-item[data-page="' + pg + '"]').forEach(function (el) { el.hidden = !ok; });
  });
  // A group heading with nothing visible under it goes too.
  $$('.sidebar .nav-group').forEach(function (g) {
    var any = false;
    for (var el = g.nextElementSibling; el && !el.classList.contains('nav-group'); el = el.nextElementSibling) {
      if (el.classList.contains('nav-item') && !el.hidden && el.dataset.page) { any = true; break; }
    }
    g.hidden = !any;
  });
  var fo = $('#fOwner');
  if (fo) {
    var members = State.members || [];
    var show = p.leads !== 'own' && members.length > 1;
    fo.hidden = !show;
    if (show) {
      var cur = State.ui.filters.owner || '';
      var html = '<option value="">Anyone’s leads</option><option value="__none">Not assigned</option>' +
        members.map(function (m) { return '<option value="' + esc(m.email) + '">' + esc(m.name) + (m.email === ((State.me && State.me.email) || '') ? ' (me)' : '') + '</option>'; }).join('');
      if (fo.dataset.html !== html) { fo.innerHTML = html; fo.dataset.html = html; }
      fo.value = cur;
    }
  }
  var page = State.ui.page;
  if (PAGE_SECTION[page] && !canSee(PAGE_SECTION[page])) switchPage('today');
}

(function guardWrites() {
  var quiet = { labels: 1, aiModel: 1, showFlowStrip: 1 };
  Object.keys(Ops).forEach(function (k) {
    if (typeof Ops[k] !== 'function') return;
    var orig = Ops[k];
    Ops[k] = function (arg) {
      var p = perm();
      if (p.level === 'view') { toast('You can look at this account but not change anything.', 'warn'); return; }
      if (k === 'saveSettings' && !canManageWs()) {
        var keys = Object.keys(arg || {});
        if (!keys.every(function (x) { return quiet[x]; })) toast('Only a manager of this account can change its setup.', 'warn');
        return;
      }
      if (k === 'archiveLead' && !p.del) { toast('Archiving is not part of your access.', 'warn'); return; }
      if (k === 'reorderLeads' && p.leads === 'own') return;
      return orig.apply(Ops, arguments);
    };
  });
  ['edit-field', 'edit-labels', 'quick-followup', 'add-lead', 'edit-lead', 'add-meeting', 'add-meeting-for', 'edit-meeting',
   'meeting-outcome', 'open-meeting', 'new-note', 'new-task', 'add-doc', 'add-doc-for', 'log-touch', 'tpl-new', 'tpl-edit',
   'assign-lead', 'set-stage', 'done-followup', 'toggle-star', 'add-note', 'plan-wa'].forEach(function (a) {
    var orig = ACTIONS[a];
    if (!orig) return;
    ACTIONS[a] = function (el, e) {
      if (perm().level === 'view' && !(a === 'open-meeting')) { toast('You can look at this account but not change anything.', 'warn'); return; }
      return orig(el, e);
    };
  });
  // Money they cannot see reads as a dash, everywhere it would be printed.
  ['money', 'compactMoney'].forEach(function (f) {
    var orig = Fmt[f];
    Fmt[f] = function () { return canSeeMoney() ? orig.apply(Fmt, arguments) : '—'; };
  });
})();

(function wireOwnerFilter() {
  var fo = document.getElementById('fOwner');
  if (fo) fo.addEventListener('change', function () { State.ui.filters.owner = fo.value; renderLeads(); });
})();
