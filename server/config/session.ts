import session from "express-session";
import pgSession from "connect-pg-simple";
import { neon, neonConfig } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for session management");
}

// Configure Neon client for session store with retries
neonConfig.fetchConnectionCache = true;
neonConfig.webSocketConstructor = undefined; // Disable WebSocket for HTTP-only mode
neonConfig.pipelineConnect = false; // Disable pipelining for more stable connections

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Create session store connection with retry logic
async function createSessionConnection() {
  let lastError;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      // Test the connection
      await sql`SELECT 1`;
      console.log(`Session store connection established successfully after ${i + 1} attempts`);
      return sql;
    } catch (error) {
      lastError = error;
      console.warn(`Session store connection attempt ${i + 1} failed:`, error);
      if (i < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  throw new Error(`Failed to establish session store connection after ${MAX_RETRIES} attempts: ${lastError}`);
}

let sql = neon(process.env.DATABASE_URL);
const PostgresStore = pgSession(session);

// Initialize session store
export async function initializeSessionStore() {
  sql = await createSessionConnection();
  return createSessionConfig();
}

// Create session configuration
function createSessionConfig() {
  return {
    store: new PostgresStore({
      conObject: {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production",
      },
      createTableIfMissing: true,
      pruneSessionInterval: 60, // Cleanup expired sessions every minute
      errorLog: (error: Error) => {
        console.error("Session store error:", {
          error: error.message,
          timestamp: new Date().toISOString(),
          stack: process.env.NODE_ENV === "development" ? error.stack : undefined
        });
      },
    }),
    secret: process.env.SESSION_SECRET || "development_secret",
    name: "sid", // Change cookie name from connect.sid to sid
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh session with each request
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax" as const,
    },
  };
}

// Export initial config
export const sessionConfig = createSessionConfig();

// Enhanced health check for session store with detailed diagnostics
export async function checkSessionStore() {
  try {
    const startTime = Date.now();
    const result = await sql`SELECT NOW() as time, version() as version`;
    const duration = Date.now() - startTime;

    console.log("Session store health check:", {
      status: "connected",
      responseTime: `${duration}ms`,
      timestamp: result[0].time,
      version: result[0].version
    });

    return true;
  } catch (error) {
    console.error("Session store health check failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    });
    return false;
  }
}

// Graceful shutdown handling with cleanup
async function cleanup() {
  console.log('Cleaning up session store connections...');
  try {
    // Close any remaining sessions
    await sql`SELECT pg_terminate_backend(pg_stat_activity.pid)
    FROM pg_stat_activity 
    WHERE pg_stat_activity.datname = current_database()
    AND pid <> pg_backend_pid()`;
    console.log('Session store connections closed successfully');
  } catch (error) {
    console.error('Error during session store cleanup:', error);
  }
}

// Register cleanup handlers
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);