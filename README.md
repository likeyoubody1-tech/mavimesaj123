# Mavi Bot — Minecraft Botu + Web Yönetim Paneli

Tarayıcıdan yönettiğin bir Minecraft botu. **Mineflayer** + **Express** +
**Vite/TypeScript** ile yazılmış. Mavi gradient temalı ultra hızlı panel.

### Özellikler

- 🌐 **Herhangi bir sunucuya bağlan** — IP (veya `host:port`), port, kullanıcı adı, sürüm (boş = otomatik)
- 🔑 **Offline (cracked) ve Premium (Microsoft)** modu
- 💬 **Gerçek zamanlı sohbet** — tüm sunucu mesajları, whisper'lar, sistem mesajları
- ⏱️ **Zamanlı görevler (cron)** — "her N saniyede bir X komutunu çalıştır"
  - `[everyone]` → tab sırasıyla her oyuncuya tek tek gönderir (örn. `/msg [everyone] merhaba`)
  - `[random]` → rastgele oyuncu
  - `[count]` → çevrimiçi oyuncu sayısı
  - Her görev ayrı ayrı aç/kapat, düzenle, sil, "şimdi çalıştır"
- 🛡️ **Anti-bot geçişi** — ilk bağlantıyı kesen korumalar için hızlı yeniden bağlanma, insansı hareket, resource pack otomatik kabul, tabela (sign) captcha'sı doldurma
- 🔑 **Otomatik doğrulama (AuthMe vb.)** — `/register şifre şifre` ve `/login şifre` otomatik
- 🧮 **Çok biçimli captcha çözme** — matematik, "type/yaz KOD", "kod: X" kalıpları; sohbet + **title + boss bar + scoreboard**'dan okur
- ♻️ **Otomatik respawn**, **otomatik yeniden bağlanma**, **Anti-AFK**
- 👥 **Çevrimiçi oyuncular** paneli (tab sırası ile, tıkla-kopyala)
- 📊 **Durum paneli** — can, açlık, konum, dünya, sürüm, bağlı kalma süresi
- 🎮 **Hızlı aksiyonlar** — zıpla, sprint, sneak, respawn, eşyaları at, hareket kontrolleri

### Çalıştırma

**1) Kurulum (bir kez)**
```bash
npm install
```

**2) Üretim (tek port, hızlı)**
```bash
npm run build
npm start
# -> http://localhost:3000
```

**3) Geliştirme (hot reload)**
```bash
npm run dev
# backend  -> http://localhost:3000
# frontend -> http://localhost:5173
```

**Windows:** `BASLAT.bat` dosyasına çift tıkla — otomatik build + açılış.

### Hızlı Başlangıç

1. Paneli aç, "Bağlantı" kartına IP ve kullanıcı adını yaz
2. Sunucu şifre istiyorsa "Şifre" alanını doldur ve "Otomatik /register ve /login" işaretli olsun
3. **Sunucuya Bağlan** butonuna tıkla
4. Sohbet görününce istediğini yazabilirsin
5. "Zamanlı Görevler" kartından otomatik komut ekle, örnekler:
   - `/msg [everyone] merhaba :)` · 10 saniye → tab sırası ile herkese özelden mesaj
   - `naber çocuklar` · 30 saniye → sohbete yaz
   - `/tpa [random]` · 60 saniye → rastgele birine tp isteği

### API

- `POST /api/connect` `{host, port, username, version, auth, authPassword, autoAuth, autoRespawn, autoReconnect, antiAfk}`
- `POST /api/disconnect`
- `POST /api/chat` `{message}` — sohbete gönder veya /komut çalıştır
- `POST /api/action` `{action, params}` — jump, forward, sprint, sneak, left, right, back, respawn, dropAll, stopAll, lookAt
- `GET  /api/state` — durum + oyuncular + görevler + son 500 satır sohbet
- `GET  /api/tasks` · `POST /api/tasks` · `PUT /api/tasks/:id` · `DELETE /api/tasks/:id` · `POST /api/tasks/:id/run`

### Dosya Yapısı
```
mavimesaj123/
  backend/src/
    server.ts       # Express + WS + REST API
    bot.ts          # Mineflayer wrapper, chat/durum/auto-auth
    scheduler.ts    # Zamanlı görev motoru
  frontend/
    index.html
    src/
      main.ts       # Panel UI + state + WS
      style.css     # Mavi tema
```

### Sorun Giderme (sunucuya giremiyorsan)

Panel bağlanamazsa sohbetin üstünde **kırmızı bir uyarı kutusu** çıkar ve sebebini Türkçe yazar. En sık sebepler:

| Belirti | Sebep / Çözüm |
|---|---|
| `ECONNREFUSED` | IP veya port yanlış, ya da sunucu kapalı. Çoğu sunucu portu **25565**. |
| `ENOTFOUND` | Sunucu adresi hatalı yazılmış. |
| `ETIMEDOUT` / 30sn zaman aşımı | Sunucuya ulaşılamıyor ya da seni engelliyor. |
| `ECONNRESET` / `EPIPE` / hemen kopuyor | **Anti-bot koruması** ya da **sürüm uyumsuzluğu**. Sürüm alanına sunucunun **tam sürümünü** yaz (örn. `1.20.4`). |
| "premium account" uyarısı | Sunucu premium hesap istiyor. Mod'u **Premium** yapıp Microsoft hesabıyla gir, ya da cracked sunucu kullan. |
| "whitelist" uyarısı | Bot adı beyaz listeye eklenmeli. |

İpuçları:
- **Sürüm** alanını önce **boş** bırak (otomatik algılar). Olmazsa sunucunun tam sürümünü yaz.
- **Cracked** modda sunucu `online-mode=false` olmalı; değilse "premium" uyarısı alırsın.
- Node.js **20 veya 22 LTS** en stabil çalışır. Çok yeni Node sürümlerinde sorun olursa LTS'e geç.

### Anti-bot korumasını geçememe

**"Anti-bot geçişi"** seçeneği açıkken bot şunları otomatik yapar:
- Sunucu ilk bağlantıyı keserse (çoğu Türk sunucu böyle yapar) **4 saniyede bir, 60 denemeye kadar** hızlıca tekrar bağlanır — genelde 1-3 denemede geçer.
- Spawn olunca insansı hareket eder (bakınma, adım, zıplama) → hareket kontrolünü geçer.
- Captcha'yı **sohbet, title, boss bar ve scoreboard**'dan okuyup cevaplar (matematik / kod).
- Resource pack isteğini otomatik kabul eder.
- Tabela (sign) captcha'sı açılırsa son gördüğü kodu tabelaya yazar.

Yine de geçemiyorsan: sohbet kutusuna düşen doğrulama mesajının **tam metnini** bana ilet; captcha o sunucuya özel bir biçimde olabilir, ona göre kalıp eklerim.

### Notlar
- Mineflayer 1.8 - 1.21+ arası sürümleri destekler. "Sürüm" boş = otomatik algılama.
- `[everyone]` görevleri her oyuncu için varsayılan 400ms gecikmeyle gönderir — spam filtresine takılma.
- Mesaj limiti 256 karakter; uzun mesajlar otomatik parçalanır.
- Bağlantı koparsa (ve "otomatik yeniden bağlan" açıksa) 10 saniyede bir tekrar denenir.
