/* ═══════════════════════════════════════════════════════════════════════════
   ai.js — the AI assistant: conversations, attachments, audits, drafting, exports
   Chats live on the sheet, not in this browser, so they follow you to any device.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var Ai = {
  status: null,
  chats: [],
  activeChatId: null,
  messages: [],
  attachments: [],
  busy: false,
  loaded: false
};

var AI_SUGGESTIONS = [
  'What should I do first today?',
  'Which proposals have gone quiet?',
  'Draft a follow-up for my oldest overdue lead',
  'Summarise this week in five lines',
  'কোন লিডগুলো হাতছাড়া হয়ে যাচ্ছে?'
];

/* ─── chat list ─────────────────────────────────────────────────────────── */
function loadChats() {
  if (!Ai.status) api('aiStatus', {}).then(function (r) { if (r && r.success) { Ai.status = r; if (!Ai.messages.length) renderThread(); } });
  return api('aiChats').then(function (res) {
    if (res && res.success) {
      Ai.chats = res.chats || [];
      if (!Ai.activeChatId && Ai.chats.length) {
        Ai.activeChatId = Ai.chats[0].id;
        return loadMessages(Ai.activeChatId);
      }
    }
    renderAi();
    return null;
  });
}

function loadMessages(chatId) {
  if (!chatId) { Ai.messages = []; renderAi(); return Promise.resolve(); }
  return api('aiMessages', { chatId: chatId }).then(function (res) {
    Ai.messages = (res && res.success) ? (res.messages || []) : [];
    renderAi();
    return null;
  });
}

function newChat() {
  Ai.activeChatId = null;
  Ai.messages = [];
  Ai.attachments = [];
  renderAi();
  var input = $('#aiInput');
  if (input) input.focus();
}

/* ─── render ────────────────────────────────────────────────────────────── */
function renderAi() {
  renderChatList();
  renderThread();
  renderAttachments();

  var picker = $('#aiModelPick');
  if (picker && State.settings.aiModel) picker.value = State.settings.aiModel;

  var sug = $('#aiSuggestions');
  if (sug) {
    sug.innerHTML = Ai.messages.length ? '' : AI_SUGGESTIONS.map(function (s) {
      return '<button class="ai-suggest" data-act="ai-suggest" data-value="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
  }

  var sub = $('#aiSub');
  if (sub) {
    sub.textContent = Ai.chats.length
      ? Ai.chats.length + ' conversation' + (Ai.chats.length > 1 ? 's' : '') + ' · everything saved to your sheet'
      : 'Knows your whole pipeline. Ask in Bangla or English.';
  }
}

function renderChatList() {
  var host = $('#aiChatList');
  if (!host) return;
  if (!Ai.chats.length) {
    host.innerHTML = '<div class="muted tiny" style="padding:10px">No conversations yet.</div>';
    return;
  }
  host.innerHTML = Ai.chats.map(function (c) {
    return '<div class="ai-chat-item' + (c.id === Ai.activeChatId ? ' active' : '') + '" data-act="ai-open-chat" data-id="' + esc(c.id) + '">' +
      '<span class="ac-title" title="' + esc(c.title) + '">' + esc(c.title || 'Untitled') + '</span>' +
      '<button class="copy-btn ac-menu" data-act="ai-rename-chat" data-id="' + esc(c.id) + '" title="Rename">' + icon('edit', 11) + '</button>' +
      '<button class="copy-btn ac-menu" data-act="ai-delete-chat" data-id="' + esc(c.id) + '" title="Delete">' + icon('trash', 11) + '</button>' +
      '</div>';
  }).join('');
}

function renderThread() {
  var host = $('#aiThread');
  if (!host) return;

  if (!Ai.messages.length && !Ai.busy) {
    if (Ai.status && !Ai.status.configured) {
      host.innerHTML = '<div style="margin:auto;text-align:center;max-width:380px;color:var(--ink-3)">' +
        '<div style="font-size:26px;margin-bottom:8px">◆</div><div style="font-weight:640;color:var(--ink-2);font-size:14px">' + esc(aiName()) + ' has no AI key yet</div>' +
        '<div class="small" style="margin-top:5px">' + (isAdminUser() ? 'Add a provider — OpenRouter, Gemini, Groq or any other — and every account can use it.' : 'Ask the admin to add an AI provider.') + '</div>' +
        (isAdminUser() ? '<button class="btn btn-primary btn-sm" data-act="go-admin" data-value="ai" style="margin-top:12px">Add a provider</button>' : '') + '</div>';
      return;
    }
    host.innerHTML =
      '<div style="margin:auto;text-align:center;max-width:380px;color:var(--ink-3)">' +
      '<div style="font-size:26px;margin-bottom:8px">◆</div>' +
      '<div style="font-weight:640;color:var(--ink-2);font-size:14px">' + esc(aiName()) + ' is ready</div>' +
      '<div class="small" style="margin-top:5px">Ask about any lead, or tell it what to change. It can move stages, set follow-ups, book meetings and write client messages.</div>' +
      '</div>';
    return;
  }

  host.innerHTML = Ai.messages.map(function (m) {
    return aiBubble(m.role, m.content, m.meta);
  }).join('') + (Ai.busy ? aiBubble('assistant', '__typing__', null) : '');

  host.scrollTop = host.scrollHeight;
}

function aiBubble(role, content, meta) {
  var isUser = role === 'user';
  var body;

  if (content === '__typing__') {
    body = '<span class="typing"><i></i><i></i><i></i></span>';
  } else {
    body = esc(content);
  }

  var tools = '';
  if (!isUser && content !== '__typing__') {
    tools = '<div class="ai-tools">' +
      '<button class="btn btn-sm" data-act="ai-copy" data-value="' + esc(content) + '">' + icon('copy', 12) + ' Copy</button>' +
      '<button class="btn btn-sm" data-act="ai-telegram" data-value="' + esc(content) + '">' + icon('tg', 12) + ' Telegram</button>' +
      '<button class="btn btn-sm" data-act="ai-export" data-value="' + esc(content) + '">' + icon('download', 12) + ' Save as file</button>' +
      '</div>';
  }

  var done = '';
  if (meta && meta.steps && meta.steps.length) {
    done += '<div class="ai-steps">' + meta.steps.map(function (st) {
      return '<span>' + icon('search', 10) + ' ' + esc(st) + '</span>';
    }).join('') + '</div>';
  }
  if (meta && meta.done && meta.done.length) {
    done += '<div class="ai-done">' + meta.done.map(function (d) {
      return '<span>✓ ' + esc(d) + '</span>';
    }).join('') + '</div>';
  }

  return '<div class="ai-msg ' + (isUser ? 'user' : 'bot') + '">' +
    '<div class="ai-avatar">' + (isUser ? esc(initialsOf((State.me && (State.me.name || State.me.email)) || Cfg.who || 'Me').charAt(0)) : '◆') + '</div>' +
    '<div class="ai-bubble">' + body + done + tools + '</div></div>';
}

function renderAttachments() {
  var host = $('#aiAttachments');
  if (!host) return;
  host.innerHTML = Ai.attachments.map(function (a, i) {
    return '<span class="ai-attach">' +
      (a.kind === 'image' ? '<img src="' + esc(a.dataUrl) + '" alt=""/>' : '📎') +
      '<span class="truncate" style="max-width:130px">' + esc(a.name) + '</span>' +
      '<button class="copy-btn" data-act="ai-remove-attach" data-index="' + i + '" title="Remove">' + icon('x', 10) + '</button>' +
      '</span>';
  }).join('');
}

/* ─── sending ───────────────────────────────────────────────────────────── */
function sendAiMessage(textOverride) {
  if (Ai.busy) return;
  var input = $('#aiInput');
  var text = textOverride !== undefined ? textOverride : (input ? input.value.trim() : '');
  if (!text && !Ai.attachments.length) return;

  if (input && textOverride === undefined) { input.value = ''; autoGrow(input); }

  Ai.messages.push({ role: 'user', content: text, createdAt: new Date().toISOString() });
  Ai.busy = true;
  renderThread();

  var payload = {
    chatId: Ai.activeChatId,
    message: text,
    attachments: Ai.attachments,
    model: ($('#aiModelPick') || {}).value || 'auto'
  };
  var sentAttachments = Ai.attachments;
  Ai.attachments = [];
  renderAttachments();

  api('aiSend', payload, { timeout: 180000 }).then(function (res) {
    Ai.busy = false;

    if (!res || !res.success) {
      Ai.messages.push({
        role: 'assistant',
        content: 'That did not go through. ' + ((res && res.error) || 'No response from the server.') +
          (res && res.error === 'NETWORK' ? '\n\nYour connection dropped. The message was not sent — try again.' : ''),
        createdAt: new Date().toISOString()
      });
      renderThread();
      return;
    }

    if (!Ai.activeChatId && res.chatId) {
      Ai.activeChatId = res.chatId;
      loadChats();
    }

    Ai.messages.push({
      role: 'assistant',
      content: res.reply || '',
      meta: { done: res.done || [], steps: res.steps || [], model: res.model },
      createdAt: new Date().toISOString()
    });
    renderThread();

    // The AI can change the sheet, so pull the truth back in when it did.
    if (res.done && res.done.length) {
      pullFromServer(true);
      toast(aiName() + ' made ' + res.done.length + ' change' + (res.done.length > 1 ? 's' : ''), 'good');
    }
  });
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

/* ─── attachments ───────────────────────────────────────────────────────── */
function handleAiFiles(files) {
  Array.prototype.slice.call(files).slice(0, 5).forEach(function (file) {
    if (file.size > 4 * 1024 * 1024) {
      toast(file.name + ' is over 4MB — too big to send', 'warn');
      return;
    }
    var reader = new FileReader();
    if (/^image\//.test(file.type)) {
      reader.onload = function (e) {
        Ai.attachments.push({ kind: 'image', name: file.name, dataUrl: e.target.result });
        renderAttachments();
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = function (e) {
        Ai.attachments.push({ kind: 'text', name: file.name, text: String(e.target.result).slice(0, 20000) });
        renderAttachments();
      };
      reader.readAsText(file);
    }
  });
}

/* ─── per-lead assistant ────────────────────────────────────────────────── */
var LeadEvo = { leadId: null, messages: [], busy: false };

function renderDrawerEvo(lead) {
  var host = $('#pane-evo');
  if (!host) return;

  if (LeadEvo.leadId !== lead.id) {
    LeadEvo.leadId = lead.id;
    LeadEvo.messages = [];
    LeadEvo.busy = false;
  }

  var quick = [
    'What should my next move be?',
    'Write a follow-up message for this lead',
    'Why might this deal be stalling?',
    'Draft an email that gets a reply'
  ];

  host.innerHTML =
    '<div class="tiny muted" style="margin-bottom:12px">' + esc(aiName()) + ' can see everything about ' + esc(lead.name) +
    ' — notes, meetings and every change ever made.</div>' +

    '<div class="ai-suggestions" style="margin-bottom:12px">' + quick.map(function (q) {
      return '<button class="ai-suggest" data-act="lead-evo-ask" data-id="' + esc(lead.id) + '" data-value="' + esc(q) + '">' + esc(q) + '</button>';
    }).join('') + '</div>' +

    '<div id="leadEvoThread" style="display:flex;flex-direction:column;gap:12px;margin-bottom:12px">' +
    LeadEvo.messages.map(function (m) { return aiBubble(m.role, m.content, m.meta); }).join('') +
    (LeadEvo.busy ? aiBubble('assistant', '__typing__', null) : '') +
    '</div>' +

    '<div class="row" style="flex-wrap:nowrap">' +
    '<input class="input" id="leadEvoInput" placeholder="Ask about ' + esc(lead.name) + '…" style="flex:1"/>' +
    '<button class="btn btn-primary btn-icon" data-act="lead-evo-send" data-id="' + esc(lead.id) + '">' + icon('send', 14) + '</button>' +
    '</div>';
}

function askLeadEvo(leadId, question) {
  if (LeadEvo.busy || !question) return;
  LeadEvo.leadId = leadId;
  LeadEvo.messages.push({ role: 'user', content: question });
  LeadEvo.busy = true;
  renderDrawer();

  api('aiSend', {
    leadId: leadId,
    message: question,
    allowActions: true,
    model: ($('#aiModelPick') || {}).value || 'auto'
  }, { timeout: 120000 }).then(function (res) {
    LeadEvo.busy = false;
    LeadEvo.messages.push({
      role: 'assistant',
      content: (res && res.success) ? res.reply : 'Could not reach ' + aiName() + '. ' + ((res && res.error) || ''),
      meta: { done: (res && res.done) || [], steps: (res && res.steps) || [] }
    });
    if (res && res.done && res.done.length) pullFromServer(true);
    renderDrawer();
  });
}

/* ─── website audit ─────────────────────────────────────────────────────── */
function runAudit(leadId) {
  var lead = getLead(leadId);
  if (!lead) return;
  if (!lead.site) { toast('This lead has no website on file', 'warn'); return; }

  openModal({
    title: 'Auditing ' + prettyUrl(lead.site),
    body: '<div class="col" style="align-items:center;padding:24px 0">' +
      '<span class="typing"><i></i><i></i><i></i></span>' +
      '<div class="small muted" style="margin-top:12px;text-align:center">Fetching the page, running PageSpeed, then reading it properly.<br/>This usually takes 30 to 90 seconds.</div></div>',
    foot: ''
  });

  api('aiAudit', { url: lead.site, leadId: leadId, model: 'power' }, { timeout: 240000 }).then(function (res) {
    if (!res || !res.success) {
      openModal({
        title: 'Audit failed',
        body: '<p class="small">' + esc((res && res.error) || 'No response.') + '</p>' +
          '<p class="small muted">If the site blocks automated requests this will not work. You can still paste the page text into the AI chat directly.</p>',
        foot: '<button class="btn" data-act="close-modal">Close</button>'
      });
      return;
    }

    showAuditResult(res, lead, leadId);
  });
}

var AUDIT_CATS = [['technical', 'Technical'], ['onpage', 'On-page'], ['content', 'Content'], ['local', 'Local'], ['conversion', 'Conversion'], ['speed', 'Speed']];

function scoreTone(n) { return n >= 80 ? 'good' : n >= 55 ? 'warm' : 'hot'; }

function showAuditResult(res, lead, leadId) {
  var sc = res.scores || {};
  var checks = res.checks || [];
  var sig = res.signals || {};
  var page = sig.page || {}, mob = sig.speed || {}, desk = sig.speedDesktop || {};
  var fails = checks.filter(function (c) { return c.level === 'fail'; });
  var warns = checks.filter(function (c) { return c.level === 'warn'; });
  var passes = checks.filter(function (c) { return c.level === 'pass'; });

  var ring = '<div class="audit-score ' + scoreTone(sc.overall || 0) + '"><b>' + (sc.overall || 0) + '</b><span>/100</span></div>';
  var bars = AUDIT_CATS.filter(function (c) { return sc[c[0]] !== undefined; }).map(function (c) {
    var v = sc[c[0]];
    return '<div class="bar-row"><span class="small">' + c[1] + '</span><div class="bar-track"><div class="bar-fill tone-' + scoreTone(v) + '" style="width:' + v + '%"></div></div><span class="bar-val">' + v + '</span></div>';
  }).join('');
  var facts = [
    page.title ? ['Title', page.title] : null,
    ['Words on the home page', page.wordCount || 0],
    page.imgTotal ? ['Images missing alt text', (page.imgNoAlt || 0) + ' of ' + page.imgTotal] : null,
    mob && mob.ok ? ['PageSpeed mobile', 'performance ' + mob.performance + ' · SEO ' + mob.seo + (mob.lcp ? ' · LCP ' + mob.lcp : '')] : null,
    desk && desk.ok ? ['PageSpeed desktop', 'performance ' + desk.performance] : null,
    res.pages ? ['Pages checked', (res.pages.length || 0) + (res.broken && res.broken.length ? ' · ' + res.broken.length + ' broken links' : '')] : null,
    res.sitemap ? ['Sitemap', res.sitemap.found ? 'found' + (res.sitemap.urls ? ' (' + res.sitemap.urls + ' URLs)' : '') : 'missing'] : null
  ].filter(Boolean);

  function checkList(list, cls) {
    return list.map(function (c) {
      return '<div class="check-item ' + cls + '"><span class="ci-dot"></span><div class="grow"><div class="ci-title">' + esc(c.title) + ' <span class="chip chip-ghost">' + esc(c.cat) + '</span></div>' +
        (c.detail ? '<div class="tiny muted">' + esc(c.detail) + '</div>' : '') + (c.fix ? '<div class="tiny ci-fix">Fix: ' + esc(c.fix) + '</div>' : '') + '</div></div>';
    }).join('');
  }

  State.ui.lastAudit = { leadId: leadId, text: res.audit || '' };
  openModal({
    title: 'Audit — ' + prettyUrl(res.url || lead.site),
    wide: true,
    body:
      '<div class="audit-top">' + ring + '<div class="grow">' + bars + '</div></div>' +
      (page.jsHeavy ? '<div class="tiny" style="color:var(--warm)">This site builds itself with JavaScript, so a crawler sees little text. The audit accounts for that.</div>' : '') +
      '<div class="audit-tabs pill-row"><button class="pill active" data-audit-tab="report">AI report</button><button class="pill" data-audit-tab="checks">Checks (' + fails.length + ' to fix · ' + warns.length + ' to improve)</button><button class="pill" data-audit-tab="facts">Measured</button></div>' +
      '<div class="audit-pane" data-pane="report">' + (res.audit ? '<div class="prose-box" id="auditText">' + esc(res.audit) + '</div>' : '<div class="small" style="color:var(--warm)">' + esc(aiName()) + ' could not write the report (' + esc(res.aiError || 'no AI') + '). The measured checks are still here.</div>') + '</div>' +
      '<div class="audit-pane" data-pane="checks" hidden>' + checkList(fails, 'fail') + checkList(warns, 'warn') +
      (passes.length ? '<details class="passed"><summary class="small">' + passes.length + ' things already right</summary>' + checkList(passes, 'pass') + '</details>' : '') + '</div>' +
      '<div class="audit-pane" data-pane="facts" hidden><div class="kv">' + facts.map(function (f) { return '<dt>' + esc(f[0]) + '</dt><dd>' + esc(String(f[1])) + '</dd>'; }).join('') + '</div></div>',
    foot: '<span class="spread tiny muted">' + esc(res.model || '') + '</span>' +
      '<button class="btn" data-act="copy" data-value="' + esc(res.audit || '') + '">Copy</button>' +
      '<button class="btn" data-act="audit-save-doc" data-id="' + esc(leadId) + '">Save to lead</button>' +
      '<button class="btn" data-act="proposal-draft" data-id="' + esc(leadId) + '">Proposal from this</button>' +
      '<button class="btn btn-primary" data-act="audit-export" data-id="' + esc(leadId) + '">Download PDF</button>',
    data: { auditText: res.audit || checks.filter(function (c) { return c.level !== 'pass'; }).map(function (c) { return '- ' + c.title + (c.fix ? ' — ' + c.fix : ''); }).join('\n'), auditUrl: res.url },
    noFocus: true
  });
  $$('#modalBody [data-audit-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#modalBody [data-audit-tab]').forEach(function (x) { x.classList.toggle('active', x === b); });
      $$('#modalBody .audit-pane').forEach(function (p) { p.hidden = p.dataset.pane !== b.dataset.auditTab; });
    });
  });
}

/* ─── email drafting ────────────────────────────────────────────────────── */
function composeEmail(leadId) {
  var lead = getLead(leadId);
  if (!lead) return;

  openModal({
    title: 'Email to ' + (lead.name || 'lead'),
    wide: true,
    body:
      '<div class="field"><label>To</label><input class="input" id="emTo" value="' + esc(lead.email || '') + '" placeholder="name@company.com"/></div>' +
      '<div class="field"><label>What should this email do?</label>' +
      '<input class="input" id="emBrief" placeholder="e.g. nudge them on the proposal without sounding desperate"/></div>' +
      '<div class="row"><button class="btn btn-primary btn-sm" data-act="em-generate" data-id="' + esc(leadId) + '">Write it with AI</button>' +
      '<span class="tiny muted">Nothing is sent until you press Send.</span></div>' +
      '<hr class="divider"/>' +
      '<div class="field"><label>Subject</label><input class="input" id="emSubject"/></div>' +
      '<div class="field"><label>Message</label><textarea class="textarea" id="emBody" rows="12"></textarea></div>',
    foot:
      '<button class="btn" data-act="em-copy">Copy</button>' +
      '<button class="btn" data-act="em-mailto">Open in mail app</button>' +
      '<button class="btn btn-primary" data-act="em-send" data-id="' + esc(leadId) + '">Send from Gmail</button>'
  });
}

function generateEmail(leadId) {
  var briefEl = $('#emBrief'), subjectEl = $('#emSubject'), bodyEl = $('#emBody');
  if (!bodyEl) return;
  bodyEl.value = 'Writing…';

  api('aiDraftEmail', {
    leadId: leadId,
    brief: briefEl ? briefEl.value : '',
    model: 'power'
  }, { timeout: 120000 }).then(function (res) {
    if (!res || !res.success) {
      bodyEl.value = '';
      toast('Could not draft that: ' + ((res && res.error) || 'no response'), 'err');
      return;
    }
    if (subjectEl) subjectEl.value = res.subject || '';
    bodyEl.value = res.body || '';
  });
}

/* ─── document export ───────────────────────────────────────────────────── */
function exportContent(content, defaultTitle) {
  openModal({
    title: 'Save as a file',
    body:
      '<div class="field"><label>File name</label><input class="input" id="exTitle" value="' + esc(defaultTitle || 'Everstone document') + '"/></div>' +
      '<div class="field"><label>Format</label><select class="select" id="exFormat">' +
      '<option value="pdf">PDF — for sending to clients</option>' +
      '<option value="docx">Word (.docx) — for editing</option>' +
      '<option value="pptx">PowerPoint (.pptx) — blank line starts a new slide</option>' +
      '<option value="xlsx">Excel (.xlsx) — comma or tab separated rows</option>' +
      '</select></div>' +
      '<div class="tiny muted">The file lands in your Drive and the link opens straight away.</div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-act="ex-run">Create file</button>',
    data: { exportContent: content }
  });
}

function runExport() {
  var titleEl = $('#exTitle'), formatEl = $('#exFormat');
  var content = Modal.data.exportContent || '';
  var title = titleEl ? titleEl.value : 'Everstone document';
  var format = formatEl ? formatEl.value : 'pdf';

  openModal({
    title: 'Creating your ' + format.toUpperCase(),
    body: '<div class="col" style="align-items:center;padding:22px 0"><span class="typing"><i></i><i></i><i></i></span>' +
      '<div class="small muted" style="margin-top:12px">Building the document in Drive…</div></div>',
    foot: ''
  });

  api('aiExport', { title: title, content: content, format: format }, { timeout: 180000 }).then(function (res) {
    if (!res || !res.success) {
      openModal({
        title: 'Could not create the file',
        body: '<p class="small">' + esc((res && res.error) || 'No response.') + '</p>',
        foot: '<button class="btn" data-act="close-modal">Close</button>'
      });
      return;
    }
    openModal({
      title: 'Ready',
      body: '<p class="small">' + esc(res.name) + ' is in your Drive.</p>',
      foot: '<button class="btn" data-act="close-modal">Close</button>' +
        '<button class="btn" data-act="copy" data-value="' + esc(res.url) + '">Copy link</button>' +
        '<a class="btn btn-primary" href="' + esc(res.url) + '" target="_blank" rel="noopener noreferrer">Open file</a>'
    });
  });
}

/* ─── custom instructions ───────────────────────────────────────────────── */
function openAiInstructions() {
  openModal({
    title: 'Custom instructions for ' + aiName(),
    body:
      '<p class="small muted">Written here once, obeyed in every conversation, every daily brief and every draft.</p>' +
      '<div class="field"><label>Standing instructions</label>' +
      '<textarea class="textarea" id="aiInstr" rows="10" placeholder="Examples:\n\nAlways write client-facing messages in English, even when I ask in Bangla.\nNever use exclamation marks or emoji in client messages.\nWhen I ask for a summary, keep it under five lines.\nAssume my clients are small business owners, not marketers.">' +
      esc(State.settings.aiInstructions || '') + '</textarea></div>' +
      '<div class="field"><label>Default model</label><select class="select" id="aiModelDefault">' +
      '<option value="fast"' + (State.settings.aiModel === 'fast' ? ' selected' : '') + '>Fast — cheap and quick</option>' +
      '<option value="power"' + (State.settings.aiModel === 'power' ? ' selected' : '') + '>Power — better reasoning, slower</option>' +
      '</select></div>',
    foot: '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-act="save-ai-instructions">Save</button>'
  });
}
