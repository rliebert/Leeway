import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { messages, channels, users, sections } from "@db/schema";
import { eq, and, or, desc, asc, ilike } from "drizzle-orm";
import { setupAuth } from "./auth";
import { setupWebSocketServer } from "./websocket";
import dmRoutes from "./routes/dm";
import { registerUploadRoutes } from "./routes/upload";
import type { User, Message, Channel, Section } from "@db/schema";

// Authentication middleware
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Not authenticated");
  }
  next();
};

export function registerRoutes(app: Express): Server {
  // Set up authentication routes and middleware first
  setupAuth(app);
  app.use("/api/dm", requireAuth, dmRoutes);
  registerUploadRoutes(app);

  // Section management endpoints
  app.post("/api/sections", requireAuth, async (req, res) => {
    const { name, order_index } = req.body;
    try {
      const [section] = await db.insert(sections).values({
        name,
        order_index: order_index || 0,
        creator_id: (req.user as User).id,
      }).returning();
      res.status(201).json(section);
    } catch (error) {
      console.error('Failed to create section:', error);
      res.status(500).json({ error: "Failed to create section" });
    }
  });

  app.get("/api/sections", requireAuth, async (_req, res) => {
    try {
      const result = await db.query.sections.findMany({
        orderBy: [asc(sections.order_index)],
        with: {
          channels: {
            orderBy: [asc(channels.order_index)],
          },
        },
      });
      res.json(result);
    } catch (error) {
      console.error('Failed to fetch sections:', error);
      res.status(500).json({ error: "Failed to fetch sections" });
    }
  });

  // Channel management endpoints
  app.post("/api/channels", requireAuth, async (req, res) => {
    const { name, description, section_id } = req.body;
    try {
      const [newChannel] = await db.insert(channels).values({
        name,
        description,
        section_id,
        creator_id: (req.user as User).id,
        order_index: 0,
      }).returning();
      res.status(201).json(newChannel);
    } catch (error) {
      console.error('Failed to create channel:', error);
      res.status(500).json({ error: "Failed to create channel" });
    }
  });

  app.get("/api/channels", requireAuth, async (_req, res) => {
    try {
      const result = await db.query.channels.findMany({
        with: {
          section: true,
          creator: true,
        },
        orderBy: [asc(channels.order_index)]
      });
      res.json(result);
    } catch (error) {
      console.error('Failed to fetch channels:', error);
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  // Message endpoints
  app.get("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    const { channelId } = req.params;
    const { before } = req.query;
    try {
      const channelMessages = await db.query.messages.findMany({
        where: before ? and(
          eq(messages.channel_id, channelId),
          desc(messages.created_at)
        ) : eq(messages.channel_id, channelId),
        with: {
          author: true,
          attachments: true,
        },
        orderBy: [desc(messages.created_at)],
        limit: 50,
      });
      res.json(channelMessages);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Message search endpoint
  app.get("/api/messages/search", requireAuth, async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: "Search query required" });
    }

    try {
      const searchResults = await db.query.messages.findMany({
        where: ilike(messages.content, `%${q}%`),
        with: {
          author: true,
          channel: true,
        },
        limit: 20,
        orderBy: [desc(messages.created_at)],
      });
      res.json(searchResults);
    } catch (error) {
      console.error('Failed to search messages:', error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  });

  // Thread-related endpoints
  app.get("/api/messages/:messageId/replies", requireAuth, async (req, res) => {
    const { messageId } = req.params;
    try {
      const replies = await db.query.messages.findMany({
        where: eq(messages.parent_id, messageId),
        with: {
          author: true,
          attachments: true,
        },
        orderBy: [asc(messages.created_at)],
      });
      res.json(replies);
    } catch (error) {
      console.error('Failed to fetch replies:', error);
      res.status(500).json({ error: "Failed to fetch replies" });
    }
  });

  const httpServer = createServer(app);

  // Set up WebSocket server
  setupWebSocketServer(httpServer);

  return httpServer;
}
