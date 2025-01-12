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
      res.status(500).json({ 
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Channel management endpoints
  app.get("/api/channels", requireAuth, async (req, res) => {
    try {
      const channels = await db.query.channels.findMany({
        with: {
          section: true,
          creator: true,
        },
        orderBy: [asc(channels.order_index)]
      });
      res.json(channels);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  app.post("/api/channels", requireAuth, async (req, res) => {
    const { name, description, section_id } = req.body;
    try {
      const newChannel = await db.insert(channels).values({
        name,
        description,
        section_id,
        creator_id: (req.user as User).id,
      }).returning();
      res.status(201).json(newChannel[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to create channel" });
    }
  });

  // Message endpoints
  app.get("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    const { channelId } = req.params;
    const { before } = req.query;
    try {
      const query = {
        where: and(
          eq(messages.channel_id, channelId),
          before ? desc(messages.created_at) : undefined
        ),
        with: {
          author: true,
          attachments: true,
        },
        limit: 50,
        orderBy: [desc(messages.created_at)],
      };

      const channelMessages = await db.query.messages.findMany(query);
      res.json(channelMessages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Section management endpoints
  app.get("/api/sections", requireAuth, async (_req, res) => {
    try {
      const sections = await db.query.sections.findMany({
        orderBy: [asc(sections.order_index)],
      });
      res.json(sections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sections" });
    }
  });

  const httpServer = createServer(app);

  // Set up WebSocket server
  setupWebSocketServer(httpServer);

  return httpServer;
}