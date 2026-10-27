// Focus Mode — Türkçe/İngilizce metinler.
// Popup, engel sayfası ve arka plan (bildirimler) bu dosyayı ortak kullanır.

const I18N = {
  tr: {
    ready: 'Hazır',
    focusLabel: 'Odak zamanı',
    breakLabel: 'Mola 🌿',
    focusLeft: '{time} odak kaldı',
    start: 'Odaklan',
    pause: '☕ Mola ver',
    resume: 'Odaklanmaya devam et',
    newPomodoro: 'Yeni pomodoro',
    stop: 'Durdur',
    statMin: 'dk odak',
    statSessions: 'pomodoro',
    statAttempts: 'engellenen',
    topSite: 'En çok girmeye çalıştığın: {site} ({n} kez)',
    sitesTitle: 'Engellenecek siteler',
    siteCount: '{on}/{all} açık',
    lockNote: '🔒 Odak sürerken site kapatılamaz, sadece eklenebilir.',
    reloadNote: "Liste yüklenemedi. chrome://extensions sayfasında Focus Mode'un yenile (↻) butonuna bas.",
    addPlaceholder: 'Site ekle: ornek.com ya da link',
    add: 'Ekle',
    remove: 'Listeden kaldır',
    invalidSite: 'Geçerli bir site adresi gir (ör. ornek.com).',
    durations: 'Süre ayarları',
    focusMin: 'Odak (dk)',
    breakMin: 'Mola (dk)',
    saved: 'Kaydedildi ✓',

    notifDoneTitle: 'Pomodoro tamamlandı! 🍅',
    notifDoneMsg: 'Harika iş. Şimdi {n} dakika mola.',
    notifBreakTitle: 'Mola bitti ⏰',
    notifBreakResume: 'Odaklanmaya kaldığın yerden devam ediyorsun.',
    notifBreakNew: 'Yeni bir pomodoroya hazır mısın?',

    blockedPageTitle: 'Odaklanma zamanı',
    blockedTitle: 'Şu an odaklanma zamanı',
    canWait: '{host} biraz bekleyebilir.',
    thisSite: 'Bu site',
    attempts: 'Bugün {host} sitesine {n}. kez girmeye çalıştın.',
    focusDone: 'Odak bitti, tebrikler! 🎉',
    breakTime: 'Mola zamanı ☕',
    continue: 'Siteye devam et →',
    quotes: [
      'Sonra bakarsın. Şimdi sadece bir iş.',
      'Bu sekme kaçmıyor, ama bu dakikalar kaçıyor.',
      'Küçük adımlar, büyük işler. Bir pomodoro daha.',
      'Dikkatin en değerli şeyin. Onu buraya harcama.',
      'Odaklanınca iş yarı sürede biter. Az kaldı.',
      'Bitirdiğinde bu site yine burada olacak.',
    ],
  },
  en: {
    ready: 'Ready',
    focusLabel: 'Focus time',
    breakLabel: 'Break 🌿',
    focusLeft: '{time} focus left',
    start: 'Focus',
    pause: '☕ Take a break',
    resume: 'Continue focusing',
    newPomodoro: 'New pomodoro',
    stop: 'Stop',
    statMin: 'min focus',
    statSessions: 'pomodoros',
    statAttempts: 'blocked',
    topSite: 'Most attempted: {site} ({n}×)',
    sitesTitle: 'Blocked sites',
    siteCount: '{on}/{all} on',
    lockNote: '🔒 Sites can’t be turned off during focus, only added.',
    reloadNote: 'Couldn’t load the list. Click Focus Mode’s reload (↻) button on chrome://extensions.',
    addPlaceholder: 'Add site: example.com or a link',
    add: 'Add',
    remove: 'Remove from list',
    invalidSite: 'Enter a valid site address (e.g. example.com).',
    durations: 'Timer settings',
    focusMin: 'Focus (min)',
    breakMin: 'Break (min)',
    saved: 'Saved ✓',

    notifDoneTitle: 'Pomodoro complete! 🍅',
    notifDoneMsg: 'Great work. Now take a {n}-minute break.',
    notifBreakTitle: 'Break is over ⏰',
    notifBreakResume: 'Picking up your focus where you left off.',
    notifBreakNew: 'Ready for another pomodoro?',

    blockedPageTitle: 'Focus time',
    blockedTitle: 'It’s focus time',
    canWait: '{host} can wait a little.',
    thisSite: 'This site',
    attempts: 'That’s attempt #{n} on {host} today.',
    focusDone: 'Focus done, nice work! 🎉',
    breakTime: 'Break time ☕',
    continue: 'Continue to site →',
    quotes: [
      'Check it later. Right now, just one thing.',
      'This tab isn’t going anywhere, but these minutes are.',
      'Small steps, big results. One more pomodoro.',
      'Your attention is your most valuable thing. Don’t spend it here.',
      'Focused work finishes twice as fast. Almost there.',
      'This site will still be here when you’re done.',
    ],
  },
};

let LANG = 'tr';

function setLang(lang) {
  LANG = I18N[lang] ? lang : 'tr';
  if (typeof document !== 'undefined') document.documentElement.lang = LANG;
}

// t('topSite', { site: 'x.com', n: 3 }) -> "En çok girmeye çalıştığın: x.com (3 kez)"
function t(key, vars = {}) {
  const s = I18N[LANG][key] ?? I18N.tr[key] ?? key;
  return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s;
}

// HTML'deki data-i18n* işaretli öğelerin metinlerini günceller.
function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
}
