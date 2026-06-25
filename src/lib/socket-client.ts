"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

/**
 * Join a realtime room and refresh server components whenever any of the given
 * events fire. Polling elsewhere acts as a fallback, so this is best-effort.
 */
export function useRoomRefresh(room: string, events: string[]): void {
  const router = useRouter();
  const key = events.join(",");
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit("join", room);
    const refresh = () => router.refresh();

    s.on("connect", join);
    if (s.connected) join();
    for (const e of events) s.on(e, refresh);

    return () => {
      for (const e of events) s.off(e, refresh);
      s.off("connect", join);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, key, router]);
}
