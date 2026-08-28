# Mavi Mesaj — Mavi Tabanlı Hızlı Mesajlaşma & Arama

Mavi gradient temalı, **TypeScript + Express + Vite** ile yazılmış hızlı mesajlaşma sitesi.

### Özellikler
- 🔐 **Kullanıcı adı + şifre** ile hesap açma / giriş (JWT)
- 🆔 **Arkadaş kodu** otomatik oluşturulur `MAVI-XXXXXX` — kodla arkadaş ekleme (karşılıklı)
- 💬 **Gerçek zamanlı mesajlaşma** (WebSocket)
- 🎙️ **Sesli arama** butonu + 📹 **Görüntülü arama** butonu (WebRTC P2P, STUN)
- 🔍 **Arama** (arkadaş listesinde filtre)
- ⚡ **Ultra hızlı açılış**: Vite build, tek CSS/JS, gzip ~5kB, backend statik servis, sistem fontları

### Teknoloji
- **Backend** `backend/src/server.ts` — Node 20, Express 4, TypeScript, `ws`, `jsonwebtoken`, `bcryptjs`, JSON dosya DB (`backend/data/db.json`)
- **Frontend** `frontend/src/main.ts` — Vite 5, TypeScript, Vanilla (framework yok = hızlı), WebSocket + WebRTC
- Tek portta çalışır: backend hem API hem frontend'i servis eder

### Kurulum & Çalıştırma

**1) Geliştirme (ayrı portlar, hot-reload + proxy)**
```powershell
npm install
npm run dev
# backend -> http://localhost:3000
# frontend -> http://localhost:5173  ( /api ve /ws otomatik proxy -> 3000 )
```

**2) Üretim (tek port, hızlı)**
```powershell
npm run build --workspace=frontend
npm run build --workspace=backend
npm start --workspace=backend
# -> http://localhost:3000  (frontend + backend aynı)
```

**Veya kökten:**
```powershell
npm run build
npm start
```

**Windows çift tık:**
`BASLAT.bat` dosyasına çift tıkla — otomatik build + başlatır.

### API
- `POST /api/auth/register` `{username,password}` -> `{token, user:{username,friendCode}}`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer)
- `GET /api/friends` / `POST /api/friends/add` `{friendCode}`
- `GET /api/messages/:friend`
- `WS /ws?token=...` -> `chat:message`, `call:offer`, `call:answer`, `call:ice-candidate`, `call:end`

### Dosya Yapısı
```
mesaj site/
  backend/src/server.ts   # Express + WS + JWT
  backend/data/db.json    # basit JSON DB
  frontend/src/main.ts    # tüm UI + WS + WebRTC
  frontend/src/style.css  # mavi tema
  frontend/dist/          # build çıktısı (backend tarafından servis edilir)
```

### Notlar
- DB sıfırlamak için `backend/data/db.json` içini `{"users":[],"friendships":{},"messages":[]}` yap.
- WebRTC için HTTPS veya localhost gerekir (tarayıcı izni).
- Varsayılan JWT secret `.env` ile değiştirilebilir: `JWT_SECRET=... PORT=3000`
