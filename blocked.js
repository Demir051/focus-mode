const $ = (id) => document.getElementById(id);

// Adres "blocked.html?u=<asıl adres>" biçiminde gelir.
const originalUrl = location.search.startsWith('?u=') ? location.search.slice(3) : '';
let host = '';
try {
  host = new URL(originalUrl).hostname.replace(/^www\./, '');
} catch {}

// Dil değişse de aynı söz kalsın diye sırasını bir kez seç.
const quoteIndex = Math.floor(Math.random() * I18N.tr.quotes.length);

function formatTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// "{host} biraz bekleyebilir." -> site adı kalın yazılır.
function renderHostLine() {
  // t() boş değişkenleri sildiği için ham şablonu kullan.
  const [before, after = ''] = I18N[LANG].canWait.split('{host}');
  const strong = document.createElement('strong');
  strong.textContent = host || t('thisSite');
  $('hostLine').replaceChildren(before, strong, after);
}

let state = null;
let lang = null;

function render() {
  if (!state) return;

  if (state.lang !== lang) {
    lang = state.lang;
    setLang(lang);
    applyI18n();
    document.title = t('blockedPageTitle');
    renderHostLine();
    $('quote').textContent = t('quotes')[quoteIndex];
  }

  const count = state.stats.attempts[host] || 0;
  $('attempts').textContent = count ? t('attempts', { host: host || t('thisSite'), n: count }) : '';

  if (state.mode === 'focus') {
    document.body.classList.remove('done');
    $('title').textContent = t('blockedTitle');
    $('countdown').textContent = formatTime(state.endsAt - Date.now());
    $('continue').hidden = true;
    return;
  }

  // Odak bitti ya da molaya çıkıldı: siteye dönme izni ver.
  document.body.classList.add('done');
  if (state.mode === 'break' && state.resumeMs != null) {
    $('title').textContent = t('breakTime');
    $('countdown').textContent = '';
  } else {
    $('title').textContent = t('focusDone');
    $('countdown').textContent = '00:00';
  }
  if (originalUrl) {
    $('continue').href = originalUrl;
    $('continue').hidden = false;
  }
}

(async () => {
  state = await chrome.runtime.sendMessage({ type: 'attempt', host });
  render();
  setInterval(render, 1000);
  chrome.storage.onChanged.addListener(async () => {
    state = await chrome.runtime.sendMessage({ type: 'getState' });
    render();
  });
})();
