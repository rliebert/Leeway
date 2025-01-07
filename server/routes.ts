import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { db } from "@db";
import { messages, channels, users } from "@db/schema";
import { eq, ilike } from "drizzle-orm";
import multer from "multer";
import { setupAuth } from "./auth";

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Authentication middleware
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Not authenticated");
  }
  next();
};

export function registerRoutes(app: Express): Server {
  // Set up authentication routes and middleware
  setupAuth(app);

  app.get("/api/channels", requireAuth, async (_req, res) => {
    const allChannels = await db.query.channels.findMany({
      with: {
        creator: true,
      },
    });
    res.json(allChannels);
  });

  app.post("/api/channels", requireAuth, async (req, res) => {
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).send("Channel name is required");
    }

    try {
      // Check for duplicate channel name
      const existingChannel = await db.query.channels.findFirst({
        where: eq(channels.name, name.trim()),
      });

      if (existingChannel) {
        return res.status(400).send("Channel name already exists");
      }

      const [newChannel] = await db
        .insert(channels)
        .values({
          name: name.trim(),
          description: description?.trim(),
          creatorId: req.user!.id,
        })
        .returning();

      // Fetch the created channel with creator info
      const channelWithCreator = await db.query.channels.findFirst({
        where: eq(channels.id, newChannel.id),
        with: {
          creator: true,
        },
      });

      res.status(201).json(channelWithCreator);
    } catch (error) {
      console.error("Error creating channel:", error);
      res.status(500).send("Failed to create channel");
    }
  });

  app.put("/api/channels/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).send("Channel name is required");
    }

    try {
      // Check if user is the creator
      const channel = await db.query.channels.findFirst({
        where: eq(channels.id, parseInt(id)),
      });

      if (!channel) {
        return res.status(404).send("Channel not found");
      }

      if (channel.creatorId !== req.user!.id) {
        return res.status(403).send("Only the channel creator can edit the channel");
      }

      // Check for duplicate name, excluding current channel
      const existingChannel = await db.query.channels.findFirst({
        where: eq(channels.name, name.trim()),
      });

      if (existingChannel && existingChannel.id !== parseInt(id)) {
        return res.status(400).send("Channel name already exists");
      }

      const [updatedChannel] = await db
        .update(channels)
        .set({
          name: name.trim(),
          description: description?.trim(),
          updatedAt: new Date(),
        })
        .where(eq(channels.id, parseInt(id)))
        .returning();

      // Fetch the updated channel with creator info
      const channelWithCreator = await db.query.channels.findFirst({
        where: eq(channels.id, updatedChannel.id),
        with: {
          creator: true,
        },
      });

      res.json(channelWithCreator);
    } catch (error) {
      console.error("Error updating channel:", error);
      res.status(500).send("Failed to update channel");
    }
  });

  app.delete("/api/channels/:id", requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
      // Check if user is the creator
      const channel = await db.query.channels.findFirst({
        where: eq(channels.id, parseInt(id)),
      });

      if (!channel) {
        return res.status(404).send("Channel not found");
      }

      if (channel.creatorId !== req.user!.id) {
        return res.status(403).send("Only the channel creator can delete the channel");
      }

      // Delete all messages in the channel first
      await db
        .delete(messages)
        .where(eq(messages.channelId, parseInt(id)));

      // Then delete the channel
      await db
        .delete(channels)
        .where(eq(channels.id, parseInt(id)));

      res.json({ message: "Channel deleted successfully" });
    } catch (error) {
      console.error("Error deleting channel:", error);
      res.status(500).send("Failed to delete channel");
    }
  });

  app.get("/api/channels/:id/messages", async (req, res) => {
    const channelMessages = await db.query.messages.findMany({
      where: eq(messages.channelId, parseInt(req.params.id)),
      with: {
        user: true,
        replies: {
          with: {
            user: true,
          },
        },
      },
      orderBy: messages.createdAt,
    });
    res.json(channelMessages);
  });

  app.get("/api/messages/:id/replies", async (req, res) => {
    const replies = await db.query.messages.findMany({
      where: eq(messages.parentMessageId, parseInt(req.params.id)),
      with: {
        user: true,
      },
      orderBy: messages.createdAt,
    });
    res.json(replies);
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

  // Avatar upload endpoint
  app.post("/api/users/:id/avatar", upload.single("avatar"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send("No file uploaded");
      }

      // Convert the buffer to base64
      const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

      // Update user's avatar in the database
      await db
        .update(users)
        .set({ avatar: base64Image })
        .where(eq(users.id, parseInt(req.params.id)));

      res.json({ message: "Avatar updated successfully" });
    } catch (error) {
      console.error("Error updating avatar:", error);
      res.status(500).send("Error updating avatar");
    }
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
              userId: message.userId,
              parentMessageId: message.parentMessageId,
            })
            .returning();

          const fullMessage = await db.query.messages.findFirst({
            where: eq(messages.id, savedMessage[0].id),
            with: {
              user: true,
              replies: true,
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