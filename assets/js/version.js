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
  version: '9.0',
  build: 43,
  date: '2026-10-31',
  backend: '9.0',          // the Code.gs version this dashboard expects
  notes: {
    en: [
      'Quran & Hadith on the right: a new ayah and hadith every few minutes (Bangla, English, Arabic, tafsir), with full history.',
      'Notifications: the bell keeps every problem, meeting, follow-up and ayah in one place.',
      'Each account books into its own Google Calendar — connect any Gmail in Settings → Calendar.',
      'Telegram reminders before every meeting, with an AI brief from the lead’s notes.',
      'Lead details: compact tiles, quick actions on top, and typed notes are never lost.',
      'Trash for meetings, notes, tasks, documents and AI chats; admins can empty an account.',
      'Webhooks for n8n / Make / Zapier; the admin decides who may use the API.',
      'Faster admin console; g + a letter jumps to any page.'
    ],
    bn: [
      'ডান পাশে কোরআন ও হাদিস: কয়েক মিনিট পর পর নতুন আয়াত ও হাদিস (বাংলা, English, আরবি, তাফসীর), পুরো ইতিহাস সহ।',
      'Notification (ঘণ্টা আইকন): সব সমস্যা, মিটিং, follow-up আর আয়াত এক জায়গায় জমা থাকে।',
      'প্রতিটা account নিজের Google Calendar-এ মিটিং বুক করে — Settings → Calendar থেকে যেকোনো Gmail যুক্ত করুন।',
      'প্রতিটা মিটিংয়ের আগে Telegram-এ রিমাইন্ডার, লিডের নোট থেকে AI প্রস্তুতি সহ।',
      'লিডের details: ছোট ছোট বক্স, উপরে দ্রুত বাটন, আর লেখা নোট আর কখনো হারায় না।',
      'মিটিং, নোট, task, document, AI chat-এর Trash; admin পুরো account খালি করতে পারেন।',
      'n8n / Make / Zapier-এর জন্য webhook; কে API ব্যবহার করবে admin ঠিক করেন।',
      'Admin দ্রুত খোলে; g চেপে একটা অক্ষর দিলে যেকোনো page-এ যাওয়া যায়।'
    ]
  }
};
