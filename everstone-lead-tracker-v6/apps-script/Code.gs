/* ═══════════════════════════════════════════════════════════════════════════
   EVERSTONE LEAD TRACKER — Apps Script backend
   v6.0

   The promise this version makes: no matter how many times the frontend or
   this file is updated, an existing lead never loses a field, never moves, and
   never silently changes. Everything below serves that promise first and
   features second.

   What changed from v5:
   • Schema migrations are append-only and backed up. A version bump copies the
     whole spreadsheet before it touches a single header, adds missing columns
     at the far right only, and records what it did in Config + Activities.
   • Header matching now understands ALIASES, so a column somebody renamed
     ("Site", "Deal Value (৳)", "Follow Up Date") is reconnected instead of
     being duplicated.
   • Writes touch only the cells they actually change. v5 read a span and wrote
     the whole span back, which flattened any formula sitting between two
     edited columns. Contiguous-run writing removes that whole class of loss.
   • Settings moved out of Script Properties (9 KB ceiling) into a Config
     sheet, so a big custom stage/board configuration can never truncate.
   • New: Notes + Tasks (Google-Keep style), Touches (every call / meeting /
     proposal / message logged), StageEvents (every stage transition with
     from → to → when), and a full History API with filters and undo.
   • New: manual lead ordering, duplicate detection and lossless merge.
   • Google sign-in fixed. Three separate bugs — see login_() for the details.
   ═══════════════════════════════════════════════════════════════════════════ */

var APP_VERSION    = '6.0';
var SCHEMA_VERSION = 6;

// ─── CONFIG ────────────────────────────────────────────────────────────────
// Secrets belong in Project Settings → Script Properties, never in this file.
// This project is published to a public repository, so anything written below
// is readable by anyone — and scraped by bots within minutes of a push.
//
// Set these in Script Properties:
//   APP_PASSWORD        the password you type to sign in
//   ALLOWED_EMAILS      comma separated, for Google sign-in
//   GOOGLE_CLIENT_ID    only if you use Google sign-in
//   TG_TOKEN            Telegram bot token
//   TG_CHAT_ID          Telegram chat id
//   OPENROUTER_API_KEY  your OpenRouter key
//
// ⚠️  BEFORE YOU DEPLOY v6, READ THIS.
//
// v5 kept your password, Telegram token and OpenRouter key as literals in this
// file. This version does not — the strings below are deliberately empty, so
// nothing secret ships to your public repo again. Two consequences:
//
//   1. Those v5 values are already public (they sat in GitHub, and they were
//      pasted into a chat). Treat the OpenRouter key and Telegram bot token as
//      compromised and issue new ones before you use them again.
//   2. Sign-in, Telegram and Evo will not work until the values exist in
//      Script Properties. Fill in SETUP_ONCE just below, run
//      "Lead Tracker → Move secrets into Script Properties" from the sheet
//      menu, then blank SETUP_ONCE again and re-deploy. cfg() reads Script
//      Properties from that point on and this file stays clean forever.
//
// Paste your values here TEMPORARILY, run the menu item, then clear them.
var SETUP_ONCE = {
  APP_PASSWORD:       '',
  ALLOWED_EMAILS:     '',
  GOOGLE_CLIENT_ID:   '',
  TG_TOKEN:           '',
  TG_CHAT_ID:         '',
  OPENROUTER_API_KEY: ''
};

// Model names are not secret, so they stay here as sensible defaults and can
// still be overridden in Script Properties.
var FALLBACK = {
  APP_PASSWORD:       '',
  ALLOWED_EMAILS:     'mdnayemyuzzaman@gmail.com',
  GOOGLE_CLIENT_ID:   '',
  TG_TOKEN:           '',
  TG_CHAT_ID:         '',
  OPENROUTER_API_KEY: '',
  MODEL_FAST:         'google/gemini-3.6-flash',
  MODEL_POWER:        'anthropic/claude-sonnet-5',
  MODEL_VISION:       'google/gemini-3.6-flash'
};

var TZ = 'Asia/Dhaka';
var SESSION_DAYS = 30;
var SESSION_MAX = 40;              // oldest sessions are pruned past this
var LOGIN_MAX_ATTEMPTS = 6;
var LOGIN_LOCK_MINUTES = 15;
var BACKUP_KEEP_DAYS = 30;
var ACTIVITY_KEEP_ROWS = 40000;    // ~ a year of heavy use
var LOCK_MS = 25000;

function cfg(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (v !== null && v !== undefined && v !== '') return v;
  if (SETUP_ONCE[key]) return SETUP_ONCE[key];
  return FALLBACK[key] || '';
}

// ─── SHEET SCHEMA ──────────────────────────────────────────────────────────
// Order here is only the order NEW sheets get created in. Existing sheets keep
// their own order; columns are matched by normalised header name (then by
// alias), and any missing column is appended at the far right so old data
// never shifts.
var SHEETS = {
  LEADS:    'Leads',
  MEETINGS: 'Meetings',
  DOCS:     'Documents',
  ACTIVITY: 'Activities',
  NOTES:    'Notes',
  TASKS:    'Tasks',
  TOUCHES:  'Touches',
  STAGES:   'StageEvents',
  CHATS:    'AIChats',
  MESSAGES: 'AIMessages',
  CONFIG:   'Config'
};

var LEAD_COLS = [
  'ID', 'Name', 'Website', 'Phone', 'WhatsApp', 'Email', 'Contact Person',
  'Source', 'Stage', 'Priority', 'Labels', 'Star',
  'Followup Date', 'Next Step', 'Notes', 'History',
  'Service', 'Deal Value', 'Proposal Sent At', 'Proposal Value', 'Lost Reason',
  'Status', 'CalEventId', 'Created At', 'Updated At', 'Last Activity At', 'Edit Count',
  // ── v6 additions, appended right of everything that already exists ──
  'Sort Order', 'Stage Entered At', 'Stage Path',
  'Touch Count', 'Call Count', 'Meeting Count', 'Proposal Count', 'Message Count',
  'Last Touch At', 'Last Touch Type', 'Merged Into', 'Owner', 'Dedupe Key'
];

var MEETING_COLS = [
  'ID', 'Lead ID', 'Title', 'Date', 'Time', 'Duration', 'Platform', 'Location',
  'Agenda', 'Status', 'Discussed', 'Decision', 'Next Step', 'Next Step Date',
  'Interest', 'Outcome', 'Notes', 'Star', 'CalEventId', 'Created At', 'Updated At',
  'Sequence'
];

var DOC_COLS = ['ID', 'Lead ID', 'Name', 'URL', 'Type', 'Note', 'Created At', 'Status'];

var ACTIVITY_COLS = [
  'Timestamp', 'Lead ID', 'Lead Name', 'Type', 'Field', 'Old Value', 'New Value',
  'Actor', 'Details', 'ID', 'Entity', 'Entity ID', 'Source', 'Undone'
];

var NOTE_COLS = [
  'ID', 'Title', 'Body', 'Checklist', 'Color', 'Pinned', 'Archived', 'Labels',
  'Reminder At', 'Lead ID', 'Images', 'Sort Order', 'Created At', 'Updated At', 'Status'
];

var TASK_COLS = [
  'ID', 'Note ID', 'Text', 'Done', 'Due Date', 'Due Time', 'Priority', 'Labels',
  'Sort Order', 'Lead ID', 'Created At', 'Completed At', 'Updated At', 'Status'
];

var TOUCH_COLS = [
  'ID', 'Lead ID', 'Lead Name', 'Type', 'At', 'Direction', 'Outcome',
  'Duration', 'Notes', 'Stage At Time', 'Actor', 'Auto', 'Created At', 'Status'
];

var STAGE_EVENT_COLS = [
  'ID', 'Lead ID', 'Lead Name', 'From Stage', 'To Stage', 'At',
  'Days In Previous', 'Actor', 'Note'
];

var CHAT_COLS = ['ID', 'Title', 'Created At', 'Updated At', 'Pinned', 'Status'];

var MESSAGE_COLS = ['ID', 'Chat ID', 'Role', 'Content', 'Meta', 'Created At'];

var CONFIG_COLS = ['Key', 'Value', 'Updated At'];

// Old or hand-edited header spellings that mean the same column. Without this,
// a renamed column looks "missing" and a duplicate gets appended beside it —
// the exact data scramble this version exists to prevent.
var HEADER_ALIASES = {
  'Website':          ['Site', 'Web', 'URL', 'Web Site', 'Domain'],
  'WhatsApp':         ['WA', 'Whats App', 'Whatsapp Number', 'Whatsapp'],
  'Contact Person':   ['Contact', 'Person', 'Contact Name'],
  'Followup Date':    ['Follow Up Date', 'Follow-up Date', 'Followup', 'Next Follow Up', 'Follow Up'],
  'Next Step':        ['Next Action', 'Nextstep'],
  'Deal Value':       ['Value', 'Amount', 'Deal Amount', 'Deal Value (৳)', 'Budget', 'Deal'],
  'Proposal Value':   ['Proposal Amount', 'Proposal Deal Value'],
  'Proposal Sent At': ['Proposal Sent', 'Proposal Date'],
  'Last Activity At': ['Last Activity', 'Last Touched At', 'Last Touched'],
  'Edit Count':       ['Edits', 'Edit'],
  'Lost Reason':      ['Loss Reason', 'Why Lost'],
  'Sort Order':       ['Order', 'Position', 'Rank', 'Manual Order'],
  'Lead ID':          ['LeadID', 'Lead Id', 'Lead'],
  'Created At':       ['Created', 'Added', 'Added At'],
  'Updated At':       ['Updated', 'Modified At', 'Modified'],
  'Reminder At':      ['Reminder', 'Remind At'],
  'Due Date':         ['Due', 'Deadline'],
  'Stage Entered At': ['Stage Since', 'In Stage Since']
};

function normHeader_(h) {
  return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════
//  HTTP ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'ping') return json({ success: true, version: APP_VERSION, schema: SCHEMA_VERSION });

    // Public, unauthenticated, and deliberately so: the sign-in screen needs
    // the Google client id BEFORE it has a token, otherwise Google sign-in can
    // never initialise. Nothing secret is exposed here.
    if (p.action === 'publicConfig') return json(publicConfig_());

    if (!checkToken_(p.token)) return json({ success: false, error: 'AUTH' });
    if (p.action === 'getAll' || !p.action) return json(getAll_());
    if (p.action === 'export') return json(exportSnapshot_());
    return json({ success: false, error: 'Unknown action: ' + p.action });
  } catch (err) {
    return json({ success: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ success: false, error: 'Bad request body' });
  }

  try {
    var action = body.action;
    if (action === 'ping') return json({ success: true, version: APP_VERSION, schema: SCHEMA_VERSION });
    if (action === 'publicConfig') return json(publicConfig_());
    if (action === 'login') return json(login_(body));

    if (!checkToken_(body.token)) return json({ success: false, error: 'AUTH' });

    // Replay protection. Same opId twice → the first result, not a second write.
    if (body.opId) {
      var cached = getOpResult_(body.opId);
      if (cached) return json(cached);
    }

    var result = dispatch_(action, body);

    if (body.opId && result && result.success) rememberOp_(body.opId, result);
    return json(result);
  } catch (err) {
    return json({ success: false, error: String(err && err.message ? err.message : err) });
  }
}

function dispatch_(action, b) {
  switch (action) {
    // ── data ──
    case 'getAll':            return getAll_();
    case 'saveLead':          return saveLead_(b.lead);
    case 'deleteLead':        return setLeadStatus_(b.id, 'deleted', b.reason);
    case 'restoreLead':       return setLeadStatus_(b.id, 'active', '');
    case 'bulkUpdate':        return bulkUpdate_(b.ids, b.patch);
    case 'reorderLeads':      return reorderLeads_(b.order);
    case 'findDuplicates':    return findDuplicates_();
    case 'mergeLeads':        return mergeLeads_(b.primaryId, b.otherIds);
    case 'saveMeeting':       return saveMeeting_(b.meeting);
    case 'deleteMeeting':     return deleteMeeting_(b.id);
    case 'saveDoc':           return saveDoc_(b.doc);
    case 'deleteDoc':         return deleteDoc_(b.id);

    // ── notes + tasks ──
    case 'saveNote':          return saveNote_(b.note);
    case 'deleteNote':        return setNoteStatus_(b.id, 'deleted');
    case 'restoreNote':       return setNoteStatus_(b.id, 'active');
    case 'reorderNotes':      return reorderNotes_(b.order);
    case 'saveTask':          return saveTask_(b.task);
    case 'deleteTask':        return setTaskStatus_(b.id, 'deleted');
    case 'restoreTask':       return setTaskStatus_(b.id, 'active');
    case 'reorderTasks':      return reorderTasks_(b.order);

    // ── interaction tracking ──
    case 'logTouch':          return logTouch_(b.touch);
    case 'deleteTouch':       return deleteTouch_(b.id);
    case 'getTouches':        return getTouches_(b.leadId, b.limit);
    case 'getFlow':           return { success: true, flow: buildFlow_() };

    // ── history ──
    case 'getActivities':     return getActivities_(b.leadId, b.limit);
    case 'getHistory':        return getHistory_(b);
    case 'undoChange':        return undoChange_(b.activityId);

    // ── settings ──
    case 'getSettings':       return { success: true, settings: getSettings_() };
    case 'saveSettings':      return saveSettings_(b.settings);

    // ── telegram ──
    case 'telegram':          return tgSendApi_(b.text);

    // ── ai ──
    case 'aiChats':           return aiListChats_();
    case 'aiMessages':        return aiGetMessages_(b.chatId);
    case 'aiSend':            return aiSend_(b);
    case 'aiNewChat':         return aiNewChat_(b.title);
    case 'aiRenameChat':      return aiRenameChat_(b.chatId, b.title);
    case 'aiDeleteChat':      return aiDeleteChat_(b.chatId);
    case 'aiAudit':           return aiAudit_(b.url, b.leadId, b.model);
    case 'aiDraftEmail':      return aiDraftEmail_(b.leadId, b.brief, b.model);
    case 'aiExport':          return aiExport_(b.title, b.content, b.format);

    // ── mail ──
    case 'sendEmail':         return sendEmail_(b.to, b.subject, b.body, b.leadId);

    // ── files ──
    case 'uploadFile':        return uploadFile_(b.name, b.mimeType, b.dataB64, b.leadId);

    // ── maintenance ──
    case 'backupNow':         return { success: true, file: makeBackup_() };
    case 'export':            return exportSnapshot_();
    case 'verify':            return verifyIntegrity_();
    case 'recount':           return recountLeadCounters_();
    default:                  return { success: false, error: 'Unknown action: ' + action };
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function publicConfig_() {
  return {
    success: true,
    version: APP_VERSION,
    schema: SCHEMA_VERSION,
    googleClientId: cfg('GOOGLE_CLIENT_ID') || '',
    passwordEnabled: !!cfg('APP_PASSWORD'),
    googleEnabled: !!(cfg('GOOGLE_CLIENT_ID') && cfg('ALLOWED_EMAILS')),
    serverTime: new Date().toISOString(),
    tz: TZ
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH
//
//  Three bugs made Google sign-in fail in v5, all fixed here:
//
//  1. The password branch ran first and only checked `!== undefined`. A
//     frontend that posts { password: "", idToken: "..." } — which is what an
//     untouched password box sends — fell into the password branch, answered
//     "Wrong password", and never looked at the token. Google sign-in could
//     not succeed even when everything else was configured correctly.
//  2. Google Identity Services hands the frontend a field called `credential`.
//     v5 only read `idToken`, so a correct integration still failed.
//  3. The sign-in screen had no way to read GOOGLE_CLIENT_ID before it had a
//     token, so google.accounts.id.initialize() had nothing to initialise
//     with. doGet(action=publicConfig) now serves it unauthenticated.
//
//  Also: a failed Google attempt no longer counts toward the password
//  lockout, so experimenting with Google can never lock you out of the
//  password you actually know.
// ═══════════════════════════════════════════════════════════════════════════
function login_(body) {
  var idToken = body.idToken || body.credential || body.id_token || '';
  var password = body.password;
  var hasPassword = (password !== undefined && password !== null && String(password) !== '');

  // Token first. An empty password box must never block Google sign-in.
  if (idToken) return loginWithGoogle_(String(idToken));

  if (hasPassword) {
    var lock = loginLockState_();
    if (lock.locked) {
      return { success: false, error: 'Too many attempts. Try again in ' + lock.minutesLeft + ' minutes.' };
    }
    var pw = cfg('APP_PASSWORD');
    if (!pw) {
      return { success: false, error: 'No password is set yet. In Apps Script open Project Settings, scroll to Script Properties, and add APP_PASSWORD.' };
    }
    if (String(password) === pw) {
      clearLoginFailures_();
      return { success: true, token: issueToken_('password'), who: 'password', version: APP_VERSION, schema: SCHEMA_VERSION };
    }
    var st = recordLoginFailure_();
    tgSend_('🔐 Failed login attempt on Lead Tracker (' + st.count + '/' + LOGIN_MAX_ATTEMPTS + ')');
    return { success: false, error: 'Wrong password' };
  }

  return { success: false, error: 'No credentials supplied' };
}

function loginWithGoogle_(idToken) {
  var clientId = cfg('GOOGLE_CLIENT_ID');
  var allowedRaw = String(cfg('ALLOWED_EMAILS') || '');
  var allowed = allowedRaw.split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);

  if (!allowed.length) {
    return { success: false, error: 'Google sign-in is not set up yet: add ALLOWED_EMAILS in Script Properties.' };
  }

  var info;
  try {
    var res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) {
      return { success: false, error: 'Google rejected this sign-in token. Sign out of Google in this browser and try again.' };
    }
    info = JSON.parse(res.getContentText());
  } catch (err) {
    return { success: false, error: 'Could not reach Google to verify the sign-in: ' + err };
  }

  // Only enforce the audience when a client id is actually configured, so a
  // half-configured project fails with a useful message instead of a blank no.
  if (clientId && info.aud && info.aud !== clientId) {
    return {
      success: false,
      error: 'This sign-in came from a different Google client. The page is using ' +
             String(info.aud).slice(0, 24) + '… but GOOGLE_CLIENT_ID is ' + clientId.slice(0, 24) + '…'
    };
  }

  if (info.exp && Number(info.exp) * 1000 < Date.now()) {
    return { success: false, error: 'That Google sign-in expired. Try again.' };
  }
  if (info.email_verified !== undefined &&
      String(info.email_verified) !== 'true' && info.email_verified !== true) {
    return { success: false, error: 'That Google account has no verified email address.' };
  }

  var email = String(info.email || '').toLowerCase().trim();
  if (!email) return { success: false, error: 'Google did not return an email address.' };

  if (allowed.indexOf(email) === -1) {
    return { success: false, error: 'This account is not on the allow list: ' + email };
  }

  clearLoginFailures_();
  return {
    success: true, token: issueToken_(email), who: email,
    name: info.name || '', picture: info.picture || '',
    version: APP_VERSION, schema: SCHEMA_VERSION
  };
}

function loginLockState_() {
  var raw = PropertiesService.getScriptProperties().getProperty('EV_LOGIN_FAIL');
  if (!raw) return { locked: false };
  try {
    var s = JSON.parse(raw);
    if (s.count >= LOGIN_MAX_ATTEMPTS) {
      var until = s.last + LOGIN_LOCK_MINUTES * 60000;
      if (Date.now() < until) {
        return { locked: true, minutesLeft: Math.ceil((until - Date.now()) / 60000) };
      }
      clearLoginFailures_();
    }
  } catch (e) { /* corrupt state is treated as no lock */ }
  return { locked: false };
}

function recordLoginFailure_() {
  var p = PropertiesService.getScriptProperties();
  var s = { count: 0, last: 0 };
  try { s = JSON.parse(p.getProperty('EV_LOGIN_FAIL') || '{"count":0,"last":0}'); } catch (e) {}
  s.count = (s.count || 0) + 1;
  s.last = Date.now();
  p.setProperty('EV_LOGIN_FAIL', JSON.stringify(s));
  return s;
}

function clearLoginFailures_() {
  PropertiesService.getScriptProperties().deleteProperty('EV_LOGIN_FAIL');
}

function issueToken_(who) {
  var t = Utilities.getUuid();
  var p = PropertiesService.getScriptProperties();
  var s = {};
  try { s = JSON.parse(p.getProperty('EV_SESSIONS') || '{}'); } catch (e) {}
  var now = Date.now();
  Object.keys(s).forEach(function (k) { if (!s[k] || s[k].exp < now) delete s[k]; });

  // Script Properties cap a single value at 9 KB. Keep the newest sessions
  // only, so a long-lived install can never blow the cap and lose everyone's
  // login at once.
  var keys = Object.keys(s);
  if (keys.length >= SESSION_MAX) {
    keys.sort(function (a, b) { return s[a].exp - s[b].exp; });
    keys.slice(0, keys.length - SESSION_MAX + 1).forEach(function (k) { delete s[k]; });
  }

  s[t] = { exp: now + SESSION_DAYS * 86400000, who: who };
  p.setProperty('EV_SESSIONS', JSON.stringify(s));
  return t;
}

function checkToken_(t) {
  if (!t) return false;
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty('EV_SESSIONS') || '{}');
    return !!(s[t] && s[t].exp > Date.now());
  } catch (e) { return false; }
}

function whoIs_(t) {
  try {
    var s = JSON.parse(PropertiesService.getScriptProperties().getProperty('EV_SESSIONS') || '{}');
    return (s[t] && s[t].who) || 'app';
  } catch (e) { return 'app'; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  IDEMPOTENCY
// ═══════════════════════════════════════════════════════════════════════════
function getOpResult_(opId) {
  try {
    var raw = CacheService.getScriptCache().get('op_' + opId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function rememberOp_(opId, result) {
  try {
    CacheService.getScriptCache().put('op_' + opId, JSON.stringify(result), 600);
  } catch (e) { /* cache full or value too large — replays simply re-run */ }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHEET ACCESS — name-based columns, append-only schema
// ═══════════════════════════════════════════════════════════════════════════
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

var _tableCache = {};

/**
 * Returns { sheet, map, headers }.
 * `map` is canonicalName → 1-based column index, built from whatever the sheet
 * actually contains. Resolution order per canonical name:
 *   1. a header whose normalised text matches the canonical name
 *   2. a header matching one of its known aliases
 *   3. otherwise the column is appended on the far right
 * Existing columns are never moved, renamed or removed.
 */
function table_(name, cols) {
  if (_tableCache[name]) return _tableCache[name];

  var book = ss_();
  var sheet = book.getSheetByName(name);

  if (!sheet) {
    sheet = book.insertSheet(name);
    ensureColumns_(sheet, cols.length);
    sheet.getRange(1, 1, 1, cols.length).setValues([cols])
      .setBackground('#12201D').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    // getLastColumn() can lag a just-written range; flushing makes the header
    // row real before we measure it, otherwise every column looks "missing"
    // and gets appended a second time.
    SpreadsheetApp.flush();
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  var byNorm = {};
  for (var i = 0; i < headers.length; i++) {
    var n = normHeader_(headers[i]);
    if (n && byNorm[n] === undefined) byNorm[n] = i + 1;
  }

  var map = {}, used = {};

  // pass 1 — exact canonical names
  cols.forEach(function (c) {
    var col = byNorm[normHeader_(c)];
    if (col && !used[col]) { map[c] = col; used[col] = true; }
  });

  // pass 2 — aliases, only onto columns nothing has claimed yet
  cols.forEach(function (c) {
    if (map[c]) return;
    var aliases = HEADER_ALIASES[c] || [];
    for (var k = 0; k < aliases.length; k++) {
      var col = byNorm[normHeader_(aliases[k])];
      if (col && !used[col]) { map[c] = col; used[col] = true; return; }
    }
  });

  // pass 3 — whatever is still missing gets appended, right of everything
  var missing = cols.filter(function (c) { return !map[c]; });
  if (missing.length) {
    // A schema growth is the one moment data could get hurt, so take a copy
    // of the whole book first. Once per version bump, not once per call.
    backupBeforeMigration_(name, missing);

    var start = lastCol + 1;
    // A sheet ships with 26 columns and Apps Script throws rather than growing
    // the grid for you, so make the room before writing.
    ensureColumns_(sheet, start + missing.length - 1);
    sheet.getRange(1, start, 1, missing.length).setValues([missing])
      .setBackground('#12201D').setFontColor('#FFFFFF').setFontWeight('bold');
    missing.forEach(function (c, k) { map[c] = start + k; });
    headers = sheet.getRange(1, 1, 1, start + missing.length - 1).getValues()[0];
    if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
  }

  var t = { sheet: sheet, name: name, map: map, headers: headers };
  _tableCache[name] = t;
  return t;
}

function leadsTable_()    { return table_(SHEETS.LEADS, LEAD_COLS); }
function meetingsTable_() { return table_(SHEETS.MEETINGS, MEETING_COLS); }
function docsTable_()     { return table_(SHEETS.DOCS, DOC_COLS); }
function activityTable_() { return table_(SHEETS.ACTIVITY, ACTIVITY_COLS); }
function notesTable_()    { return table_(SHEETS.NOTES, NOTE_COLS); }
function tasksTable_()    { return table_(SHEETS.TASKS, TASK_COLS); }
function touchesTable_()  { return table_(SHEETS.TOUCHES, TOUCH_COLS); }
function stagesTable_()   { return table_(SHEETS.STAGES, STAGE_EVENT_COLS); }
function chatsTable_()    { return table_(SHEETS.CHATS, CHAT_COLS); }
function messagesTable_() { return table_(SHEETS.MESSAGES, MESSAGE_COLS); }
function configTable_()   { return table_(SHEETS.CONFIG, CONFIG_COLS); }

/**
 * Copies the whole spreadsheet before the first schema change of a new
 * version, and writes down what changed. Runs at most once per SCHEMA_VERSION.
 */
function backupBeforeMigration_(sheetName, missingCols) {
  var p = PropertiesService.getScriptProperties();
  var doneKey = 'EV_MIGRATED_' + SCHEMA_VERSION;
  if (p.getProperty(doneKey)) return;
  p.setProperty(doneKey, new Date().toISOString());
  try {
    var folderName = 'Everstone Lead Tracker — Backups';
    var it = DriveApp.getFoldersByName(folderName);
    var folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
    var stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HHmm');
    DriveApp.getFileById(ss_().getId())
      .makeCopy('Pre-v' + SCHEMA_VERSION + ' safety copy ' + stamp, folder);
  } catch (e) {
    Logger.log('pre-migration backup failed: ' + e);
  }
  try {
    Logger.log('schema v' + SCHEMA_VERSION + ' added to ' + sheetName + ': ' + missingCols.join(', '));
  } catch (e) {}
}

/** Reads every data row as an object keyed by canonical column name. */
function readAll_(t) {
  var last = t.sheet.getLastRow();
  if (last < 2) return [];
  var width = t.sheet.getLastColumn();
  var values = t.sheet.getRange(2, 1, last - 1, width).getValues();
  var keys = Object.keys(t.map);

  return values.map(function (row, i) {
    var o = { _row: i + 2 };
    keys.forEach(function (k) {
      var c = t.map[k];
      o[k] = (c && c <= row.length) ? row[c - 1] : '';
    });
    return o;
  });
}

function readOne_(t, row) {
  var width = t.sheet.getLastColumn();
  var vals = t.sheet.getRange(row, 1, 1, width).getValues()[0];
  var o = { _row: row };
  Object.keys(t.map).forEach(function (k) {
    var c = t.map[k];
    o[k] = (c && c <= vals.length) ? vals[c - 1] : '';
  });
  return o;
}

function findRowById_(t, id) {
  var idCol = t.map['ID'];
  var last = t.sheet.getLastRow();
  if (!idCol || last < 2) return -1;
  var ids = t.sheet.getRange(2, idCol, last - 1, 1).getValues();
  var target = String(id);
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === target) return i + 2;
  }
  return -1;
}

/**
 * Writes only the cells the patch actually names.
 *
 * v5 read a whole min→max span and wrote it back, which quietly flattened any
 * formula that happened to sit between two edited columns and rewrote cells
 * nobody had touched. Here the target columns are grouped into contiguous
 * runs, and only those runs are written — every other cell in the row is left
 * exactly as it was, formulas and all.
 */
function writeRow_(t, row, obj) {
  var targets = [];
  Object.keys(obj).forEach(function (k) {
    var c = t.map[k];
    if (c) targets.push({ col: c, key: k });
  });
  if (!targets.length) return;
  targets.sort(function (a, b) { return a.col - b.col; });

  ensureRows_(t.sheet, row);

  var runs = [], cur = null;
  targets.forEach(function (x) {
    if (cur && x.col === cur.end + 1) { cur.end = x.col; cur.items.push(x); }
    else { cur = { start: x.col, end: x.col, items: [x] }; runs.push(cur); }
  });

  // Formats are read once across the touched span rather than cell by cell —
  // a lead save touches a dozen text columns and a round trip each would make
  // every edit feel slow.
  var min = targets[0].col, max = targets[targets.length - 1].col;
  var span = t.sheet.getRange(row, min, 1, max - min + 1);
  var formats = span.getNumberFormats()[0];
  var formatChanged = false;

  targets.forEach(function (x) {
    var want = TEXT_COLUMNS[x.key] ? '@' : DATE_COLUMNS[x.key] ? 'yyyy-mm-dd' : null;
    if (!want) return;
    var i = x.col - min;
    // Phone numbers beginning with + are read as formulas unless the cell is
    // plain text, which is where the old #ERROR! cells came from.
    if (formats[i] !== want) { formats[i] = want; formatChanged = true; }
  });
  if (formatChanged) span.setNumberFormats([formats]);

  runs.forEach(function (r) {
    var w = r.end - r.start + 1;
    var vals = new Array(w);
    for (var i = 0; i < w; i++) vals[i] = '';
    r.items.forEach(function (x) {
      var v = obj[x.key];
      vals[x.col - r.start] = (v === undefined || v === null) ? '' : v;
    });
    t.sheet.getRange(row, r.start, 1, w).setValues([vals]);
  });
}

function ensureRows_(sheet, row) {
  var max = sheet.getMaxRows();
  if (row > max) sheet.insertRowsAfter(max, row - max + 50);
}

function ensureColumns_(sheet, col) {
  var max = sheet.getMaxColumns();
  if (col > max) sheet.insertColumnsAfter(max, col - max);
}

// Columns that must stay text no matter what the user types. Without this a
// phone like "+880 17..." is parsed as a formula and the cell shows #ERROR!.
var TEXT_COLUMNS = {
  'ID': true, 'Name': true, 'Website': true, 'Phone': true, 'WhatsApp': true,
  'Email': true, 'Contact Person': true, 'Notes': true, 'History': true,
  'Labels': true, 'Next Step': true, 'Lost Reason': true, 'Discussed': true,
  'Decision': true, 'Outcome': true, 'Content': true, 'Time': true,
  'Title': true, 'Body': true, 'Checklist': true, 'Text': true,
  'Stage Path': true, 'Images': true, 'Value': true, 'Old Value': true,
  'New Value': true, 'Details': true, 'Dedupe Key': true, 'Agenda': true,
  'Location': true, 'Note': true
};

// Calendar dates, shown without a meaningless 12:00:00 hanging off them.
// Timestamps (Created At, Updated At, At) are deliberately NOT here — the time
// of day is the useful part of those.
var DATE_COLUMNS = {
  'Followup Date': true, 'Proposal Sent At': true, 'Date': true,
  'Next Step Date': true, 'Due Date': true
};

/**
 * Serialises append-only writes. This is the DOCUMENT lock on purpose, not the
 * script lock: the row-updating writers already hold the script lock, and the
 * two must never be the same lock or a save that also journals would wait on
 * itself.
 */
function appendGuard_(fn) {
  var lock = LockService.getDocumentLock();
  var got = false;
  try { got = lock.tryLock(15000); } catch (e) {}
  try { return fn(); }
  finally { if (got) { try { lock.releaseLock(); } catch (e) {} } }
}

function appendRow_(t, obj) {
  var row = t.sheet.getLastRow() + 1;
  writeRow_(t, row, obj);
  return row;
}

/** Appends many rows in one setValues call. Used by the journal and importers. */
function appendRows_(t, objs) {
  if (!objs || !objs.length) return;
  var keys = {};
  objs.forEach(function (o) { Object.keys(o).forEach(function (k) { if (t.map[k]) keys[t.map[k]] = k; }); });
  var cols = Object.keys(keys).map(Number).sort(function (a, b) { return a - b; });
  if (!cols.length) return;
  var min = cols[0], max = cols[cols.length - 1], width = max - min + 1;

  var rows = objs.map(function (o) {
    var line = new Array(width);
    for (var i = 0; i < width; i++) line[i] = '';
    cols.forEach(function (c) {
      var k = keys[c];
      var v = o[k];
      line[c - min] = (v === undefined || v === null) ? '' : v;
    });
    return line;
  });

  var start = t.sheet.getLastRow() + 1;
  ensureRows_(t.sheet, start + rows.length - 1);
  t.sheet.getRange(start, min, rows.length, width).setValues(rows);
}

// ─── value helpers ───
function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function num_(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var n = Number(String(v === null || v === undefined ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function truthy_(v) {
  if (v === true) return true;
  var s = String(v === null || v === undefined ? '' : v).toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1' || s === '★' || s === 'y';
}
function splitList_(v) {
  return String(v || '').split(/[|,]/).map(function (x) { return x.trim(); }).filter(Boolean);
}
function splitHistory_(v) {
  return String(v || '').split('||').map(function (x) { return x.trim(); }).filter(Boolean);
}
function safeDate_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) ? null : v;
  }
  var s = String(v).trim();
  var ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  // Build plain dates from components at midday. Parsing "2026-08-10" as a
  // string makes it UTC midnight, which lands on the previous day in negative
  // offsets and has bitten this sheet before.
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function dateValue_(ymd) {
  var d = safeDate_(ymd);
  return d ? d : '';
}
function dateOnly_(v) {
  var d = safeDate_(v);
  return d ? Utilities.formatDate(d, TZ, 'yyyy-MM-dd') : '';
}
function timeOnly_(v) {
  if (!v && v !== 0) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, TZ, 'HH:mm');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : s;
}
function iso_(v) {
  var d = safeDate_(v);
  return d ? d.toISOString() : '';
}
function nowIso_() { return new Date().toISOString(); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function genId_(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function jsonParse_(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch (e) { return fallback; }
}
function truncate_(v, n) {
  var s = v === null || v === undefined ? '' : String(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function digits_(v) { return String(v || '').replace(/[^0-9]/g, ''); }
function hostOf_(v) {
  return String(v || '').toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS — stored in a Config sheet, not Script Properties
//
//  Script Properties cap one value at 9 KB. A custom board with twenty stages,
//  colour overrides, flow cards and saved orders passes that easily, and the
//  failure mode is silent truncation — settings simply vanish. A sheet cell
//  holds 50,000 characters, is visible, and is covered by the nightly backup.
// ═══════════════════════════════════════════════════════════════════════════
var DEFAULT_SETTINGS = {
  stages: [
    { name: 'New',                         color: '#2563EB', group: 'open' },
    { name: 'calling But No Response',     color: '#7C3AED', group: 'open' },
    { name: 'Phone Call',                  color: '#0EA5E9', group: 'open' },
    { name: 'Maybe Potential',             color: '#14B8A6', group: 'open' },
    { name: 'My Chioce',                   color: '#22C55E', group: 'open' },
    { name: 'Audit Required',              color: '#84CC16', group: 'open' },
    { name: 'Meeting in Progress',         color: '#0891B2', group: 'open' },
    { name: 'Meeting Completed',           color: '#0D9488', group: 'open' },
    { name: 'Meeting Re-Schedule',         color: '#06B6D4', group: 'open' },
    { name: 'Follow-up',                   color: '#A855F7', group: 'open' },
    { name: 'Follow-Up Phone Call',        color: '#8B5CF6', group: 'open' },
    { name: 'Follow-up Meeting',           color: '#6366F1', group: 'open' },
    { name: 'Urgent Call/Follow-Up V.V.I.P', color: '#DC2626', group: 'open' },
    { name: 'Proposal',                    color: '#EA580C', group: 'open' },
    { name: 'Negotiation',                 color: '#CA8A04', group: 'open' },
    { name: 'In-Progressing',              color: '#F59E0B', group: 'open' },
    { name: 'Hired',                       color: '#059669', group: 'won' },
    { name: 'Nayem Client',                color: '#047857', group: 'won' },
    { name: 'N/A',                         color: '#94A3B8', group: 'low' },
    { name: 'Maybe Not Potential',         color: '#F97316', group: 'low' },
    { name: 'Dead',                        color: '#6B7280', group: 'dead' }
  ],
  priorities: [
    { key: 'hot',  name: 'Hot',  color: '#DC2626' },
    { key: 'warm', name: 'Warm', color: '#D97706' },
    { key: 'cold', name: 'Cold', color: '#64748B' }
  ],
  labels: ['Retainer', 'Referral', 'Big Fish', 'Local', 'E-commerce'],
  sources: ['Ads', 'Direct', 'Referral', 'WhatsApp', 'Phone Call', 'Facebook', 'Instagram', 'Cold Call'],
  services: ['SEO', 'Local SEO / GBP', 'Website', 'CRO', 'Social Media', 'Full Package'],
  lostReasons: ['Price too high', 'Bad timing', 'Went with competitor', 'No response', 'Not a fit', 'Doing it in-house'],
  cadence: { Proposal: [2, 5, 10, 21], Meeting: [1, 4, 9], Contacted: [3, 7, 14] },
  rotting: { warnDays: 14, staleDays: 30 },
  closedStages: ['Hired', 'Nayem Client', 'Dead'],
  aiInstructions: '',
  aiModel: 'fast',
  alarmEnabled: true,
  currency: '৳',

  // ── v6 ──────────────────────────────────────────────────────────────────
  // Ordering. "smart" = starred first, then priority, then how far down the
  // funnel the stage sits, with the giving-up stages pushed to the bottom.
  // Anything dragged by hand wins inside its own band.
  leadSort: 'smart',
  priorityRank: { hot: 0, warm: 1, cold: 2 },
  bandRank: { open: 0, won: 1, low: 2, dead: 3 },
  manualOrderEnabled: true,

  // Which counters ride along the top of Today, in this order. Drag to
  // reorder, toggle `show` to hide. `kind` is what the number counts:
  //   touch  → interactions of that type, ever
  //   stage  → leads whose stage is one of `stages`
  //   passed → leads that have EVER been in one of `stages`
  //   metric → a built-in number
  flowCards: [
    { id: 'call',      label: 'Calls made',     kind: 'touch',  value: 'call',     icon: 'phone',    color: '#0EA5E9', show: true },
    { id: 'meeting',   label: 'Meetings held',  kind: 'touch',  value: 'meeting',  icon: 'meetings', color: '#0891B2', show: true },
    { id: 'proposal',  label: 'Proposals sent', kind: 'touch',  value: 'proposal', icon: 'docs',     color: '#EA580C', show: true },
    { id: 'message',   label: 'Messages sent',  kind: 'touch',  value: 'message',  icon: 'wa',       color: '#22C55E', show: true },
    { id: 'audit',     label: 'Audits done',    kind: 'touch',  value: 'audit',    icon: 'analytics',color: '#84CC16', show: false },
    { id: 'inMeeting', label: 'In meeting now', kind: 'stage',  value: ['Meeting in Progress', 'Meeting Re-Schedule', 'Follow-up Meeting'], icon: 'meetings', color: '#6366F1', show: false },
    { id: 'negotiating', label: 'Negotiating',  kind: 'stage',  value: ['Negotiation', 'Proposal'], icon: 'pipeline', color: '#CA8A04', show: false },
    { id: 'won',       label: 'Signed',         kind: 'stage',  value: ['Hired', 'Nayem Client'], icon: 'check', color: '#059669', show: false },
    { id: 'everMet',   label: 'Ever met',       kind: 'passed', value: ['Meeting in Progress', 'Meeting Completed', 'Follow-up Meeting', 'Meeting Re-Schedule'], icon: 'meetings', color: '#0D9488', show: false },
    { id: 'pipeline',  label: 'Open pipeline',  kind: 'metric', value: 'pipelineValue', icon: 'pipeline', color: '#17658A', show: false }
  ],

  // Changing a lead's stage to one of these logs the interaction automatically,
  // so the counters above fill themselves from the way you already work.
  stageTouchMap: {
    'Phone Call': 'call',
    'calling But No Response': 'call',
    'Follow-Up Phone Call': 'call',
    'Urgent Call/Follow-Up V.V.I.P': 'call',
    'Meeting in Progress': 'meeting',
    'Meeting Completed': 'meeting',
    'Follow-up Meeting': 'meeting',
    'Meeting Re-Schedule': 'meeting',
    'Proposal': 'proposal',
    'Audit Required': 'audit',
    'Negotiation': 'negotiation'
  },
  touchTypes: [
    { key: 'call',        label: 'Call',        color: '#0EA5E9' },
    { key: 'meeting',     label: 'Meeting',     color: '#0891B2' },
    { key: 'proposal',    label: 'Proposal',    color: '#EA580C' },
    { key: 'message',     label: 'Message',     color: '#22C55E' },
    { key: 'email',       label: 'Email',       color: '#8B5CF6' },
    { key: 'audit',       label: 'Audit',       color: '#84CC16' },
    { key: 'negotiation', label: 'Negotiation', color: '#CA8A04' },
    { key: 'visit',       label: 'Visit',       color: '#F97316' },
    { key: 'note',        label: 'Note',        color: '#64748B' }
  ],

  noteColors: ['#FFFFFF', '#FFF3C4', '#FFE0E0', '#E3F2E1', '#DDEBFF', '#EDE1FF', '#FFE7CC', '#E0F7FA'],
  recentLimit: 8,
  historyPageSize: 120,
  showFlowStrip: true,
  sidebarOrder: ['today', 'leads', 'pipeline', 'followups', 'meetings', 'notes', 'history', 'analytics', 'ai', 'messages', 'docs', 'archive'],
  todaySections: ['flow', 'stats', 'log', 'needs', 'quiet'],
  schemaVersion: SCHEMA_VERSION
};

function configGet_(key) {
  var t = configTable_();
  var rows = readAll_(t);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Key']) === key) return { row: rows[i]._row, value: rows[i]['Value'] };
  }
  return null;
}

function configSet_(key, value) {
  var t = configTable_();
  var hit = configGet_(key);
  var patch = { 'Key': key, 'Value': String(value), 'Updated At': new Date() };
  if (hit) writeRow_(t, hit.row, patch);
  else appendRow_(t, patch);
}

function getSettings_() {
  var cache = CacheService.getScriptCache();
  var cached = null;
  try { cached = cache.get('EV_SETTINGS_V6'); } catch (e) {}

  var saved = {};
  if (cached) {
    saved = jsonParse_(cached, {});
  } else {
    var hit = configGet_('settings');
    if (hit) {
      saved = jsonParse_(hit.value, {});
    } else {
      // One-time lift from where v5 kept them. The old property is left alone
      // so a rollback to v5 still finds its settings.
      var legacy = PropertiesService.getScriptProperties().getProperty('EV_SETTINGS');
      saved = jsonParse_(legacy, {});
      if (legacy) configSet_('settings', legacy);
    }
    try { cache.put('EV_SETTINGS_V6', JSON.stringify(saved), 120); } catch (e) {}
  }

  var out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    out[k] = saved[k] !== undefined ? saved[k] : DEFAULT_SETTINGS[k];
  });
  Object.keys(saved).forEach(function (k) { if (out[k] === undefined) out[k] = saved[k]; });

  // A stage you invented in the sheet but never added to Settings still has to
  // render with a colour, so fold any unknown stage in rather than dropping it.
  out.stages = mergeStageList_(out.stages);
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

function mergeStageList_(stages) {
  var list = Array.isArray(stages) ? stages.slice() : DEFAULT_SETTINGS.stages.slice();
  var seen = {};
  list = list.map(function (s) {
    var o = (typeof s === 'string') ? { name: s } : (s || {});
    if (!o.name) return null;
    if (seen[o.name]) return null;
    seen[o.name] = true;
    if (!o.color) o.color = '#64748B';
    if (!o.group) {
      var d = null;
      DEFAULT_SETTINGS.stages.forEach(function (x) { if (x.name === o.name) d = x; });
      o.group = d ? d.group : 'open';
    }
    return o;
  }).filter(Boolean);
  return list;
}

function saveSettings_(settings) {
  if (!settings) return { success: false, error: 'No settings supplied' };
  var merged = getSettings_();
  Object.keys(settings).forEach(function (k) { merged[k] = settings[k]; });
  merged.stages = mergeStageList_(merged.stages);
  configSet_('settings', JSON.stringify(merged));
  try { CacheService.getScriptCache().remove('EV_SETTINGS_V6'); } catch (e) {}
  journal_('', '', 'settings', 'settings', '', Object.keys(settings).join(', '), 'app', '', 'settings', 'settings', '');
  return { success: true, settings: merged };
}

// ═══════════════════════════════════════════════════════════════════════════
//  READ
// ═══════════════════════════════════════════════════════════════════════════
function getAll_() {
  var settings = getSettings_();

  var leads = readAll_(leadsTable_())
    .filter(function (r) { return r['ID'] !== '' && r['ID'] !== null; })
    .map(leadToJson_);

  var meetings = readAll_(meetingsTable_())
    .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
    .map(meetingToJson_);

  var docs = readAll_(docsTable_())
    .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
    .map(docToJson_);

  var notes = readAll_(notesTable_())
    .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
    .map(noteToJson_);

  var tasks = readAll_(tasksTable_())
    .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
    .map(taskToJson_);

  var touches = readAll_(touchesTable_())
    .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
    .map(touchToJson_);

  var stageEvents = readAll_(stagesTable_())
    .filter(function (r) { return r['ID'] !== ''; })
    .map(stageEventToJson_);

  attachCounts_(leads, touches, meetings, stageEvents);

  return {
    success: true,
    version: APP_VERSION,
    schema: SCHEMA_VERSION,
    serverTime: new Date().toISOString(),
    leads: leads,
    meetings: meetings,
    docs: docs,
    notes: notes,
    tasks: tasks,
    // The whole journal would be megabytes; the History page pages through it
    // with getHistory. These are the tails the dashboard renders immediately.
    touches: touches.slice(-600),
    stageEvents: stageEvents.slice(-800),
    flow: buildFlow_(leads, touches, stageEvents),
    activities: recentActivities_(250),
    settings: settings
  };
}

/**
 * Interaction counts are computed here rather than trusted from the columns,
 * so a hand-edited sheet or a half-finished write can never leave a lead
 * showing "4 meetings" it never had. The columns are kept updated too, but
 * only because they are useful to read inside Google Sheets.
 */
function attachCounts_(leads, touches, meetings, stageEvents) {
  var byLead = {};
  function bucket(id) {
    if (!byLead[id]) byLead[id] = { total: 0, types: {}, lastAt: '', lastType: '', stages: {} };
    return byLead[id];
  }

  touches.forEach(function (tc) {
    if (!tc.leadId) return;
    var b = bucket(tc.leadId);
    b.total++;
    b.types[tc.type] = (b.types[tc.type] || 0) + 1;
    if (!b.lastAt || (tc.at || '') > b.lastAt) { b.lastAt = tc.at || ''; b.lastType = tc.type; }
  });

  meetings.forEach(function (m) {
    if (!m.leadId) return;
    var b = bucket(m.leadId);
    b.scheduled = (b.scheduled || 0) + 1;
    if (m.status === 'done') b.held = (b.held || 0) + 1;
  });

  stageEvents.forEach(function (se) {
    if (!se.leadId) return;
    bucket(se.leadId).stages[se.toStage] = true;
  });

  leads.forEach(function (l) {
    var b = byLead[l.id] || { total: 0, types: {}, lastAt: '', lastType: '', stages: {} };
    l.counts = {
      total: b.total,
      call: b.types.call || 0,
      meeting: b.types.meeting || 0,
      proposal: b.types.proposal || 0,
      message: b.types.message || 0,
      email: b.types.email || 0,
      audit: b.types.audit || 0,
      negotiation: b.types.negotiation || 0,
      visit: b.types.visit || 0,
      note: b.types.note || 0,
      meetingsScheduled: b.scheduled || 0,
      meetingsHeld: b.held || 0
    };
    l.lastTouchAt = b.lastAt || l.lastTouchAt || '';
    l.lastTouchType = b.lastType || l.lastTouchType || '';
    l.stagesVisited = Object.keys(b.stages);
    if (!l.stagesVisited.length && l.stagePath) l.stagesVisited = String(l.stagePath).split('>').filter(Boolean);
  });
}

function leadToJson_(r) {
  return {
    id: String(r['ID']),
    name: str_(r['Name']),
    site: str_(r['Website']),
    phone: str_(r['Phone']),
    wa: str_(r['WhatsApp']),
    email: str_(r['Email']),
    contact: str_(r['Contact Person']),
    source: str_(r['Source']) || 'Ads',
    stage: str_(r['Stage']) || 'New',
    priority: str_(r['Priority']) || 'warm',
    labels: splitList_(r['Labels']),
    star: truthy_(r['Star']),
    followup: dateOnly_(r['Followup Date']),
    nextStep: str_(r['Next Step']),
    notes: str_(r['Notes']),
    history: splitHistory_(r['History']),
    service: str_(r['Service']),
    value: num_(r['Deal Value']),
    proposalSentAt: dateOnly_(r['Proposal Sent At']),
    proposalValue: num_(r['Proposal Value']),
    lostReason: str_(r['Lost Reason']),
    status: str_(r['Status']) || 'active',
    calEventId: str_(r['CalEventId']),
    createdAt: iso_(r['Created At']),
    updatedAt: iso_(r['Updated At']),
    lastActivityAt: iso_(r['Last Activity At']) || iso_(r['Updated At']) || iso_(r['Created At']),
    editCount: num_(r['Edit Count']),
    sortOrder: r['Sort Order'] === '' || r['Sort Order'] === null || r['Sort Order'] === undefined ? null : num_(r['Sort Order']),
    stageEnteredAt: iso_(r['Stage Entered At']) || iso_(r['Created At']),
    stagePath: str_(r['Stage Path']),
    lastTouchAt: iso_(r['Last Touch At']),
    lastTouchType: str_(r['Last Touch Type']),
    mergedInto: str_(r['Merged Into']),
    owner: str_(r['Owner']),
    row: r._row
  };
}

function meetingToJson_(r) {
  return {
    id: String(r['ID']),
    leadId: String(r['Lead ID'] || ''),
    title: str_(r['Title']),
    date: dateOnly_(r['Date']),
    time: timeOnly_(r['Time']),
    duration: num_(r['Duration']) || 45,
    platform: str_(r['Platform']) || 'google',
    location: str_(r['Location']),
    agenda: str_(r['Agenda']),
    status: str_(r['Status']) || 'upcoming',
    discussed: str_(r['Discussed']),
    decision: str_(r['Decision']),
    nextStep: str_(r['Next Step']),
    nextStepDate: dateOnly_(r['Next Step Date']),
    interest: num_(r['Interest']),
    outcome: str_(r['Outcome']),
    notes: str_(r['Notes']),
    star: truthy_(r['Star']),
    calEventId: str_(r['CalEventId']),
    sequence: num_(r['Sequence']),
    createdAt: iso_(r['Created At']),
    updatedAt: iso_(r['Updated At'])
  };
}

function docToJson_(r) {
  return {
    id: String(r['ID']), leadId: String(r['Lead ID'] || ''), name: str_(r['Name']),
    url: str_(r['URL']), type: str_(r['Type'] || 'other'), note: str_(r['Note']),
    createdAt: iso_(r['Created At'])
  };
}

function noteToJson_(r) {
  return {
    id: String(r['ID']),
    title: String(r['Title'] === null || r['Title'] === undefined ? '' : r['Title']),
    body: String(r['Body'] === null || r['Body'] === undefined ? '' : r['Body']),
    checklist: jsonParse_(r['Checklist'], []),
    color: str_(r['Color']) || '#FFFFFF',
    pinned: truthy_(r['Pinned']),
    archived: truthy_(r['Archived']),
    labels: splitList_(r['Labels']),
    reminderAt: iso_(r['Reminder At']),
    leadId: String(r['Lead ID'] || ''),
    images: jsonParse_(r['Images'], []),
    sortOrder: num_(r['Sort Order']),
    createdAt: iso_(r['Created At']),
    updatedAt: iso_(r['Updated At']),
    status: str_(r['Status']) || 'active'
  };
}

function taskToJson_(r) {
  return {
    id: String(r['ID']),
    noteId: String(r['Note ID'] || ''),
    text: String(r['Text'] === null || r['Text'] === undefined ? '' : r['Text']),
    done: truthy_(r['Done']),
    due: dateOnly_(r['Due Date']),
    dueTime: timeOnly_(r['Due Time']),
    priority: str_(r['Priority']) || 'normal',
    labels: splitList_(r['Labels']),
    sortOrder: num_(r['Sort Order']),
    leadId: String(r['Lead ID'] || ''),
    createdAt: iso_(r['Created At']),
    completedAt: iso_(r['Completed At']),
    updatedAt: iso_(r['Updated At']),
    status: str_(r['Status']) || 'active'
  };
}

function touchToJson_(r) {
  return {
    id: String(r['ID']),
    leadId: String(r['Lead ID'] || ''),
    leadName: str_(r['Lead Name']),
    type: str_(r['Type']) || 'note',
    at: iso_(r['At']) || iso_(r['Created At']),
    direction: str_(r['Direction']) || 'out',
    outcome: str_(r['Outcome']),
    duration: num_(r['Duration']),
    notes: String(r['Notes'] === null || r['Notes'] === undefined ? '' : r['Notes']),
    stageAtTime: str_(r['Stage At Time']),
    actor: str_(r['Actor']) || 'app',
    auto: truthy_(r['Auto']),
    createdAt: iso_(r['Created At'])
  };
}

function stageEventToJson_(r) {
  return {
    id: String(r['ID']),
    leadId: String(r['Lead ID'] || ''),
    leadName: str_(r['Lead Name']),
    fromStage: str_(r['From Stage']),
    toStage: str_(r['To Stage']),
    at: iso_(r['At']),
    daysInPrevious: num_(r['Days In Previous']),
    actor: str_(r['Actor']) || 'app',
    note: str_(r['Note'])
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — leads
// ═══════════════════════════════════════════════════════════════════════════
var LEAD_FIELD_MAP = {
  name: 'Name', site: 'Website', phone: 'Phone', wa: 'WhatsApp', email: 'Email',
  contact: 'Contact Person', source: 'Source', stage: 'Stage', priority: 'Priority',
  nextStep: 'Next Step', notes: 'Notes', service: 'Service', lostReason: 'Lost Reason',
  owner: 'Owner'
};

function saveLead_(lead) {
  if (!lead) return { success: false, error: 'No lead supplied' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) return { success: false, error: 'Sheet is busy, please retry' };

  var after = null, before = null, isNew = false, calNote = '';
  var pendingTouch = null, pendingStageEvent = null;

  try {
    var t = leadsTable_();
    var id = lead.id || genId_('L');
    var row = lead.id ? findRowById_(t, id) : -1;
    isNew = row < 0;

    // The dashboard mints the id before the row exists, so a missing row is an
    // insert when the client says so, and a genuine error when it does not —
    // that way a wrong id coming from Evo still fails loudly instead of
    // quietly creating a duplicate lead. A retry finds the row and updates.
    if (isNew && lead.id && lead.create === false) {
      return { success: false, error: 'Lead not found: ' + id };
    }

    // Only a brand-new lead has to carry something identifying. An edit arrives
    // as { id, stage } or { id, notes } and must not be judged as if it were a
    // whole record — rejecting those would throw away every inline edit.
    if (isNew && !lead.name && !lead.phone && !lead.site) {
      return { success: false, error: 'A new lead needs at least a name, phone or website' };
    }

    if (row > 0) {
      before = leadToJson_(readOne_(t, row));
      // Optimistic concurrency: the client tells us what it last saw.
      if (lead.baseUpdatedAt && before.updatedAt && lead.baseUpdatedAt !== before.updatedAt) {
        return { success: false, error: 'CONFLICT', current: before };
      }
    }

    var now = new Date();
    var patch = { 'ID': id, 'Updated At': now, 'Last Activity At': now };

    Object.keys(LEAD_FIELD_MAP).forEach(function (k) {
      if (lead[k] !== undefined) patch[LEAD_FIELD_MAP[k]] = String(lead[k] === null ? '' : lead[k]);
    });

    if (lead.labels !== undefined) {
      patch['Labels'] = (Array.isArray(lead.labels) ? lead.labels : splitList_(lead.labels)).join('|');
    }
    if (lead.star !== undefined) patch['Star'] = lead.star ? 'TRUE' : '';
    if (lead.value !== undefined) patch['Deal Value'] = num_(lead.value);
    if (lead.proposalValue !== undefined) patch['Proposal Value'] = num_(lead.proposalValue);
    if (lead.followup !== undefined) patch['Followup Date'] = lead.followup ? dateValue_(lead.followup) : '';
    if (lead.proposalSentAt !== undefined) patch['Proposal Sent At'] = lead.proposalSentAt ? dateValue_(lead.proposalSentAt) : '';
    if (lead.sortOrder !== undefined) patch['Sort Order'] = num_(lead.sortOrder);
    if (lead.history !== undefined) {
      patch['History'] = (Array.isArray(lead.history) ? lead.history : splitHistory_(lead.history)).join('||');
    }

    // Dedupe key: one lead, one identity. Phone wins over domain wins over name,
    // because that is the order in which they are actually unique in this book.
    var keyPhone = digits_(lead.phone !== undefined ? lead.phone : (before ? before.phone : ''));
    var keySite  = hostOf_(lead.site !== undefined ? lead.site : (before ? before.site : ''));
    var keyName  = String(lead.name !== undefined ? lead.name : (before ? before.name : '')).toLowerCase().replace(/[^a-z0-9]/g, '');
    patch['Dedupe Key'] = keyPhone ? ('p:' + keyPhone.slice(-10)) : keySite ? ('d:' + keySite) : keyName ? ('n:' + keyName) : '';

    // ── stage transition ────────────────────────────────────────────────
    var newStage = lead.stage !== undefined ? String(lead.stage) : null;
    var oldStage = before ? before.stage : '';
    var stageChanged = isNew ? !!newStage : (newStage !== null && newStage !== oldStage);

    if (isNew || stageChanged) {
      patch['Stage Entered At'] = now;
      var pathNow = (before && before.stagePath) ? before.stagePath : '';
      var stageForPath = newStage || (isNew ? 'New' : oldStage);
      patch['Stage Path'] = truncate_(pathNow ? (pathNow + '>' + stageForPath) : stageForPath, 900);

      pendingStageEvent = {
        leadId: id,
        leadName: patch['Name'] !== undefined ? patch['Name'] : (before ? before.name : ''),
        from: isNew ? '' : oldStage,
        to: stageForPath,
        daysInPrevious: before && before.stageEnteredAt ? Math.max(0, daysSince_(before.stageEnteredAt) || 0) : 0,
        actor: lead.actor || 'app'
      };

      // Moving a lead into a "you phoned them" or "you met them" stage is the
      // interaction. Logging it here is what makes the header counters honest
      // without asking for a second click.
      if (!isNew && lead.logTouch !== false) {
        var map = getSettings_().stageTouchMap || {};
        var touchType = map[stageForPath];
        if (touchType) {
          pendingTouch = {
            leadId: id,
            leadName: pendingStageEvent.leadName,
            type: touchType,
            at: now,
            stageAtTime: stageForPath,
            actor: lead.actor || 'app',
            auto: true,
            notes: 'Stage moved to ' + stageForPath
          };
        }
      }
    }

    if (isNew) {
      patch['Created At'] = now;
      patch['Status'] = lead.status || 'active';
      patch['Edit Count'] = 0;
      if (patch['Stage'] === undefined) patch['Stage'] = 'New';
      if (patch['Priority'] === undefined) patch['Priority'] = 'warm';
      if (patch['Sort Order'] === undefined) patch['Sort Order'] = nextSortOrder_(t);
      row = appendRow_(t, patch);
    } else {
      if (lead.status !== undefined) patch['Status'] = lead.status;
      patch['Edit Count'] = num_(before.editCount) + 1;
      writeRow_(t, row, patch);
    }

    // Calendar follow-up mirrors the date field.
    if (lead.followup !== undefined) {
      var prevFollow = before ? before.followup : '';
      if (lead.followup !== prevFollow) {
        try {
          calNote = syncFollowupEvent_(t, row, {
            name: patch['Name'] !== undefined ? patch['Name'] : (before ? before.name : ''),
            followup: lead.followup,
            notes: patch['Notes'] !== undefined ? patch['Notes'] : (before ? before.notes : ''),
            phone: patch['Phone'] !== undefined ? patch['Phone'] : (before ? before.phone : '')
          });
        } catch (e) { calNote = 'calendar failed: ' + e; }
      }
    }

    after = leadToJson_(readOne_(t, row));
  } finally {
    lock.releaseLock();
  }

  // Everything below only appends to other sheets, so it runs outside the lock.
  // Doing it inside meant a slow calendar or journal call held every other
  // write in the queue behind it.
  if (pendingStageEvent) recordStageEvent_(pendingStageEvent);
  if (pendingTouch) writeTouch_(pendingTouch);
  journalDiff_(before, after, isNew ? 'created' : 'updated', lead.actor || 'app', lead.source_ui || '');

  return { success: true, lead: after, cal: calNote };
}

function nextSortOrder_(t) {
  var col = t.map['Sort Order'];
  var last = t.sheet.getLastRow();
  if (!col || last < 2) return 1000;
  var vals = t.sheet.getRange(2, col, last - 1, 1).getValues();
  var max = 0;
  vals.forEach(function (v) { var n = num_(v[0]); if (n > max) max = n; });
  return max + 10;
}

function setLeadStatus_(id, status, reason) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) return { success: false, error: 'Sheet is busy, please retry' };
  var before, out;
  try {
    var t = leadsTable_();
    var row = findRowById_(t, id);
    if (row < 0) return { success: false, error: 'Lead not found' };

    before = leadToJson_(readOne_(t, row));
    var patch = { 'Status': status, 'Updated At': new Date() };
    if (reason) patch['Lost Reason'] = String(reason);
    writeRow_(t, row, patch);

    if (status === 'deleted' && before.calEventId) {
      try {
        var ev = CalendarApp.getDefaultCalendar().getEventById(before.calEventId);
        if (ev) ev.deleteEvent();
      } catch (e) {}
      writeRow_(t, row, { 'CalEventId': '' });
    }
    out = leadToJson_(readOne_(t, row));
  } finally {
    lock.releaseLock();
  }

  journal_(id, before.name, status === 'deleted' ? 'deleted' : 'restored', 'status',
    before.status, status, 'app', reason || '');
  return { success: true, lead: out };
}

function bulkUpdate_(ids, patch) {
  if (!ids || !ids.length) return { success: false, error: 'No leads selected' };
  var out = [], failed = [];
  ids.forEach(function (id) {
    var body = { id: id };
    Object.keys(patch || {}).forEach(function (k) { if (k !== 'id') body[k] = patch[k]; });
    var r = saveLead_(body);
    if (r.success) out.push(r.lead); else failed.push({ id: id, error: r.error });
  });
  return { success: true, leads: out, failed: failed };
}

/**
 * Persists a hand-dragged order. `order` is the full list of ids in the order
 * they should appear; positions are spaced by 10 so a later single-row insert
 * does not need to renumber the whole sheet.
 */
function reorderLeads_(order) {
  if (!order || !order.length) return { success: false, error: 'Nothing to reorder' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) return { success: false, error: 'Sheet is busy, please retry' };
  try {
    var t = leadsTable_();
    var col = t.map['Sort Order'];
    if (!col) return { success: false, error: 'Sort Order column missing' };

    var last = t.sheet.getLastRow();
    if (last < 2) return { success: true, moved: 0 };
    var idCol = t.map['ID'];
    var ids = t.sheet.getRange(2, idCol, last - 1, 1).getValues();
    var rowOf = {};
    for (var i = 0; i < ids.length; i++) rowOf[String(ids[i][0])] = i + 2;

    // One read + one write of the whole column, rather than a write per row.
    var current = t.sheet.getRange(2, col, last - 1, 1).getValues();
    var moved = 0;
    order.forEach(function (id, index) {
      var r = rowOf[String(id)];
      if (!r) return;
      var next = (index + 1) * 10;
      if (num_(current[r - 2][0]) !== next) { current[r - 2][0] = next; moved++; }
    });
    t.sheet.getRange(2, col, last - 1, 1).setValues(current);
    return { success: true, moved: moved };
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  DUPLICATES — one lead lives in exactly one place
// ═══════════════════════════════════════════════════════════════════════════
function findDuplicates_() {
  var leads = readAll_(leadsTable_())
    .filter(function (r) { return r['ID'] !== ''; })
    .map(leadToJson_)
    .filter(function (l) { return l.status !== 'deleted' && !l.mergedInto; });

  var groups = {};
  function add(key, lead) {
    if (!key) return;
    (groups[key] = groups[key] || []).push(lead);
  }

  leads.forEach(function (l) {
    var p = digits_(l.phone), w = digits_(l.wa), h = hostOf_(l.site);
    if (p.length >= 7) add('p:' + p.slice(-10), l);
    else if (w.length >= 7) add('p:' + w.slice(-10), l);
    else if (h) add('d:' + h, l);
    else if (l.name) add('n:' + l.name.toLowerCase().replace(/[^a-z0-9]/g, ''), l);
  });

  var dupes = [];
  Object.keys(groups).forEach(function (k) {
    var g = groups[k];
    if (g.length < 2) return;
    // Keep the richest record as the suggested survivor: most filled fields,
    // then most edits, then oldest — that is usually the real one.
    g.sort(function (a, b) {
      var fa = fillScore_(a), fb = fillScore_(b);
      if (fa !== fb) return fb - fa;
      if (a.editCount !== b.editCount) return b.editCount - a.editCount;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
    dupes.push({
      key: k,
      reason: k.charAt(0) === 'p' ? 'same phone number' : k.charAt(0) === 'd' ? 'same website' : 'same name',
      primary: g[0],
      others: g.slice(1)
    });
  });

  return { success: true, groups: dupes, count: dupes.length };
}

function fillScore_(l) {
  var n = 0;
  ['name', 'site', 'phone', 'wa', 'email', 'contact', 'service', 'notes', 'nextStep', 'followup'].forEach(function (k) {
    if (l[k]) n++;
  });
  if (l.value) n++;
  n += Math.min((l.history || []).length, 5);
  return n;
}

/**
 * Folds duplicates into one row without losing a character. Blank fields on the
 * survivor are filled from the others, notes and history are concatenated, and
 * every meeting, document, touch and note that pointed at a merged row is
 * repointed. The merged rows are flagged, never deleted, so the merge itself
 * can be reversed by hand from the sheet.
 */
function mergeLeads_(primaryId, otherIds) {
  if (!primaryId || !otherIds || !otherIds.length) {
    return { success: false, error: 'Pick a lead to keep and at least one to merge into it' };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) return { success: false, error: 'Sheet is busy, please retry' };
  try {
    return mergeLeadsLocked_(primaryId, otherIds);
  } finally {
    lock.releaseLock();
  }
}

function mergeLeadsLocked_(primaryId, otherIds) {
  var t = leadsTable_();
  var primaryRow = findRowById_(t, primaryId);
  if (primaryRow < 0) return { success: false, error: 'Lead to keep was not found' };
  var primary = leadToJson_(readOne_(t, primaryRow));

  var merged = [], patch = {};
  var textFields = { name: 'Name', site: 'Website', phone: 'Phone', wa: 'WhatsApp', email: 'Email',
    contact: 'Contact Person', service: 'Service', nextStep: 'Next Step', lostReason: 'Lost Reason' };
  var notes = primary.notes ? [primary.notes] : [];
  var history = (primary.history || []).slice();
  var labels = (primary.labels || []).slice();
  var value = primary.value;
  var star = primary.star;

  otherIds.forEach(function (oid) {
    if (String(oid) === String(primaryId)) return;
    var r = findRowById_(t, oid);
    if (r < 0) return;
    var o = leadToJson_(readOne_(t, r));

    Object.keys(textFields).forEach(function (k) {
      if (!primary[k] && o[k] && patch[textFields[k]] === undefined) patch[textFields[k]] = o[k];
    });
    if (o.notes) notes.push('— from ' + (o.name || o.id) + ' —\n' + o.notes);
    (o.history || []).forEach(function (h) { if (history.indexOf(h) < 0) history.push(h); });
    (o.labels || []).forEach(function (l) { if (labels.indexOf(l) < 0) labels.push(l); });
    if (o.value > value) value = o.value;
    if (o.star) star = true;
    if (!primary.followup && o.followup && patch['Followup Date'] === undefined) {
      patch['Followup Date'] = dateValue_(o.followup);
    }

    writeRow_(t, r, {
      'Status': 'merged',
      'Merged Into': String(primaryId),
      'Updated At': new Date()
    });
    repointChildren_(String(oid), String(primaryId));
    journal_(String(oid), o.name, 'merged', 'status', o.status, 'merged', 'app',
      'Folded into ' + (primary.name || primaryId));
    merged.push(o.name || oid);
  });

  patch['Notes'] = truncate_(notes.join('\n\n'), 45000);
  patch['History'] = truncate_(history.join('||'), 45000);
  patch['Labels'] = labels.join('|');
  patch['Deal Value'] = value;
  patch['Star'] = star ? 'TRUE' : '';
  patch['Updated At'] = new Date();
  patch['Last Activity At'] = new Date();
  writeRow_(t, primaryRow, patch);

  var after = leadToJson_(readOne_(t, primaryRow));
  journal_(primaryId, after.name, 'merge', 'merge', '', merged.join(', '), 'app',
    merged.length + ' record(s) folded in');
  return { success: true, lead: after, merged: merged };
}

/** Repoints every child row from one lead id to another. */
function repointChildren_(fromId, toId) {
  [[meetingsTable_(), 'Lead ID'], [docsTable_(), 'Lead ID'],
   [touchesTable_(), 'Lead ID'], [notesTable_(), 'Lead ID'], [tasksTable_(), 'Lead ID']]
  .forEach(function (pair) {
    var t = pair[0], colName = pair[1];
    var col = t.map[colName];
    var last = t.sheet.getLastRow();
    if (!col || last < 2) return;
    var range = t.sheet.getRange(2, col, last - 1, 1);
    var vals = range.getValues();
    var changed = false;
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) === fromId) { vals[i][0] = toId; changed = true; }
    }
    if (changed) range.setValues(vals);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — meetings
// ═══════════════════════════════════════════════════════════════════════════
function saveMeeting_(m) {
  if (!m) return { success: false, error: 'No meeting supplied' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) return { success: false, error: 'Sheet is busy, please retry' };

  var after = null, before = null, isNew = false, cal = '';
  var followUpLead = null, pendingTouch = null;

  try {
    var t = meetingsTable_();
    var id = m.id || genId_('M');
    var row = m.id ? findRowById_(t, id) : -1;
    isNew = row < 0;
    if (isNew && m.id && m.create === false) return { success: false, error: 'Meeting not found: ' + id };

    before = row > 0 ? meetingToJson_(readOne_(t, row)) : null;

    var patch = { 'ID': id, 'Updated At': new Date() };
    var f = {
      leadId: 'Lead ID', title: 'Title', platform: 'Platform', location: 'Location',
      agenda: 'Agenda', status: 'Status', discussed: 'Discussed', decision: 'Decision',
      nextStep: 'Next Step', outcome: 'Outcome', notes: 'Notes'
    };
    Object.keys(f).forEach(function (k) {
      if (m[k] !== undefined) patch[f[k]] = String(m[k] === null ? '' : m[k]);
    });
    if (m.date !== undefined) patch['Date'] = m.date ? dateValue_(m.date) : '';
    if (m.time !== undefined) patch['Time'] = m.time || '';
    if (m.duration !== undefined) patch['Duration'] = num_(m.duration) || 45;
    if (m.interest !== undefined) patch['Interest'] = num_(m.interest);
    if (m.star !== undefined) patch['Star'] = m.star ? 'TRUE' : '';
    if (m.nextStepDate !== undefined) {
      patch['Next Step Date'] = m.nextStepDate ? dateValue_(m.nextStepDate) : '';
    }

    if (isNew) {
      patch['Created At'] = new Date();
      if (patch['Status'] === undefined) patch['Status'] = 'upcoming';
      var leadIdForSeq = patch['Lead ID'] || '';
      patch['Sequence'] = leadIdForSeq ? countMeetingsFor_(t, leadIdForSeq) + 1 : 1;
      row = appendRow_(t, patch);
    } else {
      writeRow_(t, row, patch);
    }

    // Calendar entry follows the meeting's date/time.
    var newDate = m.date !== undefined ? m.date : (before ? before.date : '');
    var newTime = m.time !== undefined ? m.time : (before ? before.time : '');
    var changedWhen = !before || before.date !== newDate || before.time !== newTime;
    if (changedWhen && newDate) {
      try {
        cal = syncMeetingEvent_(t, row, {
          id: id,
          title: m.title || (before ? before.title : 'Meeting'),
          date: newDate,
          time: newTime,
          duration: m.duration !== undefined ? m.duration : (before ? before.duration : 45),
          notes: m.agenda || (before ? before.agenda : ''),
          leadName: m.leadName || ''
        });
      } catch (e) { cal = 'calendar failed: ' + e; }
    }

    after = meetingToJson_(readOne_(t, row));

    // A meeting marked done should push its own next step onto the lead, so the
    // "no next step" list stays honest without extra typing. Queued rather than
    // called here: saveLead_ takes the same lock and nesting it is asking for a
    // deadlock the first time Apps Script changes its mind about re-entrancy.
    if (after.status === 'done' && after.leadId && after.nextStepDate &&
        (!before || before.status !== 'done')) {
      followUpLead = {
        id: after.leadId,
        followup: after.nextStepDate,
        nextStep: after.nextStep || 'Follow up after meeting',
        logTouch: false
      };
    }
    if (after.status === 'done' && after.leadId && (!before || before.status !== 'done')) {
      pendingTouch = {
        leadId: after.leadId, leadName: m.leadName || '', type: 'meeting',
        at: safeDate_(after.date) || new Date(), outcome: after.outcome || after.decision || '',
        duration: after.duration, notes: after.discussed || after.title,
        actor: 'app', auto: true
      };
    }
  } finally {
    lock.releaseLock();
  }

  if (pendingTouch) writeTouch_(pendingTouch);
  if (followUpLead) { try { saveLead_(followUpLead); } catch (e) {} }

  journal_(after.leadId, m.leadName || '', isNew ? 'meeting_created' : 'meeting_updated',
    'meeting', before ? before.status : '', after.status, 'app', after.title);

  return { success: true, meeting: after, cal: cal };
}

function countMeetingsFor_(t, leadId) {
  var col = t.map['Lead ID'];
  var last = t.sheet.getLastRow();
  if (!col || last < 2) return 0;
  var vals = t.sheet.getRange(2, col, last - 1, 1).getValues();
  var n = 0;
  vals.forEach(function (v) { if (String(v[0]) === String(leadId)) n++; });
  return n;
}

function deleteMeeting_(id) {
  var t = meetingsTable_();
  var row = findRowById_(t, id);
  if (row < 0) return { success: false, error: 'Meeting not found' };
  var before = meetingToJson_(readOne_(t, row));
  writeRow_(t, row, { 'Status': 'deleted', 'Updated At': new Date() });
  if (before.calEventId) {
    try {
      var ev = CalendarApp.getDefaultCalendar().getEventById(before.calEventId);
      if (ev) ev.deleteEvent();
    } catch (e) {}
  }
  journal_(before.leadId, '', 'meeting_deleted', 'meeting', before.title, '', 'app', '');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — documents
// ═══════════════════════════════════════════════════════════════════════════
function saveDoc_(d) {
  if (!d) return { success: false, error: 'No document supplied' };
  var t = docsTable_();
  var id = d.id || genId_('D');
  var row = d.id ? findRowById_(t, id) : -1;
  var patch = {
    'ID': id, 'Lead ID': d.leadId || '', 'Name': d.name || 'Untitled',
    'URL': d.url || '', 'Type': d.type || 'other', 'Note': d.note || '', 'Status': 'active'
  };
  if (row < 0) { patch['Created At'] = new Date(); row = appendRow_(t, patch); }
  else writeRow_(t, row, patch);
  journal_(d.leadId || '', '', 'doc_added', 'document', '', d.name || '', 'app', d.url || '');
  return { success: true, id: id };
}

function deleteDoc_(id) {
  var t = docsTable_();
  var row = findRowById_(t, id);
  if (row < 0) return { success: false, error: 'Document not found' };
  writeRow_(t, row, { 'Status': 'deleted' });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  NOTES — the Keep-style board
// ═══════════════════════════════════════════════════════════════════════════
function saveNote_(n) {
  if (!n) return { success: false, error: 'No note supplied' };
  var t = notesTable_();
  var id = n.id || genId_('N');
  var row = n.id ? findRowById_(t, id) : -1;
  var isNew = row < 0;
  var before = isNew ? null : noteToJson_(readOne_(t, row));

  var patch = { 'ID': id, 'Updated At': new Date() };
  if (n.title !== undefined)     patch['Title'] = truncate_(n.title, 400);
  if (n.body !== undefined)      patch['Body'] = truncate_(n.body, 45000);
  if (n.checklist !== undefined) patch['Checklist'] = JSON.stringify(n.checklist || []);
  if (n.color !== undefined)     patch['Color'] = n.color || '#FFFFFF';
  if (n.pinned !== undefined)    patch['Pinned'] = n.pinned ? 'TRUE' : '';
  if (n.archived !== undefined)  patch['Archived'] = n.archived ? 'TRUE' : '';
  if (n.labels !== undefined)    patch['Labels'] = (Array.isArray(n.labels) ? n.labels : splitList_(n.labels)).join('|');
  if (n.reminderAt !== undefined) patch['Reminder At'] = n.reminderAt ? safeDate_(n.reminderAt) : '';
  if (n.leadId !== undefined)    patch['Lead ID'] = n.leadId || '';
  if (n.images !== undefined)    patch['Images'] = JSON.stringify(n.images || []);
  if (n.sortOrder !== undefined) patch['Sort Order'] = num_(n.sortOrder);

  if (isNew) {
    patch['Created At'] = new Date();
    patch['Status'] = 'active';
    if (patch['Sort Order'] === undefined) patch['Sort Order'] = Date.now() % 100000000;
    if (patch['Color'] === undefined) patch['Color'] = '#FFFFFF';
    row = appendRow_(t, patch);
  } else {
    if (n.status !== undefined) patch['Status'] = n.status;
    writeRow_(t, row, patch);
  }

  var after = noteToJson_(readOne_(t, row));
  journal_(after.leadId || '', after.title || '', isNew ? 'note_created' : 'note_updated',
    'note', before ? truncate_(before.title || before.body, 120) : '',
    truncate_(after.title || after.body, 120), 'app', '');
  return { success: true, note: after };
}

function setNoteStatus_(id, status) {
  var t = notesTable_();
  var row = findRowById_(t, id);
  if (row < 0) return { success: false, error: 'Note not found' };
  var before = noteToJson_(readOne_(t, row));
  writeRow_(t, row, { 'Status': status, 'Updated At': new Date() });
  journal_(before.leadId || '', before.title || '', status === 'deleted' ? 'note_deleted' : 'note_restored',
    'note', before.status, status, 'app', truncate_(before.title || before.body, 120));
  return { success: true };
}

function reorderNotes_(order) {
  return reorderGeneric_(notesTable_(), order, 'Sort Order');
}

function reorderTasks_(order) {
  return reorderGeneric_(tasksTable_(), order, 'Sort Order');
}

function reorderGeneric_(t, order, colName) {
  if (!order || !order.length) return { success: false, error: 'Nothing to reorder' };
  var col = t.map[colName], idCol = t.map['ID'];
  var last = t.sheet.getLastRow();
  if (!col || !idCol || last < 2) return { success: false, error: 'Nothing to reorder' };

  var ids = t.sheet.getRange(2, idCol, last - 1, 1).getValues();
  var rowOf = {};
  for (var i = 0; i < ids.length; i++) rowOf[String(ids[i][0])] = i + 2;

  var range = t.sheet.getRange(2, col, last - 1, 1);
  var current = range.getValues();
  order.forEach(function (id, index) {
    var r = rowOf[String(id)];
    if (r) current[r - 2][0] = (index + 1) * 10;
  });
  range.setValues(current);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  TASKS
// ═══════════════════════════════════════════════════════════════════════════
function saveTask_(k) {
  if (!k) return { success: false, error: 'No task supplied' };
  var t = tasksTable_();
  var id = k.id || genId_('T');
  var row = k.id ? findRowById_(t, id) : -1;
  var isNew = row < 0;
  var before = isNew ? null : taskToJson_(readOne_(t, row));

  var patch = { 'ID': id, 'Updated At': new Date() };
  if (k.noteId !== undefined)   patch['Note ID'] = k.noteId || '';
  if (k.text !== undefined)     patch['Text'] = truncate_(k.text, 4000);
  if (k.due !== undefined)      patch['Due Date'] = k.due ? dateValue_(k.due) : '';
  if (k.dueTime !== undefined)  patch['Due Time'] = k.dueTime || '';
  if (k.priority !== undefined) patch['Priority'] = k.priority || 'normal';
  if (k.labels !== undefined)   patch['Labels'] = (Array.isArray(k.labels) ? k.labels : splitList_(k.labels)).join('|');
  if (k.leadId !== undefined)   patch['Lead ID'] = k.leadId || '';
  if (k.sortOrder !== undefined) patch['Sort Order'] = num_(k.sortOrder);
  if (k.done !== undefined) {
    patch['Done'] = k.done ? 'TRUE' : '';
    patch['Completed At'] = k.done ? new Date() : '';
  }

  if (isNew) {
    patch['Created At'] = new Date();
    patch['Status'] = 'active';
    if (patch['Sort Order'] === undefined) patch['Sort Order'] = Date.now() % 100000000;
    row = appendRow_(t, patch);
  } else {
    if (k.status !== undefined) patch['Status'] = k.status;
    writeRow_(t, row, patch);
  }

  var after = taskToJson_(readOne_(t, row));
  journal_(after.leadId || '', after.text || '', isNew ? 'task_created' : 'task_updated',
    'task', before ? (before.done ? 'done' : 'open') : '', after.done ? 'done' : 'open', 'app',
    truncate_(after.text, 120));
  return { success: true, task: after };
}

function setTaskStatus_(id, status) {
  var t = tasksTable_();
  var row = findRowById_(t, id);
  if (row < 0) return { success: false, error: 'Task not found' };
  var before = taskToJson_(readOne_(t, row));
  writeRow_(t, row, { 'Status': status, 'Updated At': new Date() });
  journal_(before.leadId || '', before.text || '', status === 'deleted' ? 'task_deleted' : 'task_restored',
    'task', before.status, status, 'app', truncate_(before.text, 120));
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOUCHES — the interaction ledger the header counters read from
// ═══════════════════════════════════════════════════════════════════════════
function writeTouch_(tc) {
  return appendGuard_(function () { return writeTouchInner_(tc); });
}

function writeTouchInner_(tc) {
  try {
    var t = touchesTable_();
    var id = tc.id || genId_('TC');
    appendRow_(t, {
      'ID': id,
      'Lead ID': String(tc.leadId || ''),
      'Lead Name': String(tc.leadName || ''),
      'Type': String(tc.type || 'note'),
      'At': tc.at ? (safeDate_(tc.at) || new Date()) : new Date(),
      'Direction': String(tc.direction || 'out'),
      'Outcome': truncate_(tc.outcome, 400),
      'Duration': num_(tc.duration),
      'Notes': truncate_(tc.notes, 2000),
      'Stage At Time': String(tc.stageAtTime || ''),
      'Actor': String(tc.actor || 'app'),
      'Auto': tc.auto ? 'TRUE' : '',
      'Created At': new Date(),
      'Status': 'active'
    });
    bumpLeadTouchColumns_(tc);
    return id;
  } catch (e) {
    Logger.log('touch failed: ' + e);
    return '';
  }
}

/**
 * Keeps the denormalised counters on the lead row roughly current. The UI never
 * trusts these — it recounts from the ledger — but they make the Leads sheet
 * readable on its own, which matters when you are staring at the raw sheet.
 */
function bumpLeadTouchColumns_(tc) {
  if (!tc.leadId) return;
  try {
    var lt = leadsTable_();
    var row = findRowById_(lt, tc.leadId);
    if (row < 0) return;
    var cur = readOne_(lt, row);
    var colFor = { call: 'Call Count', meeting: 'Meeting Count', proposal: 'Proposal Count', message: 'Message Count' };
    var patch = {
      'Touch Count': num_(cur['Touch Count']) + 1,
      'Last Touch At': new Date(),
      'Last Touch Type': String(tc.type || ''),
      'Last Activity At': new Date()
    };
    var c = colFor[tc.type];
    if (c) patch[c] = num_(cur[c]) + 1;
    writeRow_(lt, row, patch);
  } catch (e) { /* counters are a convenience, never a blocker */ }
}

function logTouch_(tc) {
  if (!tc || !tc.leadId) return { success: false, error: 'Which lead was this with?' };
  var lead = getLeadById_(tc.leadId);
  if (!lead) return { success: false, error: 'Lead not found' };

  var id = writeTouch_({
    leadId: tc.leadId,
    leadName: lead.name,
    type: tc.type || 'note',
    at: tc.at || new Date(),
    direction: tc.direction || 'out',
    outcome: tc.outcome || '',
    duration: tc.duration || 0,
    notes: tc.notes || '',
    stageAtTime: lead.stage,
    actor: tc.actor || 'app',
    auto: false
  });
  if (!id) return { success: false, error: 'Could not write the interaction' };

  journal_(tc.leadId, lead.name, 'touch', tc.type || 'note', '',
    tc.outcome || tc.notes || (tc.type || 'note'), tc.actor || 'app', 'Logged manually');
  return { success: true, id: id, touch: { id: id } };
}

function deleteTouch_(id) {
  var t = touchesTable_();
  var row = findRowById_(t, id);
  if (row < 0) return { success: false, error: 'Interaction not found' };
  var before = touchToJson_(readOne_(t, row));
  writeRow_(t, row, { 'Status': 'deleted' });
  journal_(before.leadId, before.leadName, 'touch_deleted', before.type, before.type, '', 'app', '');
  return { success: true };
}

function getTouches_(leadId, limit) {
  var all = readAll_(touchesTable_())
    .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
    .map(touchToJson_);
  if (leadId) all = all.filter(function (x) { return x.leadId === String(leadId); });
  all.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  return { success: true, touches: all.slice(0, limit || 300) };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STAGE EVENTS
// ═══════════════════════════════════════════════════════════════════════════
function recordStageEvent_(ev) {
  appendGuard_(function () { recordStageEventInner_(ev); });
}

function recordStageEventInner_(ev) {
  try {
    appendRow_(stagesTable_(), {
      'ID': genId_('SE'),
      'Lead ID': String(ev.leadId || ''),
      'Lead Name': String(ev.leadName || ''),
      'From Stage': String(ev.from || ''),
      'To Stage': String(ev.to || ''),
      'At': new Date(),
      'Days In Previous': num_(ev.daysInPrevious),
      'Actor': String(ev.actor || 'app'),
      'Note': String(ev.note || '')
    });
  } catch (e) { Logger.log('stage event failed: ' + e); }
}

/**
 * The numbers behind the strip across the top of Today.
 *
 * The point of this is the thing that kept getting lost: once a lead moves on
 * from "Phone Call" to "Meeting" to "Proposal", the fact that you ever called
 * them disappears from the board. Counting the ledger instead of the current
 * stage means "how many leads have I actually met" survives every later move.
 */
function buildFlow_(leadsIn, touchesIn, stageEventsIn) {
  var leads = leadsIn || readAll_(leadsTable_())
    .filter(function (r) { return r['ID'] !== ''; }).map(leadToJson_);
  var touches = touchesIn || readAll_(touchesTable_())
    .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
    .map(touchToJson_);
  var events = stageEventsIn || readAll_(stagesTable_())
    .filter(function (r) { return r['ID'] !== ''; }).map(stageEventToJson_);

  var live = leads.filter(function (l) { return l.status !== 'deleted' && l.status !== 'merged'; });
  var liveIds = {};
  live.forEach(function (l) { liveIds[l.id] = true; });

  var byType = {}, leadsByType = {};
  touches.forEach(function (tc) {
    if (!liveIds[tc.leadId]) return;
    byType[tc.type] = (byType[tc.type] || 0) + 1;
    (leadsByType[tc.type] = leadsByType[tc.type] || {})[tc.leadId] = true;
  });

  var currentByStage = {}, leadIdsByStage = {};
  live.forEach(function (l) {
    currentByStage[l.stage] = (currentByStage[l.stage] || 0) + 1;
    (leadIdsByStage[l.stage] = leadIdsByStage[l.stage] || []).push(l.id);
  });

  var everByStage = {}, everLeadsByStage = {};
  events.forEach(function (e) {
    if (!liveIds[e.leadId] || !e.toStage) return;
    (everLeadsByStage[e.toStage] = everLeadsByStage[e.toStage] || {})[e.leadId] = true;
  });
  // Stage Path covers everything that happened before StageEvents existed, so
  // history from v5 is not silently reported as zero.
  live.forEach(function (l) {
    String(l.stagePath || '').split('>').filter(Boolean).forEach(function (s) {
      (everLeadsByStage[s] = everLeadsByStage[s] || {})[l.id] = true;
    });
    (everLeadsByStage[l.stage] = everLeadsByStage[l.stage] || {})[l.id] = true;
  });
  Object.keys(everLeadsByStage).forEach(function (s) {
    everByStage[s] = Object.keys(everLeadsByStage[s]).length;
  });

  var totals = {};
  Object.keys(byType).forEach(function (k) {
    totals[k] = { events: byType[k], leads: Object.keys(leadsByType[k] || {}).length };
  });

  var open = live.filter(function (l) {
    return (getSettings_().closedStages || []).indexOf(l.stage) < 0;
  });

  return {
    touchTotals: totals,
    currentByStage: currentByStage,
    leadIdsByStage: leadIdsByStage,
    everByStage: everByStage,
    everLeadIdsByStage: (function () {
      var o = {};
      Object.keys(everLeadsByStage).forEach(function (s) { o[s] = Object.keys(everLeadsByStage[s]); });
      return o;
    })(),
    metrics: {
      pipelineValue: open.reduce(function (s, l) { return s + num_(l.value); }, 0),
      openLeads: open.length,
      totalLeads: live.length,
      touchedLeads: Object.keys((function () {
        var o = {};
        touches.forEach(function (tc) { if (liveIds[tc.leadId]) o[tc.leadId] = true; });
        return o;
      })()).length
    },
    generatedAt: new Date().toISOString()
  };
}

/** Recomputes the convenience counters on every lead row from the ledger. */
function recountLeadCounters_() {
  var lt = leadsTable_();
  var leads = readAll_(lt).filter(function (r) { return r['ID'] !== ''; });
  var touches = readAll_(touchesTable_())
    .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
    .map(touchToJson_);

  var agg = {};
  touches.forEach(function (tc) {
    var a = agg[tc.leadId] = agg[tc.leadId] || { total: 0, call: 0, meeting: 0, proposal: 0, message: 0, last: '', lastType: '' };
    a.total++;
    if (a[tc.type] !== undefined) a[tc.type]++;
    if (!a.last || tc.at > a.last) { a.last = tc.at; a.lastType = tc.type; }
  });

  var n = 0;
  leads.forEach(function (r) {
    var a = agg[String(r['ID'])] || { total: 0, call: 0, meeting: 0, proposal: 0, message: 0, last: '', lastType: '' };
    writeRow_(lt, r._row, {
      'Touch Count': a.total, 'Call Count': a.call, 'Meeting Count': a.meeting,
      'Proposal Count': a.proposal, 'Message Count': a.message,
      'Last Touch At': a.last ? safeDate_(a.last) : '', 'Last Touch Type': a.lastType
    });
    n++;
  });
  return { success: true, updated: n };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIVITY JOURNAL — append only, never edited
// ═══════════════════════════════════════════════════════════════════════════
var JOURNAL_FIELDS = ['name', 'site', 'phone', 'wa', 'email', 'contact', 'source', 'stage',
  'priority', 'followup', 'nextStep', 'notes', 'service', 'value', 'proposalSentAt',
  'proposalValue', 'lostReason', 'star', 'status', 'labels', 'owner'];

function journalDiff_(before, after, type, actor, sourceUi) {
  if (!after) return;
  if (!before) {
    journal_(after.id, after.name, 'created', '', '', after.stage, actor, after.source || '', 'lead', after.id, sourceUi);
    return;
  }

  var entries = [];
  JOURNAL_FIELDS.forEach(function (f) {
    var a = before[f], b = after[f];
    if (Array.isArray(a)) a = a.join('|');
    if (Array.isArray(b)) b = b.join('|');
    if (String(a === undefined ? '' : a) !== String(b === undefined ? '' : b)) {
      entries.push([after.id, after.name, type, f, a, b, actor, '', 'lead', after.id, sourceUi || '']);
    }
  });

  // A save that changed nothing is noise, not history. v5 logged a "touched"
  // row for every one of them and buried the real changes.
  if (!entries.length) return;
  journalMany_(entries);
}

function journal_(leadId, leadName, type, field, oldV, newV, actor, details, entity, entityId, sourceUi) {
  journalMany_([[leadId, leadName, type, field, oldV, newV, actor, details,
                 entity || 'lead', entityId || leadId || '', sourceUi || '']]);
}

function journalMany_(entries) {
  if (!entries || !entries.length) return;
  appendGuard_(function () { journalManyInner_(entries); });
}

function journalManyInner_(entries) {
  try {
    var t = activityTable_();
    var now = new Date();
    var rows = entries.map(function (e) {
      return {
        'Timestamp': now,
        'ID': genId_('A'),
        'Lead ID': String(e[0] || ''),
        'Lead Name': String(e[1] || ''),
        'Type': String(e[2] || ''),
        'Field': String(e[3] || ''),
        'Old Value': truncate_(e[4], 900),
        'New Value': truncate_(e[5], 900),
        'Actor': String(e[6] || 'app'),
        'Details': truncate_(e[7], 500),
        'Entity': String(e[8] || 'lead'),
        'Entity ID': String(e[9] || ''),
        'Source': String(e[10] || ''),
        'Undone': ''
      };
    });
    appendRows_(t, rows);

    var total = t.sheet.getLastRow();
    if (total > ACTIVITY_KEEP_ROWS + 1) t.sheet.deleteRows(2, total - ACTIVITY_KEEP_ROWS - 1);
  } catch (e) {
    Logger.log('journal failed: ' + e);
  }
}

function activityToJson_(r) {
  return {
    id: String(r['ID'] || ''),
    at: iso_(r['Timestamp']),
    leadId: String(r['Lead ID'] || ''),
    leadName: str_(r['Lead Name']),
    type: str_(r['Type']),
    field: str_(r['Field']),
    oldValue: String(r['Old Value'] === null || r['Old Value'] === undefined ? '' : r['Old Value']),
    newValue: String(r['New Value'] === null || r['New Value'] === undefined ? '' : r['New Value']),
    actor: str_(r['Actor']) || 'app',
    details: str_(r['Details']),
    entity: str_(r['Entity']) || 'lead',
    entityId: String(r['Entity ID'] || ''),
    source: str_(r['Source']),
    undone: truthy_(r['Undone'])
  };
}

function recentActivities_(limit) {
  try {
    var t = activityTable_();
    var last = t.sheet.getLastRow();
    if (last < 2) return [];
    var n = Math.min(limit || 250, last - 1);
    var start = last - n + 1;
    var width = t.sheet.getLastColumn();
    var vals = t.sheet.getRange(start, 1, n, width).getValues();
    var map = t.map;
    return vals.map(function (row) {
      var o = {};
      Object.keys(map).forEach(function (k) {
        var c = map[k];
        o[k] = (c && c <= row.length) ? row[c - 1] : '';
      });
      return activityToJson_(o);
    }).reverse();
  } catch (e) { return []; }
}

function getActivities_(leadId, limit) {
  var all = recentActivities_(4000);
  var list = leadId ? all.filter(function (a) { return a.leadId === String(leadId); }) : all;
  return { success: true, activities: list.slice(0, limit || 300) };
}

/**
 * The History page. Filters run over the whole journal, then a page is cut, so
 * "every stage change Evo made in July" is one request rather than a scroll.
 */
function getHistory_(q) {
  q = q || {};
  // Reading forty thousand rows on every History page load would make the
  // page feel broken. Six thousand entries is roughly a year of real use and
  // comes back fast; the sheet keeps everything older than that regardless.
  var all = recentActivities_(6000);

  var text = String(q.search || '').toLowerCase().trim();
  var types = Array.isArray(q.types) && q.types.length ? q.types : null;
  var fields = Array.isArray(q.fields) && q.fields.length ? q.fields : null;
  var entities = Array.isArray(q.entities) && q.entities.length ? q.entities : null;

  var list = all.filter(function (a) {
    if (q.leadId && a.leadId !== String(q.leadId)) return false;
    if (q.actor && a.actor !== q.actor) return false;
    if (types && types.indexOf(a.type) < 0) return false;
    if (fields && fields.indexOf(a.field) < 0) return false;
    if (entities && entities.indexOf(a.entity) < 0) return false;
    if (q.from && a.at && a.at.slice(0, 10) < q.from) return false;
    if (q.to && a.at && a.at.slice(0, 10) > q.to) return false;
    if (text) {
      var hay = (a.leadName + ' ' + a.type + ' ' + a.field + ' ' + a.oldValue + ' ' +
                 a.newValue + ' ' + a.details + ' ' + a.actor).toLowerCase();
      if (hay.indexOf(text) < 0) return false;
    }
    return true;
  });

  var offset = Math.max(0, num_(q.offset));
  var limit = Math.min(Math.max(num_(q.limit) || 120, 1), 1000);

  // Facets let the page show "Stage 412 · Notes 88" without a second request.
  var facets = { type: {}, field: {}, actor: {}, entity: {} };
  list.forEach(function (a) {
    facets.type[a.type] = (facets.type[a.type] || 0) + 1;
    if (a.field) facets.field[a.field] = (facets.field[a.field] || 0) + 1;
    facets.actor[a.actor] = (facets.actor[a.actor] || 0) + 1;
    facets.entity[a.entity] = (facets.entity[a.entity] || 0) + 1;
  });

  return {
    success: true,
    total: list.length,
    offset: offset,
    limit: limit,
    facets: facets,
    activities: list.slice(offset, offset + limit)
  };
}

/** Puts one recorded field change back the way it was. */
function undoChange_(activityId) {
  if (!activityId) return { success: false, error: 'Which change?' };
  var t = activityTable_();
  var row = findRowById_(t, activityId);
  if (row < 0) return { success: false, error: 'That change is no longer in the journal' };

  var a = activityToJson_(readOne_(t, row));
  if (a.undone) return { success: false, error: 'That one has already been undone' };
  if (a.entity !== 'lead' || !a.leadId || !a.field) {
    return { success: false, error: 'Only field changes on a lead can be reversed automatically' };
  }
  if (JOURNAL_FIELDS.indexOf(a.field) < 0) {
    return { success: false, error: 'That field cannot be reversed automatically' };
  }

  var patch = { id: a.leadId, actor: 'undo', logTouch: false };
  patch[a.field] = coerceJournalValue_(a.field, a.oldValue);

  var res = saveLead_(patch);
  if (!res.success) return res;

  writeRow_(t, row, { 'Undone': 'TRUE' });
  journal_(a.leadId, a.leadName, 'undo', a.field, a.newValue, a.oldValue, 'undo',
    'Reverted a change from ' + a.at);
  return { success: true, lead: res.lead };
}

function coerceJournalValue_(field, raw) {
  var v = raw === null || raw === undefined ? '' : String(raw);
  if (field === 'star') return truthy_(v);
  if (field === 'value' || field === 'proposalValue') return num_(v);
  if (field === 'labels') return splitList_(v);
  return v;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CALENDAR
// ═══════════════════════════════════════════════════════════════════════════
function syncFollowupEvent_(t, row, lead) {
  if (!t.map['CalEventId']) return '';
  var cal = CalendarApp.getDefaultCalendar();
  var existing = str_(t.sheet.getRange(row, t.map['CalEventId']).getValue());
  if (existing) {
    try { var old = cal.getEventById(existing); if (old) old.deleteEvent(); } catch (e) {}
    writeRow_(t, row, { 'CalEventId': '' });
  }
  if (!lead.followup) return '';

  var start = safeDate_(lead.followup);
  if (!start) return '';
  var ev = cal.createAllDayEvent(
    '📞 Follow-up: ' + (lead.name || lead.phone || 'Lead'),
    start,
    { description: (lead.notes || '') + (lead.phone ? '\nPhone: ' + lead.phone : '') + '\n— Everstone Lead Tracker' }
  );
  try { ev.addPopupReminder(60); } catch (e) {}
  writeRow_(t, row, { 'CalEventId': ev.getId() });
  return 'booked';
}

function syncMeetingEvent_(t, row, m) {
  if (!t.map['CalEventId']) return '';
  var cal = CalendarApp.getDefaultCalendar();
  var existing = str_(t.sheet.getRange(row, t.map['CalEventId']).getValue());
  if (existing) {
    try { var old = cal.getEventById(existing); if (old) old.deleteEvent(); } catch (e) {}
    writeRow_(t, row, { 'CalEventId': '' });
  }
  if (!m.date) return '';

  var day = safeDate_(m.date);
  if (!day) return '';
  var hm = String(m.time || '10:00').match(/^(\d{1,2}):(\d{2})/);
  var start = new Date(day.getFullYear(), day.getMonth(), day.getDate(),
    hm ? Number(hm[1]) : 10, hm ? Number(hm[2]) : 0, 0);
  var mins = num_(m.duration) || 45;
  var end = new Date(start.getTime() + mins * 60000);
  var ev = cal.createEvent(
    '📅 ' + (m.title || 'Meeting') + (m.leadName ? ' — ' + m.leadName : ''),
    start, end,
    { description: (m.notes || '') + '\n— Everstone Lead Tracker' }
  );
  try { ev.addPopupReminder(30); } catch (e) {}
  writeRow_(t, row, { 'CalEventId': ev.getId() });
  return 'booked';
}

// ═══════════════════════════════════════════════════════════════════════════
//  TELEGRAM
// ═══════════════════════════════════════════════════════════════════════════
function tgSend_(msg) {
  var token = cfg('TG_TOKEN'), chat = cfg('TG_CHAT_ID');
  if (!token || !chat) return false;
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chat, text: String(msg).slice(0, 4000), parse_mode: 'HTML' }),
      muteHttpExceptions: true
    });
    return true;
  } catch (e) {
    Logger.log('telegram failed: ' + e);
    return false;
  }
}

function tgSendApi_(text) {
  if (!text) return { success: false, error: 'Nothing to send' };
  if (!cfg('TG_TOKEN') || !cfg('TG_CHAT_ID')) {
    return { success: false, error: 'Telegram is not configured' };
  }
  return { success: tgSend_(text) };
}

// ═══════════════════════════════════════════════════════════════════════════
//  EMAIL
// ═══════════════════════════════════════════════════════════════════════════
function sendEmail_(to, subject, body, leadId) {
  if (!to || !subject || !body) return { success: false, error: 'Recipient, subject and body are all required' };
  try {
    var quota = MailApp.getRemainingDailyQuota();
    if (quota < 1) return { success: false, error: 'Daily email quota is used up. It resets at midnight PT.' };

    GmailApp.sendEmail(to, subject, body, {
      name: 'Nayemuzzaman — Everstone Digital',
      htmlBody: body.replace(/\n/g, '<br/>')
    });
    journal_(leadId || '', '', 'email_sent', 'email', '', to, 'app', subject);
    if (leadId) {
      var l = getLeadById_(leadId);
      writeTouch_({
        leadId: leadId, leadName: l ? l.name : '', type: 'email',
        at: new Date(), outcome: subject, notes: truncate_(body, 500),
        stageAtTime: l ? l.stage : '', actor: 'app', auto: true
      });
    }
    return { success: true, quotaLeft: quota - 1 };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  FILES
// ═══════════════════════════════════════════════════════════════════════════
function appFolder_() {
  var name = 'Everstone Lead Tracker';
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function uploadFile_(name, mimeType, dataB64, leadId) {
  if (!dataB64) return { success: false, error: 'No file data' };
  try {
    var bytes = Utilities.base64Decode(dataB64);
    var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', name || 'upload');
    var file = appFolder_().createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    if (leadId) {
      saveDoc_({ leadId: leadId, name: name, url: file.getUrl(), type: guessDocType_(name, mimeType) });
    }
    return { success: true, id: file.getId(), url: file.getUrl(), name: file.getName() };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function guessDocType_(name, mime) {
  var s = (String(name) + ' ' + String(mime)).toLowerCase();
  if (s.indexOf('image') >= 0 || /\.(png|jpe?g|webp|gif)$/.test(s)) return 'image';
  if (s.indexOf('pdf') >= 0) return 'pdf';
  if (s.indexOf('sheet') >= 0 || /\.(xlsx?|csv)$/.test(s)) return 'sheet';
  if (s.indexOf('presentation') >= 0 || /\.pptx?$/.test(s)) return 'deck';
  if (s.indexOf('word') >= 0 || /\.docx?$/.test(s)) return 'doc';
  return 'other';
}

function getLeadById_(id) {
  var t = leadsTable_();
  var row = findRowById_(t, id);
  return row < 0 ? null : leadToJson_(readOne_(t, row));
}

function daysSince_(iso) {
  if (!iso) return null;
  var d = safeDate_(iso);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function daysBetween_(from, to) {
  var a = safeDate_(from), b = safeDate_(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ═══════════════════════════════════════════════════════════════════════════
//  AI — model routing
// ═══════════════════════════════════════════════════════════════════════════
function modelFor_(kind) {
  var s = getSettings_();
  if (kind === 'vision') return cfg('MODEL_VISION');
  if (kind === 'power') return cfg('MODEL_POWER');
  if (kind === 'auto') return s.aiModel === 'power' ? cfg('MODEL_POWER') : cfg('MODEL_FAST');
  return cfg('MODEL_FAST');
}

function aiComplete_(messages, kind, maxTokens) {
  var key = cfg('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');

  var model = modelFor_(kind || 'auto');
  var res = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + key,
      'HTTP-Referer': 'https://everstonedigital-lead-tracker.netlify.app',
      'X-Title': 'Everstone Lead Tracker'
    },
    payload: JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: maxTokens || 2400,
      temperature: 0.6
    }),
    muteHttpExceptions: true
  });

  var text = res.getContentText();
  var j;
  try { j = JSON.parse(text); }
  catch (e) { throw new Error('AI returned an unreadable response (' + res.getResponseCode() + ')'); }

  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  if (!j.choices || !j.choices.length) throw new Error('AI returned no answer');
  return { text: j.choices[0].message.content || '', model: model, usage: j.usage || null };
}

/**
 * Only the leads the question is actually about go into the prompt. Sending the
 * whole sheet every time is what makes these assistants slow and expensive once
 * the sheet grows.
 */
function buildContext_(question, maxLeads) {
  var all = getAll_();
  var leads = all.leads.filter(function (l) { return l.status !== 'deleted' && l.status !== 'merged'; });
  var q = String(question || '').toLowerCase();
  var words = q.split(/\s+/).filter(function (w) { return w.length > 2; });

  function score(l) {
    var hay = (l.name + ' ' + l.site + ' ' + l.phone + ' ' + l.notes + ' ' +
      l.service + ' ' + l.stage + ' ' + l.contact).toLowerCase();
    var s = 0;
    words.forEach(function (w) { if (hay.indexOf(w) >= 0) s += 3; });
    if (l.priority === 'hot') s += 2;
    if (l.followup && l.followup <= today_()) s += 3;
    if ((all.settings.closedStages || []).indexOf(l.stage) >= 0) s -= 2;
    return s;
  }

  var ranked = leads.slice().sort(function (a, b) { return score(b) - score(a); });
  var picked = ranked.slice(0, maxLeads || 40);

  var compact = picked.map(function (l) {
    return {
      id: l.id, name: l.name, site: l.site, phone: l.phone, contact: l.contact,
      stage: l.stage, priority: l.priority, followup: l.followup, nextStep: l.nextStep,
      value: l.value, service: l.service, source: l.source, labels: l.labels,
      proposalSentAt: l.proposalSentAt, lastActivityAt: l.lastActivityAt,
      counts: l.counts, stagesVisited: l.stagesVisited,
      notes: String(l.notes || '').slice(0, 400),
      recent: (l.history || []).slice(-3)
    };
  });

  var closed = all.settings.closedStages || [];
  var summary = {
    totalLeads: leads.length,
    shown: compact.length,
    byStage: {},
    dueToday: leads.filter(function (l) { return l.followup && l.followup <= today_(); }).length,
    noNextStep: leads.filter(function (l) {
      return closed.indexOf(l.stage) < 0 && !l.followup;
    }).length,
    interactions: all.flow.touchTotals,
    openTasks: (all.tasks || []).filter(function (k) { return !k.done; }).length
  };
  leads.forEach(function (l) { summary.byStage[l.stage] = (summary.byStage[l.stage] || 0) + 1; });

  return 'TODAY: ' + today_() + '\nSUMMARY: ' + JSON.stringify(summary) +
    '\n\nRELEVANT LEADS (' + compact.length + ' of ' + leads.length + '):\n' + JSON.stringify(compact);
}

var AI_BASE_PERSONA =
  "You are Evo, the in-house assistant for Everstone Digital — an SEO and CRO agency in Bangladesh run by Nayemuzzaman.\n" +
  "You have live access to his lead pipeline.\n\n" +
  "How you write:\n" +
  "• Reply in the language the user wrote in. Bangla question, Bangla answer. English question, English answer.\n" +
  "• Anything meant for a client — email, WhatsApp, proposal text — is always in English, warm and professional, never pushy.\n" +
  "• Client messages lead with something specific about their business, then the value, then one clear ask.\n" +
  "• Plain text only. No markdown, no asterisks, no hash symbols.\n" +
  "• Be brief. Answer the question, then stop.\n" +
  "• Sign client-facing drafts with:\nNayemuzzaman\nSEO & CRO Strategist\nEverstone Digital\n\n" +
  "What you never do:\n" +
  "• Never invent a fact about a lead. If the sheet does not say it, say you do not know.\n" +
  "• Never guess an ID. Match a lead by name from the data you were given.\n" +
  "• If a request is ambiguous — which lead, which date — ask instead of acting.";

var AI_ACTION_PROTOCOL =
  "\n\nYou can change the pipeline through actions. Reply with JSON only, in exactly this shape:\n" +
  '{"reply":"<plain text for the user>","actions":[]}\n\n' +
  "Available actions:\n" +
  '{"type":"add_lead","name":"","phone":"","site":"","source":"","stage":"","priority":"hot|warm|cold","followup":"yyyy-MM-dd","nextStep":"","notes":"","value":0}\n' +
  '{"type":"update_lead","id":"","fields":{"stage":"","priority":"","followup":"yyyy-MM-dd","nextStep":"","notes":"","value":0}}\n' +
  '{"type":"add_note","id":"","note":""}\n' +
  '{"type":"book_meeting","leadId":"","title":"","date":"yyyy-MM-dd","time":"HH:mm","agenda":""}\n' +
  '{"type":"set_followup","id":"","date":"yyyy-MM-dd","nextStep":""}\n' +
  '{"type":"log_touch","leadId":"","touchType":"call|meeting|proposal|message|email|audit|visit","outcome":"","notes":""}\n' +
  '{"type":"create_task","text":"","due":"yyyy-MM-dd","leadId":""}\n' +
  '{"type":"create_memo","title":"","body":"","color":"#FFF3C4","pinned":false}\n' +
  '{"type":"send_telegram","text":""}\n\n' +
  "Deleting a lead and sending email are not yours to do — tell the user to use the button instead.\n" +
  "If no action is needed, actions must be an empty array.";

function aiSend_(b) {
  var chatId = b.chatId;
  var message = String(b.message || '').trim();
  if (!message && !(b.attachments && b.attachments.length)) {
    return { success: false, error: 'Nothing to send' };
  }

  try {
    if (!chatId) {
      var created = aiNewChat_(message.slice(0, 60));
      chatId = created.chat.id;
    }

    var settings = getSettings_();
    var custom = String(settings.aiInstructions || '').trim();
    var system = AI_BASE_PERSONA +
      (custom ? '\n\nStanding instructions from Nayem — these override anything above:\n' + custom : '') +
      (b.allowActions === false ? '' : AI_ACTION_PROTOCOL) +
      '\n\n' + (b.leadId ? buildLeadFocus_(b.leadId) : buildContext_(message));

    var msgs = [{ role: 'system', content: system }];
    var history = aiGetMessages_(chatId).messages || [];
    history.slice(-14).forEach(function (h) {
      msgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content });
    });

    // Images travel as content parts so a vision model can actually see them.
    var images = (b.attachments || []).filter(function (a) { return a.kind === 'image' && a.dataUrl; });
    if (images.length) {
      var parts = [{ type: 'text', text: message || 'What do you see here?' }];
      images.slice(0, 4).forEach(function (im) {
        parts.push({ type: 'image_url', image_url: { url: im.dataUrl } });
      });
      msgs.push({ role: 'user', content: parts });
    } else {
      var extra = (b.attachments || []).filter(function (a) { return a.text; })
        .map(function (a) { return '\n\n--- ' + (a.name || 'file') + ' ---\n' + String(a.text).slice(0, 12000); })
        .join('');
      msgs.push({ role: 'user', content: message + extra });
    }

    var kind = images.length ? 'vision' : (b.model || 'auto');
    var out = aiComplete_(msgs, kind, 2600);

    var reply = out.text, actions = [];
    var parsed = tryParseJson_(out.text);
    if (parsed && parsed.reply !== undefined) {
      reply = String(parsed.reply);
      actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    }

    var done = runAiActions_(actions);

    aiAddMessage_(chatId, 'user', message, JSON.stringify({ attachments: (b.attachments || []).length }));
    aiAddMessage_(chatId, 'assistant', reply, JSON.stringify({ model: out.model, done: done }));

    return { success: true, chatId: chatId, reply: reply, done: done, model: out.model };
  } catch (e) {
    return { success: false, error: String(e && e.message ? e.message : e) };
  }
}

function buildLeadFocus_(leadId) {
  var all = getAll_();
  var lead = null;
  all.leads.forEach(function (l) { if (l.id === String(leadId)) lead = l; });
  if (!lead) return buildContext_('');

  var meetings = all.meetings.filter(function (m) { return m.leadId === String(leadId); });
  var touches = all.touches.filter(function (x) { return x.leadId === String(leadId); });
  var acts = recentActivities_(4000).filter(function (a) { return a.leadId === String(leadId); }).slice(0, 40);

  return 'TODAY: ' + today_() +
    '\nYou are focused on ONE lead. Everything below is about this lead only.\n\n' +
    'LEAD:\n' + JSON.stringify(lead) +
    '\n\nMEETINGS:\n' + JSON.stringify(meetings) +
    '\n\nINTERACTIONS:\n' + JSON.stringify(touches) +
    '\n\nRECENT CHANGES:\n' + JSON.stringify(acts);
}

function tryParseJson_(text) {
  var s = String(text || '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch (e) {}
  var first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch (e) {}
  }
  return null;
}

function runAiActions_(actions) {
  var done = [];
  (actions || []).forEach(function (a) {
    try {
      if (a.type === 'add_lead') {
        var r = saveLead_({
          name: a.name, phone: a.phone, site: a.site, source: a.source || 'Ads',
          stage: a.stage || 'New', priority: a.priority || 'warm', followup: a.followup || '',
          nextStep: a.nextStep || '', notes: a.notes || '', value: a.value || 0, actor: 'evo'
        });
        done.push(r.success ? 'Added lead: ' + (a.name || a.phone) : 'Could not add lead: ' + r.error);

      } else if (a.type === 'update_lead') {
        var body = { id: a.id, actor: 'evo' };
        Object.keys(a.fields || {}).forEach(function (k) { body[k] = a.fields[k]; });
        var r2 = saveLead_(body);
        done.push(r2.success ? 'Updated ' + (r2.lead ? r2.lead.name : a.id) : 'Update failed: ' + r2.error);

      } else if (a.type === 'set_followup') {
        var r3 = saveLead_({ id: a.id, followup: a.date, nextStep: a.nextStep || '', actor: 'evo' });
        done.push(r3.success ? 'Follow-up set for ' + a.date : 'Failed: ' + r3.error);

      } else if (a.type === 'add_note') {
        var cur = getLeadById_(a.id);
        if (!cur) { done.push('Lead not found'); return; }
        var hist = (cur.history || []).concat([
          Utilities.formatDate(new Date(), TZ, 'd MMM') + ': ' + a.note + ' (Evo)'
        ]);
        var r4 = saveLead_({ id: a.id, history: hist, actor: 'evo' });
        done.push(r4.success ? 'Note added' : 'Failed: ' + r4.error);

      } else if (a.type === 'book_meeting') {
        var r5 = saveMeeting_({
          leadId: a.leadId || '', title: a.title || 'Meeting', date: a.date,
          time: a.time || '11:00', agenda: a.agenda || '', platform: 'google', status: 'upcoming'
        });
        done.push(r5.success ? 'Meeting booked ' + a.date + ' ' + (a.time || '') : 'Failed: ' + r5.error);

      } else if (a.type === 'log_touch') {
        var r6 = logTouch_({
          leadId: a.leadId, type: a.touchType || 'note',
          outcome: a.outcome || '', notes: a.notes || '', actor: 'evo'
        });
        done.push(r6.success ? 'Logged a ' + (a.touchType || 'note') : 'Failed: ' + r6.error);

      } else if (a.type === 'create_task') {
        var r7 = saveTask_({ text: a.text, due: a.due || '', leadId: a.leadId || '' });
        done.push(r7.success ? 'Task added: ' + truncate_(a.text, 40) : 'Failed: ' + r7.error);

      } else if (a.type === 'create_memo') {
        var r8 = saveNote_({
          title: a.title || '', body: a.body || '',
          color: a.color || '#FFF3C4', pinned: !!a.pinned
        });
        done.push(r8.success ? 'Note saved: ' + truncate_(a.title || a.body, 40) : 'Failed: ' + r8.error);

      } else if (a.type === 'send_telegram') {
        done.push(tgSend_(a.text) ? 'Sent to Telegram' : 'Telegram not configured');
      }
    } catch (e) {
      done.push('Action failed: ' + e);
    }
  });
  return done;
}

// ─── chat storage ───
function aiNewChat_(title) {
  var t = chatsTable_();
  var id = genId_('C');
  var clean = String(title || 'New chat').slice(0, 80);
  appendRow_(t, {
    'ID': id, 'Title': clean,
    'Created At': new Date(), 'Updated At': new Date(), 'Pinned': '', 'Status': 'active'
  });
  return { success: true, chat: { id: id, title: clean, createdAt: nowIso_(), updatedAt: nowIso_(), pinned: false } };
}

function aiListChats_() {
  var t = chatsTable_();
  var chats = readAll_(t)
    .filter(function (r) { return r['ID'] && String(r['Status']).toLowerCase() !== 'deleted'; })
    .map(function (r) {
      return {
        id: String(r['ID']), title: str_(r['Title']) || 'Untitled',
        createdAt: iso_(r['Created At']), updatedAt: iso_(r['Updated At']),
        pinned: truthy_(r['Pinned'])
      };
    })
    .sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  return { success: true, chats: chats };
}

function aiGetMessages_(chatId) {
  if (!chatId) return { success: true, messages: [] };
  var t = messagesTable_();
  var msgs = readAll_(t)
    .filter(function (r) { return String(r['Chat ID']) === String(chatId); })
    .map(function (r) {
      var meta = null;
      try { meta = r['Meta'] ? JSON.parse(r['Meta']) : null; } catch (e) {}
      return {
        id: String(r['ID']), role: str_(r['Role']) || 'user',
        content: String(r['Content'] === null || r['Content'] === undefined ? '' : r['Content']),
        meta: meta, createdAt: iso_(r['Created At'])
      };
    })
    .sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); });
  return { success: true, messages: msgs };
}

function aiAddMessage_(chatId, role, content, meta) {
  var t = messagesTable_();
  appendRow_(t, {
    'ID': genId_('MSG'), 'Chat ID': String(chatId), 'Role': role,
    'Content': truncate_(content, 45000), 'Meta': meta || '', 'Created At': new Date()
  });
  var ct = chatsTable_();
  var row = findRowById_(ct, chatId);
  if (row > 0) writeRow_(ct, row, { 'Updated At': new Date() });
}

function aiRenameChat_(chatId, title) {
  var t = chatsTable_();
  var row = findRowById_(t, chatId);
  if (row < 0) return { success: false, error: 'Chat not found' };
  writeRow_(t, row, { 'Title': String(title || 'Untitled').slice(0, 80), 'Updated At': new Date() });
  return { success: true };
}

function aiDeleteChat_(chatId) {
  var t = chatsTable_();
  var row = findRowById_(t, chatId);
  if (row < 0) return { success: false, error: 'Chat not found' };
  writeRow_(t, row, { 'Status': 'deleted', 'Updated At': new Date() });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
//  AI — website audit
// ═══════════════════════════════════════════════════════════════════════════
function aiAudit_(url, leadId, model) {
  if (!url) return { success: false, error: 'No URL supplied' };
  var target = normalizeUrl_(url);

  var page = fetchPage_(target);
  if (!page.ok) return { success: false, error: 'Could not load the page: ' + page.error };

  var speed = pageSpeed_(target);

  var prompt =
    'Audit this website for a prospective SEO client. Be concrete and honest — no filler, no invented metrics.\n\n' +
    'URL: ' + target + '\n' +
    'HTTP status: ' + page.status + '\n' +
    'Title: ' + page.title + '\n' +
    'Meta description: ' + page.description + '\n' +
    'H1s: ' + JSON.stringify(page.h1s) + '\n' +
    'H2s: ' + JSON.stringify(page.h2s.slice(0, 12)) + '\n' +
    'Word count: ' + page.wordCount + '\n' +
    'Images without alt: ' + page.imgNoAlt + ' of ' + page.imgTotal + '\n' +
    'Internal links: ' + page.internalLinks + ' · External: ' + page.externalLinks + '\n' +
    'Has viewport tag: ' + page.hasViewport + ' · Has canonical: ' + page.hasCanonical + '\n' +
    'Has schema.org markup: ' + page.hasSchema + ' · Has Open Graph: ' + page.hasOg + '\n' +
    'HTML size: ' + page.bytes + ' bytes\n' +
    (speed.ok
      ? 'PageSpeed (mobile): performance ' + speed.performance + ', SEO ' + speed.seo +
        ', accessibility ' + speed.accessibility + ', LCP ' + speed.lcp + ', CLS ' + speed.cls + '\n'
      : 'PageSpeed: unavailable (' + speed.error + ')\n') +
    (page.jsHeavy ? '\nNote: this page renders most content with JavaScript, so the visible text above is thin. Say so in the audit rather than assuming the page is empty.\n' : '') +
    '\nVisible text (first 6000 chars):\n' + page.text.slice(0, 6000) +
    '\n\nWrite the audit in English, plain text, in this order:\n' +
    '1. What this business appears to do (one short paragraph)\n' +
    '2. The five problems costing them the most traffic or conversions, each with why it matters in business terms\n' +
    '3. Quick wins achievable in two weeks\n' +
    '4. What needs a longer engagement\n' +
    '5. One paragraph Nayem can paste into an outreach email — specific to this site, no generic flattery\n' +
    'Do not invent traffic numbers, rankings or revenue figures. Only use what is above.';

  try {
    var out = aiComplete_([
      { role: 'system', content: AI_BASE_PERSONA },
      { role: 'user', content: prompt }
    ], model || 'power', 3200);

    if (leadId) {
      var l = getLeadById_(leadId);
      journal_(leadId, l ? l.name : '', 'audit', 'audit', '', target, 'evo', 'Website audit generated');
      writeTouch_({
        leadId: leadId, leadName: l ? l.name : '', type: 'audit', at: new Date(),
        outcome: 'Website audit', notes: target, stageAtTime: l ? l.stage : '',
        actor: 'evo', auto: true
      });
    }
    return {
      success: true, url: target, audit: out.text, model: out.model,
      signals: { page: page, speed: speed }
    };
  } catch (e) {
    return { success: false, error: String(e && e.message ? e.message : e) };
  }
}

function normalizeUrl_(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  return s;
}

function fetchPage_(url) {
  try {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: false,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EverstoneAudit/1.0)' }
    });
    var status = res.getResponseCode();
    var html = res.getContentText();

    function pick(re) { var m = html.match(re); return m ? m[1].trim() : ''; }
    function all(re) {
      var out = [], m;
      var r = new RegExp(re.source, 'gi');
      while ((m = r.exec(html)) !== null) out.push(stripTags_(m[1]).trim());
      return out.filter(Boolean);
    }

    var body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                   .replace(/<style[\s\S]*?<\/style>/gi, ' ');
    var text = stripTags_(body).replace(/\s+/g, ' ').trim();
    var imgs = html.match(/<img[^>]*>/gi) || [];
    var noAlt = imgs.filter(function (i) { return !/alt\s*=\s*["'][^"']+["']/i.test(i); }).length;
    var links = html.match(/<a[^>]+href\s*=\s*["']([^"']+)["']/gi) || [];
    var host = url.replace(/^https?:\/\//, '').split('/')[0];
    var internal = 0, external = 0;
    links.forEach(function (l) {
      var m = l.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!m) return;
      var h = m[1];
      if (/^https?:\/\//i.test(h)) { if (h.indexOf(host) >= 0) internal++; else external++; }
      else if (h.charAt(0) === '/' || h.charAt(0) === '.') internal++;
    });

    var words = text ? text.split(/\s+/).length : 0;

    return {
      ok: true, status: status, bytes: html.length,
      title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i),
      description: pick(/<meta[^>]+name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i),
      h1s: all(/<h1[^>]*>([\s\S]*?)<\/h1>/i),
      h2s: all(/<h2[^>]*>([\s\S]*?)<\/h2>/i),
      wordCount: words,
      imgTotal: imgs.length, imgNoAlt: noAlt,
      internalLinks: internal, externalLinks: external,
      hasViewport: /name\s*=\s*["']viewport["']/i.test(html),
      hasCanonical: /rel\s*=\s*["']canonical["']/i.test(html),
      hasSchema: /application\/ld\+json/i.test(html) || /itemscope/i.test(html),
      hasOg: /property\s*=\s*["']og:/i.test(html),
      jsHeavy: words < 220 && html.length > 40000,
      text: text
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function stripTags_(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function pageSpeed_(url) {
  try {
    var api = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed' +
      '?url=' + encodeURIComponent(url) +
      '&strategy=mobile&category=performance&category=seo&category=accessibility';
    var res = UrlFetchApp.fetch(api, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { ok: false, error: 'HTTP ' + res.getResponseCode() };
    var j = JSON.parse(res.getContentText());
    var cats = (j.lighthouseResult && j.lighthouseResult.categories) || {};
    var audits = (j.lighthouseResult && j.lighthouseResult.audits) || {};
    function pct(c) { return c && c.score !== null ? Math.round(c.score * 100) : '—'; }
    return {
      ok: true,
      performance: pct(cats.performance),
      seo: pct(cats.seo),
      accessibility: pct(cats.accessibility),
      lcp: audits['largest-contentful-paint'] ? audits['largest-contentful-paint'].displayValue : '—',
      cls: audits['cumulative-layout-shift'] ? audits['cumulative-layout-shift'].displayValue : '—'
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  AI — email draft
// ═══════════════════════════════════════════════════════════════════════════
function aiDraftEmail_(leadId, brief, model) {
  var lead = leadId ? getLeadById_(leadId) : null;
  if (leadId && !lead) return { success: false, error: 'Lead not found' };

  var meetings = [];
  if (lead) {
    meetings = getAll_().meetings.filter(function (m) { return m.leadId === lead.id; });
  }

  var prompt =
    'Write a cold or follow-up email for this prospect. English only.\n\n' +
    (lead ? 'LEAD:\n' + JSON.stringify(lead) + '\n\nMEETINGS:\n' + JSON.stringify(meetings) + '\n\n' : '') +
    (brief ? 'What Nayem wants this email to do:\n' + brief + '\n\n' : '') +
    'Rules:\n' +
    '• Subject line under 60 characters, specific, no clickbait, no "Quick question".\n' +
    '• Open with something true about THEIR business, taken from the data above.\n' +
    '• One clear problem, one clear outcome, one clear ask.\n' +
    '• Under 150 words. No bullet lists unless it genuinely reads better.\n' +
    '• No invented statistics.\n\n' +
    'Reply as JSON only: {"subject":"...","body":"..."}';

  try {
    var out = aiComplete_([
      { role: 'system', content: AI_BASE_PERSONA },
      { role: 'user', content: prompt }
    ], model || 'power', 1200);

    var parsed = tryParseJson_(out.text);
    if (!parsed || !parsed.body) {
      return { success: true, subject: '', body: out.text, model: out.model };
    }
    return { success: true, subject: parsed.subject || '', body: parsed.body, model: out.model };
  } catch (e) {
    return { success: false, error: String(e && e.message ? e.message : e) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  AI — document export (DOCX / PPTX / XLSX / PDF)
// ═══════════════════════════════════════════════════════════════════════════
function aiExport_(title, content, format) {
  var name = String(title || 'Everstone Document').slice(0, 90);
  var fmt = String(format || 'pdf').toLowerCase();
  var folder = appFolder_();

  try {
    var fileId, exportMime, ext;

    if (fmt === 'pptx') {
      fileId = buildDeck_(name, content);
      exportMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      ext = 'pptx';
    } else if (fmt === 'xlsx') {
      fileId = buildSheet_(name, content);
      exportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      ext = 'xlsx';
    } else {
      fileId = buildDoc_(name, content);
      if (fmt === 'pdf') { exportMime = 'application/pdf'; ext = 'pdf'; }
      else { exportMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; ext = 'docx'; }
    }

    var url = 'https://www.googleapis.com/drive/v3/files/' + fileId +
      '/export?mimeType=' + encodeURIComponent(exportMime);
    var res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      return { success: false, error: 'Export failed (' + res.getResponseCode() + ')' };
    }

    var blob = res.getBlob().setName(name + '.' + ext);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // The editable original is scratch work; only the exported file is kept.
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}

    return { success: true, url: file.getUrl(), download: file.getDownloadUrl(), name: file.getName() };
  } catch (e) {
    return { success: false, error: String(e && e.message ? e.message : e) };
  }
}

function buildDoc_(name, content) {
  var doc = DocumentApp.create(name);
  var body = doc.getBody();
  body.clear();
  body.appendParagraph(name).setHeading(DocumentApp.ParagraphHeading.TITLE);

  String(content || '').split(/\n/).forEach(function (line) {
    var s = line.trim();
    if (!s) { body.appendParagraph(''); return; }
    var h = s.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      var level = h[1].length;
      body.appendParagraph(h[2]).setHeading(
        level === 1 ? DocumentApp.ParagraphHeading.HEADING1 :
        level === 2 ? DocumentApp.ParagraphHeading.HEADING2 :
                      DocumentApp.ParagraphHeading.HEADING3);
    } else if (/^[-•*]\s+/.test(s)) {
      body.appendListItem(s.replace(/^[-•*]\s+/, '')).setGlyphType(DocumentApp.GlyphType.BULLET);
    } else if (/^\d+[.)]\s+/.test(s)) {
      body.appendListItem(s.replace(/^\d+[.)]\s+/, '')).setGlyphType(DocumentApp.GlyphType.NUMBER);
    } else {
      body.appendParagraph(s);
    }
  });

  doc.saveAndClose();
  return doc.getId();
}

function buildDeck_(name, content) {
  var deck = SlidesApp.create(name);
  var slides = deck.getSlides();
  var title = slides[0];
  var ph = title.getPlaceholders();
  if (ph.length) ph[0].asShape().getText().setText(name);
  if (ph.length > 1) ph[1].asShape().getText().setText('Everstone Digital');

  // Blank lines separate slides; the first line of each block is its heading.
  String(content || '').split(/\n\s*\n/).forEach(function (block) {
    var lines = block.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return;
    var slide = deck.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
    var p = slide.getPlaceholders();
    if (p.length) p[0].asShape().getText().setText(lines[0].replace(/^#+\s*/, ''));
    if (p.length > 1) {
      p[1].asShape().getText().setText(
        lines.slice(1).map(function (l) { return l.replace(/^[-•*]\s*/, '• '); }).join('\n') || ' '
      );
    }
  });

  deck.saveAndClose();
  return deck.getId();
}

function buildSheet_(name, content) {
  var book = SpreadsheetApp.create(name);
  var sheet = book.getSheets()[0];
  var rows = String(content || '').split(/\n/)
    .filter(function (l) { return l.trim(); })
    .map(function (l) { return l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(function (c) { return c.replace(/^"|"$/g, '').trim(); }); });

  if (!rows.length) rows = [['(empty)']];
  var width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  rows = rows.map(function (r) {
    while (r.length < width) r.push('');
    return r;
  });

  sheet.getRange(1, 1, rows.length, width).setValues(rows);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#12201D').setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
  return book.getId();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCHEDULED JOBS
// ═══════════════════════════════════════════════════════════════════════════
function dailyDigest() {
  var data = getAll_();
  var s = data.settings;
  var closed = s.closedStages || ['Hired', 'Dead'];
  var today = today_();

  var open = data.leads.filter(function (l) {
    return l.status !== 'deleted' && l.status !== 'merged' && closed.indexOf(l.stage) < 0;
  });

  var due = open.filter(function (l) { return l.followup && l.followup <= today; });
  var noNext = open.filter(function (l) { return !l.followup; });
  var meetsToday = data.meetings.filter(function (m) {
    return m.date === today && m.status !== 'cancelled' && m.status !== 'deleted';
  });

  var stale = open.filter(function (l) {
    var d = daysSince_(l.lastActivityAt);
    return d !== null && d >= (s.rotting ? s.rotting.staleDays : 30);
  });

  var proposalsWaiting = open.filter(function (l) {
    return l.proposalSentAt && l.stage === 'Proposal';
  });

  var tasksDue = (data.tasks || []).filter(function (k) {
    return !k.done && k.due && k.due <= today;
  });

  if (!due.length && !meetsToday.length && !noNext.length && !stale.length && !tasksDue.length) return;

  var msg = '🌅 <b>Everstone — ' + Utilities.formatDate(new Date(), TZ, 'EEEE, d MMMM') + '</b>\n';

  if (meetsToday.length) {
    msg += '\n📅 <b>Meetings today (' + meetsToday.length + ')</b>\n';
    meetsToday.sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
    meetsToday.forEach(function (m) {
      msg += '  ' + (m.time || 'TBD') + ' — ' + esc_(m.title) + '\n';
    });
  }

  if (due.length) {
    msg += '\n⏰ <b>Follow-ups due (' + due.length + ')</b>\n';
    due.slice(0, 12).forEach(function (l) {
      var dot = l.priority === 'hot' ? '🔴' : l.priority === 'warm' ? '🟡' : '⚪';
      var late = l.followup < today ? ' <i>(' + daysBetween_(l.followup, today) + 'd late)</i>' : '';
      msg += '  ' + dot + ' <b>' + esc_(l.name) + '</b> — ' + esc_(l.phone || '—') + late + '\n';
      if (l.nextStep) msg += '     ↳ ' + esc_(l.nextStep) + '\n';
    });
    if (due.length > 12) msg += '  ...and ' + (due.length - 12) + ' more\n';
  }

  if (tasksDue.length) {
    msg += '\n✅ <b>Tasks due (' + tasksDue.length + ')</b>\n';
    tasksDue.slice(0, 8).forEach(function (k) { msg += '  ' + esc_(truncate_(k.text, 70)) + '\n'; });
  }

  if (proposalsWaiting.length) {
    msg += '\n📄 <b>Proposals waiting (' + proposalsWaiting.length + ')</b>\n';
    proposalsWaiting.slice(0, 8).forEach(function (l) {
      msg += '  ' + esc_(l.name) + ' — sent ' + daysBetween_(l.proposalSentAt, today) + ' days ago\n';
    });
  }

  if (noNext.length) {
    msg += '\n⚠️ <b>No next step (' + noNext.length + ')</b>\n';
    noNext.slice(0, 8).forEach(function (l) { msg += '  ' + esc_(l.name) + '\n'; });
    if (noNext.length > 8) msg += '  ...and ' + (noNext.length - 8) + ' more\n';
  }

  if (stale.length) {
    msg += '\n🥶 <b>Gone quiet (' + stale.length + ')</b>\n';
    stale.slice(0, 6).forEach(function (l) {
      msg += '  ' + esc_(l.name) + ' — ' + daysSince_(l.lastActivityAt) + ' days\n';
    });
  }

  tgSend_(msg);
}

function weeklyReview() {
  var data = getAll_();
  var leads = data.leads.filter(function (l) { return l.status !== 'deleted' && l.status !== 'merged'; });
  var acts = recentActivities_(4000);
  var weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  var weekAgo = weekAgoIso.slice(0, 10);

  var thisWeek = acts.filter(function (a) { return a.at >= weekAgoIso; });
  var added = thisWeek.filter(function (a) { return a.type === 'created'; }).length;

  var touchesWeek = (data.touches || []).filter(function (t) { return t.at >= weekAgoIso; });
  function countType(k) { return touchesWeek.filter(function (t) { return t.type === k; }).length; }

  var meetingsHeld = data.meetings.filter(function (m) {
    return m.status === 'done' && m.date >= weekAgo;
  }).length;
  var proposals = leads.filter(function (l) { return l.proposalSentAt && l.proposalSentAt >= weekAgo; }).length;

  var closed = data.settings.closedStages || ['Hired', 'Dead'];
  var won = ['Hired', 'Nayem Client'];
  var hired = leads.filter(function (l) { return won.indexOf(l.stage) >= 0; });
  var revenue = hired.reduce(function (s, l) { return s + l.value; }, 0);
  var pipeline = leads.filter(function (l) { return closed.indexOf(l.stage) < 0; })
    .reduce(function (s, l) { return s + l.value; }, 0);

  var lost = leads.filter(function (l) { return l.stage === 'Dead' && l.lostReason; });
  var reasons = {};
  lost.forEach(function (l) { reasons[l.lostReason] = (reasons[l.lostReason] || 0) + 1; });
  var topReason = Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a]; })[0];

  var totals = data.flow.touchTotals || {};
  function everCount(k) { return (totals[k] && totals[k].leads) || 0; }

  var msg = '📊 <b>Everstone — week in review</b>\n\n' +
    '<b>What you did this week</b>\n' +
    '  New leads: ' + added + '\n' +
    '  Calls: ' + countType('call') + '\n' +
    '  Meetings held: ' + meetingsHeld + '\n' +
    '  Proposals sent: ' + proposals + '\n' +
    '  Messages: ' + countType('message') + '\n\n' +
    '<b>All time</b>\n' +
    '  Leads ever called: ' + everCount('call') + '\n' +
    '  Leads ever met: ' + everCount('meeting') + '\n' +
    '  Leads ever sent a proposal: ' + everCount('proposal') + '\n\n' +
    '<b>Where things stand</b>\n' +
    '  Open pipeline: ৳' + pipeline.toLocaleString() + '\n' +
    '  Signed to date: ' + hired.length + ' · ৳' + revenue.toLocaleString() + '\n' +
    '  Win rate: ' + (leads.length ? Math.round(hired.length / leads.length * 100) : 0) + '%\n';

  if (topReason) msg += '\n<b>Most common loss reason:</b> ' + esc_(topReason) + ' (' + reasons[topReason] + ')';

  tgSend_(msg);
}

function aiDailyBrief() {
  try {
    var ctx = buildContext_('today follow-up overdue proposal', 60);
    var prompt =
      'Read the pipeline below and write my morning brief.\n\n' + ctx + '\n\n' +
      'Return JSON only:\n' +
      '{"digest":"<Bangla, under 900 characters, what I should do today and why, in priority order>",' +
      '"setFollowups":[{"id":"","date":"yyyy-MM-dd","reason":""}],' +
      '"drafts":[{"id":"","name":"","message":"<English WhatsApp message, under 60 words>"}]}\n\n' +
      'Only put a lead in setFollowups when the notes clearly imply a date and the lead has none. ' +
      'At most 5 drafts, only for leads due today. Never invent facts.';

    var out = aiComplete_([{ role: 'system', content: AI_BASE_PERSONA }, { role: 'user', content: prompt }], 'auto', 2600);
    var parsed = tryParseJson_(out.text);

    if (!parsed) {
      tgSend_('🤖 <b>Morning brief</b>\n\n' + esc_(out.text.slice(0, 3500)));
      return;
    }

    var applied = [];
    (parsed.setFollowups || []).forEach(function (a) {
      if (!a.id || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) return;
      var r = saveLead_({ id: a.id, followup: a.date, nextStep: a.reason || '', actor: 'evo', logTouch: false });
      if (r.success) applied.push(r.lead.name + ' → ' + a.date);
    });

    var msg = '🤖 <b>Morning brief</b>\n' +
      Utilities.formatDate(new Date(), TZ, 'EEEE, d MMMM') + '\n\n' + esc_(parsed.digest || '');
    if (applied.length) {
      msg += '\n\n✅ <b>Follow-ups I set for you</b>\n' +
        applied.map(function (x) { return '  ' + esc_(x); }).join('\n');
    }
    tgSend_(msg);

    (parsed.drafts || []).slice(0, 5).forEach(function (d) {
      tgSend_('✍️ <b>Draft — ' + esc_(d.name || d.id) + '</b>\n\n' + esc_(d.message));
    });
  } catch (e) {
    tgSend_('🤖 Morning brief failed: ' + esc_(String(e)));
  }
}

/** Fires reminders that were set on notes and tasks. */
function reminderSweep() {
  try {
    var now = new Date();
    var soon = new Date(now.getTime() + 60 * 60000);

    var notes = readAll_(notesTable_())
      .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
      .map(noteToJson_)
      .filter(function (n) {
        if (!n.reminderAt) return false;
        var d = safeDate_(n.reminderAt);
        return d && d >= now && d <= soon;
      });

    notes.forEach(function (n) {
      tgSend_('🔔 <b>Note reminder</b>\n' + esc_(n.title || truncate_(n.body, 200)));
    });

    var today = today_();
    var tasks = readAll_(tasksTable_())
      .filter(function (r) { return r['ID'] !== '' && String(r['Status']).toLowerCase() !== 'deleted'; })
      .map(taskToJson_)
      .filter(function (k) { return !k.done && k.due === today; });

    if (tasks.length) {
      tgSend_('✅ <b>Due today (' + tasks.length + ')</b>\n' +
        tasks.slice(0, 10).map(function (k) { return '  • ' + esc_(truncate_(k.text, 80)); }).join('\n'));
    }
  } catch (e) {
    Logger.log('reminder sweep failed: ' + e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BACKUP, EXPORT, INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════
function dailyBackup() { makeBackup_(); }

function makeBackup_() {
  var book = ss_();
  var folderName = 'Everstone Lead Tracker — Backups';
  var it = DriveApp.getFoldersByName(folderName);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);

  var stamp = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HHmm');
  var copy = DriveApp.getFileById(book.getId()).makeCopy('Leads backup ' + stamp, folder);

  // Keep the window tight so Drive does not fill up with a year of copies.
  // Safety copies taken before a schema change are never swept.
  var cutoff = Date.now() - BACKUP_KEEP_DAYS * 86400000;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf('Pre-v') === 0) continue;
    if (f.getDateCreated().getTime() < cutoff) {
      try { f.setTrashed(true); } catch (e) {}
    }
  }
  return copy.getName();
}

/** A single JSON file with everything in it, for keeping outside Google. */
function exportSnapshot_() {
  var data = getAll_();
  return {
    success: true,
    exportedAt: new Date().toISOString(),
    version: APP_VERSION,
    schema: SCHEMA_VERSION,
    counts: {
      leads: data.leads.length, meetings: data.meetings.length, docs: data.docs.length,
      notes: data.notes.length, tasks: data.tasks.length, touches: data.touches.length
    },
    data: data
  };
}

/**
 * Looks for the shapes of damage that matter: two rows claiming the same id,
 * rows with no id at all, children pointing at leads that no longer exist, and
 * leads sitting on a stage that is not in Settings.
 */
function verifyIntegrity_() {
  var problems = [];

  var lt = leadsTable_();
  var leads = readAll_(lt);
  var seen = {}, blank = 0, dupIds = [];
  var liveIds = {};
  leads.forEach(function (r) {
    var id = String(r['ID'] || '');
    if (!id) { blank++; return; }
    if (seen[id]) dupIds.push(id); else seen[id] = r._row;
    liveIds[id] = true;
  });
  if (blank) problems.push({ level: 'warn', what: blank + ' lead row(s) have no ID' });
  if (dupIds.length) problems.push({ level: 'error', what: 'Duplicate lead IDs: ' + dupIds.slice(0, 10).join(', ') });

  LEAD_COLS.forEach(function (c) {
    if (!lt.map[c]) problems.push({ level: 'error', what: 'Leads is missing the column "' + c + '"' });
  });

  [[meetingsTable_(), 'Meetings'], [docsTable_(), 'Documents'],
   [touchesTable_(), 'Touches'], [notesTable_(), 'Notes'], [tasksTable_(), 'Tasks']]
  .forEach(function (pair) {
    var orphans = 0;
    readAll_(pair[0]).forEach(function (r) {
      var lid = String(r['Lead ID'] || '');
      if (lid && !liveIds[lid]) orphans++;
    });
    if (orphans) problems.push({ level: 'warn', what: orphans + ' row(s) in ' + pair[1] + ' point at a lead that no longer exists' });
  });

  var known = {};
  (getSettings_().stages || []).forEach(function (s) { known[s.name] = true; });
  var unknownStages = {};
  leads.forEach(function (r) {
    var st = String(r['Stage'] || '');
    if (st && !known[st]) unknownStages[st] = (unknownStages[st] || 0) + 1;
  });
  Object.keys(unknownStages).forEach(function (s) {
    problems.push({ level: 'info', what: unknownStages[s] + ' lead(s) on stage "' + s + '", which is not in Settings' });
  });

  var dupes = findDuplicates_();
  if (dupes.count) {
    problems.push({ level: 'info', what: dupes.count + ' possible duplicate group(s) — merge them from the Leads page' });
  }

  return {
    success: true,
    ok: problems.filter(function (p) { return p.level === 'error'; }).length === 0,
    problems: problems,
    leads: leads.length,
    schema: SCHEMA_VERSION
  };
}

/**
 * One-click repair for the "Duplicate lead IDs" error the health check reports.
 * Real duplicate IDs happen when a row was copy/pasted inside the sheet instead
 * of created through the app — the paste copies the ID cell along with
 * everything else. findRowById_() always returns the *first* row matching a
 * given ID, so a second row sharing that ID is invisible to saveLead, delete,
 * touches, and — importantly — mergeLeads: if two rows have the literal same
 * ID string, mergeLeadsLocked_ treats the second as "already itself" and
 * silently skips it, so trying to merge them from the Leads page does nothing.
 *
 * This does not merge or delete anything. It keeps the first row for each
 * duplicated ID untouched and gives every later row sharing that ID a fresh,
 * guaranteed-unique one, so every row is independently addressable again.
 * Safe to run more than once — a sheet with no duplicate IDs is a no-op.
 * Once IDs are unique, "Find duplicates" on the Leads page can correctly
 * detect and merge any of these that turn out to be the same real lead.
 */
function fixDuplicateLeadIds_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_MS)) return { success: false, error: 'Sheet is busy, please retry' };
  try {
    var t = leadsTable_();
    var rows = readAll_(t).filter(function (r) { return r['ID'] !== ''; });
    var seen = {}, fixed = [];
    rows.forEach(function (r) {
      var id = String(r['ID']);
      if (!seen[id]) { seen[id] = true; return; }
      var fresh = genId_('L');
      while (seen[fresh]) fresh = genId_('L');
      seen[fresh] = true;
      writeRow_(t, r._row, { 'ID': fresh });
      fixed.push({ row: r._row, name: r['Name'] || '(untitled)', oldId: id, newId: fresh });
    });
    return { success: true, fixed: fixed };
  } finally {
    lock.releaseLock();
  }
}

function fixDuplicateIdsMenu() {
  var r = fixDuplicateLeadIds_();
  var ui = SpreadsheetApp.getUi();
  if (!r.success) { ui.alert('Could not fix duplicate IDs: ' + r.error); return; }
  if (!r.fixed.length) { ui.alert('No duplicate lead IDs found.'); return; }
  ui.alert(
    'Gave ' + r.fixed.length + ' row(s) a new ID (the first row with each ID keeps its old one):\n\n' +
    r.fixed.map(function (f) { return 'Row ' + f.row + ' "' + f.name + '": ' + f.oldId + ' → ' + f.newId; }).join('\n') +
    '\n\nIf any of these turn out to be the same real lead as another row, open the dashboard, ' +
    'go to the Leads page, and use "Find duplicates" to merge them now that they have distinct IDs.'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETUP + MENU
// ═══════════════════════════════════════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Lead Tracker')
    .addItem('1 Run first-time setup', 'firstRun')
    .addItem('2 Move secrets into Script Properties', 'migrateSecrets')
    .addSeparator()
    .addItem('Send morning brief now', 'aiDailyBrief')
    .addItem('Send daily digest now', 'dailyDigest')
    .addItem('Send weekly review now', 'weeklyReview')
    .addSeparator()
    .addItem('Back up now', 'backupNowMenu')
    .addItem('Check everything is healthy', 'verifyMenu')
    .addItem('Fix duplicate lead IDs', 'fixDuplicateIdsMenu')
    .addItem('Recount interaction totals', 'recountMenu')
    .addItem('Repair #ERROR! cells', 'repairErrorCells')
    .addItem('Show setup status', 'showStatus')
    .addToUi();
}

function firstRun() {
  var ui = SpreadsheetApp.getUi();
  _tableCache = {};
  leadsTable_(); meetingsTable_(); docsTable_(); activityTable_();
  notesTable_(); tasksTable_(); touchesTable_(); stagesTable_();
  chatsTable_(); messagesTable_(); configTable_();
  ss_().setSpreadsheetTimeZone(TZ);

  var lt = leadsTable_();
  ['Name', 'Website', 'Phone', 'WhatsApp', 'Email', 'Contact Person'].forEach(function (c) {
    if (lt.map[c]) lt.sheet.getRange(2, lt.map[c], Math.max(lt.sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });

  backfillV6_();
  installTriggers_();

  var missing = [];
  ['APP_PASSWORD'].forEach(function (k) { if (!cfg(k)) missing.push(k); });

  ui.alert(
    'Setup complete — v' + APP_VERSION + '\n\n' +
    'Sheets ready: Leads, Meetings, Documents, Activities, Notes, Tasks, Touches, StageEvents, AIChats, AIMessages, Config\n' +
    'Triggers installed: morning brief, daily digest, weekly review, reminders, nightly backup\n' +
    (missing.length ? '\n⚠️ Still missing in Script Properties: ' + missing.join(', ') + '\n' : '') +
    '\nNext: Deploy → New deployment → Web app\n' +
    'Execute as: Me · Who has access: Anyone\n' +
    'Then paste the /exec URL into the dashboard.'
  );
}

/**
 * Gives every pre-v6 lead the fields v6 relies on, without touching anything
 * that already has a value. Safe to run more than once.
 */
function backfillV6_() {
  var t = leadsTable_();
  var rows = readAll_(t).filter(function (r) { return r['ID'] !== ''; });
  var order = 10;
  rows.forEach(function (r) {
    var patch = {};
    if (r['Sort Order'] === '' || r['Sort Order'] === null || r['Sort Order'] === undefined) {
      patch['Sort Order'] = order;
    }
    if (!r['Stage Entered At']) patch['Stage Entered At'] = safeDate_(r['Updated At']) || safeDate_(r['Created At']) || new Date();
    if (!r['Stage Path']) patch['Stage Path'] = String(r['Stage'] || 'New');
    if (!r['Dedupe Key']) {
      var p = digits_(r['Phone']), h = hostOf_(r['Website']),
          n = String(r['Name'] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      patch['Dedupe Key'] = p ? ('p:' + p.slice(-10)) : h ? ('d:' + h) : n ? ('n:' + n) : '';
    }
    if (Object.keys(patch).length) writeRow_(t, r._row, patch);
    order += 10;
  });
  return rows.length;
}

/** Copies whatever you pasted into SETUP_ONCE into Script Properties. */
function migrateSecrets() {
  var ui = SpreadsheetApp.getUi();
  var p = PropertiesService.getScriptProperties();
  var moved = [], skipped = [];

  Object.keys(SETUP_ONCE).forEach(function (k) {
    var v = String(SETUP_ONCE[k] || '').trim();
    if (!v) { skipped.push(k); return; }
    p.setProperty(k, v);
    moved.push(k);
  });

  ui.alert(
    (moved.length ? 'Moved into Script Properties:\n  ' + moved.join('\n  ') + '\n\n' : 'Nothing to move.\n\n') +
    (skipped.length ? 'Left empty (fill in SETUP_ONCE first if you need them):\n  ' + skipped.join('\n  ') + '\n\n' : '') +
    'Now blank out SETUP_ONCE in Code.gs, save, and re-deploy. ' +
    'Anything you moved is stored in the project, not in the file, so it will not reach GitHub.'
  );
}

function installTriggers_() {
  var existing = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { existing[t.getHandlerFunction()] = true; });

  if (!existing.aiDailyBrief) {
    ScriptApp.newTrigger('aiDailyBrief').timeBased().atHour(8).everyDays(1).inTimezone(TZ).create();
  }
  if (!existing.dailyDigest) {
    ScriptApp.newTrigger('dailyDigest').timeBased().atHour(9).everyDays(1).inTimezone(TZ).create();
  }
  if (!existing.weeklyReview) {
    ScriptApp.newTrigger('weeklyReview').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone(TZ).create();
  }
  if (!existing.dailyBackup) {
    ScriptApp.newTrigger('dailyBackup').timeBased().atHour(2).everyDays(1).inTimezone(TZ).create();
  }
  if (!existing.reminderSweep) {
    ScriptApp.newTrigger('reminderSweep').timeBased().everyHours(1).create();
  }
}

function backupNowMenu() {
  var name = makeBackup_();
  SpreadsheetApp.getUi().alert('Backup created:\n' + name);
}

function verifyMenu() {
  var r = verifyIntegrity_();
  SpreadsheetApp.getUi().alert(
    (r.ok ? '✅ No structural problems found.' : '⚠️ Problems found.') +
    '\n\nLeads: ' + r.leads + '\nSchema: v' + r.schema + '\n\n' +
    (r.problems.length
      ? r.problems.map(function (p) { return '• [' + p.level + '] ' + p.what; }).join('\n')
      : 'Nothing to report.')
  );
}

function recountMenu() {
  var r = recountLeadCounters_();
  SpreadsheetApp.getUi().alert('Recounted interaction totals on ' + r.updated + ' lead(s).');
}

function showStatus() {
  var lt = leadsTable_();
  var missing = [];
  LEAD_COLS.forEach(function (c) { if (!lt.map[c]) missing.push(c); });

  var triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var sessions = 0;
  try { sessions = Object.keys(JSON.parse(PropertiesService.getScriptProperties().getProperty('EV_SESSIONS') || '{}')).length; } catch (e) {}

  SpreadsheetApp.getUi().alert(
    'Everstone Lead Tracker v' + APP_VERSION + '  (schema v' + SCHEMA_VERSION + ')\n\n' +
    'Leads: ' + Math.max(lt.sheet.getLastRow() - 1, 0) + '\n' +
    'Missing columns: ' + (missing.length ? missing.join(', ') : 'none') + '\n' +
    'Triggers: ' + (triggers.length ? triggers.join(', ') : 'none') + '\n' +
    'Active sessions: ' + sessions + '\n\n' +
    'Password set: ' + (cfg('APP_PASSWORD') ? 'yes' : 'NO — sign-in will fail') + '\n' +
    'Google sign-in: ' + (cfg('GOOGLE_CLIENT_ID') && cfg('ALLOWED_EMAILS') ? 'configured' : 'not configured') + '\n' +
    'Allowed emails: ' + (cfg('ALLOWED_EMAILS') || '—') + '\n' +
    'Telegram: ' + (cfg('TG_TOKEN') && cfg('TG_CHAT_ID') ? 'configured' : 'not configured') + '\n' +
    'OpenRouter: ' + (cfg('OPENROUTER_API_KEY') ? 'configured' : 'not configured') + '\n' +
    'Fast model: ' + cfg('MODEL_FAST') + '\n' +
    'Power model: ' + cfg('MODEL_POWER')
  );
}

/** Rescues cells Sheets turned into #ERROR! because the text began with + or =. */
function repairErrorCells() {
  var t = leadsTable_();
  var last = t.sheet.getLastRow();
  if (last < 2) { SpreadsheetApp.getUi().alert('Nothing to repair.'); return; }

  var width = t.sheet.getLastColumn();
  var range = t.sheet.getRange(2, 1, last - 1, width);
  var display = range.getDisplayValues();
  var formulas = range.getFormulas();
  var fixed = 0;

  for (var r = 0; r < display.length; r++) {
    for (var c = 0; c < display[r].length; c++) {
      if (display[r][c].indexOf('#ERROR') === 0 && formulas[r][c]) {
        var original = formulas[r][c].replace(/^=/, '');
        t.sheet.getRange(r + 2, c + 1).setNumberFormat('@').setValue(original);
        fixed++;
      }
    }
  }

  ['Name', 'Website', 'Phone', 'WhatsApp', 'Email', 'Contact Person'].forEach(function (col) {
    if (t.map[col]) t.sheet.getRange(2, t.map[col], Math.max(last - 1, 1), 1).setNumberFormat('@');
  });

  SpreadsheetApp.getUi().alert('Repaired ' + fixed + ' cell(s), and locked the text columns so it will not happen again.');
}
