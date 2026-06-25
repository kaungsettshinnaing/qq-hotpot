import type { Server as IOServer } from "socket.io";

/**
 * The Socket.IO server is created in the custom server (server.ts) and stored
 * on globalThis so that server actions / route handlers running in the same
 * Node process can emit events. Emitting is always best-effort — clients also
 * poll as a fallback, so a missing io instance never breaks correctness.
 */
const g = globalThis as unknown as { __qq_io?: IOServer };

export const ROOM_KITCHEN = "kitchen";
export const ROOM_FLOOR = "floor";

export function setIO(io: IOServer): void {
  g.__qq_io = io;
}

export function getIO(): IOServer | undefined {
  return g.__qq_io;
}

export function emitKitchen(event: string, payload: unknown): void {
  try {
    g.__qq_io?.to(ROOM_KITCHEN).emit(event, payload);
  } catch {
    /* best-effort */
  }
}

export function emitFloor(event: string, payload: unknown): void {
  try {
    g.__qq_io?.to(ROOM_FLOOR).emit(event, payload);
  } catch {
    /* best-effort */
  }
}
