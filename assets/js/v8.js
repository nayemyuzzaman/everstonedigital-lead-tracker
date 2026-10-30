/* ═══════════════════════════════════════════════════════════════════════════
   v8.js — loaded last. Adds, without touching the older files more than a
   line or two:

     1. Delete for good — one lead, a selection, or the whole archive
     2. Move / copy leads between accounts (never automatic)
     3. Admin: delete a person, delete an account
     4. Profile photo
     5. Which account you are in — always visible, and pickable when adding
     6. Guide page, a ? on every page, a first-visit tip, and "ask the AI"
     7. Version number, "What's new", and "a new version is ready — Reload"

   Words for the Guide live in guide.js; the version number in version.js.
   ═══════════════════════════════════════════════════════════════════════════ */

var V8 = {
  lang: 'en',
  tipsOff: false,
  seenTips: {},
  helpPage: '',
  guideQuery: '',
  updateTimer: null
};

(function loadPrefs() {
  try {
    V8.lang = localStorage.getItem('ev8_lang') === 'bn' ? 'bn' : 'en';
    V8.tipsOff = localStorage.getItem('ev8_tips_off') === '1';
    V8.seenTips = JSON.parse(localStorage.getItem('ev8_tips_seen') || '{}') || {};
  } catch (e) {}
})();

function v8SetLang(l) {
  V8.lang = l === 'bn' ? 'bn' : 'en';
  try { localStorage.setItem('ev8_lang', V8.lang); } catch (e) {}
}
function v8T(o) { return o ? (o[V8.lang] || o.en || '') : ''; }
function v8Ver() { return window.EVERSTONE_VERSION || { version: '8.0', build: 0, notes: { en: [], bn: [] } }; }
function v8Writable() {
  var list = (State.me && State.me.workspaces) || [];
  return list.filter(function (w) { return w.status !== 'archived' && w.level !== 'view'; });
}
function v8CanMove() {
  var cur = Cfg.ws || 'main';
  return v8Writable().some(function (w) { return w.id !== cur; });
}

/* ─── small shared pieces ─────────────────────────────────────────────────── */
/** A danger confirm that only unlocks after typing a word. */
function v8ConfirmTyped(opts) {
  openModal({
    title: opts.title,
    narrow: true,
    body: '<div class="v8-danger-box">' + icon('alert', 16) + '<div>' + opts.html + '</div></div>' +
      (opts.extra || '') +
      (opts.word ? '<div class="field" style="margin-top:12px"><label>' + esc(opts.prompt || ('Type ' + opts.word + ' to confirm')) + '</label>' +
        '<input class="input" id="v8Typed" autocomplete="off" spellcheck="false" placeholder="' + esc(opts.word) + '"/></div>' : ''),
    foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn btn-danger" id="v8TypedOk"' + (opts.word ? ' disabled' : '') + '>' + esc(opts.ok || 'Delete') + '</button>'
  });
  var input = $('#v8Typed'), ok = $('#v8TypedOk');
  function matches() { return !opts.word || String(input.value).trim().toLowerCase() === String(opts.word).trim().toLowerCase(); }
  if (input) input.addEventListener('input', function () { ok.disabled = !matches(); });
  if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && matches()) ok.click(); });
  ok.addEventListener('click', function () {
    if (!matches()) return;
    var extraVals = {};
    $$('#modalBody [data-v8-opt]').forEach(function (el) { extraVals[el.dataset.v8Opt] = el.type === 'checkbox' ? el.checked : el.value; });
    ok.disabled = true; ok.textContent = 'Working…';
    opts.onOk(extraVals, function done(closeIt) { if (closeIt !== false) closeModal(); else { ok.disabled = false; ok.textContent = opts.ok || 'Delete'; } });
  });
}

/** Removes leads (and what belongs to them) from what this device holds. */
function v8DropLocal(ids) {
  var gone = {};
  (ids || []).forEach(function (id) { gone[id] = true; });
  State.leads = State.leads.filter(function (l) { return !gone[l.id]; });
  ['meetings', 'docs', 'notes', 'tasks', 'touches', 'stageEvents', 'activities'].forEach(function (k) {
    if (Array.isArray(State[k])) State[k] = State[k].filter(function (x) { return !(x && gone[x.leadId]); });
  });
  Object.keys(gone).forEach(function (id) { delete State.ui.selected[id]; });
  if (State.ui.detailId && gone[State.ui.detailId] && typeof closeDetail === 'function') closeDetail();
  try { saveCache(); } catch (e) {}
  Store.notify();
}

/** Sends anything still queued first, so the server sees the latest. */
function v8Flushed() {
  try { return Promise.resolve(Outbox.flush()).then(function () { return true; }, function () { return true; }); }
  catch (e) { return Promise.resolve(true); }
}

/* ═══ 1. DELETE FOR GOOD ═══════════════════════════════════════════════════ */
function v8Purge(ids, opts) {
  opts = opts || {};
  return v8Flushed().then(function () {
    var body = opts.all ? { all: true } : { ids: ids, anyStatus: !!opts.anyStatus };
    return api('purgeLeads', body, { timeout: 120000 });
  }).then(function (r) {
    if (!r || !r.success) {
      toast(r && r.error === 'Unknown action: purgeLeads' ? 'Update the backend (Code.gs) first — see Admin.' : niceErr(r), 'err', 7000);
      return false;
    }
    v8DropLocal(r.ids || []);
    toast(!r.purged ? 'Nothing to delete' : r.purged === 1 ? 'Deleted for good' : r.purged + ' leads deleted for good', 'good');
    return true;
  });
}

function v8AskPurge(ids, anyStatus) {
  var leads = ids.map(getLead).filter(Boolean);
  var n = ids.length;
  var name = n === 1 && leads[0] ? leads[0].name || 'this lead' : n + ' leads';
  v8ConfirmTyped({
    title: 'Delete ' + name + ' for good?',
    html: '<b>This cannot be undone.</b> ' + (n === 1 ? 'The lead' : 'These leads') +
      ', with ' + (n === 1 ? 'its' : 'their') + ' meetings, notes, tasks, documents and history, are removed from the spreadsheet.' +
      (anyStatus ? '<br/><span class="tiny muted">Want to keep a copy? Press Cancel and use Archive instead.</span>' : ''),
    word: n > 1 ? 'DELETE' : '',
    ok: n > 1 ? 'Delete ' + n + ' for good' : 'Delete for good',
    onOk: function (x, done) { v8Purge(ids, { anyStatus: anyStatus }).then(function (ok) { done(ok !== false); }); }
  });
}

/* ═══ 2. MOVE / COPY BETWEEN ACCOUNTS ══════════════════════════════════════ */
function v8OpenMove(ids) {
  var cur = Cfg.ws || 'main';
  var targets = v8Writable().filter(function (w) { return w.id !== cur; });
  if (!targets.length) { toast('You can only open this one account.', 'warn'); return; }
  var n = ids.length;
  var one = n === 1 ? getLead(ids[0]) : null;
  var canMoveOut = !State.perm || State.perm.del !== false;
  openModal({
    title: (one ? (one.name || 'Lead') : n + ' leads') + ' → another account',
    narrow: true,
    body:
      '<div class="field"><label>To which account</label><select class="select" id="v8MoveTo">' +
        targets.map(function (w) { return '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>How</label><div class="radio-list">' +
        (canMoveOut ? '<label class="radio-row"><input type="radio" name="v8MoveMode" value="move" checked/><span><b>Move</b><br/><span class="tiny muted">Takes ' + (n === 1 ? 'it' : 'them') + ' out of ' + esc(currentWsName() || 'this account') + '.</span></span></label>' : '') +
        '<label class="radio-row"><input type="radio" name="v8MoveMode" value="copy"' + (canMoveOut ? '' : ' checked') + '/><span><b>Copy</b><br/><span class="tiny muted">Keeps ' + (n === 1 ? 'it' : 'them') + ' here too.</span></span></label>' +
      '</div></div>' +
      '<div class="tiny muted">Meetings, notes, tasks, documents and interactions go along. Calendar events stay where they are.</div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" id="v8MoveGo">' + icon('move', 13) + ' Go</button>'
  });
  $('#v8MoveGo').addEventListener('click', function () {
    var btn = this;
    var to = $('#v8MoveTo').value;
    var mode = ($('input[name="v8MoveMode"]:checked') || {}).value || 'copy';
    var toName = ((targets.filter(function (w) { return w.id === to; })[0]) || {}).name || 'the other account';
    btn.disabled = true; btn.textContent = mode === 'move' ? 'Moving…' : 'Copying…';
    v8Flushed().then(function () {
      return api('moveLeads', { ids: ids, toWs: to, mode: mode }, { timeout: 120000 });
    }).then(function (r) {
      if (!r || !r.success) {
        btn.disabled = false; btn.textContent = 'Go';
        toast(r && /Unknown action/.test(r.error || '') ? 'Update the backend (Code.gs) first — see Admin.' : niceErr(r), 'err', 7000);
        return;
      }
      closeModal();
      if (mode === 'move') v8DropLocal(r.ids || ids);
      else { State.ui.selected = {}; Store.notify(); }
      toastAction((mode === 'move' ? 'Moved ' : 'Copied ') + (r.count === 1 ? '1 lead' : r.count + ' leads') + ' to ' + toName, 'Open ' + toName,
        function () { switchWorkspace(to); }, 8000);
    });
  });
}

/* ═══ 3. ADMIN: DELETE A PERSON, DELETE AN ACCOUNT ═════════════════════════ */
function v8AdminRefresh() {
  if (ACTIONS['admin-refresh']) ACTIONS['admin-refresh']();
  try { refreshMe(); } catch (e) {}
}

function v8AskDeleteUser(email) {
  var ov = Admin.ov || {};
  var u = (ov.users || []).filter(function (x) { return x.email === email; })[0] || { email: email };
  var theirs = (ov.workspaces || []).filter(function (w) { return w.id !== 'main' && String(w.owner || '').toLowerCase() === email; });
  v8ConfirmTyped({
    title: 'Delete ' + (u.name || email) + ' for good?',
    html: '<b>' + esc(email) + '</b> is removed from the tracker: their sign-ins end now, any invite stops working and they disappear from People. ' +
      'Leads they added stay where they are.<br/><span class="tiny muted">If they sign in again later they can only ask for access, like someone new.</span>',
    extra: theirs.length ? '<label class="check-row" style="margin-top:10px"><input type="checkbox" data-v8-opt="withWorkspaces"/><span>Also delete ' +
      (theirs.length === 1 ? 'their account <b>' + esc(theirs[0].name) + '</b>' : 'their ' + theirs.length + ' accounts') +
      ' <span class="tiny muted">(only if nobody else uses it; the spreadsheet goes to the Drive trash)</span></span></label>' : '',
    word: 'DELETE',
    ok: 'Delete person',
    onOk: function (x, done) {
      api('adminDeleteUser', { email: email, withWorkspaces: !!x.withWorkspaces }, { timeout: 90000 }).then(function (r) {
        if (!r || !r.success) { toast(r && /Unknown action/.test(r.error || '') ? 'Update the backend (Code.gs) first.' : niceErr(r), 'err', 7000); done(false); return; }
        done();
        toast((u.name || email) + ' deleted' + (r.workspaces && r.workspaces.length ? ' — and ' + r.workspaces.join(', ') : ''), 'good');
        v8AdminRefresh();
      });
    }
  });
}

function v8AskDeleteWs(id) {
  var w = ((Admin.ov && Admin.ov.workspaces) || []).filter(function (x) { return x.id === id; })[0];
  if (!w) return;
  v8ConfirmTyped({
    title: 'Delete the account “' + w.name + '”?',
    html: '<b>' + (w.leads || 0) + ' leads</b> and everything else in it go with it. Everyone loses access, its API keys stop working and its booking link closes.' +
      '<br/><span class="tiny muted">Its spreadsheet goes to the owner’s Google Drive trash, where it can be restored for 30 days. Want to keep it instead? Use the pencil → Archived.</span>',
    word: w.name,
    prompt: 'Type the account name to confirm',
    ok: 'Delete account',
    onOk: function (x, done) {
      api('adminDeleteWorkspace', { id: id, confirm: w.name }, { timeout: 90000 }).then(function (r) {
        if (!r || !r.success) { toast(r && /Unknown action/.test(r.error || '') ? 'Update the backend (Code.gs) first.' : niceErr(r), 'err', 7000); done(false); return; }
        done();
        toast('“' + w.name + '” deleted' + (r.trashed ? ' — its sheet is in the Drive trash' : ''), 'good', 6000);
        if ((Cfg.ws || 'main') === id) switchWorkspace('main');
        v8AdminRefresh();
      });
    }
  });
}

/* ═══ 4. PROFILE PHOTO ═════════════════════════════════════════════════════ */
function v8ResizePhoto(file, size) {
  return new Promise(function (resolve, reject) {
    if (!file || !/^image\//.test(file.type || '')) { reject(new Error('Pick a JPG or PNG picture.')); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var s = Math.min(img.naturalWidth, img.naturalHeight);
      var sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      var q = 0.86, out = c.toDataURL('image/jpeg', q);
      while (out.length > 38000 && q > 0.45) { q -= 0.08; out = c.toDataURL('image/jpeg', q); }
      resolve(out);
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That picture could not be opened. Try a JPG or PNG (iPhone HEIC photos need converting first).')); };
    img.src = url;
  });
}

function v8SavePhoto(dataUrl) {
  return api('saveMe', { photo: dataUrl || '' }, { timeout: 60000 }).then(function (r) {
    if (!r || !r.success) { toast(niceErr(r), 'err', 6000); return false; }
    if (r.me) { State.me = Object.assign({}, State.me || {}, r.me); Cfg.me = State.me; }
    else if (State.me) State.me.picture = dataUrl || '';
    renderPlatformChrome();
    var av = $('#modalBody .me-avatar');
    if (av) av.innerHTML = dataUrl ? '<img src="' + esc(dataUrl) + '" alt=""/>' : esc(initialsOf((State.me || {}).name || Cfg.who));
    var rm = $('#v8PhotoRemove'); if (rm) rm.hidden = !dataUrl;
    var pk = $('#modalBody .v8-photo-tools [data-act="v8-photo-pick"]');
    if (pk) pk.innerHTML = icon('camera', 13) + ' ' + (dataUrl ? 'Change photo' : 'Add a photo');
    toast(dataUrl ? 'Photo saved' : 'Photo removed', 'good');
    return true;
  });
}

/* ═══ 5. WHICH ACCOUNT YOU ARE IN ══════════════════════════════════════════ */
function v8MarkWorkspace() {
  var other = !!Cfg.ws && Cfg.ws !== 'main';
  document.body.classList.toggle('in-other-ws', other);
  var sw = $('#wsSwitch');
  if (sw) {
    sw.classList.toggle('ws-other', other);
    sw.title = 'You are in ' + (currentWsName() || 'this account') + ' — new leads go here. Click to switch.';
  }
}

/* ═══ 6. GUIDE, HELP, TIPS, ASK THE AI ═════════════════════════════════════ */
function v8PageKey(p) { p = p || State.ui.page || 'today'; return p === 'analytics' ? 'reports' : p; }
function v8PageGuide(p) { return GUIDE.pages[v8PageKey(p)] || null; }

function v8LangToggle(where) {
  return '<div class="v8-lang" role="group" aria-label="Language">' +
    '<button class="' + (V8.lang === 'en' ? 'on' : '') + '" data-act="v8-lang" data-value="en" data-where="' + where + '">English</button>' +
    '<button class="' + (V8.lang === 'bn' ? 'on' : '') + '" data-act="v8-lang" data-value="bn" data-where="' + where + '">বাংলা</button></div>';
}

function v8StepsHtml(list, cls) {
  return list && list.length ? '<ol class="' + (cls || 'v8-steps') + '">' + list.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' : '';
}
function v8TipsHtml(list) {
  return list && list.length ? '<div class="v8-tips">' + list.map(function (s) { return '<div class="v8-tip">' + icon('pin', 12) + '<span>' + esc(s) + '</span></div>'; }).join('') + '</div>' : '';
}

/** Everything in the guide as plain text, for the AI. */
function v8GuideText(lang) {
  var L = lang || V8.lang, out = [];
  Object.keys(GUIDE.pages).forEach(function (k) {
    var g = GUIDE.pages[k];
    if (!g) return;
    out.push('## ' + (g.title[L] || g.title.en) + ' page\n' + (g.summary[L] || g.summary.en) + '\n' +
      (g.steps[L] || g.steps.en || []).map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n') +
      ((g.tips[L] || g.tips.en || []).length ? '\nTips: ' + (g.tips[L] || g.tips.en).join(' ') : ''));
  });
  GUIDE.topics.forEach(function (t) {
    out.push('## ' + (t.title[L] || t.title.en) + '\n' + (t[L] || t.en).map(function (s) { return '- ' + s; }).join('\n'));
  });
  return out.join('\n\n');
}

/** A plain search through the guide — the answer when the AI is not available. */
function v8GuideSearch(q) {
  var words = String(q || '').toLowerCase().split(/[^a-z0-9ঀ-৿]+/).filter(function (w) { return w.length > 2; });
  if (!words.length) return [];
  var hits = [];
  function score(text) { var t = text.toLowerCase(), n = 0; words.forEach(function (w) { if (t.indexOf(w) >= 0) n++; }); return n; }
  Object.keys(GUIDE.pages).forEach(function (k) {
    var g = GUIDE.pages[k]; if (!g) return;
    (g.steps.en || []).forEach(function (s, i) {
      var sc = score(s + ' ' + (g.steps.bn[i] || '') + ' ' + g.title.en);
      if (sc) hits.push({ sc: sc, where: v8T(g.title), text: v8T({ en: s, bn: g.steps.bn[i] }) });
    });
  });
  GUIDE.topics.forEach(function (t) {
    t.en.forEach(function (s, i) {
      var sc = score(s + ' ' + (t.bn[i] || '') + ' ' + t.title.en);
      if (sc) hits.push({ sc: sc, where: v8T(t.title), text: V8.lang === 'bn' ? t.bn[i] || s : s });
    });
  });
  return hits.sort(function (a, b) { return b.sc - a.sc; }).slice(0, 4);
}

function v8AskHtml(where) {
  return '<div class="v8-ask">' +
    '<div class="v8-ask-head">' + icon('ai', 14) + '<b>' + esc(V8.lang === 'bn' ? 'AI-কে জিজ্ঞেস করুন' : 'Ask ' + aiName()) + '</b>' +
    '<span class="tiny muted">' + esc(V8.lang === 'bn' ? '"কীভাবে…?" — যেকোনো প্রশ্ন' : '"How do I…?" — anything about this tracker') + '</span></div>' +
    '<div class="v8-ask-row"><input class="input" id="v8Ask_' + where + '" placeholder="' +
      esc(V8.lang === 'bn' ? 'যেমন: একটা lead অন্য account-এ কীভাবে পাঠাব?' : 'e.g. How do I send a lead to another account?') + '"/>' +
    '<button class="btn btn-primary" data-act="v8-ask" data-where="' + where + '">' + icon('send', 13) + '</button></div>' +
    '<div class="v8-ask-out" id="v8AskOut_' + where + '" hidden></div></div>';
}

function v8Ask(where) {
  var input = $('#v8Ask_' + where), out = $('#v8AskOut_' + where);
  if (!input || !out) return;
  var q = String(input.value || '').trim();
  if (!q) { input.focus(); return; }
  out.hidden = false;
  out.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';
  var page = v8PageKey(where === 'help' ? V8.helpPage : State.ui.page);
  var fallback = function (why) {
    var hits = v8GuideSearch(q);
    out.innerHTML = (why ? '<div class="tiny muted" style="margin-bottom:6px">' + esc(why) + '</div>' : '') +
      (hits.length ? hits.map(function (h) { return '<div class="v8-hit"><span class="chip chip-ghost">' + esc(h.where) + '</span> ' + esc(h.text) + '</div>'; }).join('')
        : '<div class="small">' + esc(V8.lang === 'bn' ? 'Guide-এ এর উত্তর পাওয়া যায়নি। অন্যভাবে লিখে দেখুন।' : 'Nothing in the guide matches. Try other words.') + '</div>');
  };
  api('aiTask', { kind: 'appHelp', question: q, page: page, lang: V8.lang, guide: v8GuideText(V8.lang) }, { timeout: 90000 }).then(function (r) {
    if (r && r.success && r.text) {
      out.innerHTML = '<div class="v8-answer">' + esc(r.text) + '</div>';
      return;
    }
    fallback(V8.lang === 'bn' ? 'AI এখন উত্তর দিতে পারছে না — guide থেকে মিলে যাওয়া অংশ:' : 'The AI could not answer just now — closest matches in the guide:');
  });
}

/** The ? popup for one page. */
function v8OpenHelp(page) {
  var key = v8PageKey(page);
  var g = v8PageGuide(key) || GUIDE.pages.guide;
  V8.helpPage = key;
  openModal({
    title: v8T(g.title),
    wide: false,
    noFocus: true,
    body:
      '<div class="v8-help-top">' + v8LangToggle('help') + '</div>' +
      '<p class="v8-summary">' + esc(v8T(g.summary)) + '</p>' +
      v8StepsHtml(g.steps[V8.lang] || g.steps.en) +
      v8TipsHtml(g.tips[V8.lang] || g.tips.en) +
      v8AskHtml('help'),
    foot: '<label class="check-row tiny" style="margin-right:auto"><input type="checkbox" id="v8TipsOff"' + (V8.tipsOff ? ' checked' : '') + '/> ' +
        esc(V8.lang === 'bn' ? 'নতুন page-এ tip দেখাবে না' : 'Don’t show tips on new pages') + '</label>' +
      '<button class="btn" data-act="v8-open-guide">' + esc(V8.lang === 'bn' ? 'পুরো Guide' : 'Full guide') + '</button>' +
      '<button class="btn btn-primary" data-act="close-modal">' + esc(V8.lang === 'bn' ? 'বুঝেছি' : 'Got it') + '</button>'
  });
  var off = $('#v8TipsOff');
  if (off) off.addEventListener('change', function () {
    V8.tipsOff = this.checked;
    try { localStorage.setItem('ev8_tips_off', V8.tipsOff ? '1' : ''); } catch (e) {}
  });
  var ask = $('#v8Ask_help');
  if (ask) ask.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); v8Ask('help'); } });
}

/** The small card that appears the first time someone opens a page. */
function v8MaybeTip(page) {
  var key = v8PageKey(page);
  if (V8.tipsOff || V8.seenTips[key] || key === 'guide') return;
  if (document.body.classList.contains('gated') || !Cfg.token) return;
  if ($('#modal').classList.contains('show')) return;   // never on top of a dialog; it comes back next visit
  var g = v8PageGuide(key);
  if (!g) return;
  V8.seenTips[key] = 1;
  try { localStorage.setItem('ev8_tips_seen', JSON.stringify(V8.seenTips)); } catch (e) {}
  v8CloseTip();
  var el = document.createElement('div');
  el.className = 'v8-coach';
  el.id = 'v8Coach';
  el.innerHTML =
    '<div class="v8-coach-head">' + icon(g.icon || 'help', 15) + '<b>' + esc(v8T(g.title)) + '</b>' +
      '<span class="grow"></span>' + v8LangToggle('tip') +
      '<button class="v8-x" data-act="v8-tip-close" title="Close">✕</button></div>' +
    '<div class="v8-coach-body">' + esc(v8T(g.summary)) +
      v8StepsHtml((g.steps[V8.lang] || g.steps.en || []).slice(0, 2), 'v8-steps compact') + '</div>' +
    '<div class="v8-coach-foot"><button class="btn btn-sm btn-ghost" data-act="v8-tips-off">' + esc(V8.lang === 'bn' ? 'আর tip না' : 'No more tips') + '</button>' +
      '<span class="grow"></span>' +
      '<button class="btn btn-sm" data-act="v8-help" data-page="' + esc(key) + '">' + esc(V8.lang === 'bn' ? 'আরও দেখুন' : 'Show me how') + '</button>' +
      '<button class="btn btn-sm btn-primary" data-act="v8-tip-close">' + esc(V8.lang === 'bn' ? 'বুঝেছি' : 'Got it') + '</button></div>';
  document.body.appendChild(el);
  requestAnimationFrame(function () { el.classList.add('show'); });
}
function v8CloseTip() { var t = $('#v8Coach'); if (t) t.remove(); }

/** The Guide page. */
function renderGuide() {
  var root = $('#guideRoot');
  if (!root) return;
  var v = v8Ver();
  var q = V8.guideQuery.toLowerCase();
  var notes = (v.notes && (v.notes[V8.lang] || v.notes.en)) || [];
  function match(texts) { if (!q) return true; return texts.join(' ').toLowerCase().indexOf(q) >= 0; }

  var order = ['today', 'leads', 'pipeline', 'followups', 'meetings', 'notes', 'reports', 'history', 'ai', 'messages', 'docs', 'archive', 'settings', 'admin'];
  if (!isAdminUser()) order = order.filter(function (k) { return k !== 'admin'; });
  var pageCards = order.map(function (k) {
    var g = GUIDE.pages[k];
    var steps = g.steps[V8.lang] || g.steps.en, tips = g.tips[V8.lang] || g.tips.en;
    if (!match([v8T(g.title), v8T(g.summary)].concat(steps, tips, g.steps.en, g.steps.bn))) return '';
    return '<details class="v8-gcard"' + (q ? ' open' : '') + '><summary>' +
      '<span class="v8-gico">' + icon(g.icon, 16) + '</span><span class="grow"><b>' + esc(v8T(g.title)) + '</b><span class="small muted">' + esc(v8T(g.summary)) + '</span></span>' +
      '<button class="btn btn-sm" data-act="v8-go-page" data-value="' + k + '">' + esc(V8.lang === 'bn' ? 'খুলুন' : 'Open') + '</button></summary>' +
      '<div class="v8-gbody">' + v8StepsHtml(steps) + v8TipsHtml(tips) + '</div></details>';
  }).join('');
  var topicCards = GUIDE.topics.map(function (t) {
    var lines = t[V8.lang] || t.en;
    if (!match([v8T(t.title)].concat(lines, t.en, t.bn))) return '';
    return '<details class="v8-gcard"' + (q ? ' open' : '') + '><summary><span class="v8-gico">' + icon(t.icon, 16) + '</span>' +
      '<span class="grow"><b>' + esc(v8T(t.title)) + '</b></span></summary>' +
      '<div class="v8-gbody"><ul class="v8-steps">' + lines.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div></details>';
  }).join('');

  root.innerHTML =
    '<div class="page-head"><div><h1 class="page-title">' + esc(V8.lang === 'bn' ? 'Guide — কীভাবে ব্যবহার করবেন' : 'Guide — how everything works') + '</h1>' +
      '<p class="page-sub">' + esc(V8.lang === 'bn' ? 'প্রতিটা page-এ উপরের ? বাটন সেই page-এর help খোলে।' : 'The ? button at the top opens help for whichever page you are on.') + '</p></div>' +
      '<div class="page-actions">' + v8LangToggle('guide') + '</div></div>' +
    '<div class="v8-guide-grid">' +
      '<div class="v8-guide-main">' +
        '<div class="v8-gsearch">' + icon('search', 14) + '<input class="input" id="v8GuideSearch" value="' + esc(V8.guideQuery) + '" placeholder="' +
          esc(V8.lang === 'bn' ? 'Guide-এ খুঁজুন — যেমন delete, photo, Telegram' : 'Search the guide — e.g. delete, photo, Telegram') + '"/></div>' +
        (pageCards ? '<div class="v8-gsec">' + esc(V8.lang === 'bn' ? 'Page অনুযায়ী' : 'Page by page') + '</div>' + pageCards : '') +
        (topicCards ? '<div class="v8-gsec">' + esc(V8.lang === 'bn' ? 'আরও যা জানা দরকার' : 'Good to know') + '</div>' + topicCards : '') +
        (!pageCards && !topicCards ? emptyState(V8.lang === 'bn' ? 'কিছু পাওয়া যায়নি' : 'Nothing found', V8.lang === 'bn' ? 'ডানের box-এ AI-কে জিজ্ঞেস করুন।' : 'Ask the AI in the box on the right.') : '') +
      '</div>' +
      '<aside class="v8-guide-side">' +
        v8AskHtml('guide') +
        '<div class="card v8-new"><div class="card-head"><div class="card-title">' + icon('bell', 14) + ' ' +
          esc(V8.lang === 'bn' ? 'নতুন কী এসেছে' : 'What’s new') + ' <span class="chip chip-good">v' + esc(v.version) + ' · build ' + esc(v.build) + '</span></div></div>' +
          '<div class="card-body">' + v8StepsHtml(notes, 'v8-steps') + '</div></div>' +
        '<button class="btn btn-sm btn-ghost" data-act="v8-tips-reset">' + icon('undo', 12) + ' ' + esc(V8.lang === 'bn' ? 'Page tip আবার দেখাও' : 'Show the page tips again') + '</button>' +
      '</aside>' +
    '</div>';

  var s = $('#v8GuideSearch');
  if (s) s.addEventListener('input', debounce(function () {
    V8.guideQuery = s.value; var pos = s.selectionStart; renderGuide();
    var n = $('#v8GuideSearch'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
  }, 220));
  var ask = $('#v8Ask_guide');
  if (ask) ask.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); v8Ask('guide'); } });
}

/** Puts a ? next to every page title. */
function v8AddPageHelpButtons() {
  $$('.page').forEach(function (sec) {
    var page = sec.id.replace(/^page-/, '');
    if (page === 'guide') return;
    var t = sec.querySelector('.page-title');
    if (!t || t.querySelector('.page-help')) return;
    var b = document.createElement('button');
    b.className = 'page-help';
    b.type = 'button';
    b.dataset.act = 'v8-help';
    b.dataset.page = page;
    b.title = 'How to use this page';
    b.innerHTML = icon('help', 15);
    t.appendChild(b);
  });
}

/* ═══ 7. VERSION, WHAT'S NEW, UPDATE BANNER ════════════════════════════════ */
function v8RenderVersion() {
  var v = v8Ver();
  var el = $('#navVersion');
  if (el) el.innerHTML = '<span class="nv-dot"></span><span class="label">v' + esc(v.version) + ' · build ' + esc(v.build) + '</span>';
}

function v8WhatsNew(auto) {
  var v = v8Ver();
  var notes = (v.notes && (v.notes[V8.lang] || v.notes.en)) || [];
  openModal({
    title: (V8.lang === 'bn' ? 'নতুন কী এসেছে — ' : 'What’s new — ') + 'v' + v.version + ' (build ' + v.build + ')',
    narrow: true,
    noFocus: true,
    body: '<div class="v8-help-top">' + v8LangToggle('news') + '</div>' + v8StepsHtml(notes) +
      '<div class="tiny muted" style="margin-top:10px">' + esc(v.date || '') + ' · backend ' + esc((State.me && State.me.version) || State.serverVersion || '?') + '</div>',
    foot: '<button class="btn" data-act="v8-open-guide">' + esc(V8.lang === 'bn' ? 'Guide দেখুন' : 'Open the guide') + '</button>' +
      '<button class="btn btn-primary" data-act="close-modal">' + esc(V8.lang === 'bn' ? 'ঠিক আছে' : 'Nice') + '</button>',
    onClose: function () { setTimeout(function () { v8MaybeTip(State.ui.page); }, 500); }
  });
  try { localStorage.setItem('ev8_seen_build', String(v.build)); } catch (e) {}
}

function v8MaybeWhatsNew() {
  var v = v8Ver(), seen = 0;
  try { seen = Number(localStorage.getItem('ev8_seen_build') || 0); } catch (e) {}
  if (seen >= Number(v.build || 0)) return;
  if (document.body.classList.contains('gated') || $('#modal').classList.contains('show')) return;
  v8WhatsNew(true);
}

function v8Banner(id, html, kind) {
  var host = $('#v8Update');
  if (!host) return;
  var el = $('#' + id);
  if (!html) { if (el) el.remove(); host.hidden = !host.children.length; return; }
  if (!el) { el = document.createElement('div'); el.id = id; host.appendChild(el); }
  el.className = 'v8-bar ' + (kind || '');
  el.innerHTML = html;
  host.hidden = false;
}

/** Checks the published version.js; when its build is newer, says so. */
function v8CheckForUpdate() {
  if (window.EV_DEMO || !/^https?:/.test(location.protocol)) return;
  var cur = v8Ver();
  fetch('assets/js/version.js?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
    var b = /build:\s*(\d+)/.exec(txt || ''), vv = /version:\s*'([^']+)'/.exec(txt || '');
    if (!b) return;
    var build = Number(b[1]);
    if (build > Number(cur.build || 0)) {
      v8Banner('v8NewVersion', icon('sync', 14) + '<span><b>' + (V8.lang === 'bn' ? 'নতুন version এসেছে' : 'A new version is ready') + '</b> — v' + esc(vv ? vv[1] : '') + ' · build ' + build + '</span>' +
        '<button class="btn btn-sm btn-primary" data-act="v8-reload">' + (V8.lang === 'bn' ? 'Reload করুন' : 'Reload') + '</button>', 'info');
    }
  }).catch(function () {});
}

function v8VersionCompare(a, b) {
  var x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
  for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

/** Tells the admin when Code.gs is older than this dashboard needs. */
function v8CheckBackend() {
  var need = v8Ver().backend || '8.0';
  var have = (State.me && State.me.version) || State.serverVersion || '';
  if (!have || !isAdminUser() || v8VersionCompare(have, need) >= 0) { v8Banner('v8Backend', ''); return; }
  v8Banner('v8Backend', icon('alert', 14) + '<span><b>Backend is v' + esc(have) + ', this dashboard needs v' + esc(need) + '.</b> ' +
    'Paste the new Code.gs into Apps Script, then Deploy → Manage deployments → Edit → New version. Delete forever, Move and photos need it.</span>' +
    '<button class="btn btn-sm" data-act="v8-banner-close" data-value="v8Backend">✕</button>', 'warn');
}

/* ═══ WRAPS — older functions get the new bits added, nothing taken away ═══ */
(function wrap() {
  // Every page change: the first-visit tip.
  var _switchPage = switchPage;
  switchPage = function (page) {
    var r = _switchPage.apply(this, arguments);
    if (PAGE_RENDERERS[page]) { v8CloseTip(); setTimeout(function () { v8MaybeTip(page); }, 700); }
    return r;
  };

  // The account badge and the backend check ride along with the chrome.
  var _chrome = renderPlatformChrome;
  renderPlatformChrome = function () {
    var r = _chrome.apply(this, arguments);
    v8MarkWorkspace();
    v8CheckBackend();
    return r;
  };

  // Add a lead: say which account, and let them pick another one.
  var _openLeadForm = openLeadForm;
  openLeadForm = function (id) {
    var r = _openLeadForm.apply(this, arguments);
    if (id) return r;
    var list = v8Writable();
    var cur = Cfg.ws || 'main';
    if (list.length > 1) {
      var body = $('#modalBody');
      var f = document.createElement('div');
      f.className = 'field v8-ws-field';
      f.innerHTML = '<label>Add to account</label><select class="select" id="v8LeadWs">' + list.map(function (w) {
        return '<option value="' + esc(w.id) + '"' + (w.id === cur ? ' selected' : '') + '>' + esc(w.name) + (w.id === cur ? ' (open now)' : '') + '</option>';
      }).join('') + '</select><div class="tiny muted">It goes only to this account. Nothing is shared with the others.</div>';
      if (body) body.insertBefore(f, body.firstChild);
      $('#modalTitle').textContent = 'Add a lead to ' + (currentWsName() || 'this account');
      $('#v8LeadWs').addEventListener('change', function () {
        var name = this.options[this.selectedIndex].text.replace(' (open now)', '');
        $('#modalTitle').textContent = 'Add a lead to ' + name;
      });
    }
    return r;
  };

  var _saveLeadFromForm = saveLeadFromForm;
  saveLeadFromForm = function (id, draftKey) {
    var pick = $('#v8LeadWs');
    var target = pick ? pick.value : '';
    var cur = Cfg.ws || 'main';
    if (id || !target || target === cur) return _saveLeadFromForm.apply(this, arguments);
    var targetName = pick.options[pick.selectedIndex].text.replace(' (open now)', '');
    var realSave = Ops.saveLead;
    var realOpen = window.openDetail;
    var sent = null;
    Ops.saveLead = function (patch) {
      sent = Object.assign({ status: 'active', createdAt: new Date().toISOString() }, patch);
      return null;
    };
    try { _saveLeadFromForm.call(this, id, draftKey); }
    finally { Ops.saveLead = realSave; window.openDetail = realOpen; }
    if (!sent) return;
    api('saveLead', { lead: sent }, { ws: target, timeout: 60000 }).then(function (r) {
      if (r && r.success) toastAction('Added to ' + targetName, 'Open ' + targetName, function () { switchWorkspace(target); }, 7000);
      else toast('Could not add it to ' + targetName + ': ' + niceErr(r), 'err', 7000);
    });
  };

  // Your account: photo controls.
  var _openMeMenu = openMeMenu;
  openMeMenu = function () {
    var r = _openMeMenu.apply(this, arguments);
    var card = $('#modalBody .me-card');
    if (!card) return r;
    var me = State.me || {};
    var has = !!me.picture;
    var tools = document.createElement('div');
    tools.className = 'v8-photo-tools';
    tools.innerHTML = '<input type="file" accept="image/jpeg,image/png,image/webp,image/*" id="v8PhotoFile" hidden/>' +
      '<button class="btn btn-sm" data-act="v8-photo-pick">' + icon('camera', 13) + ' ' + (has ? 'Change photo' : 'Add a photo') + '</button>' +
      '<button class="btn btn-sm btn-ghost" id="v8PhotoRemove" data-act="v8-photo-remove"' + (has ? '' : ' hidden') + '>Remove</button>';
    card.parentNode.insertBefore(tools, card.nextSibling);
    var av = card.querySelector('.me-avatar');
    if (av) { av.classList.add('v8-av-edit'); av.dataset.act = 'v8-photo-pick'; av.title = 'Change photo'; }
    $('#v8PhotoFile').addEventListener('change', function () {
      var file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      toast('Saving your photo…');
      v8ResizePhoto(file, 192).then(v8SavePhoto, function (e) { toast(e.message, 'err', 6000); });
    });
    // version line at the bottom of the account sheet
    var list = $('#modalBody .me-list');
    if (list) {
      var v = v8Ver();
      var b = document.createElement('button');
      b.className = 'me-item';
      b.dataset.act = 'v8-whats-new';
      b.innerHTML = icon('history', 15) + '<span class="grow">Version ' + esc(v.version) + ' · build ' + esc(v.build) + '<br/><span class="tiny muted">What’s new</span></span>';
      list.appendChild(b);
      var g = document.createElement('button');
      g.className = 'me-item';
      g.dataset.act = 'v8-open-guide';
      g.innerHTML = icon('help', 15) + '<span class="grow">Guide · গাইড<br/><span class="tiny muted">How everything works</span></span>';
      list.appendChild(g);
    }
    return r;
  };

  // Bulk bar: show Move / Delete forever when they apply.
  var _bulk = renderBulkBar;
  renderBulkBar = function () {
    var r = _bulk.apply(this, arguments);
    var mv = $('#bulkMove'), pg = $('#bulkPurge');
    if (mv) mv.hidden = !v8CanMove();
    if (pg) pg.hidden = !canPurgeLeads();
    return r;
  };

  // After each sync: refresh the backend check (the version comes with it).
  var _pull = pullFromServer;
  pullFromServer = function () {
    return _pull.apply(this, arguments).then(function (ok) { v8CheckBackend(); return ok; });
  };
})();

PAGE_RENDERERS.guide = renderGuide;

Object.assign(ACTIONS, {
  'v8-purge-lead': function (el) { v8AskPurge([el.dataset.id], el.dataset.any === '1'); },
  'v8-empty-archive': function () {
    var n = State.leads.filter(function (l) { return l.status === 'deleted'; }).length;
    v8ConfirmTyped({
      title: 'Empty the archive?',
      html: '<b>' + n + ' archived lead' + (n === 1 ? '' : 's') + '</b> and everything filed under them are deleted for good. Won and lost leads that were not archived stay.',
      word: 'DELETE',
      ok: 'Empty archive',
      onOk: function (x, done) { v8Purge([], { all: true }).then(function (ok) { done(ok !== false); }); }
    });
  },
  'v8-move-lead': function (el) { v8OpenMove([el.dataset.id]); },
  'v8-delete-user': function (el) { v8AskDeleteUser(el.dataset.value); },
  'v8-delete-ws': function (el) { v8AskDeleteWs(el.dataset.id); },
  'v8-photo-pick': function () { var f = $('#v8PhotoFile'); if (f) f.click(); },
  'v8-photo-remove': function () { v8SavePhoto(''); },
  'v8-help': function (el) { v8CloseTip(); v8OpenHelp(el.dataset.page || State.ui.page); },
  'v8-open-guide': function () { closeModal(); v8CloseTip(); switchPage('guide'); },
  'v8-go-page': function (el) { switchPage(el.dataset.value); },
  'v8-lang': function (el) {
    v8SetLang(el.dataset.value);
    var w = el.dataset.where;
    if (w === 'help') v8OpenHelp(V8.helpPage);
    else if (w === 'news') v8WhatsNew();
    else if (w === 'tip') { var page = State.ui.page; delete V8.seenTips[v8PageKey(page)]; v8MaybeTip(page); }
    if (State.ui.page === 'guide') renderGuide();
  },
  'v8-ask': function (el) { v8Ask(el.dataset.where); },
  'v8-tip-close': function () { v8CloseTip(); },
  'v8-tips-off': function () {
    V8.tipsOff = true;
    try { localStorage.setItem('ev8_tips_off', '1'); } catch (e) {}
    v8CloseTip();
    toast(V8.lang === 'bn' ? 'Tip বন্ধ। যেকোনো সময় ? চাপলে help পাবেন।' : 'Tips off. The ? button still has help for every page.');
  },
  'v8-tips-reset': function () {
    V8.tipsOff = false; V8.seenTips = {};
    try { localStorage.removeItem('ev8_tips_off'); localStorage.removeItem('ev8_tips_seen'); } catch (e) {}
    toast(V8.lang === 'bn' ? 'এখন থেকে প্রতিটা page-এ আবার tip দেখাবে' : 'Tips will show again on each page', 'good');
  },
  'v8-whats-new': function () { v8WhatsNew(); },
  'v8-reload': function () { location.reload(); },
  'v8-banner-close': function (el) { v8Banner(el.dataset.value, ''); }
});

/* ─── static wiring (the DOM is ready: scripts sit at the end of <body>) ─── */
(function wireV8() {
  var help = $('#btnHelp');
  if (help) help.addEventListener('click', function () { v8CloseTip(); v8OpenHelp(State.ui.page); });
  var ver = $('#navVersion');
  if (ver) ver.addEventListener('click', function () { v8WhatsNew(); });
  var mv = $('#bulkMove');
  if (mv) mv.addEventListener('click', function () { var ids = selectedIds(); if (ids.length) v8OpenMove(ids); });
  var pg = $('#bulkPurge');
  if (pg) pg.addEventListener('click', function () { var ids = selectedIds(); if (ids.length) v8AskPurge(ids, true); });

  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?' && !$('#modal').classList.contains('show') && !document.body.classList.contains('gated')) {
      e.preventDefault(); v8CloseTip(); v8OpenHelp(State.ui.page);
    }
  });

  v8RenderVersion();
  v8AddPageHelpButtons();

  // Once signed in: what's new (once per build) and the update check.
  var tries = 0;
  var waitIn = setInterval(function () {
    tries++;
    if (Cfg.token && !document.body.classList.contains('gated') && State.me) {
      clearInterval(waitIn);
      v8MarkWorkspace();
      v8CheckBackend();
      setTimeout(v8MaybeWhatsNew, 1800);
      setTimeout(function () { v8MaybeTip(State.ui.page); }, 2600);
    } else if (tries > 600) clearInterval(waitIn);
  }, 1000);
  v8CheckForUpdate();
  V8.updateTimer = setInterval(v8CheckForUpdate, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) v8CheckForUpdate(); });
})();

/* ═══ 8. RECENT STRIP — scroll it with the wheel, by dragging, or with ‹ › ═══ */
function v8RecentArrows() {
  var strip = $('#recentStrip'), wrap = $('#recentWrap');
  if (!strip || !wrap) return;
  var max = strip.scrollWidth - strip.clientWidth;
  var left = strip.scrollLeft > 2, right = strip.scrollLeft < max - 2;
  wrap.classList.toggle('can-left', left);
  wrap.classList.toggle('can-right', right);
  var l = $('#recentLeft'), r = $('#recentRight');
  if (l) l.hidden = !left;
  if (r) r.hidden = !right;
}

(function wireRecentStrip() {
  var strip = $('#recentStrip');
  if (!strip) return;
  function step(dir) { strip.scrollBy({ left: dir * Math.max(160, strip.clientWidth * 0.7), behavior: 'smooth' }); }
  var l = $('#recentLeft'), r = $('#recentRight');
  if (l) l.addEventListener('click', function () { step(-1); });
  if (r) r.addEventListener('click', function () { step(1); });

  // An ordinary up/down mouse wheel moves the strip sideways.
  strip.addEventListener('wheel', function (e) {
    if (strip.scrollWidth <= strip.clientWidth) return;
    var d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (!d) return;
    e.preventDefault();
    strip.style.scrollBehavior = 'auto';
    strip.scrollLeft += d;
    strip.style.scrollBehavior = '';
  }, { passive: false });

  // Click and drag, like a phone. A drag never opens the lead under the mouse.
  var down = false, moved = false, startX = 0, startLeft = 0;
  strip.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = false; startX = e.clientX; startLeft = strip.scrollLeft;
  });
  window.addEventListener('pointermove', function (e) {
    if (!down) return;
    var dx = e.clientX - startX;
    if (!moved && Math.abs(dx) < 5) return;
    moved = true;
    strip.classList.add('dragging');
    strip.scrollLeft = startLeft - dx;
  });
  window.addEventListener('pointerup', function () {
    if (!down) return;
    down = false;
    strip.classList.remove('dragging');
    if (moved) setTimeout(function () { moved = false; }, 0);
  });
  strip.addEventListener('click', function (e) {
    if (moved) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  strip.addEventListener('scroll', v8RecentArrows, { passive: true });
  window.addEventListener('resize', debounce(v8RecentArrows, 150));
  v8RecentArrows();
})();
