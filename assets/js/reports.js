/* ═══════════════════════════════════════════════════════════════════════════
   reports.js — what happened, day by day

   The Reports page: any day, week, month or range of dates — leads added,
   follow-ups done, people contacted, meetings booked / held / cancelled,
   proposals, wins and losses — compared with the period before, drawn day
   by day, with the list behind every number and, for a single day, the full
   timeline and the pipeline as it stood that evening. The numbers come from
   the server (the "report" action), which reads the whole history and applies
   the same access rules as everything else.

   Also here: the live date on Today and Reports, the "Date added" filter on
   Leads, and the date range on Meetings.
   ═══════════════════════════════════════════════════════════════════════════ */

var Rep = {
  preset: 'month', from: '', to: '',
  data: null, key: '', loading: false, error: '',
  metric: 'leadsAdded', list: 'leads', back: null,
  cache: {}
};

var REP_PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['lastweek', 'Last week'],
  ['month', 'This month'], ['lastmonth', 'Last month'], ['2months', 'Last 2 months'], ['3months', 'Last 3 months'], ['year', 'This year']
];

var REP_TILES = [
  { key: 'leadsAdded', label: 'Leads added', list: 'leads' },
  { key: 'followups', label: 'Follow-ups done', list: 'followups' },
  { key: 'contacted', label: 'People contacted', list: 'contacts' },
  { key: 'meetingsHeld', label: 'Meetings held', list: 'meetings' },
  { key: 'meetingsBooked', label: 'Meetings booked', list: 'booked' },
  { key: 'meetingsCancelled', label: 'Cancelled / no-show', list: 'meetings', bad: true },
  { key: 'proposals', label: 'Proposals sent', list: 'proposals' },
  { key: 'won', label: 'Won', list: 'won' },
  { key: 'lost', label: 'Lost', list: 'lost', bad: true }
];

var REP_LISTS = [
  ['leads', 'Leads added'], ['followups', 'Follow-ups'], ['contacts', 'Contacts'], ['meetings', 'Meetings'],
  ['booked', 'Booked'], ['proposals', 'Proposals'], ['won', 'Won'], ['lost', 'Lost'], ['stages', 'Stage moves']
];

/* ─── dates ─────────────────────────────────────────────────────────────── */
var REP_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var REP_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function repDate(ymd, withYear, withDow) {
  if (!ymd) return '';
  var d = new Date(ymd + 'T12:00:00');
  return (withDow ? REP_DOW[d.getDay()] + ', ' : '') + d.getDate() + ' ' + REP_MON[d.getMonth()] + (withYear ? ' ' + d.getFullYear() : '');
}
function repRangeText(from, to) {
  if (!from) return '';
  if (from === to) return repDate(from, true, true);
  var sameYear = from.slice(0, 4) === to.slice(0, 4);
  var wholeMonth = from.slice(8) === '01' && from.slice(0, 7) === to.slice(0, 7) &&
    Number(to.slice(8)) === new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0).getDate();
  if (wholeMonth) return new Date(from + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return repDate(from, !sameYear) + ' – ' + repDate(to, true);
}
function repTime(hm) {
  if (!hm) return '';
  var p = hm.split(':'), h = Number(p[0]);
  return (h % 12 || 12) + ':' + p[1] + (h < 12 ? 'am' : 'pm');
}

/** The range on screen: a preset, or the dates typed in. */
function repRange() {
  if (Rep.preset) return Dates.range(Rep.preset) || Dates.range('month');
  var r = Dates.range('custom', Rep.from, Rep.to);
  if (!r) return Dates.range('month');
  r.label = r.from === r.to ? (r.from === Dates.today() ? 'Today' : r.from === Dates.addDays(Dates.today(), -1) ? 'Yesterday' : 'Day') : 'Custom range';
  return r;
}

function repSetRange(from, to, remember) {
  if (remember) Rep.back = { preset: Rep.preset, from: Rep.from, to: Rep.to };
  Rep.preset = '';
  Rep.from = from; Rep.to = to;
  renderReports();
}

/* ─── live date ─────────────────────────────────────────────────────────── */
function liveClockText() {
  var d = new Date();
  var h = d.getHours(), m = d.getMinutes();
  return REP_DOW[d.getDay()] + ', ' + d.getDate() + ' ' + REP_MON[d.getMonth()] + ' ' + d.getFullYear() +
    ' · ' + (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' am' : ' pm');
}
function tickLiveClocks() {
  var t = liveClockText();
  $$('[data-live-clock]').forEach(function (el) {
    if (el.dataset.t !== t) {
      el.dataset.t = t;
      el.innerHTML = '<span class="lc-dot" aria-hidden="true"></span><span class="lc-text"></span>';
      el.querySelector('.lc-text').textContent = t;
      el.title = 'Today, now';
    }
  });
}
setInterval(tickLiveClocks, 15000);

/* ─── loading ───────────────────────────────────────────────────────────── */
function repKey(r) { return (Cfg.ws || 'main') + '|' + r.from + '|' + r.to; }

function repLoad(force) {
  var r = repRange();
  var key = repKey(r);
  var hit = Rep.cache[key];
  if (hit) { Rep.data = hit.data; Rep.key = key; }
  if (!force && hit && Date.now() - hit.at < 60000) return;
  if (Rep.loading === key) return;
  Rep.loading = key;
  Rep.error = '';
  api('report', { from: r.from, to: r.to }, { timeout: 45000 }).then(function (res) {
    if (Rep.loading === key) Rep.loading = false;
    if (!res || !res.success) {
      Rep.error = res && res.error === 'NETWORK' ? 'No connection right now — the numbers will load when you are back online.' : ((res && res.error) || 'Could not load the report.');
    } else {
      Rep.cache[key] = { at: Date.now(), data: res };
      if (repKey(repRange()) === key) { Rep.data = res; Rep.key = key; }
    }
    if (State.ui.page === 'reports') drawReports();
  });
}

/* ─── the page ──────────────────────────────────────────────────────────── */
function renderReports() {
  tickLiveClocks();
  repLoad(false);
  drawReports();
}

function drawReports() {
  var root = $('#repRoot');
  if (!root) return;
  var r = repRange();
  var key = repKey(r);
  var d = Rep.data && Rep.key === key ? Rep.data : (Rep.cache[key] && Rep.cache[key].data);
  var busy = !!Rep.loading;
  var today = Dates.today();
  var sub = $('#repSub');
  if (sub) sub.textContent = repRangeText(r.from, r.to) + (r.label && r.label !== 'Custom range' && r.label !== 'Day' ? ' · ' + r.label : '');

  var html = repFilterRow(r, today);
  if (!d) {
    html += Rep.error ? '<div class="card"><div class="card-body"><div class="small" style="color:var(--danger)">' + esc(Rep.error) + '</div>' +
      '<button class="btn btn-sm" data-act="rep-refresh" style="margin-top:10px">Try again</button></div></div>' : loadingBox();
    root.innerHTML = html;
    return;
  }
  var single = d.from === d.to;
  html += '<div class="rep-body' + (busy ? ' is-loading' : '') + '">';
  if (Rep.error) html += '<div class="tiny" style="color:var(--danger);margin-bottom:8px">' + esc(Rep.error) + ' Showing what was loaded before.</div>';
  html += repTiles(d);
  if (single) {
    html += '<div class="chart-grid rep-grid">' + repTimeline(d) + repSnapshot(d) + '</div>';
  } else {
    html += repChart(d) + repTable(d);
    if (d.timeline) html += repTimeline(d);
  }
  html += repLists(d);
  html += '<div class="chart-grid rep-grid">' + (single ? '' : repSnapshot(d)) + repBySource(d) + repByPerson(d) + '</div>';
  html += '<div class="tiny muted rep-foot">Counted on ' + esc(Fmt.value(d.generatedAt)) + (d.money ? '' : ' · deal values are not part of your access') +
    '. Follow-ups count every “Done”; people contacted counts each lead once — by call, message, email, visit, meeting or follow-up.</div>';
  html += '</div>';
  root.innerHTML = html;
}

function repFilterRow(r, today) {
  var canNext = r.to < today;
  return '<div class="rep-filters">' +
    '<div class="pill-row rep-presets">' + REP_PRESETS.map(function (p) {
      return '<button class="pill' + (Rep.preset === p[0] ? ' active' : '') + '" data-act="rep-preset" data-value="' + p[0] + '">' + esc(p[1]) + '</button>';
    }).join('') + '</div>' +
    '<div class="rep-dates">' +
      '<button class="btn btn-sm btn-icon" data-act="rep-step" data-value="-1" title="Earlier" aria-label="Earlier">‹</button>' +
      '<label class="rep-date"><span>From</span><input class="input" type="date" id="repFrom" value="' + esc(r.from) + '" max="' + esc(today) + '"/></label>' +
      '<label class="rep-date"><span>To</span><input class="input" type="date" id="repTo" value="' + esc(r.to) + '" max="' + esc(today) + '"/></label>' +
      '<button class="btn btn-sm btn-icon" data-act="rep-step" data-value="1" title="Later" aria-label="Later"' + (canNext ? '' : ' disabled') + '>›</button>' +
      '<label class="rep-date rep-day"><span>One day</span><input class="input" type="date" id="repDay" value="' + esc(r.from === r.to ? r.from : '') + '" max="' + esc(today) + '"/></label>' +
      '<button class="btn btn-sm btn-icon" data-act="rep-refresh" title="Count again" aria-label="Count again">' + icon('sync', 13) + '</button>' +
      (Rep.back ? '<button class="btn btn-sm" data-act="rep-back">← Back</button>' : '') +
    '</div></div>';
}

/* ─── tiles ── */
function repTileValue(t, key) {
  if (!t) return 0;
  if (key === 'meetingsCancelled') return (t.meetingsCancelled || 0) + (t.noShows || 0);
  return t[key] || 0;
}

function repTiles(d) {
  var t = d.totals, p = d.previous ? d.previous.totals : null;
  var cur = (State.settings && State.settings.currency) || '৳';
  var vsText = d.previous ? 'vs ' + repRangeText(d.previous.from, d.previous.to) : '';
  return '<div class="stat-grid rep-tiles">' + REP_TILES.map(function (tile) {
    var v = repTileValue(t, tile.key);
    var note = '';
    switch (tile.key) {
      case 'contacted': {
        var bt = t.byType || {};
        var bits = [['call', 'calls'], ['message', 'messages'], ['email', 'emails'], ['visit', 'visits']].filter(function (x) { return bt[x[0]]; })
          .map(function (x) { return bt[x[0]] + ' ' + x[1]; });
        note = bits.slice(0, 2).join(' · ');
        break;
      }
      case 'meetingsHeld': note = t.meetingsSet ? 'of ' + t.meetingsSet + ' set for these days' : ''; break;
      case 'meetingsBooked': note = t.bookedOnline ? t.bookedOnline + ' booked online' : ''; break;
      case 'meetingsCancelled': note = t.noShows ? t.noShows + ' no-show' : ''; break;
      case 'proposals': note = d.money && t.proposalValue ? cur + Number(t.proposalValue).toLocaleString() : ''; break;
      case 'won': note = d.money && t.wonValue ? cur + Number(t.wonValue).toLocaleString() : ''; break;
    }
    var delta = '';
    if (p) {
      var pv = repTileValue(p, tile.key), diff = v - pv;
      var good = tile.bad ? diff < 0 : diff > 0;
      delta = diff === 0 ? '<span class="rep-delta same">same as before</span>'
        : '<span class="rep-delta ' + (good ? 'good' : 'bad') + '" title="' + esc(vsText + ': ' + pv) + '">' + (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff) + ' <span class="muted">vs ' + pv + '</span></span>';
    }
    var active = Rep.metric === tile.key;
    return '<button class="stat rep-tile' + (active ? ' active' : '') + '" data-act="rep-drill" data-key="' + tile.key + '" data-list="' + tile.list + '" title="See the list behind this number">' +
      '<div class="stat-label">' + esc(tile.label) + '<span class="rep-open" aria-hidden="true">›</span></div>' +
      '<div class="stat-value">' + v + '</div>' +
      '<div class="stat-note">' + delta + (note ? '<span class="rep-note">' + esc(note) + '</span>' : '') + '</div></button>';
  }).join('') + '</div>' +
  '<div class="tiny muted rep-vs">' + (vsText ? '▲▼ compared with ' + esc(repRangeText(d.previous.from, d.previous.to)) + ' · ' : '') + '<b>Tap any box</b> to see the leads behind it</div>';
}

/* ─── chart: one measure, day by day (or week / month on long ranges) ── */
function repBuckets(d) {
  var s = d.series || [];
  var mode = s.length <= 62 ? 'day' : s.length <= 200 ? 'week' : 'month';
  if (mode === 'day') return { mode: mode, list: s.map(function (x) { return { from: x.date, to: x.date, row: x }; }) };
  var out = [], cur = null;
  s.forEach(function (x) {
    var k = mode === 'month' ? x.date.slice(0, 7) : (function () {
      var dt = new Date(x.date + 'T12:00:00');
      return Dates.addDays(x.date, -((dt.getDay() + 1) % 7));   // the Saturday that starts its week
    })();
    if (!cur || cur.k !== k) { cur = { k: k, from: x.date, to: x.date, row: { date: x.date } }; out.push(cur); }
    cur.to = x.date;
    Object.keys(x).forEach(function (f) { if (f !== 'date') cur.row[f] = (cur.row[f] || 0) + (Number(x[f]) || 0); });
  });
  return { mode: mode, list: out };
}

function repNiceMax(v) {
  if (v <= 4) return 4;
  var p = Math.pow(10, Math.floor(Math.log10(v)));
  var n = [1, 2, 2.5, 5, 10].map(function (k) { return k * p; }).filter(function (k) { return k >= v; })[0];
  return n || v;
}

function repChart(d) {
  var metric = REP_TILES.filter(function (t) { return t.key === Rep.metric; })[0] || REP_TILES[0];
  var sk = metric.key === 'meetingsCancelled' ? 'meetingsCancelled' : metric.key;
  var b = repBuckets(d);
  var vals = b.list.map(function (x) { return Number(x.row[sk]) || 0; });
  var max = repNiceMax(Math.max.apply(null, vals.concat([0])));
  var total = vals.reduce(function (a, x) { return a + x; }, 0);
  var unit = b.mode === 'day' ? 'day' : b.mode === 'week' ? 'week' : 'month';
  var every = Math.max(1, Math.ceil(b.list.length / 10));
  var bars = b.list.map(function (x, i) {
    var v = vals[i];
    var h = max ? Math.round(v / max * 100) : 0;
    var label = b.mode === 'day' ? repDate(x.from, false, true) : b.mode === 'week' ? 'Week of ' + repDate(x.from) : new Date(x.from + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    var tick = (i % every === 0) ? (b.mode === 'month' ? REP_MON[Number(x.from.slice(5, 7)) - 1] : String(Number(x.from.slice(8)))) : '';
    return '<button class="rc-col' + (x.from === Dates.today() ? ' today' : '') + '" data-act="rep-bucket" data-from="' + x.from + '" data-to="' + x.to + '"' +
      ' data-tip="' + esc(label) + '" data-val="' + v + '" aria-label="' + esc(label + ': ' + v + ' ' + metric.label.toLowerCase()) + '">' +
      '<span class="rc-bar' + (v ? '' : ' zero') + '" style="height:' + (v ? Math.max(h, 3) : 0) + '%"></span>' +
      '<span class="rc-tick">' + esc(tick) + '</span></button>';
  }).join('');
  var grid = [1, 0.5, 0].map(function (f) {
    return '<div class="rc-grid" style="bottom:' + (f * 100) + '%"><span>' + Math.round(max * f) + '</span></div>';
  }).join('');
  return '<div class="card rep-chart-card"><div class="card-head"><div class="card-title">' + esc(metric.label) + ' · by ' + unit + '</div>' +
    '<div class="tiny muted">' + total + ' in total · ' + (b.mode === 'day' ? 'click a day to see everything that happened' : 'click a ' + unit + ' to open it') + '</div></div>' +
    '<div class="card-body"><div class="rep-chart" role="group" aria-label="' + esc(metric.label + ' by ' + unit) + '">' +
      '<div class="rc-plot">' + grid + '<div class="rc-cols" style="--n:' + b.list.length + '">' + bars + '</div></div>' +
      '<div class="rc-tip" hidden></div></div></div></div>';
}

/* ─── table: every day (or week / month) ── */
var REP_COLS = [
  ['leadsAdded', 'Leads'], ['followups', 'Follow-ups'], ['contacted', 'Contacted'], ['meetingsHeld', 'Met'],
  ['meetingsCancelled', 'Cancelled'], ['meetingsBooked', 'Booked'], ['proposals', 'Proposals'], ['won', 'Won'], ['lost', 'Lost']
];
function repTable(d) {
  var b = repBuckets(d);
  var rows = b.list.slice().reverse();
  var sum = {};
  REP_COLS.forEach(function (c) { sum[c[0]] = 0; });
  var body = rows.map(function (x) {
    var any = false;
    var cells = REP_COLS.map(function (c) {
      var v = Number(x.row[c[0]]) || 0;
      sum[c[0]] += v;
      if (v) any = true;
      return '<td class="num' + (v ? '' : ' zero') + '">' + v + '</td>';
    }).join('');
    var label = b.mode === 'day' ? repDate(x.from, false, true) : b.mode === 'week' ? repDate(x.from) + ' – ' + repDate(x.to) : new Date(x.from + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    return '<tr class="' + (any ? '' : 'empty') + (x.from === Dates.today() ? ' today' : '') + '" data-act="rep-bucket" data-from="' + x.from + '" data-to="' + x.to + '" tabindex="0">' +
      '<th scope="row">' + esc(label) + '</th>' + cells + '</tr>';
  }).join('');
  var t = d.totals;
  var totalRow = '<tr class="total"><th scope="row">Total</th>' + REP_COLS.map(function (c) {
    var v = c[0] === 'contacted' ? t.contacted : c[0] === 'meetingsCancelled' ? (t.meetingsCancelled + t.noShows) : sum[c[0]];
    return '<td class="num">' + v + '</td>';
  }).join('') + '</tr>';
  return '<div class="card rep-table-card"><div class="card-head"><div class="card-title">' + (b.mode === 'day' ? 'Day by day' : b.mode === 'week' ? 'Week by week' : 'Month by month') + '</div>' +
    '<div class="tiny muted">newest first · total “contacted” counts each lead once</div></div>' +
    '<div class="table-wrap"><table class="mini-table rep-table"><thead><tr><th scope="col">' + (b.mode === 'day' ? 'Day' : b.mode === 'week' ? 'Week' : 'Month') + '</th>' +
    REP_COLS.map(function (c) { return '<th scope="col" class="num">' + esc(c[1]) + '</th>'; }).join('') + '</tr></thead>' +
    '<tbody>' + totalRow + body + '</tbody></table></div></div>';
}

/* ─── a day's timeline ── */
var REP_KIND_ICON = { lead: 'plus', followup: 'check', touch: 'phone', meeting: 'meetings', booked: 'followup', stage: 'pipeline', proposal: 'docs', task: 'tasks', note: 'notes', change: 'edit' };
function repLeadLink(id, name) {
  if (!name) return '<span class="muted">—</span>';
  return id ? '<button class="rep-lead" data-act="open-lead" data-id="' + esc(id) + '">' + esc(name) + '</button>' : '<b>' + esc(name) + '</b>';
}
function repEventText(e) {
  var who = repLeadLink(e.leadId, e.name);
  switch (e.kind) {
    case 'lead': return who + ' added' + (e.source ? ' <span class="muted">· ' + esc(e.source) + '</span>' : '');
    case 'followup': return 'Followed up with ' + who;
    case 'touch': return esc(touchTypeMeta(e.type).label) + ' — ' + who + (e.outcome ? ' <span class="muted">· ' + esc(e.outcome) + '</span>' : '');
    case 'meeting': {
      var st = e.status === 'done' ? '<span class="chip chip-good">held</span>' : e.status === 'cancelled' ? '<span class="chip chip-ghost">cancelled</span>' :
        e.status === 'no_show' ? '<span class="chip chip-warm">no-show</span>' : '<span class="chip chip-info">' + (e.date < Dates.today() ? 'needs outcome' : 'upcoming') + '</span>';
      return 'Meeting with ' + who + (e.title ? ' <span class="muted">· ' + esc(e.title) + '</span>' : '') + ' ' + st;
    }
    case 'booked': return 'Meeting booked with ' + who + ' for ' + esc(repDate(e.forDate)) + (e.forTime ? ' ' + esc(repTime(e.forTime)) : '') + (e.source === 'booking' ? ' <span class="chip chip-info">online</span>' : '');
    case 'stage': return who + ': ' + esc(e.from || '—') + ' → <b>' + esc(e.to) + '</b>' + (e.group === 'won' ? ' <span class="chip chip-good">won</span>' : e.group === 'dead' ? ' <span class="chip chip-ghost">lost</span>' : '');
    case 'proposal': return 'Proposal sent to ' + who;
    case 'task': return 'Task done: ' + esc(e.text || '') + (e.name ? ' <span class="muted">· ' + esc(e.name) + '</span>' : '');
    case 'note': return 'Note: ' + esc(e.text || '');
    case 'change': return esc(fieldLabel(e.field)) + ' on ' + who + ' <span class="muted">' + esc(Fmt.value(e.oldValue, e.field) || 'empty') + ' → ' + esc(Fmt.value(e.newValue, e.field) || 'empty') + '</span>';
  }
  return esc(e.kind);
}

function repTimeline(d) {
  // A call or meeting logged automatically by a stage move or a held meeting
  // is already on the timeline as that move or meeting.
  var tl = (d.timeline || []).filter(function (e) { return !(e.kind === 'touch' && e.auto); });
  var title = d.from === d.to ? 'Everything on ' + repDate(d.from, true, true) : 'Everything that happened';
  if (!tl.length) {
    return '<div class="card"><div class="card-head"><div class="card-title">' + esc(title) + '</div></div>' +
      '<div class="card-body"><div class="muted small">Nothing was recorded on this day.</div></div></div>';
  }
  var lastDate = '';
  var items = tl.map(function (e) {
    var head = '';
    if (d.from !== d.to && e.date !== lastDate) { lastDate = e.date; head = '<div class="rt-date">' + esc(repDate(e.date, true, true)) + '</div>'; }
    return head + '<div class="rt-item"><span class="rt-time">' + esc(repTime(e.time) || '—') + '</span>' +
      '<span class="rt-icon k-' + esc(e.kind) + '">' + icon(REP_KIND_ICON[e.kind] || 'edit', 11) + '</span>' +
      '<span class="rt-text">' + repEventText(e) + (e.by ? ' <span class="rt-by">' + esc(e.by) + '</span>' : '') + '</span></div>';
  }).join('');
  return '<div class="card rep-timeline"><div class="card-head"><div class="card-title">' + esc(title) + '</div>' +
    '<div class="tiny muted">' + tl.length + ' entr' + (tl.length === 1 ? 'y' : 'ies') + '</div></div>' +
    '<div class="card-body"><div class="rt-list">' + items + '</div></div></div>';
}

/* ─── the board that evening ── */
function repSnapshot(d) {
  var s = d.snapshot;
  if (!s) return '';
  var order = (d.stageOrder || []).map(function (x) { return x.name; });
  Object.keys(s.stages || {}).forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
  var now = {};
  var isToday = s.date === Dates.today();
  if (!isToday) activeLeads().forEach(function (l) { now[l.stage] = (now[l.stage] || 0) + 1; });
  var max = Math.max.apply(null, order.map(function (k) { return s.stages[k] || 0; }).concat([1]));
  var rows = order.filter(function (k) { return s.stages[k] || (!isToday && now[k]); }).map(function (k) {
    var c = s.stages[k] || 0;
    var color = stageMeta(k).color;
    return '<div class="bar-row rep-snap-row rep-click" data-act="rep-drill" data-key="stage" data-arg="' + esc(k) + '" title="See these leads"><span class="truncate" title="' + esc(k) + '">' + esc(k) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round(c / max * 100) + '%;background:' + esc(color) + '"></span></span>' +
      '<span class="bar-val"><b>' + c + '</b>' + (isToday ? '' : '<span class="rep-now">' + (now[k] || 0) + '</span>') + '</span></div>';
  }).join('');
  if (rows && !isToday) rows = '<div class="bar-row rep-snap-row rep-snap-head"><span></span><span></span><span class="bar-val"><b>then</b><span class="rep-now">now</span></span></div>' + rows;
  return '<div class="card"><div class="card-head"><div class="card-title">Pipeline at the end of ' + esc(isToday ? 'today' : repDate(s.date, true)) + '</div>' +
    '<div class="tiny muted">' + s.total + ' leads then' + (isToday ? '' : ' · ' + activeLeads().length + ' now') + '</div></div>' +
    '<div class="card-body">' + (rows || '<div class="muted small">No leads yet on that day.</div>') + '</div></div>';
}

function repBySource(d) {
  var list = d.bySource || [];
  if (!list.length) return '';
  var max = Math.max.apply(null, list.map(function (x) { return x.count; }).concat([1]));
  return '<div class="card"><div class="card-head"><div class="card-title">Where the new leads came from</div></div><div class="card-body">' +
    list.map(function (x) {
      return '<div class="bar-row rep-click" data-act="rep-drill" data-key="source" data-arg="' + esc(x.source) + '" title="See these leads"><span class="truncate" title="' + esc(x.source) + '">' + esc(x.source) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round(x.count / max * 100) + '%;background:var(--chart-1)"></span></span>' +
        '<span class="bar-val">' + x.count + '</span></div>';
    }).join('') + '</div></div>';
}

function repByPerson(d) {
  var list = d.byPerson || [];
  if (list.length < 2 && (State.members || []).length < 2) return '';
  if (!list.length) return '';
  return '<div class="card"><div class="card-head"><div class="card-title">Who did what</div></div>' +
    '<div class="table-wrap"><table class="mini-table rep-people"><thead><tr><th scope="col">Person</th><th class="num" scope="col">Added</th><th class="num" scope="col">Follow-ups</th>' +
    '<th class="num" scope="col">Contacts</th><th class="num" scope="col">Booked</th><th class="num" scope="col">Moves</th><th class="num" scope="col">Won</th></tr></thead><tbody>' +
    list.map(function (p) {
      return '<tr class="rep-click" data-act="rep-drill" data-key="person" data-arg="' + esc(p.name) + '" tabindex="0" title="See what ' + esc(p.name) + ' did"><th scope="row">' + esc(p.name) + ' <span class="rep-open">›</span></th><td class="num">' + p.leadsAdded + '</td><td class="num">' + p.followups + '</td><td class="num">' + p.touches +
        '</td><td class="num">' + p.meetingsBooked + '</td><td class="num">' + p.stageMoves + '</td><td class="num">' + p.won + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

/* ─── the lists behind the numbers ── */
function repListRows(d, which, items) {
  var L = d.lists || {};
  var src = items || L[which] || [];
  var cur = (State.settings && State.settings.currency) || '৳';
  var money = function (v) { return d.money && v ? '<span class="chip chip-ghost money">' + esc(cur + Number(v).toLocaleString()) + '</span>' : ''; };
  var when = function (date, time) { return '<span class="rl-when">' + esc(repDate(date, false, true)) + (time ? ' · ' + esc(repTime(time)) : '') + '</span>'; };
  var by = function (b) { return b ? '<span class="rl-by">' + esc(b) + '</span>' : ''; };
  var rows = [];
  switch (which) {
    case 'leads': rows = src.map(function (x) {
      return when(x.date, x.time) + '<span class="rl-main">' + repLeadLink(x.id, x.name) + ' ' + stageChip(x.stage) + (x.archived ? ' <span class="chip chip-ghost">archived</span>' : '') + '</span>' +
        '<span class="rl-side"><span class="muted">' + esc(x.source || '') + '</span>' + money(x.value) + by(x.by) + '</span>';
    }); break;
    case 'followups': rows = src.map(function (x) {
      return when(x.date, x.time) + '<span class="rl-main">' + repLeadLink(x.leadId, x.name) + '</span>' +
        '<span class="rl-side">' + (x.next ? '<span class="muted">next ' + esc(repDate(x.next)) + '</span>' : '') + by(x.by) + '</span>';
    }); break;
    case 'contacts': rows = src.map(function (x) {
      return when(x.date, x.time) + '<span class="rl-main"><span class="chip chip-ghost">' + esc(touchTypeMeta(x.type).label) + '</span> ' + repLeadLink(x.leadId, x.name) +
        (x.outcome ? ' <span class="muted">· ' + esc(x.outcome) + '</span>' : '') + '</span><span class="rl-side">' + (x.auto ? '<span class="tiny muted">from a stage move</span>' : '') + by(x.by) + '</span>';
    }); break;
    case 'meetings': rows = src.map(function (x) {
      var st = x.status === 'done' ? '<span class="chip chip-good">held</span>' : x.status === 'cancelled' ? '<span class="chip chip-ghost">cancelled</span>' :
        x.status === 'no_show' ? '<span class="chip chip-warm">no-show</span>' : '<span class="chip chip-info">' + (x.date < Dates.today() ? 'needs outcome' : 'upcoming') + '</span>';
      return when(x.date, x.time) + '<span class="rl-main">' + repLeadLink(x.leadId, x.name) + ' <span class="muted">· ' + esc(x.title || 'Meeting') + (x.duration ? ' · ' + x.duration + ' min' : '') + '</span>' +
        (x.outcome ? '<span class="rl-sub">' + esc(x.outcome) + '</span>' : '') + '</span><span class="rl-side">' + st + (x.online ? '<span class="chip chip-info">online</span>' : '') + '</span>';
    }); break;
    case 'booked': rows = src.map(function (x) {
      return when(x.date, x.time) + '<span class="rl-main">' + repLeadLink(x.leadId, x.name) + ' <span class="muted">· for ' + esc(repDate(x.forDate, false, true)) + (x.forTime ? ' ' + esc(repTime(x.forTime)) : '') + '</span></span>' +
        '<span class="rl-side">' + by(x.by) + '</span>';
    }); break;
    case 'proposals': rows = src.map(function (x) {
      return when(x.date, '') + '<span class="rl-main">' + repLeadLink(x.leadId, x.name) + '</span><span class="rl-side">' + money(x.value) + by(x.by) + '</span>';
    }); break;
    case 'won': case 'lost': case 'stages': rows = src.map(function (x) {
      return when(x.date, x.time) + '<span class="rl-main">' + repLeadLink(x.leadId, x.name) + ' <span class="muted">' + esc(x.from || '—') + ' →</span> ' + stageChip(x.to) +
        (x.reason ? ' <span class="muted">· ' + esc(x.reason) + '</span>' : '') + '</span><span class="rl-side">' + by(x.by) + '</span>';
    }); break;
    case 'people': rows = src.map(function (x) {
      return '<span class="rl-when">last ' + esc(repDate(x.last, false, true)) + '</span><span class="rl-main">' + repLeadLink(x.id, x.name) + '</span>' +
        '<span class="rl-side"><span class="muted">' + esc(x.how) + '</span></span>';
    }); break;
    case 'snapshot': rows = src.map(function (x) {
      var lead = getLead(x.id);
      return '<span class="rl-main">' + repLeadLink(lead ? x.id : '', x.name) + '</span><span class="rl-side">' +
        (x.status && x.status !== 'active' ? '<span class="chip chip-ghost">archived now</span>' : x.stageNow ? '<span class="muted">now</span> ' + stageChip(x.stageNow) : '') + '</span>';
    }); break;
  }
  return rows;
}

function repLists(d) {
  var L = d.lists || {};
  var tabs = REP_LISTS.map(function (x) {
    var n = (L[x[0]] || []).length;
    return '<button class="pill' + (Rep.list === x[0] ? ' active' : '') + '" data-act="rep-list" data-value="' + x[0] + '">' + esc(x[1]) + '<span class="cnt">' + n + (n >= 300 ? '+' : '') + '</span></button>';
  }).join('');
  var rows = repListRows(d, Rep.list);
  return '<div class="card rep-lists"><div class="card-head rep-lists-head"><div class="pill-row">' + tabs + '</div></div>' +
    '<div class="card-body">' + (rows.length ? '<div class="rl-list">' + rows.map(function (r) { return '<div class="rl-row">' + r + '</div>'; }).join('') + '</div>'
      : '<div class="muted small">Nothing here for ' + esc(repRangeText(d.from, d.to)) + '.</div>') + '</div></div>';
}

/* ─── export ── */
function repCsv(d) {
  var rows = [];
  var t = d.totals, p = d.previous ? d.previous.totals : {};
  rows.push(['Report', repRangeText(d.from, d.to), d.from, d.to]);
  rows.push(['Account', (State.ws && State.ws.name) || '']);
  rows.push([]);
  rows.push(['Measure', 'This period', d.previous ? 'Previous (' + d.previous.from + ' to ' + d.previous.to + ')' : '']);
  REP_TILES.forEach(function (x) { rows.push([x.label, repTileValue(t, x.key), d.previous ? repTileValue(p, x.key) : '']); });
  if (d.money) { rows.push(['Won value', t.wonValue || 0, d.previous ? p.wonValue || 0 : '']); rows.push(['Proposal value', t.proposalValue || 0, d.previous ? p.proposalValue || 0 : '']); }
  rows.push([]);
  rows.push(['Day'].concat(REP_COLS.map(function (c) { return c[1]; })));
  (d.series || []).forEach(function (s) { rows.push([s.date].concat(REP_COLS.map(function (c) { return s[c[0]] || 0; }))); });
  var L = d.lists || {};
  function section(title, head, list, fn) {
    if (!list || !list.length) return;
    rows.push([]); rows.push([title]); rows.push(head);
    list.forEach(function (x) { rows.push(fn(x)); });
  }
  section('Leads added', ['Date', 'Time', 'Lead', 'Source', 'Stage now', 'By'], L.leads, function (x) { return [x.date, x.time, x.name, x.source, x.stage, x.by]; });
  section('Follow-ups done', ['Date', 'Time', 'Lead', 'Next follow-up', 'By'], L.followups, function (x) { return [x.date, x.time, x.name, x.next, x.by]; });
  section('Contacts', ['Date', 'Time', 'Type', 'Lead', 'Outcome', 'By'], L.contacts, function (x) { return [x.date, x.time, x.type, x.name, x.outcome, x.by]; });
  section('Meetings', ['Date', 'Time', 'Lead', 'Title', 'Minutes', 'Status', 'Outcome'], L.meetings, function (x) { return [x.date, x.time, x.name, x.title, x.duration, x.status, x.outcome]; });
  section('Meetings booked', ['Booked on', 'Time', 'Lead', 'For date', 'For time', 'By'], L.booked, function (x) { return [x.date, x.time, x.name, x.forDate, x.forTime, x.by]; });
  section('Proposals', ['Date', 'Lead', 'Value', 'By'], L.proposals, function (x) { return [x.date, x.name, d.money ? x.value : '', x.by]; });
  section('Stage moves', ['Date', 'Time', 'Lead', 'From', 'To', 'By'], L.stages, function (x) { return [x.date, x.time, x.name, x.from, x.to, x.by]; });
  var csv = rows.map(function (r) {
    return r.map(function (c) { var s = c === null || c === undefined ? '' : String(c); return '"' + s.replace(/"/g, '""') + '"'; }).join(',');
  }).join('\r\n');
  var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'everstone-report-' + d.from + (d.to !== d.from ? '-to-' + d.to : '') + '.csv';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  toast('Report downloaded', 'good');
}

function repSummaryText(d) {
  var t = d.totals, p = d.previous ? d.previous.totals : null;
  var cur = (State.settings && State.settings.currency) || '৳';
  function line(label, key) {
    var v = repTileValue(t, key);
    var extra = p ? ' (before: ' + repTileValue(p, key) + ')' : '';
    return label + ': ' + v + extra;
  }
  var out = ['Report — ' + repRangeText(d.from, d.to) + ((State.ws && State.ws.name) ? ' · ' + State.ws.name : ''), ''];
  REP_TILES.forEach(function (x) { out.push(line(x.label, x.key)); });
  if (d.money && t.wonValue) out.push('Won value: ' + cur + Number(t.wonValue).toLocaleString());
  if ((d.bySource || []).length) out.push('', 'New leads by source: ' + d.bySource.map(function (s) { return s.source + ' ' + s.count; }).join(', '));
  if ((d.byPerson || []).length > 1) {
    out.push('', 'By person:');
    d.byPerson.forEach(function (x) { out.push('  ' + x.name + ' — ' + x.leadsAdded + ' added, ' + x.followups + ' follow-ups, ' + x.touches + ' contacts'); });
  }
  return out.join('\n');
}

function repOpenExport() {
  var d = Rep.data;
  if (!d) { toast('The report is still loading.', 'warn'); return; }
  openModal({
    title: 'Export ' + repRangeText(d.from, d.to),
    body: '<div class="rep-export">' +
      '<button class="rep-x" data-act="rep-print">' + icon('docs', 18) + '<span><b>Print or save as PDF</b><span class="tiny muted">The whole report, laid out for paper. Pick “Save as PDF” in the print window.</span></span></button>' +
      '<button class="rep-x" data-act="rep-csv">' + icon('download', 18) + '<span><b>Download for Excel (CSV)</b><span class="tiny muted">Totals, every day, and every list behind the numbers.</span></span></button>' +
      '<button class="rep-x" data-act="rep-copy">' + icon('copy', 18) + '<span><b>Copy a summary</b><span class="tiny muted">Short text to paste into WhatsApp, email or a note.</span></span></button>' +
      '<button class="rep-x" data-act="rep-tg">' + icon('tg', 18) + '<span><b>Send to my Telegram</b><span class="tiny muted">The same numbers, as a message from the bot.</span></span></button>' +
      '</div>',
    foot: '<button class="btn" data-act="close-modal">Close</button>'
  });
}

function repPrint() {
  closeModal();
  var d = Rep.data;
  if (!d) return;
  // Every list prints, not just the open tab.
  var all = REP_LISTS.map(function (x) {
    var rows = repListRows(d, x[0]);
    if (!rows.length) return '';
    return '<div class="card rep-print-list"><div class="card-head"><div class="card-title">' + esc(x[1]) + ' (' + rows.length + ')</div></div><div class="card-body"><div class="rl-list">' +
      rows.map(function (r) { return '<div class="rl-row">' + r + '</div>'; }).join('') + '</div></div></div>';
  }).join('');
  var host = document.createElement('div');
  host.id = 'repPrintExtra';
  host.innerHTML = '<div class="rep-print-head"><b>' + esc((State.ws && State.ws.name) || 'Everstone Digital') + '</b> · Report · ' + esc(repRangeText(d.from, d.to)) +
    ' · printed ' + esc(liveClockText()) + '</div>' + all;
  var root = $('#repRoot');
  if (root) root.appendChild(host);
  document.body.classList.add('print-report');
  var done = function () {
    document.body.classList.remove('print-report');
    var x = $('#repPrintExtra'); if (x) x.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(function () {
    try { window.print(); } catch (e) { toast('Printing is not available here.', 'warn'); }
    setTimeout(done, 1500);
  }, 60);
}

/* ─── actions ── */
Object.assign(ACTIONS, {
  'rep-preset': function (el) { Rep.preset = el.dataset.value; Rep.back = null; renderReports(); },
  'rep-refresh': function () { repLoad(true); drawReports(); },
  'rep-back': function () {
    var b = Rep.back; Rep.back = null;
    if (b) { Rep.preset = b.preset; Rep.from = b.from; Rep.to = b.to; }
    renderReports();
  },
  'rep-step': function (el) {
    var dir = Number(el.dataset.value) || 0;
    var r = repRange(), today = Dates.today();
    var n = Dates.diffDays(r.from, r.to) + 1;
    var from, to;
    var monthish = r.from.slice(8) === '01' && r.from.slice(0, 7) === r.to.slice(0, 7);
    if (monthish) {
      var y = Number(r.from.slice(0, 4)), m = Number(r.from.slice(5, 7)) + dir;
      if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      from = y + '-' + String(m).padStart(2, '0') + '-01';
      to = y + '-' + String(m).padStart(2, '0') + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
    } else {
      from = Dates.addDays(r.from, dir * n); to = Dates.addDays(r.to, dir * n);
    }
    if (from > today) return;
    if (to > today) to = today;
    repSetRange(from, to, false);
  },
  'rep-metric': function (el) { Rep.metric = el.dataset.value; Rep.list = el.dataset.list || Rep.list; drawReports(); },
  'rep-list': function (el) { Rep.list = el.dataset.value; drawReports(); },
  'rep-bucket': function (el) {
    var f = el.dataset.from, t = el.dataset.to;
    if (!f) return;
    var r = repRange();
    if (f === r.from && t === r.to) return;
    repSetRange(f, t, true);
    var top = $('#page-reports');
    if (top && top.scrollIntoView) top.scrollIntoView({ block: 'start' });
  },
  'rep-export': function () { repOpenExport(); },
  'rep-csv': function () { closeModal(); if (Rep.data) repCsv(Rep.data); },
  'rep-print': function () { repPrint(); },
  'rep-copy': function () {
    closeModal();
    if (!Rep.data) return;
    var text = repSummaryText(Rep.data);
    var ok = function () { toast('Summary copied', 'good'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { repCopyFallback(text); });
      else repCopyFallback(text);
    } catch (e) { repCopyFallback(text); }
  },
  'rep-tg': function () {
    closeModal();
    var r = repRange();
    toast('Sending…');
    api('reportSend', { from: r.from, to: r.to, title: r.label && r.label !== 'Custom range' && r.label !== 'Day' ? r.label : (r.from === r.to ? 'Day report' : 'Report') }).then(function (res) {
      if (res && res.success) toast('Sent to your Telegram', 'good');
      else toast((res && res.error) || 'Could not send', 'warn');
    });
  },
  'today-report': function () { Rep.preset = 'today'; Rep.back = null; Rep.metric = 'contacted'; Rep.list = 'contacts'; switchPage('reports'); },
  'open-reports-day': function (el) { Rep.preset = ''; Rep.from = Rep.to = el.dataset.value; Rep.back = null; switchPage('reports'); }
});

function repCopyFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Summary copied', 'good'); } catch (e) { toast('Could not copy', 'warn'); }
  ta.remove();
}

/* Date inputs and the chart tooltip, by delegation (the page re-renders). */
document.addEventListener('change', function (e) {
  var el = e.target;
  if (!el || !el.id) return;
  if (el.id === 'repFrom' || el.id === 'repTo') {
    var f = ($('#repFrom') || {}).value, t = ($('#repTo') || {}).value;
    if (!f && !t) return;
    var today = Dates.today();
    f = f || t; t = t || f;
    if (t > today) t = today;
    if (f > t) { var x = f; f = t; t = x; }
    repSetRange(f, t, false);
  } else if (el.id === 'repDay') {
    if (el.value) repSetRange(el.value, el.value, true);
  }
});

function repTipShow(col) {
  var chart = col.closest('.rep-chart');
  var tip = chart && chart.querySelector('.rc-tip');
  if (!tip) return;
  tip.hidden = false;
  tip.innerHTML = '<b></b><span></span>';
  tip.querySelector('b').textContent = col.dataset.val;
  tip.querySelector('span').textContent = col.dataset.tip;
  var cr = chart.getBoundingClientRect(), r = col.getBoundingClientRect();
  var x = r.left + r.width / 2 - cr.left;
  var w = tip.offsetWidth || 120;
  tip.style.left = Math.max(4, Math.min(cr.width - w - 4, x - w / 2)) + 'px';
}
function repTipHide(chart) { var tip = chart && chart.querySelector('.rc-tip'); if (tip) tip.hidden = true; }
document.addEventListener('pointerover', function (e) {
  var col = e.target && e.target.closest && e.target.closest('.rc-col');
  if (col) repTipShow(col);
});
document.addEventListener('pointerout', function (e) {
  var chart = e.target && e.target.closest && e.target.closest('.rep-chart');
  if (chart && !(e.relatedTarget && chart.contains(e.relatedTarget) && e.relatedTarget.closest('.rc-col'))) repTipHide(chart);
});
document.addEventListener('focusin', function (e) {
  var col = e.target && e.target.closest && e.target.closest('.rc-col');
  if (col) repTipShow(col);
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var t = e.target;
  // cards and rows that act like buttons answer the keyboard too
  if (t && t.dataset && t.dataset.act && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL)$/.test(t.tagName)) { e.preventDefault(); t.click(); return; }
  if (e.key !== 'Enter') return;
  var tr = e.target && e.target.closest && e.target.closest('tr[data-act="rep-bucket"]');
  if (tr) ACTIONS['rep-bucket'](tr);
});

/* ─── page registration and access ── */
PAGE_RENDERERS.reports = renderReports;
if (typeof PAGE_SECTION !== 'undefined') PAGE_SECTION.reports = 'reports';

/* ─── Leads: filter by the date a lead was added ── */
function syncAddedFilter() {
  var f = State.ui.filters || {};
  var sel = $('#fAdded');
  if (sel && sel.value !== (f.added || '')) sel.value = f.added || '';
  var box = $('#fAddedCustom');
  if (box) box.hidden = f.added !== 'custom';
  var a = $('#fAddedFrom'), b = $('#fAddedTo');
  if (a && document.activeElement !== a) a.value = f.addedFrom || '';
  if (b && document.activeElement !== b) b.value = f.addedTo || '';
  var note = $('#addedNote');
  if (note) {
    var r = Dates.range(f.added, f.addedFrom, f.addedTo);
    if (r) {
      var n = filteredLeads().length;
      note.hidden = false;
      note.innerHTML = '<b>' + n + '</b> lead' + (n === 1 ? '' : 's') + ' added ' + esc(r.label === 'Custom' ? repRangeText(r.from, r.to) : r.label.toLowerCase() + ' (' + repRangeText(r.from, r.to) + ')') +
        ' <button class="btn btn-ghost btn-sm" data-act="added-clear">Show all</button>' +
        ' <button class="btn btn-ghost btn-sm" data-act="added-report" data-from="' + r.from + '" data-to="' + r.to + '">Open the report</button>';
    } else note.hidden = true;
  }
}
var _renderLeadsR = renderLeads;
renderLeads = function () { _renderLeadsR.apply(this, arguments); syncAddedFilter(); };
PAGE_RENDERERS.leads = renderLeads;

document.addEventListener('change', function (e) {
  var el = e.target;
  if (!el) return;
  var f = State.ui.filters;
  if (el.id === 'fAdded') { f.added = el.value; if (el.value !== 'custom') { f.addedFrom = ''; f.addedTo = ''; } renderLeads(); if (typeof syncMobileNav === 'function') syncMobileNav(); }
  else if (el.id === 'fAddedFrom') { f.addedFrom = el.value; renderLeads(); }
  else if (el.id === 'fAddedTo') { f.addedTo = el.value; renderLeads(); }
  else if (el.id === 'meetRange') { State.ui.meetRange = el.value; if (el.value !== 'custom') { State.ui.meetFrom = ''; State.ui.meetTo = ''; } renderMeetings(); }
  else if (el.id === 'meetFrom') { State.ui.meetFrom = el.value; renderMeetings(); }
  else if (el.id === 'meetTo') { State.ui.meetTo = el.value; renderMeetings(); }
});

Object.assign(ACTIONS, {
  'added-clear': function () { State.ui.filters.added = ''; State.ui.filters.addedFrom = ''; State.ui.filters.addedTo = ''; renderLeads(); if (typeof syncMobileNav === 'function') syncMobileNav(); },
  'added-report': function (el) { Rep.preset = ''; Rep.from = el.dataset.from; Rep.to = el.dataset.to; Rep.back = null; Rep.metric = 'leadsAdded'; Rep.list = 'leads'; switchPage('reports'); },
  'meet-range-clear': function () { State.ui.meetRange = ''; State.ui.meetFrom = ''; State.ui.meetTo = ''; renderMeetings(); }
});

/* ─── Meetings: a date range over every tab ── */
var _renderMeetingsR = renderMeetings;
renderMeetings = function () {
  _renderMeetingsR.apply(this, arguments);
  var sel = $('#meetRange');
  if (sel && sel.value !== (State.ui.meetRange || '')) sel.value = State.ui.meetRange || '';
  var box = $('#meetRangeCustom');
  if (box) box.hidden = State.ui.meetRange !== 'custom';
  var a = $('#meetFrom'), b = $('#meetTo');
  if (a && document.activeElement !== a) a.value = State.ui.meetFrom || '';
  if (b && document.activeElement !== b) b.value = State.ui.meetTo || '';
  var note = $('#meetRangeNote');
  if (note) {
    var r = Dates.range(State.ui.meetRange, State.ui.meetFrom, State.ui.meetTo);
    if (r) {
      var inR = State.meetings.filter(function (m) { return m.date && m.date >= r.from && m.date <= r.to; });
      var held = inR.filter(function (m) { return m.status === 'done'; }).length;
      var canc = inR.filter(function (m) { return m.status === 'cancelled' || m.status === 'no_show'; }).length;
      note.hidden = false;
      note.innerHTML = esc(repRangeText(r.from, r.to)) + ': <b>' + inR.length + '</b> meeting' + (inR.length === 1 ? '' : 's') + ' · ' + held + ' held · ' + canc + ' cancelled' +
        ' <button class="btn btn-ghost btn-sm" data-act="meet-range-clear">Any date</button>';
    } else note.hidden = true;
  }
};
PAGE_RENDERERS.meetings = renderMeetings;

/* ─── Today: the live date ── */
var _renderTodayR = renderToday;
renderToday = function () {
  _renderTodayR.apply(this, arguments);
  tickLiveClocks();
  var b = $('#btnTodayReport');
  if (b) b.hidden = typeof canSee === 'function' ? !canSee('reports') : false;
};
PAGE_RENDERERS.today = renderToday;
tickLiveClocks();

/* ═══════════════════════════════════════════════════════════════════════════
   EVERY NUMBER OPENS ITS LIST
   A box, a stage on the "pipeline that day" card, a source or a person opens
   a pop-up with the leads behind it. A lead opened from that pop-up comes
   back to the list when it is closed; "Show in Leads" and "Open in Meetings"
   take the same selection to those pages.
   ═══════════════════════════════════════════════════════════════════════════ */
var Drill = { back: null, restoring: false };
var REP_CONTACT = { call: 1, message: 1, email: 1, meeting: 1, visit: 1, negotiation: 1 };

function repUniqueIds(list, key) {
  var seen = {}, out = [];
  (list || []).forEach(function (x) { var id = x[key || 'leadId']; if (id && !seen[id]) { seen[id] = 1; out.push(id); } });
  return out;
}

/** The people contacted in a range: one row per lead, with how. */
function repPeople(d) {
  var L = d.lists || {}, by = {};
  function add(id, name, date, what) {
    if (!id) return;
    var p = by[id] = by[id] || { id: id, name: name, last: '', n: {} };
    if (date > p.last) p.last = date;
    p.n[what] = (p.n[what] || 0) + 1;
  }
  // a held meeting also logs a "meeting" interaction by itself — count it once
  var held = {};
  (L.meetings || []).forEach(function (x) { if (x.status === 'done') held[x.leadId + '|' + x.date] = 1; });
  (L.contacts || []).forEach(function (x) {
    if (!REP_CONTACT[x.type]) return;
    if (x.type === 'meeting' && x.auto && held[x.leadId + '|' + x.date]) return;
    add(x.leadId, x.name, x.date, x.type === 'meeting' ? 'meeting' : touchTypeMeta(x.type).label.toLowerCase());
  });
  (L.followups || []).forEach(function (x) { add(x.leadId, x.name, x.date, 'follow-up'); });
  (L.meetings || []).forEach(function (x) { if (x.status === 'done') add(x.leadId, x.name, x.date, 'meeting'); });
  return Object.keys(by).map(function (id) {
    var p = by[id];
    p.how = Object.keys(p.n).map(function (k) { return p.n[k] + ' ' + k + (p.n[k] > 1 && !/s$/.test(k) ? 's' : ''); }).join(' · ');
    return p;
  }).sort(function (a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : 0; });
}

function repDrillSpec(d, key, arg) {
  var L = d.lists || {};
  var range = repRangeText(d.from, d.to);
  var tile = REP_TILES.filter(function (t) { return t.key === key; })[0];
  var spec = { title: tile ? tile.label : '', sub: range, kind: '', items: [], ids: [], unit: 'lead', meetings: null, added: false, metric: tile ? key : '' };
  switch (key) {
    case 'leadsAdded': spec.kind = 'leads'; spec.items = L.leads || []; spec.ids = repUniqueIds(spec.items, 'id'); spec.added = true; break;
    case 'followups': spec.kind = 'followups'; spec.items = L.followups || []; spec.ids = repUniqueIds(spec.items); spec.unit = 'follow-up'; break;
    case 'contacted': spec.kind = 'people'; spec.items = repPeople(d); spec.ids = spec.items.map(function (x) { return x.id; }); spec.unit = 'person'; break;
    case 'meetingsHeld': spec.kind = 'meetings'; spec.items = (L.meetings || []).filter(function (m) { return m.status === 'done'; }); spec.ids = repUniqueIds(spec.items); spec.unit = 'meeting'; spec.meetings = 'done'; break;
    case 'meetingsCancelled': spec.kind = 'meetings'; spec.items = (L.meetings || []).filter(function (m) { return m.status === 'cancelled' || m.status === 'no_show'; }); spec.ids = repUniqueIds(spec.items); spec.unit = 'meeting'; spec.meetings = 'cancelled'; break;
    case 'meetingsBooked': spec.kind = 'booked'; spec.items = L.booked || []; spec.ids = repUniqueIds(spec.items); spec.unit = 'booking'; break;
    case 'proposals': spec.kind = 'proposals'; spec.items = L.proposals || []; spec.ids = repUniqueIds(spec.items); spec.unit = 'proposal'; break;
    case 'won': case 'lost': spec.kind = key; spec.items = L[key] || []; spec.ids = repUniqueIds(spec.items); break;
    case 'stage': {
      var snap = d.snapshot || {};
      spec.title = arg;
      spec.sub = 'in this stage at the end of ' + (snap.date === Dates.today() ? 'today' : repDate(snap.date, true, true));
      spec.kind = 'snapshot'; spec.items = ((snap.leads || {})[arg]) || []; spec.ids = spec.items.map(function (x) { return x.id; }).filter(getLead);
      break;
    }
    case 'source':
      spec.title = 'New leads from ' + arg; spec.kind = 'leads';
      spec.items = (L.leads || []).filter(function (x) { return (x.source || 'Unknown') === arg; }); spec.ids = repUniqueIds(spec.items, 'id');
      break;
    case 'person': spec.title = arg; spec.kind = 'person'; break;
  }
  return spec;
}

function repDrillBody(d, spec, arg) {
  if (spec.kind === 'person') {
    var L = d.lists || {};
    var mine = function (x) { return x.by === arg; };
    var parts = [
      ['Leads added', 'leads', (L.leads || []).filter(mine)],
      ['Follow-ups done', 'followups', (L.followups || []).filter(mine)],
      ['Contacts', 'contacts', (L.contacts || []).filter(function (x) { return mine(x) && !x.auto && REP_CONTACT[x.type]; })],
      ['Meetings booked', 'booked', (L.booked || []).filter(mine)],
      ['Stage moves', 'stages', (L.stages || []).filter(mine)]
    ];
    var ids = {};
    var html = parts.filter(function (p) { return p[2].length; }).map(function (p) {
      p[2].forEach(function (x) { var id = x.id || x.leadId; if (id) ids[id] = 1; });
      return '<div class="drill-sec"><div class="section-title">' + esc(p[0]) + ' <span class="muted">' + p[2].length + '</span></div><div class="rl-list">' +
        repListRows(d, p[1], p[2]).map(function (r) { return '<div class="rl-row">' + r + '</div>'; }).join('') + '</div></div>';
    }).join('');
    spec.ids = Object.keys(ids).filter(getLead);
    return html || '<div class="muted small">Nothing recorded for ' + esc(arg) + ' in ' + esc(repRangeText(d.from, d.to)) + '.</div>';
  }
  var rows = repListRows(d, spec.kind, spec.items);
  return rows.length ? '<div class="rl-list">' + rows.map(function (r) { return '<div class="rl-row">' + r + '</div>'; }).join('') + '</div>'
    : '<div class="drill-empty">' + icon('check', 18) + '<div>Nothing here for ' + esc(repRangeText(d.from, d.to)) + '.</div></div>';
}

function repOpenDrill(key, arg) {
  var d = Rep.data;
  if (!d) return;
  var spec = repDrillSpec(d, key, arg);
  var body = repDrillBody(d, spec, arg);
  var n = spec.kind === 'person' ? spec.ids.length : spec.items.length;
  var unit = spec.kind === 'person' ? 'lead' : spec.unit;
  var plural = unit === 'person' ? (n === 1 ? 'person' : 'people') : unit + (n === 1 ? '' : 's');
  var leadsN = spec.ids.filter(getLead).length;
  var foot = '';
  if (spec.added) foot += '<button class="btn" data-act="drill-added" data-from="' + d.from + '" data-to="' + d.to + '">' + icon('leads', 13) + ' Show in Leads</button>';
  else if (leadsN) foot += '<button class="btn" data-act="drill-leads" data-ids="' + esc(spec.ids.filter(getLead).join(',')) + '" data-label="' + esc(spec.title + ' · ' + spec.sub) + '">' + icon('leads', 13) + ' Show ' + (leadsN === 1 ? 'this lead' : 'these ' + leadsN + ' leads') + ' in Leads</button>';
  if (spec.meetings) foot += '<button class="btn" data-act="drill-meetings" data-from="' + d.from + '" data-to="' + d.to + '" data-filter="' + spec.meetings + '">' + icon('meetings', 13) + ' Open in Meetings</button>';
  if (spec.metric && d.from !== d.to) foot += '<button class="btn" data-act="drill-chart" data-value="' + spec.metric + '">' + icon('analytics', 13) + ' Day by day</button>';
  foot += '<button class="btn btn-primary" data-act="close-modal">Close</button>';
  openModal({
    title: spec.title,
    wide: true,
    noFocus: true,
    body: '<div class="drill-head"><span class="count-pill"><b>' + n + '</b> ' + esc(plural) + '</span><span class="muted small">' + esc(spec.sub) + '</span></div>' +
      (n ? '<div class="tiny muted drill-hint">Tap a name to open the lead — closing it brings you back here.</div>' : '') + body,
    foot: '<div class="drill-foot">' + foot + '</div>'
  });
}

Object.assign(ACTIONS, {
  'rep-drill': function (el) {
    var key = el.dataset.key;
    if (REP_TILES.some(function (t) { return t.key === key; })) {
      Rep.metric = key; Rep.list = el.dataset.list || Rep.list;
      drawReports();
    }
    repOpenDrill(key, el.dataset.arg);
  },
  'drill-added': function (el) {
    closeModal();
    var f = State.ui.filters;
    f.added = 'custom'; f.addedFrom = el.dataset.from; f.addedTo = el.dataset.to; f.ids = null; f.idsLabel = '';
    switchPage('leads');
  },
  'drill-leads': function (el) {
    closeModal();
    showLeadSet((el.dataset.ids || '').split(',').filter(Boolean), el.dataset.label || 'From the report');
  },
  'drill-meetings': function (el) {
    closeModal();
    State.ui.meetRange = 'custom'; State.ui.meetFrom = el.dataset.from; State.ui.meetTo = el.dataset.to;
    State.ui.meetFilter = el.dataset.filter || 'all';
    switchPage('meetings');
  },
  'drill-chart': function (el) {
    closeModal();
    Rep.metric = el.dataset.value;
    drawReports();
    var c = $('.rep-chart-card');
    if (c && c.scrollIntoView) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
  'drawer-back': function () { closeDetail(); }
});

/** Leads page showing exactly these leads, with a banner to go back to all. */
function showLeadSet(ids, label) {
  var f = State.ui.filters;
  f.ids = ids && ids.length ? ids : null;
  f.idsLabel = label || '';
  f.added = ''; f.addedFrom = ''; f.addedTo = '';
  f.stage = ''; f.health = ''; f.search = '';
  var s = $('#fSearch'); if (s) s.value = '';
  switchPage('leads');
}

/* A lead opened from inside a pop-up: the drawer sits under pop-ups, so the
   pop-up steps aside, and comes back when the lead is closed. */
var _openLeadR = ACTIONS['open-lead'];
ACTIONS['open-lead'] = function (el, e) {
  var modal = $('#modal');
  if (modal && modal.classList.contains('show') && el.closest && el.closest('#modal')) {
    Drill.back = { title: $('#modalTitle').textContent, body: $('#modalBody').innerHTML, foot: $('#modalFoot').innerHTML, wide: $('#modalBox').classList.contains('wide') };
    var scroller = $('#modalBody');
    Drill.back.scroll = scroller ? scroller.scrollTop : 0;
    var keep = Drill.back;
    closeModal();
    Drill.back = keep;
  }
  _openLeadR(el, e);
  var b = $('#drawerBack');
  if (b) b.hidden = !Drill.back;
};

var _openModalR = openModal;
openModal = function (opts) {
  if (!Drill.restoring) Drill.back = null;
  var b = $('#drawerBack'); if (b && !Drill.restoring) b.hidden = true;
  return _openModalR(opts);
};

/** Called by closeDetail: back to the list the lead was opened from. */
function afterDetailClosed() {
  var back = Drill.back;
  var b = $('#drawerBack'); if (b) b.hidden = true;
  if (!back) return;
  Drill.back = null;
  Drill.restoring = true;
  try { openModal({ title: back.title, body: back.body, foot: back.foot, wide: back.wide, noFocus: true }); }
  finally { Drill.restoring = false; }
  var scroller = $('#modalBody');
  if (scroller) scroller.scrollTop = back.scroll || 0;
}

/* Leads page: "these leads" */
var _filteredLeadsR = filteredLeads;
filteredLeads = function () {
  var list = _filteredLeadsR.apply(this, arguments);
  var ids = State.ui.filters.ids;
  if (ids && ids.length) {
    var keep = {};
    ids.forEach(function (id) { keep[id] = 1; });
    list = list.filter(function (l) { return keep[l.id]; });
  }
  return list;
};

var _syncAddedFilterR = syncAddedFilter;
syncAddedFilter = function () {
  _syncAddedFilterR();
  var f = State.ui.filters;
  var note = $('#addedNote');
  if (!note || !f.ids || !f.ids.length) return;
  var n = filteredLeads().length;
  note.hidden = false;
  note.innerHTML = 'Showing <b>' + n + '</b> lead' + (n === 1 ? '' : 's') + ': ' + esc(f.idsLabel || 'a selection') +
    ' <button class="btn btn-ghost btn-sm" data-act="ids-clear">Show all leads</button>';
};

Object.assign(ACTIONS, {
  'ids-clear': function () { State.ui.filters.ids = null; State.ui.filters.idsLabel = ''; renderLeads(); if (typeof syncMobileNav === 'function') syncMobileNav(); },
  'show-leads': function (el) { showLeadSet((el.dataset.ids || '').split(',').filter(Boolean), el.dataset.label || ''); },
  'leads-by': function (el) {
    var f = State.ui.filters;
    f.ids = null; f.idsLabel = ''; f.added = ''; f.health = '';
    f.stage = el.dataset.key === 'stage' ? el.dataset.value : '';
    f.source = el.dataset.key === 'source' ? el.dataset.value : '';
    switchPage('leads');
  }
});

/* The number cards on Today and in the pipeline overview go to exactly the
   leads or meetings they count. */
var _statR = ACTIONS.stat;
ACTIONS.stat = function (el) {
  var k = el.dataset.kind, v = el.dataset.value;
  var f = State.ui.filters;
  if (k === 'added') { f.ids = null; f.health = ''; f.stage = ''; f.added = v; f.addedFrom = ''; f.addedTo = ''; switchPage('leads'); return; }
  if (k === 'meetings') { State.ui.meetRange = v; State.ui.meetFrom = ''; State.ui.meetTo = ''; State.ui.meetFilter = el.dataset.filter || 'all'; switchPage('meetings'); return; }
  if (k === 'ids') { var lab = el.querySelector('.stat-label'); showLeadSet((v || '').split(',').filter(Boolean), lab ? lab.textContent : ''); return; }
  if (k === 'health' || k === 'page') { f.ids = null; f.idsLabel = ''; f.added = ''; }
  return _statR(el);
};

/* ═══════════════════════════════════════════════════════════════════════════
   REPORTS AND THE PIPELINE OVERVIEW ARE ONE PLACE
   "By date" (this file) and "Pipeline overview" (the former Analytics page)
   are two tabs of Reports; one menu item opens both.
   ═══════════════════════════════════════════════════════════════════════════ */
function syncInsightTabs() {
  var page = State.ui.page;
  var okR = typeof canSee !== 'function' || canSee('reports');
  var okA = typeof canSee !== 'function' || canSee('analytics');
  $$('.insight-tabs [data-act="insight-tab"]').forEach(function (b) {
    b.classList.toggle('active', b.dataset.value === page);
    b.hidden = b.dataset.value === 'reports' ? !okR : !okA;
    b.setAttribute('aria-selected', b.dataset.value === page ? 'true' : 'false');
  });
  $$('.insight-tabs').forEach(function (t) { t.hidden = !(okR && okA); });
  var nav = $$('.nav-item[data-page="reports"]');
  nav.forEach(function (n) {
    n.hidden = !(okR || okA);
    n.classList.toggle('active', page === 'reports' || page === 'analytics');
  });
}

Object.assign(ACTIONS, {
  'insight-tab': function (el) { switchPage(el.dataset.value); }
});

var _switchPageR = switchPage;
switchPage = function (page) {
  if (page === 'reports' && typeof canSee === 'function' && !canSee('reports') && canSee('analytics')) page = 'analytics';
  _switchPageR(page);
  syncInsightTabs();
};

var _applyPermR = applyPerm;
applyPerm = function () {
  _applyPermR.apply(this, arguments);
  syncInsightTabs();
  // the Insight heading stays when either tab is open to this person
  $$('.sidebar .nav-group').forEach(function (g) {
    var any = false;
    for (var el = g.nextElementSibling; el && !el.classList.contains('nav-group'); el = el.nextElementSibling) {
      if (el.classList.contains('nav-item') && !el.hidden && el.dataset.page) { any = true; break; }
    }
    g.hidden = !any;
  });
};

var _renderAnalyticsR = renderAnalytics;
renderAnalytics = function () { _renderAnalyticsR.apply(this, arguments); syncInsightTabs(); tickLiveClocks(); };
PAGE_RENDERERS.analytics = renderAnalytics;

applyAiName();
