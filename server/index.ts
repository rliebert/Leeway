import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeSessionStore } from "./config/session";
import { initializePinecone, startPeriodicRetraining } from "./services/rag";
import path from "path";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Enhanced logging middleware with timing
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use(cors({
  origin: process.env.NODE_ENV === 'development' 
    ? ['http://localhost:5173', 'http://localhost:5000'] 
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));

(async () => {
  try {
    // Initialize session store and apply middleware
    const sessionMiddleware = await initializeSessionStore();
    app.use(sessionMiddleware);
    log("Session store initialized successfully");

    // Wait for Pinecone initialization before starting server
    try {
      await initializePinecone();
      log("Pinecone service initialized successfully");
    } catch (error) {
      console.error("Error initializing Pinecone service:", error);
      // Continue server startup even if Pinecone fails
    }

    const server = registerRoutes(app);

    // Global error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error("Global error handler caught:", err);
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
    });

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Try alternative ports if 5000 is in use
    const tryPort = (port: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        server
          .listen(port, "0.0.0.0")
          .once("listening", () => {
            log(`Server started successfully on port ${port}`);
            startPeriodicRetraining(); // Start periodic retraining after server is up
            resolve();
          })
          .once("error", (err: any) => {
            if (err.code === "EADDRINUSE") {
              log(`Port ${port} is in use, trying next port...`);
              tryPort(port + 1)
                .then(resolve)
                .catch(reject);
            } else {
              reject(err);
            }
          });
      });
    };

    await tryPort(5000);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
