import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { db } from "@db";
import { messages, channels } from "@db/schema";
import { eq, ilike, and } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  app.get("/api/channels", async (_req, res) => {
    const allChannels = await db.query.channels.findMany();
    res.json(allChannels);
  });

  app.get("/api/channels/:id/messages", async (req, res) => {
    const channelMessages = await db.query.messages.findMany({
      where: eq(messages.channelId, parseInt(req.params.id)),
      with: {
        user: true,
      },
      orderBy: messages.createdAt,
    });
    res.json(channelMessages);
  });

  app.get("/api/messages/search", async (req, res) => {
    const { query } = req.query;
    if (!query || typeof query !== "string") {
      return res.status(400).send("Search query is required");
    }

    const searchResults = await db.query.messages.findMany({
      where: ilike(messages.content, `%${query}%`),
      with: {
        user: true,
        channel: true,
      },
      orderBy: messages.createdAt,
      limit: 20,
    });

    res.json(searchResults);
  });

  const httpServer = createServer(app);

  const wss = new WebSocketServer({ 
    noServer: true,
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const protocol = request.headers['sec-websocket-protocol'];
    if (protocol === 'vite-hmr') {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on("connection", (ws) => {
    console.log("New WebSocket connection established");

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "message") {
          const savedMessage = await db
            .insert(messages)
            .values({
              content: message.content,
              channelId: message.channelId,
              userId: 1, // TODO: Replace with actual user ID from auth
            })
            .returning();

          const fullMessage = await db.query.messages.findFirst({
            where: eq(messages.id, savedMessage[0].id),
            with: {
              user: true,
            },
          });

          if (fullMessage) {
            const broadcastMessage = JSON.stringify({ 
              type: "message", 
              message: fullMessage 
            });

            wss.clients.forEach((client) => {
              if (client.readyState === ws.OPEN) {
                client.send(broadcastMessage);
              }
            });
          }
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });

    ws.on("close", () => {
      console.log("WebSocket connection closed");
    });
  });

  return httpServer;
}