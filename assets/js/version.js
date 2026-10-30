/* ═══════════════════════════════════════════════════════════════════════════
   version.js — the app's version number. Edit THIS file on every release.

   • build   — add 1 every time you upload a new copy to GitHub (41, 42, 43…).
   • version — change it only for a big release (8.0 → 8.1 → 9.0).
   • notes   — two or three lines about what changed. Shown once to everyone
               after they get the update ("What's new").

   Every open dashboard checks this file every few minutes. When the build
   number goes up, everyone sees "A new version is ready — Reload".
   ═══════════════════════════════════════════════════════════════════════════ */
window.EVERSTONE_VERSION = {
  version: '8.0',
  build: 42,
  date: '2026-10-30',
  backend: '8.0',          // the Code.gs version this dashboard expects
  notes: {
    en: [
      'The Recent strip at the top now scrolls — mouse wheel, drag, or the ‹ › arrows — and holds up to 30 leads.',
      'The backend address is built in: nothing to paste after an update.',
      'Delete for good: single leads, everything you select, or the whole archive.',
      'Move or copy leads between accounts. People and accounts can be deleted from Admin.',
      'Profile photo — tap your avatar, top right.',
      'Guide page and a ? button on every page, in English and বাংলা, with AI answers.',
      'Fixed: selecting text in a form no longer closes it. Google sign-in now explains any problem.',
      'Calmer layout on big screens, better on phones.'
    ],
    bn: [
      'উপরের Recent strip এখন স্ক্রল হয় — mouse wheel, টেনে, বা ‹ › দিয়ে — আর ৩০টা পর্যন্ত lead দেখায়।',
      'Backend link আগে থেকেই বসানো: update-এর পর কিছু paste করতে হয় না।',
      'Lead একদম delete করা যায়: একটা, select করা সবগুলো, বা পুরো Archive খালি।',
      'Lead এক account থেকে আরেক account-এ Move বা Copy। Admin থেকে person আর account delete।',
      'Profile photo — উপরে ডানে নিজের ছবিতে চাপুন।',
      'Guide page আর প্রতিটা page-এ ? বাটন — English ও বাংলায়, AI-কে প্রশ্নও করা যায়।',
      'ঠিক করা হয়েছে: form-এ লেখা select করলে আর popup বন্ধ হয় না। Google sign-in-এ সমস্যা হলে কারণ দেখায়।',
      'বড় স্ক্রিনে ফাঁকা জায়গা কম, মোবাইলে আরও সহজ।'
    ]
  }
};
