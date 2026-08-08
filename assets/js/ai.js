/* ═══════════════════════════════════════════════════════════════════════════
   ai.js — Evo: conversations, attachments, audits, drafting, exports
   Chats live on the sheet, not in this browser, so they follow you to any device.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var Ai = {
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
    host.innerHTML =
      '<div style="margin:auto;text-align:center;max-width:380px;color:var(--ink-3)">' +
      '<div style="font-size:26px;margin-bottom:8px">◆</div>' +
      '<div style="font-weight:640;color:var(--ink-2);font-size:14px">Evo is ready</div>' +
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
  if (meta && meta.done && meta.done.length) {
    done = '<div class="ai-done">' + meta.done.map(function (d) {
      return '<span>✓ ' + esc(d) + '</span>';
    }).join('') + '</div>';
  }

  return '<div class="ai-msg ' + (isUser ? 'user' : 'bot') + '">' +
    '<div class="ai-avatar">' + (isUser ? 'N' : '◆') + '</div>' +
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
      meta: { done: res.done || [], model: res.model },
      createdAt: new Date().toISOString()
    });
    renderThread();

    // Evo can change the sheet, so pull the truth back in when it did.
    if (res.done && res.done.length) {
      pullFromServer(true);
      toast('Evo made ' + res.done.length + ' change' + (res.done.length > 1 ? 's' : ''), 'good');
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
    '<div class="tiny muted" style="margin-bottom:12px">Evo can see everything about ' + esc(lead.name) +
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
      content: (res && res.success) ? res.reply : 'Could not reach Evo. ' + ((res && res.error) || ''),
      meta: { done: (res && res.done) || [] }
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
          '<p class="small muted">If the site blocks automated requests this will not work. You can still paste the page text into Evo directly.</p>',
        foot: '<button class="btn" data-act="close-modal">Close</button>'
      });
      return;
    }

    var s = res.signals || {};
    var page = s.page || {}, speed = s.speed || {};
    var signalHtml = '<div class="card" style="margin-bottom:14px"><div class="card-body" style="padding:12px">' +
      '<div class="bar-row" style="grid-template-columns:1fr auto;margin-bottom:4px"><span class="tiny muted">Title</span><span class="tiny">' + esc(page.title || '—') + '</span></div>' +
      '<div class="bar-row" style="grid-template-columns:1fr auto;margin-bottom:4px"><span class="tiny muted">Words on page</span><span class="tiny">' + esc(page.wordCount || 0) + '</span></div>' +
      '<div class="bar-row" style="grid-template-columns:1fr auto;margin-bottom:4px"><span class="tiny muted">Images missing alt</span><span class="tiny">' + esc((page.imgNoAlt || 0) + ' / ' + (page.imgTotal || 0)) + '</span></div>' +
      (speed.ok ? '<div class="bar-row" style="grid-template-columns:1fr auto;margin-bottom:4px"><span class="tiny muted">PageSpeed mobile</span><span class="tiny">perf ' + esc(speed.performance) + ' · SEO ' + esc(speed.seo) + ' · a11y ' + esc(speed.accessibility) + '</span></div>' : '') +
      (page.jsHeavy ? '<div class="tiny" style="color:var(--warm);margin-top:6px">This site renders with JavaScript, so the crawler saw very little text. The audit accounts for that.</div>' : '') +
      '</div></div>';

    openModal({
      title: 'Audit — ' + prettyUrl(lead.site),
      wide: true,
      body: signalHtml +
        '<div style="white-space:pre-wrap;font-size:13.5px;line-height:1.7" id="auditText">' + esc(res.audit) + '</div>',
      foot: '<span class="spread tiny muted">' + esc(res.model || '') + '</span>' +
        '<button class="btn" data-act="copy" data-value="' + esc(res.audit) + '">Copy</button>' +
        '<button class="btn" data-act="audit-save-doc" data-id="' + esc(leadId) + '">Save as document</button>' +
        '<button class="btn btn-primary" data-act="audit-export" data-id="' + esc(leadId) + '">Download as PDF</button>',
      data: { auditText: res.audit, auditUrl: res.url }
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
      '<div class="row"><button class="btn btn-primary btn-sm" data-act="em-generate" data-id="' + esc(leadId) + '">Write it with Evo</button>' +
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
    title: 'Custom instructions for Evo',
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
