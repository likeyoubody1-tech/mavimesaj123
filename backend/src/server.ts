import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "mavi-super-secret-2026";
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(__dirname, "../data/db.json");

// ---- Types ----
interface User {
  id: string;
  username: string;
  passwordHash: string;
  friendCode: string;
  createdAt: string;
}

interface Message {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: string;
}

interface Db {
  users: User[];
  friendships: Record<string, string[]>; // username -> friend usernames[]
  messages: Message[];
}

// ---- DB helpers ----
function loadDb(): Db {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    }
  } catch {}
  const db: Db = { users: [], friendships: {}, messages: [] };
  saveDb(db);
  return db;
}
function saveDb(db: Db) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
let db = loadDb();

function generateFriendCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "MAVI-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  // ensure unique
  if (db.users.some(u => u.friendCode === code)) return generateFriendCode();
  return code;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---- Express ----
const app = express();
app.use(cors());
app.use(express.json());

// serve frontend static if exists
const frontendDist = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// ---- Auth middleware ----
function auth(req: any, res: any, next: any) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Token yok" });
  try {
    const payload: any = jwt.verify(h.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Geçersiz token" });
  }
}

// ---- Routes ----
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) return res.status(400).json({ error: "Kullanıcı adı ve şifre gerekli" });
  const u = username.trim();
  if (u.length < 3 || u.length > 20) return res.status(400).json({ error: "Kullanıcı adı 3-20 karakter olmalı" });
  if (!/^[a-zA-Z0-9_.-]+$/.test(u)) return res.status(400).json({ error: "Yalnızca harf, rakam, _ . - kullanabilirsin" });
  if (password.length < 4) return res.status(400).json({ error: "Şifre en az 4 karakter olmalı" });

  if (db.users.some(x => x.username.toLowerCase() === u.toLowerCase())) {
    return res.status(409).json({ error: "Bu kullanıcı adı alınmış" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const friendCode = generateFriendCode();
  const user: User = { id: generateId(), username: u, passwordHash, friendCode, createdAt: new Date().toISOString() };
  db.users.push(user);
  db.friendships[u] = [];
  saveDb(db);

  const token = jwt.sign({ username: u, id: user.id, friendCode }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: { username: u, friendCode, id: user.id } });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) return res.status(400).json({ error: "Kullanıcı adı ve şifre gerekli" });
  const user = db.users.find(x => x.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: "Kullanıcı bulunamadı" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Şifre hatalı" });
  const token = jwt.sign({ username: user.username, id: user.id, friendCode: user.friendCode }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: { username: user.username, friendCode: user.friendCode, id: user.id } });
});

app.get("/api/auth/me", auth, (req: any, res) => {
  const user = db.users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ error: "Kullanıcı yok" });
  res.json({ username: user.username, friendCode: user.friendCode, id: user.id });
});

app.get("/api/friends", auth, (req: any, res) => {
  const list = db.friendships[req.user.username] || [];
  const friends = list.map((uname: string) => {
    const u = db.users.find(x => x.username === uname);
    return u ? { username: u.username, friendCode: u.friendCode } : null;
  }).filter(Boolean);
  // include online status
  const withStatus = friends.map(f => ({
    ...f,
    online: clients.has((f as any).username)
  }));
  res.json(withStatus);
});

app.post("/api/friends/add", auth, (req: any, res) => {
  const { friendCode } = req.body;
  if (!friendCode) return res.status(400).json({ error: "Arkadaş kodu gerekli" });
  const code = String(friendCode).trim().toUpperCase();
  const target = db.users.find(u => u.friendCode === code);
  if (!target) return res.status(404).json({ error: "Kod bulunamadı" });
  if (target.username === req.user.username) return res.status(400).json({ error: "Kendini ekleyemezsin" });

  const myFriends = db.friendships[req.user.username] || [];
  if (myFriends.includes(target.username)) return res.status(409).json({ error: "Zaten arkadaşsınız" });

  myFriends.push(target.username);
  db.friendships[req.user.username] = myFriends;

  // karşılıklı ekle
  const theirFriends = db.friendships[target.username] || [];
  if (!theirFriends.includes(req.user.username)) {
    theirFriends.push(req.user.username);
    db.friendships[target.username] = theirFriends;
  }
  saveDb(db);

  // notify both if online
  notifyUser(target.username, { type: "friend:added", payload: { username: req.user.username, friendCode: db.users.find(u=>u.username===req.user.username)!.friendCode } });
  notifyUser(req.user.username, { type: "friend:added", payload: { username: target.username, friendCode: target.friendCode } });

  res.json({ ok: true, friend: { username: target.username, friendCode: target.friendCode } });
});

app.get("/api/messages/:friend", auth, (req: any, res) => {
  const friend = req.params.friend;
  const me = req.user.username;
  if (!db.friendships[me]?.includes(friend)) return res.status(403).json({ error: "Arkadaş değilsiniz" });
  const msgs = db.messages.filter(m => (m.from === me && m.to === friend) || (m.from === friend && m.to === me))
    .sort((a,b)=> new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-200);
  res.json(msgs);
});

// fallback to index.html for SPA
app.get("*", (req, res) => {
  const indexPath = path.join(frontendDist, "index.html");
  if (fs.existsSync(indexPath) && !req.path.startsWith("/api")) {
    res.sendFile(indexPath);
  } else if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "Not found" });
  } else {
    res.send("Frontend henüz build edilmedi. `npm run build --workspace=frontend` çalıştırın.");
  }
});

// ---- WebSocket ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const clients = new Map<string, WebSocket>(); // username -> ws

function notifyUser(username: string, data: any) {
  const ws = clients.get(username);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  if (!token) { ws.close(4001, "token yok"); return; }
  let payload: any;
  try { payload = jwt.verify(token, JWT_SECRET); } catch { ws.close(4002, "invalid token"); return; }
  const username: string = payload.username;
  // eğer zaten bağlıysa eskisini kapat
  const old = clients.get(username);
  if (old) try { old.close(); } catch {}
  clients.set(username, ws);
  console.log(`WS bağlandı: ${username} (${clients.size} online)`);
  // herkese presence yay
  broadcast({ type: "presence", payload: { username, online: true } });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // msg {type, to, payload}
      if (msg.type === "chat:message") {
        const to = msg.to as string;
        const text = String(msg.payload?.text || "").trim();
        if (!to || !text) return;
        if (!db.friendships[username]?.includes(to)) return; // sadece arkadaşlara
        const message: Message = { id: generateId(), from: username, to, text: text.slice(0, 2000), timestamp: new Date().toISOString() };
        db.messages.push(message);
        // 5000 mesajdan fazlasını temizle (basit)
        if (db.messages.length > 5000) db.messages = db.messages.slice(-5000);
        saveDb(db);
        const out = { type: "chat:message", payload: message };
        notifyUser(to, out);
        notifyUser(username, out); // echo for multi-device sync
      } else if (msg.type?.startsWith("call:")) {
        const to = msg.to as string;
        if (!to || !db.friendships[username]?.includes(to)) return;
        // sadece sinyal ilet
        const forward = { type: msg.type, from: username, payload: msg.payload };
        notifyUser(to, forward);
        // offer için caller'a da log gerekmez
      } else if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    } catch (e) {
      console.error("WS message error", e);
    }
  });

  ws.on("close", () => {
    if (clients.get(username) === ws) {
      clients.delete(username);
      broadcast({ type: "presence", payload: { username, online: false } });
      console.log(`WS ayrıldı: ${username}`);
    }
  });
});

function broadcast(data: any) {
  const s = JSON.stringify(data);
  for (const ws of clients.values()) if (ws.readyState === WebSocket.OPEN) ws.send(s);
}

server.listen(PORT, () => {
  console.log(`MAVI MESAJ Backend calisiyor: http://localhost:${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health`);
  console.log(`   WS : ws://localhost:${PORT}/ws`);
  if (fs.existsSync(frontendDist)) console.log(`   Frontend dist bulundu, ayni porttan servis ediliyor`);
  else console.log(`   Frontend dist yok - once frontend build edin: npm run build --workspace=frontend`);
});
