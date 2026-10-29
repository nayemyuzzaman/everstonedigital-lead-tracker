/* ═══════════════════════════════════════════════════════════════════════════
   booking.js — the public booking page:  <dashboard>?book=<link name>
   No sign-in. Shows free times, takes a booking, confirms it. Every slot it
   offers comes from the server, which only counts real meetings as busy.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var Book = { slug: '', page: null, duration: 0, date: '', time: '', busy: false, done: null, err: '', localTz: '' };

function renderBookingPage(slug) {
  Book.slug = slug;
  try { Book.localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { Book.localTz = ''; }
  document.body.classList.add('booking-mode');
  var gate = $('#gate'); if (gate) gate.hidden = true;
  var app = $('#app'); if (app) app.classList.remove('ready');
  var root = $('#bookingRoot');
  if (!root) return;
  root.hidden = false;
  root.innerHTML = '<div class="bk-page"><div class="bk-card">' + loadingBlock('Finding free times…') + '</div></div>';
  loadBookingPage();
  root.addEventListener('click', onBookingClick);
}

function loadingBlock(t) {
  return '<div class="bk-loading"><span class="typing"><i></i><i></i><i></i></span><span>' + esc(t) + '</span></div>';
}

function loadBookingPage(keepSelection) {
  api('bookingPage', { slug: Book.slug, duration: Book.duration || '' }, { timeout: 45000 }).then(function (r) {
    if (!r || !r.success) {
      Book.page = null;
      Book.err = r && r.error === 'NETWORK' ? 'Could not load the booking page. Check your connection and refresh.' : ((r && (r.message || r.error)) || 'This booking link does not work.');
      drawBooking();
      return;
    }
    Book.page = r;
    Book.duration = r.duration;
    if (!keepSelection || !r.days.some(function (d) { return d.date === Book.date; })) {
      Book.date = r.days.length ? r.days[0].date : '';
      Book.time = '';
    }
    document.title = (r.title || 'Book a call') + (r.host ? ' — ' + r.host : '');
    drawBooking();
  });
}

function bkDayParts(ymd) {
  var d = new Date(ymd + 'T12:00:00Z');
  return {
    dow: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    day: d.getUTCDate(),
    mon: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
    long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  };
}

/** "15:30" in the host's zone, shown in the visitor's own zone when they differ. */
function bkLocalTime(ymd, hm) {
  var p = Book.page;
  if (!p || !Book.localTz || Book.localTz === p.tz || typeof zonedToUtc !== 'function') return null;
  try {
    var utc = zonedToUtc(ymd, hm, p.tz);
    return utc.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: Book.localTz });
  } catch (e) { return null; }
}

function bkTimeLabel(hm) {
  var m = String(hm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hm;
  var h = +m[1], ap = h >= 12 ? 'pm' : 'am';
  var h12 = h % 12 || 12;
  return h12 + ':' + m[2] + ' ' + ap;
}

function drawBooking() {
  var root = $('#bookingRoot');
  if (!root) return;
  var p = Book.page;
  if (!p) {
    root.innerHTML = '<div class="bk-page"><div class="bk-card bk-center"><div class="bk-big">🗓️</div><h1>Not available</h1><p class="muted">' + esc(Book.err) + '</p></div></div>';
    return;
  }
  if (Book.done) { drawBookingDone(); return; }

  var day = null;
  p.days.forEach(function (d) { if (d.date === Book.date) day = d; });
  var otherTz = Book.localTz && Book.localTz !== p.tz;

  var html = '<div class="bk-page"><div class="bk-card">' +
    '<div class="bk-host"><span class="bk-avatar">' + esc(initialsOf(p.host || p.company || 'Book')) + '</span>' +
    '<div><div class="bk-host-name">' + esc(p.host || p.company || '') + '</div>' +
    '<div class="bk-host-sub">' + esc([p.hostTitle, p.company && p.host ? p.company : ''].filter(Boolean).join(' · ')) + '</div></div></div>' +
    '<h1 class="bk-title">' + esc(p.title || 'Book a call') + '</h1>' +
    (p.intro ? '<p class="bk-intro">' + esc(p.intro) + '</p>' : '') +
    '<div class="bk-meta"><span>' + icon('clock', 13) + ' ' + Book.duration + ' minutes</span>' +
    (p.location ? '<span>' + icon('meetings', 13) + ' ' + esc(p.location) + '</span>' : '') +
    '<span>' + icon('today', 13) + ' ' + esc(otherTz ? 'Times in your zone (' + Book.localTz + ')' : p.tz) + '</span></div>' +
    (p.durations.length > 1 ? '<div class="bk-durs">' + p.durations.map(function (d) {
      return '<button class="pill' + (d === Book.duration ? ' active' : '') + '" data-bk="dur" data-v="' + d + '">' + d + ' min</button>';
    }).join('') + '</div>' : '');

  if (!p.days.length) {
    html += '<div class="bk-empty">No free times in the next few weeks. Please get in touch directly.</div>';
  } else {
    html += '<div class="bk-step">1 · Pick a day</div><div class="bk-days">' + p.days.map(function (d) {
      var dp = bkDayParts(d.date);
      return '<button class="bk-day' + (d.date === Book.date ? ' active' : '') + '" data-bk="day" data-v="' + d.date + '">' +
        '<span class="bk-dow">' + dp.dow + '</span><span class="bk-dnum">' + dp.day + '</span><span class="bk-mon">' + dp.mon + '</span>' +
        '<span class="bk-count">' + d.slots.length + ' free</span></button>';
    }).join('') + '</div>';
    if (day) {
      html += '<div class="bk-step">2 · Pick a time <span class="muted">— ' + esc(bkDayParts(day.date).long) + '</span></div><div class="bk-slots">' + day.slots.map(function (t) {
        var local = bkLocalTime(day.date, t);
        return '<button class="bk-slot' + (t === Book.time ? ' active' : '') + '" data-bk="slot" data-v="' + t + '">' +
          esc(local || bkTimeLabel(t)) + (local ? '<span class="bk-tz">' + esc(bkTimeLabel(t)) + ' host</span>' : '') + '</button>';
      }).join('') + '</div>';
    }
    if (Book.time) html += bookingFormHtml(p, day);
  }
  html += '</div><div class="bk-foot">Your details go only to ' + esc(p.host || p.company || 'the host') + '.</div></div>';
  root.innerHTML = html;
  if (Book.time) { var f = $('#bkName'); if (f && !f.value) setTimeout(function () { var a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) f.focus({ preventScroll: true }); }, 40); }
}

function bookingFormHtml(p, day) {
  var local = bkLocalTime(day.date, Book.time);
  return '<div class="bk-step" id="bkFormStart">3 · Your details</div>' +
    '<div class="bk-chosen">' + icon('check', 13) + ' ' + esc(bkDayParts(day.date).long) + ', ' + esc(local || bkTimeLabel(Book.time)) + ' · ' + Book.duration + ' min</div>' +
    '<form class="bk-form" id="bkForm" autocomplete="on" onsubmit="return false">' +
    '<div class="field-row"><div class="field"><label>Your name *</label><input class="input" id="bkName" autocomplete="name" required/></div>' +
    '<div class="field"><label>Email *</label><input class="input" id="bkEmail" type="email" autocomplete="email" required/></div></div>' +
    (p.ask.phone || p.ask.company ? '<div class="field-row">' +
      (p.ask.phone ? '<div class="field"><label>Phone / WhatsApp</label><input class="input" id="bkPhone" type="tel" autocomplete="tel"/></div>' : '') +
      (p.ask.company ? '<div class="field"><label>Business name</label><input class="input" id="bkCompany" autocomplete="organization"/></div>' : '') + '</div>' : '') +
    (p.ask.site ? '<div class="field"><label>Website</label><input class="input" id="bkSite" placeholder="yourbusiness.com" autocomplete="url"/></div>' : '') +
    '<div class="field"><label>What would you like to talk about?</label><textarea class="textarea" id="bkNote" rows="3"></textarea></div>' +
    '<input type="text" id="bkHp" name="company_website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true"/>' +
    '<div class="bk-err" id="bkErr" role="alert"></div>' +
    '<button class="btn btn-primary bk-submit" data-bk="submit" type="button">Confirm booking</button>' +
    '</form>';
}

function drawBookingDone() {
  var root = $('#bookingRoot');
  var b = Book.done;
  root.innerHTML = '<div class="bk-page"><div class="bk-card bk-center">' +
    '<div class="bk-big">✅</div><h1>You are booked</h1>' +
    '<p class="bk-when">' + esc(b.when || (b.date + ' ' + b.time)) + '</p>' +
    (b.location ? '<p class="muted">' + (/^https?:\/\//.test(b.location) ? '<a href="' + esc(b.location) + '" target="_blank" rel="noopener">' + esc(b.location) + '</a>' : esc(b.location)) + '</p>' : '') +
    (b.thanks ? '<p>' + esc(b.thanks) + '</p>' : '') +
    '<p class="muted small">A confirmation with a calendar invite is on its way to your inbox.</p>' +
    (b.gcal ? '<a class="btn btn-primary" href="' + esc(b.gcal) + '" target="_blank" rel="noopener">Add to Google Calendar</a>' : '') +
    '</div></div>';
}

function onBookingClick(e) {
  var el = e.target.closest('[data-bk]');
  if (!el || Book.busy) return;
  var kind = el.dataset.bk, v = el.dataset.v;
  if (kind === 'dur') { Book.duration = Number(v); Book.time = ''; drawBooking(); loadBookingPage(true); return; }
  if (kind === 'day') { Book.date = v; Book.time = ''; drawBooking(); return; }
  if (kind === 'slot') {
    Book.time = v;
    drawBooking();
    var start = $('#bkFormStart');
    if (start && start.scrollIntoView) start.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (kind === 'submit') submitBooking();
}

function submitBooking() {
  var val = function (id) { var el = $('#' + id); return el ? String(el.value || '').trim() : ''; };
  var err = $('#bkErr');
  var body = {
    slug: Book.slug, date: Book.date, time: Book.time, duration: Book.duration,
    name: val('bkName'), email: val('bkEmail'), phone: val('bkPhone'), company: val('bkCompany'),
    site: val('bkSite'), note: val('bkNote'), hp: val('bkHp')
  };
  if (body.name.length < 2) { err.textContent = 'Please type your name.'; $('#bkName').focus(); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) { err.textContent = 'Please type a valid email address.'; $('#bkEmail').focus(); return; }
  err.textContent = '';
  Book.busy = true;
  var btn = $('[data-bk="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Booking…'; }
  api('bookSlot', body, { timeout: 60000 }).then(function (r) {
    Book.busy = false;
    if (r && r.success) { Book.done = r.booking || { date: Book.date, time: Book.time }; drawBooking(); window.scrollTo(0, 0); return; }
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm booking'; }
    if (r && r.error === 'SLOT_TAKEN') {
      if (Book.page && r.days) Book.page.days = r.days;
      Book.time = '';
      drawBooking();
      toast(r.message || 'That time was just taken — please pick another.', 'warn', 6000);
      return;
    }
    if (err) err.textContent = r && r.error === 'NETWORK' ? 'Connection problem — please try again.' : ((r && (r.message || r.error)) || 'Could not book. Please try again.');
  });
}
