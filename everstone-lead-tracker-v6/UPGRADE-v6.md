# Upgrading to v6

Fifteen minutes, and nothing in your sheet moves.

The order matters: **backend first, dashboard second**. The new dashboard asks the backend
for things v5 cannot answer, so putting the files up in the other order gives you a broken
morning.

---

## What this release does to your data

Nothing destructive, by design.

- Columns are matched **by name**, never by position. Your 27 existing Leads columns stay
  exactly where they are.
- The 13 new columns are appended to the **far right** of the sheet. Nothing shifts.
- Before the first column is added, the whole spreadsheet is copied to
  *Everstone Lead Tracker — Backups* as **Pre-v6 safety copy**. That copy is never swept
  up by the 30-day cleanup.
- A save now writes only the cells it actually changes. v5 read a span and wrote it back,
  which flattened any formula sitting between two edited columns.
- Renamed columns are reconnected instead of duplicated. If someone once renamed *Website*
  to *Site*, or *Deal Value* to *Deal Value (৳)*, v6 finds them.

If you want a second copy in your own hands first: **Lead Tracker → Back up now**.

---

## Step 1 — Rotate the keys that leaked

`Code.gs` v5 had your password, Telegram bot token and OpenRouter key written into it, and
that file is in a public repository. Treat all three as compromised:

- **OpenRouter** → openrouter.ai → Keys → revoke the old one, create a new one.
- **Telegram** → message @BotFather → `/revoke` → `/token` for a fresh one.
- **App password** → pick a new one. Nothing stops you reusing the old one, but it has
  been public for a while.

The Google client ID is not a secret and does not need rotating.

---

## Step 2 — Put the new backend in

1. Open your sheet → **Extensions → Apps Script**.
2. Select everything in `Code.gs` and delete it. Paste the new `Code.gs` in its place.
3. Near the top, fill in `SETUP_ONCE` with your **new** values:

   ```js
   var SETUP_ONCE = {
     APP_PASSWORD:       'your new password',
     ALLOWED_EMAILS:     'mdnayemyuzzaman@gmail.com',
     GOOGLE_CLIENT_ID:   '422131638474-….apps.googleusercontent.com',
     TG_TOKEN:           'your new bot token',
     TG_CHAT_ID:         '6634894339',
     OPENROUTER_API_KEY: 'your new key'
   };
   ```

4. Save (Ctrl+S).
5. Back in the spreadsheet, reload the tab so the menu rebuilds, then run
   **Lead Tracker → 2 Move secrets into Script Properties**.
6. Return to Apps Script, **blank out `SETUP_ONCE` again**, and save. This is the step that
   keeps the keys out of GitHub.
7. Run **Lead Tracker → 1 Run first-time setup**. It creates the new tabs
   (`Notes`, `Tasks`, `Touches`, `StageEvents`, `Config`), fills in the new columns for
   every existing lead, and installs the reminder trigger. Safe to run more than once.
8. Run **Lead Tracker → Check everything is healthy**. You want no red errors.
9. **Deploy → Manage deployments → the pencil icon → Version: New version → Deploy.**
   Editing the existing deployment keeps the same `/exec` URL, so the dashboard needs no
   change. Creating a *new* deployment gives you a new URL and you would have to paste it
   in again.

---

## Step 3 — Put the new dashboard up

Replace these files in the repository, keeping the folder structure:

```
index.html
assets/css/app.css
assets/js/core.js
assets/js/views.js
assets/js/main.js
```

`assets/img/*` and `site.webmanifest` are unchanged — leave them alone.

Commit and push. Netlify redeploys on its own.

Then **hard-reload the dashboard once** (Ctrl+Shift+R). The browser caches the JS files,
and a soft reload will happily run yesterday's `main.js` against today's `core.js`.

---

## Step 4 — Check it took

- The header shows several recent leads with a time against each.
- **Notes** and **History** are in the left sidebar.
- Today has a row of interaction counters across the top.
- Settings → **Data safety** → *Check everything is healthy* reports no errors.
- Sign out and sign back in, both ways.

---

## If Google sign-in still refuses

v6 tells you which of the five possible causes it is, in the sign-in box itself. The one
you cannot guess from the outside: the page's origin must be listed as an **Authorised
JavaScript origin** on the OAuth client, exactly

```
https://everstonedigital-lead-tracker.netlify.app
```

no trailing slash, no path. Add it in Google Cloud Console → APIs & Services →
Credentials → your OAuth client → Authorised JavaScript origins. Changes there can take a
few minutes to propagate.

---

## Rolling back

Keep your old `Code.gs` and the old `assets/js` folder somewhere until you are happy. To
roll back: paste v5's `Code.gs` over v6, deploy a new version, and restore the old
frontend files. The extra columns and tabs v6 added are simply ignored by v5 — it reads by
name and skips what it does not recognise, so nothing has to be undone.
