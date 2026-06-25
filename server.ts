import { createServer } from "node:http";
import next from "next";
import { Server as IOServer } from "socket.io";
import { setIO } from "./src/lib/realtime";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const io = new IOServer(server, {
    path: "/socket.io",
    // Internal app; allow same-origin + any (reverse proxy terminates TLS).
    cors: { origin: true, credentials: true },
  });

  io.on("connection", (socket) => {
    // Clients join named rooms ("kitchen", "floor") to receive scoped events.
    socket.on("join", (room: unknown) => {
      if (typeof room === "string") socket.join(room);
    });
    socket.on("leave", (room: unknown) => {
      if (typeof room === "string") socket.leave(room);
    });
  });

  // Expose io to server actions / route handlers (see src/lib/realtime.ts).
  setIO(io);

  server.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(
      `> QQ Hotpot BBQ ready at http://${hostname}:${port}  (dev=${dev})`,
    );
  });
});
