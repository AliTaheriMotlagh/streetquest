// Custom server: Next.js pages/API + Socket.IO realtime on the same port.
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { attachRealtime } from "./src/server/realtime";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();
const httpServer = createServer((req, res) => handle(req, res));
const io = new Server(httpServer, { path: "/rt" });
attachRealtime(io);

httpServer.listen(port, () => console.log(`> StreetQuest ready on http://localhost:${port}`));
