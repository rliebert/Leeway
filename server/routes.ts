import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { messages, channels, users, sections, file_attachments } from "@db/schema";
import { eq, and, or, desc, asc, ilike } from "drizzle-orm";
import { setupAuth } from "./auth";
import { setupWebSocketServer } from "./websocket";
import dmRoutes from "./routes/dm";
import { registerUploadRoutes } from "./routes/upload";

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

  // Register upload routes before other routes
  registerUploadRoutes(app);

  app.use("/api/dm", requireAuth, dmRoutes);

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

  // Update channel
  app.patch("/api/channels/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { name, description, section_id } = req.body;
    try {
      // First check if user is creator or admin
      const channel = await db.query.channels.findFirst({
        where: eq(channels.id, id),
      });

      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }

      if (channel.creator_id !== (req.user as User).id && !(req.user as User).is_admin) {
        return res.status(403).json({ error: "Not authorized to edit this channel" });
      }

      const [updatedChannel] = await db.update(channels)
        .set({
          name,
          description,
          section_id,
        })
        .where(eq(channels.id, id))
        .returning();

      res.json(updatedChannel);
    } catch (error) {
      console.error('Failed to update channel:', error);
      res.status(500).json({ error: "Failed to update channel" });
    }
  });

  // Delete channel
  app.delete("/api/channels/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      // First check if user is creator or admin
      const channel = await db.query.channels.findFirst({
        where: eq(channels.id, id),
      });

      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }

      if (channel.creator_id !== (req.user as User).id && !(req.user as User).is_admin) {
        return res.status(403).json({ error: "Not authorized to delete this channel" });
      }

      await db.delete(channels)
        .where(eq(channels.id, id));

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete channel:', error);
      res.status(500).json({ error: "Failed to delete channel" });
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

  // Delete message endpoint
  app.delete("/api/messages/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
      const message = await db.query.messages.findFirst({
        where: eq(messages.id, id)
      });

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      if (message.user_id !== (req.user as User).id) {
        return res.status(403).json({ error: "Not authorized to delete this message" });
      }

      await db.delete(messages).where(eq(messages.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete message:', error);
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

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
  app.get("/api/users", async (req, res) => {
    if (!req.user) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const users = await db.query.users.findMany();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).send("Internal server error");
    }
  });

  const httpServer = createServer(app);

  // Set up WebSocket server
  setupWebSocketServer(httpServer);

  return httpServer;
}