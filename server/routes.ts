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

  // Register DM routes with authentication
  app.use("/api/dm", requireAuth, dmRoutes);

  // Register upload routes
  registerUploadRoutes(app);

  // Health check endpoint
  app.get("/api/health", async (_req, res) => {
    try {
      await db.query.users.findMany({ limit: 1 });
      res.json({ status: "healthy" });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({ 
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Channel management endpoints
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

  app.post("/api/channels", requireAuth, async (req, res) => {
    const { name, description, section_id } = req.body;
    try {
      const [newChannel] = await db.insert(channels).values({
        name,
        description,
        section_id,
        creator_id: (req.user as User).id,
        order_index: 0, // Default order index
      }).returning();
      res.status(201).json(newChannel);
    } catch (error) {
      console.error('Failed to create channel:', error);
      res.status(500).json({ error: "Failed to create channel" });
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
        },
        limit: 50,
        orderBy: [desc(messages.created_at)],
      });
      res.json(channelMessages);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Section management endpoints
  app.get("/api/sections", requireAuth, async (_req, res) => {
    try {
      const result = await db.query.sections.findMany({
        orderBy: [asc(sections.order_index)],
      });
      res.json(result);
    } catch (error) {
      console.error('Failed to fetch sections:', error);
      res.status(500).json({ error: "Failed to fetch sections" });
    }
  });

  const httpServer = createServer(app);

  // Set up WebSocket server
  setupWebSocketServer(httpServer);

  return httpServer;
}