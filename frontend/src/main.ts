import './style.css';

interface BotStatus {
  connected: boolean;
  connecting: boolean;
  host?: string;
  port?: number;
  username?: string;
  health?: number;
  food?: number;
  xp?: number;
  position?: { x: number; y: number; z: number };
  dimension?: string;
  version?: string;
  lastError?: string;
  diagnostic?: string;
  joinedAt?: number;
}

interface ChatLine {
  id: number;
  ts: number;
  kind: 'system' | 'chat' | 'whisper' | 'self' | 'info' | 'error' | 'ok';
  from?: string;
  text: string;
}

interface Task {
  id: string;
  name: string;
  template: string;
  intervalSeconds: number;
  enabled: boolean;
  perPlayerDelayMs: number;
  lastRun?: number;
  runCount: number;
}

interface ConnectForm {
  host: string;
  port: number;
  username: string;
  version: string;
  auth: 'offline' | 'microsoft';
  authPassword: string;
  autoAuth: boolean;
  autoRespawn: boolean;
  autoReconnect: boolean;
  antiAfk: boolean;
}

const LS_KEY = 'mavi-mc-bot:conn';

const state = {
  status: { connected: false, connecting: false } as BotStatus,
  players: [] as string[],
  tasks: [] as Task[],
  chat: [] as ChatLine[],
  conn: loadConnForm(),
  draftTask: { name: '', template: '/msg [everyone] merhaba :)', intervalSeconds: 10, perPlayerDelayMs: 400 },
};

function loadConnForm(): ConnectForm {
  const def: ConnectForm = {
    host: '',
    port: 25565,
    username: 'MaviBot' + Math.floor(Math.random() * 90 + 10),
    version: '',
    auth: 'offline',
    authPassword: '',
    autoAuth: true,
    autoRespawn: true,
    autoReconnect: true,
    antiAfk: false,
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch {}
  return def;
}

function saveConnForm() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.conn)); } catch {}
}

const app = document.getElementById('app')!;

function el<T extends HTMLElement = HTMLElement>(tag: string, attrs: Record<string, any> = {}, children: (Node | string)[] = []): T {
  const node = document.createElement(tag) as any;
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function render() {
  app.innerHTML = '';
  app.append(el('div', { class: 'app' }, [renderTopbar(), renderMain()]));
  if (!toastRoot.parentNode) document.body.append(toastRoot);
}

function renderTopbar(): HTMLElement {
  const s = state.status;
  let pill: HTMLElement;
  if (s.connected) {
    pill = el('span', { class: 'pill on' }, [el('span', { class: 'dot' }), `Bağlı · ${s.username || ''}`]);
  } else if (s.connecting) {
    pill = el('span', { class: 'pill warn' }, [el('span', { class: 'dot' }), 'Bağlanıyor...']);
  } else {
    pill = el('span', { class: 'pill' }, [el('span', { class: 'dot' }), 'Çevrimdışı']);
  }
  const serverPill = s.host
    ? el('span', { class: 'pill' }, [el('span', { class: 'dot' }), `${s.host}:${s.port}`])
    : null;

  return el('header', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [
      el('span', { class: 'logo' }, ['MB']),
      'Mavi Bot',
      el('small', {}, ['· Minecraft Yönetim Paneli']),
    ]),
    el('div', { class: 'status-group' }, [serverPill, pill].filter(Boolean) as Node[]),
  ]);
}

function renderMain(): HTMLElement {
  return el('main', { class: 'grid' }, [
    el('div', { class: 'col left' }, [renderConnectCard(), renderStatsCard(), renderActionsCard()]),
    el('div', { class: 'col center' }, [renderBanner(), renderChatCard()].filter(Boolean) as Node[]),
    el('div', { class: 'col right' }, [renderTasksCard(), renderPlayersCard()]),
  ]);
}

function renderBanner(): HTMLElement | null {
  const s = state.status;
  if (s.connected || s.connecting) return null;
  if (!s.lastError && !s.diagnostic) return null;
  return el('div', { class: 'banner err' }, [
    el('div', { class: 'banner-title' }, ['⚠ Bağlanılamadı']),
    s.diagnostic ? el('div', { class: 'banner-text' }, [s.diagnostic]) : null,
    s.lastError ? el('div', { class: 'banner-sub' }, [`Teknik: ${s.lastError}`]) : null,
  ].filter(Boolean) as Node[]);
}

function renderConnectCard(): HTMLElement {
  const c = state.conn;
  const disabled = state.status.connected || state.status.connecting;

  const input = (field: keyof ConnectForm, attrs: any = {}) => el('input', {
    type: attrs.type || 'text',
    value: (c as any)[field] ?? '',
    placeholder: attrs.placeholder || '',
    autocomplete: 'off',
    oninput: (e: any) => {
      const v = attrs.type === 'number' ? Number(e.target.value) : e.target.value;
      (c as any)[field] = v;
      saveConnForm();
    },
  });

  const check = (field: keyof ConnectForm, label: string) =>
    el('label', { class: 'check' }, [
      el('input', {
        type: 'checkbox',
        checked: !!(c as any)[field],
        onchange: (e: any) => { (c as any)[field] = e.target.checked; saveConnForm(); },
      }),
      label,
    ]);

  return el('section', { class: 'card' }, [
    el('h2', {}, ['Bağlantı', el('span', { class: 'sub' }, [state.status.connected ? 'bağlı' : 'ayarla'])]),
    el('div', { class: 'field' }, [el('label', {}, ['Sunucu IP (host veya host:port)']), input('host', { placeholder: 'play.ornek.com' })]),
    el('div', { class: 'field row2' }, [
      el('div', {}, [el('label', {}, ['Kullanıcı adı']), input('username', { placeholder: 'MaviBot' })]),
      el('div', {}, [el('label', {}, ['Port']), input('port', { type: 'number', placeholder: '25565' })]),
    ]),
    el('div', { class: 'field row-even' }, [
      el('div', {}, [el('label', {}, ['Sürüm (boş = auto)']), input('version', { placeholder: '1.20.1' })]),
      el('div', {}, [
        el('label', {}, ['Mod']),
        el('select', {
          onchange: (e: any) => { c.auth = e.target.value; saveConnForm(); },
        }, [
          el('option', { value: 'offline', selected: c.auth === 'offline' }, ['Cracked']),
          el('option', { value: 'microsoft', selected: c.auth === 'microsoft' }, ['Premium']),
        ]),
      ]),
    ]),
    el('div', { class: 'field' }, [
      el('label', {}, ['Şifre (register/login için)']),
      input('authPassword', { type: 'password', placeholder: 'authme / login şifresi' }),
    ]),
    el('div', { class: 'field checks' }, [
      check('autoAuth', 'Otomatik /register ve /login'),
      check('autoRespawn', 'Ölünce otomatik respawn'),
      check('autoReconnect', 'Kopunca otomatik yeniden bağlan'),
      check('antiAfk', 'Anti-AFK (20 sn bir hareket)'),
    ]),
    el('div', { class: 'btn-row' }, [
      disabled
        ? el('button', { class: 'danger', onclick: disconnect }, ['Bağlantıyı Kes'])
        : el('button', { class: 'primary', onclick: connect }, ['Sunucuya Bağlan']),
    ]),
  ]);
}

function renderStatsCard(): HTMLElement {
  const s = state.status;
  const pos = s.position ? `${s.position.x}, ${s.position.y}, ${s.position.z}` : '—';
  const dim = (s.dimension || '').replace('minecraft:', '') || '—';
  const uptime = s.joinedAt && s.connected ? fmtUptime(Date.now() - s.joinedAt) : '—';
  return el('section', { class: 'card', id: 'stats-card' }, [
    el('h2', {}, ['Durum']),
    el('div', { class: 'stats' }, [
      stat('Can', s.health !== undefined ? `${Math.round(s.health * 10) / 10} / 20` : '—'),
      stat('Açlık', s.food !== undefined ? `${s.food} / 20` : '—'),
      stat('Dünya', dim),
      stat('Sürüm', s.version || '—'),
      stat('Konum', pos),
      stat('Süre', uptime),
    ]),
  ]);
}

function stat(label: string, value: string): HTMLElement {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'lbl' }, [label]),
    el('div', { class: 'val' }, [value]),
  ]);
}

function renderActionsCard(): HTMLElement {
  const btn = (txt: string, action: string, params: any = {}) =>
    el('button', { class: 'small', onclick: () => sendAction(action, params) }, [txt]);
  return el('section', { class: 'card' }, [
    el('h2', {}, ['Hızlı Aksiyonlar']),
    el('div', { class: 'actions-grid' }, [
      btn('Zıpla', 'jump'),
      btn('Respawn', 'respawn'),
      btn('Eşyaları At', 'dropAll'),
      btn('İleri Başla', 'forward', { on: true }),
      btn('İleri Dur', 'forward', { on: false }),
      btn('Sprint', 'sprint', { on: true }),
      btn('Sneak', 'sneak', { on: true }),
      btn('Sneak Dur', 'sneak', { on: false }),
      btn('Her Şeyi Dur', 'stopAll'),
    ]),
  ]);
}

function renderChatCard(): HTMLElement {
  const body = el('div', { class: 'chat-body', id: 'chat-body' }, state.chat.map(renderChatLine));
  const input = el<HTMLInputElement>('input', {
    type: 'text',
    placeholder: state.status.connected ? 'Mesaj veya /komut...' : 'Önce bağlan...',
    disabled: !state.status.connected,
    onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') { sendChat((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } },
  });

  const send = () => {
    sendChat(input.value);
    input.value = '';
    input.focus();
  };

  const card = el('section', { class: 'card chat-card' }, [
    el('h2', {}, ['Sohbet', el('span', { class: 'sub' }, [`${state.chat.length} satır`])]),
    body,
    el('div', { class: 'chat-input' }, [
      input,
      el('button', { class: 'primary', onclick: send, disabled: !state.status.connected }, ['Gönder']),
      el('button', { class: 'ghost', onclick: () => { state.chat = []; render(); } }, ['Temizle']),
    ]),
  ]);

  queueMicrotask(() => { body.scrollTop = body.scrollHeight; });
  return card;
}

function renderChatLine(m: ChatLine): HTMLElement {
  const t = new Date(m.ts);
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  const who = m.from
    ? el('span', { class: 'who' }, [`${m.from}:`])
    : (m.kind === 'self' ? el('span', { class: 'who' }, ['Sen:']) : null);
  return el('div', { class: `msg kind-${m.kind}` }, [
    el('span', { class: 'ts' }, [`${hh}:${mm}:${ss}`]),
    who as any,
    el('span', { class: 'text' }, [stripColorCodes(m.text)]),
  ].filter(Boolean) as Node[]);
}

function stripColorCodes(s: string): string {
  return String(s).replace(/§[0-9a-fk-or]/gi, '');
}

function renderTasksCard(): HTMLElement {
  const d = state.draftTask;

  const nameInput = el('input', {
    type: 'text',
    value: d.name,
    placeholder: 'Görev adı',
    oninput: (e: any) => { d.name = e.target.value; },
  });
  const intervalInput = el('input', {
    type: 'number',
    min: '1',
    value: d.intervalSeconds,
    oninput: (e: any) => { d.intervalSeconds = Math.max(1, Number(e.target.value) || 10); },
  });
  const templateArea = el('textarea', {
    placeholder: '/msg [everyone] merhaba ::)',
    oninput: (e: any) => { d.template = e.target.value; },
  }, [d.template]);
  const addBtn = el('button', {
    class: 'primary add-btn',
    onclick: async () => {
      if (!d.template.trim()) { toast('Komut/mesaj boş olamaz', 'err'); return; }
      const name = d.name.trim() || `Görev ${state.tasks.length + 1}`;
      const payload = {
        name,
        template: d.template,
        intervalSeconds: d.intervalSeconds,
        perPlayerDelayMs: d.perPlayerDelayMs,
        enabled: true,
      };
      await apiPost('/api/tasks', payload);
      d.name = '';
      toast('Görev eklendi', 'ok');
    },
  }, ['+ Görev Ekle']);

  const list = el('div', { class: 'task-list' }, state.tasks.length ? state.tasks.map(renderTask) : [
    el('div', { style: { color: 'var(--muted)', padding: '20px 4px', fontSize: '12.5px', textAlign: 'center' } }, ['Henüz görev yok. Örnek: /msg [everyone] merhaba']),
  ]);

  return el('section', { class: 'card tasks-card' }, [
    el('h2', {}, ['Zamanlı Görevler', el('span', { class: 'sub' }, [`${state.tasks.length}`])]),
    el('div', { class: 'task-add' }, [
      el('div', { class: 'ta-field' }, [el('label', {}, ['Görev adı']), nameInput]),
      el('div', { class: 'ta-field' }, [el('label', {}, ['Saniye']), intervalInput]),
      el('div', { class: 'ta-field wide' }, [el('label', {}, ['Komut / mesaj']), templateArea]),
      addBtn,
    ]),
    el('div', { class: 'hint', html: 'Değişkenler: <code>[everyone]</code> tüm oyunculara tek tek · <code>[random]</code> rastgele oyuncu · <code>[count]</code> oyuncu sayısı. Her görev her X saniyede bir çalışır.' }),
    list,
  ]);
}

function renderTask(t: Task): HTMLElement {
  const toggle = el('button', {
    class: 'small',
    onclick: () => apiPut(`/api/tasks/${t.id}`, { enabled: !t.enabled }),
    title: t.enabled ? 'Duraklat' : 'Başlat',
  }, [t.enabled ? '⏸' : '▶']);
  const run = el('button', {
    class: 'small',
    onclick: () => apiPost(`/api/tasks/${t.id}/run`),
    title: 'Şimdi çalıştır',
  }, ['⚡']);
  const del = el('button', {
    class: 'small danger',
    onclick: () => { if (confirm(`"${t.name}" görevini silmek istiyor musun?`)) apiDel(`/api/tasks/${t.id}`); },
    title: 'Sil',
  }, ['✕']);
  const edit = el('button', {
    class: 'small',
    onclick: () => openEditTask(t),
    title: 'Düzenle',
  }, ['✎']);

  const last = t.lastRun ? `son ${fmtAgo(Date.now() - t.lastRun)} önce` : 'hiç çalışmadı';
  return el('div', { class: `task ${t.enabled ? 'enabled' : ''}` }, [
    el('div', { class: 'top' }, [
      el('div', { class: 'name' }, [t.name]),
      el('div', { class: 'interval' }, [`${t.intervalSeconds}s`]),
    ]),
    el('div', { class: 'template' }, [t.template]),
    el('div', { class: 'meta' }, [
      el('span', {}, [`${t.runCount} kez · ${last}`]),
      el('div', { class: 'actions' }, [run, toggle, edit, del]),
    ]),
  ]);
}

function openEditTask(t: Task) {
  const newTmpl = prompt('Komut / mesaj şablonu:', t.template);
  if (newTmpl === null) return;
  const newInt = prompt('Kaç saniyede bir çalışsın?', String(t.intervalSeconds));
  if (newInt === null) return;
  const newName = prompt('Görev adı:', t.name);
  if (newName === null) return;
  apiPut(`/api/tasks/${t.id}`, {
    template: newTmpl,
    intervalSeconds: Number(newInt) || t.intervalSeconds,
    name: newName,
  });
}

function renderPlayersCard(): HTMLElement {
  const list = state.players.length
    ? state.players.map((p, i) => el('div', { class: 'player' }, [
        el('span', { class: 'idx' }, [`${i + 1}.`]),
        el('span', { class: 'nm' }, [p]),
        el('button', { class: 'small cp', onclick: () => { navigator.clipboard?.writeText(p); toast(`"${p}" kopyalandı`, 'ok'); } }, ['kopya']),
      ]))
    : [el('div', { style: { color: 'var(--muted)', padding: '12px 4px', fontSize: '12.5px', textAlign: 'center' } }, ['Oyuncu listesi yükleniyor...'])];
  return el('section', { class: 'card players-card' }, [
    el('h2', {}, ['Çevrimiçi Oyuncular', el('span', { class: 'sub' }, [`${state.players.length}`])]),
    el('div', { class: 'players-list' }, list),
  ]);
}

// ---- API helpers ----

async function apiPost(url: string, body: any = {}) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.error || `HTTP ${r.status}`, 'err'); return null; }
    return await r.json();
  } catch (e: any) { toast(e?.message || String(e), 'err'); return null; }
}
async function apiPut(url: string, body: any = {}) {
  try {
    const r = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.error || `HTTP ${r.status}`, 'err'); return null; }
    return await r.json();
  } catch (e: any) { toast(e?.message || String(e), 'err'); return null; }
}
async function apiDel(url: string) {
  try {
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.error || `HTTP ${r.status}`, 'err'); return null; }
    return await r.json();
  } catch (e: any) { toast(e?.message || String(e), 'err'); return null; }
}

async function connect() {
  const c = state.conn;
  if (!c.host.trim()) { toast('Sunucu IP boş', 'err'); return; }
  saveConnForm();
  await apiPost('/api/connect', c);
}
async function disconnect() { await apiPost('/api/disconnect'); }
async function sendChat(text: string) {
  const t = String(text || '').trim();
  if (!t) return;
  await apiPost('/api/chat', { message: t });
}
async function sendAction(action: string, params: any = {}) {
  await apiPost('/api/action', { action, params });
}

// ---- WebSocket ----

let ws: WebSocket | null = null;
let wsRetry = 0;

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://${location.host}/ws`;
  ws = new WebSocket(wsUrl);
  ws.onopen = () => { wsRetry = 0; };
  ws.onmessage = (ev) => {
    try { handleEvent(JSON.parse(ev.data)); } catch {}
  };
  ws.onclose = () => {
    const delay = Math.min(10000, 500 * Math.pow(2, wsRetry++));
    setTimeout(connectWs, delay);
  };
  ws.onerror = () => {};
}

function handleEvent(msg: { event: string; data: any }) {
  switch (msg.event) {
    case 'init':
      state.status = msg.data.status;
      state.players = msg.data.players || [];
      state.tasks = msg.data.tasks || [];
      state.chat = msg.data.history || [];
      render();
      break;
    case 'status':
      state.status = msg.data;
      render();
      break;
    case 'players':
      state.players = msg.data;
      render();
      break;
    case 'tasks':
      state.tasks = msg.data;
      render();
      break;
    case 'chat':
      state.chat.push(msg.data);
      if (state.chat.length > 500) state.chat = state.chat.slice(-500);
      appendChatLine(msg.data);
      break;
  }
}

function appendChatLine(line: ChatLine) {
  const body = document.getElementById('chat-body');
  if (!body) { render(); return; }
  body.append(renderChatLine(line));
  body.scrollTop = body.scrollHeight;
}

// ---- Toasts ----

const toastRoot = el('div', { class: 'toast-container' });
function toast(text: string, kind: 'ok' | 'err' | 'info' = 'info') {
  const node = el('div', { class: `toast ${kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : ''}` }, [text]);
  toastRoot.append(node);
  setTimeout(() => node.remove(), 3500);
}

// ---- Utils ----

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}sa ${m}d` : m ? `${m}d ${ss}s` : `${ss}s`;
}
function fmtAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}d`;
  const h = Math.floor(m / 60);
  return `${h}sa`;
}

// ---- Boot ----

render();
connectWs();
setInterval(() => {
  if (state.status.connected) {
    const topbar = document.querySelector('header.topbar');
    const parent = topbar?.parentElement;
    if (topbar && parent) parent.replaceChild(renderTopbar(), topbar);
    const statsCard = document.getElementById('stats-card');
    if (statsCard) statsCard.replaceWith(renderStatsCard());
  }
}, 1000);
