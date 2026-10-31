/* ═══════════════════════════════════════════════════════════════════════════
   deen.js — what the Quran & Hadith panel chooses from.

   Only REFERENCES live here (surah:ayah, hadith chapters). The words are
   always fetched from established sources, so nothing is ever typed from
   memory or written by an AI:
     • Quran — api.alquran.cloud: Arabic (Uthmani), Bangla (Muhiuddin Khan),
       English (Saheeh International)
     • Tafsir — api.quran.com: Ahsanul Bayaan, Ibn Kathir, Abu Bakr Zakaria,
       Fathul Majid (Bangla)
     • Hadith — fawazahmed0/hadith-api (jsDelivr): Bukhari, Muslim, Tirmidhi
       in Bangla, English and Arabic, picked from whole chapters by topic

   Weights decide how often a topic comes up. Jihad, taqwa and holding to the
   deen come up most, as asked; every topic still appears.
   ═══════════════════════════════════════════════════════════════════════════ */
var DEEN = {
  ayahThemes: {
    jihad: {
      label: 'জিহাদ ও সাহস', weight: 30,
      refs: ['2:154', '2:190', '2:193', '2:216', '2:218', '2:244', '2:249', '2:250', '3:13', '3:123', '3:126',
             '3:139', '3:140', '3:142', '3:146', '3:157', '3:160', '3:169', '3:170', '3:173', '3:200',
             '4:74', '4:75', '4:76', '4:84', '4:95', '4:104', '5:54', '8:10', '8:15', '8:16', '8:17', '8:45', '8:46',
             '8:60', '8:65', '8:74', '9:14', '9:20', '9:24', '9:25', '9:26', '9:38', '9:40', '9:41', '9:52', '9:111',
             '9:120', '22:39', '22:40', '22:78', '29:6', '29:69', '33:23', '47:4', '47:7', '47:31', '47:35', '48:29',
             '49:15', '57:25', '61:4', '61:10', '61:11', '61:12', '61:13']
    },
    taqwa: {
      label: 'তাকওয়া ও আখিরাত', weight: 18,
      refs: ['2:197', '2:281', '3:14', '3:102', '3:133', '3:185', '4:1', '6:32', '8:2', '8:29', '9:119', '18:46',
             '21:47', '22:1', '23:115', '29:64', '31:33', '33:70', '35:28', '39:10', '49:13', '50:16', '57:16',
             '57:20', '59:18', '64:16', '65:2', '65:3', '67:12', '79:40', '79:41', '82:19', '84:6', '99:7', '99:8', '103:3']
    },
    deen: {
      label: 'দ্বীন মেনে চলা', weight: 17,
      refs: ['2:2', '2:208', '2:256', '2:285', '3:19', '3:31', '3:32', '3:85', '3:103', '3:104', '3:110', '3:132',
             '4:59', '4:69', '4:80', '4:136', '5:3', '6:153', '6:162', '6:163', '7:3', '16:97', '16:125', '24:51',
             '24:52', '33:21', '33:36', '33:71', '41:30', '41:33', '42:13', '45:18', '47:33', '51:56', '59:7']
    },
    salat: {
      label: 'নামাজ', weight: 10,
      refs: ['2:43', '2:45', '2:110', '2:153', '2:238', '4:103', '11:114', '14:40', '17:78', '19:59', '20:14',
             '23:1', '23:2', '23:9', '29:45', '30:31', '62:9', '62:10', '70:23', '73:20', '98:5', '107:4', '107:5']
    },
    sawm: {
      label: 'রোজা', weight: 5,
      refs: ['2:183', '2:184', '2:185', '2:186', '2:187', '33:35', '97:1', '97:3']
    },
    zakat: {
      label: 'যাকাত ও দান', weight: 7,
      refs: ['2:245', '2:261', '2:262', '2:267', '2:274', '2:277', '3:92', '9:34', '9:60', '9:103', '30:39',
             '57:7', '57:18', '63:10']
    },
    hajj: {
      label: 'হজ্জ', weight: 5,
      refs: ['2:125', '2:158', '2:196', '3:96', '3:97', '5:97', '22:26', '22:27', '22:28', '22:29']
    },
    sabr: {
      label: 'সবর, তাওয়াক্কুল ও দোয়া', weight: 8,
      refs: ['2:155', '2:156', '2:157', '3:159', '11:115', '12:87', '13:28', '16:96', '16:127', '31:17',
             '39:53', '40:60', '94:5', '94:6']
    }
  },

  /* Hadith: chapters are matched by their English titles in the source, so a
     chapter is never mislabelled. The fallback numbers are used only if the
     list of chapters cannot be loaded. */
  hadithThemes: {
    jihad: { label: 'জিহাদ', weight: 30, match: /jihad|fighting|military|expedition|maghaz|campaign|martyr|virtues of jihad/i,
             fallback: { bukhari: [56, 64], muslim: [33], tirmidhi: [22, 23] } },
    iman:  { label: 'ঈমান, তাকওয়া ও আখিরাত', weight: 22, match: /belief|faith|\biman\b|heart|riqaq|zuhd|asceticism|repentance|remembrance|invocation|supplication|resurrection|paradise|hell|fitan|tribulation/i,
             fallback: { bukhari: [2, 81, 80], muslim: [1, 48, 55], tirmidhi: [38, 45] } },
    deen:  { label: 'দ্বীন ও জ্ঞান', weight: 11, match: /knowledge|holding fast|sunnah|virtues of the qur|good manners|adab|righteousness|kindness/i,
             fallback: { bukhari: [3, 96, 66, 78], muslim: [45], tirmidhi: [41, 27] } },
    salat: { label: 'নামাজ', weight: 13, match: /prayer|salat|adhan|call to prayer|friday|mosque|witr|tahajjud|night prayer|eclipse/i,
             fallback: { bukhari: [8, 9, 10, 11], muslim: [4, 5, 7], tirmidhi: [2, 4] } },
    sawm:  { label: 'রোজা', weight: 8, match: /fast|siyam|sawm|itikaf|i'tikaf|tarawih|laylat/i,
             fallback: { bukhari: [30, 31, 32], muslim: [13], tirmidhi: [8] } },
    zakat: { label: 'যাকাত ও দান', weight: 8, match: /zakat|charity|sadaq/i,
             fallback: { bukhari: [24], muslim: [12], tirmidhi: [7] } },
    hajj:  { label: 'হজ্জ', weight: 8, match: /hajj|pilgrim|umrah|manasik/i,
             fallback: { bukhari: [25, 26, 27], muslim: [15], tirmidhi: [9] } }
  },

  books: {
    bukhari:  { bn: 'সহীহ বুখারী', en: 'Sahih al-Bukhari', weight: 50 },
    muslim:   { bn: 'সহীহ মুসলিম', en: 'Sahih Muslim', weight: 30 },
    tirmidhi: { bn: 'জামে আত-তিরমিজি', en: "Jami' at-Tirmidhi", weight: 20 }
  },

  tafsirs: [
    { id: 165, name: 'তাফসীর আহসানুল বায়ান' },
    { id: 164, name: 'তাফসীর ইবনে কাসীর' },
    { id: 166, name: 'তাফসীর আবু বকর যাকারিয়া' },
    { id: 381, name: 'তাফসীর ফাতহুল মাজীদ' }
  ],

  surahBn: ['আল-ফাতিহা', 'আল-বাকারা', 'আলে ইমরান', 'আন-নিসা', 'আল-মায়িদা', 'আল-আনআম', 'আল-আরাফ', 'আল-আনফাল',
    'আত-তাওবা', 'ইউনুস', 'হুদ', 'ইউসুফ', 'আর-রাদ', 'ইবরাহীম', 'আল-হিজর', 'আন-নাহল', 'বনী ইসরাঈল', 'আল-কাহফ',
    'মারইয়াম', 'ত্বা-হা', 'আল-আম্বিয়া', 'আল-হাজ্জ', 'আল-মুমিনূন', 'আন-নূর', 'আল-ফুরকান', 'আশ-শুআরা', 'আন-নামল',
    'আল-কাসাস', 'আল-আনকাবূত', 'আর-রূম', 'লুকমান', 'আস-সাজদা', 'আল-আহযাব', 'সাবা', 'ফাতির', 'ইয়াসীন',
    'আস-সাফফাত', 'সোয়াদ', 'আয-যুমার', 'আল-মুমিন (গাফির)', 'হা-মীম আস-সাজদা (ফুসসিলাত)', 'আশ-শূরা', 'আয-যুখরুফ',
    'আদ-দুখান', 'আল-জাসিয়া', 'আল-আহকাফ', 'মুহাম্মাদ', 'আল-ফাতহ', 'আল-হুজুরাত', 'ক্বাফ', 'আয-যারিয়াত', 'আত-তূর',
    'আন-নাজম', 'আল-ক্বামার', 'আর-রাহমান', 'আল-ওয়াকিআ', 'আল-হাদীদ', 'আল-মুজাদালা', 'আল-হাশর', 'আল-মুমতাহিনা',
    'আস-সফ', 'আল-জুমুআ', 'আল-মুনাফিকূন', 'আত-তাগাবুন', 'আত-তালাক', 'আত-তাহরীম', 'আল-মুলক', 'আল-ক্বালাম',
    'আল-হাক্কাহ', 'আল-মাআরিজ', 'নূহ', 'আল-জ্বিন', 'আল-মুযযাম্মিল', 'আল-মুদ্দাসসির', 'আল-ক্বিয়ামাহ', 'আদ-দাহর (আল-ইনসান)',
    'আল-মুরসালাত', 'আন-নাবা', 'আন-নাযিআত', 'আবাসা', 'আত-তাকভীর', 'আল-ইনফিতার', 'আল-মুতাফফিফীন', 'আল-ইনশিকাক',
    'আল-বুরূজ', 'আত-তারিক', 'আল-আলা', 'আল-গাশিয়া', 'আল-ফাজর', 'আল-বালাদ', 'আশ-শামস', 'আল-লাইল', 'আদ-দুহা',
    'আল-ইনশিরাহ', 'আত-তীন', 'আল-আলাক', 'আল-ক্বাদর', 'আল-বাইয়্যিনাহ', 'আয-যিলযাল', 'আল-আদিয়াত', 'আল-ক্বারিআহ',
    'আত-তাকাসুর', 'আল-আসর', 'আল-হুমাযাহ', 'আল-ফীল', 'কুরাইশ', 'আল-মাঊন', 'আল-কাওসার', 'আল-কাফিরূন', 'আন-নাসর',
    'আল-লাহাব', 'আল-ইখলাস', 'আল-ফালাক', 'আন-নাস'],

  /* The number of ayat in each surah, used to check every reference above. */
  ayahCount: [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118,
    64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49,
    62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29,
    19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]
};
