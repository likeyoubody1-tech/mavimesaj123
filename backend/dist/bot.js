import mineflayer from 'mineflayer';
import { EventEmitter } from 'events';
let chatSeq = 1;
export class MCBot extends EventEmitter {
    bot = null;
    cfg = null;
    status = { connected: false, connecting: false };
    reconnectTimer = null;
    antiAfkTimer = null;
    watchdogTimer = null;
    manualDisconnect = false;
    players = [];
    chatHistory = [];
    maxHistory = 500;
    getStatus() { return this.status; }
    getPlayers() { return this.players.slice(); }
    getHistory() { return this.chatHistory.slice(); }
    isConnected() { return this.status.connected; }
    pushChat(line) {
        const full = { id: chatSeq++, ts: Date.now(), ...line };
        this.chatHistory.push(full);
        if (this.chatHistory.length > this.maxHistory)
            this.chatHistory.splice(0, this.chatHistory.length - this.maxHistory);
        this.emit('chat', full);
        return full;
    }
    setStatus(patch) {
        this.status = { ...this.status, ...patch };
        this.emit('status', this.status);
    }
    setPlayers(list) {
        this.players = list;
        this.emit('players', this.players);
    }
    connect(cfg, isReconnect = false) {
        if (this.status.connecting || this.status.connected)
            this.disconnect(true);
        this.manualDisconnect = false;
        this.cfg = cfg;
        // Kullanıcı elle bağlandığında anti-bot sayaçlarını sıfırla
        // (otomatik yeniden bağlanma döngüsünde sayaç korunmalı)
        if (!isReconnect) {
            this._everSpawned = false;
            this._reconnectAttempts = 0;
            this._lastCaptchaCode = '';
            this._lastAnswer = '';
        }
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
            const options = {
                host: cfg.host,
                port: cfg.port,
                username: cfg.username,
                auth: cfg.auth,
                hideErrors: true,
                checkTimeoutInterval: 60_000,
            };
            if (cfg.version)
                options.version = cfg.version;
            this.bot = mineflayer.createBot(options);
            // mineflayer bazı hataları bot nesnesinde 'error' olarak yayar; yakalanmazsa süreç çöker
            this.bot.on('error', () => { });
        }
        catch (err) {
            this.fail(err, false);
            return;
        }
        this.startWatchdog();
        this.bindEvents();
    }
    /** Bağlantı ~30sn içinde ne spawn ne de hata verirse takılmayı çöz */
    startWatchdog() {
        this.clearWatchdog();
        this.watchdogTimer = setTimeout(() => {
            if (this.status.connected || this.manualDisconnect)
                return;
            this.pushChat({ kind: 'error', text: 'Zaman aşımı: sunucu 30 saniyede yanıt vermedi.' });
            this.setStatus({
                connecting: false,
                connected: false,
                lastError: 'timeout',
                diagnostic: 'Sunucu yanıt vermedi. Olası sebepler: IP/port yanlış, sunucu kapalı, sürüm uyumsuz, ya da anti-bot/proxy botu engelliyor. Sürüm alanına sunucunun tam sürümünü yazmayı dene (örn. 1.20.4).',
            });
            try {
                this.bot?.end?.();
            }
            catch { }
            this.bot = null;
            this.scheduleReconnect();
        }, 30_000);
    }
    clearWatchdog() {
        if (this.watchdogTimer) {
            clearTimeout(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }
    /** Hatayı Türkçe teşhisle birlikte raporla */
    fail(err, scheduleReconnect = true) {
        this.clearWatchdog();
        const raw = String(err?.message || err || 'bilinmeyen hata');
        const diag = this.diagnose(raw);
        this.pushChat({ kind: 'error', text: `Bağlantı hatası: ${raw}` });
        if (diag)
            this.pushChat({ kind: 'error', text: `→ ${diag}` });
        this.setStatus({ connecting: false, connected: false, lastError: raw, diagnostic: diag });
        try {
            this.bot?.end?.();
        }
        catch { }
        this.bot = null;
        this.setPlayers([]);
        if (scheduleReconnect)
            this.scheduleReconnect();
    }
    /** Yaygın hata/kick sebeplerini Türkçe öneriye çevir */
    diagnose(text) {
        const t = text.toLowerCase();
        if (t.includes('econnrefused'))
            return 'Sunucu bu port üzerinden bağlantı kabul etmedi. IP ve portu kontrol et (varsayılan 25565). Sunucu açık mı?';
        if (t.includes('enotfound') || t.includes('getaddrinfo'))
            return 'Sunucu adresi bulunamadı. IP/alan adını yanlış yazmış olabilirsin.';
        if (t.includes('etimedout') || t.includes('timed out') || t.includes('timeout'))
            return 'Sunucuya ulaşılamadı (zaman aşımı). Sunucu kapalı olabilir ya da seni engelliyor olabilir.';
        if (t.includes('econnreset') || t.includes('epipe') || t.includes('socket hang up') || t.includes('ended') || t.includes('closed'))
            return 'Sunucu bağlantıyı aniden kapattı. Çoğu zaman bunu anti-bot koruması, yanlış sürüm ya da sunucunun botları engellemesi yapar. Sürüm alanına sunucunun tam sürümünü yazmayı dene.';
        if (t.includes('unsupported') || t.includes('unknown version') || t.includes('is not supported'))
            return 'Bu sürüm desteklenmiyor. Sürüm alanını boş bırak (otomatik) ya da 1.8 - 1.21 arası geçerli bir sürüm yaz.';
        if (t.includes('premium') || t.includes('not premium') || t.includes('mojang') || (t.includes('authenticate') && t.includes('fail')))
            return 'Sunucu premium (online-mode) hesap istiyor. Mod kısmını "Premium" yapıp Microsoft hesabıyla gir, ya da cracked bir sunucu kullan.';
        if (t.includes('whitelist'))
            return 'Sunucu beyaz listeli (whitelist). Bot kullanıcı adının listeye eklenmesi gerekir.';
        if (t.includes('ban'))
            return 'Bu kullanıcı adı ya da IP sunucudan yasaklı.';
        if (t.includes('throttled') || t.includes('wait') && t.includes('reconnect'))
            return 'Çok sık bağlandın, sunucu geçici engelledi. Birkaç dakika bekle.';
        if (t.includes('full') || t.includes('server is full'))
            return 'Sunucu dolu.';
        if (t.includes('name') && (t.includes('invalid') || t.includes('taken')))
            return 'Kullanıcı adı geçersiz ya da kullanımda. 3-16 karakter, sadece harf/rakam/alt çizgi dene.';
        return '';
    }
    disconnect(silent = false) {
        this.manualDisconnect = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.antiAfkTimer) {
            clearInterval(this.antiAfkTimer);
            this.antiAfkTimer = null;
        }
        this.clearWatchdog();
        try {
            this.bot?.quit('kullanıcı istedi');
        }
        catch { }
        try {
            this.bot?.end?.();
        }
        catch { }
        this.bot = null;
        this.setPlayers([]);
        this.setStatus({ connected: false, connecting: false });
        if (!silent)
            this.pushChat({ kind: 'info', text: 'Bot bağlantısı kapatıldı.' });
    }
    chat(message) {
        if (!this.bot || !this.status.connected) {
            this.pushChat({ kind: 'error', text: 'Bot bağlı değil, mesaj gönderilemedi.' });
            return;
        }
        const msg = String(message || '').trim();
        if (!msg)
            return;
        const chunks = this.chunkMessage(msg, 256);
        for (const c of chunks) {
            try {
                this.bot.chat(c);
            }
            catch (err) {
                this.pushChat({ kind: 'error', text: `Gönderilemedi: ${err?.message || err}` });
                return;
            }
        }
        this.pushChat({ kind: 'self', from: this.status.username, text: msg });
    }
    action(name, params = {}) {
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
                    if (p?.entity)
                        this.bot.lookAt(p.entity.position.offset(0, 1.6, 0));
                    break;
                }
                case 'respawn':
                    this.bot.respawn?.();
                    break;
                case 'dropAll':
                    (async () => {
                        for (const item of this.bot.inventory.items()) {
                            try {
                                await this.bot.tossStack(item);
                            }
                            catch { }
                        }
                    })();
                    break;
                case 'stopAll':
                    ['forward', 'back', 'left', 'right', 'sprint', 'sneak', 'jump'].forEach(c => this.bot.setControlState(c, false));
                    break;
                default:
                    this.pushChat({ kind: 'error', text: `Bilinmeyen aksiyon: ${name}` });
            }
        }
        catch (err) {
            this.pushChat({ kind: 'error', text: `Aksiyon hatası (${name}): ${err?.message || err}` });
        }
    }
    chunkMessage(msg, size) {
        if (msg.length <= size)
            return [msg];
        const out = [];
        for (let i = 0; i < msg.length; i += size)
            out.push(msg.slice(i, i + size));
        return out;
    }
    scheduleReconnect() {
        if (this.manualDisconnect)
            return;
        // Anti-bot: hiç spawn olmadan düştüysek (çoğu anti-bot ilk bağlantıyı keser),
        // autoReconnect kapalı olsa bile hızlıca tekrar dene.
        const earlyAntiBot = this.cfg?.antiBot && !this._everSpawned;
        if (!this.cfg?.autoReconnect && !earlyAntiBot)
            return;
        if (this.reconnectTimer)
            return;
        this._reconnectAttempts++;
        if (earlyAntiBot && this._reconnectAttempts > 60) {
            this.pushChat({ kind: 'error', text: 'Anti-bot 60 denemede geçilemedi. Sürümü kontrol et ya da sunucu farklı bir doğrulama kullanıyor olabilir.' });
            return;
        }
        // Anti-bot "ilk bağlantıyı kes" deseni: ilk denemeler hızlı, sonra biraz yavaşlar
        const delay = earlyAntiBot ? (this._reconnectAttempts <= 3 ? 1500 : this._reconnectAttempts <= 10 ? 2500 : 4000) : 10_000;
        this.pushChat({ kind: 'info', text: `${(delay / 1000).toFixed(1)} saniye içinde yeniden bağlanılacak${earlyAntiBot ? ` (anti-bot geçiş denemesi #${this._reconnectAttempts})` : ''}...` });
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.cfg && !this.manualDisconnect)
                this.connect(this.cfg, true);
        }, delay);
    }
    /** GUI/envanter captcha'sı: açılan pencerede "onay/tıkla" ögesini bulup tıklar */
    handleWindowCaptcha(window) {
        const bot = this.bot;
        if (!bot || !window)
            return;
        let slots = [];
        try {
            slots = (window.slots || []).slice();
        }
        catch {
            return;
        }
        // Sadece sandık/menü içeriği (oyuncu envanterini hariç tut): ilk inventoryStart'a kadar
        const invStart = typeof window.inventoryStart === 'number' ? window.inventoryStart : slots.length;
        const menu = slots.slice(0, invStart).map((it, i) => ({ it, slot: i })).filter(x => x.it);
        if (!menu.length)
            return;
        const GOOD = /(onay|onayla|do[ğg]rula|do[ğg]rulan|kabul|t[ıi]kla|click|verify|verif|confirm|continue|devam|ba[şs]la|start|evet|yes|gir(i[şs])?|join|accept|green|lime|emerald|slime|✔|✓|✅|☑)/i;
        const BAD = /(gray|grey|black|white|light_blue|cyan|barrier|background|filler|cam|pane)/i;
        const nameOf = (it) => {
            const parts = [];
            if (it.name)
                parts.push(it.name);
            if (it.displayName)
                parts.push(it.displayName);
            try {
                const c = componentToText(it.customName);
                if (c)
                    parts.push(c);
            }
            catch { }
            return parts.join(' ').toLowerCase();
        };
        // Puanla: onay kelimesi +3, iyi materyal +2, cam/filler -3
        let best = null;
        for (const { it, slot } of menu) {
            const nm = nameOf(it);
            let score = 0;
            if (GOOD.test(nm))
                score += 3;
            if (/(emerald|lime_wool|green_wool|lime_concrete|green_concrete|lime_stained|green_stained|slime_ball)/i.test(nm))
                score += 2;
            if (BAD.test(nm))
                score -= 3;
            if (best === null || score > best.score)
                best = { slot, score };
        }
        // Sadece belirgin bir onay ögesi, ya da tek bir dolu (filler olmayan) öge varsa tıkla.
        // Her şey filler/camsa dokunma (yanlış tıklama anti-bot'u bozabilir).
        const nonFiller = menu.filter(x => !BAD.test(nameOf(x.it)));
        let target = -1;
        if (best && best.score > 0)
            target = best.slot;
        else if (nonFiller.length === 1)
            target = nonFiller[0].slot;
        if (target < 0) {
            this.pushChat({ kind: 'info', text: 'GUI captcha açıldı ama tıklanacak belirgin onay ögesi bulunamadı. Mesajı bana ilet.' });
            return;
        }
        try {
            bot.clickWindow(target, 0, 0);
            this.pushChat({ kind: 'info', text: `GUI captcha: ${target}. slota tıklandı (onay ögesi).` });
        }
        catch (e) {
            this.pushChat({ kind: 'error', text: `GUI captcha tıklama hatası: ${e?.message || e}` });
        }
    }
    /** Katılınca çalışacak komutları sırayla gönderir (her satır bir komut) */
    runJoinCommands() {
        const raw = this.cfg?.joinCommands || '';
        const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
        if (!lines.length)
            return;
        // Auth gecikmesinden sonra başla ki register/login önce otursun
        lines.forEach((cmd, i) => {
            setTimeout(() => {
                if (this.bot && this.status.connected) {
                    try {
                        this.bot.chat(cmd);
                        this.pushChat({ kind: 'self', from: this.status.username, text: cmd });
                    }
                    catch { }
                }
            }, 3500 + i * 1500);
        });
    }
    /** Anti-bot hareket kontrollerini geçmek için spawn sonrası insansı davranış */
    humanizeJoin() {
        const bot = this.bot;
        if (!bot)
            return;
        const steps = [
            () => { try {
                bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.6, false);
            }
            catch { } },
            () => { try {
                bot.setControlState('forward', true);
            }
            catch { } },
            () => { try {
                bot.setControlState('forward', false);
                bot.setControlState('jump', true);
            }
            catch { } },
            () => { try {
                bot.setControlState('jump', false);
                bot.setControlState('back', true);
            }
            catch { } },
            () => { try {
                bot.setControlState('back', false);
                bot.look(Math.random() * Math.PI * 2, 0, false);
            }
            catch { } },
            () => { try {
                bot.swingArm?.('right');
            }
            catch { } },
        ];
        steps.forEach((fn, i) => setTimeout(() => { if (this.bot && this.status.connected)
            fn(); }, 500 + i * 500));
    }
    /** Sunucudan gelen her metni (sohbet/sistem/title/bossbar/scoreboard) işler:
     *  otomatik register/login + çok biçimli captcha çözümü */
    onServerText(raw) {
        if (!raw || !raw.trim())
            return;
        const pw = this.cfg?.authPassword || '';
        const low = raw.toLowerCase();
        // 1) Register / Login
        if (this.cfg?.autoAuth && pw) {
            const askRegister = /\/register\b/.test(low) || /\/reg\b/.test(low) ||
                /kay[ıi]t ol/.test(low) || /register (with|using)/.test(low) ||
                /please register/.test(low) || /hen[üu]z kay[ıi]t/.test(low) ||
                /not registered/.test(low);
            const askLogin = /\/login\b/.test(low) || /\/l\b/.test(low) ||
                /please login/.test(low) || /log ?in/.test(low) ||
                /giri[şs] yap/.test(low) || /şifreni[zi]?\s*(gir|yaz)/.test(low) ||
                /zaten kay[ıi]tl[ıi]/.test(low) || /already registered/.test(low);
            if (askRegister && !this._didRegister) {
                this._didRegister = true;
                this.answer(`/register ${pw} ${pw}`, 600);
                this.answer(`/reg ${pw} ${pw}`, 2000);
                this.answer(`/l ${pw}`, 3600); // bazı sunucular register sonrası login ister
            }
            else if (askLogin && !this._didLogin) {
                this._didLogin = true;
                this.answer(`/login ${pw}`, 600);
                this.answer(`/l ${pw}`, 2000);
            }
        }
        // 2) Captcha — her metinde dene (anti-bot context kelimesi olmasa bile title/bossbar olabilir)
        const captchaCtx = /captcha|do[ğg]rula|verify|verif|confirm|kod|code|antibot|anti-bot|çöz|solve|güvenlik|security|insan|human|robot/.test(low);
        // 2a) Matematik: "3 + 5", "12 x 2 = ?"
        const math = raw.match(/(\d{1,4})\s*([+\-*xX×\/])\s*(\d{1,4})/);
        if (math && (captchaCtx || /[=?]/.test(raw))) {
            const a = parseInt(math[1], 10), b = parseInt(math[3], 10);
            const op = math[2];
            let r = null;
            if (op === '+')
                r = a + b;
            else if (op === '-')
                r = a - b;
            else if (op === '*' || op === 'x' || op === 'X' || op === '×')
                r = a * b;
            else if (op === '/' && b !== 0)
                r = Math.round(a / b);
            if (r !== null) {
                this._lastCaptchaCode = String(r);
                this.answer(String(r), 500);
            }
        }
        // 2b) "type/write/yaz/gir/enter <CODE>" kalıbı
        const typeCode = raw.match(/\b(?:type|write|enter|yaz|gir|girin|yaz[ıi]n|say)\b[^A-Za-z0-9]{0,12}([A-Za-z0-9]{3,10})\b/i);
        if (typeCode) {
            this._lastCaptchaCode = typeCode[1];
            this.answer(typeCode[1], 650);
        }
        // 2c) "kod: ABC123" / "code: ABC123" / "captcha ABC123"
        const labeled = raw.match(/\b(?:kod|code|captcha|do[ğg]rulama)\b[^A-Za-z0-9]{0,8}([A-Za-z0-9]{3,10})\b/i);
        if (labeled && !/captcha$/i.test(labeled[1])) {
            this._lastCaptchaCode = labeled[1];
            this.answer(labeled[1], 700);
        }
        // 2d) Sadece büyük harf/rakam kod bloğu, captcha context varsa (örn "AB3K9")
        if (captchaCtx && !typeCode && !labeled && !math) {
            const token = raw.match(/\b([A-Z0-9]{4,8})\b/);
            // En az bir harf içersin ki saf sayı (süre/sayaç) yakalanmasın
            if (token && /[A-Z]/.test(token[1])) {
                this._lastCaptchaCode = token[1];
                this.answer(token[1], 750);
            }
        }
    }
    /** Mesajı tekrar/spam önleyerek gönderir */
    answer(text, delayMs = 500) {
        const now = Date.now();
        if (text === this._lastAnswer && now - this._lastAnswerAt < 2500)
            return;
        this._lastAnswer = text;
        this._lastAnswerAt = now;
        setTimeout(() => {
            if (this.bot) {
                try {
                    this.bot.chat(text);
                }
                catch { }
            }
        }, delayMs);
    }
    _didRegister = false;
    _didLogin = false;
    _everSpawned = false;
    _lastCaptchaCode = '';
    _lastAnswer = '';
    _lastAnswerAt = 0;
    _reconnectAttempts = 0;
    _lastPosEmit = 0;
    bindEvents() {
        const bot = this.bot;
        if (!bot)
            return;
        bot.on('login', () => {
            this.setStatus({ connecting: true });
            this.pushChat({ kind: 'info', text: 'Sunucu login kabul etti, dünyaya giriliyor...' });
        });
        bot.once('spawn', () => {
            this.clearWatchdog();
            this._everSpawned = true;
            this._reconnectAttempts = 0;
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
            if (this.cfg?.antiBot) {
                this.pushChat({ kind: 'info', text: 'Anti-bot modu aktif: insansı hareket + captcha/doğrulama otomatik.' });
                this.humanizeJoin();
            }
            if (this.cfg?.antiAfk)
                this.startAntiAfk();
            this.runJoinCommands();
        });
        bot.on('health', () => {
            this.setStatus({ health: bot.health, food: bot.food });
        });
        bot.on('experience', () => {
            this.setStatus({ xp: bot.experience?.level ?? 0 });
        });
        bot.on('move', () => {
            if (!bot.entity)
                return;
            // Konumu en fazla saniyede bir yayınla — aksi halde her fizik tikinde
            // tüm panel yenilenir ve kullanıcı sohbete yazamaz.
            const now = Date.now();
            if (now - this._lastPosEmit < 1000)
                return;
            this._lastPosEmit = now;
            const p = bot.entity.position;
            this.setStatus({
                position: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10 },
                dimension: bot.game?.dimension,
            });
        });
        bot.on('death', () => {
            this.pushChat({ kind: 'info', text: 'Bot öldü.' });
            if (this.cfg?.autoRespawn) {
                setTimeout(() => { try {
                    bot.respawn();
                }
                catch { } }, 1000);
            }
        });
        bot.on('playerJoined', (p) => { this.refreshPlayers(); this.emit('playerEvent', { type: 'join', name: p?.username }); });
        bot.on('playerLeft', (p) => { this.refreshPlayers(); this.emit('playerEvent', { type: 'leave', name: p?.username }); });
        bot.on('whisper', (user, text) => {
            if (user === bot.username)
                return;
            this.pushChat({ kind: 'whisper', from: user, text });
        });
        // Tüm sunucu mesajları (sohbet + sistem) tek kaynaktan — hiçbir satır kaçmaz, çift gösterilmez
        bot.on('messagestr', (text) => {
            const line = String(text || '');
            if (!line.trim())
                return;
            const m = line.match(/^<([^>]{1,16})>\s?(.*)$/);
            if (m)
                this.pushChat({ kind: 'chat', from: m[1], text: m[2] });
            else
                this.pushChat({ kind: 'system', text: line });
            this.onServerText(line);
        });
        // Captcha / doğrulama title, boss bar ve scoreboard'da da gösterilebilir — hepsini dinle
        bot.on('title', (text) => {
            const t = componentToText(text);
            if (!t)
                return;
            this.pushChat({ kind: 'system', text: `[title] ${t}` });
            this.onServerText(t);
        });
        bot.on('bossBarCreated', (bar) => this.onServerText(componentToText(bar?.title)));
        bot.on('bossBarUpdated', (bar) => this.onServerText(componentToText(bar?.title)));
        bot.on('scoreboardCreated', (sb) => this.onServerText(componentToText(sb?.title)));
        bot.on('scoreboardTitleChanged', (sb) => this.onServerText(componentToText(sb?.title)));
        // Bazı anti-botlar resource pack kabulüyle doğrular — otomatik kabul et
        bot.on('resourcePack', () => {
            try {
                bot.acceptResourcePack?.();
                this.pushChat({ kind: 'info', text: 'Resource pack otomatik kabul edildi.' });
            }
            catch { }
        });
        // Tabela (sign) captcha'sı: sunucu tabela editörü açarsa son gördüğümüz kodu yaz
        bot.on('signOpen', (block) => {
            if (!this.cfg?.antiBot)
                return;
            const code = this._lastCaptchaCode;
            setTimeout(() => {
                try {
                    bot.updateSign?.(block, code || 'verify');
                    this.pushChat({ kind: 'info', text: `Tabela captcha'sına "${code || 'verify'}" yazıldı.` });
                }
                catch { }
            }, 600);
        });
        // GUI / envanter captcha'sı: sunucu bir sandık/menü açıp "tıkla" isterse onay ögesine tıkla
        bot.on('windowOpen', (window) => {
            if (!this.cfg?.antiBot)
                return;
            setTimeout(() => this.handleWindowCaptcha(window), 700);
        });
        bot.on('kicked', (reason) => {
            this.clearWatchdog();
            const r = componentToText(reason) || 'bilinmeyen sebep';
            const diag = this.diagnose(r);
            this.pushChat({ kind: 'error', text: `Sunucudan atıldın: ${r}` });
            if (diag)
                this.pushChat({ kind: 'error', text: `→ ${diag}` });
            this.setStatus({ connected: false, connecting: false, lastError: r, diagnostic: diag });
            this.setPlayers([]);
            this.scheduleReconnect();
        });
        bot.on('end', (reason) => {
            this.clearWatchdog();
            const wasConnected = this.status.connected;
            this.setStatus({ connected: false, connecting: false });
            this.setPlayers([]);
            if (this.antiAfkTimer) {
                clearInterval(this.antiAfkTimer);
                this.antiAfkTimer = null;
            }
            if (!this.manualDisconnect) {
                const r = componentToText(reason);
                // Hiç spawn olmadan koptuysa bu bir bağlantı hatasıdır → teşhis göster
                if (!wasConnected && !this.status.lastError) {
                    const diag = this.diagnose(r || '') || 'Sunucuya girilemeden bağlantı kapandı. Sürüm uyumsuzluğu veya anti-bot koruması olabilir. Sürüm alanına sunucunun tam sürümünü yaz.';
                    this.pushChat({ kind: 'error', text: `Bağlantı kapandı${r ? ` (${r})` : ''}.` });
                    this.pushChat({ kind: 'error', text: `→ ${diag}` });
                    this.setStatus({ diagnostic: diag, lastError: r || 'disconnected' });
                }
                else {
                    this.pushChat({ kind: 'info', text: `Bağlantı koptu${r ? ` (${r})` : ''}.` });
                }
                this.scheduleReconnect();
            }
        });
        bot.on('error', (err) => {
            const msg = String(err?.message || err);
            // Spawn olmadıysa bu bağlantı hatasıdır; end eventi gerisini halleder ama teşhisi şimdi kaydet
            const diag = this.diagnose(msg);
            this.pushChat({ kind: 'error', text: `Hata: ${msg}` });
            if (diag && !this.status.diagnostic)
                this.pushChat({ kind: 'error', text: `→ ${diag}` });
            this.setStatus({ lastError: msg, diagnostic: this.status.diagnostic || diag });
        });
    }
    refreshPlayers() {
        if (!this.bot)
            return;
        const all = Object.keys(this.bot.players || {});
        this.setPlayers(all);
    }
    startAntiAfk() {
        if (this.antiAfkTimer)
            clearInterval(this.antiAfkTimer);
        let flip = false;
        this.antiAfkTimer = setInterval(() => {
            if (!this.bot || !this.status.connected)
                return;
            try {
                this.bot.setControlState('jump', true);
                setTimeout(() => this.bot?.setControlState('jump', false), 200);
                this.bot.look(this.bot.entity.yaw + (flip ? 0.2 : -0.2), 0, false);
                flip = !flip;
            }
            catch { }
        }, 20_000);
    }
}
/** Minecraft chat component'ini (string / ChatMessage nesnesi / JSON) okunur metne çevirir */
function componentToText(input) {
    if (input == null)
        return '';
    if (typeof input === 'string') {
        // JSON chat component string olabilir
        const s = input.trim();
        if (s.startsWith('{') || s.startsWith('[')) {
            try {
                return componentToText(JSON.parse(s));
            }
            catch {
                return stripCodes(s);
            }
        }
        return stripCodes(s);
    }
    // prismarine-chat ChatMessage genelde toString() destekler
    if (typeof input.toString === 'function' && input.toString !== Object.prototype.toString) {
        const s = input.toString();
        if (s && s !== '[object Object]')
            return stripCodes(s);
    }
    if (Array.isArray(input))
        return input.map(componentToText).join('');
    let out = '';
    if (typeof input.text === 'string')
        out += input.text;
    if (typeof input.translate === 'string' && !out)
        out += input.translate;
    if (Array.isArray(input.extra))
        out += input.extra.map(componentToText).join('');
    if (Array.isArray(input.with))
        out += ' ' + input.with.map(componentToText).join(' ');
    return stripCodes(out.trim());
}
function stripCodes(s) {
    return String(s).replace(/§[0-9a-fk-or]/gi, '').trim();
}
