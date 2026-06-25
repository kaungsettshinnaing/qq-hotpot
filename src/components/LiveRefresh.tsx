"use client";

import { useRoomRefresh } from "@/lib/socket-client";
import AutoRefresh from "./AutoRefresh";

/**
 * Keeps a server-rendered screen fresh via two channels:
 *  - Socket.IO room events (instant), and
 *  - a periodic poll (fallback if sockets are unavailable).
 */
export default function LiveRefresh({
  room,
  events,
  seconds = 10,
}: {
  room: string;
  events: string[];
  seconds?: number;
}) {
  useRoomRefresh(room, events);
  return <AutoRefresh seconds={seconds} />;
}
