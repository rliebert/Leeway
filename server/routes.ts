import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { db } from "@db";
import { messages, channels, users, sections } from "@db/schema";
import { eq, and, or, desc, asc, ilike } from "drizzle-orm";
import multer from "multer";
import { setupAuth } from "./auth";
import dmRoutes from "./routes/dm";
import { registerUploadRoutes } from "./routes/upload";

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

  // Admin routes
  app.post("/api/admin/set", requireAuth, async (req, res) => {
    try {
      const [user] = await db
        .update(users)
        .set({ 
          is_admin: true,
          role: 'admin'
        })
        .where(eq(users.id, req.user!.id))
        .returning();

      res.json({ message: "Admin privileges granted", user });
    } catch (error) {
      console.error("Error setting admin:", error);
      res.status(500).json({ error: "Failed to set admin privileges" });
    }
  });

  // User routes
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      // Update current user's last active time
      await db
        .update(users)
        .set({ last_active: new Date() })
        .where(eq(users.id, req.user!.id));

      // Fetch all users
      const allUsers = await db.query.users.findMany({
        orderBy: [desc(users.last_active)],
      });
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Section routes
  app.get("/api/sections", requireAuth, async (_req, res) => {
    try {
      const allSections = await db.query.sections.findMany({
        with: {
          channels: true,
        },
        orderBy: (sections, { asc }) => [asc(sections.order_index)],
      });
      res.json(allSections);
    } catch (error) {
      console.error("Error fetching sections:", error);
      res.status(500).send("Failed to fetch sections");
    }
  });

  app.post("/api/sections", requireAuth, async (req, res) => {
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Section name is required" });
    }

    try {
      // Get the highest order_index
      const sections = await db.query.sections.findMany({
        orderBy: (sections, { desc }) => [desc(sections.order_index)],
        limit: 1,
      });

      const newOrderIndex = sections.length > 0 ? sections[0].order_index + 1 : 0;

      // Create the section
      const [section] = await db
        .insert(sections)
        .values({
          name: name.trim(),
          order_index: newOrderIndex,
        })
        .returning();

      res.status(201).json(section);
    } catch (error) {
      console.error("Error creating section:", error);
      res.status(500).json({ error: "Failed to create section" });
    }
  });

  // Channel routes
  app.get("/api/channels", requireAuth, async (_req, res) => {
    try {
      const allChannels = await db.query.channels.findMany({
        with: {
          section: true,
          creator: true,
        },
        orderBy: (channels, { asc }) => [asc(channels.order_index)],
      });
      res.json(allChannels);
    } catch (error) {
      console.error("Error fetching channels:", error);
      res.status(500).send("Failed to fetch channels");
    }
  });

  app.post("/api/channels", requireAuth, async (req, res) => {
    const { name, description, section_id } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Channel name is required" });
    }

    try {
      const [channel] = await db
        .insert(channels)
        .values({
          name: name.trim(),
          description: description?.trim(),
          section_id: section_id || null,
        })
        .returning();

      const fullChannel = await db.query.channels.findFirst({
        where: eq(channels.id, channel.id),
        with: {
          section: true,
        },
      });

      res.status(201).json(fullChannel);
    } catch (error) {
      console.error("Error creating channel:", error);
      res.status(500).json({ error: "Failed to create channel" });
    }
  });

  app.put("/api/channels/:id", requireAuth, async (req, res) => {
    try {
      const { name, description, section_id } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({ error: "Channel name is required" });
      }

      // Convert section_id to null if it's "unsectioned" or an invalid UUID
      let finalSectionId: string | null = null;
      if (section_id && section_id !== "unsectioned") {
        try {
          finalSectionId = section_id;
        } catch (e) {
          console.error("Invalid section_id format:", e);
          return res.status(400).json({ error: "Invalid section ID format" });
        }
      }

      const [channel] = await db
        .update(channels)
        .set({
          name: name.trim(),
          description: description?.trim() || null,
          section_id: finalSectionId,
        })
        .where(eq(channels.id, req.params.id))
        .returning();

      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }

      const fullChannel = await db.query.channels.findFirst({
        where: eq(channels.id, channel.id),
        with: {
          section: true,
        },
      });

      res.json(fullChannel);
    } catch (error) {
      console.error("Error updating channel:", error);
      res.status(500).json({ error: "Failed to update channel" });
    }
  });

  // Message routes
  app.get("/api/channels/:id/messages", requireAuth, async (req, res) => {
    try {
      const channelMessages = await db.query.messages.findMany({
        where: eq(messages.channel_id, req.params.id),
        with: {
          author: true,
        },
        orderBy: (messages, { desc }) => [desc(messages.created_at)],
      });
      res.json(channelMessages);
    } catch (error) {
      console.error("Error fetching channel messages:", error);
      res.status(500).send("Failed to fetch messages");
    }
  });

  // Register DM routes
  app.use("/api/dm", requireAuth, dmRoutes);

  // Register upload routes
  registerUploadRoutes(app);

  // Avatar upload endpoint
  app.post("/api/users/:id/avatar", requireAuth, upload.single("avatar"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send("No file uploaded");
      }

      const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

      await db
        .update(users)
        .set({ avatar_url: base64Image })
        .where(eq(users.id, req.params.id));

      res.json({ message: "Avatar updated successfully" });
    } catch (error) {
      console.error("Error updating avatar:", error);
      res.status(500).send("Error updating avatar");
    }
  });

  // Search messages
  app.get("/api/messages/search", requireAuth, async (req, res) => {
    try {
      const query = req.query.q;
      console.log("Search query received:", query);

      if (!query || typeof query !== "string" || query.trim().length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }

      const searchResults = await db.query.messages.findMany({
        where: ilike(messages.content, `%${query}%`),
        with: {
          author: true,
          channel: true,
        },
        orderBy: (messages, { desc }) => [desc(messages.created_at)],
        limit: 10,
      });

      res.json(searchResults);
    } catch (error) {
      console.error("Error searching messages:", error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const protocol = request.headers["sec-websocket-protocol"];
    if (protocol === "vite-hmr") {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    console.log("New WebSocket connection established");

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "message") {
          // Handle channel message
          const savedMessage = await db
            .insert(messages)
            .values({
              content: message.content,
              channel_id: message.channelId,
              user_id: message.userId,
            })
            .returning();

          const fullMessage = await db.query.messages.findFirst({
            where: eq(messages.id, savedMessage[0].id),
            with: {
              author: true,
            },
          });

          if (fullMessage) {
            const broadcastMessage = JSON.stringify({
              type: "message",
              message: fullMessage,
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