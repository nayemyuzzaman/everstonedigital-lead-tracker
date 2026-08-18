# Everstone Lead Tracker

A lead pipeline for a small agency, built on a Google Sheet you own.

Leads, meetings, proposals and follow-ups in one place, with a Telegram nudge every
morning and an AI assistant that can actually change things rather than just talk about
them. No subscription, no third-party server holding your client list.

**[Setup guide →](SETUP.md)** — about 20 minutes, no coding required.

**Already running v5? [Upgrade guide →](UPGRADE-v6.md)** — fifteen minutes, nothing moves.

---

## What it does

**Stops leads going quiet.** Every open lead needs a scheduled next step. The ones without
a date sit at the top of the dashboard until you give them one, and anything untouched for
two weeks starts turning amber on its own.

**Tracks proposals properly.** Sending a proposal starts a follow-up cadence — day 2, 5,
10, 21. Marking one done moves you to the next beat instead of leaving a blank.

**Remembers meetings.** What you discussed, what was decided, what happens next and how
interested they really were, on a scale you will actually trust three months later. A
meeting whose date has passed without an outcome logged nags you until you log it.

**Records why you lose.** Marking a lead Dead asks why. After a few months the analytics
tell you whether the problem is your pricing or your pitch.

**Never loses a keystroke.** Changes are applied locally, queued, and retried until the
sheet confirms them. Losing your connection mid-sentence costs nothing. `Ctrl+Z` undoes
the last 30 changes, including deletions.

**Remembers what you actually did.** A lead that moves New → Phone Call → Meeting →
Proposal used to leave no trace of the call or the meeting once it had moved on. Every
call, meeting, proposal and message is now written to its own ledger, so "how many leads
have I actually met" is still answerable months later. The counters across the top of
Today are configurable — drag them, hide them, click one to see exactly which leads are
behind the number.

**Notes and tasks, in the sheet.** A Google-Keep-style board with pinning, colours,
checklists, labels, reminders and drag-to-reorder — living in your own spreadsheet, backed
up nightly, and available offline. Reminders arrive on Telegram.

**A history you can read and reverse.** Every change is journalled with who made it, when,
what the field used to say and what it says now. Filter by lead, kind, field, person or
date, and put any single field change back with one click.

**One lead, one place.** Change a stage anywhere and it changes everywhere. Duplicate
detection finds leads that share a phone number, a domain or a name, and merging folds
them together without losing a character — blank fields filled in, notes and history
joined, every meeting and document repointed.

**Your order.** Starred first, then hot before warm before cold, with the low-priority
stages sinking and Dead at the very bottom. Drag any row by its handle to override it.

**Evo, the assistant.** Knows the whole pipeline. Ask in Bangla, get an answer in Bangla;
ask for a client message and get careful English. It can move stages, book meetings, set
follow-ups, audit a prospect's website, draft an email you approve before it sends, and
export any answer to PDF, Word, PowerPoint or Excel.

---

## The screens

| | |
|---|---|
| **Today** | What needs you, ranked by what waiting is costing you |
| **Leads** | The full list, filterable by health as well as stage |
| **Pipeline** | Kanban board, drag by the handle, multi-select for bulk moves |
| **Follow-ups** | A timeline, with the "nothing booked" list called out first |
| **Meetings** | Upcoming, awaiting an outcome, and everything already logged |
| **Analytics** | Leading indicators before outcomes — the numbers you can still change |
| **Evo** | Conversations, saved to your sheet so they follow you between devices |
| **Messages** | English templates that fill themselves in from a lead |
| **Documents** | Proposals, audits and contracts filed against the lead they belong to |
| **Archive** | Won, lost and deleted. Nothing leaves for good |

---

## How it is put together

```
index.html            markup
assets/css/app.css    one token system, light and dark
assets/js/core.js     state, offline queue, undo, sync
assets/js/views.js    every screen
assets/js/ai.js       Evo
assets/js/main.js     forms, modals, events, boot
apps-script/Code.gs   the entire backend
```

No build step, no framework, no dependencies. Edit a file and refresh.

**Frontend** — plain JavaScript. One store; a single `notify()` refreshes every visible
surface, so a change made in the drawer appears in the list, the board and the counters at
the same moment. All rendering escapes its input, so nothing typed by you, a client or the
AI can execute as markup.

**Backend** — Apps Script. Columns are matched by heading name rather than position, so
rearranging the sheet cannot scramble the data. Every write takes a lock, stamps a
timestamp, refuses to overwrite a row that changed underneath it, and is safe to replay.
Every field change is appended to a journal that is never edited.

**Sync** — the browser holds a durable outbox. A pull will not overwrite a row whose write
has not landed yet, so a background refresh cannot erase what you just typed.

---

## Cost

Free, except the AI. OpenRouter is pay-per-use; five dollars covers a normal month.
Skip the AI setup and the rest works unchanged.

---

## Making it your own

Stages, priority levels, labels, sources, services, loss reasons, follow-up cadences and
the "gone quiet" thresholds are all editable in Settings — add, rename, recolour or remove
as many as you like. Evo takes standing instructions in plain English that it obeys in
every conversation, every daily brief and every draft.

---

Built for [Everstone Digital](https://everstonedigital.com). Use it for your own agency —
it is yours once you deploy it.
