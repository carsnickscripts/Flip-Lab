// Flip Lab relay: one Durable Object per room code, WebSocket fan-out.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Flip Lab relay is running.');
    const room = (url.searchParams.get('room') || 'lobby').slice(0, 40);
    return env.ROOM.get(env.ROOM.idFromName(room)).fetch(req);
  }
};

export class Room {
  constructor() { this.peers = new Map(); this.timer = null; }
  fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const id = crypto.randomUUID().slice(0, 8);
    this.peers.set(id, { ws: server, presence: {} });
    server.send(JSON.stringify({ t: 'hi', id }));
    this.schedule();
    server.addEventListener('message', (e) => {
      if (typeof e.data !== 'string' || e.data.length > 4000) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      const me = this.peers.get(id); if (!me) return;
      if (m.t === 'pres' && m.p && typeof m.p === 'object') { Object.assign(me.presence, m.p); this.schedule(); }
      else if (m.t === 'ev') {
        const out = JSON.stringify({ t: 'ev', k: String(m.k).slice(0, 12), d: m.d, from: id });
        for (const [pid, p] of this.peers) if (pid !== id) { try { p.ws.send(out); } catch {} }
      }
    });
    const bye = () => { this.peers.delete(id); this.schedule(); };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);
    return new Response(null, { status: 101, webSocket: client });
  }
  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const list = [...this.peers].map(([peer, p]) => ({ peer, presence: p.presence }));
      const out = JSON.stringify({ t: 'peers', list });
      for (const p of this.peers.values()) { try { p.ws.send(out); } catch {} }
    }, 50);
  }
}
