/* ═══════════════════════════════════════════════════════════════════════════
   config.js — the one file to edit after deploying the backend.

   Put your Apps Script web app address (it ends in /exec) in apiUrl. Then
   everyone you share the dashboard link with is connected automatically —
   they only sign in with their email. Nothing here is secret: every request
   still needs a signed-in session, and the backend decides who gets in.
   ═══════════════════════════════════════════════════════════════════════════ */
window.EVERSTONE_CONFIG = window.EVERSTONE_CONFIG || {
  apiUrl: 'https://script.google.com/macros/s/AKfycbyCT5uQjs8XfafjK8Sxo4W6OzBBk4bh3aqvDvT66CAThDNCRYEn3dkLv6rowy3u0ZtQpQ/exec',
  brand: 'Everstone Digital'
};