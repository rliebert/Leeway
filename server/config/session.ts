import session from "express-session";
import pgSession from "connect-pg-simple";
import { neon, neonConfig } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for session management");
}

// Configure Neon client for session store
neonConfig.fetchConnectionCache = true;

const sql = neon(process.env.DATABASE_URL);
const PostgresStore = pgSession(session);

// Session configuration with enhanced security and performance
export const sessionConfig = {
  store: new PostgresStore({
    conObject: {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production",
    },
    createTableIfMissing: true,
    pruneSessionInterval: 60, // Cleanup expired sessions every minute
    errorLog: console.error.bind(console),
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

// Health check for session store
export async function checkSessionStore() {
  try {
    const result = await sql`SELECT NOW()`;
    console.log("Session store connection verified:", result);
    return true;
  } catch (error) {
    console.error("Session store health check failed:", error);
    return false;
  }
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal, closing session store...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT signal, closing session store...');
  process.exit(0);
});