import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { db } from "@db";
import { messages, channels, users, sections, directMessages } from "@db/schema";
import { eq, ilike } from "drizzle-orm";
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

  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      // Update current user's last active time
      await db
        .update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.id, req.user!.id));

      // Fetch all users
      const allUsers = await db.query.users.findMany({
        orderBy: (users, { desc }) => [desc(users.lastActiveAt)],
      });
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Register DM routes
  app.use("/api/dm", requireAuth, dmRoutes);

  // Register upload routes
  registerUploadRoutes(app);

  // Section routes
  app.get("/api/sections", requireAuth, async (_req, res) => {
    try {
      const allSections = await db.query.sections.findMany({
        with: {
          creator: true,
          channels: {
            with: {
              creator: true,
            },
          },
        },
      });
      res.json(allSections);
    } catch (error) {
      console.error("Error fetching sections:", error);
      res.status(500).send("Failed to fetch sections");
    }
  });

  // Add PUT route for updating sections
  app.put("/api/sections/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Section name is required" });
    }

    try {
      // Check if section exists and user is the creator
      const section = await db.query.sections.findFirst({
        where: eq(sections.id, parseInt(id)),
        with: {
          creator: true,
        },
      });

      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }

      if (section.creatorId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to edit this section" });
      }

      // Update the section
      const [updatedSection] = await db
        .update(sections)
        .set({
          name: name.trim(),
          updatedAt: new Date(),
        })
        .where(eq(sections.id, parseInt(id)))
        .returning();

      // Fetch the updated section with all related data
      const sectionWithDetails = await db.query.sections.findFirst({
        where: eq(sections.id, updatedSection.id),
        with: {
          creator: true,
          channels: {
            with: {
              creator: true,
            },
          },
        },
      });

      res.json(sectionWithDetails);
    } catch (error) {
      console.error("Error updating section:", error);
      res.status(500).json({ error: "Failed to update section" });
    }
  });

  app.get("/api/channels", requireAuth, async (_req, res) => {
    try {
      const allChannels = await db.query.channels.findMany({
        with: {
          creator: true,
          section: true,
        },
        orderBy: (channels, { asc }) => [asc(channels.position)],
      });
      res.json(allChannels);
    } catch (error) {
      console.error("Error fetching channels:", error);
      res.status(500).send("Failed to fetch channels");
    }
  });

  app.get("/api/channels/:id/messages", requireAuth, async (req, res) => {
    try {
      const channelMessages = await db.query.messages.findMany({
        where: eq(messages.channelId, parseInt(req.params.id)),
        with: {
          user: true,
        },
        orderBy: messages.createdAt,
      });
      res.json(channelMessages);
    } catch (error) {
      console.error("Error fetching channel messages:", error);
      res.status(500).send("Failed to fetch messages");
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
          user: true,
          channel: true,
        },
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 10,
      });

      res.json(searchResults);
    } catch (error) {
      console.error("Error searching messages:", error);
      res.status(500).json({ error: "Failed to search messages" });
    }
  });

  // Avatar upload endpoint
  app.post("/api/users/:id/avatar", requireAuth, upload.single("avatar"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send("No file uploaded");
      }

      const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

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
          // Handle both regular channel messages and DMs
          if (message.channelId) {
            if (message.channelId.toString().startsWith("dm_")) {
              // Handle DM
              const dmChannelId = parseInt(message.channelId.split("dm_")[1]);
              const savedMessage = await db
                .insert(directMessages)
                .values({
                  content: message.content,
                  channelId: dmChannelId,
                  userId: message.userId,
                })
                .returning();

              const fullMessage = await db.query.directMessages.findFirst({
                where: eq(directMessages.id, savedMessage[0].id),
                with: {
                  user: true,
                },
              });

              if (fullMessage) {
                const broadcastMessage = JSON.stringify({
                  type: "dm",
                  message: fullMessage,
                });

                wss.clients.forEach((client) => {
                  if (client.readyState === ws.OPEN) {
                    client.send(broadcastMessage);
                  }
                });
              }
            } else {
              // Handle regular channel message
              const savedMessage = await db
                .insert(messages)
                .values({
                  content: message.content,
                  channelId: message.channelId,
                  userId: message.userId,
                  parentMessageId: message.parentMessageId,
                  attachments: message.attachments || null,
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
                  message: fullMessage,
                });

                wss.clients.forEach((client) => {
                  if (client.readyState === ws.OPEN) {
                    client.send(broadcastMessage);
                  }
                });
              }
            }
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