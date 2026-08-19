/* ═══════════════════════════════════════════════════════════════════════════
   views.js — every screen renders from State, and only from State.
   One notify() refreshes whatever is on screen, so a change made in the drawer
   shows up in the list, the board and the counters at the same instant.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ─── shared fragments ──────────────────────────────────────────────────── */
function icon(name, size) {
  var s = size || 14;
  return '<svg width="' + s + '" height="' + s + '" aria-hidden="true"><use href="#ic-' + name + '"/></svg>';
}

function stageChip(stage) {
  var m = stageMeta(stage);
  return '<span class="chip" style="background:' + esc(m.color) + '1F;color:' + esc(m.color) + '">' +
    '<span class="chip-dot" style="background:' + esc(m.color) + '"></span>' + esc(m.name) + '</span>';
}

function priorityChip(key) {
  var m = priorityMeta(key);
  return '<span class="chip" style="background:' + esc(m.color) + '1F;color:' + esc(m.color) + '">' + esc(m.name) + '</span>';
}

function dueChip(lead) {
  var s = dueState(lead);
  if (s === 'none') return '<span class="lead-due due-none">No date</span>';
  var label = s === 'over'
    ? Math.abs(Dates.diffDays(Dates.today(), lead.followup)) + 'd overdue'
    : s === 'today' ? 'Due today' : Fmt.shortDate(lead.followup);
  return '<span class="lead-due due-' + s + '">' + esc(label) + '</span>';
}

function copyBtn(value, title) {
  return '<button class="copy-btn" data-act="copy" data-value="' + esc(value) + '" title="' + esc(title || 'Copy') + '">' + icon('copy', 12) + '</button>';
}

function emptyState(title, note, actionHtml) {
  return '<div class="empty"><div class="empty-icon">◌</div>' +
    '<div class="empty-title">' + esc(title) + '</div>' +
    (note ? '<div class="empty-note">' + esc(note) + '</div>' : '') +
    (actionHtml ? '<div style="margin-top:14px">' + actionHtml + '</div>' : '') + '</div>';
}

/* ─── chrome: nav badges + recent strip ─────────────────────────────────── */
function renderChrome() {
  var open = openLeads();
  var due = open.filter(function (l) { var d = dueState(l); return d === 'over' || d === 'today'; });
  var noNext = open.filter(needsNextStep);
  var upcomingMeets = State.meetings.filter(function (m) {
    return m.status === 'upcoming' && m.date && m.date >= Dates.today();
  });
  var needOutcome = State.meetings.filter(function (m) {
    return m.status === 'upcoming' && m.date && m.date < Dates.today();
  });

  setBadge('nb-today', due.length + needOutcome.length, due.length > 0);
  setBadge('nb-leads', open.length, false);
  setBadge('nb-followups', due.length, due.length > 0);
  setBadge('nb-meetings', upcomingMeets.length + needOutcome.length, needOutcome.length > 0);
  setBadge('nb-docs', State.docs.length, false);
  var liveNotes = (State.notes || []).filter(function (n) { return !n.archived; }).length;
  var openTasks = (State.tasks || []).filter(function (t) { return !t.done; }).length;
  setBadge('nb-notes', liveNotes + openTasks, (State.tasks || []).some(function (t) {
    return !t.done && t.due && t.due <= Dates.today();
  }));
  setBadge('nb-archive', State.leads.filter(function (l) {
    return l.status !== 'merged' && (l.status === 'deleted' || isClosed(l));
  }).length, false);

  renderRecentStrip();
  setSync();
  UndoStack.refresh();
}

function setBadge(id, value, alert) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.classList.toggle('alert', !!alert);
  el.style.display = value ? '' : 'none';
}

/**
 * The strip along the top of the header: the leads worked on most recently,
 * newest first, each stamped with when. Glancing at it should answer "who was
 * I just dealing with" without opening anything.
 */
function renderRecentStrip() {
  var wrap = $('#recentStrip');
  if (!wrap) return;

  var limit = Number(State.settings.recentLimit) || 8;
  var list = recentlyWorked(limit);
  if (!list.length) { wrap.innerHTML = ''; return; }

  var newestId = activeLeads().slice().sort(function (a, b) {
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  })[0];
  newestId = newestId ? newestId.id : '';

  var out = ['<span class="recent-label">Recent</span>'];
  list.forEach(function (lead) {
    var m = priorityMeta(lead.priority);
    var when = lead.lastActivityAt || lead.updatedAt || lead.createdAt;
    var isNew = lead.id === newestId && Dates.daysSince(lead.createdAt) !== null && Dates.daysSince(lead.createdAt) < 2;
    out.push(
      '<button class="recent-pill' + (isNew ? ' is-new' : '') + '" data-act="open-lead" data-id="' + esc(lead.id) + '"' +
      ' title="' + esc((lead.name || 'Lead') + ' — ' + Fmt.date(when) + ' · ' + Fmt.ago(when)) + '">' +
      '<span class="rp-dot" style="background:' + esc(m.color) + '"></span>' +
      '<span class="rp-name truncate">' + esc(lead.name || 'Untitled') + '</span>' +
      '<span class="rp-when">' + esc(recentStamp(when)) + '</span>' +
      '</button>'
    );
  });

  wrap.innerHTML = out.join('');
}

/** Today and yesterday read better as words; anything older wants a date. */
function recentStamp(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d)) return '—';
  var day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  var today = Dates.today();
  if (day === today) {
    var mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return mins + 'm';
    return Math.floor(mins / 60) + 'h';
  }
  if (day === Dates.addDays(today, -1)) return 'yest';
  return Fmt.shortDate(day);
}

/* ─── TODAY ─────────────────────────────────────────────────────────────── */
function renderToday() {
  var greet = $('#todayGreeting'), sub = $('#todaySub');
  var hour = new Date().getHours();
  var name = (Cfg.who && Cfg.who.indexOf('@') > 0) ? Cfg.who.split('@')[0] : 'Nayem';
  if (greet) {
    greet.textContent = (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening') +
      ', ' + name.charAt(0).toUpperCase() + name.slice(1);
  }

  var open = openLeads();
  var due = open.filter(function (l) { var d = dueState(l); return d === 'over' || d === 'today'; });
  var noNext = open.filter(needsNextStep);
  var meetsToday = State.meetings.filter(function (m) { return m.date === Dates.today() && m.status !== 'cancelled'; });
  var needOutcome = State.meetings.filter(function (m) { return m.status === 'upcoming' && m.date && m.date < Dates.today(); });
  var proposals = open.filter(function (l) { return l.stage === 'Proposal' && l.proposalSentAt; });
  var stale = open.filter(function (l) { return rotState(l) === 'stale'; });

  if (sub) {
    sub.textContent = due.length
      ? due.length + ' follow-up' + (due.length > 1 ? 's' : '') + ' waiting' + (meetsToday.length ? ' · ' + meetsToday.length + ' meeting' + (meetsToday.length > 1 ? 's' : '') + ' today' : '')
      : 'Nothing overdue. ' + open.length + ' leads open.';
  }

  renderFlowStrip();

  var stats = $('#todayStats');
  if (stats) {
    stats.innerHTML = [
      statCard('Needs you now', due.length, due.length ? 'follow-ups due or late' : 'all clear', 'var(--hot)', 'health', 'due'),
      statCard('No next step', noNext.length, noNext.length ? 'these go quiet next' : 'every lead has a date', 'var(--warm)', 'health', 'nonext'),
      statCard('Meetings today', meetsToday.length, needOutcome.length ? needOutcome.length + ' awaiting outcome' : 'scheduled', 'var(--info)', 'page', 'meetings'),
      statCard('Proposals out', proposals.length, proposals.length ? 'waiting on a reply' : 'none pending', 'var(--accent)', 'health', 'proposal'),
      statCard('Open pipeline', Fmt.compactMoney(open.reduce(function (s, l) { return s + (Number(l.value) || 0); }, 0)), open.length + ' live leads', 'var(--good)', 'page', 'leads')
    ].join('');
  }

  var board = $('#todayBoard');
  if (!board) return;

  var blocks = [];

  if (needOutcome.length) {
    blocks.push(cardBlock('Log what happened', needOutcome.length + ' meeting' + (needOutcome.length > 1 ? 's have' : ' has') + ' passed without an outcome',
      needOutcome.slice(0, 5).map(function (m) {
        var lead = getLead(m.leadId);
        return '<div class="tl-item" data-act="meeting-outcome" data-id="' + esc(m.id) + '">' +
          '<span class="tl-time">' + esc(Fmt.shortDate(m.date)) + '</span>' +
          '<div class="grow"><div style="font-weight:620">' + esc(m.title || 'Meeting') + '</div>' +
          '<div class="tiny muted">' + esc(lead ? lead.name : 'No lead linked') + '</div></div>' +
          '<span class="chip chip-warn">Needs outcome</span></div>';
      }).join('')));
  }

  if (meetsToday.length) {
    blocks.push(cardBlock('Today\'s meetings', '', meetsToday
      .sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); })
      .map(function (m) {
        var lead = getLead(m.leadId);
        return '<div class="tl-item" data-act="open-meeting" data-id="' + esc(m.id) + '">' +
          '<span class="tl-time">' + esc(Fmt.time(m.time) || 'TBD') + '</span>' +
          '<div class="grow"><div style="font-weight:620">' + esc(m.title || 'Meeting') + '</div>' +
          '<div class="tiny muted">' + esc(lead ? lead.name : '') + (m.location ? ' · ' + esc(m.location) : '') + '</div></div>' +
          '<span class="chip chip-info">' + esc(m.platform || 'google') + '</span></div>';
      }).join('')));
  }

  var focus = open.slice().sort(function (a, b) { return attentionScore(b) - attentionScore(a); }).slice(0, 8);
  blocks.push(cardBlock('What needs you', 'Ranked by how much it is costing you to wait',
    focus.length ? focus.map(focusRow).join('') : '<div class="muted small" style="padding:10px 0">Nothing urgent. Good place to be.</div>'));

  if (stale.length) {
    blocks.push(cardBlock('Gone quiet', stale.length + ' lead' + (stale.length > 1 ? 's have' : ' has') + ' had no activity in ' + (State.settings.rotting.staleDays) + '+ days',
      stale.slice(0, 6).map(function (l) {
        return '<div class="tl-item" data-act="open-lead" data-id="' + esc(l.id) + '">' +
          '<span class="tl-time">' + esc(Dates.daysSince(l.lastActivityAt) + 'd') + '</span>' +
          '<div class="grow"><div style="font-weight:620">' + esc(l.name) + '</div>' +
          '<div class="tiny muted">' + esc(l.stage) + ' · ' + esc(Fmt.money(l.value)) + '</div></div>' +
          '<button class="btn btn-sm" data-act="quick-followup" data-id="' + esc(l.id) + '">Set a date</button></div>';
      }).join('')));
  }

  board.innerHTML = blocks.join('');
}

function statCard(label, value, note, color, actKind, actValue) {
  return '<div class="stat" style="--stat-accent:' + color + '" data-act="stat" data-kind="' + esc(actKind) + '" data-value="' + esc(actValue) + '">' +
    '<div class="stat-label">' + esc(label) + '</div>' +
    '<div class="stat-value">' + esc(value) + '</div>' +
    '<div class="stat-note">' + esc(note) + '</div></div>';
}

function cardBlock(title, sub, inner) {
  return '<div class="card" style="margin-bottom:14px">' +
    '<div class="card-head"><div class="card-title">' + esc(title) + '</div>' +
    (sub ? '<div class="tiny muted">' + esc(sub) + '</div>' : '') + '</div>' +
    '<div class="card-body">' + inner + '</div></div>';
}

function focusRow(lead) {
  var m = priorityMeta(lead.priority);
  var rot = rotState(lead);
  return '<div class="tl-item" data-act="open-lead" data-id="' + esc(lead.id) + '" style="border-left:3px solid ' + esc(m.color) + '">' +
    '<div class="grow" style="min-width:0">' +
    '<div style="font-weight:640;display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
    (lead.star ? '<span style="color:var(--warm)">' + icon('star', 12) + '</span>' : '') +
    esc(lead.name || 'Untitled') + stageChip(lead.stage) + '</div>' +
    '<div class="tiny ' + (rot === 'stale' ? 'signal rot-stale' : rot === 'warn' ? 'signal rot-warn' : 'muted') + '" style="margin-top:2px">' +
    esc(reasonForAttention(lead)) + (lead.nextStep ? ' — ' + esc(lead.nextStep) : '') + '</div></div>' +
    '<div class="row" style="flex-wrap:nowrap;gap:4px">' +
    (lead.phone ? '<a class="btn btn-sm btn-icon" href="tel:' + esc(lead.phone) + '" data-act="stop" title="Call">' + icon('phone', 13) + '</a>' : '') +
    (lead.phone || lead.wa ? '<button class="btn btn-sm btn-icon" data-act="whatsapp" data-id="' + esc(lead.id) + '" title="WhatsApp">' + icon('wa', 13) + '</button>' : '') +
    '<button class="btn btn-sm" data-act="done-followup" data-id="' + esc(lead.id) + '" title="Mark this follow-up done">Done</button>' +
    '</div></div>';
}

/* ─── LEADS ─────────────────────────────────────────────────────────────── */
function filteredLeads() {
  var f = State.ui.filters;
  var q = f.search.trim().toLowerCase();
  var list = activeLeads().filter(function (l) {
    // Closed leads are shown, not hidden — they just sink. Dead sits at the
    // very bottom, Maybe Not Potential just above it, which is the order Nayem
    // asked for. "Open only" is one click away when the list gets long.
    if (f.health === 'open' && isClosed(l)) return false;
    if (q) {
      var hay = (l.name + ' ' + l.site + ' ' + l.phone + ' ' + l.wa + ' ' + l.email + ' ' +
        l.contact + ' ' + l.notes + ' ' + l.service + ' ' + (l.labels || []).join(' ')).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    if (f.stage && l.stage !== f.stage) return false;
    if (f.priority && l.priority !== f.priority) return false;
    if (f.source && l.source !== f.source) return false;
    if (f.label && (l.labels || []).indexOf(f.label) < 0) return false;

    if (f.health === 'due') { var d = dueState(l); if (d !== 'over' && d !== 'today') return false; }
    if (f.health === 'nonext' && !needsNextStep(l)) return false;
    if (f.health === 'warn' && rotState(l) !== 'warn') return false;
    if (f.health === 'stale' && rotState(l) !== 'stale') return false;
    if (f.health === 'starred' && !l.star) return false;
    if (f.health === 'proposal' && !(l.stage === 'Proposal' && l.proposalSentAt)) return false;
    if (f.health === 'contacted' && !(leadCounts(l).total > 0)) return false;
    if (f.health === 'untouched' && leadCounts(l).total > 0) return false;
    return true;
  });

  var sort = f.sort;

  // Manual order is exactly what was dragged — no clever re-ranking on top of
  // it, otherwise dragging a row looks broken the moment you let go.
  if (sort === 'manual') {
    list.sort(manualCompare);
    return list;
  }

  list.sort(function (a, b) {
    // The bands Nayem asked for: everything live first, then Maybe Not
    // Potential and N/A, then Dead right at the bottom — whatever the sort.
    var sa = bandRank(a.stage) >= 2 ? bandRank(a.stage) : 0;
    var sb = bandRank(b.stage) >= 2 ? bandRank(b.stage) : 0;
    if (sa !== sb) return sa - sb;
    if (!!a.star !== !!b.star) return a.star ? -1 : 1;

    switch (sort) {
      case 'updated': return String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || ''));
      case 'created': return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      case 'followup':
        if (!a.followup) return 1;
        if (!b.followup) return -1;
        return a.followup.localeCompare(b.followup);
      case 'value': return (Number(b.value) || 0) - (Number(a.value) || 0);
      case 'name': return String(a.name || '').localeCompare(String(b.name || ''));
      case 'touched': return (leadCounts(b).total || 0) - (leadCounts(a).total || 0);
      default: return smartCompare(a, b);
    }
  });
  return list;
}

function renderLeads() {
  syncFilterControls();

  var list = filteredLeads();
  var sub = $('#leadsSub');
  if (sub) {
    var open = openLeads();
    var closedShown = list.filter(isClosed).length;
    sub.textContent = list.length + ' shown · ' + open.length + ' open' +
      (closedShown ? ' · ' + closedShown + ' closed at the bottom' : '') + ' · ' +
      Fmt.money(open.reduce(function (s, l) { return s + (Number(l.value) || 0); }, 0)) + ' in play';
  }

  var pills = $('#stagePills');
  if (pills) {
    var counts = {};
    activeLeads().forEach(function (l) { counts[l.stage] = (counts[l.stage] || 0) + 1; });
    pills.innerHTML = '<button class="pill' + (State.ui.filters.stage ? '' : ' active') + '" data-act="stage-filter" data-value="">All<span class="cnt">' + activeLeads().length + '</span></button>' +
      '<button class="pill' + (State.ui.filters.health === 'open' ? ' active' : '') + '" data-act="toggle-open-only"' +
      ' title="Hide Hired, Dead and the rest of the closed stages">' +
      (State.ui.filters.health === 'open' ? 'Open only' : 'Hide closed') + '</button>' +
      (State.settings.stages || []).map(function (s) {
        return '<button class="pill' + (State.ui.filters.stage === s.name ? ' active' : '') + '" data-act="stage-filter" data-value="' + esc(s.name) + '">' +
          '<span class="chip-dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) +
          '<span class="cnt">' + (counts[s.name] || 0) + '</span></button>';
      }).join('');
  }

  var hint = $('#reorderHint');
  if (hint) {
    if (State.ui.filters.sort === 'manual') {
      hint.hidden = false;
      hint.innerHTML = icon('grip', 13) +
        '<span>Showing <b>your own order</b> — drag any row by its handle to move it.</span>' +
        '<button class="btn btn-sm" data-act="sort-smart">Back to smart order</button>';
    } else {
      hint.hidden = true;
      hint.innerHTML = '';
    }
  }

  var host = $('#leadsList');
  if (!host) return;
  host.innerHTML = list.length
    ? list.map(leadRow).join('')
    : emptyState('No leads match', 'Try clearing the filters, or add the lead you are looking for.',
        '<button class="btn btn-primary" data-act="add-lead">Add a lead</button>');

  renderBulkBar();
}

function leadRow(l) {
  var pm = priorityMeta(l.priority);
  var rot = rotState(l);
  var selected = !!State.ui.selected[l.id];
  var days = Dates.daysSince(l.lastActivityAt || l.updatedAt || l.createdAt);
  var r = State.settings.rotting || { warnDays: 14, staleDays: 30 };
  var rotPct = days === null ? 0 : Math.min(100, Math.round(days / r.staleDays * 100));
  var rotColor = rot === 'stale' ? 'var(--hot)' : rot === 'warn' ? 'var(--warm)' : 'var(--good)';

  return '<article class="lead-row' + (selected ? ' selected' : '') + (isClosed(l) ? ' is-closed' : '') + '"' +
    ' style="--row-accent:' + esc(pm.color) + '" data-act="open-lead" data-id="' + esc(l.id) + '">' +

    '<div class="lead-lead">' +
      '<button class="lead-check' + (selected ? ' on' : '') + '" data-act="toggle-select" data-id="' + esc(l.id) + '"' +
      ' aria-label="Select ' + esc(l.name) + '" aria-pressed="' + selected + '">' + (selected ? icon('check', 11) : '') + '</button>' +
      '<span class="lead-grip" draggable="true" data-act="lgrip" data-id="' + esc(l.id) + '" title="Drag to move this lead up or down">' + icon('grip', 13) + '</span>' +
    '</div>' +

    '<div class="lead-main">' +
      '<div class="lead-name">' +
        '<button class="lead-star' + (l.star ? '' : ' off') + '" data-act="toggle-star" data-id="' + esc(l.id) + '" title="' + (l.star ? 'Unstar' : 'Star') + '">' +
        icon(l.star ? 'star' : 'star-o', 13) + '</button>' +
        esc(l.name || 'Untitled') +
        stageChip(l.stage) + priorityChip(l.priority) +
        (l.labels || []).map(function (t) { return '<span class="chip chip-ghost">' + esc(t) + '</span>'; }).join('') +
      '</div>' +
      '<div class="lead-meta">' +
        (l.site ? '<a href="' + esc(normalizeUrl(l.site)) + '" target="_blank" rel="noopener noreferrer" data-act="stop">' + esc(prettyUrl(l.site)) + '</a>' + copyBtn(normalizeUrl(l.site), 'Copy website') : '') +
        (l.site && l.phone ? '<span class="sep">·</span>' : '') +
        (l.phone ? '<a href="tel:' + esc(l.phone) + '" data-act="stop">' + esc(l.phone) + '</a>' + copyBtn(l.phone, 'Copy phone') : '') +
        (l.source ? '<span class="sep">·</span><span>' + esc(l.source) + '</span>' : '') +
        (l.service ? '<span class="sep">·</span><span>' + esc(l.service) + '</span>' : '') +
      '</div>' +
      (l.notes ? '<div class="lead-note">' + esc(l.notes) + '</div>' : '') +
    '</div>' +

    '<div class="lead-signals">' +
      '<div class="signal' + (rot === 'stale' ? ' rot-stale' : rot === 'warn' ? ' rot-warn' : '') + '">' +
        '<span style="min-width:64px">' + esc(days === null ? 'new' : days + 'd quiet') + '</span>' +
        '<span class="sig-bar"><span class="sig-fill" style="width:' + rotPct + '%;background:' + rotColor + '"></span></span>' +
      '</div>' +
      '<div class="signal"><span style="min-width:64px">' + esc((Number(l.editCount) || 0) + ' edits') + '</span>' +
        '<span class="tiny muted truncate">added ' + esc(Fmt.shortDate((l.createdAt || '').slice(0, 10))) + '</span></div>' +
      (touchSummary(l) ? '<div class="signal tiny muted truncate" title="Interactions logged with this lead">' + touchSummary(l) + '</div>' : '') +
      (l.nextStep ? '<div class="signal tiny muted truncate" title="' + esc(l.nextStep) + '">→ ' + esc(l.nextStep) + '</div>' : '') +
    '</div>' +

    '<div class="lead-right">' +
      '<span class="lead-value">' + esc(Fmt.money(l.value)) + '</span>' +
      dueChip(l) +
      '<div class="lead-actions">' +
        (l.phone || l.wa ? '<button class="btn btn-sm btn-icon" data-act="whatsapp" data-id="' + esc(l.id) + '" title="WhatsApp">' + icon('wa', 13) + '</button>' : '') +
        '<button class="btn btn-sm btn-icon" data-act="share-lead" data-id="' + esc(l.id) + '" title="Share">' + icon('share', 13) + '</button>' +
        '<button class="btn btn-sm btn-icon" data-act="edit-lead" data-id="' + esc(l.id) + '" title="Edit">' + icon('edit', 13) + '</button>' +
      '</div>' +
    '</div>' +
  '</article>';
}

function syncFilterControls() {
  var f = State.ui.filters;
  fillSelect('#fStage', 'All stages', (State.settings.stages || []).map(function (s) { return s.name; }), f.stage);
  fillSelect('#fPriority', 'All priorities', (State.settings.priorities || []).map(function (p) { return { value: p.key, label: p.name }; }), f.priority);
  fillSelect('#fSource', 'All sources', State.settings.sources || [], f.source);
  fillSelect('#fLabel', 'All labels', State.settings.labels || [], f.label);
  var h = $('#fHealth'); if (h && h.value !== f.health) h.value = f.health;
  var s = $('#fSort'); if (s && s.value !== f.sort) s.value = f.sort;
  var q = $('#fSearch'); if (q && q.value !== f.search) q.value = f.search;
}

function fillSelect(sel, placeholder, options, current) {
  var el = $(sel);
  if (!el) return;
  var html = '<option value="">' + esc(placeholder) + '</option>' + options.map(function (o) {
    var value = typeof o === 'string' ? o : o.value;
    var label = typeof o === 'string' ? o : o.label;
    return '<option value="' + esc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>';
  }).join('');
  if (el.innerHTML !== html) el.innerHTML = html;
  el.value = current || '';
}

/* ─── BULK BAR ──────────────────────────────────────────────────────────── */
function selectedIds() { return Object.keys(State.ui.selected); }

function renderBulkBar() {
  var bar = $('#bulkbar');
  if (!bar) return;
  var ids = selectedIds();
  bar.classList.toggle('show', ids.length > 0);
  var count = $('#bulkCount');
  if (count) count.textContent = ids.length + ' selected';

  fillSelect('#bulkStage', 'Move to stage…', (State.settings.stages || []).map(function (s) { return s.name; }), '');
  fillSelect('#bulkPriority', 'Set priority…', (State.settings.priorities || []).map(function (p) { return { value: p.key, label: p.name }; }), '');
}

/* ─── PIPELINE ──────────────────────────────────────────────────────────── */
function renderPipeline() {
  var board = $('#kanban');
  if (!board) return;

  var stages = State.settings.stages || [];
  var leads = activeLeads();
  var sub = $('#pipelineSub');
  if (sub) {
    sub.textContent = 'Drag by the handle to move a stage. Click a card to open it. Shift-click to select several.';
  }

  board.innerHTML = stages.map(function (s) {
    var inStage = leads.filter(function (l) { return l.stage === s.name; })
      .sort(function (a, b) { return attentionScore(b) - attentionScore(a); });
    var sum = inStage.reduce(function (t, l) { return t + (Number(l.value) || 0); }, 0);

    return '<div class="kcol" data-stage="' + esc(s.name) + '">' +
      '<div class="kcol-head"><span class="kdot" style="background:' + esc(s.color) + '"></span>' +
      esc(s.name) + '<span class="kcnt">' + inStage.length + '</span>' +
      '</div>' +
      '<div class="ksum" style="margin:-6px 0 8px 2px">' + esc(sum ? Fmt.compactMoney(sum) : '—') + '</div>' +
      inStage.map(kanbanCard).join('') +
      '</div>';
  }).join('');

  renderStageHistory();
}

function kanbanCard(l) {
  var pm = priorityMeta(l.priority);
  var due = dueState(l);
  var selected = !!State.ui.selected[l.id];
  return '<div class="kcard' + (selected ? ' selected' : '') + '" data-id="' + esc(l.id) + '">' +
    '<div class="kgrip" draggable="true" data-act="kgrip" data-id="' + esc(l.id) + '" title="Drag to another stage">' + icon('grip', 14) + '</div>' +
    '<div class="kbody" data-act="kcard" data-id="' + esc(l.id) + '">' +
      '<div class="kname">' +
      (l.star ? '<span style="color:var(--warm)">' + icon('star', 11) + '</span>' : '') +
      '<span class="chip-dot" style="background:' + esc(pm.color) + '"></span>' +
      '<span class="truncate">' + esc(l.name || 'Untitled') + '</span></div>' +
      (l.site ? '<div class="tiny muted truncate">' + esc(prettyUrl(l.site)) + '</div>' : '') +
      '<div class="kmeta">' +
        (l.value ? '<span class="kval">' + esc(Fmt.compactMoney(l.value)) + '</span>' : '') +
        (l.followup ? '<span class="due-' + due + '">' + esc(due === 'over' ? 'late' : Fmt.shortDate(l.followup)) + '</span>' : '<span class="due-none">no date</span>') +
      '</div>' +
    '</div></div>';
}

function renderStageHistory() {
  var host = $('#stageHistory');
  if (!host) return;
  var moves = (State.activities || []).filter(function (a) {
    return a.field === 'stage' || a.type === 'created';
  }).slice(0, 14);

  host.innerHTML = moves.length ? '<div class="hist-list">' + moves.map(function (a) {
    return '<div class="hist-item"><span class="hist-dot ' + (a.type === 'created' ? 'created' : 'stage') + '"></span>' +
      '<span class="hist-text"><b>' + esc(a.leadName || 'Lead') + '</b> ' +
      (a.type === 'created' ? 'was added' : 'moved ' + esc(a.oldValue || '—') + ' → ' + esc(a.newValue || '—')) +
      (a.actor === 'evo' ? ' <span class="chip chip-ghost">Evo</span>' : '') + '</span>' +
      '<span class="hist-when">' + esc(Fmt.ago(a.at)) + '</span></div>';
  }).join('') + '</div>' : '<div class="muted small">No stage changes recorded yet.</div>';
}

/* ─── FOLLOW-UPS ────────────────────────────────────────────────────────── */
function renderFollowups() {
  var host = $('#followTimeline');
  if (!host) return;
  var rangeEl = $('#fuRange');
  var range = parseInt(rangeEl ? rangeEl.value : '30', 10) || 30;
  var today = Dates.today();
  var limit = Dates.addDays(today, range);

  var withDates = openLeads().filter(function (l) { return l.followup && l.followup <= limit; });
  var noDate = openLeads().filter(needsNextStep);

  var sub = $('#followSub');
  if (sub) sub.textContent = withDates.length + ' scheduled · ' + noDate.length + ' with nothing booked';

  var groups = {};
  withDates.forEach(function (l) {
    var key = l.followup < today ? 'overdue' : l.followup;
    (groups[key] = groups[key] || []).push(l);
  });

  var keys = Object.keys(groups).sort(function (a, b) {
    if (a === 'overdue') return -1;
    if (b === 'overdue') return 1;
    return a.localeCompare(b);
  });

  var html = '';

  if (noDate.length) {
    html += '<div class="card" style="margin-bottom:16px;border-color:var(--warm)">' +
      '<div class="card-head"><div class="card-title">' + icon('alert', 14) + ' No next step — ' + noDate.length + '</div>' +
      '<div class="tiny muted">This is the list that quietly loses deals</div></div><div class="card-body">' +
      noDate.slice(0, 12).map(function (l) {
        return '<div class="tl-item" data-act="open-lead" data-id="' + esc(l.id) + '">' +
          '<div class="grow"><div style="font-weight:620">' + esc(l.name) + '</div>' +
          '<div class="tiny muted">' + esc(l.stage) + ' · last touched ' + esc(Fmt.ago(l.lastActivityAt)) + '</div></div>' +
          '<button class="btn btn-sm btn-primary" data-act="quick-followup" data-id="' + esc(l.id) + '">Book it</button></div>';
      }).join('') + '</div></div>';
  }

  html += keys.map(function (key) {
    var items = groups[key];
    var isOverdue = key === 'overdue';
    return '<div class="tl-day"><div class="tl-daylabel">' +
      esc(isOverdue ? 'Overdue' : Fmt.dayLabel(key)) +
      '<span class="tl-tag" style="background:' + (isOverdue ? 'var(--hot-soft);color:var(--hot)' : 'var(--surface-2);color:var(--ink-3)') + '">' +
      items.length + '</span></div>' +
      items.map(function (l) {
        return '<div class="tl-item" data-act="open-lead" data-id="' + esc(l.id) + '">' +
          '<span class="tl-time">' + esc(isOverdue ? Fmt.shortDate(l.followup) : '') + '</span>' +
          '<div class="grow"><div style="font-weight:620;display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
          esc(l.name) + stageChip(l.stage) + '</div>' +
          '<div class="tiny muted">' + esc(l.nextStep || 'No note on what to do') + '</div></div>' +
          '<div class="row" style="flex-wrap:nowrap;gap:4px">' +
          (l.phone || l.wa ? '<button class="btn btn-sm btn-icon" data-act="whatsapp" data-id="' + esc(l.id) + '">' + icon('wa', 13) + '</button>' : '') +
          '<button class="btn btn-sm" data-act="done-followup" data-id="' + esc(l.id) + '">Done</button></div></div>';
      }).join('') + '</div>';
  }).join('');

  if (!withDates.length && !noDate.length) {
    html = emptyState('Nothing booked in this window', 'Every open lead has a date further out. That is a good sign.');
  }

  host.innerHTML = html;
}

/* ─── MEETINGS ──────────────────────────────────────────────────────────── */
function renderMeetings() {
  var host = $('#meetingsList');
  if (!host) return;

  var today = Dates.today();
  var all = State.meetings.slice();
  var needOutcome = all.filter(function (m) { return m.status === 'upcoming' && m.date && m.date < today; });
  var upcoming = all.filter(function (m) { return m.status === 'upcoming' && m.date >= today; });
  var done = all.filter(function (m) { return m.status === 'done'; });
  var cancelled = all.filter(function (m) { return m.status === 'cancelled' || m.status === 'no_show'; });

  var filters = [
    { key: 'active', label: 'Active', count: needOutcome.length + upcoming.length },
    { key: 'outcome', label: 'Needs outcome', count: needOutcome.length },
    { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
    { key: 'done', label: 'Completed', count: done.length },
    { key: 'cancelled', label: 'Cancelled', count: cancelled.length },
    { key: 'all', label: 'Everything', count: all.length }
  ];

  var fEl = $('#meetFilters');
  if (fEl) {
    fEl.innerHTML = filters.map(function (f) {
      return '<button class="pill' + (State.ui.meetFilter === f.key ? ' active' : '') + '" data-act="meet-filter" data-value="' + f.key + '">' +
        esc(f.label) + '<span class="cnt">' + f.count + '</span></button>';
    }).join('');
  }

  var show;
  switch (State.ui.meetFilter) {
    case 'outcome': show = needOutcome; break;
    case 'upcoming': show = upcoming; break;
    case 'done': show = done; break;
    case 'cancelled': show = cancelled; break;
    case 'all': show = all; break;
    default: show = needOutcome.concat(upcoming);
  }

  show = show.slice().sort(function (a, b) {
    var da = a.date || '9999', db = b.date || '9999';
    return State.ui.meetFilter === 'done' ? db.localeCompare(da) : da.localeCompare(db);
  });

  var sub = $('#meetSub');
  if (sub) {
    sub.textContent = needOutcome.length
      ? needOutcome.length + ' meeting' + (needOutcome.length > 1 ? 's' : '') + ' still needs an outcome logged'
      : upcoming.length + ' coming up · ' + done.length + ' completed';
  }

  host.innerHTML = show.length
    ? show.map(meetingCard).join('')
    : emptyState('Nothing here', 'Schedule a meeting and its outcome will be tracked from then on.',
        '<button class="btn btn-primary" data-act="add-meeting">Schedule meeting</button>');
}

function meetingCard(m) {
  var lead = getLead(m.leadId);
  var today = Dates.today();
  var overdue = m.status === 'upcoming' && m.date && m.date < today;
  var accent = overdue ? 'var(--warm)' : m.status === 'done' ? 'var(--good)' :
    m.status === 'cancelled' || m.status === 'no_show' ? 'var(--ink-4)' : 'var(--info)';
  var d = m.date ? new Date(m.date + 'T00:00:00') : null;

  var statusChip = overdue ? '<span class="chip chip-warm">Needs outcome</span>'
    : m.status === 'done' ? '<span class="chip chip-good">Done</span>'
    : m.status === 'no_show' ? '<span class="chip chip-danger">No show</span>'
    : m.status === 'cancelled' ? '<span class="chip chip-ghost">Cancelled</span>'
    : '<span class="chip chip-info">Upcoming</span>';

  var outcome = '';
  if (m.status === 'done' && (m.discussed || m.decision || m.nextStep || m.interest)) {
    outcome = '<div class="meet-outcome"><dl>' +
      (m.discussed ? '<dt>Discussed</dt><dd>' + esc(m.discussed) + '</dd>' : '') +
      (m.decision ? '<dt>Decision</dt><dd>' + esc(m.decision) + '</dd>' : '') +
      (m.nextStep ? '<dt>Next step</dt><dd>' + esc(m.nextStep) + (m.nextStepDate ? ' — <b>' + esc(Fmt.date(m.nextStepDate)) + '</b>' : '') + '</dd>' : '') +
      (m.interest ? '<dt>Interest</dt><dd>' + interestPips(m.interest) + '</dd>' : '') +
      '</dl></div>';
  }

  return '<article class="meet-card" style="--meet-accent:' + accent + '">' +
    '<div class="meet-date">' +
      '<div class="md-day">' + (d ? d.getDate() : '—') + '</div>' +
      '<div class="md-mon">' + (d ? d.toLocaleDateString('en-GB', { month: 'short' }) : '') + '</div>' +
    '</div>' +
    '<div class="meet-body">' +
      '<div class="meet-title">' +
        '<button class="lead-star' + (m.star ? '' : ' off') + '" data-act="toggle-meet-star" data-id="' + esc(m.id) + '">' + icon(m.star ? 'star' : 'star-o', 13) + '</button>' +
        esc(m.title || 'Meeting') + statusChip +
      '</div>' +
      '<div class="meet-sub">' +
        (m.time ? '<span>' + icon('clock', 12) + ' ' + esc(Fmt.time(m.time)) + ' · ' + esc(m.duration || 45) + 'min</span>' : '') +
        (lead ? '<span>· <a href="#" data-act="open-lead" data-id="' + esc(lead.id) + '">' + esc(lead.name) + '</a></span>' : '<span class="muted">· no lead linked</span>') +
        (m.platform ? '<span>· ' + esc(m.platform) + '</span>' : '') +
        (m.location ? '<span>· ' + esc(m.location) + '</span>' : '') +
      '</div>' +
      (m.agenda ? '<div class="tiny muted" style="margin-top:5px">' + esc(m.agenda) + '</div>' : '') +
      outcome +
    '</div>' +
    '<div class="meet-actions">' +
      (m.status === 'upcoming' ? '<button class="btn btn-sm btn-primary" data-act="meeting-outcome" data-id="' + esc(m.id) + '">Log outcome</button>' : '') +
      '<button class="btn btn-sm" data-act="edit-meeting" data-id="' + esc(m.id) + '">Edit</button>' +
      '<button class="btn btn-sm btn-danger btn-icon" data-act="delete-meeting" data-id="' + esc(m.id) + '" title="Delete">' + icon('trash', 13) + '</button>' +
    '</div>' +
  '</article>';
}

function interestPips(n) {
  var out = '<span class="interest">';
  for (var i = 1; i <= 5; i++) out += '<span class="pip' + (i <= n ? ' on' : '') + '"></span>';
  return out + '</span> <span class="tiny muted">' + n + '/5</span>';
}

/* ─── ANALYTICS ─────────────────────────────────────────────────────────── */
function renderAnalytics() {
  var leads = activeLeads();
  var open = openLeads();
  var hired = leads.filter(function (l) { return l.stage === 'Hired'; });
  var dead = leads.filter(function (l) { return l.stage === 'Dead'; });
  var revenue = hired.reduce(function (s, l) { return s + (Number(l.value) || 0); }, 0);
  var pipeline = open.reduce(function (s, l) { return s + (Number(l.value) || 0); }, 0);
  var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  var acts = State.activities || [];
  var addedThisWeek = acts.filter(function (a) { return a.type === 'created' && a.at >= weekAgo; }).length;
  var meetingsHeld = State.meetings.filter(function (m) {
    return m.status === 'done' && m.date && m.date >= weekAgo.slice(0, 10);
  }).length;
  var proposalsSent = leads.filter(function (l) {
    return l.proposalSentAt && l.proposalSentAt >= weekAgo.slice(0, 10);
  }).length;

  var stats = $('#analyticsStats');
  if (stats) {
    stats.innerHTML = [
      statCard('New leads · 7d', addedThisWeek, 'what you put in', 'var(--info)', 'page', 'leads'),
      statCard('Meetings held · 7d', meetingsHeld, 'conversations had', 'var(--accent)', 'page', 'meetings'),
      statCard('Proposals sent · 7d', proposalsSent, 'offers on the table', 'var(--warm)', 'health', 'proposal'),
      statCard('Open pipeline', Fmt.compactMoney(pipeline), open.length + ' live leads', 'var(--good)', 'page', 'leads'),
      statCard('Signed', Fmt.compactMoney(revenue), hired.length + ' clients · ' + (leads.length ? Math.round(hired.length / leads.length * 100) : 0) + '% win rate', 'var(--good)', 'page', 'archive')
    ].join('');
  }

  var charts = $('#analyticsCharts');
  if (!charts) return;

  // funnel
  var stageOrder = (State.settings.stages || []).map(function (s) { return s.name; });
  var counts = {};
  leads.forEach(function (l) { counts[l.stage] = (counts[l.stage] || 0) + 1; });
  var maxStage = Math.max.apply(null, stageOrder.map(function (s) { return counts[s] || 0; }).concat([1]));

  var funnel = stageOrder.map(function (s) {
    var c = counts[s] || 0;
    var m = stageMeta(s);
    var pct = Math.round(c / maxStage * 100);
    return '<div class="funnel-step"><span class="truncate">' + esc(s) + '</span>' +
      '<div class="funnel-bar" style="width:' + Math.max(pct, 4) + '%;background:' + esc(m.color) + '">' + (c || '') + '</div>' +
      '<span class="bar-val">' + esc(Fmt.compactMoney(leads.filter(function (l) { return l.stage === s; }).reduce(function (t, l) { return t + (Number(l.value) || 0); }, 0))) + '</span></div>';
  }).join('');

  // sources
  var bySource = {};
  leads.forEach(function (l) {
    var k = l.source || 'Unknown';
    bySource[k] = bySource[k] || { total: 0, won: 0, value: 0 };
    bySource[k].total++;
    if (l.stage === 'Hired') { bySource[k].won++; bySource[k].value += Number(l.value) || 0; }
  });
  var sourceKeys = Object.keys(bySource).sort(function (a, b) { return bySource[b].total - bySource[a].total; });
  var maxSource = Math.max.apply(null, sourceKeys.map(function (k) { return bySource[k].total; }).concat([1]));

  var sources = sourceKeys.map(function (k) {
    var s = bySource[k];
    var rate = s.total ? Math.round(s.won / s.total * 100) : 0;
    return '<div class="bar-row"><span class="truncate" title="' + esc(k) + '">' + esc(k) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round(s.total / maxSource * 100) + '%;background:var(--accent)"></span></span>' +
      '<span class="bar-val">' + s.total + '</span></div>' +
      '<div class="tiny muted" style="margin:-4px 0 8px 118px">' + s.won + ' won · ' + rate + '% · ' + esc(Fmt.compactMoney(s.value)) + '</div>';
  }).join('');

  // loss reasons
  var reasons = {};
  dead.forEach(function (l) {
    var k = l.lostReason || 'Not recorded';
    reasons[k] = (reasons[k] || 0) + 1;
  });
  var reasonKeys = Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a]; });
  var maxReason = Math.max.apply(null, reasonKeys.map(function (k) { return reasons[k]; }).concat([1]));
  var lossHtml = reasonKeys.length ? reasonKeys.map(function (k) {
    return '<div class="bar-row"><span class="truncate" title="' + esc(k) + '">' + esc(k) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round(reasons[k] / maxReason * 100) + '%;background:var(--hot)"></span></span>' +
      '<span class="bar-val">' + reasons[k] + '</span></div>';
  }).join('') : '<div class="muted small">No losses recorded yet. When you mark a lead Dead you will be asked why — that is what fills this in.</div>';

  // health
  var warn = open.filter(function (l) { return rotState(l) === 'warn'; }).length;
  var stale = open.filter(function (l) { return rotState(l) === 'stale'; }).length;
  var noNext = open.filter(needsNextStep).length;
  var due = open.filter(function (l) { var d = dueState(l); return d === 'over' || d === 'today'; }).length;

  var healthHtml = [
    ['Follow-up due or late', due, 'var(--hot)', 'due'],
    ['No next step booked', noNext, 'var(--warm)', 'nonext'],
    ['Going quiet', warn, 'var(--warm)', 'warn'],
    ['Gone cold', stale, 'var(--hot)', 'stale']
  ].map(function (row) {
    var pct = open.length ? Math.round(row[1] / open.length * 100) : 0;
    return '<div class="bar-row" data-act="stat" data-kind="health" data-value="' + row[3] + '" style="cursor:pointer">' +
      '<span class="truncate">' + esc(row[0]) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%;background:' + row[2] + '"></span></span>' +
      '<span class="bar-val">' + row[1] + '</span></div>';
  }).join('');

  charts.innerHTML =
    chartCard('Pipeline by stage', funnel) +
    chartCard('Pipeline health', healthHtml + '<div class="tiny muted" style="margin-top:8px">Click a row to filter the lead list.</div>') +
    chartCard('Where leads come from', sources || '<div class="muted small">No leads yet.</div>') +
    chartCard('Why deals are lost', lossHtml);
}

function chartCard(title, inner) {
  return '<div class="card"><div class="card-head"><div class="card-title">' + esc(title) + '</div></div>' +
    '<div class="card-body">' + inner + '</div></div>';
}

/* ─── MESSAGES ──────────────────────────────────────────────────────────── */
var TEMPLATES = [
  {
    id: 'first-touch', name: 'First touch', cat: 'Outreach',
    body: 'Hi {{contact}},\n\nI was looking at {{site}} and noticed a few things holding back its search visibility — the kind of gaps that quietly cost enquiries every month.\n\nI put together a short breakdown of what I found. No charge, no obligation: I would rather show you something useful than pitch cold.\n\nWould it help if I sent it over?\n\nNayemuzzaman\nSEO & CRO Strategist\nEverstone Digital'
  },
  {
    id: 'after-call', name: 'After the first call', cat: 'Follow-up',
    body: 'Hi {{contact}},\n\nThanks for your time today. To recap what we agreed:\n\n• {{note}}\n\nI will have the proposal with you by {{date}}. If anything above does not match your understanding, tell me now and I will correct it before it goes into writing.\n\nNayemuzzaman\nSEO & CRO Strategist\nEverstone Digital'
  },
  {
    id: 'proposal-sent', name: 'Proposal sent', cat: 'Proposal',
    body: 'Hi {{contact}},\n\nThe proposal for {{name}} is attached. The short version: {{service}}, and the first measurable movement should be visible within 60 to 90 days.\n\nI have kept it to the work that matters rather than a long list you would never read.\n\nHappy to walk through it on a call if that is easier than reading it.\n\nNayemuzzaman\nSEO & CRO Strategist\nEverstone Digital'
  },
  {
    id: 'nudge', name: 'Gentle nudge', cat: 'Follow-up',
    body: 'Hi {{contact}},\n\nJust checking in on the proposal I sent for {{name}}. No pressure at all — I know these decisions rarely sit at the top of the pile.\n\nIf the timing is wrong, tell me and I will stop chasing. If something in it gave you pause, I would genuinely rather hear that than nothing.\n\nNayemuzzaman\nSEO & CRO Strategist\nEverstone Digital'
  },
  {
    id: 'last-call', name: 'Breakup message', cat: 'Follow-up',
    body: 'Hi {{contact}},\n\nI have reached out a few times about {{name}} and not heard back, so I will assume the timing is not right and leave it there.\n\nIf things change later this year, you know where to find me. Either way, I hope the business goes well.\n\nNayemuzzaman\nSEO & CRO Strategist\nEverstone Digital'
  },
  {
    id: 'welcome', name: 'Welcome aboard', cat: 'Closing',
    body: 'Hi {{contact}},\n\nDelighted to be working with you. Here is what happens next:\n\n• This week: full audit and baseline measurement\n• Week two: the fixes that move fastest\n• Month one: first progress report, plain English, no jargon\n\nYou will hear from me regularly, whether the news is good or not.\n\nNayemuzzaman\nSEO & CRO Strategist\nEverstone Digital'
  }
];

function renderMessages() {
  var host = $('#templateList');
  if (!host) return;

  var picker = $('#tplLead');
  if (picker) {
    var current = picker.value;
    picker.innerHTML = '<option value="">No lead selected</option>' + activeLeads()
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
      .map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === current ? ' selected' : '') + '>' + esc(l.name) + '</option>'; })
      .join('');
  }

  var lead = picker && picker.value ? getLead(picker.value) : null;

  host.innerHTML = TEMPLATES.map(function (t) {
    var body = fillTemplate(t.body, lead);
    return '<div class="card" style="margin-bottom:10px">' +
      '<div class="card-head"><div class="card-title">' + esc(t.name) +
      '<span class="chip chip-ghost">' + esc(t.cat) + '</span></div>' +
      '<div class="row" style="gap:5px">' +
      '<button class="btn btn-sm" data-act="tpl-copy" data-id="' + esc(t.id) + '">' + icon('copy', 12) + ' Copy</button>' +
      (lead && (lead.phone || lead.wa) ? '<button class="btn btn-sm" data-act="tpl-wa" data-id="' + esc(t.id) + '">' + icon('wa', 12) + ' WhatsApp</button>' : '') +
      (lead && lead.email ? '<button class="btn btn-sm" data-act="tpl-mail" data-id="' + esc(t.id) + '">' + icon('mail', 12) + ' Email</button>' : '') +
      '<button class="btn btn-sm" data-act="tpl-tg" data-id="' + esc(t.id) + '">' + icon('tg', 12) + '</button>' +
      '</div></div>' +
      '<div class="card-body"><div style="white-space:pre-wrap;font-size:13px;line-height:1.65;color:var(--ink-2)">' +
      esc(body) + '</div></div></div>';
  }).join('');
}

function fillTemplate(body, lead) {
  var map = {
    name: lead ? (lead.name || '') : '{{name}}',
    contact: lead ? (lead.contact || 'there') : 'there',
    site: lead ? (prettyUrl(lead.site) || 'your website') : 'your website',
    phone: lead ? (lead.phone || '') : '',
    service: lead ? (lead.service || 'search and conversion work') : 'search and conversion work',
    note: lead ? (lead.nextStep || lead.notes || '—') : '—',
    date: Fmt.date(Dates.addDays(Dates.today(), 2))
  };
  return String(body).replace(/\{\{(\w+)\}\}/g, function (m, k) {
    return map[k] !== undefined ? map[k] : m;
  });
}

/* ─── DOCS ──────────────────────────────────────────────────────────────── */
function renderDocs() {
  var host = $('#docsList');
  if (!host) return;
  var sub = $('#docsSub');
  if (sub) sub.textContent = State.docs.length + ' file' + (State.docs.length === 1 ? '' : 's') + ' linked to leads';

  if (!State.docs.length) {
    host.innerHTML = emptyState('No documents yet', 'Link proposals, audits and contracts so they sit next to the lead they belong to.',
      '<button class="btn btn-primary" data-act="add-doc">Add document</button>');
    return;
  }

  var icons = { audit: '🔍', proposal: '📄', invoice: '🧾', sheet: '📊', deck: '📽', doc: '📝', image: '🖼', pdf: '📕', link: '🔗', other: '📎' };

  host.innerHTML = '<div class="card"><div class="card-body" style="padding:8px">' +
    State.docs.slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    }).map(function (d) {
      var lead = getLead(d.leadId);
      return '<div class="tl-item">' +
        '<span style="font-size:17px">' + (icons[d.type] || icons.other) + '</span>' +
        '<div class="grow" style="min-width:0">' +
        '<div style="font-weight:620" class="truncate">' + esc(d.name || 'Untitled') + '</div>' +
        '<div class="tiny muted truncate">' + esc(lead ? lead.name : 'No lead') + ' · ' + esc(Fmt.shortDate((d.createdAt || '').slice(0, 10))) + '</div></div>' +
        '<div class="row" style="gap:4px;flex-wrap:nowrap">' +
        (d.url ? '<a class="btn btn-sm" href="' + esc(normalizeUrl(d.url)) + '" target="_blank" rel="noopener noreferrer">Open</a>' : '') +
        (d.url ? copyBtn(normalizeUrl(d.url), 'Copy link') : '') +
        '<button class="btn btn-sm btn-danger btn-icon" data-act="delete-doc" data-id="' + esc(d.id) + '">' + icon('trash', 12) + '</button>' +
        '</div></div>';
    }).join('') + '</div></div>';
}

/* ─── ARCHIVE ───────────────────────────────────────────────────────────── */
function renderArchive() {
  var host = $('#archiveList');
  if (!host) return;

  // A merged row is not archived, it no longer exists as a lead — it lives on
  // inside the record it was folded into.
  var live = State.leads.filter(function (l) { return l.status !== 'merged'; });
  var won = ['Hired', 'Nayem Client'];
  var deleted = live.filter(function (l) { return l.status === 'deleted'; });
  var hired = live.filter(function (l) { return l.status !== 'deleted' && won.indexOf(l.stage) >= 0; });
  var dead = live.filter(function (l) { return l.status !== 'deleted' && l.stage === 'Dead'; });
  var merged = State.leads.filter(function (l) { return l.status === 'merged'; });

  var filters = [
    { key: 'all', label: 'Everything', count: deleted.length + hired.length + dead.length },
    { key: 'hired', label: 'Won', count: hired.length },
    { key: 'dead', label: 'Lost', count: dead.length },
    { key: 'deleted', label: 'Deleted', count: deleted.length },
    { key: 'merged', label: 'Merged away', count: merged.length }
  ];
  var fEl = $('#archiveFilters');
  if (fEl) {
    fEl.innerHTML = filters.map(function (f) {
      return '<button class="pill' + (State.ui.archiveFilter === f.key ? ' active' : '') + '" data-act="archive-filter" data-value="' + f.key + '">' +
        esc(f.label) + '<span class="cnt">' + f.count + '</span></button>';
    }).join('');
  }

  var show = State.ui.archiveFilter === 'hired' ? hired
    : State.ui.archiveFilter === 'dead' ? dead
    : State.ui.archiveFilter === 'deleted' ? deleted
    : State.ui.archiveFilter === 'merged' ? merged
    : hired.concat(dead, deleted);

  show = show.slice().sort(function (a, b) {
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });

  host.innerHTML = show.length ? show.map(function (l) {
    return '<article class="lead-row is-closed" style="--row-accent:' + esc(stageMeta(l.stage).color) + '" data-act="open-lead" data-id="' + esc(l.id) + '">' +
      '<span></span>' +
      '<div class="lead-main"><div class="lead-name">' + esc(l.name || 'Untitled') + stageChip(l.stage) +
      (l.status === 'deleted' ? '<span class="chip chip-danger">Deleted</span>' : '') + '</div>' +
      '<div class="lead-meta">' + (l.site ? esc(prettyUrl(l.site)) + '<span class="sep">·</span>' : '') +
      esc(l.lostReason || (l.stage === 'Hired' ? 'Signed' : 'No reason recorded')) + '</div></div>' +
      '<div class="lead-signals"><div class="signal tiny muted">closed ' + esc(Fmt.ago(l.updatedAt)) + '</div></div>' +
      '<div class="lead-right"><span class="lead-value">' + esc(Fmt.money(l.value)) + '</span>' +
      (l.status === 'deleted'
        ? '<button class="btn btn-sm" data-act="restore-lead" data-id="' + esc(l.id) + '">Restore</button>'
        : '<button class="btn btn-sm" data-act="reopen-lead" data-id="' + esc(l.id) + '">Reopen</button>') +
      '</div></article>';
  }).join('') : emptyState('Archive is empty', 'Closed and deleted leads collect here. Nothing is ever removed for good.');
}

/* ─── SETTINGS ──────────────────────────────────────────────────────────── */
function renderSettings() {
  var host = $('#settingsBody');
  if (!host) return;
  var s = State.settings;

  host.innerHTML =
    '<div class="chart-grid">' +

    chartCard('Pipeline stages',
      '<div id="stageEditor">' + (s.stages || []).map(function (st, i) {
        return listEditorRow('stage', i, st.name, st.color, st.group);
      }).join('') + '</div>' +
      '<button class="btn btn-sm" data-act="add-stage" style="margin-top:8px">' + icon('plus', 12) + ' Add stage</button>' +
      '<div class="tiny muted" style="margin-top:8px">The arrows change the order everywhere — the board, the filters and the lead form. ' +
      '"Live" stages sort at the top, "Low priority" sinks, and "Dead" always sits at the very bottom. ' +
      'Renaming a stage does not move leads; they keep the old name until you move them.</div>') +

    chartCard('Priority levels',
      '<div id="priorityEditor">' + (s.priorities || []).map(function (p, i) {
        return listEditorRow('priority', i, p.name, p.color);
      }).join('') + '</div>' +
      '<button class="btn btn-sm" data-act="add-priority" style="margin-top:8px">' + icon('plus', 12) + ' Add level</button>' +
      '<div class="tiny muted" style="margin-top:8px">Add as many as you want — Untouched, Nurture, Ready to sign.</div>') +

    chartCard('Labels',
      '<div class="field"><label>One per line</label>' +
      '<textarea class="textarea" id="setLabels" rows="5">' + esc((s.labels || []).join('\n')) + '</textarea></div>' +
      '<div class="tiny muted" style="margin-top:6px">A lead can carry several labels at once, unlike stage or priority.</div>') +

    chartCard('Sources and services',
      '<div class="field"><label>Sources</label><textarea class="textarea" id="setSources" rows="4">' + esc((s.sources || []).join('\n')) + '</textarea></div>' +
      '<div class="field" style="margin-top:10px"><label>Services</label><textarea class="textarea" id="setServices" rows="4">' + esc((s.services || []).join('\n')) + '</textarea></div>') +

    chartCard('Loss reasons',
      '<div class="field"><label>Asked whenever you mark a lead Dead</label>' +
      '<textarea class="textarea" id="setLostReasons" rows="5">' + esc((s.lostReasons || []).join('\n')) + '</textarea></div>') +

    chartCard('Follow-up cadence',
      '<div class="tiny muted" style="margin-bottom:10px">Days after entering a stage. Marking a follow-up done moves you to the next number instead of leaving a blank.</div>' +
      Object.keys(s.cadence || {}).map(function (k) {
        return '<div class="field" style="margin-bottom:8px"><label>' + esc(k) + '</label>' +
          '<input class="input cadence-input" data-stage="' + esc(k) + '" value="' + esc((s.cadence[k] || []).join(', ')) + '"/></div>';
      }).join('')) +

    chartCard('When a lead counts as quiet',
      '<div class="field-row">' +
      '<div class="field"><label>Going quiet after</label><input class="input" type="number" id="setWarnDays" value="' + esc((s.rotting || {}).warnDays || 14) + '"/></div>' +
      '<div class="field"><label>Gone cold after</label><input class="input" type="number" id="setStaleDays" value="' + esc((s.rotting || {}).staleDays || 30) + '"/></div>' +
      '</div><div class="tiny muted" style="margin-top:6px">Counted in days since anything last happened on the lead.</div>') +

    chartCard('Evo — custom instructions',
      '<div class="field"><label>Standing orders, always obeyed</label>' +
      '<textarea class="textarea" id="setAiInstructions" rows="7" placeholder="Example: Always write client messages in English. Never use exclamation marks. Sign off as Nayem. When I ask for a summary, keep it under five lines.">' + esc(s.aiInstructions || '') + '</textarea></div>' +
      '<div class="field" style="margin-top:10px"><label>Default model</label>' +
      '<select class="select" id="setAiModel">' +
      '<option value="fast"' + (s.aiModel === 'fast' ? ' selected' : '') + '>Fast — cheap, good for chat</option>' +
      '<option value="power"' + (s.aiModel === 'power' ? ' selected' : '') + '>Power — slower, better for audits and long writing</option>' +
      '</select></div>') +

    chartCard('Alerts',
      '<label class="row" style="cursor:pointer;margin-bottom:10px"><input type="checkbox" id="setAlarm"' + (s.alarmEnabled ? ' checked' : '') + '/> <span>Sound an alarm for hot leads that are due</span></label>' +
      '<button class="btn btn-sm" data-act="ask-notifications">Enable desktop notifications</button>' +
      '<div class="tiny muted" style="margin-top:10px">Your phone is covered by Telegram, which works whether this tab is open or not. The alarm here only fires while the dashboard is open.</div>') +

    chartCard('Top strip and ordering',
      '<div class="field"><label>Leads in the Recent strip</label>' +
      '<input class="input" type="number" min="1" max="20" id="setRecentLimit" value="' + esc(s.recentLimit || 8) + '"/></div>' +
      '<label class="row" style="cursor:pointer;margin:12px 0"><input type="checkbox" id="setShowFlow"' +
      (s.showFlowStrip !== false ? ' checked' : '') + '/> <span>Show the interaction counters across the top of Today</span></label>' +
      '<button class="btn btn-sm" data-act="open-flow-config">Choose what they count</button>' +
      '<hr class="divider"/>' +
      '<div class="tiny muted">Which stage counts as which interaction. Moving a lead onto one of these logs it automatically, ' +
      'so the counters stay right even after the lead has moved on.</div>' +
      '<div id="touchMapEditor" style="margin-top:10px">' +
      (s.stages || []).map(function (st) {
        var current = (s.stageTouchMap || {})[st.name] || '';
        return '<div class="row" style="flex-wrap:nowrap;margin-bottom:5px">' +
          '<span class="chip-dot" style="background:' + esc(st.color) + '"></span>' +
          '<span class="truncate" style="flex:1;font-size:12.5px">' + esc(st.name) + '</span>' +
          '<select class="select touchmap-input" data-stage="' + esc(st.name) + '" style="width:auto">' +
          '<option value="">— nothing —</option>' +
          (s.touchTypes || DEFAULT_SETTINGS.touchTypes).map(function (t) {
            return '<option value="' + esc(t.key) + '"' + (current === t.key ? ' selected' : '') + '>' + esc(t.label) + '</option>';
          }).join('') + '</select></div>';
      }).join('') + '</div>') +

    chartCard('Data safety',
      '<div class="tiny muted" style="margin-bottom:10px">The sheet is the record. These check it and take copies of it.</div>' +
      '<div class="row">' +
      '<button class="btn btn-sm" data-act="verify-data">Check everything is healthy</button>' +
      '<button class="btn btn-sm" data-act="recount-data">Recount interactions</button>' +
      '<button class="btn btn-sm" data-act="find-dupes">Find duplicates</button>' +
      '</div>' +
      '<div class="tiny muted" style="margin-top:10px">Columns are matched by name, never by position, and a version upgrade copies ' +
      'the whole spreadsheet before it adds anything. Old columns are never moved or removed.</div>') +

    chartCard('Connection',
      '<div class="field"><label>Apps Script web app URL</label><input class="input" id="setUrl" value="' + esc(Cfg.url) + '"/></div>' +
      '<div class="field" style="margin-top:10px"><label>Google client ID (optional)</label><input class="input" id="setClientId" value="' + esc(Cfg.clientId) + '"/></div>' +
      '<div class="row" style="margin-top:12px">' +
      '<button class="btn btn-sm" data-act="test-connection">Test connection</button>' +
      '<button class="btn btn-sm btn-danger" data-act="logout">Sign out</button></div>' +
      '<div class="tiny muted" style="margin-top:10px">Signed in as ' + esc(Cfg.who || 'password') + '. Unsent changes: ' + Outbox.items.length + '.</div>') +

    '</div>';
}

/**
 * One editable row in Settings. Stages also carry a band, which is what decides
 * whether they sort at the top of the list or sink to the bottom — without it
 * a renamed stage would quietly lose its place in the order.
 */
function listEditorRow(kind, index, name, color, group) {
  var bands = [['open', 'Live'], ['won', 'Signed'], ['low', 'Low priority'], ['dead', 'Dead']];
  return '<div class="row" style="margin-bottom:6px;flex-wrap:nowrap" data-kind="' + kind + '" data-index="' + index + '">' +
    '<span class="row" style="flex-wrap:nowrap;gap:1px">' +
      '<button class="btn btn-sm btn-icon" data-act="move-' + kind + '" data-index="' + index + '" data-dir="-1" title="Move up">▲</button>' +
      '<button class="btn btn-sm btn-icon" data-act="move-' + kind + '" data-index="' + index + '" data-dir="1" title="Move down">▼</button>' +
    '</span>' +
    '<input type="color" value="' + esc(color) + '" class="le-color" style="width:30px;height:30px;border:0;background:none;padding:0;cursor:pointer"/>' +
    '<input class="input le-name" value="' + esc(name) + '" style="flex:1"/>' +
    (kind === 'stage'
      ? '<select class="select le-group" style="width:auto" title="Where leads on this stage sort">' +
        bands.map(function (b) {
          return '<option value="' + b[0] + '"' + ((group || 'open') === b[0] ? ' selected' : '') + '>' + b[1] + '</option>';
        }).join('') + '</select>'
      : '') +
    '<button class="btn btn-sm btn-icon btn-danger" data-act="remove-' + kind + '" data-index="' + index + '" title="Remove">' + icon('x', 12) + '</button>' +
    '</div>';
}

/* ─── DRAWER ────────────────────────────────────────────────────────────── */
function openDetail(id, tab) {
  var lead = getLead(id);
  if (!lead) return;
  State.ui.detailId = id;
  if (tab) State.ui.detailTab = tab;
  $('#drawer').classList.add('show');
  $('#scrim').classList.add('show');
  renderDrawer();
}

function closeDetail() {
  State.ui.detailId = null;
  $('#drawer').classList.remove('show');
  $('#scrim').classList.remove('show');
}

function renderDrawer() {
  if (!State.ui.detailId) return;
  var l = getLead(State.ui.detailId);
  if (!l) { closeDetail(); return; }

  $('#drawerTitle').textContent = l.name || 'Untitled';
  $('#drawerSub').innerHTML = stageChip(l.stage) + priorityChip(l.priority) +
    '<span class="tiny muted">added ' + esc(Fmt.date((l.createdAt || '').slice(0, 10))) + '</span>' +
    '<span class="tiny muted">· edited ' + esc(Fmt.ago(l.updatedAt)) + ' (' + (Number(l.editCount) || 0) + '×)</span>';

  var starBtn = $('#drawerStar');
  if (starBtn) starBtn.innerHTML = icon(l.star ? 'star' : 'star-o', 15);

  $$('.drawer-tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.tab === State.ui.detailTab);
  });
  $$('.drawer-pane').forEach(function (p) {
    p.classList.toggle('active', p.id === 'pane-' + State.ui.detailTab);
  });

  if (State.ui.detailTab === 'overview') renderDrawerOverview(l);
  else if (State.ui.detailTab === 'timeline') renderDrawerTimeline(l);
  else if (State.ui.detailTab === 'activity') renderDrawerActivity(l);
  else if (State.ui.detailTab === 'meetings') renderDrawerMeetings(l);
  else if (State.ui.detailTab === 'docs') renderDrawerDocs(l);
  else if (State.ui.detailTab === 'evo') renderDrawerEvo(l);
}

function editableField(lead, field, label, opts) {
  opts = opts || {};
  var value = lead[field];
  var display = opts.display ? opts.display(value, lead) : (value || '');
  var extra = opts.extra || '';
  return '<dt>' + esc(label) + '</dt><dd>' +
    '<div class="editable' + (display ? '' : ' empty') + '" data-act="edit-field" data-id="' + esc(lead.id) + '"' +
    ' data-field="' + esc(field) + '" data-type="' + esc(opts.type || 'text') + '" data-label="' + esc(label) + '" tabindex="0">' +
    (display ? display : esc(opts.placeholder || 'Add ' + label.toLowerCase())) +
    '<span class="ed-actions">' + extra + '</span></div></dd>';
}

function renderDrawerOverview(l) {
  var stages = State.settings.stages || [];
  var currentIndex = stages.findIndex(function (s) { return s.name === l.stage; });

  var host = $('#pane-overview');
  host.innerHTML =

    '<div class="section"><div class="section-title">Stage' +
      '<span class="tiny muted">' + esc(reasonForAttention(l)) + '</span></div>' +
      '<div class="stage-track">' + stages.map(function (s, i) {
        var cls = s.name === l.stage ? 'current' : (currentIndex >= 0 && i < currentIndex ? 'done' : '');
        return '<button class="stage-step ' + cls + '" data-act="set-stage" data-id="' + esc(l.id) + '" data-value="' + esc(s.name) + '">' +
          '<span class="chip-dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) + '</button>';
      }).join('') + '</div></div>' +

    '<div class="section"><div class="section-title">Next step' +
      '<button class="btn btn-sm" data-act="quick-followup" data-id="' + esc(l.id) + '">Change date</button></div>' +
      '<dl class="kv">' +
      editableField(l, 'nextStep', 'What to do', { placeholder: 'e.g. Call about the proposal' }) +
      '<dt>When</dt><dd><div class="editable' + (l.followup ? '' : ' empty') + '" data-act="edit-field" data-id="' + esc(l.id) + '" data-field="followup" data-type="date" data-label="Follow-up date" tabindex="0">' +
      (l.followup ? esc(Fmt.date(l.followup)) + ' <span class="chip ' + (dueState(l) === 'over' ? 'chip-danger' : dueState(l) === 'today' ? 'chip-warm' : 'chip-ghost') + '">' + esc(dueState(l) === 'over' ? 'overdue' : dueState(l) === 'today' ? 'today' : Dates.diffDays(Dates.today(), l.followup) + 'd') + '</span>' : 'Nothing booked') +
      '</div></dd></dl>' +
      (l.followup ? '<button class="btn btn-sm btn-primary" data-act="done-followup" data-id="' + esc(l.id) + '" style="margin-top:8px">Mark done</button>' : '') +
    '</div>' +

    '<div class="section"><div class="section-title">Contact</div><dl class="kv">' +
      editableField(l, 'name', 'Business') +
      editableField(l, 'contact', 'Person') +
      editableField(l, 'site', 'Website', {
        display: function (v) {
          return v ? '<a href="' + esc(normalizeUrl(v)) + '" target="_blank" rel="noopener noreferrer" data-act="stop">' + esc(prettyUrl(v)) + '</a>' : '';
        },
        extra: l.site ? copyBtn(normalizeUrl(l.site), 'Copy website') : ''
      }) +
      editableField(l, 'phone', 'Phone', {
        display: function (v) { return v ? '<a href="tel:' + esc(v) + '" data-act="stop">' + esc(v) + '</a>' : ''; },
        extra: l.phone ? copyBtn(l.phone, 'Copy phone') : ''
      }) +
      editableField(l, 'wa', 'WhatsApp', {
        display: function (v) { return v ? esc(v) : ''; },
        extra: (l.wa || l.phone) ? '<button class="btn btn-sm btn-icon" data-act="whatsapp" data-id="' + esc(l.id) + '" title="Open WhatsApp">' + icon('wa', 12) + '</button>' : ''
      }) +
      editableField(l, 'email', 'Email', {
        display: function (v) { return v ? '<a href="mailto:' + esc(v) + '" data-act="stop">' + esc(v) + '</a>' : ''; },
        extra: l.email ? copyBtn(l.email, 'Copy email') + '<button class="btn btn-sm btn-icon" data-act="compose-email" data-id="' + esc(l.id) + '" title="Write an email">' + icon('mail', 12) + '</button>' : ''
      }) +
      '</dl></div>' +

    '<div class="section"><div class="section-title">Deal</div><dl class="kv">' +
      editableField(l, 'value', 'Value', { type: 'number', display: function (v) { return v ? esc(Fmt.money(v)) : ''; } }) +
      editableField(l, 'service', 'Service', { type: 'select', display: function (v) { return esc(v); } }) +
      editableField(l, 'source', 'Source', { type: 'select', display: function (v) { return esc(v); } }) +
      editableField(l, 'priority', 'Priority', { type: 'select', display: function (v) { return priorityChip(v); } }) +
      '<dt>Labels</dt><dd><div class="editable" data-act="edit-labels" data-id="' + esc(l.id) + '" tabindex="0">' +
      ((l.labels || []).length ? (l.labels || []).map(function (t) { return '<span class="chip chip-ghost">' + esc(t) + '</span>'; }).join(' ') : '<span class="muted">Add labels</span>') +
      '</div></dd>' +
      (l.proposalSentAt ? '<dt>Proposal sent</dt><dd><div class="editable" data-act="edit-field" data-id="' + esc(l.id) + '" data-field="proposalSentAt" data-type="date" data-label="Proposal sent">' +
        esc(Fmt.date(l.proposalSentAt)) + ' <span class="chip chip-ghost">' + Dates.diffDays(l.proposalSentAt, Dates.today()) + 'd ago</span></div></dd>' : '') +
      '</dl></div>' +

    '<div class="section"><div class="section-title">Notes' +
      '<span class="tiny muted">Bangla is fine — Evo reads it</span></div>' +
      '<div class="editable" data-act="edit-field" data-id="' + esc(l.id) + '" data-field="notes" data-type="textarea" data-label="Notes" tabindex="0" style="min-height:60px;align-items:flex-start;white-space:pre-wrap">' +
      (l.notes ? esc(l.notes) : '<span class="muted">Click to write a note</span>') + '</div>' +
      '<div class="row" style="margin-top:10px">' +
      '<input class="input" id="quickNote" placeholder="Log what just happened…" style="flex:1"/>' +
      '<button class="btn btn-primary btn-sm" data-act="add-note" data-id="' + esc(l.id) + '">Log it</button></div>' +
    '</div>' +

    '<div class="section"><div class="section-title">Actions</div>' +
      '<div class="row">' +
      '<button class="btn btn-sm" data-act="share-lead" data-id="' + esc(l.id) + '">' + icon('share', 13) + ' Share</button>' +
      '<button class="btn btn-sm" data-act="add-meeting-for" data-id="' + esc(l.id) + '">' + icon('meetings', 13) + ' Schedule meeting</button>' +
      '<button class="btn btn-sm" data-act="compose-email" data-id="' + esc(l.id) + '">' + icon('mail', 13) + ' Write email</button>' +
      '<button class="btn btn-sm" data-act="run-audit" data-id="' + esc(l.id) + '">' + icon('search', 13) + ' Audit site</button>' +
      '<button class="btn btn-sm btn-danger" data-act="archive-lead" data-id="' + esc(l.id) + '">' + icon('trash', 13) + ' Archive</button>' +
      '</div></div>';
}

function renderDrawerActivity(l) {
  var host = $('#pane-activity');
  var journal = (State.activities || []).filter(function (a) { return a.leadId === l.id; });
  var manual = (l.history || []).slice().reverse();

  host.innerHTML =
    '<div class="section"><div class="section-title">Your notes</div>' +
    (manual.length ? '<div class="hist-list">' + manual.map(function (h) {
      return '<div class="hist-item"><span class="hist-dot"></span><span class="hist-text">' + esc(h) + '</span><span></span></div>';
    }).join('') + '</div>' : '<div class="muted small">Nothing logged yet.</div>') + '</div>' +

    '<div class="section"><div class="section-title">Every change' +
    '<span class="tiny muted">recorded automatically</span></div>' +
    (journal.length ? '<div class="hist-list">' + journal.map(function (a) {
      var dotClass = a.type === 'created' ? 'created' : a.type === 'deleted' ? 'deleted' : a.actor === 'evo' ? 'evo' : a.field === 'stage' ? 'stage' : '';
      var text;
      if (a.type === 'created') text = '<b>Added</b> to the pipeline';
      else if (a.type === 'deleted') text = '<b>Archived</b>' + (a.details ? ' — ' + esc(a.details) : '');
      else if (a.field) text = '<b>' + esc(fieldLabel(a.field)) + '</b> ' + esc(a.oldValue || 'empty') + ' → ' + esc(a.newValue || 'empty');
      else text = esc(a.type || 'Changed');
      return '<div class="hist-item"><span class="hist-dot ' + dotClass + '"></span>' +
        '<span class="hist-text">' + text + (a.actor === 'evo' ? ' <span class="chip chip-ghost">Evo</span>' : '') + '</span>' +
        '<span class="hist-when" title="' + esc(a.at) + '">' + esc(Fmt.ago(a.at)) + '</span></div>';
    }).join('') + '</div>' : '<div class="muted small">No recorded changes yet. New edits will appear here.</div>') +
    '</div>';
}

function fieldLabel(f) {
  var map = {
    name: 'Name', site: 'Website', phone: 'Phone', wa: 'WhatsApp', email: 'Email',
    contact: 'Contact', source: 'Source', stage: 'Stage', priority: 'Priority',
    followup: 'Follow-up', nextStep: 'Next step', notes: 'Notes', service: 'Service',
    value: 'Value', proposalSentAt: 'Proposal date', proposalValue: 'Proposal value',
    lostReason: 'Loss reason', star: 'Star', status: 'Status'
  };
  return map[f] || f;
}

function renderDrawerMeetings(l) {
  var host = $('#pane-meetings');
  var mine = State.meetings.filter(function (m) { return m.leadId === l.id; })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

  host.innerHTML =
    '<div class="row" style="margin-bottom:14px">' +
    '<button class="btn btn-primary btn-sm" data-act="add-meeting-for" data-id="' + esc(l.id) + '">' + icon('plus', 12) + ' Schedule meeting</button></div>' +
    (mine.length ? mine.map(meetingCard).join('')
      : '<div class="muted small">No meetings with this lead yet.</div>');
}

function renderDrawerDocs(l) {
  var host = $('#pane-docs');
  var mine = State.docs.filter(function (d) { return d.leadId === l.id; });

  host.innerHTML =
    '<div class="row" style="margin-bottom:14px">' +
    '<button class="btn btn-primary btn-sm" data-act="add-doc-for" data-id="' + esc(l.id) + '">' + icon('plus', 12) + ' Add document</button></div>' +
    (mine.length ? mine.map(function (d) {
      return '<div class="tl-item"><div class="grow"><div style="font-weight:620">' + esc(d.name) + '</div>' +
        '<div class="tiny muted">' + esc(d.type) + ' · ' + esc(Fmt.shortDate((d.createdAt || '').slice(0, 10))) + '</div></div>' +
        (d.url ? '<a class="btn btn-sm" href="' + esc(normalizeUrl(d.url)) + '" target="_blank" rel="noopener noreferrer">Open</a>' : '') +
        '<button class="btn btn-sm btn-danger btn-icon" data-act="delete-doc" data-id="' + esc(d.id) + '">' + icon('trash', 12) + '</button></div>';
    }).join('') : '<div class="muted small">Nothing attached yet.</div>');
}

/* ─── page router ───────────────────────────────────────────────────────── */
var PAGE_RENDERERS = {
  today: renderToday,
  leads: renderLeads,
  pipeline: renderPipeline,
  followups: renderFollowups,
  meetings: renderMeetings,
  analytics: renderAnalytics,
  messages: renderMessages,
  docs: renderDocs,
  archive: renderArchive,
  notes: renderNotes,
  history: renderHistory,
  settings: renderSettings,
  ai: function () { if (typeof renderAi === 'function') renderAi(); }
};

function renderActivePage() {
  var fn = PAGE_RENDERERS[State.ui.page];
  if (fn) fn();
}

function switchPage(page) {
  if (!PAGE_RENDERERS[page]) return;
  State.ui.page = page;
  $$('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + page); });
  $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.page === page); });
  renderActivePage();
  try { history.replaceState(null, '', '#' + page); } catch (e) {}
}

/* ═══════════════════════════════════════════════════════════════════════════
   v6 — flow strip, notes, history, lead timeline
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── interaction helpers ─────────────────────────────────────────────────── */
function touchTypeMeta(key) {
  var list = State.settings.touchTypes || [];
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  return { key: key, label: key, color: '#64748B' };
}

/**
 * "3 calls · 1 mtg" — the short version of a lead's history.
 * The lead row gives this about 170px, so the words are abbreviated rather
 * than left to be cut off mid-syllable by the ellipsis.
 */
var TOUCH_SHORT = {
  call: 'call', meeting: 'mtg', proposal: 'prop', message: 'msg',
  email: 'mail', audit: 'audit', negotiation: 'nego', visit: 'visit', note: 'note'
};
function touchSummary(lead, full) {
  var c = leadCounts(lead);
  var bits = [];
  ['call', 'meeting', 'proposal', 'message', 'email', 'audit', 'visit'].forEach(function (k) {
    if (!c[k]) return;
    var word = full ? touchTypeMeta(k).label.toLowerCase() : TOUCH_SHORT[k];
    bits.push(c[k] + ' ' + word + (c[k] > 1 ? 's' : ''));
  });
  if (!full && bits.length > 3) bits = bits.slice(0, 3).concat(['+' + (bits.length - 3)]);
  return bits.length ? esc(bits.join(' · ')) : '';
}

/** Leads that have ever been in one of these stages, however long ago. */
function leadsEverInStages(stages) {
  var want = {};
  (stages || []).forEach(function (s) { want[s] = true; });
  var hit = {};
  (State.stageEvents || []).forEach(function (e) {
    if (want[e.toStage]) hit[e.leadId] = true;
  });
  activeLeads().forEach(function (l) {
    if (want[l.stage]) hit[l.id] = true;
    String(l.stagePath || '').split('>').forEach(function (s) { if (want[s]) hit[l.id] = true; });
    (l.stagesVisited || []).forEach(function (s) { if (want[s]) hit[l.id] = true; });
  });
  return Object.keys(hit).filter(function (id) { return !!getLead(id); });
}

/**
 * Turns one configured card into the number on screen and the leads behind it.
 *
 * The whole point of this strip: a lead that moved New → Phone Call → Meeting
 * → Proposal used to leave no trace of the call or the meeting once it had
 * moved on. Counting the interaction ledger, not the current stage, keeps
 * "who have I actually met" answerable months later.
 */
function flowCardData(card) {
  var live = activeLeads();
  var liveIds = {};
  live.forEach(function (l) { liveIds[l.id] = true; });

  if (card.kind === 'touch') {
    var events = (State.touches || []).filter(function (t) {
      return t.type === card.value && liveIds[t.leadId];
    });
    var ids = {};
    events.forEach(function (t) { ids[t.leadId] = true; });
    var leadIds = Object.keys(ids);
    return {
      value: events.length,
      note: leadIds.length + ' lead' + (leadIds.length === 1 ? '' : 's'),
      leadIds: leadIds
    };
  }

  if (card.kind === 'stage') {
    var want = {};
    (card.value || []).forEach(function (x) { want[x] = true; });
    var inStage = live.filter(function (l) { return want[l.stage]; });
    var sum = inStage.reduce(function (t, l) { return t + (Number(l.value) || 0); }, 0);
    return {
      value: inStage.length,
      note: sum ? Fmt.compactMoney(sum) + ' in play' : 'right now',
      leadIds: inStage.map(function (l) { return l.id; })
    };
  }

  if (card.kind === 'passed') {
    var ever = leadsEverInStages(card.value || []);
    return { value: ever.length, note: 'at any point', leadIds: ever };
  }

  if (card.kind === 'metric') {
    if (card.value === 'pipelineValue') {
      var open = openLeads();
      return {
        value: Fmt.compactMoney(open.reduce(function (t, l) { return t + (Number(l.value) || 0); }, 0)),
        note: open.length + ' live leads',
        leadIds: open.map(function (l) { return l.id; })
      };
    }
    if (card.value === 'touchedLeads') {
      var ids2 = {};
      (State.touches || []).forEach(function (t) { if (liveIds[t.leadId]) ids2[t.leadId] = true; });
      var k = Object.keys(ids2);
      return { value: k.length, note: 'have been contacted', leadIds: k };
    }
  }

  return { value: 0, note: '', leadIds: [] };
}

function renderFlowStrip() {
  var strip = $('#flowStrip');
  var wrap = $('#flowWrap');
  if (!strip || !wrap) return;

  if (State.settings.showFlowStrip === false) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';

  var cards = (State.settings.flowCards || DEFAULT_SETTINGS.flowCards).filter(function (c) { return c.show !== false; });
  if (!cards.length) {
    strip.innerHTML = '<div class="tiny muted" style="padding:10px 2px">' +
      'Nothing tracked yet — press the cog to choose what this strip counts.</div>';
    return;
  }

  strip.innerHTML = cards.map(function (c) {
    var d = flowCardData(c);
    return '<div class="flow-card" style="--fc:' + esc(c.color || 'var(--accent)') + '"' +
      ' data-act="flow-open" data-id="' + esc(c.id) + '" title="' + esc(c.label) + ' — click to see which leads">' +
      '<span class="fc-grip" draggable="true" data-act="fgrip" data-id="' + esc(c.id) + '" title="Drag to reorder">' + icon('grip', 12) + '</span>' +
      '<div class="fc-label">' + esc(c.label) + '</div>' +
      '<div class="fc-value">' + esc(d.value) + '</div>' +
      '<div class="fc-note">' + esc(d.note) + '</div>' +
      '</div>';
  }).join('');
}

/* ─── NOTES ───────────────────────────────────────────────────────────────── */
function noteInk(color) {
  // Note colours are fixed pale swatches. On a pale card the theme's ink is
  // unreadable in dark mode, so anything other than plain white pins its own.
  return (!color || color.toUpperCase() === '#FFFFFF') ? '' : '#1A2430';
}

function visibleNotes() {
  var q = String(State.ui.notesSearch || '').toLowerCase().trim();
  var label = State.ui.notesLabel;
  var wantArchived = State.ui.notesTab === 'archive';

  return (State.notes || []).filter(function (n) {
    if (!!n.archived !== wantArchived) return false;
    if (label && (n.labels || []).indexOf(label) < 0) return false;
    if (q) {
      var hay = (n.title + ' ' + n.body + ' ' + (n.labels || []).join(' ') + ' ' +
        (n.checklist || []).map(function (c) { return c.text; }).join(' ')).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }).sort(function (a, b) {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    var sa = Number(a.sortOrder || 0), sb = Number(b.sortOrder || 0);
    if (sa !== sb) return sa - sb;
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });
}

function visibleTasks() {
  var q = String(State.ui.notesSearch || '').toLowerCase().trim();
  return (State.tasks || []).filter(function (t) {
    if (q && String(t.text || '').toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    var da = a.due || '9999-12-31', db = b.due || '9999-12-31';
    if (da !== db) return da.localeCompare(db);
    return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
  });
}

function renderNotes() {
  var tabsEl = $('#notesTabs');
  var notes = State.notes || [];
  var tasks = State.tasks || [];

  var tabs = [
    { key: 'notes', label: 'Notes', count: notes.filter(function (n) { return !n.archived; }).length },
    { key: 'tasks', label: 'Tasks', count: tasks.filter(function (t) { return !t.done; }).length },
    { key: 'reminders', label: 'Reminders', count: notes.filter(function (n) { return n.reminderAt && !n.archived; }).length },
    { key: 'archive', label: 'Archived', count: notes.filter(function (n) { return n.archived; }).length }
  ];
  if (tabsEl) {
    tabsEl.innerHTML = tabs.map(function (t) {
      return '<button class="pill' + (State.ui.notesTab === t.key ? ' active' : '') + '"' +
        ' data-act="notes-tab" data-value="' + t.key + '">' + esc(t.label) +
        '<span class="cnt">' + t.count + '</span></button>';
    }).join('');
  }

  var labelSel = $('#noteLabelFilter');
  if (labelSel) {
    var allLabels = {};
    notes.forEach(function (n) { (n.labels || []).forEach(function (l) { allLabels[l] = true; }); });
    fillSelect('#noteLabelFilter', 'All labels', Object.keys(allLabels).sort(), State.ui.notesLabel);
  }

  var sub = $('#notesSub');
  if (sub) {
    var due = tasks.filter(function (t) { return !t.done && t.due && t.due <= Dates.today(); }).length;
    sub.textContent = notes.filter(function (n) { return !n.archived; }).length + ' notes · ' +
      tasks.filter(function (t) { return !t.done; }).length + ' open tasks' +
      (due ? ' · ' + due + ' due now' : '');
  }

  var host = $('#notesBody');
  if (!host) return;

  var composer = $('#noteComposer');
  if (composer) composer.style.display = (State.ui.notesTab === 'archive') ? 'none' : '';
  var quick = $('#noteQuick');
  if (quick) {
    // The same box adds a note or a task depending on the tab, so it has to say so.
    quick.placeholder = State.ui.notesTab === 'tasks' ? 'Add a task…' : 'Take a note…';
  }

  if (State.ui.notesTab === 'tasks') { host.innerHTML = renderTaskList(); return; }
  if (State.ui.notesTab === 'reminders') { host.innerHTML = renderReminderList(); return; }

  var list = visibleNotes();
  if (!list.length) {
    host.innerHTML = emptyState(
      State.ui.notesTab === 'archive' ? 'Nothing archived' : 'No notes yet',
      State.ui.notesTab === 'archive'
        ? 'Notes you archive land here and stay searchable.'
        : 'Anything you want to keep — a phone script, bank details, what a client said on a call.',
      State.ui.notesTab === 'archive' ? '' : '<button class="btn btn-primary" data-act="new-note">Write your first note</button>');
    return;
  }

  var pinned = list.filter(function (n) { return n.pinned; });
  var rest = list.filter(function (n) { return !n.pinned; });
  var cls = 'notes-grid' + (State.ui.notesView === 'list' ? ' as-list' : '');

  host.innerHTML =
    (pinned.length ? '<div class="notes-section-label">Pinned</div><div class="' + cls + '" data-notegrid="1">' +
      pinned.map(noteCard).join('') + '</div>' : '') +
    (rest.length ? (pinned.length ? '<div class="notes-section-label" style="margin-top:20px">Others</div>' : '') +
      '<div class="' + cls + '" data-notegrid="1">' + rest.map(noteCard).join('') + '</div>' : '');
}

function noteCard(n) {
  var checklist = n.checklist || [];
  var openItems = checklist.filter(function (c) { return !c.done; });
  var doneItems = checklist.filter(function (c) { return c.done; });
  var shown = openItems.concat(doneItems).slice(0, 8);
  var ink = noteInk(n.color);
  var lead = n.leadId ? getLead(n.leadId) : null;

  var reminderCls = '';
  if (n.reminderAt) {
    reminderCls = new Date(n.reminderAt).getTime() <= Date.now() ? ' due' : '';
  }

  return '<article class="note-card" data-act="open-note" data-id="' + esc(n.id) + '"' +
    ' style="--note-bg:' + esc(n.color || '#FFFFFF') + (ink ? ';--note-ink:' + ink + ';--note-ink-2:#3A4653' : '') + '">' +

    (n.pinned ? '<span class="note-pin">' + icon('pin', 13) + '</span>' : '') +

    (n.title ? '<div class="note-title">' + esc(n.title) + '</div>' : '') +

    (checklist.length
      ? '<div class="note-check-list">' +
          shown.map(function (c) {
            var idx = checklist.indexOf(c);
            return '<div class="note-check' + (c.done ? ' on' : '') + '" data-act="note-check" data-id="' + esc(n.id) + '" data-index="' + idx + '">' +
              '<span class="nc-box">' + (c.done ? icon('check', 9) : '') + '</span>' +
              '<span class="nc-text">' + esc(c.text) + '</span></div>';
          }).join('') +
          (checklist.length > 8 ? '<div class="note-more">+' + (checklist.length - 8) + ' more</div>' : '') +
          (doneItems.length ? '<div class="note-more">' + doneItems.length + ' of ' + checklist.length + ' done</div>' : '') +
        '</div>'
      : (n.body ? '<div class="note-body">' + esc(n.body) + '</div>' : '')) +

    (n.reminderAt ? '<span class="note-reminder' + reminderCls + '">' + icon('bell', 11) + ' ' +
      esc(Fmt.shortDate(String(n.reminderAt).slice(0, 10)) + ' ' + String(n.reminderAt).slice(11, 16)) + '</span>' : '') +

    ((n.labels || []).length || lead
      ? '<div class="note-labels">' +
        (lead ? '<span class="chip chip-info">' + esc(lead.name) + '</span>' : '') +
        (n.labels || []).map(function (l) { return '<span class="chip chip-ghost">' + esc(l) + '</span>'; }).join('') +
        '</div>'
      : '') +

    '<div class="note-foot">' +
      '<span class="note-when">' + esc(Fmt.ago(n.updatedAt || n.createdAt)) + '</span>' +
      '<button class="note-btn' + (n.pinned ? ' on' : '') + '" data-act="note-pin" data-id="' + esc(n.id) + '" title="' + (n.pinned ? 'Unpin' : 'Pin to the top') + '">' + icon(n.pinned ? 'pin' : 'pin-o', 13) + '</button>' +
      '<button class="note-btn" data-act="note-colors" data-id="' + esc(n.id) + '" title="Change colour">' + icon('palette', 13) + '</button>' +
      '<button class="note-btn" data-act="note-remind" data-id="' + esc(n.id) + '" title="Remind me">' + icon('bell', 13) + '</button>' +
      '<button class="note-btn" data-act="note-archive" data-id="' + esc(n.id) + '" title="' + (n.archived ? 'Put back' : 'Archive') + '">' + icon('archive', 13) + '</button>' +
      '<button class="note-btn" data-act="note-delete" data-id="' + esc(n.id) + '" title="Delete">' + icon('trash', 13) + '</button>' +
      '<span class="note-btn" draggable="true" data-act="ngrip" data-id="' + esc(n.id) + '" title="Drag to reorder">' + icon('grip', 13) + '</span>' +
    '</div>' +
  '</article>';
}

function renderTaskList() {
  var list = visibleTasks();
  var open = list.filter(function (t) { return !t.done; });
  var done = list.filter(function (t) { return t.done; });

  function row(t) {
    var lead = t.leadId ? getLead(t.leadId) : null;
    var dueCls = !t.due ? '' : t.due < Dates.today() ? ' over' : t.due === Dates.today() ? ' today' : '';
    return '<div class="task-row' + (t.done ? ' done' : '') + '">' +
      '<button class="lead-check' + (t.done ? ' on' : '') + '" data-act="task-toggle" data-id="' + esc(t.id) + '">' +
      (t.done ? icon('check', 11) : '') + '</button>' +
      '<span class="task-text editable" data-act="task-edit" data-id="' + esc(t.id) + '">' + esc(t.text || 'Untitled') + '</span>' +
      (lead ? '<span class="chip chip-info">' + esc(lead.name) + '</span>' : '') +
      (t.due ? '<span class="task-due' + dueCls + '">' + esc(Fmt.shortDate(t.due)) + '</span>' : '') +
      '<button class="btn btn-sm btn-icon" data-act="task-due" data-id="' + esc(t.id) + '" title="Set a date">' + icon('followup', 12) + '</button>' +
      '<button class="btn btn-sm btn-icon btn-danger" data-act="task-delete" data-id="' + esc(t.id) + '" title="Delete">' + icon('trash', 12) + '</button>' +
      '</div>';
  }

  if (!list.length) {
    return emptyState('No tasks', 'Anything that is not a lead but still has to happen.',
      '<button class="btn btn-primary" data-act="new-task">Add a task</button>');
  }

  return (open.length ? '<div class="notes-section-label">To do</div>' + open.map(row).join('') : '') +
    (done.length ? '<div class="notes-section-label" style="margin-top:20px">Done (' + done.length + ')</div>' +
      done.slice(0, 40).map(row).join('') : '');
}

function renderReminderList() {
  var withReminders = (State.notes || []).filter(function (n) { return n.reminderAt && !n.archived; })
    .sort(function (a, b) { return String(a.reminderAt).localeCompare(String(b.reminderAt)); });
  var tasksWithDates = (State.tasks || []).filter(function (t) { return !t.done && t.due; })
    .sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });

  if (!withReminders.length && !tasksWithDates.length) {
    return emptyState('Nothing scheduled', 'Set a reminder on a note or a date on a task and it shows up here — and on Telegram.');
  }

  return (withReminders.length
    ? '<div class="notes-section-label">Note reminders</div><div class="notes-grid">' +
      withReminders.map(noteCard).join('') + '</div>'
    : '') +
    (tasksWithDates.length
      ? '<div class="notes-section-label" style="margin-top:20px">Dated tasks</div>' +
        tasksWithDates.map(function (t) {
          var dueCls = t.due < Dates.today() ? ' over' : t.due === Dates.today() ? ' today' : '';
          return '<div class="task-row">' +
            '<button class="lead-check" data-act="task-toggle" data-id="' + esc(t.id) + '"></button>' +
            '<span class="task-text">' + esc(t.text) + '</span>' +
            '<span class="task-due' + dueCls + '">' + esc(Fmt.dayLabel(t.due)) + '</span></div>';
        }).join('')
      : '');
}

/* ─── HISTORY ─────────────────────────────────────────────────────────────── */
var HISTORY_ICONS = {
  created: 'plus', deleted: 'trash', restored: 'undo', updated: 'edit',
  merged: 'merge', merge: 'merge', touch: 'phone', undo: 'undo',
  meeting_created: 'meetings', meeting_updated: 'meetings', meeting_deleted: 'meetings',
  doc_added: 'docs', email_sent: 'mail', audit: 'search', settings: 'settings',
  note_created: 'notes', note_updated: 'notes', note_deleted: 'notes',
  task_created: 'tasks', task_updated: 'tasks', task_deleted: 'tasks'
};

function historyIconClass(a) {
  if (a.type === 'created') return 'created';
  if (a.type === 'deleted' || a.type === 'note_deleted' || a.type === 'task_deleted') return 'deleted';
  if (a.actor === 'evo') return 'evo';
  if (a.type === 'touch') return 'touch';
  if (a.field === 'stage') return 'stage';
  return '';
}

/** Reads as a sentence: what happened, to whom, and what it used to say. */
function historyHeadline(a) {
  var who = a.leadName
    ? '<span class="hist-lead" data-act="open-lead" data-id="' + esc(a.leadId) + '">' + esc(a.leadName) + '</span>'
    : '<span class="muted">—</span>';

  switch (a.type) {
    case 'created':        return who + ' was added to the pipeline';
    case 'deleted':        return who + ' was archived';
    case 'restored':       return who + ' was restored';
    case 'merged':         return who + ' was folded into another lead';
    case 'merge':          return who + ' absorbed ' + esc(a.newValue || 'a duplicate');
    case 'touch':          return esc(touchTypeMeta(a.field).label) + ' logged with ' + who;
    case 'undo':           return 'Reverted ' + esc(fieldLabel(a.field)) + ' on ' + who;
    case 'meeting_created':return 'Meeting scheduled with ' + who;
    case 'meeting_updated':return 'Meeting updated for ' + who;
    case 'meeting_deleted':return 'Meeting deleted for ' + who;
    case 'doc_added':      return 'Document attached to ' + who;
    case 'email_sent':     return 'Email sent to ' + esc(a.newValue);
    case 'audit':          return 'Website audit run on ' + who;
    case 'settings':       return 'Settings changed — ' + esc(a.newValue);
    case 'note_created':   return 'Note written';
    case 'note_updated':   return 'Note edited';
    case 'note_deleted':   return 'Note deleted';
    case 'task_created':   return 'Task added';
    case 'task_updated':   return 'Task updated';
    case 'task_deleted':   return 'Task deleted';
    default:
      if (a.field) return esc(fieldLabel(a.field)) + ' changed on ' + who;
      return esc(a.type || 'Changed') + (a.leadName ? ' — ' + who : '');
  }
}

function historyRow(a) {
  var canUndo = a.entity === 'lead' && a.leadId && a.field &&
    ['name', 'site', 'phone', 'wa', 'email', 'contact', 'source', 'stage', 'priority',
     'followup', 'nextStep', 'notes', 'service', 'value', 'proposalSentAt', 'proposalValue',
     'lostReason', 'star', 'status', 'labels'].indexOf(a.field) >= 0 && !a.undone;

  var showDiff = a.field && (a.oldValue || a.newValue) && a.type !== 'created';

  return '<div class="hist-row' + (a.undone ? ' undone' : '') + '">' +
    '<span class="hist-time">' + esc(String(a.at || '').slice(11, 16)) + '</span>' +
    '<span class="hist-icon ' + historyIconClass(a) + '">' + icon(HISTORY_ICONS[a.type] || 'edit', 11) + '</span>' +
    '<div class="hist-body">' +
      '<div class="hist-head">' + historyHeadline(a) +
        (a.actor === 'evo' ? '<span class="chip chip-ghost">Evo</span>' : '') +
        (a.actor === 'undo' ? '<span class="chip chip-ghost">undo</span>' : '') +
        (a.undone ? '<span class="chip chip-ghost">reverted</span>' : '') +
      '</div>' +
      (showDiff
        ? '<div class="hist-diff">' +
            (a.oldValue ? '<span class="hist-old" title="' + esc(a.oldValue) + '">' + esc(truncateText(a.oldValue, 70)) + '</span>' : '<span class="tiny muted">was empty</span>') +
            '<span class="tiny muted">→</span>' +
            (a.newValue ? '<span class="hist-new" title="' + esc(a.newValue) + '">' + esc(truncateText(a.newValue, 70)) + '</span>' : '<span class="tiny muted">cleared</span>') +
          '</div>'
        : (a.details ? '<div class="tiny muted" style="margin-top:2px">' + esc(a.details) + '</div>' : '')) +
    '</div>' +
    '<div class="hist-actions">' +
      (a.leadId ? '<button class="btn btn-sm btn-icon" data-act="open-lead" data-id="' + esc(a.leadId) + '" title="Open the lead">' + icon('eye', 12) + '</button>' : '') +
      (canUndo ? '<button class="btn btn-sm" data-act="history-undo" data-id="' + esc(a.id) + '" title="Put this back the way it was">Undo</button>' : '') +
    '</div>' +
  '</div>';
}

function truncateText(v, n) {
  var s = String(v === null || v === undefined ? '' : v);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function renderHistory() {
  var host = $('#historyBody');
  if (!host) return;

  syncHistoryControls();

  var rows = State.ui.historyRows && State.ui.historyRows.length
    ? State.ui.historyRows
    : (State.activities || []);

  var sub = $('#historySub');
  if (sub) {
    sub.textContent = State.ui.historyLoading
      ? 'Loading…'
      : (State.ui.historyTotal || rows.length) + ' recorded change' +
        ((State.ui.historyTotal || rows.length) === 1 ? '' : 's') +
        ' · showing ' + rows.length;
  }

  var facetsEl = $('#historyFacets');
  if (facetsEl) {
    var f = (State.ui.historyFacets && State.ui.historyFacets.type) || {};
    var keys = Object.keys(f).sort(function (a, b) { return f[b] - f[a]; }).slice(0, 12);
    facetsEl.innerHTML = keys.length
      ? '<button class="pill' + (State.ui.history.type ? '' : ' active') + '" data-act="history-type" data-value="">All' +
        '<span class="cnt">' + (State.ui.historyTotal || rows.length) + '</span></button>' +
        keys.map(function (k) {
          return '<button class="pill' + (State.ui.history.type === k ? ' active' : '') + '" data-act="history-type" data-value="' + esc(k) + '">' +
            esc(historyTypeLabel(k)) + '<span class="cnt">' + f[k] + '</span></button>';
        }).join('')
      : '';
  }

  if (State.ui.historyLoading && !rows.length) {
    host.innerHTML = '<div class="hist-empty">Reading the journal…</div>';
    return;
  }
  if (!rows.length) {
    host.innerHTML = emptyState('Nothing recorded yet',
      'Every edit, stage move, call and note gets written down here from now on.');
    return;
  }

  var groups = {};
  rows.forEach(function (a) {
    var day = String(a.at || '').slice(0, 10) || 'unknown';
    (groups[day] = groups[day] || []).push(a);
  });

  var days = Object.keys(groups).sort(function (a, b) { return b.localeCompare(a); });
  host.innerHTML = days.map(function (d) {
    return '<div class="hist-day-label">' + esc(d === 'unknown' ? 'Undated' : Fmt.dayLabel(d)) +
      ' <span class="tiny muted" style="text-transform:none;letter-spacing:0">' + groups[d].length + '</span></div>' +
      groups[d].map(historyRow).join('');
  }).join('');

  var more = $('#btnHistoryMore');
  if (more) more.hidden = rows.length >= (State.ui.historyTotal || 0);
}

function historyTypeLabel(t) {
  var map = {
    updated: 'Edits', created: 'Added', deleted: 'Archived', restored: 'Restored',
    touch: 'Interactions', merge: 'Merges', merged: 'Merged away', undo: 'Undone',
    meeting_created: 'Meetings booked', meeting_updated: 'Meetings edited',
    meeting_deleted: 'Meetings deleted', doc_added: 'Documents', email_sent: 'Emails',
    audit: 'Audits', settings: 'Settings', note_created: 'Notes added',
    note_updated: 'Notes edited', note_deleted: 'Notes deleted',
    task_created: 'Tasks added', task_updated: 'Tasks edited', task_deleted: 'Tasks deleted'
  };
  return map[t] || t;
}

function syncHistoryControls() {
  var h = State.ui.history;
  var leadOpts = activeLeads().slice().sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  }).map(function (l) { return { value: l.id, label: l.name || 'Untitled' }; });
  fillSelect('#hLead', 'All leads', leadOpts, h.leadId);

  var facets = State.ui.historyFacets || {};
  fillSelect('#hType', 'All kinds',
    Object.keys(facets.type || {}).sort().map(function (k) { return { value: k, label: historyTypeLabel(k) }; }), h.type);
  fillSelect('#hField', 'All fields',
    Object.keys(facets.field || {}).sort().map(function (k) { return { value: k, label: fieldLabel(k) }; }), h.field);
  fillSelect('#hActor', 'Anyone',
    Object.keys(facets.actor || {}).sort().map(function (k) { return { value: k, label: k }; }), h.actor);

  var q = $('#hSearch'); if (q && q.value !== h.search) q.value = h.search;
  var from = $('#hFrom'); if (from && from.value !== h.from) from.value = h.from;
  var to = $('#hTo'); if (to && to.value !== h.to) to.value = h.to;
}

/* ─── LEAD TIMELINE (drawer) ──────────────────────────────────────────────── */
function renderDrawerTimeline(l) {
  var host = $('#pane-timeline');
  if (!host) return;

  var c = leadCounts(l);
  var touches = (State.touches || []).filter(function (t) { return t.leadId === l.id; });
  var stageMoves = (State.stageEvents || []).filter(function (e) { return e.leadId === l.id; });
  var meetings = State.meetings.filter(function (m) { return m.leadId === l.id; });

  var items = [];
  touches.forEach(function (t) {
    items.push({
      at: t.at, color: touchTypeMeta(t.type).color,
      title: touchTypeMeta(t.type).label + (t.auto ? ' (from a stage move)' : ''),
      meta: [t.outcome, t.notes].filter(Boolean).join(' — ')
    });
  });
  stageMoves.forEach(function (e) {
    items.push({
      at: e.at, color: stageMeta(e.toStage).color,
      title: 'Stage ' + (e.fromStage ? e.fromStage + ' → ' : '') + e.toStage,
      meta: e.actor === 'evo' ? 'by Evo' : ''
    });
  });
  meetings.forEach(function (m) {
    items.push({
      at: (m.date || '') + 'T' + (m.time || '00:00') + ':00',
      color: '#0891B2',
      title: (m.status === 'done' ? 'Met — ' : 'Meeting — ') + (m.title || 'Meeting'),
      meta: [m.decision, m.nextStep].filter(Boolean).join(' · ')
    });
  });
  items.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });

  var pills = ['call', 'meeting', 'proposal', 'message', 'email', 'audit', 'visit']
    .filter(function (k) { return c[k]; })
    .map(function (k) {
      var m = touchTypeMeta(k);
      return '<span class="count-pill"><span class="chip-dot" style="background:' + esc(m.color) + '"></span>' +
        '<b>' + c[k] + '</b> ' + esc(m.label) + (c[k] > 1 ? 's' : '') + '</span>';
    }).join('');

  host.innerHTML =
    '<div class="section"><div class="section-title">What has actually happened' +
      '<span class="tiny muted">' + (c.total || 0) + ' interaction' + ((c.total || 0) === 1 ? '' : 's') + '</span></div>' +
      (pills ? '<div class="count-pills">' + pills + '</div>' :
        '<div class="muted small">Nothing logged with this lead yet.</div>') +
    '</div>' +

    '<div class="section"><div class="section-title">Log something now</div>' +
      '<div class="row">' +
      (State.settings.touchTypes || DEFAULT_SETTINGS.touchTypes).map(function (t) {
        return '<button class="btn btn-sm" data-act="log-touch" data-id="' + esc(l.id) + '" data-value="' + esc(t.key) + '">' +
          '<span class="chip-dot" style="background:' + esc(t.color) + '"></span>' + esc(t.label) + '</button>';
      }).join('') +
      '</div></div>' +

    '<div class="section"><div class="section-title">Everything, newest first</div>' +
      (items.length
        ? '<div class="tline">' + items.map(function (it, i) {
            return '<div class="tline-item">' +
              '<div class="tline-rail"><span class="tline-dot" style="background:' + esc(it.color) + '"></span>' +
              (i < items.length - 1 ? '<span class="tline-line"></span>' : '') + '</div>' +
              '<div class="tline-body">' +
                '<div class="tline-title">' + esc(it.title) + '</div>' +
                '<div class="tline-meta">' + esc(Fmt.date(String(it.at).slice(0, 10))) +
                (String(it.at).slice(11, 16) !== '00:00' && String(it.at).length > 10 ? ' · ' + esc(String(it.at).slice(11, 16)) : '') +
                (it.meta ? ' · ' + esc(it.meta) : '') + '</div>' +
              '</div></div>';
          }).join('') + '</div>'
        : '<div class="muted small">Nothing yet. Log a call or move the stage and it starts filling in.</div>') +
    '</div>';
}
