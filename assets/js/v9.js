/* ═══════════════════════════════════════════════════════════════════════════
   v9.js — loaded last. Adds, without taking anything away:

     1. Layout: the page sits on the left; the right side holds the
        Quran & Hadith panel (a drawer on smaller screens)
     2. Quran & Hadith: rotating ayah and hadith from established sources,
        Bangla first, English and Arabic a tap away, tafsir, full history
     3. Notification centre (the bell): problems, meetings, follow-ups,
        access requests, ayat — all kept, all searchable
     4. Lead details: compact tiles, quick actions at the top, and nothing
        you type is ever lost again (drafts survive syncs and closing)
     5. Calendar: each account connects its own Google Calendar
     6. Meeting reminders on Telegram with an AI brief (settings + test)
     7. API & integrations: webhooks for n8n / Make / Zapier, how-to for the
        Chrome extension, and the admin decides who may use them
     8. Trash: deleted meetings, notes, tasks, documents and AI chats —
        restore or delete for good; empty an account (admin)
     9. Speed: the admin console opens instantly from its last copy
    10. Quick navigation: g + a letter, and more in Ctrl+K
   ═══════════════════════════════════════════════════════════════════════════ */

var V9 = { drawerPending: false, trash: null, trashTab: 'meeting', hooks: null, calStatus: null };

function v9Get(key, fallback) { try { var v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
function v9Set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
function v9Del(key) { try { localStorage.removeItem(key); } catch (e) {} }
function v9Who() { return (Cfg && Cfg.who) || 'anon'; }
var BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function bnNum(n) { return String(n).replace(/\d/g, function (d) { return BN_DIGITS[d]; }); }
function v9Ago(iso) { try { return Fmt.ago(iso); } catch (e) { return ''; } }
function v9Fetch(url, ms) {
  var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 15000);
  return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }, function (e) { clearTimeout(t); throw e; });
}
function v9Pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function v9Weighted(map) {
  var keys = Object.keys(map).filter(function (k) { return map[k] > 0; });
  var total = keys.reduce(function (s, k) { return s + map[k]; }, 0);
  var r = Math.random() * total;
  for (var i = 0; i < keys.length; i++) { r -= map[keys[i]]; if (r <= 0) return keys[i]; }
  return keys[keys.length - 1];
}
function v9Canon(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

/* ═══ 3. NOTIFICATION CENTRE ═══════════════════════════════════════════════ */
var Notif = { list: null, tab: 'all', open: false };

function notifKey() { return 'ev9_notif_' + v9Who(); }
function notifLoad() { if (!Notif.list) Notif.list = v9Get(notifKey(), []) || []; return Notif.list; }
function notifSave() { v9Set(notifKey(), (Notif.list || []).slice(0, 400)); }

/** kind: alert | meeting | followup | access | system | deen */
function notify(kind, title, body, act, opts) {
  opts = opts || {};
  notifLoad();
  if (opts.once) {
    var seen = v9Get('ev9_notif_once_' + v9Who(), {}) || {};
    if (seen[opts.once]) return null;
    seen[opts.once] = Date.now();
    var keys = Object.keys(seen);
    if (keys.length > 500) keys.sort(function (a, b) { return seen[a] - seen[b]; }).slice(0, keys.length - 400).forEach(function (k) { delete seen[k]; });
    v9Set('ev9_notif_once_' + v9Who(), seen);
  }
  var first = Notif.list[0];
  if (first && first.title === title && first.body === (body || '') && Date.now() - Date.parse(first.at) < 15000) return first;
  var n = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date().toISOString(),
            kind: kind || 'system', title: String(title || ''), body: String(body || ''), act: act || null, read: !!opts.quiet, quiet: !!opts.quiet };
  Notif.list.unshift(n);
  notifSave();
  notifBadge();
  if (Notif.open) notifRender();
  if (opts.desktop && !document.hasFocus()) notifDesktop(n);
  return n;
}

function notifDesktop(n) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var d = new Notification(n.title, { body: n.body, icon: 'assets/img/apple-touch-icon.png', tag: n.id });
    d.onclick = function () { window.focus(); notifRun(n); d.close(); };
  } catch (e) {}
}

function notifUnread() { return notifLoad().filter(function (n) { return !n.read; }).length; }

function notifBadge() {
  var b = $('#bellBadge');
  if (!b) return;
  var c = notifUnread();
  b.textContent = c > 99 ? '99+' : String(c);
  b.hidden = !c;
  var mb = $('#mnb-notif'); if (mb) { mb.textContent = c ? String(c) : ''; mb.style.display = c ? '' : 'none'; }
}

var NOTIF_KINDS = {
  alert: { label: 'সতর্কতা', icon: 'alert', cls: 'n-alert' },
  meeting: { label: 'মিটিং', icon: 'meetings', cls: 'n-meeting' },
  followup: { label: 'Follow-up', icon: 'followup', cls: 'n-follow' },
  access: { label: 'Access', icon: 'shield', cls: 'n-access' },
  system: { label: 'সিস্টেম', icon: 'sync', cls: 'n-system' },
  deen: { label: 'আয়াত ও হাদিস', icon: 'book', cls: 'n-deen' }
};

function notifRender() {
  var pop = $('#notifPop');
  if (!pop) return;
  var list = notifLoad();
  var tabs = [['all', 'সব'], ['alert', 'সতর্কতা'], ['meeting', 'মিটিং'], ['work', 'কাজ'], ['deen', 'আয়াত ও হাদিস']];
  var show = list.filter(function (n) {
    if (Notif.tab === 'all') return n.kind !== 'deen';
    if (Notif.tab === 'work') return n.kind === 'followup' || n.kind === 'access' || n.kind === 'system';
    return n.kind === Notif.tab;
  });
  var perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  pop.innerHTML =
    '<div class="np-head"><b>Notifications</b><span class="grow"></span>' +
      '<button class="btn btn-sm btn-ghost" data-act="v9-notif-read">সব পড়া</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="v9-notif-clear" title="Clear this list">মুছুন</button>' +
      '<button class="v8-x np-x" data-act="v9-notif-close" title="Close">✕</button></div>' +
    '<div class="np-tabs">' + tabs.map(function (t) {
      var c = t[0] === 'all' ? list.filter(function (n) { return !n.read && n.kind !== 'deen'; }).length
        : list.filter(function (n) { return !n.read && (t[0] === 'work' ? /followup|access|system/.test(n.kind) : n.kind === t[0]); }).length;
      return '<button class="' + (Notif.tab === t[0] ? 'on' : '') + '" data-act="v9-notif-tab" data-value="' + t[0] + '">' + esc(t[1]) + (c ? ' <i>' + c + '</i>' : '') + '</button>';
    }).join('') + '</div>' +
    '<div class="np-list">' + (show.length ? show.slice(0, 150).map(function (n) {
      var k = NOTIF_KINDS[n.kind] || NOTIF_KINDS.system;
      return '<div class="np-item ' + k.cls + (n.read ? '' : ' unread') + '" data-act="v9-notif-open" data-id="' + esc(n.id) + '">' +
        '<span class="np-ico">' + icon(k.icon, 14) + '</span>' +
        '<span class="grow"><span class="np-title">' + esc(n.title) + '</span>' +
        (n.body ? '<span class="np-body">' + esc(n.body) + '</span>' : '') +
        '<span class="np-when">' + esc(v9Ago(n.at)) + ' · ' + esc(k.label) + '</span></span></div>';
    }).join('') : '<div class="np-empty">' + icon('bell', 22) + '<div>এখানে কিছু নেই</div></div>') + '</div>' +
    '<div class="np-foot">' +
      (Notif.tab === 'deen' ? '<button class="btn btn-sm" data-act="v9-deen-history">' + icon('history', 12) + ' আয়াত ও হাদিসের পুরো ইতিহাস</button>' : '') +
      '<button class="btn btn-sm btn-ghost np-rail" data-act="v9-rail-open">' + icon('book', 12) + ' আজকের আয়াত ও হাদিস</button>' +
      (perm === 'default' ? '<button class="btn btn-sm btn-ghost" data-act="v9-notif-desktop">' + icon('bell', 12) + ' Desktop-এও দেখাও</button>' : '') +
    '</div>';
}

function notifToggle(force) {
  var pop = $('#notifPop');
  if (!pop) return;
  Notif.open = force !== undefined ? force : !Notif.open;
  pop.hidden = !Notif.open;
  document.body.classList.toggle('notif-open', Notif.open);
  if (Notif.open) notifRender();
}

function notifRun(n) {
  if (!n) return;
  n.read = true; notifSave(); notifBadge();
  var a = n.act || {};
  notifToggle(false);
  if (a.type === 'lead' && getLead(a.value)) openDetail(a.value);
  else if (a.type === 'page') switchPage(a.value);
  else if (a.type === 'meeting') { switchPage('meetings'); if (typeof openMeetingForm === 'function' && getMeeting && getMeeting(a.value)) openMeetingForm(a.value); }
  else if (a.type === 'deen') deenOpenHistory(a.value);
  else if (a.type === 'url') window.open(a.value, '_blank', 'noopener');
  else if (a.type === 'admin') { if (ACTIONS['go-admin']) ACTIONS['go-admin']({ dataset: { value: a.value || 'people' } }); }
}

/* Everything that already reports a problem now also lands in the bell. */
(function hookNotifSources() {
  var _toast = toast;
  toast = function (message, kind, ms) {
    var r = _toast.apply(this, arguments);
    if (kind === 'err' || kind === 'warn') notify('alert', String(message || ''), '', null);
    return r;
  };
  if (typeof v8Banner === 'function') {
    var _banner = v8Banner;
    v8Banner = function (id, html, kind) {
      var r = _banner.apply(this, arguments);
      if (html) {
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        var text = v9Canon(tmp.textContent).replace(/✕/g, '');
        notify('system', text.slice(0, 120), '', id === 'v8NewVersion' ? { type: 'reload' } : null, { once: id + ':' + text.slice(0, 80) });
      }
      return r;
    };
  }
})();

/** Meetings soon, follow-ups due, people waiting — checked every minute. */
function notifWatch() {
  if (!Cfg.token || !State.me) return;
  var now = Date.now();
  var tz = (State.ws && State.ws.tz) || 'Asia/Dhaka';
  (State.meetings || []).forEach(function (m) {
    if (m.status !== 'upcoming' || !m.date || !m.time) return;
    var start = 0;
    try { start = typeof zonedToUtc === 'function' ? zonedToUtc(m.date, m.time, tz).getTime() : Date.parse(m.date + 'T' + m.time); } catch (e) {}
    if (!start) return;
    var mins = Math.round((start - now) / 60000);
    var lead = m.leadId ? getLead(m.leadId) : null;
    [60, 10].forEach(function (b) {
      if (mins <= b && mins > b - 6 && mins >= 0) {
        notify('meeting', (mins <= 1 ? 'মিটিং এখনই' : mins + ' মিনিট পর মিটিং') + ' — ' + (m.title || 'Meeting'),
          (lead ? lead.name + ' · ' : '') + m.time + (m.location ? ' · ' + m.location : ''),
          lead ? { type: 'lead', value: lead.id } : { type: 'meeting', value: m.id },
          { once: 'm:' + (Cfg.ws || 'main') + ':' + m.id + ':' + m.date + m.time + ':' + b, desktop: true });
      }
    });
  });
  var today = Dates.today();
  var due = (State.leads || []).filter(function (l) { return l.status !== 'deleted' && l.status !== 'merged' && l.followup && l.followup <= today && !isClosed(l); });
  if (due.length) {
    notify('followup', due.length + 'টা follow-up আজ বা আগের', due.slice(0, 4).map(function (l) { return l.name; }).join(', ') + (due.length > 4 ? '…' : ''),
      { type: 'page', value: 'followups' }, { once: 'f:' + (Cfg.ws || 'main') + ':' + today });
  }
  if (isAdminUser() && State.pendingUsers) {
    notify('access', State.pendingUsers + ' জন access চাইছেন', 'Admin → People থেকে approve করুন', { type: 'admin', value: 'people' },
      { once: 'p:' + today + ':' + State.pendingUsers });
  }
}

/* ═══ 2. QURAN & HADITH ════════════════════════════════════════════════════ */
var Deen = { item: { ayah: null, hadith: null }, view: { ayah: 'bn', hadith: 'bn' }, nextAt: 0, map: null, busy: {} };
var DEEN_DEFAULT = { interval: 10, ayahThemes: {}, hadithThemes: {}, books: {} };

function deenCfg() {
  var c = Object.assign({}, DEEN_DEFAULT, v9Get('ev9_deen_cfg', {}) || {});
  ['ayahThemes', 'hadithThemes', 'books'].forEach(function (k) { c[k] = c[k] || {}; });
  return c;
}
function deenHist() { return v9Get('ev9_deen_hist', []) || []; }
function deenHistSave(list) { v9Set('ev9_deen_hist', list.slice(0, 700)); }

function deenRecentRefs() {
  var map = {};
  deenHist().slice(0, 80).forEach(function (h) { map[h.t + ':' + h.ref] = true; });
  return map;
}

function deenAyahWeights() {
  var c = deenCfg(), out = {};
  Object.keys(DEEN.ayahThemes).forEach(function (k) { if (c.ayahThemes[k] !== false) out[k] = DEEN.ayahThemes[k].weight; });
  return Object.keys(out).length ? out : { jihad: 1 };
}

function deenPickAyahRef() {
  var theme = v9Weighted(deenAyahWeights());
  var recent = deenRecentRefs();
  var refs = DEEN.ayahThemes[theme].refs.filter(function (r) { return !recent['ayah:' + r]; });
  if (!refs.length) refs = DEEN.ayahThemes[theme].refs;
  return { ref: v9Pick(refs), theme: theme };
}

function deenLoadAyah(ref, theme) {
  return v9Fetch('https://api.alquran.cloud/v1/ayah/' + ref + '/editions/quran-uthmani,bn.bengali,en.sahih').then(function (j) {
    var d = (j && j.data) || [];
    if (d.length < 2) throw new Error('No data');
    var ar = d[0], bn = d[1], en = d[2] || {};
    var s = ar.surah || {};
    return {
      t: 'ayah', ref: ref, theme: theme || '', surah: s.number, ayah: ar.numberInSurah, juz: ar.juz,
      surahBn: DEEN.surahBn[(s.number || 1) - 1] || s.englishName, surahEn: s.englishName || '', surahAr: s.name || '',
      type: s.revelationType === 'Medinan' ? 'মাদানী' : 'মাক্কী',
      ar: ar.text || '', bn: bn.text || '', en: en.text || '',
      source: 'অনুবাদ: মুহিউদ্দীন খান · English: Saheeh International'
    };
  });
}

/* Which hadith chapters belong to which topic — read from the source's own
   chapter titles once a month. */
function deenHadithMap() {
  var cached = v9Get('ev9_hmap_v1', null);
  if (cached && cached.at && Date.now() - cached.at < 30 * 86400000) return Promise.resolve(cached.map);
  return v9Fetch('https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/info.json', 25000).then(function (info) {
    var map = {};
    Object.keys(DEEN.hadithThemes).forEach(function (t) { map[t] = []; });
    Object.keys(DEEN.books).forEach(function (book) {
      var meta = info && info[book] ? (info[book].metadata || info[book]) : null;
      var secs = meta && meta.sections ? meta.sections : {};
      Object.keys(secs).forEach(function (num) {
        var name = String(secs[num] || '');
        if (!name || num === '0') return;
        for (var t in DEEN.hadithThemes) {
          if (DEEN.hadithThemes[t].match.test(name)) { map[t].push([book, Number(num)]); break; }
        }
      });
    });
    var ok = Object.keys(map).some(function (t) { return map[t].length; });
    if (!ok) throw new Error('empty map');
    v9Set('ev9_hmap_v1', { at: Date.now(), map: map });
    return map;
  }).catch(function () {
    var map = {};
    Object.keys(DEEN.hadithThemes).forEach(function (t) {
      map[t] = [];
      var fb = DEEN.hadithThemes[t].fallback;
      Object.keys(fb).forEach(function (book) { fb[book].forEach(function (n) { map[t].push([book, n]); }); });
    });
    return map;
  });
}

function deenSection(edition, book, num) {
  var base = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/' + edition + '-' + book + '/sections/' + num;
  return v9Fetch(base + '.min.json', 20000).catch(function () { return v9Fetch(base + '.json', 20000); });
}

function deenBnShare(text) {
  var letters = String(text || '').replace(/[\s\d.,:;!?'"()\-–—…।‘’“”]/g, '');
  if (!letters.length) return 0;
  var bn = (letters.match(/[ঀ-৿]/g) || []).length;
  return bn / letters.length;
}

function deenLoadHadith(tries) {
  tries = tries || 0;
  var c = deenCfg();
  return deenHadithMap().then(function (map) {
    var weights = {};
    Object.keys(DEEN.hadithThemes).forEach(function (t) {
      if (c.hadithThemes[t] !== false && map[t] && map[t].length) weights[t] = DEEN.hadithThemes[t].weight;
    });
    var theme = v9Weighted(Object.keys(weights).length ? weights : { jihad: 1 });
    var books = {};
    Object.keys(DEEN.books).forEach(function (b) { if (c.books[b] !== false) books[b] = DEEN.books[b].weight; });
    var options = (map[theme] || []).filter(function (x) { return books[x[0]]; });
    if (!options.length) options = map[theme] || [];
    var bw = {};
    options.forEach(function (x) { bw[x[0]] = books[x[0]] || 1; });
    var book = v9Weighted(bw);
    var pick = v9Pick(options.filter(function (x) { return x[0] === book; }));
    return deenSection('ben', pick[0], pick[1]).then(function (j) {
      var recent = deenRecentRefs();
      var list = (j.hadiths || []).filter(function (h) {
        var t = String(h.text || '');
        return t.length > 70 && t.length < 1600 && deenBnShare(t) > 0.55 && !recent['hadith:' + pick[0] + ':' + h.hadithnumber];
      });
      if (!list.length) throw new Error('nothing usable in this chapter');
      var h = v9Pick(list);
      var sec = (j.metadata && j.metadata.section) || {};
      return {
        t: 'hadith', ref: pick[0] + ':' + h.hadithnumber, book: pick[0], num: h.hadithnumber, section: pick[1],
        sectionName: sec[pick[1]] || sec[String(pick[1])] || '', theme: theme,
        bn: String(h.text || '').trim(), grades: h.grades || [], reference: h.reference || null
      };
    });
  }).catch(function (e) {
    if (tries < 2) return deenLoadHadith(tries + 1);
    throw e;
  });
}

function deenRemember(item) {
  var list = deenHist();
  list.unshift({
    id: 'd' + Date.now().toString(36), t: item.t, ref: item.ref, at: new Date().toISOString(), theme: item.theme || '',
    title: item.t === 'ayah' ? 'সূরা ' + item.surahBn + ' (' + bnNum(item.surah) + ':' + bnNum(item.ayah) + ')'
      : (DEEN.books[item.book] || {}).bn + ' · হাদিস ' + bnNum(item.num),
    bn: String(item.bn || '').slice(0, 900), star: false
  });
  deenHistSave(list);
  notify('deen', list[0].title, String(item.bn || '').slice(0, 140), { type: 'deen', value: list[0].id }, { quiet: true });
  return list[0];
}

function deenNext(which) {
  var jobs = [];
  if (which !== 'hadith' && !Deen.busy.ayah) {
    Deen.busy.ayah = true;
    var p = deenPickAyahRef();
    jobs.push(deenLoadAyah(p.ref, p.theme).then(function (it) {
      Deen.item.ayah = it; Deen.view.ayah = 'bn'; it.histId = deenRemember(it).id; v9Set('ev9_deen_last_ayah', it);
    }).catch(function () {
      Deen.item.ayah = Deen.item.ayah || v9Get('ev9_deen_last_ayah', null);
      Deen.offline = true;
    }).then(function () { Deen.busy.ayah = false; deenRender(); }));
  }
  if (which !== 'ayah' && !Deen.busy.hadith) {
    Deen.busy.hadith = true;
    jobs.push(deenLoadHadith().then(function (it) {
      Deen.item.hadith = it; Deen.view.hadith = 'bn'; it.histId = deenRemember(it).id; v9Set('ev9_deen_last_hadith', it);
    }).catch(function () {
      Deen.item.hadith = Deen.item.hadith || v9Get('ev9_deen_last_hadith', null);
      Deen.offline = true;
    }).then(function () { Deen.busy.hadith = false; deenRender(); }));
  }
  Deen.nextAt = Date.now() + deenCfg().interval * 60000;
  deenRender();
  return Promise.all(jobs);
}

function deenAyahHtml(it) {
  if (!it) return '<div class="dn-load">' + (Deen.busy.ayah ? '<div class="typing"><i></i><i></i><i></i></div>' : 'আয়াত লোড হয়নি — ইন্টারনেট দেখে ↻ চাপুন') + '</div>';
  var v = Deen.view.ayah;
  var text = v === 'en' ? it.en : it.bn;
  return '<div class="dn-ar" dir="rtl" lang="ar">' + esc(it.ar) + '</div>' +
    '<div class="dn-text' + (v === 'en' ? ' en' : '') + '"' + (v === 'en' ? ' lang="en"' : ' lang="bn"') + '>' + esc(text) + '</div>' +
    '<div class="dn-ref"><b>সূরা ' + esc(it.surahBn) + '</b> <span dir="rtl">' + esc(it.surahAr) + '</span><br/>' +
      esc(bnNum(it.surah) + ':' + bnNum(it.ayah)) + ' · ' + esc(it.type) + ' · পারা ' + esc(bnNum(it.juz || '')) +
      (it.theme && DEEN.ayahThemes[it.theme] ? ' · <span class="dn-tag">' + esc(DEEN.ayahThemes[it.theme].label) + '</span>' : '') + '</div>' +
    '<div class="dn-tools">' +
      '<div class="v8-lang dn-lang"><button class="' + (v === 'bn' ? 'on' : '') + '" data-act="v9-dn-view" data-k="ayah" data-value="bn">বাংলা</button>' +
      '<button class="' + (v === 'en' ? 'on' : '') + '" data-act="v9-dn-view" data-k="ayah" data-value="en">English</button></div>' +
      '<span class="grow"></span>' +
      '<button class="dn-ico" data-act="v9-dn-copy" data-k="ayah" title="Copy">' + icon('copy', 13) + '</button>' +
      '<button class="dn-ico' + (deenStarred(it.histId) ? ' on' : '') + '" data-act="v9-dn-star" data-k="ayah" title="Save">' + icon(deenStarred(it.histId) ? 'star' : 'star-o', 13) + '</button>' +
    '</div>' +
    '<details class="dn-more" data-k="ayah"><summary>' + icon('chev', 12) + ' তাফসীর (ব্যাখ্যা) দেখুন</summary>' +
      '<div class="dn-tafsir-pick"><select class="select select-inline" id="dnTafsirPick">' + DEEN.tafsirs.map(function (t) {
        return '<option value="' + t.id + '"' + (String(t.id) === String(v9Get('ev9_tafsir', 165)) ? ' selected' : '') + '>' + esc(t.name) + '</option>';
      }).join('') + '</select></div><div class="dn-tafsir" id="dnTafsir"></div></details>';
}

function deenHadithHtml(it) {
  if (!it) return '<div class="dn-load">' + (Deen.busy.hadith ? '<div class="typing"><i></i><i></i><i></i></div>' : 'হাদিস লোড হয়নি — ইন্টারনেট দেখে ↻ চাপুন') + '</div>';
  var v = Deen.view.hadith;
  var text = v === 'en' ? (it.en || '…') : v === 'ar' ? (it.ar || '…') : it.bn;
  var book = DEEN.books[it.book] || {};
  var grade = (it.gradesEn || it.grades || []).filter(function (g) { return g && g.grade; })[0];
  return '<div class="dn-text hadith' + (v === 'en' ? ' en' : '') + (v === 'ar' ? ' ar' : '') + '"' + (v === 'ar' ? ' dir="rtl" lang="ar"' : '') + '>' + esc(text) + '</div>' +
    '<div class="dn-ref"><b>' + esc(book.bn || it.book) + '</b> · হাদিস নং ' + esc(bnNum(it.num)) +
      (it.reference && it.reference.book ? ' <span class="muted">(খণ্ড/অধ্যায় ' + esc(bnNum(it.reference.book)) + ', ' + esc(bnNum(it.reference.hadith)) + ')</span>' : '') +
      '<br/>অধ্যায়: ' + esc(it.sectionName || ('#' + it.section)) +
      (grade ? ' · <span class="dn-tag">' + esc(grade.grade) + (grade.name ? ' — ' + esc(grade.name) : '') + '</span>' : '') +
      (it.theme && DEEN.hadithThemes[it.theme] ? ' · <span class="dn-tag">' + esc(DEEN.hadithThemes[it.theme].label) + '</span>' : '') + '</div>' +
    '<div class="dn-tools">' +
      '<div class="v8-lang dn-lang"><button class="' + (v === 'bn' ? 'on' : '') + '" data-act="v9-dn-view" data-k="hadith" data-value="bn">বাংলা</button>' +
      '<button class="' + (v === 'en' ? 'on' : '') + '" data-act="v9-dn-view" data-k="hadith" data-value="en">English</button>' +
      '<button class="' + (v === 'ar' ? 'on' : '') + '" data-act="v9-dn-view" data-k="hadith" data-value="ar">عربي</button></div>' +
      '<span class="grow"></span>' +
      '<button class="dn-ico" data-act="v9-dn-copy" data-k="hadith" title="Copy">' + icon('copy', 13) + '</button>' +
      '<button class="dn-ico' + (deenStarred(it.histId) ? ' on' : '') + '" data-act="v9-dn-star" data-k="hadith" title="Save">' + icon(deenStarred(it.histId) ? 'star' : 'star-o', 13) + '</button>' +
    '</div>';
}

function deenStarred(id) { return !!id && deenHist().some(function (h) { return h.id === id && h.star; }); }

function deenNextMeetingHtml() {
  var tz = (State.ws && State.ws.tz) || 'Asia/Dhaka';
  var now = Date.now(), best = null;
  (State.meetings || []).forEach(function (m) {
    if (m.status !== 'upcoming' || !m.date || !m.time) return;
    var t = 0; try { t = zonedToUtc(m.date, m.time, tz).getTime(); } catch (e) {}
    if (t > now - 30 * 60000 && (!best || t < best.t)) best = { t: t, m: m };
  });
  if (!best) return '';
  var lead = best.m.leadId ? getLead(best.m.leadId) : null;
  var mins = Math.round((best.t - now) / 60000);
  var when = mins < 0 ? 'চলছে' : mins < 60 ? bnNum(mins) + ' মিনিট পর' : mins < 1440 ? bnNum(Math.floor(mins / 60)) + ' ঘণ্টা পর' : esc(Fmt.date(best.m.date));
  return '<div class="dn-card dn-meet" data-act="' + (lead ? 'open-lead' : 'v9-go') + '" data-id="' + esc(lead ? lead.id : '') + '" data-value="meetings">' +
    '<div class="dn-head">' + icon('meetings', 14) + '<b>পরের মিটিং</b><span class="grow"></span><span class="chip ' + (mins < 60 ? 'chip-warm' : 'chip-ghost') + '">' + when + '</span></div>' +
    '<div class="dn-meet-body"><b>' + esc(best.m.time) + '</b> — ' + esc(best.m.title || 'Meeting') + (lead ? '<br/><span class="muted">' + esc(lead.name) + '</span>' : '') + '</div></div>';
}

function deenRender() {
  var rail = $('#deenRail');
  if (!rail) return;
  var left = Math.max(0, Deen.nextAt - Date.now());
  var mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  rail.innerHTML =
    '<div class="dn-top"><span class="dn-bism" dir="rtl" lang="ar">بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</span>' +
      '<span class="grow"></span>' +
      '<button class="dn-ico" data-act="v9-deen-history" title="ইতিহাস — আগের সব আয়াত ও হাদিস">' + icon('history', 14) + '</button>' +
      '<button class="dn-ico" data-act="v9-deen-settings" title="Settings">' + icon('settings', 14) + '</button>' +
      '<button class="dn-ico dn-close" data-act="v9-rail-close" title="Hide">✕</button></div>' +
    '<div class="dn-card dn-ayah"><div class="dn-head">' + icon('book', 14) + '<b>আজকের আয়াত</b><span class="grow"></span>' +
      '<button class="dn-ico" data-act="v9-dn-next" data-k="ayah" title="নতুন আয়াত">' + icon('sync', 13) + '</button></div>' +
      deenAyahHtml(Deen.item.ayah) + '</div>' +
    '<div class="dn-card dn-hadith"><div class="dn-head">' + icon('docs', 14) + '<b>আজকের হাদিস</b><span class="grow"></span>' +
      '<button class="dn-ico" data-act="v9-dn-next" data-k="hadith" title="নতুন হাদিস">' + icon('sync', 13) + '</button></div>' +
      deenHadithHtml(Deen.item.hadith) + '</div>' +
    deenNextMeetingHtml() +
    '<div class="dn-foot"><span>নতুন আয়াত ও হাদিস <b id="dnCountdown">' + bnNum(mm) + ':' + bnNum(('0' + ss).slice(-2)) + '</b> পর</span>' +
      (Deen.offline ? ' · <span class="muted">অফলাইন — আগেরটা দেখাচ্ছে</span>' : '') +
      '<br/><span class="muted">উৎস: alquran.cloud · quran.com · hadith-api (বুখারী, মুসলিম, তিরমিজি)</span></div>';
  var det = rail.querySelector('details.dn-more');
  if (det) det.addEventListener('toggle', function () { if (det.open) deenTafsir(); });
  var pick = $('#dnTafsirPick');
  if (pick) pick.addEventListener('change', function () { v9Set('ev9_tafsir', Number(pick.value)); deenTafsir(); });
}

function deenTafsir() {
  var box = $('#dnTafsir'), it = Deen.item.ayah;
  if (!box || !it) return;
  var id = v9Get('ev9_tafsir', 165);
  box.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';
  v9Fetch('https://api.quran.com/api/v4/tafsirs/' + id + '/by_ayah/' + it.ref, 20000).then(function (j) {
    var html = (j && j.tafsir && j.tafsir.text) || '';
    var doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    var parts = [];
    doc.body.querySelectorAll('p, h2, h3, h4, li').forEach(function (n) { var t = v9Canon(n.textContent); if (t) parts.push(t); });
    if (!parts.length) { var t = v9Canon(doc.body.textContent); if (t) parts = t.split(/\n{2,}/); }
    box.innerHTML = parts.length ? parts.slice(0, 60).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      '<p class="muted tiny">উৎস: quran.com</p>'
      : '<p class="muted">এই আয়াতের তাফসীর এখানে নেই।</p>';
  }).catch(function () {
    box.innerHTML = '<p class="muted">তাফসীর লোড হয়নি। <a href="https://quran.com/' + esc(it.ref) + '/tafsirs/bn-tafsir-ahsanul-bayaan" target="_blank" rel="noopener">quran.com-এ দেখুন ↗</a></p>';
  });
}

function deenHadithLang(lang) {
  var it = Deen.item.hadith;
  if (!it || lang === 'bn' || it[lang]) { Deen.view.hadith = lang; deenRender(); return; }
  Deen.view.hadith = lang;
  deenRender();
  deenSection(lang === 'en' ? 'eng' : 'ara', it.book, it.section).then(function (j) {
    var h = (j.hadiths || []).filter(function (x) { return Number(x.hadithnumber) === Number(it.num); })[0];
    it[lang] = h ? String(h.text || '').trim() || '—' : 'এই হাদিসের ' + (lang === 'en' ? 'English' : 'আরবি') + ' পাঠ উৎসে নেই।';
    if (lang === 'en' && h && h.grades && h.grades.length) it.gradesEn = h.grades;
    deenRender();
  }).catch(function () { it[lang] = 'লোড হয়নি — ইন্টারনেট দেখুন।'; deenRender(); });
}

function deenOpenHistory(focusId) {
  var all = deenHist();
  var st = { q: '', f: 'all' };
  function draw() {
    var q = st.q.toLowerCase();
    var list = all.filter(function (h) {
      if (st.f === 'ayah' && h.t !== 'ayah') return false;
      if (st.f === 'hadith' && h.t !== 'hadith') return false;
      if (st.f === 'star' && !h.star) return false;
      return !q || (h.title + ' ' + h.bn).toLowerCase().indexOf(q) >= 0;
    });
    var body = $('#dnHistList');
    if (!body) return;
    var lastDay = '';
    body.innerHTML = list.length ? list.slice(0, 400).map(function (h) {
      var day = String(h.at).slice(0, 10), head = '';
      if (day !== lastDay) { lastDay = day; head = '<div class="dh-day">' + esc(Fmt.date(day)) + '</div>'; }
      var time = new Date(h.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return head + '<div class="dh-item' + (h.id === focusId ? ' focus' : '') + '" id="dh_' + esc(h.id) + '">' +
        '<div class="dh-top"><span class="chip ' + (h.t === 'ayah' ? 'chip-good' : 'chip-info') + '">' + (h.t === 'ayah' ? 'আয়াত' : 'হাদিস') + '</span> <b>' + esc(h.title) + '</b>' +
        '<span class="grow"></span><span class="tiny muted">' + esc(time) + '</span>' +
        '<button class="dn-ico' + (h.star ? ' on' : '') + '" data-act="v9-dh-star" data-id="' + esc(h.id) + '">' + icon(h.star ? 'star' : 'star-o', 13) + '</button>' +
        '<button class="dn-ico" data-act="copy" data-value="' + esc(h.title + '\n' + h.bn) + '">' + icon('copy', 12) + '</button>' +
        (h.t === 'ayah' ? '<a class="dn-ico" href="https://quran.com/' + esc(h.ref) + '" target="_blank" rel="noopener" title="quran.com">↗</a>' : '') + '</div>' +
        '<div class="dh-text">' + esc(h.bn) + '</div></div>';
    }).join('') : emptyState('কিছু নেই', 'যা দেখানো হয়েছে, সব এখানে জমা থাকে।');
    if (focusId) { var el = $('#dh_' + focusId); if (el) el.scrollIntoView({ block: 'center' }); focusId = null; }
  }
  openModal({
    title: 'আয়াত ও হাদিসের ইতিহাস',
    wide: true,
    noFocus: true,
    body: '<div class="dh-bar"><input class="input" id="dnHistQ" placeholder="খুঁজুন — শব্দ, সূরা, হাদিস নম্বর…"/>' +
      '<div class="v8-lang"><button class="on" data-dh="all">সব</button><button data-dh="ayah">আয়াত</button><button data-dh="hadith">হাদিস</button><button data-dh="star">★ সংরক্ষিত</button></div></div>' +
      '<div class="tiny muted" style="margin:6px 0 10px">' + bnNum(all.length) + 'টা — কোন সময়ে কোনটা দেখানো হয়েছিল, সব এই ডিভাইসে জমা থাকে।</div>' +
      '<div id="dnHistList" class="dh-list"></div>',
    foot: '<button class="btn btn-ghost btn-sm" data-act="v9-dh-export">' + icon('download', 12) + ' Export</button><span class="grow"></span><button class="btn btn-primary" data-act="close-modal">বন্ধ</button>'
  });
  $('#dnHistQ').addEventListener('input', debounce(function () { st.q = this.value; draw(); }.bind($('#dnHistQ')), 200));
  $$('#modalBody [data-dh]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#modalBody [data-dh]').forEach(function (x) { x.classList.toggle('on', x === b); });
      st.f = b.dataset.dh; draw();
    });
  });
  draw();
}

function deenOpenSettings() {
  var c = deenCfg();
  openModal({
    title: 'আয়াত ও হাদিস — পছন্দ',
    narrow: true,
    body: '<div class="field"><label>কতক্ষণ পর পর নতুন</label><select class="select" id="dnInt">' +
        [5, 10, 15, 30, 60].map(function (n) { return '<option value="' + n + '"' + (c.interval === n ? ' selected' : '') + '>' + bnNum(n) + ' মিনিট</option>'; }).join('') + '</select>' +
        '<div class="tiny muted">প্রতিবার dashboard খুললেও নতুন একটা আসে।</div></div>' +
      '<div class="field"><label>আয়াতের বিষয়</label><div class="chip-picks">' + Object.keys(DEEN.ayahThemes).map(function (k) {
        return '<label class="pick"><input type="checkbox" class="dnA" value="' + k + '"' + (c.ayahThemes[k] === false ? '' : ' checked') + '/><span>' + esc(DEEN.ayahThemes[k].label) + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>হাদিসের বিষয়</label><div class="chip-picks">' + Object.keys(DEEN.hadithThemes).map(function (k) {
        return '<label class="pick"><input type="checkbox" class="dnH" value="' + k + '"' + (c.hadithThemes[k] === false ? '' : ' checked') + '/><span>' + esc(DEEN.hadithThemes[k].label) + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>হাদিসের কিতাব</label><div class="chip-picks">' + Object.keys(DEEN.books).map(function (k) {
        return '<label class="pick"><input type="checkbox" class="dnB" value="' + k + '"' + (c.books[k] === false ? '' : ' checked') + '/><span>' + esc(DEEN.books[k].bn) + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="tiny muted">জিহাদ, তাকওয়া আর দ্বীন মেনে চলার বিষয় বেশি আসে; বাকি সব বিষয়ও নিয়মিত আসে। লেখা সবসময় সরাসরি উৎস থেকে আসে — কিছু বানানো হয় না।</div>',
    foot: '<button class="btn" data-act="close-modal">বাতিল</button><button class="btn btn-primary" id="dnSave">সেভ</button>'
  });
  $('#dnSave').addEventListener('click', function () {
    var n = { interval: Number($('#dnInt').value) || 10, ayahThemes: {}, hadithThemes: {}, books: {} };
    $$('.dnA').forEach(function (x) { if (!x.checked) n.ayahThemes[x.value] = false; });
    $$('.dnH').forEach(function (x) { if (!x.checked) n.hadithThemes[x.value] = false; });
    $$('.dnB').forEach(function (x) { if (!x.checked) n.books[x.value] = false; });
    v9Set('ev9_deen_cfg', n);
    closeModal();
    Deen.nextAt = Date.now() + n.interval * 60000;
    toast('সেভ হয়েছে', 'good');
  });
}

function deenTick() {
  var cd = $('#dnCountdown');
  var left = Math.max(0, Deen.nextAt - Date.now());
  if (cd) cd.textContent = bnNum(Math.floor(left / 60000)) + ':' + bnNum(('0' + Math.floor((left % 60000) / 1000)).slice(-2));
  if (left <= 0 && !document.hidden && Cfg.token) deenNext();
}

/* ═══ 1. LAYOUT: rail on the right ═════════════════════════════════════════ */
function railWide() { return window.matchMedia && window.matchMedia('(min-width: 1500px)').matches; }
function railToggle() {
  if (railWide()) {
    var off = !document.body.classList.contains('rail-off');
    document.body.classList.toggle('rail-off', off);
    v9Set('ev9_rail_off', off);
  } else {
    document.body.classList.toggle('rail-open');
  }
}

/* ═══ 4. LEAD DETAILS ══════════════════════════════════════════════════════ */
function v9Tile(l, field, label, o) {
  o = o || {};
  var v = l[field];
  var disp = o.display ? o.display(v, l) : (v ? esc(v) : '');
  return '<div class="ftile' + (o.wide ? ' wide' : '') + '">' +
    '<div class="ft-label">' + esc(label) + (o.extra ? '<span class="ft-tools">' + o.extra + '</span>' : '') + '</div>' +
    '<div class="editable ft-val' + (disp ? '' : ' empty') + '" data-act="edit-field" data-id="' + esc(l.id) + '" data-field="' + esc(field) + '"' +
    ' data-type="' + esc(o.type || 'text') + '" data-label="' + esc(label) + '" tabindex="0">' +
    (disp || '<span class="ft-add">+ ' + esc(o.placeholder || 'Add') + '</span>') + '</div></div>';
}

function v9QuickBtn(act, id, ic, label, extra) {
  return '<button class="qa-btn' + (extra && extra.cls ? ' ' + extra.cls : '') + '" data-act="' + act + '" data-id="' + esc(id) + '"' + (extra && extra.attrs ? ' ' + extra.attrs : '') + ' title="' + esc(label) + '">' +
    icon(ic, 15) + '<span>' + esc(label) + '</span></button>';
}

renderDrawerOverview = function (l) {
  var stages = State.settings.stages || [];
  var currentIndex = stages.findIndex(function (s) { return s.name === l.stage; });
  var due = dueState(l);
  var host = $('#pane-overview');
  var phone = l.phone || l.wa || '';
  var quick =
    '<div class="qa-bar">' +
      (phone ? '<a class="qa-btn" href="tel:' + esc(phone) + '" data-act="stop" title="Call">' + icon('phone', 15) + '<span>Call</span></a>' : '') +
      ((l.wa || l.phone) ? v9QuickBtn('whatsapp', l.id, 'wa', 'WhatsApp') : '') +
      v9QuickBtn('compose-email', l.id, 'mail', 'Email') +
      v9QuickBtn('add-meeting-for', l.id, 'meetings', 'Meeting') +
      v9QuickBtn('v9-focus-log', l.id, 'edit', 'Log') +
      v9QuickBtn('proposal-draft', l.id, 'docs', 'Proposal') +
      v9QuickBtn('run-audit', l.id, 'search', 'Audit') +
      v9QuickBtn('lead-summary', l.id, 'ai', 'AI summary') +
      v9QuickBtn('share-lead', l.id, 'share', 'Share') +
      (typeof v8CanMove === 'function' && v8CanMove() ? v9QuickBtn('v8-move-lead', l.id, 'move', 'Move') : '') +
      (l.status === 'deleted' ? v9QuickBtn('restore-lead', l.id, 'undo', 'Restore') : v9QuickBtn('archive-lead', l.id, 'archive', 'Archive', { cls: 'warn' })) +
      (canPurgeLeads() ? v9QuickBtn('v8-purge-lead', l.id, 'trash', 'Delete', { cls: 'danger', attrs: 'data-any="1"' }) : '') +
    '</div>';

  var log =
    '<div class="qa-log"><input class="input" id="quickNote" placeholder="Log what just happened… (call, message, visit — Enter to save)" autocomplete="off"/>' +
    '<button class="btn btn-primary btn-sm" data-act="add-note" data-id="' + esc(l.id) + '">Log it</button></div>' +
    '<div class="qa-draft tiny muted" id="quickNoteState"></div>';

  var stage =
    '<div class="section"><div class="section-title">Stage<span class="tiny muted">' + esc(reasonForAttention(l)) + '</span></div>' +
    '<div class="stage-track">' + stages.map(function (s, i) {
      var cls = s.name === l.stage ? 'current' : (currentIndex >= 0 && i < currentIndex ? 'done' : '');
      return '<button class="stage-step ' + cls + '" data-act="set-stage" data-id="' + esc(l.id) + '" data-value="' + esc(s.name) + '">' +
        '<span class="chip-dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) + '</button>';
    }).join('') + '</div></div>';

  var next =
    '<div class="section"><div class="section-title">Next step<span class="row" style="gap:6px">' +
      (l.followup ? '<button class="btn btn-sm btn-primary" data-act="done-followup" data-id="' + esc(l.id) + '">Mark done</button>' : '') +
      '<button class="btn btn-sm" data-act="quick-followup" data-id="' + esc(l.id) + '">Change date</button></span></div>' +
    '<div class="ftile-grid">' +
      v9Tile(l, 'nextStep', 'What to do', { wide: true, placeholder: 'e.g. Call about the proposal' }) +
      '<div class="ftile"><div class="ft-label">When</div><div class="editable ft-val' + (l.followup ? '' : ' empty') + '" data-act="edit-field" data-id="' + esc(l.id) + '" data-field="followup" data-type="date" data-label="Follow-up date" tabindex="0">' +
        (l.followup ? esc(Fmt.date(l.followup)) + ' <span class="chip ' + (due === 'over' ? 'chip-danger' : due === 'today' ? 'chip-warm' : 'chip-ghost') + '">' +
          esc(due === 'over' ? 'overdue' : due === 'today' ? 'today' : Dates.diffDays(Dates.today(), l.followup) + 'd') + '</span>' : '<span class="ft-add">+ Pick a date</span>') + '</div></div>' +
    '</div></div>';

  var contact =
    '<div class="section"><div class="section-title">Contact</div><div class="ftile-grid">' +
      v9Tile(l, 'name', 'Business') +
      v9Tile(l, 'contact', 'Person') +
      v9Tile(l, 'phone', 'Phone', {
        display: function (v) { return v ? '<a href="tel:' + esc(v) + '" data-act="stop">' + esc(v) + '</a>' : ''; },
        extra: l.phone ? copyBtn(l.phone, 'Copy phone') : ''
      }) +
      v9Tile(l, 'wa', 'WhatsApp', {
        placeholder: 'Add WhatsApp',
        extra: (l.wa || l.phone) ? '<button class="copy-btn" data-act="whatsapp" data-id="' + esc(l.id) + '" title="Open WhatsApp">' + icon('wa', 11) + '</button>' : ''
      }) +
      v9Tile(l, 'email', 'Email', {
        placeholder: 'Add email',
        display: function (v) { return v ? '<a href="mailto:' + esc(v) + '" data-act="stop">' + esc(v) + '</a>' : ''; },
        extra: l.email ? copyBtn(l.email, 'Copy email') : ''
      }) +
      v9Tile(l, 'site', 'Website', {
        placeholder: 'Add website',
        display: function (v) { return v ? '<a href="' + esc(normalizeUrl(v)) + '" target="_blank" rel="noopener noreferrer" data-act="stop">' + esc(prettyUrl(v)) + '</a>' : ''; },
        extra: l.site ? copyBtn(normalizeUrl(l.site), 'Copy website') : ''
      }) +
    '</div></div>';

  var deal =
    '<div class="section"><div class="section-title">Deal</div><div class="ftile-grid">' +
      (canSeeMoney() ? v9Tile(l, 'value', 'Value', { type: 'number', placeholder: 'Add value', display: function (v) { return v ? esc(Fmt.money(v)) : ''; } }) : '') +
      ((State.members || []).length > 1 || l.owner
        ? '<div class="ftile"><div class="ft-label">Assigned to</div>' + (canManageWs()
            ? '<div class="editable ft-val" data-act="assign-lead" data-id="' + esc(l.id) + '" tabindex="0">' + (l.owner ? esc(memberName(l.owner)) : '<span class="ft-add">+ Assign</span>') + '</div>'
            : '<div class="ft-val">' + esc(l.owner ? memberName(l.owner) : '—') + '</div>') + '</div>'
        : '') +
      v9Tile(l, 'service', 'Service', { type: 'select', placeholder: 'Pick' }) +
      v9Tile(l, 'source', 'Source', { type: 'select', placeholder: 'Pick' }) +
      v9Tile(l, 'priority', 'Priority', { type: 'select', display: function (v) { return v ? priorityChip(v) : ''; } }) +
      '<div class="ftile wide"><div class="ft-label">Labels</div><div class="editable ft-val' + ((l.labels || []).length ? '' : ' empty') + '" data-act="edit-labels" data-id="' + esc(l.id) + '" tabindex="0">' +
        ((l.labels || []).length ? (l.labels || []).map(function (t) { return '<span class="chip chip-ghost">' + esc(t) + '</span>'; }).join(' ') : '<span class="ft-add">+ Add labels</span>') + '</div></div>' +
      (l.proposalSentAt ? '<div class="ftile"><div class="ft-label">Proposal sent</div><div class="editable ft-val" data-act="edit-field" data-id="' + esc(l.id) + '" data-field="proposalSentAt" data-type="date" data-label="Proposal sent">' +
        esc(Fmt.date(l.proposalSentAt)) + ' <span class="chip chip-ghost">' + Dates.diffDays(l.proposalSentAt, Dates.today()) + 'd ago</span></div></div>' : '') +
    '</div></div>';

  var notes =
    '<div class="section"><div class="section-title">Notes<span class="tiny muted">Bangla is fine — the AI reads it</span></div>' +
    '<div class="editable ft-notes' + (l.notes ? '' : ' empty') + '" data-act="edit-field" data-id="' + esc(l.id) + '" data-field="notes" data-type="textarea" data-label="Notes" tabindex="0">' +
      (l.notes ? esc(l.notes) : '<span class="ft-add">+ Click to write a note</span>') + '</div>' +
    '<div class="tiny muted" id="notesDraftState"></div></div>';

  var more =
    '<div class="section"><div class="section-title">More actions</div><div class="row">' +
      '<button class="btn btn-sm" data-act="share-lead" data-id="' + esc(l.id) + '">' + icon('share', 13) + ' Share</button>' +
      '<button class="btn btn-sm" data-act="add-meeting-for" data-id="' + esc(l.id) + '">' + icon('meetings', 13) + ' Schedule meeting</button>' +
      '<button class="btn btn-sm" data-act="compose-email" data-id="' + esc(l.id) + '">' + icon('mail', 13) + ' Write email</button>' +
      '<button class="btn btn-sm" data-act="run-audit" data-id="' + esc(l.id) + '">' + icon('search', 13) + ' Audit site</button>' +
      '<button class="btn btn-sm" data-act="proposal-draft" data-id="' + esc(l.id) + '">' + icon('docs', 13) + ' Proposal</button>' +
      '<button class="btn btn-sm" data-act="lead-summary" data-id="' + esc(l.id) + '">' + icon('ai', 13) + ' Where it stands</button>' +
      (typeof v8CanMove === 'function' && v8CanMove() ? '<button class="btn btn-sm" data-act="v8-move-lead" data-id="' + esc(l.id) + '">' + icon('move', 13) + ' Move / copy</button>' : '') +
      (l.status === 'deleted'
        ? '<button class="btn btn-sm" data-act="restore-lead" data-id="' + esc(l.id) + '">Restore</button>'
        : '<button class="btn btn-sm btn-danger" data-act="archive-lead" data-id="' + esc(l.id) + '">' + icon('archive', 13) + ' Archive</button>') +
      (canPurgeLeads() ? '<button class="btn btn-sm btn-ghost danger-hover" data-act="v8-purge-lead" data-id="' + esc(l.id) + '" data-any="1">' + icon('trash', 13) + ' Delete forever</button>' : '') +
    '</div></div>';

  host.innerHTML = quick + log + next + contact + stage + deal + notes + more;
  v9WireQuickLog(l.id);
};

/* Drafts: what you type is saved as you type, and comes back. */
function qnKey(id) { return 'ev9_qn_' + v9Who() + '_' + id; }
function edKey(id, field) { return 'ev9_ed_' + v9Who() + '_' + id + '_' + field; }

function v9WireQuickLog(leadId) {
  var input = $('#quickNote');
  if (!input) return;
  var saved = v9Get(qnKey(leadId), '');
  if (saved) { input.value = saved; v9DraftNote('#quickNoteState', 'Draft kept — not logged yet.'); }
  input.addEventListener('input', function () {
    if (input.value.trim()) { v9Set(qnKey(leadId), input.value); v9DraftNote('#quickNoteState', 'Draft saved.'); }
    else { v9Del(qnKey(leadId)); v9DraftNote('#quickNoteState', ''); }
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) { e.preventDefault(); ACTIONS['add-note']({ dataset: { id: leadId } }); }
  });
}
function v9DraftNote(sel, text) { var el = $(sel); if (el) el.textContent = text; }

(function wrapDrafts() {
  var _add = ACTIONS['add-note'];
  ACTIONS['add-note'] = function (el) {
    var input = $('#quickNote');
    var id = el.dataset.id;
    if (!input || !input.value.trim()) { if (input) input.focus(); return; }
    var r = _add.apply(this, arguments);
    v9Del(qnKey(id));
    v9DraftNote('#quickNoteState', '');
    return r;
  };

  var _edit = startInlineEdit;
  startInlineEdit = function (el) {
    var r = _edit.apply(this, arguments);
    var control = el.querySelector('textarea, input');
    if (!control || control.type === 'date' || control.type === 'number') return r;
    var key = edKey(el.dataset.id, el.dataset.field);
    var draft = v9Get(key, null);
    if (draft !== null && draft !== control.value) {
      control.value = draft;
      var hint = document.createElement('div');
      hint.className = 'tiny ft-restored';
      hint.textContent = 'Restored what you were typing. Click outside to save, Esc to drop it.';
      el.appendChild(hint);
    }
    control.addEventListener('input', function () { v9Set(key, control.value); });
    control.addEventListener('keydown', function (e) { if (e.key === 'Escape') v9Del(key); });
    control.addEventListener('blur', function () { setTimeout(function () { if (el.dataset.editing !== '1') v9Del(key); }, 50); });
    return r;
  };

  // Never redraw the lead while someone is typing in it — that is what used to
  // wipe a half-written note when a sync came in.
  var _rd = renderDrawer;
  renderDrawer = function () {
    var d = $('#drawer');
    var same = V9.drawnLead === State.ui.detailId && V9.drawnTab === State.ui.detailTab;
    if (d && d.classList.contains('show') && same && v9DrawerBusy()) { V9.drawerPending = true; return; }
    V9.drawerPending = false;
    V9.drawnLead = State.ui.detailId; V9.drawnTab = State.ui.detailTab;
    return _rd.apply(this, arguments);
  };
})();

function v9DrawerBusy() {
  var d = $('#drawer');
  if (!d) return false;
  if (d.querySelector('[data-editing="1"]')) return true;
  var a = document.activeElement;
  return !!(a && d.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}

/* ═══ 5. CALENDAR CONNECTION ═══════════════════════════════════════════════ */
function v9CalRedirect() {
  var p = location.pathname.replace(/index\.html$/, '');
  if (!/\/$/.test(p)) p += '/';
  return location.origin + p;
}

function v9CalLabel(c) {
  c = c || {};
  if (c.mode === 'google') return 'Connected with Google: ' + (c.email || 'a Google account');
  if (c.mode === 'shared') return 'Shared calendar: ' + (c.email || '');
  if (c.mode === 'owner') return 'The owner’s Google Calendar' + (c.email ? ' (' + c.email + ')' : '');
  return 'No calendar connected';
}

function v9RenderCalCard() {
  var host = $('#calLinkCard');
  if (!host) return;
  var st = V9.calStatus;
  var c = (st && st.cal) || (State.ws && State.ws.cal) || { mode: 'none' };
  var manage = canManageWs() || isAdminUser();
  var ok = st && st.ok;
  host.innerHTML =
    '<div class="card-head"><div class="card-title">' + icon('meetings', 14) + ' Calendar for ' + esc(currentWsName() || 'this account') + '</div>' +
      (st ? '<span class="chip ' + (c.mode === 'none' ? 'chip-ghost' : ok === false || c.error ? 'chip-danger' : 'chip-good') + '">' +
        (c.mode === 'none' ? 'Off' : ok === false || c.error ? 'Problem' : 'Working') + '</span>' : '') + '</div>' +
    '<div class="card-body">' +
      '<div class="cal-now"><b>' + esc(v9CalLabel(c)) + '</b>' +
        (c.connectedAt && c.mode !== 'none' ? '<div class="tiny muted">since ' + esc(Fmt.date(String(c.connectedAt).slice(0, 10))) + (c.by ? ' · by ' + esc(c.by) : '') + '</div>' : '') +
        (st && st.ok && c.mode !== 'none' ? '<div class="tiny muted">' + esc(st.busy7d || 0) + ' busy event(s) in the next 7 days — those times cannot be double-booked.</div>' : '') +
        (c.error || (st && st.problem) ? '<div class="v8-danger-box" style="margin-top:8px">' + icon('alert', 14) + '<div>' + esc(c.error || st.problem) + '</div></div>' : '') +
      '</div>' +
      '<div class="small" style="margin:10px 0">Meetings of this account are written to this calendar, and its busy times block double-booking and the booking page. ' +
        'Every account has its own — nothing goes to anyone else’s calendar.</div>' +
      (manage ? '<div class="row" style="gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn-primary" data-act="v9-cal-connect">' + icon('meetings', 13) + ' ' + (c.mode === 'google' ? 'Connect a different Google account' : 'Connect Google Calendar') + '</button>' +
        '<button class="btn" data-act="v9-cal-shared">Use a shared calendar</button>' +
        (isAdminUser() && c.mode !== 'owner' ? '<button class="btn btn-ghost" data-act="v9-cal-owner">Use the owner’s calendar</button>' : '') +
        (c.mode !== 'none' ? '<button class="btn btn-ghost danger-hover" data-act="v9-cal-off">Disconnect</button>' : '') +
        '<button class="btn btn-ghost" data-act="v9-cal-test">' + icon('sync', 12) + ' Check</button>' +
      '</div>' +
      (!c.canOAuth ? '<div class="tiny muted" style="margin-top:8px">“Connect Google Calendar” needs the Google client secret — ' +
        (isAdminUser() ? 'add it in Admin → Platform.' : 'ask the admin to add it in Admin → Platform.') + ' “Use a shared calendar” works without it.</div>' : '')
      : '<div class="tiny muted">Only a manager of this account can change its calendar.</div>') +
    '</div>';
}

function v9CalStatus() {
  if (!Cfg.token) return;
  api('calendarStatus', {}, { timeout: 45000 }).then(function (r) {
    if (r && r.success) {
      V9.calStatus = r;
      if (State.ws) State.ws.cal = r.cal;
    } else V9.calStatus = { cal: (State.ws && State.ws.cal) || { mode: 'none' }, ok: false, problem: niceErr(r) };
    v9RenderCalCard();
  });
}

function v9CalApplied(r, msg) {
  if (!r || !r.success) { toast(r && r.error === 'NO_OAUTH' ? r.message : niceErr(r), 'err', 9000); return; }
  if (State.ws) State.ws.cal = r.cal;
  V9.calStatus = null;
  toast(msg, 'good');
  var host = $('#settingsBody'); if (host) host.dataset.rendered = '';
  if (State.ui.page === 'settings') renderSettings();
  v9CalStatus();
}

/* Back from Google with ?code=…&state=cs_… */
function v9CalReturn() {
  var code = qsParam('code'), state = qsParam('state');
  if (!code || !/^cs_/.test(state)) return;
  var tries = 0;
  var wait = setInterval(function () {
    tries++;
    if (!(Cfg.token && State.me)) { if (tries > 120) clearInterval(wait); return; }
    clearInterval(wait);
    dropParams(['code', 'state', 'scope', 'authuser', 'prompt', 'hd', 'iss']);
    toast('Finishing the calendar connection…');
    api('calendarConnectFinish', { code: code, state: state }, { timeout: 60000 }).then(function (r) {
      if (!r || !r.success) { toast(niceErr(r), 'err', 10000); return; }
      var done = function () {
        if (State.ws) State.ws.cal = r.cal;
        State.ui.settingsTab = 'calendar';
        try { localStorage.setItem(LS.settingsTab, 'calendar'); } catch (e) {}
        var host = $('#settingsBody'); if (host) host.dataset.rendered = '';
        switchPage('settings');
        notify('system', 'Google Calendar connected', (r.cal && r.cal.email) || '', { type: 'page', value: 'settings' });
        toast('Google Calendar connected' + (r.cal && r.cal.email ? ': ' + r.cal.email : ''), 'good', 6000);
      };
      if (r.ws && r.ws !== (Cfg.ws || 'main')) { switchWorkspace(r.ws); setTimeout(done, 1500); } else done();
    });
  }, 500);
}

/* ═══ 6. MEETING REMINDERS ════════════════════════════════════════════════ */
function v9ReminderCard() {
  var r = Object.assign({ on: true, before: [60, 15], ai: true, lang: 'bn' }, State.settings.meetingReminders || {});
  var manage = canManageWs() || isAdminUser();
  var mins = [1440, 120, 60, 30, 15, 10, 5];
  return '<div class="card" id="v9RemCard" style="grid-column:1/-1;margin-top:14px"><div class="card-head"><div class="card-title">⏰ Meeting reminders with an AI brief</div>' +
    '<span class="chip ' + (r.on !== false ? 'chip-good' : 'chip-ghost') + '">' + (r.on !== false ? 'On' : 'Off') + '</span></div><div class="card-body">' +
    '<div class="small" style="margin-bottom:10px">Before every meeting in <b>' + esc(currentWsName()) + '</b>, Telegram tells everyone in this account (who has Telegram connected) what is coming — ' +
      'with the lead’s phone, the link, the agenda and a short AI brief written from the lead’s notes and history.</div>' +
    (manage ? toggleHtml('remOn', r.on !== false, 'Send meeting reminders', '') +
      '<div class="field" style="margin-top:10px"><label>When</label><div class="chip-picks">' + mins.map(function (m) {
        return '<label class="pick"><input type="checkbox" class="remBefore" value="' + m + '"' + ((r.before || []).map(Number).indexOf(m) >= 0 ? ' checked' : '') + '/><span>' +
          (m >= 1440 ? '1 day' : m >= 60 ? (m / 60) + ' hour' + (m > 60 ? 's' : '') : m + ' min') + ' before</span></label>';
      }).join('') + '</div></div>' +
      toggleHtml('remAi', r.ai !== false, 'Add an AI brief to the first reminder', 'Who they are, what happened so far, three talking points, two questions, the goal.') +
      '<div class="field" style="margin-top:10px"><label>Language</label><select class="select select-inline" id="remLang"><option value="bn"' + (r.lang !== 'en' ? ' selected' : '') + '>বাংলা</option><option value="en"' + (r.lang === 'en' ? ' selected' : '') + '>English</option></select></div>' +
      '<div class="row" style="margin-top:12px;gap:8px"><button class="btn btn-primary btn-sm" data-act="v9-rem-save">Save</button>' +
      '<span class="tiny muted">Test it from any meeting: open it → “Send me a test reminder”.</span></div>'
      : '<div class="small muted">' + (r.on !== false ? 'On — ' + (r.before || []).join(', ') + ' minutes before.' : 'Off.') + ' A manager of this account can change this.</div>') +
    '</div></div>';
}

/* ═══ 7. API & INTEGRATIONS ═══════════════════════════════════════════════ */
function v9HooksHtml() {
  var h = V9.hooks;
  if (!h) return '<div class="small muted">Loading webhooks…</div>';
  var events = h.events || [];
  return (h.hooks.length ? h.hooks.map(function (x) {
    var last = x.last;
    return '<div class="list-row"><div class="grow"><div class="lr-title"><code>' + esc(x.url) + '</code> ' +
      (x.on ? '<span class="chip chip-good">On</span>' : '<span class="chip chip-ghost">Paused</span>') + (x.hasSecret ? ' <span class="chip chip-ghost">signed</span>' : '') + '</div>' +
      '<div class="tiny muted">' + esc((x.events || []).join(', ') === '*' ? 'every event' : (x.events || []).join(', ')) + '</div>' +
      (last ? '<div class="tiny ' + (last.code >= 200 && last.code < 300 ? 'muted' : 'danger-text') + '">Last: ' + esc(last.event) + ' → ' + (last.code || 'failed') + (last.error ? ' ' + esc(last.error) : '') + ' · ' + esc(v9Ago(last.at)) + '</div>' : '<div class="tiny muted">Nothing sent yet.</div>') +
      '</div><div class="lr-actions"><button class="btn btn-sm" data-act="v9-hook-test" data-id="' + esc(x.id) + '">Test</button>' +
      '<button class="btn btn-sm" data-act="v9-hook-edit" data-id="' + esc(x.id) + '">' + icon('edit', 12) + '</button>' +
      '<button class="btn btn-sm btn-ghost danger-hover" data-act="v9-hook-del" data-id="' + esc(x.id) + '">' + icon('trash', 12) + '</button></div></div>';
  }).join('') : '<div class="small muted">No webhooks yet.</div>') +
  '<button class="btn btn-sm btn-primary" data-act="v9-hook-edit" style="margin-top:10px">' + icon('plus', 12) + ' Add a webhook</button>' +
  '<div class="tiny muted" style="margin-top:6px">Events: ' + esc(events.join(', ')) + '</div>';
}

function v9IntegrationsHtml() {
  var base = Cfg.url || 'https://script.google.com/macros/s/…/exec';
  return '<div class="card" style="grid-column:1/-1;margin-top:14px"><div class="card-head"><div class="card-title">' + icon('link', 14) + ' Webhooks — n8n, Make, Zapier</div></div><div class="card-body">' +
      '<div class="small" style="margin-bottom:10px">When something happens in <b>' + esc(currentWsName()) + '</b> (a lead is added, a stage changes, a meeting is booked…), the tracker sends it to your address straight away as JSON.</div>' +
      '<div id="v9Hooks">' + v9HooksHtml() + '</div></div></div>' +
    '<div class="card" style="grid-column:1/-1;margin-top:14px"><div class="card-head"><div class="card-title">Connect a tool — step by step</div></div><div class="card-body">' +
      '<details class="v9-how" open><summary><b>n8n</b></summary><ol class="v8-steps">' +
        '<li>Above: press <b>New key</b> (write) and copy it.</li>' +
        '<li><b>Tracker → n8n:</b> in n8n add a <b>Webhook</b> node (POST), copy its Production URL, then here press <b>Add a webhook</b> and paste it. Pick the events.</li>' +
        '<li><b>n8n → Tracker:</b> add an <b>HTTP Request</b> node: Method POST, URL <code>' + esc(base) + '</code>, Body “Raw”, Content-Type <code>text/plain</code>, body <code>{"apiKey":"evk_…","action":"apiUpsertLead","lead":{"name":"…","phone":"…"}}</code>.</li>' +
        '<li>Reading leads: HTTP Request GET <code>' + esc(base) + '?key=evk_…&amp;action=apiLeads</code>.</li></ol></details>' +
      '<details class="v9-how"><summary><b>Chrome extension (Everstone GBP tracker)</b></summary><ol class="v8-steps">' +
        '<li>Make a <b>write</b> key here for the account the extension should fill.</li>' +
        '<li>In the extension’s settings paste the backend address <code>' + esc(base) + '</code> and the key.</li>' +
        '<li>The extension sends <code>apiUpsertLead</code> — the same business never appears twice (matched by phone, website, email or name).</li>' +
        '<li>To stop it: revoke the key here, or the admin switches off “API &amp; integrations” for that person.</li></ol></details>' +
      '<details class="v9-how"><summary><b>Check a signature</b></summary><div class="small">If you set a secret, every request carries <code>X-Everstone-Signature</code> = hex HMAC-SHA256 of the raw body with your secret. Compare it before trusting the data.</div></details>' +
    '</div></div>';
}

function v9LoadHooks() {
  if (!State.perm || State.perm.api === false) return;
  api('webhooksList', {}).then(function (r) {
    V9.hooks = r && r.success ? r : { hooks: [], events: [] };
    var el = $('#v9Hooks'); if (el) el.innerHTML = v9HooksHtml();
  });
}

function v9EditHook(id) {
  var h = (V9.hooks && V9.hooks.hooks || []).filter(function (x) { return x.id === id; })[0] || { events: ['*'], on: true };
  var events = (V9.hooks && V9.hooks.events) || [];
  var all = (h.events || []).indexOf('*') >= 0;
  openModal({
    title: id ? 'Edit webhook' : 'Add a webhook',
    body: '<div class="field"><label>Address (https)</label><input class="input" id="hkUrl" value="' + esc(h.url || '') + '" placeholder="https://your-n8n.app/webhook/…"/></div>' +
      '<div class="field"><label>Send these events</label><label class="check-row"><input type="checkbox" id="hkAll"' + (all ? ' checked' : '') + '/> Every event</label>' +
      '<div class="chip-picks" id="hkEvents">' + events.map(function (e) {
        return '<label class="pick"><input type="checkbox" class="hkEv" value="' + esc(e) + '"' + (all || (h.events || []).indexOf(e) >= 0 ? ' checked' : '') + '/><span>' + esc(e) + '</span></label>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>Secret (optional)</label><input class="input" id="hkSecret" value="' + (h.hasSecret ? '•••' : '') + '" placeholder="Used to sign every request"/></div>' +
      toggleHtml('hkOn', h.on !== false, 'Active', ''),
    foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" id="hkSave">Save</button>'
  });
  $('#hkAll').addEventListener('change', function () { var on = this.checked; $$('.hkEv').forEach(function (x) { x.checked = on; }); });
  $('#hkSave').addEventListener('click', function () {
    var evs = $('#hkAll').checked ? ['*'] : $$('.hkEv').filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
    api('webhookSave', { hook: { id: id || '', url: $('#hkUrl').value.trim(), events: evs, secret: $('#hkSecret').value, on: $('#hkOn').checked } }).then(function (r) {
      if (!r || !r.success) { toast(niceErr(r), 'err', 7000); return; }
      V9.hooks = r; closeModal(); toast('Saved', 'good');
      var el = $('#v9Hooks'); if (el) el.innerHTML = v9HooksHtml();
    });
  });
}

/* ═══ 8. TRASH ═════════════════════════════════════════════════════════════ */
var TRASH_LABELS = { meeting: 'Meetings', note: 'Notes', task: 'Tasks', doc: 'Documents', chat: 'AI chats' };

function v9TrashHtml() {
  var t = V9.trash;
  var counts = {};
  Object.keys(TRASH_LABELS).forEach(function (k) { counts[k] = t && t[k] ? t[k].length : 0; });
  var total = Object.keys(counts).reduce(function (s, k) { return s + counts[k]; }, 0);
  var list = t && t[V9.trashTab] ? t[V9.trashTab] : [];
  return '<div class="card trash-card"><div class="card-head"><div class="card-title">' + icon('trash', 14) + ' Trash — everything else that was deleted</div>' +
    (canPurgeLeads() ? '<button class="btn btn-sm btn-danger" data-act="v9-trash-empty">' + icon('trash', 12) + ' Empty trash (all)</button>' : '') + '</div>' +
    '<div class="card-body"><div class="pill-row">' + Object.keys(TRASH_LABELS).map(function (k) {
      return '<button class="pill' + (V9.trashTab === k ? ' active' : '') + '" data-act="v9-trash-tab" data-value="' + k + '">' + TRASH_LABELS[k] + '<span class="cnt">' + counts[k] + '</span></button>';
    }).join('') + '</div>' +
    (!t ? loadingBox() : list.length ? list.map(function (x) {
      var lead = x.leadId ? getLead(x.leadId) : null;
      return '<div class="list-row compact"><div class="grow"><div class="lr-title">' + esc(x.title) + '</div>' +
        '<div class="tiny muted">' + esc([x.sub, lead ? lead.name : '', x.at ? 'deleted ' + v9Ago(x.at) : ''].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="lr-actions"><button class="btn btn-sm" data-act="v9-trash-restore" data-kind="' + V9.trashTab + '" data-id="' + esc(x.id) + '">Restore</button>' +
        (canPurgeLeads() ? '<button class="btn btn-sm btn-ghost btn-icon danger-hover" data-act="v9-trash-purge" data-kind="' + V9.trashTab + '" data-id="' + esc(x.id) + '" title="Delete for good">' + icon('trash', 13) + '</button>' : '') + '</div></div>';
    }).join('') : '<div class="small muted" style="padding:10px 0">Nothing here.</div>') +
    (total ? '<div class="tiny muted" style="margin-top:8px">' + total + ' item(s) in the trash.</div>' : '') +
    '</div></div>';
}

function v9LoadTrash() {
  if (!Cfg.token) return;
  api('trashList', {}).then(function (r) {
    V9.trash = r && r.success ? r.trash : {};
    var el = $('#v9Trash'); if (el) el.innerHTML = v9TrashHtml();
  });
}

/* ═══ 10. QUICK NAVIGATION ════════════════════════════════════════════════ */
var GO_KEYS = { t: 'today', l: 'leads', p: 'pipeline', f: 'followups', m: 'meetings', n: 'notes', r: 'reports', h: 'history',
                a: 'ai', d: 'docs', x: 'archive', s: 'settings', g: 'guide', i: 'admin', e: 'messages' };

function v9Commands() {
  var out = [
    { label: 'Go to Reports', kind: 'page', run: function () { switchPage('reports'); } },
    { label: 'Go to Messages', kind: 'page', run: function () { switchPage('messages'); } },
    { label: 'Go to Documents', kind: 'page', run: function () { switchPage('docs'); } },
    { label: 'Go to Archive & Trash', kind: 'page', run: function () { switchPage('archive'); } },
    { label: 'Go to Guide (help)', kind: 'page', run: function () { switchPage('guide'); } },
    { label: 'Notifications', kind: 'action', run: function () { notifToggle(true); } },
    { label: 'Quran & Hadith panel', kind: 'action', run: function () { railShow(); } },
    { label: 'Ayah & Hadith history', kind: 'action', run: function () { deenOpenHistory(); } },
    { label: 'Switch account', kind: 'action', run: function () { if (typeof openWorkspacePicker === 'function') openWorkspacePicker(); } },
    { label: 'Calendar connection', kind: 'page', run: function () { v9GoSettings('calendar'); } },
    { label: 'Meeting reminders (Telegram)', kind: 'page', run: function () { v9GoSettings('telegram'); } },
    { label: 'API & integrations · webhooks · n8n', kind: 'page', run: function () { v9GoSettings('api'); } }
  ];
  if (isAdminUser()) {
    [['overview', 'Overview'], ['people', 'People'], ['accounts', 'Accounts'], ['ai', 'AI providers'], ['telegram', 'Telegram'], ['platform', 'Platform'], ['api', 'API keys']].forEach(function (t) {
      out.push({ label: 'Admin → ' + t[1], kind: 'page', run: function () { ACTIONS['go-admin']({ dataset: { value: t[0] } }); } });
    });
  }
  return out;
}

function v9GoSettings(tab) {
  closeModal();
  State.ui.settingsTab = tab;
  try { localStorage.setItem(LS.settingsTab, tab); } catch (e) {}
  var host = $('#settingsBody'); if (host) host.dataset.rendered = '';
  switchPage('settings');
}

function railShow() {
  if (railWide()) { document.body.classList.remove('rail-off'); v9Set('ev9_rail_off', false); }
  else document.body.classList.add('rail-open');
  if (!Deen.item.ayah && !Deen.busy.ayah) deenNext();
}

/* ═══ WRAPS ═══════════════════════════════════════════════════════════════ */
(function wraps() {
  var _switch = switchPage;
  switchPage = function (page) {
    var r = _switch.apply(this, arguments);
    if (PAGE_RENDERERS[page]) {
      document.body.dataset.page = page;
      document.body.classList.remove('rail-open');
      notifToggle(false);
    }
    return r;
  };

  var _tabOpened = settingsTabOpened;
  settingsTabOpened = function (tab) {
    var r = _tabOpened.apply(this, arguments);
    if (tab === 'calendar') { v9RenderCalCard(); v9CalStatus(); }
    return r;
  };

  var _tg = renderTgSettings;
  renderTgSettings = function () {
    var r = _tg.apply(this, arguments);
    var host = $('#tgSettings');
    if (host && !$('#v9RemCard')) host.insertAdjacentHTML('afterend', v9ReminderCard());
    return r;
  };

  var _api = drawApiSettings;
  drawApiSettings = function () {
    var r = _api.apply(this, arguments);
    var host = $('#apiSettings');
    if (!host) return r;
    if (State.perm && State.perm.api === false) {
      host.innerHTML = '<div class="card-head"><div class="card-title">API &amp; integrations</div></div><div class="card-body small muted">' +
        'The admin has not switched on API &amp; integrations for you in this account.</div>';
      return r;
    }
    if (!$('#v9IntegrationsWrap')) {
      var wrap = document.createElement('div');
      wrap.id = 'v9IntegrationsWrap';
      wrap.style.gridColumn = '1/-1';
      wrap.innerHTML = v9IntegrationsHtml();
      host.parentNode.insertBefore(wrap, host.nextSibling);
    }
    v9LoadHooks();
    return r;
  };

  var _archive = renderArchive;
  renderArchive = function () {
    var r = _archive.apply(this, arguments);
    var list = $('#archiveList');
    if (list && !$('#v9Trash')) {
      var box = document.createElement('div');
      box.id = 'v9Trash';
      list.parentNode.appendChild(box);
    }
    var el = $('#v9Trash');
    if (el) el.innerHTML = v9TrashHtml();
    if (!V9.trash && !V9.trashLoading) { V9.trashLoading = true; v9LoadTrash(); setTimeout(function () { V9.trashLoading = false; }, 4000); }
    return r;
  };
  PAGE_RENDERERS.archive = renderArchive;

  var _meet = openMeetingForm;
  openMeetingForm = function (meetingId) {
    var r = _meet.apply(this, arguments);
    var foot = $('#modalFoot');
    if (meetingId && foot && !foot.querySelector('[data-act="v9-rem-test"]')) {
      foot.insertAdjacentHTML('afterbegin', '<button class="btn btn-ghost btn-sm" data-act="v9-rem-test" data-id="' + esc(meetingId) + '" style="margin-right:auto">⏰ Send me a test reminder</button>');
    }
    return r;
  };

  // Admin: open from the last copy instantly, refresh behind it.
  var _adminLoad = adminLoad;
  adminLoad = function (kind, force) {
    if (kind === 'ov' && !Admin.ov && !force) {
      var snap = v9Get('ev9_adminov_' + v9Who(), null);
      if (snap) { Admin.ov = snap; Admin.ovStale = true; setTimeout(function () { try { renderAdmin(true); } catch (e) {} }, 0); }
    }
    var p = _adminLoad.apply(this, arguments);
    if (kind === 'ov' && p && p.then) p.then(function () {
      Admin.ovStale = false;
      if (Admin.ov && Admin.ov.success) v9Set('ev9_adminov_' + v9Who(), Admin.ov);
    });
    return p;
  };

  // Accounts: "Empty account" next to delete.
  if (typeof adminAccountsHtml === 'function') {
    var _acc = adminAccountsHtml;
    adminAccountsHtml = function () {
      var html = _acc.apply(this, arguments);
      return String(html).replace(/(<a class="btn btn-sm" href="[^"]*" target="_blank" rel="noopener" title="Open the spreadsheet">Sheet<\/a>)?(<button class="btn btn-sm btn-ghost btn-icon danger-hover" data-act="v8-delete-ws" data-id="([^"]+)")/g,
        function (m, sheet, del, id) { return (sheet || '') + '<button class="btn btn-sm btn-ghost danger-hover" data-act="v9-wipe-ws" data-id="' + id + '" title="Delete every lead, meeting and note — keep the setup">Empty</button>' + del; }) +
        (isAdminUser() ? '<div class="tiny muted" style="margin-top:10px">Each card: <b>Empty</b> clears an account’s data but keeps its setup; the bin deletes the whole account. ' +
          'Calendar: ' + esc(((Admin.ov && Admin.ov.workspaces) || []).map(function (w) { return w.name + ' → ' + v9CalLabel(w.cal || {}); }).join(' · ')) + '</div>' : '');
    };
  }

  // People list: deleting someone removes them at once from every list here.
  var _del = ACTIONS['v8-delete-user'];
  if (_del) ACTIONS['v8-delete-user'] = function (el) {
    var email = el.dataset.value;
    var r = _del.apply(this, arguments);
    var ok = $('#v8TypedOk');
    if (ok) ok.addEventListener('click', function () {
      setTimeout(function () {
        if (Admin.ov && Admin.ov.users) Admin.ov.users = Admin.ov.users.filter(function (u) { return u.email !== email; });
        v9Del('ev9_adminov_' + v9Who());
      }, 2500);
    });
    return r;
  };

  // Google sign-in check: also what the calendar connection needs.
  if (typeof googleCheckHtml === 'function') {
    var _g = googleCheckHtml;
    googleCheckHtml = function (c) {
      var html = _g.apply(this, arguments);
      var secret = c && c.GOOGLE_CLIENT_SECRET;
      return html + '<hr class="divider"/><div class="small"><b>For “Connect Google Calendar”</b> (each account books into its own calendar)</div>' +
        '<div class="kv"><dt>Client secret</dt><dd>' + (secret ? '<span class="chip chip-good">ok</span>' : '<span class="chip chip-danger">missing</span> <span class="tiny muted">add it above</span>') + '</dd>' +
        '<dt>Redirect URI</dt><dd><code>' + esc(v9CalRedirect()) + '</code> ' + copyBtn(v9CalRedirect(), 'Copy') + '</dd></div>' +
        '<ol class="g-steps small"><li>Same OAuth client → <b>Authorized redirect URIs</b> → add the address above.</li>' +
        '<li>Google Cloud → <b>APIs &amp; Services → Library</b> → enable <b>Google Calendar API</b>.</li>' +
        '<li><b>OAuth consent screen → Data access</b> → add the scope <code>…/auth/calendar.events</code>. While the app is in Testing, add each Gmail that will connect under Test users.</li>' +
        '<li>Then in any account: Settings → Calendar → <b>Connect Google Calendar</b>.</li></ol>';
    };
  }
})();

PAGE_RENDERERS.guide = PAGE_RENDERERS.guide || function () {};

Object.assign(ACTIONS, {
  /* notifications */
  'v9-notif-tab': function (el) { Notif.tab = el.dataset.value; notifRender(); },
  'v9-notif-read': function () { notifLoad().forEach(function (n) { n.read = true; }); notifSave(); notifBadge(); notifRender(); },
  'v9-notif-clear': function () {
    Notif.list = notifLoad().filter(function (n) {
      if (Notif.tab === 'all') return n.kind === 'deen';
      if (Notif.tab === 'work') return !/followup|access|system/.test(n.kind);
      return n.kind !== Notif.tab;
    });
    notifSave(); notifBadge(); notifRender();
  },
  'v9-notif-close': function () { notifToggle(false); },
  'v9-notif-open': function (el) {
    var n = notifLoad().filter(function (x) { return x.id === el.dataset.id; })[0];
    if (n && n.act && n.act.type === 'reload') { location.reload(); return; }
    notifRun(n);
  },
  'v9-notif-desktop': function () {
    try { Notification.requestPermission().then(function () { notifRender(); }); } catch (e) {}
  },

  /* quran & hadith */
  'v9-rail-open': function () { notifToggle(false); railShow(); },
  'v9-rail-close': function () { if (railWide()) { document.body.classList.add('rail-off'); v9Set('ev9_rail_off', true); } else document.body.classList.remove('rail-open'); },
  'v9-dn-next': function (el) { deenNext(el.dataset.k); },
  'v9-dn-view': function (el) {
    if (el.dataset.k === 'hadith') deenHadithLang(el.dataset.value);
    else { Deen.view.ayah = el.dataset.value; deenRender(); }
  },
  'v9-dn-copy': function (el) {
    var it = Deen.item[el.dataset.k];
    if (!it) return;
    var text = it.t === 'ayah'
      ? it.ar + '\n\n' + it.bn + '\n\n— সূরা ' + it.surahBn + ' (' + bnNum(it.surah) + ':' + bnNum(it.ayah) + ')'
      : it.bn + '\n\n— ' + (DEEN.books[it.book] || {}).bn + ', হাদিস ' + bnNum(it.num);
    try { navigator.clipboard.writeText(text); toast('Copy হয়েছে', 'good'); } catch (e) {}
  },
  'v9-dn-star': function (el) {
    var it = Deen.item[el.dataset.k];
    if (!it || !it.histId) return;
    var list = deenHist();
    list.forEach(function (h) { if (h.id === it.histId) h.star = !h.star; });
    deenHistSave(list); deenRender();
  },
  'v9-deen-history': function () { notifToggle(false); deenOpenHistory(); },
  'v9-deen-settings': function () { deenOpenSettings(); },
  'v9-dh-star': function (el) {
    var list = deenHist();
    list.forEach(function (h) { if (h.id === el.dataset.id) h.star = !h.star; });
    deenHistSave(list);
    var b = el; var on = list.some(function (h) { return h.id === el.dataset.id && h.star; });
    b.classList.toggle('on', on); b.innerHTML = icon(on ? 'star' : 'star-o', 13);
  },
  'v9-dh-export': function () {
    var rows = deenHist().map(function (h) { return [h.at, h.t, h.title, '"' + String(h.bn).replace(/"/g, '""') + '"'].join(','); });
    var blob = new Blob(['﻿at,type,reference,text\n' + rows.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ayah-hadith-history.csv'; a.click();
  },

  /* lead details */
  'v9-focus-log': function () { var q = $('#quickNote'); if (q) { q.focus(); q.scrollIntoView({ block: 'center', behavior: 'smooth' }); } },
  'v9-go': function (el) { switchPage(el.dataset.value || 'today'); },

  /* calendar */
  'v9-cal-connect': function () {
    var c = (State.ws && State.ws.cal) || {};
    api('calendarConnectStart', { redirect: v9CalRedirect(), hint: c.email || '' }).then(function (r) {
      if (!r || !r.success) { toast(r && r.message ? r.message : niceErr(r), 'err', 9000); return; }
      location.href = r.url;
    });
  },
  'v9-cal-shared': function () {
    var c = (State.ws && State.ws.cal) || {};
    var owner = c.shareWith || 'the tracker’s Google account';
    openModal({
      title: 'Use a shared Google Calendar',
      narrow: true,
      body: '<ol class="v8-steps"><li>Open Google Calendar <b>signed in as the Gmail you want to use</b> (for example abc@gmail.com).</li>' +
        '<li>⚙ Settings → that calendar → <b>Share with specific people</b> → Add <code>' + esc(owner) + '</code> → permission <b>“Make changes to events”</b>.</li>' +
        '<li>Type that Gmail below and press Connect.</li></ol>' +
        '<div class="field"><label>Calendar Gmail / ID</label><input class="input" id="calSharedId" placeholder="abc@gmail.com"/></div>',
      foot: '<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" id="calSharedGo">Connect</button>'
    });
    $('#calSharedGo').addEventListener('click', function () {
      var b = this; b.disabled = true; b.textContent = 'Checking…';
      api('calendarUseShared', { calendarId: $('#calSharedId').value.trim() }, { timeout: 60000 }).then(function (r) {
        b.disabled = false; b.textContent = 'Connect';
        if (r && r.success) { closeModal(); v9CalApplied(r, 'Calendar connected'); } else toast(niceErr(r), 'err', 10000);
      });
    });
  },
  'v9-cal-owner': function () {
    confirmDialog('Use the owner’s calendar?', 'Meetings of ' + (currentWsName() || 'this account') + ' will go into the owner’s Google Calendar.', 'Use it', function () {
      api('calendarUseOwner', {}).then(function (r) { v9CalApplied(r, 'Now using the owner’s calendar'); });
    });
  },
  'v9-cal-off': function () {
    confirmDialog('Disconnect the calendar?', 'New meetings stop going into it. Events already there stay.', 'Disconnect', function () {
      api('calendarDisconnect', {}).then(function (r) { v9CalApplied(r, 'Calendar disconnected'); });
    }, true);
  },
  'v9-cal-test': function () { V9.calStatus = null; v9RenderCalCard(); v9CalStatus(); },

  /* reminders */
  'v9-rem-save': function () {
    var before = $$('.remBefore').filter(function (x) { return x.checked; }).map(function (x) { return Number(x.value); });
    var mr = { on: !!($('#remOn') || {}).checked, before: before.length ? before : [60, 15], ai: !!($('#remAi') || {}).checked, lang: ($('#remLang') || {}).value || 'bn' };
    api('saveSettings', { settings: { meetingReminders: mr } }).then(function (r) {
      if (!r || !r.success) { toast(niceErr(r), 'err', 6000); return; }
      State.settings.meetingReminders = mr;
      toast('Saved — reminders ' + (mr.on ? 'on' : 'off'), 'good');
      var card = $('#v9RemCard'); if (card) card.outerHTML = v9ReminderCard();
    });
  },
  'v9-rem-test': function (el) {
    var b = el; b.disabled = true; b.textContent = 'Sending…';
    api('meetingRemindTest', { id: el.dataset.id }, { timeout: 90000 }).then(function (r) {
      b.disabled = false; b.textContent = '⏰ Send me a test reminder';
      if (r && r.success) toast('Sent to your Telegram', 'good');
      else toast(r && r.error === 'TG_NOT_LINKED' ? r.message : niceErr(r), 'err', 7000);
    });
  },

  /* webhooks */
  'v9-hook-edit': function (el) { v9EditHook(el.dataset.id || ''); },
  'v9-hook-del': function (el) {
    confirmDialog('Delete this webhook?', 'Nothing more is sent to it.', 'Delete', function () {
      api('webhookDelete', { id: el.dataset.id }).then(function (r) { if (r && r.success) { V9.hooks = r; var x = $('#v9Hooks'); if (x) x.innerHTML = v9HooksHtml(); } else toast(niceErr(r), 'err'); });
    }, true);
  },
  'v9-hook-test': function (el) {
    el.disabled = true;
    api('webhookTest', { id: el.dataset.id }, { timeout: 60000 }).then(function (r) {
      el.disabled = false;
      if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
      var res = r.result || {};
      toast(res.code >= 200 && res.code < 300 ? 'Delivered (' + res.code + ')' : 'Not delivered: ' + (res.code || res.error || 'no answer'), res.code >= 200 && res.code < 300 ? 'good' : 'warn', 6000);
      if (V9.hooks) V9.hooks.hooks = r.hooks;
      var x = $('#v9Hooks'); if (x) x.innerHTML = v9HooksHtml();
    });
  },

  /* trash */
  'v9-trash-tab': function (el) { V9.trashTab = el.dataset.value; var x = $('#v9Trash'); if (x) x.innerHTML = v9TrashHtml(); },
  'v9-trash-restore': function (el) {
    api('trashRestore', { kind: el.dataset.kind, id: el.dataset.id }).then(function (r) {
      if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
      toast('Restored', 'good'); v9LoadTrash(); pullFromServer(true);
    });
  },
  'v9-trash-purge': function (el) {
    confirmDialog('Delete for good?', 'This cannot be undone.', 'Delete for good', function () {
      api('purgeItems', { kind: el.dataset.kind, ids: [el.dataset.id] }).then(function (r) {
        if (!r || !r.success) { toast(niceErr(r), 'err'); return; }
        toast('Deleted for good', 'good'); v9LoadTrash();
      });
    }, true);
  },
  'v9-trash-empty': function () {
    v8ConfirmTyped({
      title: 'Empty the whole trash?',
      html: 'Every archived lead, and every deleted meeting, note, task, document and AI chat in <b>' + esc(currentWsName()) + '</b> is removed from the spreadsheet for good.',
      word: 'DELETE', ok: 'Empty trash',
      onOk: function (x, done) {
        api('emptyTrash', {}, { timeout: 180000 }).then(function (r) {
          if (!r || !r.success) { toast(niceErr(r), 'err', 7000); done(false); return; }
          done(); toast(r.total + ' item(s) deleted for good', 'good');
          V9.trash = null; pullFromServer(true).then(function () { renderArchive(); });
        });
      }
    });
  },
  'v9-wipe-ws': function (el) {
    var w = ((Admin.ov && Admin.ov.workspaces) || []).filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!w) return;
    v8ConfirmTyped({
      title: 'Empty “' + w.name + '”?',
      html: '<b>Every lead, meeting, note, task, document, AI chat and history line</b> in this account is deleted for good. Its setup (stages, templates, people, calendar) stays.',
      word: w.name, prompt: 'Type the account name to confirm', ok: 'Empty account',
      onOk: function (x, done) {
        api('adminWipeWorkspace', { id: w.id, confirm: w.name }, { timeout: 240000 }).then(function (r) {
          if (!r || !r.success) { toast(niceErr(r), 'err', 7000); done(false); return; }
          done(); toast('“' + w.name + '” is empty (' + r.rows + ' rows)', 'good');
          if ((Cfg.ws || 'main') === w.id) pullFromServer(true);
          if (ACTIONS['admin-refresh']) ACTIONS['admin-refresh']();
        });
      }
    });
  }
});

/* ═══ STATIC WIRING ═══════════════════════════════════════════════════════ */
(function wireV9() {
  if (v9Get('ev9_rail_off', false)) document.body.classList.add('rail-off');
  document.body.dataset.page = State.ui.page || 'today';

  var bell = $('#btnBell');
  if (bell) bell.addEventListener('click', function (e) { e.stopPropagation(); notifToggle(); });
  var rb = $('#btnRail');
  if (rb) rb.addEventListener('click', function () { if (document.body.classList.contains('rail-off') || !railWide()) railShow(); else railToggle(); });
  var shade = $('#railShade');
  if (shade) shade.addEventListener('click', function () { document.body.classList.remove('rail-open'); });
  document.addEventListener('click', function (e) {
    if (!Notif.open || !e.target.isConnected) return;   // a tab inside the panel redraws it — not an outside click
    var pop = $('#notifPop');
    if (pop && !pop.contains(e.target) && !(bell && bell.contains(e.target))) notifToggle(false);
  });

  // Typing in the lead finished → draw what changed meanwhile.
  var drawer = $('#drawer');
  if (drawer) drawer.addEventListener('focusout', function () {
    setTimeout(function () { if (V9.drawerPending && !v9DrawerBusy()) renderDrawer(); }, 250);
  });

  // g then a letter: jump anywhere.
  var gAt = 0;
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('#modal').classList.contains('show')) return;
    if (e.key === 'g' && !gAt) { gAt = Date.now(); return; }
    if (gAt && Date.now() - gAt < 1200) {
      var page = GO_KEYS[e.key.toLowerCase()];
      gAt = 0;
      if (page) {
        e.preventDefault();
        if (page === 'admin' && !isAdminUser()) return;
        switchPage(page);
      }
      return;
    }
    gAt = 0;
  });

  notifBadge();
  v9CalReturn();

  var tries = 0;
  var waitIn = setInterval(function () {
    tries++;
    if (Cfg.token && State.me && !document.body.classList.contains('gated')) {
      clearInterval(waitIn);
      Notif.list = null; notifBadge();
      deenNext();
      notifWatch();
    } else if (tries > 900) clearInterval(waitIn);
  }, 700);
  setInterval(deenTick, 1000);
  setInterval(function () { try { notifWatch(); } catch (e) {} }, 60000);
})();
