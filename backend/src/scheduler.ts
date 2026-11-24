import crypto from 'crypto';
import { MCBot } from './bot.js';

export interface Task {
  id: string;
  name: string;
  template: string;
  intervalSeconds: number;
  enabled: boolean;
  perPlayerDelayMs: number;
  lastRun?: number;
  runCount: number;
}

type ChangeFn = () => void;

export class Scheduler {
  private tasks: Task[] = [];
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(private bot: MCBot, private onChange: ChangeFn) {}

  list(): Task[] {
    return this.tasks.map(t => ({ ...t }));
  }

  add(partial: any): Task {
    const t: Task = {
      id: crypto.randomUUID(),
      name: String(partial.name || 'Görev').slice(0, 40) || 'Görev',
      template: String(partial.template || 'merhaba').slice(0, 256),
      intervalSeconds: Math.max(1, Math.floor(Number(partial.intervalSeconds) || 10)),
      enabled: partial.enabled !== false,
      perPlayerDelayMs: Math.max(100, Math.floor(Number(partial.perPlayerDelayMs) || 400)),
      runCount: 0,
    };
    this.tasks.push(t);
    this.restart(t);
    this.onChange();
    return { ...t };
  }

  update(id: string, patch: any): Task | null {
    const t = this.tasks.find(x => x.id === id);
    if (!t) return null;
    if (patch.name !== undefined) t.name = String(patch.name).slice(0, 40) || t.name;
    if (patch.template !== undefined) t.template = String(patch.template).slice(0, 256);
    if (patch.intervalSeconds !== undefined) t.intervalSeconds = Math.max(1, Math.floor(Number(patch.intervalSeconds)));
    if (patch.perPlayerDelayMs !== undefined) t.perPlayerDelayMs = Math.max(100, Math.floor(Number(patch.perPlayerDelayMs)));
    if (patch.enabled !== undefined) t.enabled = !!patch.enabled;
    this.restart(t);
    this.onChange();
    return { ...t };
  }

  remove(id: string): boolean {
    const idx = this.tasks.findIndex(x => x.id === id);
    if (idx < 0) return false;
    this.stop(id);
    this.tasks.splice(idx, 1);
    this.onChange();
    return true;
  }

  runNow(id: string): boolean {
    const t = this.tasks.find(x => x.id === id);
    if (!t) return false;
    this.execute(t);
    return true;
  }

  stopAll() {
    for (const h of this.timers.values()) clearInterval(h);
    this.timers.clear();
  }

  private stop(id: string) {
    const h = this.timers.get(id);
    if (h) { clearInterval(h); this.timers.delete(id); }
  }

  private restart(t: Task) {
    this.stop(t.id);
    if (!t.enabled) return;
    const handle = setInterval(() => this.execute(t), t.intervalSeconds * 1000);
    this.timers.set(t.id, handle);
  }

  private execute(t: Task) {
    if (!this.bot.isConnected()) return;
    const self = this.bot.getStatus().username;
    const template = t.template;

    const sendOne = (msg: string) => {
      if (!msg) return;
      this.bot.chat(msg);
    };

    if (template.includes('[everyone]') || template.includes('[herkes]')) {
      const players = this.bot.getPlayers().filter(p => p && p !== self);
      if (!players.length) return;
      players.forEach((p, i) => {
        setTimeout(() => {
          const msg = template
            .replace(/\[everyone\]/g, p)
            .replace(/\[herkes\]/g, p)
            .replace(/\[random\]/g, pickRandom(players))
            .replace(/\[count\]/g, String(players.length));
          sendOne(msg);
        }, i * t.perPlayerDelayMs);
      });
    } else if (template.includes('[random]')) {
      const players = this.bot.getPlayers().filter(p => p && p !== self);
      const r = pickRandom(players);
      if (!r) return;
      sendOne(template.replace(/\[random\]/g, r).replace(/\[count\]/g, String(players.length)));
    } else {
      sendOne(template.replace(/\[count\]/g, String(this.bot.getPlayers().length)));
    }

    t.lastRun = Date.now();
    t.runCount++;
    this.onChange();
  }
}

function pickRandom<T>(arr: T[]): T | '' {
  if (!arr.length) return '' as any;
  return arr[Math.floor(Math.random() * arr.length)];
}
