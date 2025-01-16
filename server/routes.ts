import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { messages, channels, users, sections, file_attachments } from "@db/schema";
import { eq, and, or, desc, asc, ilike } from "drizzle-orm";
import { setupAuth } from "./auth";
import { setupWebSocketServer } from "./websocket";
import dmRoutes from "./routes/dm";
import aiRoutes from "./routes/ai";
import { registerUploadRoutes } from "./routes/upload";
import type { User, Message, Channel, Section } from "@db/schema";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const crypto = {
  hash: async (password: string) => {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  },
  compare: async (suppliedPassword: string, storedPassword: string) => {
    const [hashedPassword, salt] = storedPassword.split(".");
    const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
    const suppliedPasswordBuf = (await scryptAsync(
      suppliedPassword,
      salt,
      64
    )) as Buffer;
    return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
  },
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

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
  app.use("/api", requireAuth, aiRoutes); // Register AI routes
  registerUploadRoutes(app);

  // File upload endpoint
  app.post("/api/upload", requireAuth, upload.array('files', 10), async (req, res) => {
    try {
      if (!req.files || !Array.isArray(req.files)) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const files = req.files.map(file => ({
        id: uuidv4(),
        url: `/uploads/${file.filename}`,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      }));

      res.json(files);
    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({ error: "File upload failed" });
    }
  });

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

  // Message search endpoint
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

      const user = req.user as User;
      if (message.user_id !== user.id && !user.is_admin) {
        return res.status(403).json({ error: "Not authorized to delete this message" });
      }

      // Delete all replies first if this is a parent message
      if (!message.parent_id) {
        await db.delete(messages).where(eq(messages.parent_id, id));
      }

      // Delete the message itself
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

  // Avatar upload endpoint
  app.post("/api/users/:userId/avatar", requireAuth, upload.single('avatar'), async (req, res) => {
    try {
      const user = req.user as User;
      if (!user?.id || user.id !== req.params.userId) {
        return res.status(401).send("Unauthorized");
      }

      if (!req.file) {
        return res.status(400).send("No file uploaded");
      }

      const avatarUrl = `/uploads/${req.file.filename}`;

      // Update user's avatar_url in database
      await db
        .update(users)
        .set({ avatar_url: avatarUrl })
        .where(eq(users.id, user.id));

      res.json({ url: avatarUrl });
    } catch (error) {
      console.error("Avatar upload error:", error);
      res.status(500).send("Failed to upload avatar");
    }
  });

  app.post("/api/user/change-password", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user?.id) {
        return res.status(401).send("Unauthorized");
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }

      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, user.id)
      });

      if (!currentUser) {
        console.error("User not found:", user.id);
        return res.status(404).json({ error: "User not found" });
      }

      const isPasswordValid = await crypto.compare(currentPassword, currentUser.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const [updatedUser] = await db
        .update(users)
        .set({ password: await crypto.hash(newPassword) })
        .where(eq(users.id, user.id))
        .returning();

      await new Promise((resolve, reject) => {
        req.login(updatedUser, (err) => {
          if (err) {
            console.error("Session update error:", err);
            reject(err);
          } else {
            resolve(true);
          }
        });
      });

      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Password change error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to change password";
      res.status(500).json({ error: errorMessage });
    }
  });

  app.put("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const user = req.user as User;
      if (!user?.id) {
        return res.status(401).send("Unauthorized");
      }

      const { username, full_name, email } = req.body;

      // Check if username is taken
      if (username !== user.username) {
        const existing = await db.query.users.findFirst({
          where: eq(users.username, username),
        });

        if (existing) {
          return res.status(400).send("Username already taken");
        }
      }

      const [updatedUser] = await db
        .update(users)
        .set({ username, full_name, email })
        .where(eq(users.id, user.id))
        .returning();

      // Update session with complete user data
      await new Promise((resolve, reject) => {
        req.login(updatedUser, (err) => {
          if (err) {
            console.error("Session update error:", err);
            reject(err);
          } else {
            resolve(true);
          }
        });
      });

      res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).send("Failed to update profile");
    }
  });

  const httpServer = createServer(app);

  // Set up WebSocket server
  setupWebSocketServer(httpServer);

  return httpServer;
}