"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type PadMessage =
  | { kind: "image"; dataUrl: string }
  | { kind: "formula"; latex: string }
  | { kind: "pad-status"; count: number }
  | { kind: "offline-notice"; count: number };

/** 连接 pad-ws 房间，断线自动重连（指数退避） */
export function usePadChannel(
  docId: string,
  role: "editor" | "pad",
  onMessage: (msg: PadMessage) => void,
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;

    function connect() {
      if (closed) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/pad-ws?doc=${encodeURIComponent(docId)}&role=${role}`);
      wsRef.current = ws;
      ws.onopen = () => { retry = 0; setConnected(true); };
      ws.onmessage = (e) => {
        try { onMessageRef.current(JSON.parse(e.data)); } catch { /* 忽略坏消息 */ }
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!closed) {
          retry = Math.min(retry + 1, 5);
          timer = setTimeout(connect, 500 * 2 ** retry);
        }
      };
    }
    connect();
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close(); };
  }, [docId, role]);

  const send = useCallback((msg: object): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; }
    return false;
  }, []);

  return { connected, send };
}
