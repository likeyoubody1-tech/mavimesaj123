# Mavi MC Bot — Minecraft Botu + Web Yönetim Paneli

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
- 🛡️ **Otomatik doğrulama (AuthMe vb.)** — `/register şifre şifre` ve `/login şifre` otomatik
- 🧮 **Basit captcha çözme** — matematik (`2 + 5 = ?`) ve kod captcha'ları
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

### Notlar
- Mineflayer varsayılan olarak 1.8 - 1.21 arası sürümleri destekler. "Sürüm" boş bırakılırsa otomatik algılanır.
- **Cracked** modda sunucu `online-mode=false` olmalı. Aksi halde atılırsın.
- `[everyone]` görevleri her oyuncu için varsayılan 400ms gecikmeyle gönderir — sunucu spam filtresine takılma.
- Mesaj limiti 256 karakter; uzun mesajlar otomatik parçalanır.
