import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { db } from "@db";
import { messages, channels, users, sections, directMessages, directMessageChannels, directMessageParticipants } from "@db/schema";
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

  // Register DM routes
  app.use("/api/dm", requireAuth, dmRoutes);

  // Register upload routes
  registerUploadRoutes(app);

  // Section routes
  app.get("/api/sections", requireAuth, async (_req, res) => {
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
  });

  app.post("/api/sections", requireAuth, async (req, res) => {
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).send("Section name is required");
    }

    try {
      const [newSection] = await db
        .insert(sections)
        .values({
          name: name.trim(),
          creatorId: req.user!.id,
        })
        .returning();

      const sectionWithDetails = await db.query.sections.findFirst({
        where: eq(sections.id, newSection.id),
        with: {
          creator: true,
          channels: true,
        },
      });

      res.status(201).json(sectionWithDetails);
    } catch (error) {
      console.error("Error creating section:", error);
      res.status(500).send("Failed to create section");
    }
  });

  app.put("/api/sections/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).send("Section name is required");
    }

    try {
      const section = await db.query.sections.findFirst({
        where: eq(sections.id, parseInt(id)),
      });

      if (!section) {
        return res.status(404).send("Section not found");
      }

      if (section.creatorId !== req.user!.id) {
        return res.status(403).send("Only the section creator can edit the section");
      }

      const [updatedSection] = await db
        .update(sections)
        .set({
          name: name.trim(),
          updatedAt: new Date(),
        })
        .where(eq(sections.id, parseInt(id)))
        .returning();

      const sectionWithDetails = await db.query.sections.findFirst({
        where: eq(sections.id, updatedSection.id),
        with: {
          creator: true,
          channels: true,
        },
      });

      res.json(sectionWithDetails);
    } catch (error) {
      console.error("Error updating section:", error);
      res.status(500).send("Failed to update section");
    }
  });

  app.delete("/api/sections/:id", requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
      const section = await db.query.sections.findFirst({
        where: eq(sections.id, parseInt(id)),
      });

      if (!section) {
        return res.status(404).send("Section not found");
      }

      if (section.creatorId !== req.user!.id) {
        return res.status(403).send("Only the section creator can delete the section");
      }

      // Update channels in this section to have no section
      await db
        .update(channels)
        .set({ sectionId: null })
        .where(eq(channels.sectionId, parseInt(id)));

      // Delete the section
      await db
        .delete(sections)
        .where(eq(sections.id, parseInt(id)));

      res.json({ message: "Section deleted successfully" });
    } catch (error) {
      console.error("Error deleting section:", error);
      res.status(500).send("Failed to delete section");
    }
  });

  // Update channel's section
  app.put("/api/channels/:id/section", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { sectionId } = req.body;

    try {
      const channel = await db.query.channels.findFirst({
        where: eq(channels.id, parseInt(id)),
      });

      if (!channel) {
        return res.status(404).send("Channel not found");
      }

      if (channel.creatorId !== req.user!.id) {
        return res.status(403).send("Only the channel creator can move the channel");
      }

      const [updatedChannel] = await db
        .update(channels)
        .set({
          sectionId: sectionId ? parseInt(sectionId) : null,
          updatedAt: new Date(),
        })
        .where(eq(channels.id, parseInt(id)))
        .returning();

      const channelWithDetails = await db.query.channels.findFirst({
        where: eq(channels.id, updatedChannel.id),
        with: {
          creator: true,
          section: true,
        },
      });

      res.json(channelWithDetails);
    } catch (error) {
      console.error("Error updating channel section:", error);
      res.status(500).send("Failed to update channel section");
    }
  });

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

  // Add this new endpoint for handling channel reordering
  app.post("/api/channels/reorder", requireAuth, async (req, res) => {
    const { channelIds } = req.body;

    if (!Array.isArray(channelIds)) {
      return res.status(400).send("Invalid channel order data");
    }

    try {
      // Update each channel's position
      await Promise.all(
        channelIds.map((id, index) =>
          db
            .update(channels)
            .set({ position: index, updatedAt: new Date() })
            .where(eq(channels.id, id))
        )
      );

      res.json({ message: "Channels reordered successfully" });
    } catch (error) {
      console.error("Error reordering channels:", error);
      res.status(500).send("Failed to reorder channels");
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

  // Search messages for a query
  app.get("/api/messages/search", async (req, res) => {
    const { query } = req.query;
    console.log("Search query received:", query);

    if (!query || typeof query !== "string") {
      console.log("Invalid search query:", query);
      return res.status(400).send("Search query is required");
    }

    try {
      console.log("Executing search with query:", query);
      // Search for messages by content, including user and channel info
      const searchResults = await db.query.messages.findMany({
        where: ilike(messages.content, `%${query}%`),
        with: {
          user: true,
          channel: true,
        },
        orderBy: messages.createdAt,
        limit: 20,
      });

      console.log("Search results:", searchResults.length);
      res.json(searchResults);
    } catch (error) {
      console.error("Error searching messages:", error);
      res.status(500).send("Failed to search messages");
    }
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


  // Direct Message routes
  app.get("/api/dm/channels", requireAuth, async (req, res) => {
    try {
      const userDmChannels = await db.query.directMessageParticipants.findMany({
        where: eq(directMessageParticipants.userId, req.user!.id),
        with: {
          channel: {
            with: {
              participants: {
                with: {
                  user: true,
                },
              },
            },
          },
        },
      });

      // Transform the data to match our DirectMessageChannel type
      const channels = userDmChannels.map(participant => ({
        ...participant.channel,
        participants: participant.channel.participants.map(p => p.user),
      }));

      res.json(channels);
    } catch (error) {
      console.error("Error fetching DM channels:", error);
      res.status(500).send("Failed to fetch DM channels");
    }
  });

  app.post("/api/dm/channels", requireAuth, async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).send("User ID is required");
    }

    try {
      // Check if a DM channel already exists between these users
      const existingChannel = await db.query.directMessageChannels.findFirst({
        with: {
          participants: true,
        },
        where: (channels, { inArray, eq, and }) => inArray(
          channels.id,
          db.select({ id: directMessageParticipants.channelId })
            .from(directMessageParticipants)
            .where(and(
              eq(directMessageParticipants.userId, req.user!.id),
              eq(directMessageParticipants.userId, userId)
            ))
        ),
      });

      if (existingChannel) {
        return res.status(400).send("DM channel already exists");
      }

      // Create new DM channel
      const [newChannel] = await db
        .insert(directMessageChannels)
        .values({})
        .returning();

      // Add participants
      await db.insert(directMessageParticipants).values([
        { channelId: newChannel.id, userId: req.user!.id },
        { channelId: newChannel.id, userId },
      ]);

      // Fetch the complete channel data
      const channel = await db.query.directMessageChannels.findFirst({
        where: eq(directMessageChannels.id, newChannel.id),
        with: {
          participants: {
            with: {
              user: true,
            },
          },
        },
      });

      if (!channel) {
        throw new Error("Failed to create DM channel");
      }

      res.status(201).json({
        ...channel,
        participants: channel.participants.map(p => p.user),
      });
    } catch (error) {
      console.error("Error creating DM channel:", error);
      res.status(500).send("Failed to create DM channel");
    }
  });

  app.get("/api/dm/channels/:id/messages", requireAuth, async (req, res) => {
    try {
      const messages = await db.query.directMessages.findMany({
        where: eq(directMessages.channelId, parseInt(req.params.id)),
        with: {
          user: true,
        },
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
      });

      res.json(messages);
    } catch (error) {
      console.error("Error fetching DM messages:", error);
      res.status(500).send("Failed to fetch messages");
    }
  });

  const httpServer = createServer(app);

  const wss = new WebSocketServer({
    noServer: true,
  });

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
          const savedMessage = message.isDM ?
            await db
              .insert(directMessages)
              .values({
                content: message.content,
                channelId: message.channelId,
                userId: message.userId,
              })
              .returning() :
            await db
              .insert(messages)
              .values({
                content: message.content,
                channelId: message.channelId,
                userId: message.userId,
                parentMessageId: message.parentMessageId,
                attachments: message.attachments || null, // Add attachments to the database
              })
              .returning();

          const fullMessage = message.isDM ?
            await db.query.directMessages.findFirst({
              where: eq(directMessages.id, savedMessage[0].id),
              with: {
                user: true,
              },
            }) :
            await db.query.messages.findFirst({
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
              isDM: message.isDM,
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