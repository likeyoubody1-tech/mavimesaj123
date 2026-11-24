import mineflayer from 'mineflayer';
import { EventEmitter } from 'events';

export interface BotConfig {
  host: string;
  port: number;
  username: string;
  version: string | false;
  auth: 'offline' | 'microsoft';
  authPassword: string;
  autoAuth: boolean;
  autoRespawn: boolean;
  autoReconnect: boolean;
  antiAfk: boolean;
}

export interface BotStatus {
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
  ping?: number;
  version?: string;
  lastError?: string;
  diagnostic?: string;
  joinedAt?: number;
}

export interface ChatLine {
  id: number;
  ts: number;
  kind: 'system' | 'chat' | 'whisper' | 'self' | 'info' | 'error' | 'ok';
  from?: string;
  text: string;
}

let chatSeq = 1;

export class MCBot extends EventEmitter {
  private bot: any = null;
  private cfg: BotConfig | null = null;
  private status: BotStatus = { connected: false, connecting: false };
  private reconnectTimer: NodeJS.Timeout | null = null;
  private antiAfkTimer: NodeJS.Timeout | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private manualDisconnect = false;
  private players: string[] = [];
  private chatHistory: ChatLine[] = [];
  private readonly maxHistory = 500;

  getStatus(): BotStatus { return this.status; }
  getPlayers(): string[] { return this.players.slice(); }
  getHistory(): ChatLine[] { return this.chatHistory.slice(); }
  isConnected(): boolean { return this.status.connected; }

  private pushChat(line: Omit<ChatLine, 'id' | 'ts'>) {
    const full: ChatLine = { id: chatSeq++, ts: Date.now(), ...line };
    this.chatHistory.push(full);
    if (this.chatHistory.length > this.maxHistory) this.chatHistory.splice(0, this.chatHistory.length - this.maxHistory);
    this.emit('chat', full);
    return full;
  }

  private setStatus(patch: Partial<BotStatus>) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  private setPlayers(list: string[]) {
    this.players = list;
    this.emit('players', this.players);
  }

  connect(cfg: BotConfig) {
    if (this.status.connecting || this.status.connected) this.disconnect(true);
    this.manualDisconnect = false;
    this.cfg = cfg;
    this.setStatus({
      connecting: true,
      connected: false,
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      version: cfg.version || undefined,
      lastError: undefined,
      diagnostic: undefined,
      health: undefined,
      food: undefined,
      position: undefined,
    });
    this.pushChat({ kind: 'info', text: `${cfg.host}:${cfg.port} sunucusuna ${cfg.username} (${cfg.auth === 'microsoft' ? 'premium' : 'cracked'}) olarak bağlanılıyor...` });

    try {
      const options: any = {
        host: cfg.host,
        port: cfg.port,
        username: cfg.username,
        auth: cfg.auth,
        hideErrors: true,
        checkTimeoutInterval: 60_000,
      };
      if (cfg.version) options.version = cfg.version;
      this.bot = mineflayer.createBot(options);
      // mineflayer bazı hataları bot nesnesinde 'error' olarak yayar; yakalanmazsa süreç çöker
      this.bot.on('error', () => {});
    } catch (err: any) {
      this.fail(err, false);
      return;
    }

    this.startWatchdog();
    this.bindEvents();
  }

  /** Bağlantı ~30sn içinde ne spawn ne de hata verirse takılmayı çöz */
  private startWatchdog() {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      if (this.status.connected || this.manualDisconnect) return;
      this.pushChat({ kind: 'error', text: 'Zaman aşımı: sunucu 30 saniyede yanıt vermedi.' });
      this.setStatus({
        connecting: false,
        connected: false,
        lastError: 'timeout',
        diagnostic: 'Sunucu yanıt vermedi. Olası sebepler: IP/port yanlış, sunucu kapalı, sürüm uyumsuz, ya da anti-bot/proxy botu engelliyor. Sürüm alanına sunucunun tam sürümünü yazmayı dene (örn. 1.20.4).',
      });
      try { this.bot?.end?.(); } catch {}
      this.bot = null;
      this.scheduleReconnect();
    }, 30_000);
  }

  private clearWatchdog() {
    if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }
  }

  /** Hatayı Türkçe teşhisle birlikte raporla */
  private fail(err: any, scheduleReconnect = true) {
    this.clearWatchdog();
    const raw = String(err?.message || err || 'bilinmeyen hata');
    const diag = this.diagnose(raw);
    this.pushChat({ kind: 'error', text: `Bağlantı hatası: ${raw}` });
    if (diag) this.pushChat({ kind: 'error', text: `→ ${diag}` });
    this.setStatus({ connecting: false, connected: false, lastError: raw, diagnostic: diag });
    try { this.bot?.end?.(); } catch {}
    this.bot = null;
    this.setPlayers([]);
    if (scheduleReconnect) this.scheduleReconnect();
  }

  /** Yaygın hata/kick sebeplerini Türkçe öneriye çevir */
  private diagnose(text: string): string {
    const t = text.toLowerCase();
    if (t.includes('econnrefused')) return 'Sunucu bu port üzerinden bağlantı kabul etmedi. IP ve portu kontrol et (varsayılan 25565). Sunucu açık mı?';
    if (t.includes('enotfound') || t.includes('getaddrinfo')) return 'Sunucu adresi bulunamadı. IP/alan adını yanlış yazmış olabilirsin.';
    if (t.includes('etimedout') || t.includes('timed out') || t.includes('timeout')) return 'Sunucuya ulaşılamadı (zaman aşımı). Sunucu kapalı olabilir ya da seni engelliyor olabilir.';
    if (t.includes('econnreset') || t.includes('epipe') || t.includes('socket hang up') || t.includes('ended') || t.includes('closed')) return 'Sunucu bağlantıyı aniden kapattı. Çoğu zaman bunu anti-bot koruması, yanlış sürüm ya da sunucunun botları engellemesi yapar. Sürüm alanına sunucunun tam sürümünü yazmayı dene.';
    if (t.includes('unsupported') || t.includes('unknown version') || t.includes('is not supported')) return 'Bu sürüm desteklenmiyor. Sürüm alanını boş bırak (otomatik) ya da 1.8 - 1.21 arası geçerli bir sürüm yaz.';
    if (t.includes('premium') || t.includes('not premium') || t.includes('mojang') || (t.includes('authenticate') && t.includes('fail'))) return 'Sunucu premium (online-mode) hesap istiyor. Mod kısmını "Premium" yapıp Microsoft hesabıyla gir, ya da cracked bir sunucu kullan.';
    if (t.includes('whitelist')) return 'Sunucu beyaz listeli (whitelist). Bot kullanıcı adının listeye eklenmesi gerekir.';
    if (t.includes('ban')) return 'Bu kullanıcı adı ya da IP sunucudan yasaklı.';
    if (t.includes('throttled') || t.includes('wait') && t.includes('reconnect')) return 'Çok sık bağlandın, sunucu geçici engelledi. Birkaç dakika bekle.';
    if (t.includes('full') || t.includes('server is full')) return 'Sunucu dolu.';
    if (t.includes('name') && (t.includes('invalid') || t.includes('taken'))) return 'Kullanıcı adı geçersiz ya da kullanımda. 3-16 karakter, sadece harf/rakam/alt çizgi dene.';
    return '';
  }

  disconnect(silent = false) {
    this.manualDisconnect = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.antiAfkTimer) { clearInterval(this.antiAfkTimer); this.antiAfkTimer = null; }
    this.clearWatchdog();
    try { this.bot?.quit('kullanıcı istedi'); } catch {}
    try { this.bot?.end?.(); } catch {}
    this.bot = null;
    this.setPlayers([]);
    this.setStatus({ connected: false, connecting: false });
    if (!silent) this.pushChat({ kind: 'info', text: 'Bot bağlantısı kapatıldı.' });
  }

  chat(message: string) {
    if (!this.bot || !this.status.connected) {
      this.pushChat({ kind: 'error', text: 'Bot bağlı değil, mesaj gönderilemedi.' });
      return;
    }
    const msg = String(message || '').trim();
    if (!msg) return;
    const chunks = this.chunkMessage(msg, 256);
    for (const c of chunks) {
      try { this.bot.chat(c); } catch (err: any) {
        this.pushChat({ kind: 'error', text: `Gönderilemedi: ${err?.message || err}` });
        return;
      }
    }
    this.pushChat({ kind: 'self', from: this.status.username, text: msg });
  }

  action(name: string, params: any = {}) {
    if (!this.bot || !this.status.connected) {
      this.pushChat({ kind: 'error', text: 'Bot bağlı değil, aksiyon atılamadı.' });
      return;
    }
    try {
      switch (name) {
        case 'jump':
          this.bot.setControlState('jump', true);
          setTimeout(() => this.bot?.setControlState('jump', false), 400);
          break;
        case 'sneak':
          this.bot.setControlState('sneak', !!params.on);
          break;
        case 'sprint':
          this.bot.setControlState('sprint', !!params.on);
          break;
        case 'forward':
          this.bot.setControlState('forward', !!params.on);
          break;
        case 'back':
          this.bot.setControlState('back', !!params.on);
          break;
        case 'left':
          this.bot.setControlState('left', !!params.on);
          break;
        case 'right':
          this.bot.setControlState('right', !!params.on);
          break;
        case 'lookAt': {
          const p = this.bot.players[params.player];
          if (p?.entity) this.bot.lookAt(p.entity.position.offset(0, 1.6, 0));
          break;
        }
        case 'respawn':
          this.bot.respawn?.();
          break;
        case 'dropAll':
          (async () => {
            for (const item of this.bot.inventory.items()) {
              try { await this.bot.tossStack(item); } catch {}
            }
          })();
          break;
        case 'stopAll':
          ['forward','back','left','right','sprint','sneak','jump'].forEach(c => this.bot.setControlState(c, false));
          break;
        default:
          this.pushChat({ kind: 'error', text: `Bilinmeyen aksiyon: ${name}` });
      }
    } catch (err: any) {
      this.pushChat({ kind: 'error', text: `Aksiyon hatası (${name}): ${err?.message || err}` });
    }
  }

  private chunkMessage(msg: string, size: number): string[] {
    if (msg.length <= size) return [msg];
    const out: string[] = [];
    for (let i = 0; i < msg.length; i += size) out.push(msg.slice(i, i + size));
    return out;
  }

  private scheduleReconnect() {
    if (!this.cfg?.autoReconnect || this.manualDisconnect) return;
    if (this.reconnectTimer) return;
    this.pushChat({ kind: 'info', text: '10 saniye içinde yeniden bağlanılacak...' });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.cfg && !this.manualDisconnect) this.connect(this.cfg);
    }, 10_000);
  }

  private tryAutoAuth(raw: string) {
    if (!this.cfg?.autoAuth || !this.cfg.authPassword) return;
    const pw = this.cfg.authPassword;
    const low = raw.toLowerCase();

    const askRegister =
      /\/register\b/.test(low) ||
      /kay[ıi]t olun/.test(low) ||
      /register with/.test(low) ||
      /please register/.test(low) ||
      /\bkay[ıi]t ol\b/.test(low);
    const askLogin =
      /\/login\b/.test(low) ||
      /please login/.test(low) ||
      /giri[şs] yap/.test(low) ||
      /\/l\b/.test(low) ||
      /\bşifreni[zi]?\s*(gir|yaz)/.test(low);

    if (askRegister && !this._didRegister) {
      this._didRegister = true;
      setTimeout(() => this.bot?.chat(`/register ${pw} ${pw}`), 800);
      setTimeout(() => this.bot?.chat(`/reg ${pw} ${pw}`), 2200);
    } else if (askLogin && !this._didLogin) {
      this._didLogin = true;
      setTimeout(() => this.bot?.chat(`/login ${pw}`), 800);
      setTimeout(() => this.bot?.chat(`/l ${pw}`), 2200);
    }

    const captchaCtx = /captcha|do[ğg]rula|verify|verif|code|kod/.test(low);
    if (captchaCtx) {
      const m = raw.match(/(\d+)\s*([+\-*xX\/])\s*(\d+)\s*=?/);
      if (m) {
        const a = parseInt(m[1], 10), b = parseInt(m[3], 10);
        const op = m[2];
        let r: number | null = null;
        if (op === '+') r = a + b;
        else if (op === '-') r = a - b;
        else if (op === '*' || op === 'x' || op === 'X') r = a * b;
        else if (op === '/' && b !== 0) r = Math.floor(a / b);
        if (r !== null) setTimeout(() => this.bot?.chat(String(r)), 700);
      }
      const codeMatch = raw.match(/\b(?:kod|code|captcha)[^A-Za-z0-9]*([A-Za-z0-9]{3,8})\b/i);
      if (codeMatch) setTimeout(() => this.bot?.chat(codeMatch[1]), 900);
    }
  }

  private _didRegister = false;
  private _didLogin = false;

  private bindEvents() {
    const bot = this.bot;
    if (!bot) return;

    bot.on('login', () => {
      this.setStatus({ connecting: true });
      this.pushChat({ kind: 'info', text: 'Sunucu login kabul etti, dünyaya giriliyor...' });
    });

    bot.once('spawn', () => {
      this.clearWatchdog();
      this._didRegister = false;
      this._didLogin = false;
      this.setStatus({
        connecting: false,
        connected: true,
        username: bot.username,
        version: bot.version,
        joinedAt: Date.now(),
        lastError: undefined,
        diagnostic: undefined,
      });
      this.refreshPlayers();
      this.pushChat({ kind: 'ok', text: `Sunucuya girildi — ${bot.username} (${bot.version})` });
      if (this.cfg?.antiAfk) this.startAntiAfk();
    });

    bot.on('health', () => {
      this.setStatus({ health: bot.health, food: bot.food });
    });

    bot.on('experience', () => {
      this.setStatus({ xp: bot.experience?.level ?? 0 });
    });

    bot.on('move', () => {
      if (!bot.entity) return;
      const p = bot.entity.position;
      this.setStatus({
        position: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10 },
        dimension: bot.game?.dimension,
      });
    });

    bot.on('death', () => {
      this.pushChat({ kind: 'info', text: 'Bot öldü.' });
      if (this.cfg?.autoRespawn) {
        setTimeout(() => { try { bot.respawn(); } catch {} }, 1000);
      }
    });

    bot.on('playerJoined', (p: any) => { this.refreshPlayers(); this.emit('playerEvent', { type: 'join', name: p?.username }); });
    bot.on('playerLeft', (p: any) => { this.refreshPlayers(); this.emit('playerEvent', { type: 'leave', name: p?.username }); });

    bot.on('whisper', (user: string, text: string) => {
      if (user === bot.username) return;
      this.pushChat({ kind: 'whisper', from: user, text });
    });

    // Tüm sunucu mesajları (sohbet + sistem) tek kaynaktan — hiçbir satır kaçmaz, çift gösterilmez
    bot.on('messagestr', (text: string) => {
      const line = String(text || '');
      if (!line.trim()) return;
      const m = line.match(/^<([^>]{1,16})>\s?(.*)$/);
      if (m) this.pushChat({ kind: 'chat', from: m[1], text: m[2] });
      else this.pushChat({ kind: 'system', text: line });
      this.tryAutoAuth(line);
    });

    bot.on('kicked', (reason: any) => {
      this.clearWatchdog();
      const r = componentToText(reason) || 'bilinmeyen sebep';
      const diag = this.diagnose(r);
      this.pushChat({ kind: 'error', text: `Sunucudan atıldın: ${r}` });
      if (diag) this.pushChat({ kind: 'error', text: `→ ${diag}` });
      this.setStatus({ connected: false, connecting: false, lastError: r, diagnostic: diag });
      this.setPlayers([]);
      this.scheduleReconnect();
    });

    bot.on('end', (reason: any) => {
      this.clearWatchdog();
      const wasConnected = this.status.connected;
      this.setStatus({ connected: false, connecting: false });
      this.setPlayers([]);
      if (this.antiAfkTimer) { clearInterval(this.antiAfkTimer); this.antiAfkTimer = null; }
      if (!this.manualDisconnect) {
        const r = componentToText(reason);
        // Hiç spawn olmadan koptuysa bu bir bağlantı hatasıdır → teşhis göster
        if (!wasConnected && !this.status.lastError) {
          const diag = this.diagnose(r || '') || 'Sunucuya girilemeden bağlantı kapandı. Sürüm uyumsuzluğu veya anti-bot koruması olabilir. Sürüm alanına sunucunun tam sürümünü yaz.';
          this.pushChat({ kind: 'error', text: `Bağlantı kapandı${r ? ` (${r})` : ''}.` });
          this.pushChat({ kind: 'error', text: `→ ${diag}` });
          this.setStatus({ diagnostic: diag, lastError: r || 'disconnected' });
        } else {
          this.pushChat({ kind: 'info', text: `Bağlantı koptu${r ? ` (${r})` : ''}.` });
        }
        this.scheduleReconnect();
      }
    });

    bot.on('error', (err: any) => {
      const msg = String(err?.message || err);
      // Spawn olmadıysa bu bağlantı hatasıdır; end eventi gerisini halleder ama teşhisi şimdi kaydet
      const diag = this.diagnose(msg);
      this.pushChat({ kind: 'error', text: `Hata: ${msg}` });
      if (diag && !this.status.diagnostic) this.pushChat({ kind: 'error', text: `→ ${diag}` });
      this.setStatus({ lastError: msg, diagnostic: this.status.diagnostic || diag });
    });
  }

  private refreshPlayers() {
    if (!this.bot) return;
    const all = Object.keys(this.bot.players || {});
    this.setPlayers(all);
  }

  private startAntiAfk() {
    if (this.antiAfkTimer) clearInterval(this.antiAfkTimer);
    let flip = false;
    this.antiAfkTimer = setInterval(() => {
      if (!this.bot || !this.status.connected) return;
      try {
        this.bot.setControlState('jump', true);
        setTimeout(() => this.bot?.setControlState('jump', false), 200);
        this.bot.look(this.bot.entity.yaw + (flip ? 0.2 : -0.2), 0, false);
        flip = !flip;
      } catch {}
    }, 20_000);
  }
}

/** Minecraft chat component'ini (string / ChatMessage nesnesi / JSON) okunur metne çevirir */
function componentToText(input: any): string {
  if (input == null) return '';
  if (typeof input === 'string') {
    // JSON chat component string olabilir
    const s = input.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try { return componentToText(JSON.parse(s)); } catch { return stripCodes(s); }
    }
    return stripCodes(s);
  }
  // prismarine-chat ChatMessage genelde toString() destekler
  if (typeof input.toString === 'function' && input.toString !== Object.prototype.toString) {
    const s = input.toString();
    if (s && s !== '[object Object]') return stripCodes(s);
  }
  if (Array.isArray(input)) return input.map(componentToText).join('');
  let out = '';
  if (typeof input.text === 'string') out += input.text;
  if (typeof input.translate === 'string' && !out) out += input.translate;
  if (Array.isArray(input.extra)) out += input.extra.map(componentToText).join('');
  if (Array.isArray(input.with)) out += ' ' + input.with.map(componentToText).join(' ');
  return stripCodes(out.trim());
}

function stripCodes(s: string): string {
  return String(s).replace(/§[0-9a-fk-or]/gi, '').trim();
}
