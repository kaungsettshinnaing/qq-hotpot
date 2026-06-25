"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useRoomRefresh } from "@/lib/socket-client";

interface Notif {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotifBell({
  initialNotifs,
  markReadAction,
}: {
  initialNotifs: Notif[];
  markReadAction: (id: string) => Promise<void>;
}) {
  const [notifs, setNotifs] = useState<Notif[]>(initialNotifs);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Refresh notifications when hr room events arrive
  useRoomRefresh("hr", ["attendance:update", "leave:request", "break:out", "break:in"]);

  // Sync with server-refreshed props
  useEffect(() => {
    setNotifs(initialNotifs);
  }, [initialNotifs]);

  const unread = notifs.filter((n) => !n.isRead).length;

  const handleOpen = () => setOpen((v) => !v);

  const handleMarkRead = (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    startTransition(() => markReadAction(id));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative rounded-lg bg-white/15 p-1.5 hover:bg-white/25"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-bold text-gray-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="font-semibold text-gray-800">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => notifs.filter((n) => !n.isRead).forEach((n) => handleMarkRead(n.id))}
                className="text-xs text-brand hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-500">No notifications</p>
            ) : (
              notifs.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleMarkRead(n.id)}
                  className={
                    "cursor-pointer border-b px-4 py-3 text-sm last:border-b-0 hover:bg-gray-50 " +
                    (n.isRead ? "text-gray-500" : "font-medium text-gray-900")
                  }
                >
                  {!n.isRead && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand align-middle" />}
                  {n.message}
                  <div className="mt-0.5 text-xs text-gray-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
