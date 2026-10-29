# Everstone Lead Tracker — dashboard (v7)

The web dashboard for the Everstone Digital lead tracker. Static files only:
open `index.html` and it runs. No build step, no npm, no framework.

## What is in here

```
index.html              the whole app shell
assets/css/app.css      styling, light and dark, phone and desktop
assets/js/config.js     the backend address (the one file to edit)
assets/js/core.js       state, storage, the offline queue, the API client, access rules
assets/js/views.js      every page's rendering
assets/js/main.js       event wiring and dialogs
assets/js/ai.js         the AI assistant (Everstone Digital AI)
assets/js/platform.js   sign-in, accounts, people and access, the admin console
assets/js/reports.js    the Reports page, the live date, date filters on Leads and Meetings
assets/js/booking.js    the public booking page (index.html?book=<link name>)
assets/img/             logo and icons
netlify.toml            headers and SPA routing for Netlify
```

## Deploying

Drop these files at the root of the repo and let Netlify build from it.

The only thing to set is the backend address in `assets/js/config.js`:

```js
window.EVERSTONE_CONFIG = window.EVERSTONE_CONFIG || {
  apiUrl: 'https://script.google.com/macros/s/…/exec',
  brand: 'Everstone Digital'
};
```

That address is not a secret: every request still needs a signed-in session,
and the backend decides who gets in and what each person may see. It has to be
here so that the people you invite, and the visitors to your booking link, can
reach the backend. Until it is set, the admin console shows a reminder with
the exact line to paste.

## Where the backend lives

The dashboard talks to a Google Apps Script web app bound to the Lead Tracker
spreadsheet.

**The Apps Script file (`Code.gs`) is not part of this repo, and must not be
added to it.** It carries the sign-in password, the Telegram bot token and the
OpenRouter key. It lives only inside the spreadsheet's Apps Script project,
which is private to the Google account that owns the sheet.

## Who sees what

- **Admin** — every account and the admin console.
- **Custom access** — only the accounts ticked for that person. For each one:
  - **Manager**: everything in that account, including its setup.
  - **Editor**: works on leads, meetings and notes, but not the setup.
  - **Viewer**: looks only, changes nothing.
  - Optional limits per account: only the leads assigned to them, which pages
    they see, whether deal values show, and whether they can export or archive.
- Access can end on a date. Changes reach the person on Telegram.

The backend enforces all of this on every request; the dashboard only hides
what a person cannot use.

## Reports — what happened, day by day

Menu → **Reports**, with two tabs: **By date** and **Pipeline overview** (where
every lead stands now — the former Analytics page). Every number on both, and
on Today, opens the leads behind it; a lead opened from that list returns to
it when closed, and "Show in Leads" / "Open in Meetings" carry the selection
over. On **By date**, pick today, yesterday, this or last week, this or last
month, the last two or three months, this year, any two dates, or one day:

- leads added, follow-ups done, people contacted (calls, messages, emails,
  visits, meetings), meetings booked / held / cancelled / no-show, proposals,
  wins and losses — each compared with the period before
- a chart and a table, day by day (week by week or month by month on long
  ranges); click a day to see everything that happened on it, and the
  pipeline as it stood at the end of that day
- the list behind every number, who did what, and where new leads came from
- export: print or save as PDF, CSV for Excel, a copy-paste summary, or a
  Telegram message; the bot also answers `/report week`, `/report lastmonth`,
  `/report 2026-10-25`, and sends last month's report on the 1st

Leads can be filtered by the date they were added, and Meetings by date. A
lead entered late can be given its real "Date added", and the reports count
it on that day.

## The AI assistant

Called **Everstone Digital AI** by default. Admin → Platform →
"AI assistant name" renames it everywhere — the menu, the chat, Telegram and
how it introduces itself.

## Meetings and the calendar

When a meeting's time or length changes, the dashboard checks the other
meetings and the busy events in the Google Calendar, warns about any overlap,
and offers the next free time. The calendar event is moved in place, so it
keeps its guests and link.

## Offline behaviour

Edits made without a connection are queued in local storage and replayed in
order when the connection returns, so a dropped signal mid-edit does not lose
the change. The queue survives a page reload, and each person's queue is kept
apart on a shared computer.
