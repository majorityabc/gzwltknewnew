// iPad 协同讲义编辑器 - WebSocket 中继服务
// 房间按讲义 docId 隔离；role=editor（电脑）| pad（iPad）
// 鉴权：admin_token cookie（jose HS256，JWT_SECRET 读自 gzwljy/.env.local）
import { WebSocketServer } from "ws";
import { SignJWT, jwtVerify } from "jose";
import fs from "node:fs";

const PORT = 3003;
const secret = (() => {
  const env = fs.readFileSync("/root/gzwljy/.env.local", "utf-8");
  const m = env.match(/^JWT_SECRET="?([^"\r\n]+)"?/m);
  if (!m) throw new Error("JWT_SECRET not found");
  return new TextEncoder().encode(m[1]);
})();

const rooms = new Map(); // docId -> { editors:Set<ws>, pads:Set<ws>, queue:object[] }

function getRoom(docId) {
  if (!rooms.has(docId)) rooms.set(docId, { editors: new Set(), pads: new Set(), queue: [] });
  return rooms.get(docId);
}

function padStatus(room) {
  return JSON.stringify({ kind: "pad-status", count: room.pads.size });
}

function broadcast(room, targets, msg) {
  for (const ws of targets) if (ws.readyState === 1) ws.send(msg);
}

const wss = new WebSocketServer({ port: PORT, path: "/pad-ws" });
console.log(`[pad-ws] listening on :${PORT}`);

wss.on("connection", async (ws, req) => {
  // 鉴权
  try {
    const cookie = req.headers.cookie || "";
    const token = cookie.match(/admin_token=([^;]+)/)?.[1];
    if (!token) throw new Error("no token");
    const { payload } = await jwtVerify(token, secret);
    if (payload.role !== "admin") throw new Error("not admin");
  } catch (e) {
    ws.close(4001, "unauthorized");
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const docId = url.searchParams.get("doc") || "";
  const role = url.searchParams.get("role") === "pad" ? "pad" : "editor";
  if (!docId) { ws.close(4000, "missing doc"); return; }

  const room = getRoom(docId);
  (role === "pad" ? room.pads : room.editors).add(ws);
  console.log(`[pad-ws] ${role} joined doc=${docId} (editors=${room.editors.size} pads=${room.pads.size})`);

  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  // 新成员加入后同步状态 + 补投离线队列
  broadcast(room, room.editors, padStatus(room));
  if (role === "editor" && room.queue.length) {
    // 只补投 30 分钟内的，过期的丢弃
    const fresh = room.queue.filter((m) => Date.now() - (m._qAt || 0) < 30 * 60 * 1000);
    if (fresh.length) {
      ws.send(JSON.stringify({ kind: "offline-notice", count: fresh.length }));
      for (const msg of fresh) { const { _qAt, ...clean } = msg; ws.send(JSON.stringify(clean)); }
    }
    room.queue = [];
  }

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.kind === "image" || msg.kind === "formula") {
      if (role !== "pad") return; // 只有 pad 能产出内容
      const out = JSON.stringify(msg);
      if (room.editors.size) broadcast(room, room.editors, out);
      else if (room.queue.length < 50) room.queue.push({ ...msg, _qAt: Date.now() });
    }
  });

  ws.on("close", () => {
    (role === "pad" ? room.pads : room.editors).delete(ws);
    broadcast(room, room.editors, padStatus(room));
    if (!room.editors.size && !room.pads.size && !room.queue.length) rooms.delete(docId);
  });
});

// 心跳保活
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
