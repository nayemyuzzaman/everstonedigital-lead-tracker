# Everstone Lead Tracker — Setup Guide

A complete lead pipeline that runs on **your own** Google account. Your spreadsheet is the
database, Apps Script is the backend, and a static page is the dashboard. No servers to
rent, no monthly fee, and nobody else can see your data.

Setting it up takes about 20 minutes. You do not need to know how to code — you will be
copying and pasting.

---

## What you end up with

| Piece | Where it lives | What it costs |
|---|---|---|
| Your leads, meetings, documents | A Google Sheet in your Drive | Free |
| The backend | Apps Script attached to that sheet | Free |
| The dashboard | A static page on GitHub Pages (or opened from your own computer) | Free |
| Reminders on your phone | A Telegram bot you create | Free |
| The AI assistant | OpenRouter, pay per use | Roughly $1–5 a month at normal use |

Everything except OpenRouter is free forever. The AI is optional — skip step 6 and the
rest still works.

---

## Before you start

You need:

- A Google account (Gmail is fine)
- A phone with Telegram, if you want reminders there
- 20 minutes

---

## Step 1 — Create the spreadsheet

1. Go to [sheets.new](https://sheets.new). A blank spreadsheet opens.
2. Rename it something you will recognise: **Everstone Lead Tracker**.

That is all. The script builds every tab it needs on its own — do not create any tabs
yourself.

---

## Step 2 — Add the backend code

1. In the spreadsheet menu, click **Extensions → Apps Script**. A new tab opens.
2. You will see a file called `Code.gs` with a few lines of sample code. Select all of it
   (`Ctrl+A`) and delete it.
3. Open [`apps-script/Code.gs`](apps-script/Code.gs) from this project, copy the whole
   file, and paste it in.
4. Click the **save** icon (or `Ctrl+S`).
5. Rename the Apps Script project to **Lead Tracker** using the title at the top left.

---

## Step 3 — Put your secrets somewhere safe

Nothing secret belongs in `Code.gs` — that file goes to GitHub, and bots scrape public
repositories within minutes of a push.

**The quick way.** Near the top of `Code.gs` there is a block called `SETUP_ONCE`. Paste
your values into it temporarily:

```js
var SETUP_ONCE = {
  APP_PASSWORD:       'the password you will type to sign in',
  ALLOWED_EMAILS:     'you@gmail.com',
  GOOGLE_CLIENT_ID:   '',
  TG_TOKEN:           '',
  TG_CHAT_ID:         '',
  OPENROUTER_API_KEY: ''
};
```

Save, then run **Lead Tracker → 2 Move secrets into Script Properties** from the
spreadsheet menu. It copies them into the project's own storage and tells you what it
moved. Now go back, blank the strings out again, and save. From then on the code reads
them from Script Properties and the file is safe to publish.

**The manual way.** In the Apps Script editor, **Project Settings** (the cog on the left)
→ scroll to **Script Properties** → **Add script property** for each one:

| Property | What it is |
|---|---|
| `APP_PASSWORD` | The password you type to sign in. Required. |
| `ALLOWED_EMAILS` | Comma-separated addresses allowed to use Google sign-in |
| `GOOGLE_CLIENT_ID` | Only if you set up Google sign-in (Step 8) |
| `TG_TOKEN` | Telegram bot token (Step 5) |
| `TG_CHAT_ID` | Your Telegram chat id (Step 5) |
| `OPENROUTER_API_KEY` | For Evo (Step 6) |

You can check what the script can see at any time with
**Lead Tracker → Show setup status**.

---

## Step 4 — Run the first-time setup

1. Go back to the spreadsheet tab and reload the page (`F5`).
2. A new menu appears in the toolbar: **Lead Tracker**.
3. Click **Lead Tracker → ① Run first-time setup**.

Google will ask for permission the first time. This is normal and it is asking on your own
behalf:

- Click **Continue**, pick your account.
- You will see **"Google hasn't verified this app"**. That is because *you* wrote it —
  it was never submitted to Google for review. Click **Advanced**, then
  **Go to Lead Tracker (unsafe)**.
- Review what it asks for and click **Allow**.

What it is asking for, and why:

| Permission | Why the script needs it |
|---|---|
| See and manage this spreadsheet | It is your database |
| See and manage your calendars | Books follow-ups and meetings |
| Send email as you | Only when you press Send on an email you have read |
| See and manage Drive files it creates | Backups and exported documents |
| Connect to an external service | Telegram and OpenRouter |

When it finishes you will see a confirmation listing the tabs it created and the
automatic jobs it scheduled.

---

## Step 5 — Telegram reminders (optional, 5 minutes)

This is what puts a reminder on your phone whether the dashboard is open or not.

**Create the bot**

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot`.
3. Give it a name (`Everstone Leads`) and a username ending in `bot`
   (`everstone_leads_bot`).
4. BotFather replies with a token that looks like `1234567890:AAF-ExampleTokenHere`.
   That is your `TG_TOKEN`.

**Find your chat ID**

1. Search for **@userinfobot** in Telegram and send it any message.
2. It replies with your ID, a number like `123456789`. That is your `TG_CHAT_ID`.

**Start the conversation**

Find your new bot by its username and send it `/start`. A bot cannot message you until you
have messaged it first — skip this and the reminders will silently never arrive.

Then add both values to Script Properties (step 3).

---

## Step 6 — The AI assistant (optional)

1. Sign up at [openrouter.ai](https://openrouter.ai).
2. Add some credit. Five dollars lasts a long time at normal use.
3. Go to **Keys**, create one, and copy it. It starts with `sk-or-v1-…`.
4. Add it to Script Properties as `OPENROUTER_API_KEY`.

The key stays on the server. It is never sent to the browser, so nobody using the
dashboard can read it.

Two models are used, and you can switch between them from inside the app:

- **Fast** — everyday questions and drafts. Cheap and quick.
- **Power** — website audits and long writing. Slower, noticeably better.

Change which models these point at with the `MODEL_FAST` and `MODEL_POWER` properties.
Any model on OpenRouter works. If you want the AI to read images, both must be a model
that can see pictures. Check the current ids at [openrouter.ai/models](https://openrouter.ai/models) — a retired id fails with "No endpoints found".

---

## Step 7 — Publish the backend

1. Back in Apps Script, click **Deploy → New deployment**.
2. Click the gear next to **Select type** and choose **Web app**.
3. Fill in:
   - **Description**: `v5`
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**
4. Click **Deploy**, then **Authorize access** if asked.
5. Copy the **Web app URL**. It ends in `/exec`. Keep it somewhere handy.

> **"Anyone" sounds alarming — is it?**
> It means anyone who has the URL can reach the endpoint, not that anyone can read your
> leads. Every request except signing in must carry a valid session token, and signing in
> needs your password. After six wrong attempts the door locks for fifteen minutes and you
> get a Telegram alert. Apps Script has no other way to let a web page talk to it, so this
> setting is required.

**Whenever you change `Code.gs` later**, use **Deploy → Manage deployments → edit (pencil)
→ Version: New version → Deploy**. Creating a brand-new deployment gives you a different
URL and the dashboard will keep talking to the old one.

---

## Step 8 — Google sign-in instead of a password (optional)

Skip this unless you want the "Sign in with Google" button.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project.
2. **APIs & Services → OAuth consent screen** → External → fill in the app name and your
   email → Save. Add your own email under **Test users**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Under **Authorised JavaScript origins**, add wherever the dashboard is served from —
   **origin only, no path, no trailing slash**. For the Netlify site that is:

   ```
   https://everstonedigital-lead-tracker.netlify.app
   ```

   If you also open the dashboard from GitHub Pages or from your own machine, add those
   origins too. This is the single most common reason the button never appears.
6. Create it and copy the **Client ID**.
7. Put it in Script Properties as `GOOGLE_CLIENT_ID`. **You do not need to paste it into
   the dashboard any more** — since v6 the sign-in screen asks the backend for it, so one
   place to change it and any browser picks it up.
8. Make sure `ALLOWED_EMAILS` contains the address you will sign in with, lowercase and
   comma separated if there is more than one.

Only addresses listed in `ALLOWED_EMAILS` can get in, whichever Google account is used.

### If the button still does not show

The sign-in box now tells you which of these it is instead of failing silently:

| What it says | What to do |
|---|---|
| "Google sign-in is not set up on the backend yet" | `GOOGLE_CLIENT_ID` or `ALLOWED_EMAILS` is missing from Script Properties |
| "No Google client ID yet" | The backend answered, but with an empty client ID — check the property name is spelled exactly `GOOGLE_CLIENT_ID` |
| "Google's sign-in script did not load" | An ad blocker or a firewall is blocking `accounts.google.com` — password sign-in still works |
| "…could not start: …authorised JavaScript origin" | Add the origin it names to the client ID in Google Cloud Console |
| "This account is not on the allow list" | Add that exact address to `ALLOWED_EMAILS` |
| "This sign-in came from a different Google client" | The page is using a different client ID than the backend expects — re-deploy after changing it |

---

## Step 9 — Put the dashboard online

### Option A — GitHub Pages (recommended)

The repository *is* the site, so there is only one place to update and nothing to
connect. Free, and no monthly build or bandwidth allowance to run out of.

1. Put this project in a **public** GitHub repository — either `git push`, or
   **Add file → Upload files** on the repository page.
2. On the repository: **Settings → Pages**.
3. Under **Source** choose **Deploy from a branch**.
4. Branch **main**, folder **/ (root)** → **Save**.
5. Wait a minute or two, then reload. The URL appears at the top of the same page:
   `https://YOUR-NAME.github.io/YOUR-REPO/`

From then on, every change you push or upload publishes itself within a minute.

> The repository has to be public for Pages to be free. That is fine here — no key
> lives in the code, they all sit in Script Properties. Check `apps-script/Code.gs`
> before you publish: every value in the `FALLBACK` block should be `''`.

### Option B — Netlify

**Add new site → Import an existing project** → pick the repository. Build command
empty, publish directory `.`. Or drop a folder onto
[app.netlify.com/drop](https://app.netlify.com/drop) for a one-off deploy.

Netlify's free tier caps build minutes and bandwidth per month; GitHub Pages does not
meter static sites the same way.

### Option C — Just open the file

Double-click `index.html`. It works, but only on that one computer, and browsers restrict
a few things on local files.

---

## Step 10 — Connect the two halves

1. Open your dashboard URL.
2. First run shows **Connect to your sheet**. Paste the `/exec` URL from step 7.
3. If you did step 8, paste the Google client ID too. Otherwise leave it blank.
4. Click **Save and connect**.
5. Type your password and click **Unlock**.

Your leads appear. You are done.

---

## Bringing existing leads across

If you already keep leads in a spreadsheet:

1. Open the **Leads** tab the script created.
2. Notice the header row — `ID`, `Name`, `Website`, `Phone`, and so on.
3. Paste your data under the matching headings. Leave `ID` blank; the script fills it in
   on first edit.
4. Reload the dashboard.

Column *order* does not matter. The script reads by heading name, so you can drag columns
around or insert new ones and nothing breaks.

**Dates** go in `yyyy-mm-dd`. **Phone numbers** should be typed into the sheet with the
column formatted as plain text — the dashboard already does this, and
**Lead Tracker → Repair #ERROR! cells** fixes any that came in badly.

---

## What runs on its own

The setup schedules four jobs. See them under the clock icon in Apps Script.

| Job | When | What it does |
|---|---|---|
| `aiDailyBrief` | 8am daily | Reads the pipeline, sends a Telegram brief, sets follow-up dates the notes clearly imply |
| `dailyDigest` | 9am daily | Everything due, meetings today, proposals waiting, leads with no next step |
| `weeklyReview` | Monday 9am | What you did last week and where the pipeline stands |
| `dailyBackup` | 2am daily | Copies the whole spreadsheet to a Drive folder, keeps 30 days |

To change a time, click the job and edit it. To stop one, delete it.

---

## Everyday keyboard shortcuts

| Key | Does |
|---|---|
| `Ctrl+K` | Jump to any lead or command |
| `Ctrl+Z` | Undo the last change |
| `/` | Search leads |
| `n` | Add a lead |
| `Esc` | Close whatever is open |

---

## When something goes wrong

**"Cannot reach the sheet"**
The `/exec` URL is wrong, or you created a new deployment instead of a new version. Go to
Settings in the dashboard, paste the URL again, and press **Test connection**.

**Sign-in says "Too many attempts"**
Six wrong passwords locks it for fifteen minutes. Wait, or clear it in Apps Script:
Project Settings → Script Properties → delete `EV_LOGIN_FAIL`.

**The badge says "3 to save" and will not clear**
Three changes are waiting on this device. They are stored safely and retry every twenty
seconds. Check you are online and that the connection test passes. Nothing is lost while
it says this — do not clear your browser data until it says **Saved**.

**Cells show `#ERROR!`**
A phone number starting with `+` was read as a formula. **Lead Tracker → Repair #ERROR!
cells** rescues the original text and locks those columns as plain text.

**Telegram never arrives**
You have not sent `/start` to your own bot, or the token and chat ID are swapped. Test
with **Lead Tracker → Send daily digest now**.

**The AI says the key is not set**
`OPENROUTER_API_KEY` is missing from Script Properties, or your OpenRouter credit ran out.

**Something looks stale**
Press the refresh arrow in the top bar. The dashboard also pulls every 90 seconds on its
own.

**Check everything at once**
**Lead Tracker → Show setup status** lists your lead count, missing columns, scheduled
jobs and which integrations are configured.

---

## Your data, plainly

- Everything lives in your own Google account. Nobody else has a copy.
- Nothing is ever hard-deleted. Archiving flags a row; it never removes one.
- Every field change is appended to an `Activities` tab, with what it was and what it
  became.
- A full copy of the spreadsheet is saved to Drive nightly and kept for 30 days.
- Changes made while offline are stored on your device and sent when you reconnect. A
  refresh cannot overwrite work that has not been saved yet.

If you ever want out, the spreadsheet is the whole thing. Download it and you have
everything.
