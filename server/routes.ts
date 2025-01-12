import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { db } from "@db";
import { messages, channels, users, sections } from "@db/schema";
import { eq, and, or, desc, asc, ilike } from "drizzle-orm";
import { setupAuth } from "./auth";
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

  // Protected routes - all these require authentication
  app.use("/api/channels", requireAuth);
  app.use("/api/messages", requireAuth);
  app.use("/api/sections", requireAuth);
  app.use("/api/users", requireAuth);

  const httpServer = createServer(app);
  return httpServer;
}