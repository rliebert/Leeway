import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { db } from "@db";
import { messages, channels } from "@db/schema";
import { eq } from "drizzle-orm";

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

  const httpServer = createServer(app);

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    ws.on("message", async (data) => {
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

        wss.clients.forEach((client) => {
          client.send(JSON.stringify({ type: "message", message: fullMessage }));
        });
      }
    });
  });

  return httpServer;
}
