import session from "express-session";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for session management");
}

const PostgresStore = pgSession(session);

// Initialize session store and return middleware
export async function initializeSessionStore() {
  // Create a dedicated pool for session management
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  });

  // Test the connection
  try {
    await pool.query('SELECT NOW()');
    console.log('Session store database connection successful');
  } catch (error) {
    console.error('Failed to connect to session store database:', error);
    throw error;
  }

  const store = new PostgresStore({
    pool,
    createTableIfMissing: true,
    tableName: 'session', // Explicitly name the session table
    pruneSessionInterval: 60, // Cleanup expired sessions every minute
  });

  // Return the session middleware
  return session({
    store,
    secret: process.env.SESSION_SECRET || "development_secret",
    name: "sid", // Change cookie name from connect.sid to sid
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh session with each request
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
  });
}

// Health check for session store
export async function checkSessionStore() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    const startTime = Date.now();
    const result = await pool.query('SELECT NOW() as time, version() as version');
    const duration = Date.now() - startTime;

    console.log("Session store health check:", {
      status: "connected",
      responseTime: `${duration}ms`,
      timestamp: result.rows[0].time,
      version: result.rows[0].version
    });

    await pool.end();
    return true;
  } catch (error) {
    console.error("Session store health check failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    });
    return false;
  }
}

// Cleanup function for graceful shutdown
async function cleanup() {
  console.log('Cleaning up session store connections...');
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });

    // Close any remaining connections
    await pool.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = current_database()
      AND pid <> pg_backend_pid()`
    );
    await pool.end();
    console.log('Session store connections closed successfully');
  } catch (error) {
    console.error('Error during session store cleanup:', error);
  }
}

// Register cleanup handlers
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);