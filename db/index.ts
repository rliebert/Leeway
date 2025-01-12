import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from '@neondatabase/serverless';
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure Neon client with retries and enhanced logging
neonConfig.fetchConnectionCache = true;
neonConfig.webSocketConstructor = undefined; // Disable WebSocket for HTTP-only mode
neonConfig.pipelineConnect = false; // Disable pipelining for more stable connections

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Create database connection with retry logic
async function createDatabaseConnection() {
  let lastError;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      // Test the connection
      await sql`SELECT 1`;
      console.log(`Database connection established successfully after ${i + 1} attempts`);
      return sql;
    } catch (error) {
      lastError = error;
      console.warn(`Database connection attempt ${i + 1} failed:`, error);
      if (i < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  throw new Error(`Failed to establish database connection after ${MAX_RETRIES} attempts: ${lastError}`);
}

// Initialize database connection
let sql = neon(process.env.DATABASE_URL);
let db = drizzle(sql, { schema });

// Export the initialize function to be called at startup
export async function initializeDatabase() {
  sql = await createDatabaseConnection();
  db = drizzle(sql, { schema });
  return db;
}

// Export the database instance
export { db };

// Enhanced health check function with detailed diagnostics
export async function checkDatabaseConnection() {
  try {
    const startTime = Date.now();
    const result = await sql`SELECT NOW() as time, version() as version, current_database() as database`;
    const duration = Date.now() - startTime;

    console.log("Database health check:", {
      status: "connected",
      responseTime: `${duration}ms`,
      timestamp: result[0].time,
      version: result[0].version,
      database: result[0].database
    });

    return true;
  } catch (error) {
    console.error("Database health check failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    });
    return false;
  }
}

// Graceful shutdown handling with cleanup
async function cleanup() {
  console.log('Cleaning up database connections...');
  try {
    // Close any remaining queries/transactions
    await sql`SELECT pg_terminate_backend(pg_stat_activity.pid)
    FROM pg_stat_activity
    WHERE pg_stat_activity.datname = current_database()
    AND pid <> pg_backend_pid()`;
    console.log('Database connections closed successfully');
  } catch (error) {
    console.error('Error during database cleanup:', error);
  }
  process.exit(0);
}

// Register cleanup handlers
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Export types
export type Database = typeof db;