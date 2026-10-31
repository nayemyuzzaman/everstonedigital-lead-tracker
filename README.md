# Everstone Lead Tracker — dashboard (v9.0 · build 43)

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
assets/js/version.js    the version number — add 1 to `build` on every release
assets/js/guide.js      the words of the in-app Guide (English and Bangla)
assets/js/v8.js         delete for good, move/copy, photos, Guide, help, updates
assets/js/deen.js       Quran & Hadith panel: topics and references (texts come from the sources)
assets/js/v9.js         Quran & Hadith panel, notifications, lead tiles, calendar links,
                        meeting reminders, webhooks, trash, quick navigation
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

## Releasing a new version

1. Open `assets/js/version.js`, add 1 to `build` (41 → 42) and write two or
   three lines in `notes`. Change `version` only for a big release.
2. Upload the files to GitHub. Netlify publishes them.
3. Everyone who has the dashboard open sees "A new version is ready — Reload"
   within five minutes, and "What's new" once after reloading.

If the release also changes `Code.gs`, paste it into Apps Script and press
Deploy → Manage deployments → ✎ Edit → Version: **New version** → Deploy.
The web-app address stays the same. When the backend is older than the
dashboard expects (`backend` in version.js), admins see a yellow bar.

## v8 — what changed

- **Delete for good**: one lead (its details or the Archive page), everything
  selected (bottom bar), or "Empty archive". Removes the lead and its
  meetings, notes, tasks, documents and history from the sheet. Archive still
  exists and is still the safe choice.
- **Move / copy between accounts**: nothing ever crosses accounts on its own.
  The Add-lead form can also put a new lead straight into another account.
  The account switcher turns amber whenever you are not in main.
- **Admin**: delete a person (optionally with the accounts only they used) and
  delete an account (its spreadsheet goes to the Drive trash for 30 days).
- **Profile photo**: avatar → Change photo. Stored small (192 px).
- **Guide** page, a **?** on every page, a first-visit tip per page, English /
  বাংলা, and "Ask the AI" answered from the guide.
- **Fixed**: drag-selecting text in a form and letting go outside it no longer
  closes the form. Google sign-in explains any problem instead of vanishing,
  and Admin → Platform → "Google sign-in check" lists what Google needs.
- Reading pages are capped at a comfortable width on big screens; Pipeline
  and the AI chat still use the full screen.

## v9 — what changed

- **Quran & Hadith panel** on the right (a drawer on smaller screens): a new ayah
  and hadith every 10 minutes and on every visit. Arabic, Bangla (Muhiuddin
  Khan), English (Saheeh International), tafsir (Ahsanul Bayaan, Ibn Kathir,
  Abu Bakr Zakaria, Fathul Majid), and hadith from Bukhari, Muslim and
  Tirmidhi in Bangla / English / Arabic. Topics are weighted towards jihad,
  taqwa and holding to the deen. Words always come from api.alquran.cloud,
  api.quran.com and fawazahmed0/hadith-api — nothing is generated. History of
  every item shown (search, star, export) stays on the device.
- **Notifications** (the bell): problems, meetings starting, follow-ups due,
  access requests, updates and every ayah/hadith, kept and searchable.
- **Every account has its own Google Calendar.** Settings → Calendar:
  "Connect Google Calendar" (OAuth, any Gmail), or "Use a shared calendar".
  Meetings and follow-ups go there; its busy times block double-booking and
  the booking page. Main keeps the owner's calendar until changed.
  Needs, once: Admin → Platform → Google client secret, plus the redirect URI
  and the Calendar API (see "Google sign-in check").
- **Telegram meeting reminders with an AI brief**, at the minutes each account
  chooses (Settings → Telegram). A new 5-minute schedule `meetingSweep` is
  added by itself the first time an admin opens the Admin console.
- **Lead details**: compact tiles, quick actions on top, "Log what just
  happened" at the top (Enter saves). Fixed: a sync could wipe a half-typed
  note — typing is never interrupted now, and drafts survive closing.
- **Trash** for meetings, notes, tasks, documents and AI chats; Empty trash;
  admins can empty an account; deleting a person removes their Telegram link,
  assignments and ownerships too.
- **Webhooks** (n8n / Make / Zapier), signed with HMAC-SHA256; per-person
  "API & integrations" permission — switching it off stops their keys at once.
- **Speed**: the admin console opens from its last copy and refreshes behind
  it; account numbers are cached for 15 minutes.
- **g + a letter** jumps to any page; more entries in Ctrl+K.
