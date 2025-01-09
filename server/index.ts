import express from 'express';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';
import { log } from './vite';
import { registerRoutes } from './routes';
import { setupVite, serveStatic } from './vite';

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Set up routes and get HTTP server instance
const server = registerRoutes(app);

// In development, set up Vite after routes
if (process.env.NODE_ENV !== 'production') {
  setupVite(app, server);
} else {
  serveStatic(app);
}

// Use PORT from environment variable or fallback to 8080
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  log(`Backend API server running at http://${HOST}:${PORT}`);
});

export default app;