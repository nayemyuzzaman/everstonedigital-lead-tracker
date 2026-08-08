/* ═══════════════════════════════════════════════════════════════════════════
   core.js — configuration, state, persistence, undo, sync
   Everything that must never lose data lives in this file.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ─── constants ─────────────────────────────────────────────────────────── */
var LS = {
  url: 'ev5_url',
  token: 'ev5_token',
  who: 'ev5_who',
  cache: 'ev5_cache',
  outbox: 'ev5_outbox',
  theme: 'ev5_theme',
  drafts: 'ev5_drafts',
  clientId: 'ev5_gclient',
  seenAlarms: 'ev5_alarms',
  filters: 'ev5_filters'
};

var SYNC_INTERVAL_MS = 90000;
var OUTBOX_RETRY_MS = 20000;
var UNDO_DEPTH = 30;

/* ─── tiny utilities ────────────────────────────────────────────────────── */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/** Escapes for HTML text and quoted attributes alike. Everything user- or
 *  AI-authored goes through this before it reaches innerHTML. */
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uid(prefix) {
  return (prefix || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function debounce(fn, ms) {
  var t;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
  };
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/** A bare domain typed without a scheme resolves against our own origin and
 *  produces a 404 on the dashboard. Always give it a scheme. */
function normalizeUrl(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  if (/^(mailto:|tel:)/i.test(s)) return s;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  return s;
}

function prettyUrl(u) {
  return String(u || '').trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }

/* ─── formatting ────────────────────────────────────────────────────────── */
var Fmt = {
  money: function (n) {
    var v = Number(n) || 0;
    var cur = (State.settings && State.settings.currency) || '৳';
    return cur + v.toLocaleString('en-US');
  },
  compactMoney: function (n) {
    var v = Number(n) || 0;
    var cur = (State.settings && State.settings.currency) || '৳';
    if (v >= 100000) return cur + (v / 1000).toFixed(0) + 'k';
    if (v >= 1000) return cur + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return cur + v;
  },
  date: function (iso) {
    if (!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  },
  shortDate: function (iso) {
    if (!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  },
  time: function (t) {
    if (!t) return '';
    var m = String(t).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return String(t);
    var h = parseInt(m[1], 10), ap = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12 || 12;
    return h12 + ':' + m[2] + ap;
  },
  ago: function (iso) {
    if (!iso) return 'never';
    var d = new Date(iso);
    if (isNaN(d)) return 'never';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    var days = Math.floor(s / 86400);
    if (days === 1) return 'yesterday';
    if (days < 30) return days + 'd ago';
    if (days < 365) return Math.floor(days / 30) + 'mo ago';
    return Math.floor(days / 365) + 'y ago';
  },
  dayLabel: function (iso) {
    var t = Dates.today();
    if (iso === t) return 'Today';
    if (iso === Dates.addDays(t, 1)) return 'Tomorrow';
    if (iso === Dates.addDays(t, -1)) return 'Yesterday';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
};

var Dates = {
  today: function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  addDays: function (iso, n) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  diffDays: function (a, b) {
    if (!a || !b) return 0;
    var x = new Date(a + 'T00:00:00'), y = new Date(b + 'T00:00:00');
    return Math.round((y - x) / 86400000);
  },
  daysSince: function (iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }
};

/* ─── state ─────────────────────────────────────────────────────────────── */
var State = {
  leads: [],
  meetings: [],
  docs: [],
  activities: [],
  settings: {},
  templates: [],
  ui: {
    page: 'today',
    selected: {},
    detailId: null,
    detailTab: 'overview',
    filters: { search: '', stage: '', priority: '', source: '', label: '', health: '', sort: 'smart' },
    meetFilter: 'active',
    archiveFilter: 'all',
    online: navigator.onLine,
    syncing: false
  }
};

var DEFAULT_SETTINGS = {
  stages: [
    { name: 'New', color: '#2563EB' },
    { name: 'Contacted', color: '#7C3AED' },
    { name: 'Meeting', color: '#0891B2' },
    { name: 'Proposal', color: '#EA580C' },
    { name: 'Negotiation', color: '#CA8A04' },
    { name: 'Hired', color: '#059669' },
    { name: 'Dead', color: '#6B7280' }
  ],
  priorities: [
    { key: 'hot', name: 'Hot', color: '#DC2626' },
    { key: 'warm', name: 'Warm', color: '#D97706' },
    { key: 'cold', name: 'Cold', color: '#64748B' }
  ],
  labels: ['Retainer', 'Referral', 'Big Fish', 'Local', 'E-commerce'],
  sources: ['Ads', 'Direct', 'Referral', 'WhatsApp', 'Phone Call', 'Facebook', 'Instagram', 'Cold Call'],
  services: ['SEO', 'Local SEO / GBP', 'Website', 'CRO', 'Social Media', 'Full Package'],
  lostReasons: ['Price too high', 'Bad timing', 'Went with competitor', 'No response', 'Not a fit', 'Doing it in-house'],
  cadence: { Proposal: [2, 5, 10, 21], Meeting: [1, 4, 9], Contacted: [3, 7, 14] },
  rotting: { warnDays: 14, staleDays: 30 },
  closedStages: ['Hired', 'Dead'],
  aiInstructions: '',
  aiModel: 'fast',
  alarmEnabled: true,
  currency: '৳'
};

/* ─── derived helpers ───────────────────────────────────────────────────── */
function getLead(id) {
  for (var i = 0; i < State.leads.length; i++) if (State.leads[i].id === String(id)) return State.leads[i];
  return null;
}
function getMeeting(id) {
  for (var i = 0; i < State.meetings.length; i++) if (State.meetings[i].id === String(id)) return State.meetings[i];
  return null;
}
function activeLeads() {
  return State.leads.filter(function (l) { return l.status !== 'deleted'; });
}
function isClosed(lead) {
  var closed = State.settings.closedStages || ['Hired', 'Dead'];
  return closed.indexOf(lead.stage) >= 0;
}
function openLeads() {
  return activeLeads().filter(function (l) { return !isClosed(l); });
}
function stageMeta(name) {
  var list = State.settings.stages || [];
  for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
  return { name: name || 'New', color: '#6B7280' };
}
function priorityMeta(key) {
  var list = State.settings.priorities || [];
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  return { key: key || 'warm', name: key || 'Warm', color: '#6B7280' };
}

/** How overdue a lead's follow-up is, as a single word the UI can style on. */
function dueState(lead) {
  if (!lead.followup) return 'none';
  var d = Dates.diffDays(Dates.today(), lead.followup);
  if (d < 0) return 'over';
  if (d === 0) return 'today';
  if (d <= 3) return 'soon';
  return 'later';
}

/** Leads go quiet before they go dead. This surfaces the quiet ones. */
function rotState(lead) {
  if (isClosed(lead) || lead.status === 'deleted') return 'none';
  var r = State.settings.rotting || { warnDays: 14, staleDays: 30 };
  var days = Dates.daysSince(lead.lastActivityAt || lead.updatedAt || lead.createdAt);
  if (days === null) return 'none';
  if (days >= r.staleDays) return 'stale';
  if (days >= r.warnDays) return 'warn';
  return 'ok';
}

function needsNextStep(lead) {
  return !isClosed(lead) && lead.status !== 'deleted' && !lead.followup;
}

/** Ranking used by "what needs me" — overdue and hot first, quiet ones next. */
function attentionScore(lead) {
  var s = 0;
  var due = dueState(lead);
  if (due === 'over') s += 100 + Math.min(Dates.diffDays(lead.followup, Dates.today()), 30);
  else if (due === 'today') s += 90;
  else if (due === 'soon') s += 40;
  if (needsNextStep(lead)) s += 55;
  var rot = rotState(lead);
  if (rot === 'stale') s += 45;
  else if (rot === 'warn') s += 22;
  if (lead.priority === 'hot') s += 30;
  else if (lead.priority === 'warm') s += 10;
  if (lead.star) s += 25;
  if (lead.stage === 'Proposal' && lead.proposalSentAt) {
    s += 20 + Math.min(Dates.diffDays(lead.proposalSentAt, Dates.today()), 25);
  }
  s += Math.min((Number(lead.value) || 0) / 5000, 20);
  if (isClosed(lead)) s -= 500;
  return s;
}

function reasonForAttention(lead) {
  var due = dueState(lead);
  if (due === 'over') return Math.abs(Dates.diffDays(Dates.today(), lead.followup)) + ' days overdue';
  if (due === 'today') return 'Follow-up due today';
  if (needsNextStep(lead)) return 'No next step scheduled';
  var rot = rotState(lead);
  if (rot === 'stale') return 'Silent for ' + Dates.daysSince(lead.lastActivityAt) + ' days';
  if (rot === 'warn') return 'Going quiet — ' + Dates.daysSince(lead.lastActivityAt) + ' days';
  if (due === 'soon') return 'Due ' + Fmt.dayLabel(lead.followup);
  if (lead.stage === 'Proposal' && lead.proposalSentAt) {
    return 'Proposal out ' + Dates.diffDays(lead.proposalSentAt, Dates.today()) + ' days';
  }
  return 'Open';
}

/* ─── local cache ───────────────────────────────────────────────────────── */
function saveCache() {
  try {
    localStorage.setItem(LS.cache, JSON.stringify({
      leads: State.leads, meetings: State.meetings, docs: State.docs,
      activities: State.activities.slice(0, 200), settings: State.settings, at: Date.now()
    }));
  } catch (e) { /* quota — the sheet is still the source of truth */ }
}

function loadCache() {
  try {
    var raw = localStorage.getItem(LS.cache);
    if (!raw) return false;
    var c = JSON.parse(raw);
    State.leads = c.leads || [];
    State.meetings = c.meetings || [];
    State.docs = c.docs || [];
    State.activities = c.activities || [];
    State.settings = Object.assign({}, DEFAULT_SETTINGS, c.settings || {});
    return true;
  } catch (e) { return false; }
}

/* ─── store / render bus ────────────────────────────────────────────────── */
var Store = {
  subscribers: [],
  subscribe: function (fn) { this.subscribers.push(fn); },
  /** One call refreshes every visible surface. Views never refresh themselves,
   *  so a change made in one place cannot go missing in another. */
  notify: function () {
    saveCache();
    for (var i = 0; i < this.subscribers.length; i++) {
      try { this.subscribers[i](); }
      catch (e) { console.error('render failed', e); }
    }
  }
};

/* ─── undo ──────────────────────────────────────────────────────────────── */
var UndoStack = {
  items: [],
  push: function (label, undoFn) {
    this.items.push({ label: label, undo: undoFn, at: Date.now() });
    if (this.items.length > UNDO_DEPTH) this.items.shift();
    this.refresh();
  },
  pop: function () {
    var item = this.items.pop();
    this.refresh();
    return item;
  },
  clear: function () { this.items = []; this.refresh(); },
  refresh: function () {
    var btn = $('#btnUndo');
    if (!btn) return;
    btn.disabled = this.items.length === 0;
    var last = this.items[this.items.length - 1];
    btn.title = last ? 'Undo: ' + last.label + '  (Ctrl+Z)' : 'Nothing to undo';
  },
  run: function () {
    var item = this.pop();
    if (!item) { toast('Nothing to undo', 'warn'); return; }
    try {
      item.undo();
      toast('Undone: ' + item.label);
    } catch (e) {
      toast('Could not undo that', 'err');
      console.error(e);
    }
  }
};

/* ─── network ───────────────────────────────────────────────────────────── */
var Cfg = {
  get url() { return localStorage.getItem(LS.url) || ''; },
  set url(v) { localStorage.setItem(LS.url, v || ''); },
  get token() { return localStorage.getItem(LS.token) || ''; },
  set token(v) { v ? localStorage.setItem(LS.token, v) : localStorage.removeItem(LS.token); },
  get who() { return localStorage.getItem(LS.who) || ''; },
  set who(v) { localStorage.setItem(LS.who, v || ''); },
  get clientId() { return localStorage.getItem(LS.clientId) || ''; },
  set clientId(v) { localStorage.setItem(LS.clientId, v || ''); }
};

/**
 * Apps Script rejects a preflight, so requests go out as text/plain — that
 * keeps them "simple" in CORS terms and avoids the OPTIONS round trip.
 */
function api(action, body, opts) {
  opts = opts || {};
  if (!Cfg.url) return Promise.resolve({ success: false, error: 'NO_URL' });

  var timeoutMs = opts.timeout || 45000;
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = setTimeout(function () { if (controller) controller.abort(); }, timeoutMs);

  var request;
  if (action === 'getAll') {
    request = fetch(
      Cfg.url + '?action=getAll&token=' + encodeURIComponent(Cfg.token) + '&_=' + Date.now(),
      { method: 'GET', signal: controller ? controller.signal : undefined }
    );
  } else {
    request = fetch(Cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action, token: Cfg.token }, body || {})),
      signal: controller ? controller.signal : undefined
    });
  }

  return request
    .then(function (r) { return r.json(); })
    .then(function (data) {
      clearTimeout(timer);
      if (data && data.success === false && data.error === 'AUTH') {
        Cfg.token = '';
        showGate('Your session expired. Sign in again.');
      }
      return data;
    })
    .catch(function (err) {
      clearTimeout(timer);
      return { success: false, error: 'NETWORK', detail: String(err) };
    });
}

/* ─── outbox: writes survive a dropped connection ───────────────────────── */
var Outbox = {
  items: [],
  flushing: false,

  load: function () {
    try { this.items = JSON.parse(localStorage.getItem(LS.outbox) || '[]'); }
    catch (e) { this.items = []; }
  },
  persist: function () {
    try { localStorage.setItem(LS.outbox, JSON.stringify(this.items)); } catch (e) {}
  },
  add: function (action, body, meta) {
    this.items.push({
      opId: uid('op'), action: action, body: body || {},
      meta: meta || {}, tries: 0, at: Date.now()
    });
    this.persist();
    setSync();
    this.flush();
  },
  /** Ids with unsent writes — a pull must not overwrite these. */
  pendingLeadIds: function () {
    var s = {};
    this.items.forEach(function (i) {
      var id = (i.body && i.body.lead && i.body.lead.id) || (i.body && i.body.id);
      if (id) s[String(id)] = true;
      if (i.body && Array.isArray(i.body.ids)) i.body.ids.forEach(function (x) { s[String(x)] = true; });
    });
    return s;
  },
  pendingMeetingIds: function () {
    var s = {};
    this.items.forEach(function (i) {
      if (i.action === 'saveMeeting' && i.body && i.body.meeting && i.body.meeting.id) {
        s[String(i.body.meeting.id)] = true;
      }
    });
    return s;
  },

  flush: function () {
    if (this.flushing || !this.items.length) { setSync(); return Promise.resolve(); }
    if (!navigator.onLine || !Cfg.url || !Cfg.token) { setSync(); return Promise.resolve(); }

    this.flushing = true;
    var self = this;
    var item = this.items[0];

    return api(item.action, Object.assign({ opId: item.opId }, item.body), { timeout: 60000 })
      .then(function (res) {
        if (res && res.success) {
          self.items.shift();
          self.persist();
          if (res.lead) mergeServerLead(res.lead);
          if (res.meeting) mergeServerMeeting(res.meeting);
          self.flushing = false;
          setSync();
          if (self.items.length) return self.flush();
          Store.notify();
          return null;
        }

        // A rejection from the server is permanent — retrying cannot fix it.
        var permanent = res && res.success === false && res.error &&
          res.error !== 'NETWORK' && res.error !== 'AUTH';

        if (permanent) {
          self.items.shift();
          self.persist();
          toast('Could not save: ' + res.error, 'err', 8000);
        } else {
          item.tries++;
          self.persist();
        }
        self.flushing = false;
        setSync();
        if (!permanent) setTimeout(function () { self.flush(); }, OUTBOX_RETRY_MS);
        return null;
      })
      .catch(function () {
        item.tries++;
        self.flushing = false;
        self.persist();
        setSync();
        setTimeout(function () { self.flush(); }, OUTBOX_RETRY_MS);
        return null;
      });
  }
};

function mergeServerLead(serverLead) {
  var pending = Outbox.pendingLeadIds();
  if (pending[serverLead.id]) return;
  for (var i = 0; i < State.leads.length; i++) {
    if (State.leads[i].id === serverLead.id) { State.leads[i] = serverLead; return; }
  }
  State.leads.push(serverLead);
}

function mergeServerMeeting(serverMeeting) {
  var pending = Outbox.pendingMeetingIds();
  if (pending[serverMeeting.id]) return;
  for (var i = 0; i < State.meetings.length; i++) {
    if (State.meetings[i].id === serverMeeting.id) { State.meetings[i] = serverMeeting; return; }
  }
  State.meetings.push(serverMeeting);
}

/* ─── sync ──────────────────────────────────────────────────────────────── */
function setSync() {
  var dot = $('#syncDot'), txt = $('#syncText');
  if (!dot || !txt) return;
  dot.className = 'sync-dot';

  if (!navigator.onLine) { dot.classList.add('warn'); txt.textContent = 'Offline'; }
  else if (State.ui.syncing) { dot.classList.add('busy'); txt.textContent = 'Syncing'; }
  else if (Outbox.items.length) { dot.classList.add('busy'); txt.textContent = Outbox.items.length + ' to save'; }
  else if (!Cfg.url) { dot.classList.add('warn'); txt.textContent = 'Not connected'; }
  else { txt.textContent = 'Saved'; }

  var badge = $('#syncBadge');
  if (badge) {
    badge.title = Outbox.items.length
      ? Outbox.items.length + ' change(s) waiting to reach the sheet. They are stored safely on this device.'
      : 'Everything is saved to the sheet.';
  }
}

function pullFromServer(silent) {
  if (!Cfg.url || !Cfg.token) return Promise.resolve(false);
  State.ui.syncing = true; setSync();

  return api('getAll', {}, { timeout: 60000 }).then(function (res) {
    State.ui.syncing = false;

    if (!res || !res.success) {
      setSync();
      if (!silent) toast(res && res.error === 'NETWORK' ? 'Cannot reach the sheet' : 'Sync failed', 'warn');
      return false;
    }

    var pendingLeads = Outbox.pendingLeadIds();
    var pendingMeetings = Outbox.pendingMeetingIds();

    // Server wins, except for rows this device has not managed to send yet.
    var localById = {};
    State.leads.forEach(function (l) { localById[l.id] = l; });
    var merged = (res.leads || []).map(function (sl) {
      return pendingLeads[sl.id] && localById[sl.id] ? localById[sl.id] : sl;
    });
    var serverIds = {};
    (res.leads || []).forEach(function (l) { serverIds[l.id] = true; });
    State.leads.forEach(function (l) { if (!serverIds[l.id]) merged.push(l); });
    State.leads = merged;

    var localMeetById = {};
    State.meetings.forEach(function (m) { localMeetById[m.id] = m; });
    var mergedMeets = (res.meetings || []).map(function (sm) {
      return pendingMeetings[sm.id] && localMeetById[sm.id] ? localMeetById[sm.id] : sm;
    });
    var serverMeetIds = {};
    (res.meetings || []).forEach(function (m) { serverMeetIds[m.id] = true; });
    State.meetings.forEach(function (m) { if (!serverMeetIds[m.id]) mergedMeets.push(m); });
    State.meetings = mergedMeets;

    State.docs = res.docs || State.docs;
    State.activities = res.activities || State.activities;
    if (res.settings) State.settings = Object.assign({}, DEFAULT_SETTINGS, res.settings);

    setSync();
    Store.notify();
    return true;
  });
}

/* ─── lead operations ───────────────────────────────────────────────────── */
var Ops = {
  /**
   * Applies the change locally first so the UI never waits on the network,
   * queues it for the sheet, and registers an undo that reverses exactly the
   * fields that were touched.
   */
  saveLead: function (patch, options) {
    options = options || {};
    var isNew = !patch.id;
    var lead;

    if (isNew) {
      lead = Object.assign({
        id: uid('L'), name: '', site: '', phone: '', wa: '', email: '', contact: '',
        source: 'Ads', stage: 'New', priority: 'warm', labels: [], star: false,
        followup: '', nextStep: '', notes: '', history: [], service: '', value: 0,
        proposalSentAt: '', proposalValue: 0, lostReason: '', status: 'active',
        createdAt: new Date().toISOString(), editCount: 0
      }, patch);
      lead.updatedAt = new Date().toISOString();
      lead.lastActivityAt = lead.updatedAt;
      State.leads.unshift(lead);

      Outbox.add('saveLead', { lead: lead }, { label: 'add lead' });
      if (!options.silent) {
        UndoStack.push('added ' + (lead.name || 'lead'), function () {
          State.leads = State.leads.filter(function (l) { return l.id !== lead.id; });
          Outbox.add('deleteLead', { id: lead.id });
          Store.notify();
        });
      }
    } else {
      lead = getLead(patch.id);
      if (!lead) return null;

      var before = {};
      Object.keys(patch).forEach(function (k) {
        if (k !== 'id') before[k] = clone(lead[k]);
      });

      Object.keys(patch).forEach(function (k) { if (k !== 'id') lead[k] = patch[k]; });
      lead.updatedAt = new Date().toISOString();
      lead.lastActivityAt = lead.updatedAt;
      lead.editCount = (Number(lead.editCount) || 0) + 1;

      Outbox.add('saveLead', { lead: Object.assign({ id: lead.id }, patch) }, { label: 'update lead' });

      if (!options.silent) {
        UndoStack.push(options.label || 'edit on ' + (lead.name || 'lead'), function () {
          var target = getLead(patch.id);
          if (!target) return;
          Object.keys(before).forEach(function (k) { target[k] = before[k]; });
          target.updatedAt = new Date().toISOString();
          Outbox.add('saveLead', { lead: Object.assign({ id: target.id }, before) });
          Store.notify();
        });
      }
    }

    Store.notify();
    return lead;
  },

  addHistory: function (id, text) {
    var lead = getLead(id);
    if (!lead) return;
    var stamp = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    var entry = stamp + ': ' + text;
    var next = (lead.history || []).concat([entry]);
    Ops.saveLead({ id: id, history: next }, { label: 'note on ' + lead.name });
  },

  setStage: function (id, stage) {
    var lead = getLead(id);
    if (!lead || lead.stage === stage) return;
    var patch = { id: id, stage: stage };

    // Entering Proposal starts the follow-up cadence automatically, which is
    // the whole point — a proposal with no next step is how deals die.
    var cadence = (State.settings.cadence || {})[stage];
    if (cadence && cadence.length && !lead.followup) {
      patch.followup = Dates.addDays(Dates.today(), cadence[0]);
      patch.nextStep = 'Follow up on ' + stage.toLowerCase();
    }
    if (stage === 'Proposal' && !lead.proposalSentAt) {
      patch.proposalSentAt = Dates.today();
      if (!lead.proposalValue) patch.proposalValue = lead.value || 0;
    }
    patch.history = (lead.history || []).concat([
      new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ': Stage ' + lead.stage + ' → ' + stage
    ]);

    Ops.saveLead(patch, { label: 'stage change on ' + lead.name });

    if (stage === 'Dead') askLostReason(id);
  },

  completeFollowup: function (id) {
    var lead = getLead(id);
    if (!lead) return;
    var previous = lead.followup;
    var cadence = (State.settings.cadence || {})[lead.stage];
    var nextDate = '';

    // Move to the next beat of the cadence rather than leaving a blank.
    if (cadence && cadence.length && previous) {
      var anchor = lead.proposalSentAt || String(lead.createdAt || '').slice(0, 10) || Dates.today();
      var elapsed = Dates.diffDays(anchor, Dates.today());
      for (var i = 0; i < cadence.length; i++) {
        if (cadence[i] > elapsed) {
          nextDate = Dates.addDays(Dates.today(), cadence[i] - elapsed);
          break;
        }
      }
    }

    Ops.saveLead({
      id: id,
      followup: nextDate,
      history: (lead.history || []).concat([
        new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
        ': Followed up' + (previous ? ' (was due ' + previous + ')' : '')
      ])
    }, { label: 'follow-up on ' + lead.name });

    toastAction(
      (lead.name || 'Lead') + ' — done' + (nextDate ? ', next on ' + Fmt.shortDate(nextDate) : ''),
      'Undo',
      function () { UndoStack.run(); }
    );
  },

  archiveLead: function (id, reason) {
    var lead = getLead(id);
    if (!lead) return;
    var prevStatus = lead.status;
    lead.status = 'deleted';
    if (reason) lead.lostReason = reason;
    Outbox.add('deleteLead', { id: id, reason: reason || '' });

    UndoStack.push('archived ' + (lead.name || 'lead'), function () {
      var target = getLead(id);
      if (!target) return;
      target.status = prevStatus || 'active';
      Outbox.add('restoreLead', { id: id });
      Store.notify();
    });

    Store.notify();
    toastAction('Archived ' + (lead.name || 'lead'), 'Undo', function () { UndoStack.run(); });
  },

  restoreLead: function (id) {
    var lead = getLead(id);
    if (!lead) return;
    lead.status = 'active';
    Outbox.add('restoreLead', { id: id });
    Store.notify();
    toast('Restored ' + (lead.name || 'lead'), 'good');
  },

  saveMeeting: function (patch, options) {
    options = options || {};
    var isNew = !patch.id;
    var meeting;

    if (isNew) {
      meeting = Object.assign({
        id: uid('M'), leadId: '', title: '', date: '', time: '', duration: 45,
        platform: 'google', location: '', agenda: '', status: 'upcoming',
        discussed: '', decision: '', nextStep: '', nextStepDate: '',
        interest: 0, outcome: '', notes: '', star: false,
        createdAt: new Date().toISOString()
      }, patch);
      meeting.updatedAt = meeting.createdAt;
      State.meetings.push(meeting);

      var lead = meeting.leadId ? getLead(meeting.leadId) : null;
      Outbox.add('saveMeeting', {
        meeting: Object.assign({}, meeting, { leadName: lead ? lead.name : '' })
      });

      UndoStack.push('scheduled ' + (meeting.title || 'meeting'), function () {
        State.meetings = State.meetings.filter(function (m) { return m.id !== meeting.id; });
        Outbox.add('deleteMeeting', { id: meeting.id });
        Store.notify();
      });
    } else {
      meeting = getMeeting(patch.id);
      if (!meeting) return null;
      var before = {};
      Object.keys(patch).forEach(function (k) { if (k !== 'id') before[k] = clone(meeting[k]); });
      Object.keys(patch).forEach(function (k) { if (k !== 'id') meeting[k] = patch[k]; });
      meeting.updatedAt = new Date().toISOString();

      var lead2 = meeting.leadId ? getLead(meeting.leadId) : null;
      Outbox.add('saveMeeting', {
        meeting: Object.assign({ id: meeting.id }, patch, { leadName: lead2 ? lead2.name : '' })
      });

      UndoStack.push(options.label || 'meeting edit', function () {
        var target = getMeeting(patch.id);
        if (!target) return;
        Object.keys(before).forEach(function (k) { target[k] = before[k]; });
        Outbox.add('saveMeeting', { meeting: Object.assign({ id: target.id }, before) });
        Store.notify();
      });
    }

    // Logging an outcome with a next step keeps the lead's follow-up honest.
    if (meeting.status === 'done' && meeting.leadId && meeting.nextStepDate) {
      var l = getLead(meeting.leadId);
      if (l) {
        l.followup = meeting.nextStepDate;
        l.nextStep = meeting.nextStep || 'Follow up after meeting';
        l.lastActivityAt = new Date().toISOString();
      }
    }

    Store.notify();
    return meeting;
  },

  deleteMeeting: function (id) {
    var m = getMeeting(id);
    if (!m) return;
    var snapshot = clone(m);
    State.meetings = State.meetings.filter(function (x) { return x.id !== id; });
    Outbox.add('deleteMeeting', { id: id });
    UndoStack.push('deleted ' + (m.title || 'meeting'), function () {
      State.meetings.push(snapshot);
      Outbox.add('saveMeeting', { meeting: snapshot });
      Store.notify();
    });
    Store.notify();
    toastAction('Meeting deleted', 'Undo', function () { UndoStack.run(); });
  },

  saveDoc: function (doc) {
    var d = Object.assign({ id: uid('D'), createdAt: new Date().toISOString() }, doc);
    State.docs.push(d);
    Outbox.add('saveDoc', { doc: d });
    UndoStack.push('added document', function () {
      State.docs = State.docs.filter(function (x) { return x.id !== d.id; });
      Outbox.add('deleteDoc', { id: d.id });
      Store.notify();
    });
    Store.notify();
    return d;
  },

  deleteDoc: function (id) {
    var snapshot = null;
    State.docs.forEach(function (d) { if (d.id === id) snapshot = clone(d); });
    State.docs = State.docs.filter(function (d) { return d.id !== id; });
    Outbox.add('deleteDoc', { id: id });
    if (snapshot) {
      UndoStack.push('deleted document', function () {
        State.docs.push(snapshot);
        Outbox.add('saveDoc', { doc: snapshot });
        Store.notify();
      });
    }
    Store.notify();
  },

  saveSettings: function (patch) {
    State.settings = Object.assign({}, State.settings, patch);
    Outbox.add('saveSettings', { settings: State.settings });
    Store.notify();
  },

  bulkPatch: function (ids, patch, label) {
    var before = {};
    ids.forEach(function (id) {
      var l = getLead(id);
      if (!l) return;
      before[id] = {};
      Object.keys(patch).forEach(function (k) { before[id][k] = clone(l[k]); });
      Object.keys(patch).forEach(function (k) { l[k] = patch[k]; });
      l.updatedAt = new Date().toISOString();
      l.lastActivityAt = l.updatedAt;
    });
    Outbox.add('bulkUpdate', { ids: ids, patch: patch });
    UndoStack.push(label || (ids.length + ' leads changed'), function () {
      Object.keys(before).forEach(function (id) {
        var l = getLead(id);
        if (!l) return;
        Object.keys(before[id]).forEach(function (k) { l[k] = before[id][k]; });
        Outbox.add('saveLead', { lead: Object.assign({ id: id }, before[id]) });
      });
      Store.notify();
    });
    Store.notify();
  }
};

/* ─── drafts: a half-typed form survives a closed tab ───────────────────── */
var Drafts = {
  all: function () {
    try { return JSON.parse(localStorage.getItem(LS.drafts) || '{}'); }
    catch (e) { return {}; }
  },
  get: function (key) { return this.all()[key] || null; },
  set: function (key, data) {
    var d = this.all();
    d[key] = { data: data, at: Date.now() };
    try { localStorage.setItem(LS.drafts, JSON.stringify(d)); } catch (e) {}
  },
  clear: function (key) {
    var d = this.all();
    delete d[key];
    try { localStorage.setItem(LS.drafts, JSON.stringify(d)); } catch (e) {}
  },
  prune: function () {
    var d = this.all(), cutoff = Date.now() - 14 * 86400000, changed = false;
    Object.keys(d).forEach(function (k) {
      if (!d[k] || d[k].at < cutoff) { delete d[k]; changed = true; }
    });
    if (changed) { try { localStorage.setItem(LS.drafts, JSON.stringify(d)); } catch (e) {} }
  }
};

/* ─── toasts ────────────────────────────────────────────────────────────── */
function toast(message, kind, ms) {
  var wrap = $('#toasts');
  if (!wrap) return;
  var el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(function () {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s';
    setTimeout(function () { el.remove(); }, 260);
  }, ms || 3200);
}

function toastAction(message, actionLabel, onAction, ms) {
  var wrap = $('#toasts');
  if (!wrap) return;
  var el = document.createElement('div');
  el.className = 'toast good';
  var span = document.createElement('span');
  span.textContent = message;
  var btn = document.createElement('button');
  btn.className = 't-action';
  btn.textContent = actionLabel;
  btn.addEventListener('click', function () { onAction(); el.remove(); });
  el.appendChild(span); el.appendChild(btn);
  wrap.appendChild(el);
  setTimeout(function () {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s';
    setTimeout(function () { el.remove(); }, 260);
  }, ms || 9000);
}

/* ─── clipboard & share ─────────────────────────────────────────────────── */
function copyText(text, buttonEl) {
  function done() {
    toast('Copied');
    if (buttonEl) {
      buttonEl.classList.add('done');
      setTimeout(function () { buttonEl.classList.remove('done'); }, 1200);
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); }
  catch (e) { toast('Could not copy', 'err'); }
  ta.remove();
}

/* ─── desktop alarm ─────────────────────────────────────────────────────── */
var Alarm = {
  ctx: null,
  /** A short two-tone chime, generated so there is no audio file to host. */
  play: function () {
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      var ctx = this.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      [0, 0.22].forEach(function (offset, i) {
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 880 : 1174;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.22);
      });
    } catch (e) { /* audio blocked until the user interacts — that is fine */ }
  },

  notify: function (title, body, onClick) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      var n = new Notification(title, { body: body, icon: undefined, tag: 'everstone' });
      if (onClick) n.onclick = function () { window.focus(); onClick(); n.close(); };
    }
  },

  requestPermission: function () {
    if (!('Notification' in window)) { toast('This browser has no notifications', 'warn'); return; }
    Notification.requestPermission().then(function (p) {
      toast(p === 'granted' ? 'Notifications are on' : 'Notifications stayed off', p === 'granted' ? 'good' : 'warn');
    });
  },

  seen: function () {
    try { return JSON.parse(localStorage.getItem(LS.seenAlarms) || '{}'); }
    catch (e) { return {}; }
  },

  /** Fires once per lead per day for anything hot and overdue. */
  check: function () {
    if (!State.settings.alarmEnabled) return;
    var seen = this.seen();
    var today = Dates.today();
    var fired = 0;

    openLeads().forEach(function (l) {
      if (l.priority !== 'hot') return;
      var d = dueState(l);
      if (d !== 'today' && d !== 'over') return;
      var key = l.id + ':' + today;
      if (seen[key]) return;
      seen[key] = true;
      fired++;
      Alarm.notify(
        (d === 'over' ? 'Overdue: ' : 'Due today: ') + l.name,
        (l.nextStep || 'Follow up') + (l.phone ? ' · ' + l.phone : ''),
        function () { openDetail(l.id); }
      );
    });

    if (fired) {
      this.play();
      Object.keys(seen).forEach(function (k) {
        if (k.split(':')[1] !== today) delete seen[k];
      });
      try { localStorage.setItem(LS.seenAlarms, JSON.stringify(seen)); } catch (e) {}
    }
  }
};

/* ─── theme ─────────────────────────────────────────────────────────────── */
function applyTheme(mode) {
  var m = mode || localStorage.getItem(LS.theme) ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', m);
  localStorage.setItem(LS.theme, m);
  var btn = $('#btnTheme');
  if (btn) btn.textContent = m === 'dark' ? '☀️' : '🌙';
}
