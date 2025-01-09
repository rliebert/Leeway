import express from 'express';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { users } from './db/schema';
import { log } from './vite';
import { registerRoutes } from './routes';
import { setupVite, serveStatic } from './vite';
import cors from 'cors';

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enable CORS for development
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
  }));
}

// Set up routes and get HTTP server instance
const server = registerRoutes(app);

// In development, set up Vite after routes
if (process.env.NODE_ENV !== 'production') {
  setupVite(app, server);
} else {
  serveStatic(app);
}

// Use fixed port 8080 for the backend API server
const PORT = 8080;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  log(`Backend API server running at http://${HOST}:${PORT}`);
});

export default app;