import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { MCBot, BotConfig } from './bot.js';
import { Scheduler } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const clients = new Set<WebSocket>();

function broadcast(event: string, data: any) {
  const msg = JSON.stringify({ event, data });
  for (const c of clients) {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch {}
    }
  }
}

const bot = new MCBot();
bot.on('status', s => broadcast('status', s));
bot.on('chat', m => broadcast('chat', m));
bot.on('players', p => broadcast('players', p));

const scheduler = new Scheduler(bot, () => broadcast('tasks', scheduler.list()));

function parseHost(input: string): { host: string; port: number } {
  const raw = String(input || '').trim();
  const m = raw.match(/^([^:\s]+)(?::(\d{1,5}))?$/);
  if (!m) return { host: raw, port: 25565 };
  return { host: m[1], port: m[2] ? Number(m[2]) : 25565 };
}

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/state', (_req, res) => {
  res.json({
    status: bot.getStatus(),
    players: bot.getPlayers(),
    tasks: scheduler.list(),
    history: bot.getHistory(),
  });
});

app.post('/api/connect', (req, res) => {
  const body = req.body || {};
  const { host, port } = parseHost(body.host);
  if (!host) return res.status(400).json({ error: 'host boş' });
  const cfg: BotConfig = {
    host,
    port: body.port ? Number(body.port) : port,
    username: String(body.username || 'MaviBot').trim().slice(0, 16) || 'MaviBot',
    version: body.version && String(body.version).trim() ? String(body.version).trim() : false,
    auth: body.auth === 'microsoft' ? 'microsoft' : 'offline',
    authPassword: String(body.authPassword || ''),
    autoAuth: !!body.autoAuth,
    autoRespawn: body.autoRespawn !== false,
    autoReconnect: !!body.autoReconnect,
    antiAfk: !!body.antiAfk,
    antiBot: !!body.antiBot,
    joinCommands: String(body.joinCommands || '').slice(0, 2000),
  };
  bot.connect(cfg);
  res.json({ ok: true });
});

app.post('/api/disconnect', (_req, res) => {
  bot.disconnect();
  res.json({ ok: true });
});

app.post('/api/chat', (req, res) => {
  const message = String(req.body?.message || '');
  if (!message) return res.status(400).json({ error: 'message boş' });
  bot.chat(message);
  res.json({ ok: true });
});

app.post('/api/action', (req, res) => {
  const name = String(req.body?.action || '');
  bot.action(name, req.body?.params || {});
  res.json({ ok: true });
});

app.get('/api/tasks', (_req, res) => res.json(scheduler.list()));
app.post('/api/tasks', (req, res) => res.json(scheduler.add(req.body || {})));
app.put('/api/tasks/:id', (req, res) => {
  const t = scheduler.update(req.params.id, req.body || {});
  if (!t) return res.status(404).json({ error: 'görev yok' });
  res.json(t);
});
app.delete('/api/tasks/:id', (req, res) => {
  const ok = scheduler.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'görev yok' });
  res.json({ ok: true });
});
app.post('/api/tasks/:id/run', (req, res) => {
  const ok = scheduler.runNow(req.params.id);
  if (!ok) return res.status(404).json({ error: 'görev yok' });
  res.json({ ok: true });
});

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get(/^(?!\/api\/|\/ws).*/, (_req, res, next) => {
  res.sendFile(path.join(frontendDist, 'index.html'), err => err && next());
});

wss.on('connection', (ws) => {
  clients.add(ws);
  try {
    ws.send(JSON.stringify({
      event: 'init',
      data: {
        status: bot.getStatus(),
        players: bot.getPlayers(),
        tasks: scheduler.list(),
        history: bot.getHistory(),
      },
    }));
  } catch {}
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

httpServer.listen(PORT, () => {
  console.log(`[Mavi Bot] Panel: http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  bot.disconnect(true);
  scheduler.stopAll();
  process.exit(0);
});
