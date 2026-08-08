/* ═══════════════════════════════════════════════════════════════════════════
   main.js — modals, forms, event wiring, boot
   Every interactive element is reached through delegation on data-act, so no
   markup ever has to embed a quoted value into an inline handler.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ─── modal ─────────────────────────────────────────────────────────────── */
var Modal = { data: {}, onClose: null };

function openModal(opts) {
  Modal.data = opts.data || {};
  Modal.onClose = opts.onClose || null;
  $('#modalTitle').textContent = opts.title || '';
  $('#modalBody').innerHTML = opts.body || '';
  $('#modalFoot').innerHTML = opts.foot === undefined
    ? '<button class="btn" data-act="close-modal">Close</button>' : opts.foot;
  $('#modalBox').classList.toggle('wide', !!opts.wide);
  $('#modalBox').classList.toggle('narrow', !!opts.narrow);
  $('#modal').classList.add('show');

  var first = $('#modalBody input, #modalBody textarea, #modalBody select');
  if (first && !opts.noFocus) setTimeout(function () { first.focus(); }, 60);
}

function closeModal() {
  $('#modal').classList.remove('show');
  if (Modal.onClose) { try { Modal.onClose(); } catch (e) {} }
  Modal.onClose = null;
}

function confirmDialog(title, message, confirmLabel, onConfirm, danger) {
  openModal({
    title: title,
    narrow: true,
    body: '<p class="small">' + esc(message) + '</p>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-act="confirm-yes">' + esc(confirmLabel) + '</button>',
    data: { onConfirm: onConfirm }
  });
}

/* ─── lead form ─────────────────────────────────────────────────────────── */
function openLeadForm(id) {
  var lead = id ? getLead(id) : null;
  var draftKey = 'lead:' + (id || 'new');
  var draft = Drafts.get(draftKey);
  var s = State.settings;

  var d = lead ? {
    name: lead.name, contact: lead.contact, site: lead.site, phone: lead.phone,
    wa: lead.wa, email: lead.email, source: lead.source, stage: lead.stage,
    priority: lead.priority, service: lead.service, value: lead.value,
    followup: lead.followup, nextStep: lead.nextStep, notes: lead.notes,
    labels: (lead.labels || []).join(', ')
  } : {
    name: '', contact: '', site: '', phone: '', wa: '', email: '',
    source: (s.sources || [])[0] || 'Ads',
    stage: ((s.stages || [])[0] || {}).name || 'New',
    priority: 'warm', service: '', value: '', followup: '', nextStep: '', notes: '', labels: ''
  };

  var restored = false;
  if (draft && draft.data) { d = Object.assign(d, draft.data); restored = true; }

  function opts(list, current, valueKey, labelKey) {
    return list.map(function (o) {
      var v = valueKey ? o[valueKey] : o;
      var lb = labelKey ? o[labelKey] : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(current) ? ' selected' : '') + '>' + esc(lb) + '</option>';
    }).join('');
  }

  openModal({
    title: lead ? 'Edit ' + (lead.name || 'lead') : 'Add a lead',
    wide: true,
    body:
      (restored ? '<div class="chip chip-warm" style="height:auto;padding:6px 10px;white-space:normal">Restored what you were typing last time. <button class="btn btn-sm" data-act="discard-draft" data-key="' + esc(draftKey) + '" style="margin-left:8px">Start fresh</button></div>' : '') +
      '<div class="field-row">' +
        '<div class="field"><label>Business name</label><input class="input lf" data-k="name" value="' + esc(d.name) + '" placeholder="Cosmo Dental"/></div>' +
        '<div class="field"><label>Contact person</label><input class="input lf" data-k="contact" value="' + esc(d.contact) + '" placeholder="Dr Rahman"/></div>' +
      '</div>' +
      '<div class="field"><label>Website</label><input class="input lf" data-k="site" value="' + esc(d.site) + '" placeholder="cosmodental.com"/></div>' +
      '<div class="field-row-3">' +
        '<div class="field"><label>Phone</label><input class="input lf" data-k="phone" value="' + esc(d.phone) + '" placeholder="+880 17…"/></div>' +
        '<div class="field"><label>WhatsApp</label><input class="input lf" data-k="wa" value="' + esc(d.wa) + '" placeholder="if different"/></div>' +
        '<div class="field"><label>Email</label><input class="input lf" data-k="email" value="' + esc(d.email) + '" placeholder="name@company.com"/></div>' +
      '</div>' +
      '<div class="field-row-3">' +
        '<div class="field"><label>Stage</label><select class="select lf" data-k="stage">' + opts(s.stages || [], d.stage, 'name', 'name') + '</select></div>' +
        '<div class="field"><label>Priority</label><select class="select lf" data-k="priority">' + opts(s.priorities || [], d.priority, 'key', 'name') + '</select></div>' +
        '<div class="field"><label>Source</label><select class="select lf" data-k="source">' + opts(s.sources || [], d.source) + '</select></div>' +
      '</div>' +
      '<div class="field-row-3">' +
        '<div class="field"><label>Service</label><select class="select lf" data-k="service"><option value="">—</option>' + opts(s.services || [], d.service) + '</select></div>' +
        '<div class="field"><label>Deal value</label><input class="input lf" data-k="value" type="number" value="' + esc(d.value) + '" placeholder="25000"/></div>' +
        '<div class="field"><label>Follow-up date</label><input class="input lf" data-k="followup" type="date" value="' + esc(d.followup) + '"/></div>' +
      '</div>' +
      '<div class="field"><label>Next step</label><input class="input lf" data-k="nextStep" value="' + esc(d.nextStep) + '" placeholder="What exactly happens next?"/></div>' +
      '<div class="field"><label>Labels (comma separated)</label><input class="input lf" data-k="labels" value="' + esc(d.labels) + '" placeholder="Retainer, Big Fish"/></div>' +
      '<div class="field"><label>Notes</label><textarea class="textarea lf" data-k="notes" rows="4" placeholder="Bangla is fine — Evo reads it">' + esc(d.notes) + '</textarea></div>',
    foot:
      '<span class="spread tiny muted" id="lfDraftNote"></span>' +
      '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save-lead" data-id="' + esc(id || '') + '" data-key="' + esc(draftKey) + '">' +
      (lead ? 'Save changes' : 'Add lead') + '</button>',
    data: { draftKey: draftKey }
  });

  // Autosave while typing so nothing is lost if the tab closes.
  var saveDraft = debounce(function () {
    Drafts.set(draftKey, readLeadForm());
    var note = $('#lfDraftNote');
    if (note) note.textContent = 'Draft saved';
  }, 500);
  $$('#modalBody .lf').forEach(function (el) {
    el.addEventListener('input', saveDraft);
    el.addEventListener('change', saveDraft);
  });
}

function readLeadForm() {
  var out = {};
  $$('#modalBody .lf').forEach(function (el) { out[el.dataset.k] = el.value; });
  return out;
}

function saveLeadFromForm(id, draftKey) {
  var f = readLeadForm();
  if (!f.name && !f.phone && !f.site) {
    toast('A lead needs at least a name, phone or website', 'warn');
    return;
  }
  var patch = {
    name: f.name.trim(),
    contact: f.contact.trim(),
    site: f.site.trim() ? normalizeUrl(f.site.trim()) : '',
    phone: f.phone.trim(),
    wa: f.wa.trim(),
    email: f.email.trim(),
    stage: f.stage,
    priority: f.priority,
    source: f.source,
    service: f.service,
    value: Number(f.value) || 0,
    followup: f.followup,
    nextStep: f.nextStep.trim(),
    notes: f.notes,
    labels: f.labels.split(',').map(function (x) { return x.trim(); }).filter(Boolean)
  };
  if (id) patch.id = id;

  var lead = Ops.saveLead(patch, { label: id ? 'edit on ' + patch.name : 'new lead' });
  Drafts.clear(draftKey);
  closeModal();
  toast(id ? 'Saved' : 'Lead added', 'good');
  if (!id && lead) openDetail(lead.id);
}

/* ─── meeting form ──────────────────────────────────────────────────────── */
function openMeetingForm(meetingId, presetLeadId) {
  var m = meetingId ? getMeeting(meetingId) : null;
  var leads = activeLeads().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  var leadId = m ? m.leadId : (presetLeadId || '');

  openModal({
    title: m ? 'Edit meeting' : 'Schedule a meeting',
    body:
      '<div class="field"><label>Lead</label><select class="select mf" data-k="leadId"><option value="">No lead</option>' +
      leads.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === leadId ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>What is this meeting for?</label><input class="input mf" data-k="title" value="' + esc(m ? m.title : '') + '" placeholder="Proposal walkthrough"/></div>' +
      '<div class="field-row-3">' +
        '<div class="field"><label>Date</label><input class="input mf" data-k="date" type="date" value="' + esc(m ? m.date : Dates.today()) + '"/></div>' +
        '<div class="field"><label>Time</label><input class="input mf" data-k="time" type="time" value="' + esc(m ? m.time : '11:00') + '"/></div>' +
        '<div class="field"><label>Minutes</label><input class="input mf" data-k="duration" type="number" value="' + esc(m ? m.duration : 45) + '"/></div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>Where</label><select class="select mf" data-k="platform">' +
        ['google', 'zoom', 'phone', 'whatsapp', 'in person'].map(function (p) {
          return '<option value="' + p + '"' + (m && m.platform === p ? ' selected' : '') + '>' + p + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label>Link or address</label><input class="input mf" data-k="location" value="' + esc(m ? m.location : '') + '"/></div>' +
      '</div>' +
      '<div class="field"><label>Agenda</label><textarea class="textarea mf" data-k="agenda" rows="3" placeholder="What you want to walk out with">' + esc(m ? m.agenda : '') + '</textarea></div>' +
      '<div class="tiny muted">This books a Google Calendar event with a 30-minute reminder.</div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save-meeting" data-id="' + esc(meetingId || '') + '">' + (m ? 'Save' : 'Schedule') + '</button>'
  });
}

function saveMeetingFromForm(id) {
  var f = {};
  $$('#modalBody .mf').forEach(function (el) { f[el.dataset.k] = el.value; });
  if (!f.title && !f.leadId) { toast('Give the meeting a title or pick a lead', 'warn'); return; }

  var patch = {
    leadId: f.leadId, title: f.title || 'Meeting', date: f.date, time: f.time,
    duration: Number(f.duration) || 45, platform: f.platform,
    location: f.location, agenda: f.agenda
  };
  if (id) patch.id = id;
  Ops.saveMeeting(patch);
  closeModal();
  toast(id ? 'Meeting updated' : 'Meeting scheduled — added to your calendar', 'good');
}

/* ─── meeting outcome ───────────────────────────────────────────────────── */
function openMeetingOutcome(id) {
  var m = getMeeting(id);
  if (!m) return;
  var lead = getLead(m.leadId);

  openModal({
    title: 'How did it go?',
    wide: true,
    body:
      '<div class="tiny muted">' + esc(m.title || 'Meeting') + (lead ? ' with ' + esc(lead.name) : '') + ' · ' + esc(Fmt.date(m.date)) + '</div>' +
      '<div class="field"><label>Did it happen?</label><select class="select of" data-k="status">' +
      '<option value="done">Yes, we met</option>' +
      '<option value="no_show">They did not show</option>' +
      '<option value="cancelled">Cancelled</option>' +
      '</select></div>' +
      '<div class="field"><label>What did you talk about?</label><textarea class="textarea of" data-k="discussed" rows="3" placeholder="Their situation, what they said they need">' + esc(m.discussed || '') + '</textarea></div>' +
      '<div class="field"><label>What was decided?</label><textarea class="textarea of" data-k="decision" rows="2" placeholder="Anything agreed, or where it stalled">' + esc(m.decision || '') + '</textarea></div>' +
      '<div class="field-row">' +
        '<div class="field"><label>Next step</label><input class="input of" data-k="nextStep" value="' + esc(m.nextStep || '') + '" placeholder="Send the proposal"/></div>' +
        '<div class="field"><label>By when</label><input class="input of" data-k="nextStepDate" type="date" value="' + esc(m.nextStepDate || Dates.addDays(Dates.today(), 2)) + '"/></div>' +
      '</div>' +
      '<div class="field"><label>How interested are they, honestly?</label>' +
      '<select class="select of" data-k="interest">' +
      [['1', '1 — polite, not interested'], ['2', '2 — mildly curious'], ['3', '3 — genuinely considering'],
       ['4', '4 — wants it, sorting details'], ['5', '5 — ready to sign']].map(function (o) {
        return '<option value="' + o[0] + '"' + (String(m.interest) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="tiny muted">The next step and date go straight onto the lead, so it can never sit there with nothing booked.</div>',
    foot: '<button class="btn" data-act="close-modal">Later</button>' +
      '<button class="btn btn-primary" data-act="save-outcome" data-id="' + esc(id) + '">Save outcome</button>'
  });

  var sel = $('#modalBody .of[data-k="status"]');
  if (sel) sel.value = m.status === 'upcoming' ? 'done' : m.status;
}

function saveOutcome(id) {
  var f = {};
  $$('#modalBody .of').forEach(function (el) { f[el.dataset.k] = el.value; });
  var m = getMeeting(id);

  Ops.saveMeeting({
    id: id, status: f.status, discussed: f.discussed, decision: f.decision,
    nextStep: f.nextStep, nextStepDate: f.status === 'done' ? f.nextStepDate : '',
    interest: Number(f.interest) || 0
  }, { label: 'meeting outcome' });

  if (m && m.leadId) {
    var summary = f.status === 'done'
      ? 'Meeting done — ' + (f.decision || f.discussed || 'notes logged')
      : f.status === 'no_show' ? 'They did not show up' : 'Meeting cancelled';
    Ops.addHistory(m.leadId, summary);
  }

  closeModal();
  toast('Outcome logged' + (f.status === 'done' && f.nextStepDate ? ' — next step booked for ' + Fmt.shortDate(f.nextStepDate) : ''), 'good');
}

/* ─── documents ─────────────────────────────────────────────────────────── */
function openDocForm(presetLeadId) {
  var leads = activeLeads().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  openModal({
    title: 'Add a document',
    body:
      '<div class="field"><label>Lead</label><select class="select df" data-k="leadId"><option value="">No lead</option>' +
      leads.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === presetLeadId ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Name</label><input class="input df" data-k="name" placeholder="Cosmo Dental — SEO proposal"/></div>' +
      '<div class="field"><label>Link</label><input class="input df" data-k="url" placeholder="https://docs.google.com/…"/></div>' +
      '<div class="field"><label>Type</label><select class="select df" data-k="type">' +
      ['proposal', 'audit', 'invoice', 'sheet', 'deck', 'doc', 'image', 'pdf', 'link', 'other'].map(function (t) {
        return '<option value="' + t + '">' + t + '</option>';
      }).join('') + '</select></div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save-doc">Add</button>'
  });
}

function saveDocFromForm() {
  var f = {};
  $$('#modalBody .df').forEach(function (el) { f[el.dataset.k] = el.value; });
  if (!f.name && !f.url) { toast('Give it a name or a link', 'warn'); return; }
  Ops.saveDoc({
    leadId: f.leadId, name: f.name || 'Untitled',
    url: f.url ? normalizeUrl(f.url) : '', type: f.type || 'other'
  });
  closeModal();
  toast('Document added', 'good');
}

/* ─── follow-up picker ──────────────────────────────────────────────────── */
function openFollowupPicker(id) {
  var lead = getLead(id);
  if (!lead) return;
  var presets = [
    ['Tomorrow', 1], ['In 2 days', 2], ['In 3 days', 3],
    ['Next week', 7], ['In 2 weeks', 14], ['In a month', 30]
  ];

  openModal({
    title: 'When will you follow up with ' + (lead.name || 'this lead') + '?',
    narrow: true,
    body:
      '<div class="pill-row">' + presets.map(function (p) {
        return '<button class="pill" data-act="fu-preset" data-id="' + esc(id) + '" data-days="' + p[1] + '">' + esc(p[0]) + '</button>';
      }).join('') + '</div>' +
      '<div class="field" style="margin-top:14px"><label>Or pick a date</label>' +
      '<input class="input" id="fuDate" type="date" value="' + esc(lead.followup || Dates.addDays(Dates.today(), 3)) + '"/></div>' +
      '<div class="field"><label>What exactly will you do?</label>' +
      '<input class="input" id="fuNote" value="' + esc(lead.nextStep || '') + '" placeholder="Call about the proposal"/></div>' +
      (lead.followup ? '<button class="btn btn-sm btn-danger" data-act="fu-clear" data-id="' + esc(id) + '" style="margin-top:10px">Clear the date</button>' : ''),
    foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-act="fu-save" data-id="' + esc(id) + '">Book it</button>'
  });
}

/* ─── lost reason ───────────────────────────────────────────────────────── */
function askLostReason(id) {
  var lead = getLead(id);
  if (!lead) return;
  var reasons = State.settings.lostReasons || [];

  openModal({
    title: 'Why did ' + (lead.name || 'this one') + ' not work out?',
    narrow: true,
    body:
      '<p class="small muted">Three months from now this is what tells you whether to change your pricing or your pitch.</p>' +
      '<div class="pill-row">' + reasons.map(function (r) {
        return '<button class="pill" data-act="lost-pick" data-id="' + esc(id) + '" data-value="' + esc(r) + '">' + esc(r) + '</button>';
      }).join('') + '</div>' +
      '<div class="field" style="margin-top:12px"><label>Or write your own</label>' +
      '<input class="input" id="lostOther" placeholder="What actually happened"/></div>',
    foot: '<button class="btn" data-act="close-modal">Skip</button>' +
      '<button class="btn btn-primary" data-act="lost-save" data-id="' + esc(id) + '">Save reason</button>'
  });
}

/* ─── share ─────────────────────────────────────────────────────────────── */
function leadSummary(l) {
  var lines = [
    l.name || 'Lead',
    l.contact ? 'Contact: ' + l.contact : '',
    l.site ? 'Website: ' + normalizeUrl(l.site) : '',
    l.phone ? 'Phone: ' + l.phone : '',
    l.email ? 'Email: ' + l.email : '',
    'Stage: ' + l.stage + ' · Priority: ' + priorityMeta(l.priority).name,
    l.service ? 'Service: ' + l.service : '',
    l.value ? 'Value: ' + Fmt.money(l.value) : '',
    l.followup ? 'Next follow-up: ' + Fmt.date(l.followup) + (l.nextStep ? ' — ' + l.nextStep : '') : '',
    l.notes ? '\nNotes: ' + l.notes : ''
  ];
  return lines.filter(Boolean).join('\n');
}

function openShare(id) {
  var l = getLead(id);
  if (!l) return;
  var text = leadSummary(l);
  var enc = encodeURIComponent(text);
  var siteEnc = encodeURIComponent(normalizeUrl(l.site) || '');

  var buttons = [
    '<button class="btn" data-act="copy" data-value="' + esc(text) + '">' + icon('copy', 13) + ' Copy details</button>',
    '<a class="btn" href="https://wa.me/?text=' + enc + '" target="_blank" rel="noopener noreferrer">' + icon('wa', 13) + ' WhatsApp</a>',
    '<a class="btn" href="mailto:?subject=' + encodeURIComponent('Lead: ' + (l.name || '')) + '&body=' + enc + '">' + icon('mail', 13) + ' Email</a>',
    '<a class="btn" href="sms:?&body=' + enc + '">SMS</a>',
    '<button class="btn" data-act="share-telegram" data-id="' + esc(id) + '">' + icon('tg', 13) + ' My Telegram</button>',
    '<a class="btn" href="https://t.me/share/url?url=' + siteEnc + '&text=' + enc + '" target="_blank" rel="noopener noreferrer">Telegram contact</a>',
    l.site ? '<a class="btn" href="https://www.facebook.com/sharer/sharer.php?u=' + siteEnc + '" target="_blank" rel="noopener noreferrer">Facebook</a>' : '',
    l.site ? '<a class="btn" href="https://www.linkedin.com/sharing/share-offsite/?url=' + siteEnc + '" target="_blank" rel="noopener noreferrer">LinkedIn</a>' : ''
  ].filter(Boolean).join('');

  openModal({
    title: 'Share ' + (l.name || 'lead'),
    body:
      (navigator.share ? '<button class="btn btn-primary" data-act="native-share" data-id="' + esc(id) + '" style="width:100%">' + icon('share', 14) + ' Share via your device</button><hr class="divider"/>' : '') +
      '<div class="row">' + buttons + '</div>' +
      '<hr class="divider"/>' +
      '<div class="field"><label>What gets shared</label><textarea class="textarea" rows="8" readonly>' + esc(text) + '</textarea></div>' +
      '<div class="tiny muted">Facebook does not let anyone pre-fill the message any more — it will share the website link and you type your own words.</div>',
    foot: '<button class="btn" data-act="close-modal">Close</button>'
  });
}

function openWhatsapp(id) {
  var l = getLead(id);
  if (!l) return;
  var raw = l.wa || l.phone;
  if (!raw) { toast('No number on file', 'warn'); return; }
  var digits = digitsOnly(raw);
  if (digits.length === 11 && digits.charAt(0) === '0') digits = '88' + digits;
  if (digits.length === 10) digits = '880' + digits;

  var greeting = 'Hello' + (l.contact ? ' ' + l.contact : '') + ', this is Nayemuzzaman from Everstone Digital.';

  openModal({
    title: 'WhatsApp ' + (l.name || ''),
    narrow: true,
    body:
      '<div class="field"><label>Number</label><input class="input" id="waNum" value="' + esc(digits) + '"/></div>' +
      '<div class="field"><label>Opening message</label><textarea class="textarea" id="waMsg" rows="4">' + esc(greeting) + '</textarea></div>',
    foot:
      '<button class="btn" data-act="copy" data-value="' + esc(digits) + '">Copy number</button>' +
      '<button class="btn" data-act="wa-open" data-mode="web">Open WhatsApp Web</button>' +
      '<button class="btn btn-primary" data-act="wa-open" data-mode="app">Open WhatsApp</button>'
  });
}

/* ─── inline editing ────────────────────────────────────────────────────── */
function startInlineEdit(el) {
  if (el.dataset.editing === '1') return;
  var id = el.dataset.id, field = el.dataset.field, type = el.dataset.type || 'text';
  var lead = getLead(id);
  if (!lead) return;

  el.dataset.editing = '1';
  var original = el.innerHTML;
  var value = lead[field] === undefined || lead[field] === null ? '' : lead[field];

  var control;
  if (type === 'textarea') {
    control = document.createElement('textarea');
    control.className = 'textarea';
    control.rows = 4;
    control.value = value;
  } else if (type === 'select') {
    control = document.createElement('select');
    control.className = 'select';
    var options = field === 'priority'
      ? (State.settings.priorities || []).map(function (p) { return { v: p.key, l: p.name }; })
      : field === 'source'
        ? (State.settings.sources || []).map(function (x) { return { v: x, l: x }; })
        : (State.settings.services || []).map(function (x) { return { v: x, l: x }; });
    if (field !== 'priority') options.unshift({ v: '', l: '—' });
    control.innerHTML = options.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(value) ? ' selected' : '') + '>' + esc(o.l) + '</option>';
    }).join('');
  } else {
    control = document.createElement('input');
    control.className = 'input';
    control.type = type === 'number' ? 'number' : type === 'date' ? 'date' : 'text';
    control.value = value;
  }

  el.innerHTML = '';
  el.appendChild(control);
  control.focus();
  if (control.select && type !== 'date' && type !== 'select') control.select();

  var finished = false;
  function commit() {
    if (finished) return;
    finished = true;
    var next = control.value;
    if (type === 'number') next = Number(next) || 0;
    if (field === 'site' && next) next = normalizeUrl(next);
    el.dataset.editing = '';

    if (String(next) === String(value)) { el.innerHTML = original; return; }
    var patch = { id: id };
    patch[field] = next;
    Ops.saveLead(patch, { label: fieldLabel(field) + ' on ' + (lead.name || 'lead') });
  }

  function cancel() {
    if (finished) return;
    finished = true;
    el.dataset.editing = '';
    el.innerHTML = original;
  }

  control.addEventListener('blur', commit);
  control.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); control.blur(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); control.blur(); }
  });
  if (type === 'select' || type === 'date') {
    control.addEventListener('change', function () { control.blur(); });
  }
}

function openLabelEditor(id) {
  var lead = getLead(id);
  if (!lead) return;
  var known = State.settings.labels || [];
  var mine = lead.labels || [];

  openModal({
    title: 'Labels for ' + (lead.name || 'lead'),
    narrow: true,
    body:
      '<div class="pill-row">' + known.map(function (t) {
        return '<button class="pill' + (mine.indexOf(t) >= 0 ? ' active' : '') + '" data-act="toggle-label" data-id="' + esc(id) + '" data-value="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>' +
      '<div class="field" style="margin-top:14px"><label>Add a new one</label>' +
      '<input class="input" id="newLabel" placeholder="e.g. Ramadan campaign"/></div>' +
      '<div class="tiny muted">New labels are saved to your settings and offered on every lead after this.</div>',
    foot: '<button class="btn" data-act="close-modal">Done</button>' +
      '<button class="btn btn-primary" data-act="add-label" data-id="' + esc(id) + '">Add label</button>'
  });
}

/* ─── CSV ───────────────────────────────────────────────────────────────── */
function exportCsv() {
  var rows = [['Name', 'Contact', 'Website', 'Phone', 'WhatsApp', 'Email', 'Source', 'Stage',
    'Priority', 'Labels', 'Service', 'Value', 'Follow-up', 'Next step', 'Proposal sent',
    'Lost reason', 'Notes', 'Created', 'Last activity', 'Edits']];

  filteredLeads().forEach(function (l) {
    rows.push([l.name, l.contact, normalizeUrl(l.site), l.phone, l.wa, l.email, l.source,
      l.stage, priorityMeta(l.priority).name, (l.labels || []).join(' | '), l.service, l.value,
      l.followup, l.nextStep, l.proposalSentAt, l.lostReason, l.notes,
      (l.createdAt || '').slice(0, 10), (l.lastActivityAt || '').slice(0, 10), l.editCount || 0]);
  });

  var csv = rows.map(function (r) {
    return r.map(function (c) {
      var s = c === null || c === undefined ? '' : String(c);
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\r\n');

  var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'everstone-leads-' + Dates.today() + '.csv';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  toast('CSV downloaded', 'good');
}

/* ─── command palette ───────────────────────────────────────────────────── */
var Cmdk = { index: 0, results: [] };

function openCmdk() {
  $('#cmdk').classList.add('show');
  var input = $('#cmdkInput');
  input.value = '';
  input.focus();
  renderCmdk('');
}

function closeCmdk() { $('#cmdk').classList.remove('show'); }

function renderCmdk(query) {
  var q = String(query || '').toLowerCase().trim();
  var results = [];

  var commands = [
    { label: 'Add a lead', kind: 'action', run: function () { openLeadForm(); } },
    { label: 'Schedule a meeting', kind: 'action', run: function () { openMeetingForm(); } },
    { label: 'Go to Today', kind: 'page', run: function () { switchPage('today'); } },
    { label: 'Go to Leads', kind: 'page', run: function () { switchPage('leads'); } },
    { label: 'Go to Pipeline', kind: 'page', run: function () { switchPage('pipeline'); } },
    { label: 'Go to Follow-ups', kind: 'page', run: function () { switchPage('followups'); } },
    { label: 'Go to Meetings', kind: 'page', run: function () { switchPage('meetings'); } },
    { label: 'Go to Analytics', kind: 'page', run: function () { switchPage('analytics'); } },
    { label: 'Ask Evo', kind: 'page', run: function () { switchPage('ai'); } },
    { label: 'Settings', kind: 'page', run: function () { switchPage('settings'); } },
    { label: 'Sync now', kind: 'action', run: function () { pullFromServer(); } },
    { label: 'Export CSV', kind: 'action', run: function () { switchPage('leads'); exportCsv(); } },
    { label: 'Show leads with no next step', kind: 'filter', run: function () {
      State.ui.filters.health = 'nonext'; switchPage('leads');
    } }
  ];

  commands.forEach(function (c) {
    if (!q || c.label.toLowerCase().indexOf(q) >= 0) results.push(c);
  });

  if (q) {
    activeLeads().filter(function (l) {
      return (l.name + ' ' + l.phone + ' ' + l.site + ' ' + l.contact).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 8).forEach(function (l) {
      results.unshift({
        label: l.name || 'Untitled',
        sub: l.stage + ' · ' + (l.phone || prettyUrl(l.site) || ''),
        kind: 'lead',
        color: priorityMeta(l.priority).color,
        run: function () { openDetail(l.id); }
      });
    });
  }

  Cmdk.results = results.slice(0, 12);
  Cmdk.index = 0;

  $('#cmdkList').innerHTML = Cmdk.results.length ? Cmdk.results.map(function (r, i) {
    return '<div class="cmdk-item' + (i === 0 ? ' sel' : '') + '" data-act="cmdk-run" data-index="' + i + '">' +
      (r.color ? '<span class="chip-dot" style="background:' + esc(r.color) + '"></span>' : '<span style="width:6px"></span>') +
      '<span><div>' + esc(r.label) + '</div>' + (r.sub ? '<div class="tiny muted">' + esc(r.sub) + '</div>' : '') + '</span>' +
      '<span class="ck-kind">' + esc(r.kind) + '</span></div>';
  }).join('') : '<div class="muted small" style="padding:14px">Nothing matches.</div>';
}

function moveCmdk(delta) {
  if (!Cmdk.results.length) return;
  Cmdk.index = (Cmdk.index + delta + Cmdk.results.length) % Cmdk.results.length;
  $$('#cmdkList .cmdk-item').forEach(function (el, i) {
    el.classList.toggle('sel', i === Cmdk.index);
    if (i === Cmdk.index) el.scrollIntoView({ block: 'nearest' });
  });
}

function runCmdk(index) {
  var r = Cmdk.results[index];
  closeCmdk();
  if (r && r.run) r.run();
}

/* ─── settings save ─────────────────────────────────────────────────────── */
function collectSettings() {
  function lines(sel) {
    var el = $(sel);
    return el ? el.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : [];
  }

  var stages = [];
  $$('#stageEditor [data-kind="stage"]').forEach(function (row) {
    var name = $('.le-name', row).value.trim();
    if (name) stages.push({ name: name, color: $('.le-color', row).value });
  });

  var priorities = [];
  $$('#priorityEditor [data-kind="priority"]').forEach(function (row) {
    var name = $('.le-name', row).value.trim();
    if (name) {
      priorities.push({
        key: name.toLowerCase().replace(/[^a-z0-9]/g, '') || uid('p'),
        name: name,
        color: $('.le-color', row).value
      });
    }
  });

  var cadence = {};
  $$('.cadence-input').forEach(function (el) {
    cadence[el.dataset.stage] = el.value.split(',').map(function (x) {
      return parseInt(x.trim(), 10);
    }).filter(function (n) { return !isNaN(n) && n > 0; });
  });

  return {
    stages: stages.length ? stages : State.settings.stages,
    priorities: priorities.length ? priorities : State.settings.priorities,
    labels: lines('#setLabels'),
    sources: lines('#setSources'),
    services: lines('#setServices'),
    lostReasons: lines('#setLostReasons'),
    cadence: cadence,
    rotting: {
      warnDays: Number(($('#setWarnDays') || {}).value) || 14,
      staleDays: Number(($('#setStaleDays') || {}).value) || 30
    },
    aiInstructions: ($('#setAiInstructions') || {}).value || '',
    aiModel: ($('#setAiModel') || {}).value || 'fast',
    alarmEnabled: !!($('#setAlarm') || {}).checked
  };
}

/* ─── login gate ────────────────────────────────────────────────────────── */
function showGate(message) {
  $('#gate').hidden = false;
  $('#app').classList.remove('ready');
  if (message) $('#gateErr').textContent = message;

  var or = $('#gateOr');
  if (Cfg.clientId && window.google && google.accounts) {
    try {
      google.accounts.id.initialize({
        client_id: Cfg.clientId,
        callback: function (resp) { doLogin({ idToken: resp.credential }); }
      });
      google.accounts.id.renderButton($('#googleBtn'), { theme: 'outline', size: 'large', width: 320 });
      if (or) or.hidden = false;
    } catch (e) { /* fall back to the password field */ }
  }
}

function hideGate() {
  $('#gate').hidden = true;
  $('#app').classList.add('ready');
}

function doLogin(credentials) {
  var err = $('#gateErr');
  err.textContent = '';

  if (!Cfg.url) { openBackendSetup(); return; }

  api('login', credentials, { timeout: 30000 }).then(function (res) {
    if (res && res.success && res.token) {
      Cfg.token = res.token;
      Cfg.who = res.who || '';
      hideGate();
      boot();
    } else {
      err.textContent = (res && res.error) === 'NETWORK'
        ? 'Cannot reach the backend. Check the URL in setup.'
        : ((res && res.error) || 'Sign-in failed');
    }
  });
}

function openBackendSetup() {
  openModal({
    title: 'Connect to your sheet',
    body:
      '<div class="setup-steps">' +
      '<div class="setup-step"><span class="sn">1</span><span>Open your Google Sheet, then <code>Extensions → Apps Script</code>.</span></div>' +
      '<div class="setup-step"><span class="sn">2</span><span>Paste the contents of <code>Code.gs</code> and save.</span></div>' +
      '<div class="setup-step"><span class="sn">3</span><span>Run <code>Lead Tracker → Run first-time setup</code> from the sheet menu.</span></div>' +
      '<div class="setup-step"><span class="sn">4</span><span><code>Deploy → New deployment → Web app</code>. Execute as <b>Me</b>, access <b>Anyone</b>.</span></div>' +
      '<div class="setup-step"><span class="sn">5</span><span>Copy the <code>/exec</code> URL and paste it below.</span></div>' +
      '</div><hr class="divider"/>' +
      '<div class="field"><label>Web app URL</label><input class="input" id="setupUrl" value="' + esc(Cfg.url) + '" placeholder="https://script.google.com/macros/s/…/exec"/></div>' +
      '<div class="field"><label>Google client ID (optional — enables Sign in with Google)</label>' +
      '<input class="input" id="setupClient" value="' + esc(Cfg.clientId) + '"/></div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save-backend">Save and connect</button>'
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVENT WIRING
   ═══════════════════════════════════════════════════════════════════════════ */

var ACTIONS = {
  'stop': function () { /* handled by the guard below */ },

  'open-lead': function (el, e) { openDetail(el.dataset.id); },
  'edit-lead': function (el) { openLeadForm(el.dataset.id); },
  'add-lead': function () { openLeadForm(); },
  'toggle-star': function (el) {
    var l = getLead(el.dataset.id);
    if (l) Ops.saveLead({ id: l.id, star: !l.star }, { label: (l.star ? 'unstar ' : 'star ') + l.name });
  },
  'toggle-select': function (el) {
    var id = el.dataset.id;
    if (State.ui.selected[id]) delete State.ui.selected[id];
    else State.ui.selected[id] = true;
    Store.notify();
  },
  'set-stage': function (el) { Ops.setStage(el.dataset.id, el.dataset.value); },
  'done-followup': function (el) { Ops.completeFollowup(el.dataset.id); },
  'quick-followup': function (el) { openFollowupPicker(el.dataset.id); },
  'archive-lead': function (el) {
    var l = getLead(el.dataset.id);
    confirmDialog('Archive ' + (l ? l.name : 'this lead') + '?',
      'It moves to the Archive. Nothing is deleted and you can restore it any time.',
      'Archive', function () { Ops.archiveLead(el.dataset.id); closeDetail(); }, true);
  },
  'restore-lead': function (el) { Ops.restoreLead(el.dataset.id); },
  'reopen-lead': function (el) {
    var stages = State.settings.stages || [];
    Ops.saveLead({ id: el.dataset.id, stage: (stages[0] || {}).name || 'New' }, { label: 'reopened' });
    toast('Reopened', 'good');
  },
  'share-lead': function (el) { openShare(el.dataset.id); },
  'whatsapp': function (el) { openWhatsapp(el.dataset.id); },
  'compose-email': function (el) { composeEmail(el.dataset.id); },
  'run-audit': function (el) { runAudit(el.dataset.id); },
  'edit-field': function (el) { startInlineEdit(el); },
  'edit-labels': function (el) { openLabelEditor(el.dataset.id); },

  'add-note': function (el) {
    var input = $('#quickNote');
    if (!input || !input.value.trim()) return;
    Ops.addHistory(el.dataset.id, input.value.trim());
    input.value = '';
    toast('Logged', 'good');
  },

  'stage-filter': function (el) {
    State.ui.filters.stage = el.dataset.value;
    renderLeads();
  },
  'meet-filter': function (el) { State.ui.meetFilter = el.dataset.value; renderMeetings(); },
  'archive-filter': function (el) { State.ui.archiveFilter = el.dataset.value; renderArchive(); },
  'stat': function (el) {
    if (el.dataset.kind === 'page') switchPage(el.dataset.value);
    else {
      State.ui.filters.health = el.dataset.value;
      State.ui.filters.stage = '';
      switchPage('leads');
    }
  },

  'add-meeting': function () { openMeetingForm(); },
  'add-meeting-for': function (el) { openMeetingForm(null, el.dataset.id); },
  'edit-meeting': function (el) { openMeetingForm(el.dataset.id); },
  'meeting-outcome': function (el) { openMeetingOutcome(el.dataset.id); },
  'open-meeting': function (el) { openMeetingOutcome(el.dataset.id); },
  'delete-meeting': function (el) {
    confirmDialog('Delete this meeting?', 'The calendar event goes too. You can undo straight after.',
      'Delete', function () { Ops.deleteMeeting(el.dataset.id); closeModal(); }, true);
  },
  'toggle-meet-star': function (el) {
    var m = getMeeting(el.dataset.id);
    if (m) Ops.saveMeeting({ id: m.id, star: !m.star }, { label: 'star meeting' });
  },
  'save-meeting': function (el) { saveMeetingFromForm(el.dataset.id); },
  'save-outcome': function (el) { saveOutcome(el.dataset.id); },

  'add-doc': function () { openDocForm(); },
  'add-doc-for': function (el) { openDocForm(el.dataset.id); },
  'save-doc': function () { saveDocFromForm(); },
  'delete-doc': function (el) { Ops.deleteDoc(el.dataset.id); toast('Removed'); },

  'save-lead': function (el) { saveLeadFromForm(el.dataset.id, el.dataset.key); },
  'discard-draft': function (el) {
    Drafts.clear(el.dataset.key);
    closeModal();
    toast('Draft discarded');
  },

  'fu-preset': function (el) {
    var date = Dates.addDays(Dates.today(), parseInt(el.dataset.days, 10));
    var dateEl = $('#fuDate');
    if (dateEl) dateEl.value = date;
    $$('#modalBody .pill').forEach(function (p) { p.classList.remove('active'); });
    el.classList.add('active');
  },
  'fu-save': function (el) {
    var date = ($('#fuDate') || {}).value || '';
    var note = ($('#fuNote') || {}).value || '';
    Ops.saveLead({ id: el.dataset.id, followup: date, nextStep: note }, { label: 'follow-up booked' });
    closeModal();
    toast(date ? 'Booked for ' + Fmt.date(date) : 'Date cleared', 'good');
  },
  'fu-clear': function (el) {
    Ops.saveLead({ id: el.dataset.id, followup: '' }, { label: 'follow-up cleared' });
    closeModal();
    toast('Date cleared');
  },

  'lost-pick': function (el) {
    $$('#modalBody .pill').forEach(function (p) { p.classList.remove('active'); });
    el.classList.add('active');
    var other = $('#lostOther');
    if (other) other.value = el.dataset.value;
  },
  'lost-save': function (el) {
    var reason = ($('#lostOther') || {}).value || '';
    if (reason) Ops.saveLead({ id: el.dataset.id, lostReason: reason }, { label: 'loss reason' });
    closeModal();
  },

  'toggle-label': function (el) {
    var l = getLead(el.dataset.id);
    if (!l) return;
    var labels = (l.labels || []).slice();
    var i = labels.indexOf(el.dataset.value);
    if (i >= 0) labels.splice(i, 1); else labels.push(el.dataset.value);
    Ops.saveLead({ id: l.id, labels: labels }, { label: 'labels on ' + l.name });
    el.classList.toggle('active');
  },
  'add-label': function (el) {
    var input = $('#newLabel');
    if (!input || !input.value.trim()) return;
    var value = input.value.trim();
    var known = (State.settings.labels || []).slice();
    if (known.indexOf(value) < 0) {
      known.push(value);
      Ops.saveSettings({ labels: known });
    }
    var l = getLead(el.dataset.id);
    if (l) {
      var labels = (l.labels || []).slice();
      if (labels.indexOf(value) < 0) labels.push(value);
      Ops.saveLead({ id: l.id, labels: labels }, { label: 'labels on ' + l.name });
    }
    input.value = '';
    openLabelEditor(el.dataset.id);
  },

  'copy': function (el) { copyText(el.dataset.value, el); },
  'close-modal': function () { closeModal(); },
  'confirm-yes': function () {
    var fn = Modal.data.onConfirm;
    closeModal();
    if (fn) fn();
  },

  'native-share': function (el) {
    var l = getLead(el.dataset.id);
    if (!l || !navigator.share) return;
    navigator.share({ title: l.name || 'Lead', text: leadSummary(l), url: normalizeUrl(l.site) || undefined })
      .catch(function () {});
  },
  'share-telegram': function (el) {
    var l = getLead(el.dataset.id);
    if (!l) return;
    api('telegram', { text: leadSummary(l) }).then(function (r) {
      toast(r && r.success ? 'Sent to your Telegram' : 'Telegram is not configured', r && r.success ? 'good' : 'warn');
    });
  },

  'wa-open': function (el) {
    var num = digitsOnly(($('#waNum') || {}).value);
    var msg = encodeURIComponent(($('#waMsg') || {}).value || '');
    var url = el.dataset.mode === 'web'
      ? 'https://web.whatsapp.com/send?phone=' + num + '&text=' + msg
      : 'https://wa.me/' + num + '?text=' + msg;
    window.open(url, '_blank', 'noopener');
    closeModal();
  },

  'tpl-copy': function (el) { copyText(templateBody(el.dataset.id), el); },
  'tpl-wa': function (el) {
    var lead = getLead(($('#tplLead') || {}).value);
    if (!lead) return;
    var num = digitsOnly(lead.wa || lead.phone);
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(templateBody(el.dataset.id)), '_blank', 'noopener');
  },
  'tpl-mail': function (el) {
    var lead = getLead(($('#tplLead') || {}).value);
    if (!lead) return;
    window.location.href = 'mailto:' + encodeURIComponent(lead.email) +
      '?subject=' + encodeURIComponent('Everstone Digital — ' + (lead.name || '')) +
      '&body=' + encodeURIComponent(templateBody(el.dataset.id));
  },
  'tpl-tg': function (el) {
    api('telegram', { text: templateBody(el.dataset.id) }).then(function (r) {
      toast(r && r.success ? 'Sent to your Telegram' : 'Telegram is not configured', r && r.success ? 'good' : 'warn');
    });
  },

  'ai-suggest': function (el) { sendAiMessage(el.dataset.value); },
  'ai-open-chat': function (el) {
    Ai.activeChatId = el.dataset.id;
    loadMessages(el.dataset.id);
  },
  'ai-rename-chat': function (el) {
    var chat = null;
    Ai.chats.forEach(function (c) { if (c.id === el.dataset.id) chat = c; });
    openModal({
      title: 'Rename conversation',
      narrow: true,
      body: '<div class="field"><label>Title</label><input class="input" id="chatTitle" value="' + esc(chat ? chat.title : '') + '"/></div>',
      foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
        '<button class="btn btn-primary" data-act="ai-rename-save" data-id="' + esc(el.dataset.id) + '">Save</button>'
    });
  },
  'ai-rename-save': function (el) {
    var title = ($('#chatTitle') || {}).value || 'Untitled';
    api('aiRenameChat', { chatId: el.dataset.id, title: title }).then(function () { loadChats(); });
    closeModal();
  },
  'ai-delete-chat': function (el) {
    confirmDialog('Delete this conversation?', 'The messages go with it. Your leads are untouched.',
      'Delete', function () {
        api('aiDeleteChat', { chatId: el.dataset.id }).then(function () {
          if (Ai.activeChatId === el.dataset.id) { Ai.activeChatId = null; Ai.messages = []; }
          loadChats();
        });
      }, true);
  },
  'ai-copy': function (el) { copyText(el.dataset.value, el); },
  'ai-telegram': function (el) {
    api('telegram', { text: el.dataset.value }).then(function (r) {
      toast(r && r.success ? 'Sent to your Telegram' : 'Telegram is not configured', r && r.success ? 'good' : 'warn');
    });
  },
  'ai-export': function (el) { exportContent(el.dataset.value, 'Evo answer'); },
  'ai-remove-attach': function (el) {
    Ai.attachments.splice(parseInt(el.dataset.index, 10), 1);
    renderAttachments();
  },

  'lead-evo-ask': function (el) { askLeadEvo(el.dataset.id, el.dataset.value); },
  'lead-evo-send': function (el) {
    var input = $('#leadEvoInput');
    if (input && input.value.trim()) askLeadEvo(el.dataset.id, input.value.trim());
  },

  'audit-save-doc': function (el) {
    Ops.saveDoc({
      leadId: el.dataset.id,
      name: 'Website audit — ' + Fmt.date(Dates.today()),
      url: Modal.data.auditUrl || '',
      type: 'audit',
      note: (Modal.data.auditText || '').slice(0, 400)
    });
    toast('Saved to this lead\'s documents', 'good');
  },
  'audit-export': function (el) {
    var lead = getLead(el.dataset.id);
    exportContent(Modal.data.auditText || '', 'Website audit — ' + (lead ? lead.name : ''));
  },
  'ex-run': function () { runExport(); },

  'em-generate': function (el) { generateEmail(el.dataset.id); },
  'em-copy': function () {
    copyText((($('#emSubject') || {}).value || '') + '\n\n' + (($('#emBody') || {}).value || ''));
  },
  'em-mailto': function () {
    window.location.href = 'mailto:' + encodeURIComponent(($('#emTo') || {}).value || '') +
      '?subject=' + encodeURIComponent(($('#emSubject') || {}).value || '') +
      '&body=' + encodeURIComponent(($('#emBody') || {}).value || '');
  },
  'em-send': function (el) {
    var to = ($('#emTo') || {}).value, subject = ($('#emSubject') || {}).value, body = ($('#emBody') || {}).value;
    if (!to || !subject || !body) { toast('Fill in the recipient, subject and message first', 'warn'); return; }
    confirmDialog('Send this email?', 'It goes from your Gmail to ' + to + ' right now.', 'Send', function () {
      toast('Sending…');
      api('sendEmail', { to: to, subject: subject, body: body, leadId: el.dataset.id }, { timeout: 60000 })
        .then(function (r) {
          if (r && r.success) {
            toast('Sent. ' + (r.quotaLeft !== undefined ? r.quotaLeft + ' emails left today.' : ''), 'good');
            Ops.addHistory(el.dataset.id, 'Emailed: ' + subject);
            closeModal();
          } else {
            toast('Not sent: ' + ((r && r.error) || 'unknown error'), 'err', 7000);
          }
        });
    });
  },

  'save-ai-instructions': function () {
    Ops.saveSettings({
      aiInstructions: ($('#aiInstr') || {}).value || '',
      aiModel: ($('#aiModelDefault') || {}).value || 'fast'
    });
    closeModal();
    toast('Evo will follow these from now on', 'good');
  },

  'add-stage': function () {
    var stages = (State.settings.stages || []).concat([{ name: 'New stage', color: '#6B7280' }]);
    Ops.saveSettings({ stages: stages });
  },
  'remove-stage': function (el) {
    var stages = (State.settings.stages || []).slice();
    var removed = stages.splice(parseInt(el.dataset.index, 10), 1)[0];
    var inUse = activeLeads().filter(function (l) { return l.stage === (removed || {}).name; }).length;
    if (inUse) { toast(inUse + ' lead(s) are still on that stage — move them first', 'warn', 5000); return; }
    Ops.saveSettings({ stages: stages });
  },
  'add-priority': function () {
    var list = (State.settings.priorities || []).concat([{ key: uid('p'), name: 'New level', color: '#6B7280' }]);
    Ops.saveSettings({ priorities: list });
  },
  'remove-priority': function (el) {
    var list = (State.settings.priorities || []).slice();
    if (list.length <= 1) { toast('Keep at least one priority level', 'warn'); return; }
    list.splice(parseInt(el.dataset.index, 10), 1);
    Ops.saveSettings({ priorities: list });
  },
  'ask-notifications': function () { Alarm.requestPermission(); },
  'test-connection': function () {
    var url = ($('#setUrl') || {}).value || Cfg.url;
    Cfg.url = url.trim();
    toast('Testing…');
    api('getAll', {}, { timeout: 30000 }).then(function (r) {
      toast(r && r.success ? 'Connected — ' + (r.leads || []).length + ' leads on the sheet' :
        'No luck: ' + ((r && r.error) || 'no response'), r && r.success ? 'good' : 'err', 6000);
    });
  },
  'logout': function () {
    confirmDialog('Sign out?', Outbox.items.length
      ? Outbox.items.length + ' change(s) have not reached the sheet yet. Signing out keeps them on this device, but they will not send until you sign back in.'
      : 'You will need your password again.', 'Sign out', function () {
        Cfg.token = '';
        location.reload();
      }, true);
  },
  'save-backend': function () {
    Cfg.url = (($('#setupUrl') || {}).value || '').trim();
    Cfg.clientId = (($('#setupClient') || {}).value || '').trim();
    closeModal();
    toast('Saved. Sign in to continue.', 'good');
    showGate('');
  },
  'cmdk-run': function (el) { runCmdk(parseInt(el.dataset.index, 10)); }
};

function templateBody(id) {
  var t = null;
  TEMPLATES.forEach(function (x) { if (x.id === id) t = x; });
  if (!t) return '';
  var picker = $('#tplLead');
  return fillTemplate(t.body, picker && picker.value ? getLead(picker.value) : null);
}

/* ─── global click delegation ───────────────────────────────────────────── */
document.addEventListener('click', function (e) {
  var stopEl = e.target.closest('[data-act="stop"]');
  if (stopEl) { e.stopPropagation(); return; }

  var el = e.target.closest('[data-act]');
  if (!el) return;

  var act = el.dataset.act;
  var fn = ACTIONS[act];
  if (!fn) return;

  // A nested control must not also trigger the row it sits inside.
  var outer = el.parentElement ? el.parentElement.closest('[data-act]') : null;
  if (outer) e.stopPropagation();

  if (el.tagName === 'A' && el.getAttribute('href') && act === 'open-lead') e.preventDefault();
  fn(el, e);
});

/* ─── the drag fix ──────────────────────────────────────────────────────── */
/* Dragging a text selection out of an input MOVES it — the characters vanish
   from the field. Right-to-left selections trigger it most because the pointer
   travels further. Only the kanban grip is allowed to start a drag. */
document.addEventListener('dragstart', function (e) {
  var el = e.target;
  var allowed = el && el.closest && el.closest('[data-act="kgrip"]');
  if (!allowed) { e.preventDefault(); return; }
  DragState.id = allowed.dataset.id;
  var card = allowed.closest('.kcard');
  if (card) card.classList.add('dragging');
  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', DragState.id); } catch (err) {}
});

var DragState = { id: null };

document.addEventListener('dragend', function () {
  DragState.id = null;
  $$('.kcard.dragging').forEach(function (c) { c.classList.remove('dragging'); });
  $$('.kcol.dragover').forEach(function (c) { c.classList.remove('dragover'); });
});

document.addEventListener('dragover', function (e) {
  var col = e.target.closest ? e.target.closest('.kcol') : null;
  if (!col || !DragState.id) return;
  e.preventDefault();
  try { e.dataTransfer.dropEffect = 'move'; } catch (err) {}
  $$('.kcol.dragover').forEach(function (c) { if (c !== col) c.classList.remove('dragover'); });
  col.classList.add('dragover');
});

document.addEventListener('drop', function (e) {
  var col = e.target.closest ? e.target.closest('.kcol') : null;
  if (!col || !DragState.id) return;
  e.preventDefault();
  var stage = col.dataset.stage;
  var id = DragState.id;
  DragState.id = null;
  col.classList.remove('dragover');
  Ops.setStage(id, stage);
});

/* Kanban card click and shift-select */
document.addEventListener('click', function (e) {
  var body = e.target.closest ? e.target.closest('[data-act="kcard"]') : null;
  if (!body) return;
  var id = body.dataset.id;
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (State.ui.selected[id]) delete State.ui.selected[id];
    else State.ui.selected[id] = true;
    Store.notify();
  } else {
    openDetail(id);
  }
});

/* ─── keyboard ──────────────────────────────────────────────────────────── */
document.addEventListener('keydown', function (e) {
  var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('#cmdk').classList.contains('show') ? closeCmdk() : openCmdk();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
    e.preventDefault();
    UndoStack.run();
    return;
  }

  if (e.key === 'Escape') {
    if ($('#cmdk').classList.contains('show')) { closeCmdk(); return; }
    if ($('#modal').classList.contains('show')) { closeModal(); return; }
    if ($('#drawer').classList.contains('show')) { closeDetail(); return; }
    if (selectedIds().length) { State.ui.selected = {}; Store.notify(); }
    return;
  }

  if (typing) return;

  if (e.key === '/') { e.preventDefault(); switchPage('leads'); var s = $('#fSearch'); if (s) s.focus(); }
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openLeadForm(); }
});

if ($('#cmdkInput')) {
  $('#cmdkInput').addEventListener('input', function () { renderCmdk(this.value); });
  $('#cmdkInput').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveCmdk(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveCmdk(-1); }
    if (e.key === 'Enter') { e.preventDefault(); runCmdk(Cmdk.index); }
  });
}
$('#cmdk').addEventListener('click', function (e) { if (e.target === this) closeCmdk(); });
$('#modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

/* ─── static controls ───────────────────────────────────────────────────── */
function wireStaticControls() {
  $$('.nav-item').forEach(function (b) {
    b.addEventListener('click', function () { switchPage(b.dataset.page); });
  });
  $$('.drawer-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      State.ui.detailTab = t.dataset.tab;
      renderDrawer();
    });
  });

  $('#drawerClose').addEventListener('click', closeDetail);
  $('#scrim').addEventListener('click', closeDetail);
  $('#drawerStar').addEventListener('click', function () {
    var l = getLead(State.ui.detailId);
    if (l) Ops.saveLead({ id: l.id, star: !l.star }, { label: 'star' });
  });
  $('#drawerShare').addEventListener('click', function () {
    if (State.ui.detailId) openShare(State.ui.detailId);
  });

  $('#btnAddLead').addEventListener('click', function () { openLeadForm(); });
  $('#btnAddLead2').addEventListener('click', function () { openLeadForm(); });
  $('#btnAddMeeting').addEventListener('click', function () { openMeetingForm(); });
  $('#btnAddDoc').addEventListener('click', function () { openDocForm(); });
  $('#btnExportCsv').addEventListener('click', exportCsv);
  $('#btnSearch').addEventListener('click', openCmdk);
  $('#btnSync').addEventListener('click', function () {
    Outbox.flush();
    pullFromServer().then(function (ok) { if (ok) toast('Up to date', 'good'); });
  });
  $('#btnUndo').addEventListener('click', function () { UndoStack.run(); });
  $('#btnTheme').addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  $('#btnBriefTg').addEventListener('click', function () {
    var open = openLeads();
    var due = open.filter(function (l) { var d = dueState(l); return d === 'over' || d === 'today'; });
    var text = 'Today — ' + Fmt.date(Dates.today()) + '\n\n' +
      (due.length ? due.map(function (l) {
        return '• ' + l.name + ' (' + l.stage + ')' + (l.phone ? ' — ' + l.phone : '') +
          (l.nextStep ? '\n   ' + l.nextStep : '');
      }).join('\n') : 'Nothing overdue.') +
      '\n\nOpen pipeline: ' + Fmt.money(open.reduce(function (s, l) { return s + (Number(l.value) || 0); }, 0));
    api('telegram', { text: text }).then(function (r) {
      toast(r && r.success ? 'Sent to your Telegram' : 'Telegram is not configured', r && r.success ? 'good' : 'warn');
    });
  });

  // filters
  var applyFilters = debounce(function () {
    State.ui.filters.search = ($('#fSearch') || {}).value || '';
    renderLeads();
  }, 180);
  $('#fSearch').addEventListener('input', applyFilters);
  ['fStage', 'fPriority', 'fSource', 'fLabel', 'fHealth', 'fSort'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function () {
      var key = id.replace('f', '').toLowerCase();
      var map = { stage: 'stage', priority: 'priority', source: 'source', label: 'label', health: 'health', sort: 'sort' };
      State.ui.filters[map[key]] = el.value;
      renderLeads();
    });
  });
  $('#btnClearFilters').addEventListener('click', function () {
    State.ui.filters = { search: '', stage: '', priority: '', source: '', label: '', health: '', sort: 'smart' };
    renderLeads();
  });
  $('#fuRange').addEventListener('change', renderFollowups);
  $('#tplLead').addEventListener('change', renderMessages);

  // bulk actions
  $('#bulkClose').addEventListener('click', function () { State.ui.selected = {}; Store.notify(); });
  $('#bulkStage').addEventListener('change', function () {
    if (!this.value) return;
    var ids = selectedIds();
    Ops.bulkPatch(ids, { stage: this.value }, ids.length + ' leads moved to ' + this.value);
    toast(ids.length + ' moved to ' + this.value, 'good');
    this.value = '';
    State.ui.selected = {};
    Store.notify();
  });
  $('#bulkPriority').addEventListener('change', function () {
    if (!this.value) return;
    var ids = selectedIds();
    Ops.bulkPatch(ids, { priority: this.value }, ids.length + ' leads re-prioritised');
    toast(ids.length + ' updated', 'good');
    this.value = '';
    State.ui.selected = {};
    Store.notify();
  });
  $('#bulkStar').addEventListener('click', function () {
    var ids = selectedIds();
    Ops.bulkPatch(ids, { star: true }, ids.length + ' starred');
    State.ui.selected = {};
    Store.notify();
  });
  $('#bulkFollowup').addEventListener('click', function () {
    var ids = selectedIds();
    openModal({
      title: 'Follow up on ' + ids.length + ' leads',
      narrow: true,
      body: '<div class="field"><label>Date</label><input class="input" id="bulkDate" type="date" value="' + Dates.addDays(Dates.today(), 3) + '"/></div>' +
        '<div class="field"><label>Next step</label><input class="input" id="bulkNote" placeholder="What will you do?"/></div>',
      foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
        '<button class="btn btn-primary" id="bulkFuSave">Book them all</button>'
    });
    $('#bulkFuSave').addEventListener('click', function () {
      Ops.bulkPatch(ids, {
        followup: ($('#bulkDate') || {}).value,
        nextStep: ($('#bulkNote') || {}).value
      }, ids.length + ' follow-ups booked');
      closeModal();
      State.ui.selected = {};
      Store.notify();
      toast(ids.length + ' booked', 'good');
    });
  });
  $('#bulkArchive').addEventListener('click', function () {
    var ids = selectedIds();
    confirmDialog('Archive ' + ids.length + ' leads?', 'They move to the Archive and can be restored any time.',
      'Archive', function () {
        ids.forEach(function (id) { Ops.archiveLead(id); });
        State.ui.selected = {};
        Store.notify();
      }, true);
  });

  $('#btnSelectAllKanban').addEventListener('click', function () {
    activeLeads().forEach(function (l) { State.ui.selected[l.id] = true; });
    Store.notify();
  });
  $('#btnClearSelection').addEventListener('click', function () {
    State.ui.selected = {};
    Store.notify();
  });

  // settings
  $('#btnSaveSettings').addEventListener('click', function () {
    Ops.saveSettings(collectSettings());
    toast('Settings saved', 'good');
  });
  $('#btnBackupNow').addEventListener('click', function () {
    toast('Backing up…');
    api('backupNow', {}, { timeout: 120000 }).then(function (r) {
      toast(r && r.success ? 'Backup created: ' + r.file : 'Backup failed', r && r.success ? 'good' : 'err', 6000);
    });
  });

  // ai
  $('#btnNewChat').addEventListener('click', newChat);
  $('#btnAiSend').addEventListener('click', function () { sendAiMessage(); });
  $('#btnAiAttach').addEventListener('click', function () { $('#aiFileInput').click(); });
  $('#aiFileInput').addEventListener('change', function () {
    handleAiFiles(this.files);
    this.value = '';
  });
  $('#btnAiInstructions').addEventListener('click', openAiInstructions);
  $('#aiModelPick').addEventListener('change', function () {
    Ops.saveSettings({ aiModel: this.value });
  });
  $('#aiInput').addEventListener('input', function () { autoGrow(this); });
  $('#aiInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  });

  // login
  $('#gateSubmit').addEventListener('click', function () {
    doLogin({ password: ($('#gatePw') || {}).value || '' });
  });
  $('#gatePw').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin({ password: this.value });
  });
  $('#gateSetup').addEventListener('click', openBackendSetup);

  // lead detail: log a note with Enter
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'quickNote' && State.ui.detailId) {
      e.preventDefault();
      if (e.target.value.trim()) {
        Ops.addHistory(State.ui.detailId, e.target.value.trim());
        e.target.value = '';
        toast('Logged', 'good');
      }
    }
    if (e.key === 'Enter' && e.target.id === 'leadEvoInput' && State.ui.detailId) {
      e.preventDefault();
      if (e.target.value.trim()) askLeadEvo(State.ui.detailId, e.target.value.trim());
    }
  });

  window.addEventListener('online', function () {
    setSync();
    toast('Back online — sending your changes', 'good');
    Outbox.flush();
    pullFromServer(true);
  });
  window.addEventListener('offline', function () {
    setSync();
    toast('Offline. Changes are held on this device until you reconnect.', 'warn', 6000);
  });

  window.addEventListener('beforeunload', function (e) {
    if (Outbox.items.length) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* ─── boot ──────────────────────────────────────────────────────────────── */
function renderEverything() {
  renderChrome();
  renderActivePage();
  if (State.ui.detailId) renderDrawer();
  renderBulkBar();
}

function boot() {
  loadCache();
  if (!State.settings || !State.settings.stages) {
    State.settings = Object.assign({}, DEFAULT_SETTINGS);
  }
  Drafts.prune();
  Outbox.load();

  renderEverything();
  setSync();

  pullFromServer(true).then(function () {
    Outbox.flush();
    Alarm.check();
    if (State.ui.page === 'ai') loadChats();
  });

  setInterval(function () {
    if (document.hidden) return;
    pullFromServer(true);
  }, SYNC_INTERVAL_MS);

  setInterval(function () { Outbox.flush(); }, OUTBOX_RETRY_MS);
  setInterval(function () { Alarm.check(); }, 5 * 60000);
}

function start() {
  applyTheme();
  wireStaticControls();
  Store.subscribe(renderEverything);

  // AI chats load the first time that page is opened, not before.
  var originalSwitch = switchPage;
  window.switchPage = function (page) {
    originalSwitch(page);
    if (page === 'ai' && !Ai.loaded) {
      Ai.loaded = true;
      loadChats();
    }
  };
  $$('.nav-item').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.page === 'ai' && !Ai.loaded) { Ai.loaded = true; loadChats(); }
    });
  });

  var hash = (location.hash || '').replace('#', '');
  if (hash && PAGE_RENDERERS[hash]) State.ui.page = hash;

  if (!Cfg.url) {
    showGate('');
    setTimeout(openBackendSetup, 300);
    return;
  }
  if (!Cfg.token) { showGate(''); return; }

  hideGate();
  switchPage(State.ui.page);
  boot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
