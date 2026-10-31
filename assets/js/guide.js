/* ═══════════════════════════════════════════════════════════════════════════
   guide.js — the words of the in-app Guide, in English and Bangla.

   Content only: v8.js draws it (Guide page, the ? button on every page, the
   first-visit tip) and sends it to the AI when someone asks "how do I…?".
   To change a sentence, change it here. Each page has:
     title, summary  — one line each
     steps           — how to use it, in order
     tips            — the things people miss
   ═══════════════════════════════════════════════════════════════════════════ */
var GUIDE = {
  pages: {
    today: {
      icon: 'today',
      title: { en: 'Today', bn: 'Today (আজ)' },
      summary: {
        en: 'Your start-of-day screen: what is due, what is late, and what to do first.',
        bn: 'দিনের শুরুর screen: আজ কী করতে হবে, কী late হয়ে গেছে, আর কোনটা আগে করবেন।'
      },
      steps: {
        en: [
          'Read the number cards at the top — tap any number to see the leads behind it.',
          'Press "Plan my day" in the AI card: it reads every open lead and says who to contact first, why, and what to send.',
          '"Log what happened" lists meetings that are over but have no outcome yet — tap one and record the result.',
          '"What needs you" is ranked by how much waiting is costing you. Work from the top.',
          '"Send me the brief" sends today\'s list to your Telegram.'
        ],
        bn: [
          'উপরের number card গুলো দেখুন — যেকোনো সংখ্যায় চাপলে তার পেছনের lead গুলো দেখাবে।',
          'AI card-এ "Plan my day" চাপুন: সব open lead পড়ে বলে দেবে কাকে আগে contact করবেন, কেন, আর কী message পাঠাবেন।',
          '"Log what happened"-এ সেই meeting গুলো থাকে যেগুলো শেষ কিন্তু ফলাফল লেখা হয়নি — চেপে result লিখে দিন।',
          '"What needs you" সাজানো থাকে কোনটা দেরি করলে বেশি ক্ষতি সেই হিসেবে। উপর থেকে কাজ করুন।',
          '"Send me the brief" আজকের তালিকা আপনার Telegram-এ পাঠায়।'
        ]
      },
      tips: {
        en: ['The gear icon on the cards lets you choose which numbers you see.'],
        bn: ['Card-এর পাশের gear icon দিয়ে ঠিক করুন কোন কোন সংখ্যা দেখবেন।']
      }
    },

    leads: {
      icon: 'leads',
      title: { en: 'Leads', bn: 'Leads' },
      summary: {
        en: 'Every lead in this account — search, filter, sort, and act on many at once.',
        bn: 'এই account-এর সব lead — খুঁজুন, filter করুন, সাজান, একসাথে অনেকগুলোতে কাজ করুন।'
      },
      steps: {
        en: [
          'Press "Add lead" (or the N key). A name, phone or website is enough — everything else can wait.',
          'Type in the search box to find a lead by name, phone, website or anything in its notes.',
          'Use the stage chips (New, Proposal, Hired…) or the filter boxes to narrow the list. "Clear" resets everything.',
          'Click a lead to open its details on the right. Click any field there to edit it in place.',
          'Tick the box on the left of several leads to change their stage, priority or follow-up together, archive them, move them, or delete them for good.',
          'Drag the ⋮⋮ handle to put a lead higher or lower in the list.'
        ],
        bn: [
          '"Add lead" চাপুন (বা keyboard-এ N)। নাম, phone বা website — যেকোনো একটা দিলেই হবে, বাকিটা পরে।',
          'Search box-এ নাম, phone, website বা note-এর যেকোনো কথা লিখলে lead খুঁজে পাবেন।',
          'Stage chip (New, Proposal, Hired…) বা filter box দিয়ে তালিকা ছোট করুন। "Clear" চাপলে সব আগের মতো।',
          'কোনো lead-এ click করলে ডানে তার details খুলবে। সেখানে যেকোনো ঘরে click করে সরাসরি edit করুন।',
          'বাম পাশের box tick দিয়ে কয়েকটা lead select করুন — একসাথে stage, priority, follow-up বদলান, archive, move বা একদম delete করুন।',
          '⋮⋮ handle ধরে টেনে lead উপরে-নিচে সরান।'
        ]
      },
      tips: {
        en: [
          '"Duplicates" finds the same business entered twice and merges them.',
          'The bar under each lead shows how long it has been quiet — red means it is going cold.',
          'Ctrl+K (⌘K on Mac) jumps to any lead from anywhere.'
        ],
        bn: [
          '"Duplicates" একই business দুবার ঢোকানো থাকলে খুঁজে বের করে merge করে।',
          'প্রতিটা lead-এর নিচের bar বলে কতদিন কোনো যোগাযোগ নেই — লাল মানে lead ঠান্ডা হয়ে যাচ্ছে।',
          'Ctrl+K (Mac-এ ⌘K) চাপলে যেকোনো জায়গা থেকে যেকোনো lead-এ যাওয়া যায়।'
        ]
      }
    },

    pipeline: {
      icon: 'pipeline',
      title: { en: 'Pipeline', bn: 'Pipeline' },
      summary: {
        en: 'Your leads as a board, one column per stage. Drag a card to move it on.',
        bn: 'Stage অনুযায়ী column-এ সাজানো board। Card টেনে পরের stage-এ নিন।'
      },
      steps: {
        en: [
          'Drag a card by its handle into another column to change its stage.',
          'Click a card to open the lead.',
          'Shift-click several cards to select them, then use the bar at the bottom.',
          'Each column shows how many leads and how much money sit in it.'
        ],
        bn: [
          'Card-এর handle ধরে অন্য column-এ টেনে দিলে stage বদলে যায়।',
          'Card-এ click করলে lead খোলে।',
          'Shift চেপে click করে কয়েকটা card select করুন, তারপর নিচের bar ব্যবহার করুন।',
          'প্রতিটা column-এর উপরে কতগুলো lead আর মোট কত টাকা — দেখা যায়।'
        ]
      },
      tips: {
        en: ['"Recent stage moves" at the bottom shows who moved what, and when.'],
        bn: ['নিচে "Recent stage moves"-এ দেখা যায় কে কোন lead কবে সরিয়েছে।']
      }
    },

    followups: {
      icon: 'followup',
      title: { en: 'Follow-ups', bn: 'Follow-ups' },
      summary: {
        en: 'Every lead with a follow-up date, from late to later.',
        bn: 'যেসব lead-এ follow-up date দেওয়া আছে — late থেকে শুরু করে সামনের দিকে।'
      },
      steps: {
        en: [
          'Late ones are at the top in red. Do those first.',
          'Press "Done" after you follow up — it asks when the next one should be.',
          'Pick 14, 30 or 90 days to see further ahead.'
        ],
        bn: [
          'Late গুলো উপরে লাল রঙে থাকে। আগে ওগুলো করুন।',
          'Follow-up করার পর "Done" চাপুন — পরেরটা কবে, জিজ্ঞেস করবে।',
          '14, 30 বা 90 দিন বেছে আরও সামনের তালিকা দেখুন।'
        ]
      },
      tips: {
        en: ['A lead with no follow-up date never shows here — "No next step" on Today finds those.'],
        bn: ['যে lead-এ follow-up date নেই সেটা এখানে আসে না — Today page-এর "No next step" সেগুলো খুঁজে দেয়।']
      }
    },

    meetings: {
      icon: 'meetings',
      title: { en: 'Meetings & proposals', bn: 'Meetings ও proposals' },
      summary: {
        en: 'Schedule meetings, get warned about clashes, and record what came out of them.',
        bn: 'Meeting schedule করুন, সময় মিলে গেলে সতর্কতা পান, আর meeting-এর ফলাফল লিখে রাখুন।'
      },
      steps: {
        en: [
          'Press "Schedule meeting", pick the lead, date, time and length.',
          'If the time overlaps another meeting or a busy slot in your Google Calendar, you see it straight away with the next free time.',
          'After the meeting, open it and fill in what was discussed, the decision and the next step.',
          'Use the date chips to look at today, this week, last month and so on.'
        ],
        bn: [
          '"Schedule meeting" চাপুন, lead, তারিখ, সময় আর কতক্ষণ — বেছে নিন।',
          'সময়টা যদি অন্য meeting বা Google Calendar-এর busy সময়ের সাথে মিলে যায়, সাথে সাথে দেখাবে আর পরের ফাঁকা সময় বলে দেবে।',
          'Meeting শেষে সেটা খুলে কী আলোচনা হলো, কী সিদ্ধান্ত, পরের কাজ কী — লিখুন।',
          'Date chip দিয়ে আজ, এই সপ্তাহ, গত মাস ইত্যাদি দেখুন।'
        ]
      },
      tips: {
        en: ['Changing a meeting\'s time moves the calendar event too — guests and link stay.'],
        bn: ['Meeting-এর সময় বদলালে calendar event-ও সরে যায় — guest আর link ঠিক থাকে।']
      }
    },

    notes: {
      icon: 'notes',
      title: { en: 'Notes', bn: 'Notes' },
      summary: {
        en: 'Quick notes, checklists and to-dos — linked to a lead or on their own.',
        bn: 'ছোট note, checklist আর to-do — কোনো lead-এর সাথে যুক্ত বা আলাদা।'
      },
      steps: {
        en: [
          'Press "New note". Give it a title, write, add a checklist, a colour, labels or a reminder.',
          'Link it to a lead so it also appears in that lead\'s details.',
          'Pin the important ones to keep them on top. Drag to reorder.',
          'Switch to Tasks for a simple to-do list with due dates.'
        ],
        bn: [
          '"New note" চাপুন। Title দিন, লিখুন, checklist, রং, label বা reminder যোগ করুন।',
          'কোনো lead-এর সাথে link করলে সেই lead-এর details-এও দেখা যাবে।',
          'জরুরি note pin করে উপরে রাখুন। টেনে সাজান।',
          'Tasks-এ গেলে due date সহ সহজ to-do list।'
        ]
      },
      tips: { en: [], bn: [] }
    },

    reports: {
      icon: 'report',
      title: { en: 'Reports', bn: 'Reports' },
      summary: {
        en: 'What happened, day by day — and where every lead stands now.',
        bn: 'দিন ধরে ধরে কী কী হয়েছে — আর এখন কোন lead কোথায় আছে।'
      },
      steps: {
        en: [
          '"By date": pick today, this week, last month, or any two dates.',
          'See leads added, follow-ups done, calls, meetings, proposals, wins and losses — each compared with the period before.',
          'Click any number to see the leads behind it. Click a day on the chart for everything that happened that day.',
          '"Pipeline overview" shows where every open lead is right now.',
          '"Export" prints or saves a PDF, makes a CSV for Excel, or sends a Telegram message.'
        ],
        bn: [
          '"By date": আজ, এই সপ্তাহ, গত মাস বা যেকোনো দুই তারিখ বেছে নিন।',
          'কতগুলো lead এলো, follow-up, call, meeting, proposal, জয়-পরাজয় — আগের সময়ের সাথে তুলনা সহ দেখুন।',
          'যেকোনো সংখ্যায় click করলে পেছনের lead দেখাবে। Chart-এ কোনো দিনে click করলে সেদিনের সব কাজ।',
          '"Pipeline overview" দেখায় এখন প্রতিটা open lead কোন stage-এ।',
          '"Export" দিয়ে PDF, Excel-এর জন্য CSV, বা Telegram message।'
        ]
      },
      tips: {
        en: ['A lead added late can be given its real "Date added" — reports count it on that day.'],
        bn: ['দেরিতে ঢোকানো lead-এ আসল "Date added" দিন — report সেই দিনেই গুনবে।']
      }
    },

    analytics: null, // same page as Reports → Pipeline overview

    history: {
      icon: 'history',
      title: { en: 'History', bn: 'History' },
      summary: {
        en: 'Every change, who made it, and what it used to say.',
        bn: 'প্রতিটা পরিবর্তন — কে করেছে, আর আগে কী ছিল।'
      },
      steps: {
        en: [
          'Filter by lead, kind of change, field or person.',
          'Press Undo on a line to put that field back the way it was.',
          'Export CSV for a full record.'
        ],
        bn: [
          'Lead, পরিবর্তনের ধরন, field বা মানুষ অনুযায়ী filter করুন।',
          'কোনো লাইনে Undo চাপলে ওই ঘর আগের অবস্থায় ফেরে।',
          'পুরো রেকর্ডের জন্য Export CSV।'
        ]
      },
      tips: { en: [], bn: [] }
    },

    ai: {
      icon: 'ai',
      title: { en: 'AI assistant', bn: 'AI assistant' },
      summary: {
        en: 'An assistant that knows your whole pipeline. Ask in Bangla or English.',
        bn: 'আপনার পুরো pipeline জানে এমন assistant। বাংলা বা English-এ প্রশ্ন করুন।'
      },
      steps: {
        en: [
          'Ask anything: "Which proposals are waiting longest?", "Write a WhatsApp follow-up for Smile Bright Dental".',
          'Attach a screenshot or a file with the paperclip — it reads them.',
          'Fast model for quick answers, Power model for audits and proposals.',
          '"Custom instructions" tells it how you like answers written.',
          'Old chats stay on the left; start a fresh one with "New chat".'
        ],
        bn: [
          'যা খুশি জিজ্ঞেস করুন: "কোন proposal সবচেয়ে বেশি দিন ধরে অপেক্ষায়?", "Smile Bright Dental-এর জন্য WhatsApp follow-up লিখে দাও"।',
          'Paperclip দিয়ে screenshot বা file দিন — পড়ে নেবে।',
          'দ্রুত উত্তরে Fast model, audit বা proposal-এ Power model।',
          '"Custom instructions"-এ বলে দিন কেমন করে উত্তর চান।',
          'পুরনো chat বামে থাকে; নতুন শুরু করতে "New chat"।'
        ]
      },
      tips: {
        en: ['The admin chooses which AI services it uses (Admin → AI providers). If one fails it moves to the next by itself.'],
        bn: ['কোন AI service ব্যবহার হবে admin ঠিক করে (Admin → AI providers)। একটা কাজ না করলে নিজে থেকে পরেরটায় চলে যায়।']
      }
    },

    messages: {
      icon: 'messages',
      title: { en: 'Messages', bn: 'Messages' },
      summary: {
        en: 'Ready-made English messages. Pick a lead and the blanks fill themselves.',
        bn: 'তৈরি করা English message। Lead বাছলে ফাঁকা জায়গা নিজে নিজে ভরে যায়।'
      },
      steps: {
        en: ['Choose a lead at the top.', 'Pick a template, check the text, then copy it, open WhatsApp, or send it by email.'],
        bn: ['উপরে একটা lead বাছুন।', 'Template বেছে লেখাটা দেখে নিন, তারপর copy, WhatsApp খুলুন বা email-এ পাঠান।']
      },
      tips: {
        en: ['Edit the templates in Settings → General so they sound like you.'],
        bn: ['Settings → General-এ template নিজের মতো করে নিন।']
      }
    },

    docs: {
      icon: 'docs',
      title: { en: 'Documents', bn: 'Documents' },
      summary: {
        en: 'Proposals, audits and files — kept with the lead they belong to.',
        bn: 'Proposal, audit আর file — যে lead-এর, তার সাথেই রাখা।'
      },
      steps: {
        en: ['Press "Add document" and paste a link or upload a file.', 'Link it to a lead so it shows in that lead\'s details.'],
        bn: ['"Add document" চাপুন, link দিন বা file upload করুন।', 'কোনো lead-এর সাথে link করলে সেই lead-এর details-এ দেখা যাবে।']
      },
      tips: { en: [], bn: [] }
    },

    archive: {
      icon: 'archive',
      title: { en: 'Archive', bn: 'Archive' },
      summary: {
        en: 'Won, lost and archived leads. Restore any of them — or delete them for good.',
        bn: 'Won, lost আর archive করা lead। যেকোনোটা ফেরত আনুন — বা একদম মুছে ফেলুন।'
      },
      steps: {
        en: [
          '"Archive" on a lead sends it here. Nothing is lost: press "Restore" to bring it back.',
          'The bin icon next to an archived lead deletes it for good — with its meetings, notes and history.',
          '"Empty archive" deletes every archived lead at once. You type DELETE first, so it never happens by accident.'
        ],
        bn: [
          'কোনো lead-এ "Archive" চাপলে এখানে আসে। কিছু হারায় না: "Restore" চাপলে ফেরত আসে।',
          'Archive করা lead-এর পাশের bin icon চাপলে lead একদম delete হয় — তার meeting, note, history সহ।',
          '"Empty archive" সব archive করা lead একসাথে মুছে দেয়। আগে DELETE লিখতে হয়, তাই ভুল করে হবে না।'
        ]
      },
      tips: {
        en: ['Deleting for good cannot be undone. Only managers and admins see the bin.'],
        bn: ['একদম delete করলে আর ফেরত আনা যায় না। শুধু manager আর admin bin icon দেখেন।']
      }
    },

    admin: {
      icon: 'shield',
      title: { en: 'Admin', bn: 'Admin' },
      summary: {
        en: 'People, accounts, AI keys, Telegram and everything that runs on its own.',
        bn: 'মানুষ, account, AI key, Telegram আর যা নিজে নিজে চলে — সব এখানে।'
      },
      steps: {
        en: [
          'People → "Give someone access": type their email and choose Admin, their own account, or custom access (Manager, Editor or Viewer per account).',
          'The bin next to a person deletes them for good. You can also delete the accounts only they used.',
          'Accounts → "New account" makes a separate dashboard with its own spreadsheet. Pick "Same dashboard as…" to copy the setup without any leads.',
          'The bin on an account card deletes the account. Its spreadsheet goes to the Google Drive trash for 30 days.',
          'AI providers → add keys for OpenRouter, Gemini, Groq and others. Use the arrows to choose the order; "Test every key" checks them.',
          'Platform → "Google sign-in check" tells you exactly what Google needs if the Google button does not work.'
        ],
        bn: [
          'People → "Give someone access": email লিখুন, তারপর Admin, তাদের নিজের account, নাকি custom access (প্রতি account-এ Manager, Editor বা Viewer) — বাছুন।',
          'কারও পাশের bin চাপলে তাকে একদম delete করা যায়। শুধু তার ব্যবহার করা account গুলোও সাথে delete করা যায়।',
          'Accounts → "New account" আলাদা spreadsheet সহ আলাদা dashboard বানায়। "Same dashboard as…" বাছলে setup copy হয়, কোনো lead আসে না।',
          'Account card-এর bin চাপলে account delete হয়। তার spreadsheet Google Drive-এর trash-এ ৩০ দিন থাকে।',
          'AI providers → OpenRouter, Gemini, Groq ইত্যাদির key দিন। তীর দিয়ে ক্রম ঠিক করুন; "Test every key" চেক করে।',
          'Platform → "Google sign-in check" বলে দেয় Google button কাজ না করলে Google-এ ঠিক কী যোগ করতে হবে।'
        ]
      },
      tips: {
        en: ['Every account keeps its leads in its own spreadsheet. A lead only goes to another account when someone moves or copies it.'],
        bn: ['প্রতিটা account-এর lead তার নিজের spreadsheet-এ থাকে। কেউ নিজে Move/Copy না করলে lead অন্য account-এ যায় না।']
      }
    },

    settings: {
      icon: 'settings',
      title: { en: 'Settings', bn: 'Settings' },
      summary: {
        en: 'This account\'s setup — stages, AI, Telegram, booking page, calendar and data.',
        bn: 'এই account-এর setup — stage, AI, Telegram, booking page, calendar আর data।'
      },
      steps: {
        en: [
          'Pipeline: add, rename, recolour or reorder stages, priorities, sources and labels.',
          'Telegram: connect your phone to get reminders, daily briefs and reports.',
          'Booking page: turn on a public link where clients book a free slot themselves.',
          'Calendar: choose whether follow-ups and meetings go to your Google Calendar.',
          'Data & account: back up now, export, or check the sheet.'
        ],
        bn: [
          'Pipeline: stage, priority, source, label যোগ, নাম বদল, রং বদল বা ক্রম বদল।',
          'Telegram: phone যুক্ত করে reminder, daily brief আর report পান।',
          'Booking page: একটা public link চালু করুন যেখানে client নিজে ফাঁকা সময় book করে।',
          'Calendar: follow-up আর meeting Google Calendar-এ যাবে কিনা ঠিক করুন।',
          'Data & account: এখনই backup, export বা sheet দেখা।'
        ]
      },
      tips: {
        en: ['Settings belong to the account, so they follow you to any device.'],
        bn: ['Settings account-এর সাথে save হয়, তাই যেকোনো device-এ একই থাকে।']
      }
    },

    guide: {
      icon: 'help',
      title: { en: 'Guide', bn: 'Guide (নির্দেশিকা)' },
      summary: {
        en: 'How everything works, in one place. Ask the AI if something is not here.',
        bn: 'সব কিছু কীভাবে কাজ করে — এক জায়গায়। এখানে না পেলে AI-কে জিজ্ঞেস করুন।'
      },
      steps: { en: [], bn: [] },
      tips: { en: [], bn: [] }
    }
  },

  /* Things that are not one page. Shown on the Guide page. */
  topics: [
    {
      id: 'lead-detail', icon: 'leads',
      title: { en: 'One lead, in detail', bn: 'একটা lead-এর details' },
      en: [
        'Click any lead to open it on the right.',
        'Click a field to change it. Changes save by themselves.',
        '"Log what just happened" records a call, message or visit in one line.',
        'Actions: Share, Schedule meeting, Write email, Audit site, Proposal, "Where it stands" (an AI summary), Move / copy, Archive, Delete forever.',
        'The Activity tab shows everything that ever happened to this lead.'
      ],
      bn: [
        'যেকোনো lead-এ click করলে ডানে খোলে।',
        'কোনো ঘরে click করে বদলান। নিজে নিজে save হয়।',
        '"Log what just happened"-এ এক লাইনে call, message বা visit লিখুন।',
        'Actions: Share, Schedule meeting, Write email, Audit site, Proposal, "Where it stands" (AI summary), Move / copy, Archive, Delete forever।',
        'Activity tab-এ এই lead-এর সব ইতিহাস।'
      ]
    },
    {
      id: 'accounts', icon: 'pipeline',
      title: { en: 'Accounts (workspaces)', bn: 'Accounts (workspace)' },
      en: [
        'The name at the top left is the account you are in. Every lead you add goes into that account only.',
        'Click it to switch. Accounts other than main show in a different colour so you always know where you are.',
        'When adding a lead you can pick a different account right in the form.',
        'To send leads to another account on purpose, open a lead (or select several) and press "Move / copy".',
        'Move takes them out of this account. Copy leaves them here too.'
      ],
      bn: [
        'উপরে বামে যে নাম, সেটাই আপনার এখনকার account। যে lead যোগ করবেন, শুধু ওই account-এ যাবে।',
        'নামে click করে account বদলান। main ছাড়া অন্য account হলে রং আলাদা দেখায়, তাই সবসময় বোঝা যায় কোথায় আছেন।',
        'Lead add করার form-এই চাইলে অন্য account বেছে নিতে পারেন।',
        'ইচ্ছা করে অন্য account-এ পাঠাতে lead খুলে (বা কয়েকটা select করে) "Move / copy" চাপুন।',
        'Move করলে এখান থেকে চলে যায়। Copy করলে এখানেও থাকে।'
      ]
    },
    {
      id: 'delete', icon: 'trash',
      title: { en: 'Archive vs delete for good', bn: 'Archive বনাম একদম delete' },
      en: [
        'Archive hides a lead and keeps it safe. Restore any time from the Archive page.',
        'Delete forever removes the lead and its meetings, notes, tasks, documents and history from the spreadsheet. It cannot be undone.',
        'You can delete one lead (its details or the Archive page), everything you selected (the bar at the bottom), or the whole archive ("Empty archive").'
      ],
      bn: [
        'Archive করলে lead লুকানো থাকে কিন্তু নিরাপদ। Archive page থেকে যেকোনো সময় Restore।',
        'Delete forever করলে lead আর তার meeting, note, task, document, history — spreadsheet থেকে মুছে যায়। আর ফেরত আসে না।',
        'একটা lead (details বা Archive page থেকে), select করা সবগুলো (নিচের bar), বা পুরো archive ("Empty archive") — delete করা যায়।'
      ]
    },
    {
      id: 'photo', icon: 'camera',
      title: { en: 'Your profile photo', bn: 'আপনার profile photo' },
      en: ['Tap your avatar at the top right, then "Change photo". Pick any JPG or PNG — it is cropped to a circle for you.', 'People who sign in with Google get their Google photo until they upload their own.'],
      bn: ['উপরে ডানে নিজের avatar-এ চাপুন, তারপর "Change photo"। যেকোনো JPG বা PNG বাছুন — নিজে থেকে গোল করে কেটে নেবে।', 'Google দিয়ে sign in করলে নিজের ছবি না দেওয়া পর্যন্ত Google-এর ছবি দেখায়।']
    },
    {
      id: 'signin', icon: 'shield',
      title: { en: 'Signing in', bn: 'Sign in' },
      en: [
        'Type your email and you get a 6-digit code — no password to remember.',
        'Or press "Sign in with Google". If the button says there is a problem, the admin opens Admin → Platform → "Google sign-in check" and follows the steps.',
        'Someone new asks for access from the same screen; the admin approves them in Admin → People (and on Telegram).'
      ],
      bn: [
        'Email লিখলে ৬ সংখ্যার code আসে — কোনো password মনে রাখতে হয় না।',
        'অথবা "Sign in with Google"। Button-এ সমস্যা লেখা থাকলে admin Admin → Platform → "Google sign-in check" খুলে ধাপগুলো মানবেন।',
        'নতুন কেউ একই screen থেকে access চায়; admin Admin → People থেকে (বা Telegram-এ) approve করেন।'
      ]
    },
    {
      id: 'offline', icon: 'sync',
      title: { en: 'Offline, undo and sync', bn: 'Offline, undo আর sync' },
      en: [
        'Edits made without internet are kept and sent when the connection returns. The dot at the top shows the state.',
        'Ctrl+Z (or the undo arrow) takes back your last change.',
        'The circular arrows pull the latest from the sheet.'
      ],
      bn: [
        'Internet ছাড়া করা edit জমা থাকে, connection ফিরলে চলে যায়। উপরের dot অবস্থা দেখায়।',
        'Ctrl+Z (বা undo তীর) শেষ পরিবর্তন ফিরিয়ে নেয়।',
        'গোল তীর চাপলে sheet থেকে সর্বশেষ তথ্য আনে।'
      ]
    },
    {
      id: 'telegram', icon: 'tg',
      title: { en: 'Telegram', bn: 'Telegram' },
      en: ['Settings → Telegram connects your phone. You get reminders, the morning brief, weekly and monthly reports.', 'You can also ask the bot: /report week, /report lastmonth, /report 2026-10-25.'],
      bn: ['Settings → Telegram দিয়ে phone যুক্ত করুন। Reminder, সকালের brief, সাপ্তাহিক ও মাসিক report আসবে।', 'Bot-কে লিখতেও পারেন: /report week, /report lastmonth, /report 2026-10-25।']
    },
    {
      id: 'keys', icon: 'search',
      title: { en: 'Keyboard shortcuts', bn: 'Keyboard shortcut' },
      en: ['N — add a lead', '/ — search leads', 'Ctrl+K — jump to anything', 'Ctrl+Z — undo', 'Esc — close what is open', '? — help for this page',
           'g then t / l / p / f / m / n / r / h / a / d / x / s / g / i — Today, Leads, Pipeline, Follow-ups, Meetings, Notes, Reports, History, AI, Documents, Archive, Settings, Guide, Admin',
           'In a lead: type in "Log what just happened" and press Enter'],
      bn: ['N — নতুন lead', '/ — lead খুঁজুন', 'Ctrl+K — যেকোনো জায়গায় যান', 'Ctrl+Z — undo', 'Esc — খোলা জিনিস বন্ধ', '? — এই page-এর help',
           'g চেপে তারপর t / l / p / f / m / n / r / h / a / d / x / s / g / i — Today, Leads, Pipeline, Follow-ups, Meetings, Notes, Reports, History, AI, Documents, Archive, Settings, Guide, Admin',
           'লিডের ভেতরে "Log what just happened"-এ লিখে Enter চাপুন']
    },
    {
      id: 'deen', icon: 'book',
      title: { en: 'Quran & Hadith panel', bn: 'কোরআন ও হাদিস' },
      en: [
        'On a big screen the right side shows an ayah and a hadith; on smaller screens press the book icon at the top.',
        'A new one comes every 10 minutes and every time you open the dashboard. Change the time and topics with ⚙ in the panel.',
        'Bangla first. Press English (or عربي for hadith) to switch. "তাফসীর দেখুন" opens the explanation.',
        'The clock icon is the history: every ayah and hadith ever shown, with the time. Search it, star the ones you love, export them.',
        'The words always come from the sources (alquran.cloud, quran.com, hadith-api) — nothing is written by AI.'
      ],
      bn: [
        'বড় স্ক্রিনে ডান পাশে আয়াত ও হাদিস থাকে; ছোট স্ক্রিনে উপরের বই আইকনে চাপুন।',
        'প্রতি ১০ মিনিটে আর প্রতিবার dashboard খুললে নতুন আসে। Panel-এর ⚙ থেকে সময় আর বিষয় বদলান।',
        'আগে বাংলা। English (হাদিসে عربي) চাপলে ভাষা বদলায়। "তাফসীর দেখুন" চাপলে ব্যাখ্যা খোলে।',
        'ঘড়ি আইকনে ইতিহাস: কখন কোন আয়াত/হাদিস দেখানো হয়েছিল, সব। খুঁজুন, ★ দিয়ে রাখুন, export করুন।',
        'লেখা সবসময় উৎস থেকে আসে (alquran.cloud, quran.com, hadith-api) — AI দিয়ে কিছু বানানো হয় না।'
      ]
    },
    {
      id: 'notif', icon: 'bell',
      title: { en: 'Notifications (the bell)', bn: 'Notification (ঘণ্টা)' },
      en: [
        'The bell at the top collects everything: problems, meetings about to start, follow-ups due, people asking for access, updates, and each ayah and hadith.',
        'Tabs filter them. Click one to go straight to it. "Desktop-এও দেখাও" also shows meeting alerts outside the browser.'
      ],
      bn: [
        'উপরের ঘণ্টায় সব জমা হয়: সমস্যা, শুরু হতে যাওয়া মিটিং, follow-up, access চাওয়া, update, আর প্রতিটা আয়াত ও হাদিস।',
        'Tab দিয়ে ভাগ করুন। কোনোটায় চাপলে সরাসরি সেখানে যায়। "Desktop-এও দেখাও" চাপলে browser-এর বাইরেও মিটিংয়ের সতর্কতা আসে।'
      ]
    },
    {
      id: 'calendar', icon: 'meetings',
      title: { en: 'Each account’s own Google Calendar', bn: 'প্রতিটা account-এর নিজের Google Calendar' },
      en: [
        'Settings → Calendar → "Connect Google Calendar", sign in with the Gmail you want (for example abc@gmail.com). Meetings of this account go there, and its busy times block double-booking and the booking page.',
        'No Google client secret yet? Use "Use a shared calendar": share that calendar with the tracker’s Google account ("Make changes to events") and type the Gmail.',
        'Every account has its own calendar. Nothing goes into the owner’s calendar unless the admin picks "Use the owner’s calendar".',
        'Admin, once: Admin → Platform → add the Google client secret, then follow "Google sign-in check" (redirect URI, Calendar API, scope).'
      ],
      bn: [
        'Settings → Calendar → "Connect Google Calendar", তারপর যে Gmail চান সেটা দিয়ে sign in করুন (যেমন abc@gmail.com)। এই account-এর মিটিং ওখানে যাবে, আর ওই calendar-এর busy সময়ে ডাবল বুকিং হবে না।',
        'Google client secret না থাকলে "Use a shared calendar": ওই calendar-টা tracker-এর Google account-এর সাথে share করুন ("Make changes to events"), তারপর Gmail লিখুন।',
        'প্রতিটা account-এর calendar আলাদা। Admin "Use the owner’s calendar" না বাছলে owner-এর calendar-এ কিছু যায় না।',
        'Admin, একবার: Admin → Platform → Google client secret দিন, তারপর "Google sign-in check"-এর ধাপ মানুন (redirect URI, Calendar API, scope)।'
      ]
    },
    {
      id: 'reminders', icon: 'tg',
      title: { en: 'Meeting reminders on Telegram', bn: 'Telegram-এ মিটিংয়ের রিমাইন্ডার' },
      en: [
        'Before every meeting, Telegram tells the people of that account: time, lead, phone, link, agenda — and the first reminder carries an AI brief from the lead’s notes.',
        'Settings → Telegram → "Meeting reminders": choose 1 day / 2 h / 1 h / 30 / 15 / 10 / 5 minutes before, AI on or off, Bangla or English.',
        'Open any meeting → "Send me a test reminder" to see it right now.'
      ],
      bn: [
        'প্রতিটা মিটিংয়ের আগে Telegram ওই account-এর মানুষদের জানায়: সময়, লিড, ফোন, লিংক, এজেন্ডা — আর প্রথম রিমাইন্ডারে লিডের নোট থেকে AI প্রস্তুতি।',
        'Settings → Telegram → "Meeting reminders": ১ দিন / ২ ঘণ্টা / ১ ঘণ্টা / ৩০ / ১৫ / ১০ / ৫ মিনিট আগে — বাছুন, AI চালু/বন্ধ, বাংলা বা English।',
        'যেকোনো মিটিং খুলে "Send me a test reminder" চাপলে এখনই দেখতে পাবেন।'
      ]
    },
    {
      id: 'api', icon: 'link',
      title: { en: 'API, webhooks, n8n and the Chrome extension', bn: 'API, webhook, n8n আর Chrome extension' },
      en: [
        'Settings → API & integrations: make a key, add a webhook (n8n, Make, Zapier), and follow the step-by-step for n8n and the Chrome extension.',
        'Webhooks send lead.created, lead.updated, meeting.created and more as JSON the moment they happen, signed with your secret.',
        'The admin decides who may use this: Admin → People → Access → Customize → "API & integrations". Switching it off stops that person’s keys at once.',
        'AI providers the admin adds (Admin → AI providers) work for everyone automatically — nobody else sets anything up.'
      ],
      bn: [
        'Settings → API & integrations: key বানান, webhook যোগ করুন (n8n, Make, Zapier), আর n8n ও Chrome extension-এর ধাপগুলো মানুন।',
        'Webhook সাথে সাথে lead.created, lead.updated, meeting.created ইত্যাদি JSON আকারে পাঠায়, আপনার secret দিয়ে signed।',
        'কে এটা ব্যবহার করবে admin ঠিক করেন: Admin → People → Access → Customize → "API & integrations"। বন্ধ করলে তার key সাথে সাথে বন্ধ হয়।',
        'Admin যে AI provider যোগ করেন (Admin → AI providers), সেটা সবার জন্য নিজে থেকেই কাজ করে — কাউকে আলাদা setup করতে হয় না।'
      ]
    },
    {
      id: 'trash', icon: 'trash',
      title: { en: 'Trash and deleting everything', bn: 'Trash আর সব কিছু মুছে ফেলা' },
      en: [
        'Archive page, bottom: Trash for deleted meetings, notes, tasks, documents and AI chats — Restore or delete for good, or "Empty trash (all)".',
        'Admin → Accounts → "Empty" clears an account’s data but keeps its setup; the bin deletes the whole account; Admin → People → bin deletes a person with every trace (Telegram link, owned accounts, assignments).'
      ],
      bn: [
        'Archive page-এর নিচে Trash: মুছে ফেলা মিটিং, নোট, task, document, AI chat — Restore বা একদম delete, বা "Empty trash (all)"।',
        'Admin → Accounts → "Empty" দিলে account-এর ডেটা মুছে যায়, setup থাকে; bin দিলে পুরো account delete; Admin → People → bin দিলে person-এর সব চিহ্ন (Telegram link, account, assign) মুছে যায়।'
      ]
    },
    {
      id: 'version', icon: 'history',
      title: { en: 'Versions and updates', bn: 'Version আর update' },
      en: ['The version number is at the bottom of the menu. Click it for what is new.', 'When a new version is published, a bar at the top says so — press Reload.'],
      bn: ['Version নম্বর menu-র একদম নিচে। Click করলে নতুন কী এসেছে দেখায়।', 'নতুন version publish হলে উপরে একটা bar আসে — Reload চাপুন।']
    }
  ]
};
