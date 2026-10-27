const $ = (id) => document.getElementById(id);
const CIRCUMFERENCE = 2 * Math.PI * 52;
const LABEL_KEYS = { idle: 'ready', focus: 'focusLabel', break: 'breakLabel' };

let state = null;

function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function formatTime(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function flashSaved() {
  $('saved').textContent = t('saved');
  clearTimeout(flashSaved.timer);
  flashSaved.timer = setTimeout(() => ($('saved').textContent = ''), 1500);
}

function render() {
  if (!state) return;
  const { mode, endsAt, phaseMs, resumeMs, focusMin, breakMin, stats } = state;
  document.body.dataset.mode = mode;

  const totalMs = mode === 'idle' ? focusMin * 60000 : phaseMs ?? (mode === 'break' ? breakMin : focusMin) * 60000;
  const remaining = mode === 'idle' ? totalMs : Math.max(0, endsAt - Date.now());
  $('time').textContent = formatTime(remaining);
  $('label').textContent = t(LABEL_KEYS[mode]);
  // Yarıda verilen molada kalan odak süresini göster.
  $('sub').textContent = mode === 'break' && resumeMs != null ? t('focusLeft', { time: formatTime(resumeMs) }) : '';

  const progress = $('progress');
  progress.style.strokeDasharray = CIRCUMFERENCE;
  progress.style.strokeDashoffset = CIRCUMFERENCE * (1 - remaining / totalMs);

  // Boşta: Odaklan. Odakta: Mola ver + Durdur. Molada: Odaklanmaya devam et + Durdur.
  $('startFocus').hidden = mode !== 'idle';
  $('pause').hidden = mode !== 'focus';
  $('resume').hidden = mode !== 'break';
  $('resume').textContent = t(resumeMs != null ? 'resume' : 'newPomodoro');
  $('stop').hidden = mode === 'idle';

  const attempts = Object.entries(stats.attempts);
  $('statMin').textContent = stats.focusMin;
  $('statSessions').textContent = stats.sessions;
  $('statAttempts').textContent = attempts.reduce((sum, [, n]) => sum + n, 0);

  attempts.sort((a, b) => b[1] - a[1]);
  $('topSite').textContent = attempts.length ? t('topSite', { site: attempts[0][0], n: attempts[0][1] }) : '';
}

// --- Dil -------------------------------------------------------------------

function applyLang() {
  setLang(state.lang);
  applyI18n();
  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === LANG);
  });
  $('addError').textContent = '';
  render();
  renderSites();
}

document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    if (btn.dataset.lang === LANG) return;
    state = await send({ type: 'saveSettings', lang: btn.dataset.lang });
    applyLang();
  });
});

// --- Site listesi ----------------------------------------------------------

function faviconUrl(domain) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', `https://${domain}`);
  url.searchParams.set('size', '32');
  return url.toString();
}

async function saveSites(sites) {
  state = await send({ type: 'saveSettings', sites });
  renderSites();
  flashSaved();
}

function renderSites() {
  const list = $('siteList');
  const locked = state.mode === 'focus';
  list.replaceChildren();

  // Arka plan eski sürümde kaldıysa (eklenti yenilenmemiş) liste gelmez.
  $('reloadNote').hidden = Array.isArray(state.sites);
  if (!Array.isArray(state.sites)) return;

  state.sites.forEach((site, i) => {
    const li = document.createElement('li');

    const label = document.createElement('label');
    label.className = 'site' + (site.enabled ? '' : ' off');
    label.title = site.domains.join(', ');

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = site.enabled;
    // Odak sürerken engel kaldırılamaz (kendini kandırmak yok 🙂).
    toggle.disabled = locked && site.enabled;
    toggle.addEventListener('change', () => {
      const sites = state.sites.map((s, j) => (j === i ? { ...s, enabled: toggle.checked } : s));
      saveSites(sites);
    });

    const icon = document.createElement('img');
    icon.src = faviconUrl(site.domains[0]);
    icon.alt = '';

    const name = document.createElement('span');
    name.textContent = site.label;

    label.append(toggle, icon, name);
    li.append(label);

    if (site.custom && !(locked && site.enabled)) {
      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.title = t('remove');
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        saveSites(state.sites.filter((_, j) => j !== i));
      });
      li.append(remove);
    }

    list.append(li);
  });

  const enabledCount = state.sites.filter((s) => s.enabled).length;
  $('siteCount').textContent = t('siteCount', { on: enabledCount, all: state.sites.length });
  $('lockNote').hidden = !locked;
}

$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('newSite');
  if (!input.value.trim()) return;

  state = await send({ type: 'addSite', input: input.value });
  if (state.error) {
    $('addError').textContent = t(state.error);
    return;
  }
  $('addError').textContent = '';
  input.value = '';
  renderSites();
  flashSaved();
  $('siteList').lastElementChild?.scrollIntoView({ block: 'nearest' });
});

$('newSite').addEventListener('input', () => ($('addError').textContent = ''));

// --- Süreler ve butonlar ---------------------------------------------------

for (const id of ['focusMin', 'breakMin']) {
  $(id).addEventListener('change', async () => {
    state = await send({ type: 'saveSettings', [id]: $(id).value });
    $(id).value = state[id]; // sınır dışı değerleri düzeltilmiş haliyle göster
    render();
    flashSaved();
  });
}

const BUTTONS = {
  startFocus: { type: 'start', mode: 'focus' },
  pause: { type: 'pause' },
  resume: { type: 'resume' },
  stop: { type: 'stop' },
};

for (const [id, msg] of Object.entries(BUTTONS)) {
  $(id).addEventListener('click', async () => {
    state = await send(msg);
    render();
    renderSites();
  });
}

// Arka planda değişen durumu (ör. süre bitince) yakala.
let lastMode = null;
chrome.storage.onChanged.addListener(async () => {
  state = await send({ type: 'getState' });
  render();
  if (state.mode !== lastMode) renderSites();
  lastMode = state.mode;
});

(async () => {
  state = await send({ type: 'getState' });
  lastMode = state.mode;
  $('focusMin').value = state.focusMin;
  $('breakMin').value = state.breakMin;
  applyLang();
  setInterval(render, 1000);
})();
