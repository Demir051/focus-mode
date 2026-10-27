// Focus Mode — arka plan service worker'ı.
// Zamanlayıcı durumu, site engelleme kuralları, bildirimler ve istatistikler burada yönetilir.

importScripts('i18n.js');

const DEFAULTS = {
  mode: 'idle', // 'idle' | 'focus' | 'break'
  endsAt: null,
  phaseMs: null, // şu anki aşamanın toplam süresi (sayaç halkası için)
  focusTotalMs: null, // bu pomodoronun tam süresi (istatistik için)
  resumeMs: null, // odak molaya alındıysa kalan odak süresi
  focusMin: 25,
  breakMin: 5,
  lang: 'tr', // 'tr' | 'en'
  sites: null, // aşağıdaki DEFAULT_SITES ile doldurulur
  stats: null,
};

// Hazır site listesi. Kullanıcı popup'tan istediğini açıp kapatabilir,
// kendi eklediği siteler `custom: true` ile sona eklenir.
const DEFAULT_SITES = [
  { label: 'YouTube', domains: ['youtube.com'], enabled: true },
  { label: 'Instagram', domains: ['instagram.com'], enabled: true },
  { label: 'X (Twitter)', domains: ['x.com', 'twitter.com'], enabled: true },
  { label: 'TikTok', domains: ['tiktok.com'], enabled: true },
  { label: 'Facebook', domains: ['facebook.com'], enabled: true },
  { label: 'Reddit', domains: ['reddit.com'], enabled: true },
  { label: 'Netflix', domains: ['netflix.com'], enabled: false },
  { label: 'Twitch', domains: ['twitch.tv'], enabled: false },
  { label: 'Ekşi Sözlük', domains: ['eksisozluk.com'], enabled: false },
  { label: 'Pinterest', domains: ['pinterest.com'], enabled: false },
  { label: 'LinkedIn', domains: ['linkedin.com'], enabled: false },
  { label: 'Discord', domains: ['discord.com'], enabled: false },
  { label: 'WhatsApp Web', domains: ['web.whatsapp.com'], enabled: false },
].map((s) => ({ ...s, custom: false }));
DEFAULTS.sites = DEFAULT_SITES;

function enabledDomains(state) {
  return [...new Set(state.sites.filter((s) => s.enabled).flatMap((s) => s.domains))];
}

function clamp(n, min, max, fallback) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

const PHASE_ALARM = 'phaseEnd';
const TICK_ALARM = 'tick';

function today() {
  return new Date().toLocaleDateString('sv'); // YYYY-AA-GG
}

async function getState() {
  const stored = await chrome.storage.local.get(null);
  const state = { ...DEFAULTS, ...stored };
  if (!state.stats || state.stats.date !== today()) {
    state.stats = { date: today(), focusMin: 0, sessions: 0, attempts: {} };
    await chrome.storage.local.set({ stats: state.stats });
  }
  setLang(state.lang); // bildirimler seçili dilde çıksın
  return state;
}

// "https://www.YouTube.com/watch" -> "youtube.com"
function normalizeDomain(line) {
  let d = String(line).trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

// --- Site engelleme -------------------------------------------------------

async function blockSites(domains) {
  const blockedPage = chrome.runtime.getURL('blocked.html');
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = domains.map((domain, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'redirect',
      // \0 = engellenen sayfanın tam adresi; engel sayfası bunu gösterir.
      redirect: { regexSubstitution: blockedPage + '?u=\\0' },
    },
    condition: {
      regexFilter: '^https?://([^/]*\\.)?' + escapeRegex(domain) + '([/:?#].*)?$',
      resourceTypes: ['main_frame'],
    },
  }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });

  // Zaten açık olan engelli sekmeleri de engel sayfasına yönlendir.
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !/^https?:/.test(tab.url)) continue;
    const host = new URL(tab.url).hostname.replace(/^www\./, '');
    if (domains.some((d) => hostMatches(host, d))) {
      chrome.tabs.update(tab.id, { url: blockedPage + '?u=' + tab.url });
    }
  }
}

async function unblockSites() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
  });
}

// --- Rozet (ikon üstündeki kalan dakika) ----------------------------------

async function updateBadge() {
  const { mode, endsAt } = await getState();
  if (mode === 'idle' || !endsAt) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  const minutesLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 60000));
  await chrome.action.setBadgeBackgroundColor({ color: mode === 'focus' ? '#ef4444' : '#22c55e' });
  await chrome.action.setBadgeText({ text: String(minutesLeft) });
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 2,
  });
}

// --- Aşamalar --------------------------------------------------------------

// durationMs verilmezse ayarlardaki süre kullanılır (yeni bir pomodoro/mola).
// resumeMs: odak yarıda molaya alındıysa, mola bitince devam edilecek kalan odak süresi.
async function startPhase(mode, { durationMs, resumeMs = null } = {}) {
  const state = await getState();
  const phaseMs = durationMs ?? (mode === 'focus' ? state.focusMin : state.breakMin) * 60000;
  const endsAt = Date.now() + phaseMs;

  const patch = { mode, endsAt, phaseMs, resumeMs };
  // Yeni pomodoro başlıyorsa tam süresini sakla; kaldığı yerden devam ediyorsa eskisi kalır.
  if (mode === 'focus' && durationMs === undefined) patch.focusTotalMs = phaseMs;
  await chrome.storage.local.set(patch);
  await chrome.alarms.create(PHASE_ALARM, { when: endsAt });
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });

  if (mode === 'focus') await blockSites(enabledDomains(state));
  else await unblockSites();
  await updateBadge();
}

async function goIdle() {
  await chrome.storage.local.set({
    mode: 'idle',
    endsAt: null,
    phaseMs: null,
    resumeMs: null,
    focusTotalMs: null,
  });
  await chrome.alarms.clear(PHASE_ALARM);
  await chrome.alarms.clear(TICK_ALARM);
  await unblockSites();
  await updateBadge();
}

// Odaktayken "Mola ver": kalan odak süresi saklanır, engeller kalkar.
async function pauseForBreak() {
  const state = await getState();
  if (state.mode !== 'focus') return;
  await startPhase('break', { resumeMs: Math.max(0, state.endsAt - Date.now()) });
}

// "Odaklanmaya devam et": yarım kalan odağa döner; yoksa yeni pomodoro başlatır.
async function resumeFocus() {
  const state = await getState();
  if (state.mode === 'break' && state.resumeMs != null) {
    await startPhase('focus', { durationMs: state.resumeMs });
  } else {
    await startPhase('focus');
  }
}

async function finishPhase({ silent = false } = {}) {
  const state = await getState();
  if (state.mode === 'focus') {
    state.stats.focusMin += Math.round((state.focusTotalMs ?? state.focusMin * 60000) / 60000);
    state.stats.sessions += 1;
    await chrome.storage.local.set({ stats: state.stats });
    if (silent) return goIdle();
    notify(t('notifDoneTitle'), t('notifDoneMsg', { n: state.breakMin }));
    await startPhase('break');
  } else if (state.mode === 'break' && state.resumeMs != null) {
    if (!silent) notify(t('notifBreakTitle'), t('notifBreakResume'));
    await resumeFocus();
  } else if (state.mode === 'break') {
    if (!silent) notify(t('notifBreakTitle'), t('notifBreakNew'));
    await goIdle();
  }
}

async function stopPhase() {
  const state = await getState();
  // Yarıda kesilen odak süresi de istatistiğe sayılır.
  let leftMs = null;
  if (state.mode === 'focus') leftMs = state.endsAt - Date.now();
  else if (state.mode === 'break' && state.resumeMs != null) leftMs = state.resumeMs;
  if (leftMs != null) {
    const totalMs = state.focusTotalMs ?? state.focusMin * 60000;
    state.stats.focusMin += Math.floor(Math.max(0, totalMs - leftMs) / 60000);
    await chrome.storage.local.set({ stats: state.stats });
  }
  await goIdle();
}

async function recordAttempt(host) {
  const state = await getState();
  if (state.mode !== 'focus') return; // odak bittikten sonra sayfayı yenilemek sayılmaz
  const key = normalizeDomain(host) || 'bilinmeyen';
  state.stats.attempts[key] = (state.stats.attempts[key] || 0) + 1;
  await chrome.storage.local.set({ stats: state.stats });
}

function cleanSites(sites) {
  return sites
    .map((s) => {
      const domains = [...new Set((s.domains || []).map(normalizeDomain).filter(Boolean))];
      return {
        label: String(s.label || domains[0] || '').slice(0, 40),
        domains,
        enabled: Boolean(s.enabled),
        custom: Boolean(s.custom),
      };
    })
    .filter((s) => s.domains.length);
}

// Sadece gönderilen alanlar güncellenir (ör. yalnızca `sites`).
async function saveSettings({ focusMin, breakMin, sites, lang }) {
  const state = await getState();
  const patch = {};
  if (lang !== undefined) patch.lang = lang === 'en' ? 'en' : 'tr';
  if (focusMin !== undefined) patch.focusMin = clamp(focusMin, 1, 180, state.focusMin);
  if (breakMin !== undefined) patch.breakMin = clamp(breakMin, 1, 60, state.breakMin);
  if (sites) patch.sites = cleanSites(sites);
  await chrome.storage.local.set(patch);
  // Odak sürerken liste değiştiyse kuralları hemen güncelle.
  if (patch.sites && state.mode === 'focus') {
    await blockSites(enabledDomains({ ...state, ...patch }));
  }
}

async function addSite(input) {
  const domain = normalizeDomain(input);
  if (!domain) return { error: 'invalidSite' }; // popup bunu seçili dile çevirir
  const state = await getState();
  const sites = state.sites.map((s) => ({ ...s }));
  const existing = sites.find((s) => s.domains.includes(domain));
  if (existing) existing.enabled = true;
  else sites.push({ label: domain, domains: [domain], enabled: true, custom: true });
  await saveSettings({ sites });
  return {};
}

// Tarayıcı kapalıyken süre dolduysa durumu toparla.
async function reconcile() {
  const state = await getState();
  if (state.mode === 'idle') return unblockSites();
  if (state.endsAt <= Date.now()) return finishPhase({ silent: true });
  await chrome.alarms.create(PHASE_ALARM, { when: state.endsAt });
  await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 0.5 });
  if (state.mode === 'focus') await blockSites(enabledDomains(state));
  await updateBadge();
}

// --- Olay dinleyicileri ---------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  const missing = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (!(k in stored)) missing[k] = v;
  }
  // Eski sürümdeki düz `blocked` listesini yeni seçmeli listeye taşı.
  if (!stored.sites && Array.isArray(stored.blocked)) {
    const old = new Set(stored.blocked);
    const sites = DEFAULT_SITES.map((s) => ({ ...s, enabled: s.domains.some((d) => old.has(d)) }));
    for (const d of old) {
      if (!sites.some((s) => s.domains.includes(d))) {
        sites.push({ label: d, domains: [d], enabled: true, custom: true });
      }
    }
    missing.sites = sites;
  }
  await chrome.storage.local.set(missing);
  await chrome.storage.local.remove('blocked');
  await reconcile();
});

chrome.runtime.onStartup.addListener(reconcile);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PHASE_ALARM) finishPhase();
  else if (alarm.name === TICK_ALARM) updateBadge();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse, (err) => sendResponse({ error: String(err) }));
  return true; // yanıt asenkron gelecek
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'start':
      await startPhase(msg.mode);
      break;
    case 'stop':
      await stopPhase();
      break;
    case 'pause':
      await pauseForBreak();
      break;
    case 'resume':
      await resumeFocus();
      break;
    case 'attempt':
      await recordAttempt(msg.host);
      break;
    case 'saveSettings':
      await saveSettings(msg);
      break;
    case 'addSite': {
      const { error } = await addSite(msg.input);
      if (error) return { ...(await getState()), error };
      break;
    }
  }
  return getState();
}
