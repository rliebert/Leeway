import session from "express-session";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for session management");
}

// Create PostgreSQL pool for sessions
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production",
});

const PostgresStore = pgSession(session);

// Session configuration
export const sessionConfig = {
  store: new PostgresStore({
    pool,
    tableName: "session",
    createTableIfMissing: true,
    pruneSessionInterval: 60, // Cleanup expired sessions every minute
  }),
  secret: process.env.SESSION_SECRET || "development_secret",
  name: "sid", // Change cookie name from connect.sid to sid
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: "lax" as const,
  },
};

// Health check for session store
export async function checkSessionStore() {
  try {
    await pool.query("SELECT NOW()");
    return true;
  } catch (error) {
    console.error("Session store health check failed:", error);
    return false;
  }
}
