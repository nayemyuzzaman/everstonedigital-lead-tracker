# Everstone Lead Tracker — dashboard

The web dashboard for the Everstone Digital lead tracker. Static files only:
open `index.html` and it runs. No build step, no npm, no framework.

## What is in here

```
index.html            the whole app shell
assets/css/app.css    styling, light and dark
assets/js/core.js     state, storage, the offline queue, the API client
assets/js/views.js    every page's rendering
assets/js/main.js     event wiring and dialogs
assets/js/ai.js       the Evo assistant panel
assets/img/           logo and icons
netlify.toml          headers and SPA routing for Netlify
```

## Deploying

Drop these files at the root of the repo and let Netlify build from it.
Nothing here needs configuration at deploy time.

## Where the backend lives

The dashboard talks to a Google Apps Script web app bound to the Lead Tracker
spreadsheet. That URL is entered once in the app's own Settings page and is
kept in the browser's local storage — it is deliberately not committed here,
so this repo can stay public without exposing the backend.

**The Apps Script file (`Code.gs`) is not part of this repo, and must not be
added to it.** It carries the sign-in password, the Telegram bot token and the
OpenRouter key. It lives only inside the spreadsheet's Apps Script project,
which is private to the Google account that owns the sheet.

## Offline behaviour

Edits made without a connection are queued in local storage and replayed in
order when the connection returns, so a dropped signal mid-edit does not lose
the change. The queue survives a page reload.
