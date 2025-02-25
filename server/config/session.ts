import session from "express-session";
import pgSession from "connect-pg-simple";
import pkg from 'pg';
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for session management");
}

const PostgresStore = pgSession(session);

// Initialize session store and return middleware
export async function initializeSessionStore() {
  // Create a dedicated pool for session management
  const poolUrl = process.env.DATABASE_URL?.replace('.us-east-2', '-pooler.us-east-2');
  const pool = new Pool({
    connectionString: poolUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 10000,
    maxUses: 1000,
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
  });

  // Test the connection
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Session store database connection successful');
  } catch (error) {
    console.error('Failed to connect to session store database:', error);
    throw error;
  }

  const store = new PostgresStore({
    pool,
    createTableIfMissing: true,
    tableName: 'session',
    pruneSessionInterval: 60,
    errorLog: console.error.bind(console),
  });

  const isProduction = process.env.NODE_ENV === "production";
  const sessionSecret = process.env.SESSION_SECRET || "leeway_development_secret_DO_NOT_USE_IN_PRODUCTION";

  // Return the session middleware
  return session({
    store,
    secret: sessionSecret,
    name: "connect.sid",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: isProduction,
    cookie: {
      secure: false, // Set to false to work in development
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax',
      path: '/',
    },
  });
}

// Health check for session store
export async function checkSessionStore() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
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