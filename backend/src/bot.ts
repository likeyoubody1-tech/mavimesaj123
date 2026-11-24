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
      lastError: undefined,
    });
    this.pushChat({ kind: 'info', text: `${cfg.host}:${cfg.port} sunucusuna ${cfg.username} olarak bağlanılıyor...` });

    try {
      const options: any = {
        host: cfg.host,
        port: cfg.port,
        username: cfg.username,
        auth: cfg.auth,
        hideErrors: true,
      };
      if (cfg.version) options.version = cfg.version;
      this.bot = mineflayer.createBot(options);
    } catch (err: any) {
      this.setStatus({ connecting: false, connected: false, lastError: String(err?.message || err) });
      this.pushChat({ kind: 'error', text: `Bağlantı hatası: ${err?.message || err}` });
      this.scheduleReconnect();
      return;
    }

    this.bindEvents();
  }

  disconnect(silent = false) {
    this.manualDisconnect = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.antiAfkTimer) { clearInterval(this.antiAfkTimer); this.antiAfkTimer = null; }
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
      this._didRegister = false;
      this._didLogin = false;
      this.setStatus({
        connecting: false,
        connected: true,
        username: bot.username,
        version: bot.version,
        joinedAt: Date.now(),
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
      this.pushChat({ kind: 'whisper', from: user, text });
      this.tryAutoAuth(text);
    });

    bot.on('chat', (user: string, text: string) => {
      if (user === bot.username) return;
      this.pushChat({ kind: 'chat', from: user, text });
      this.tryAutoAuth(text);
    });

    bot.on('messagestr', (text: string, position: string) => {
      if (position === 'chat') return;
      this.pushChat({ kind: 'system', text });
      this.tryAutoAuth(text);
    });

    bot.on('kicked', (reason: any) => {
      let r = typeof reason === 'string' ? reason : JSON.stringify(reason);
      try { const parsed = JSON.parse(reason); r = parsed?.text || parsed?.translate || r; } catch {}
      this.pushChat({ kind: 'error', text: `Atıldı: ${r}` });
      this.setStatus({ connected: false, connecting: false, lastError: r });
      this.setPlayers([]);
      this.scheduleReconnect();
    });

    bot.on('end', (reason: string) => {
      this.setStatus({ connected: false, connecting: false });
      this.setPlayers([]);
      if (this.antiAfkTimer) { clearInterval(this.antiAfkTimer); this.antiAfkTimer = null; }
      if (!this.manualDisconnect) {
        this.pushChat({ kind: 'info', text: `Bağlantı koptu${reason ? ` (${reason})` : ''}.` });
        this.scheduleReconnect();
      }
    });

    bot.on('error', (err: any) => {
      const msg = String(err?.message || err);
      this.pushChat({ kind: 'error', text: `Hata: ${msg}` });
      this.setStatus({ lastError: msg });
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
