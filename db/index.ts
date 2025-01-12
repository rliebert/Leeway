import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from '@neondatabase/serverless';
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure Neon client
neonConfig.fetchConnectionCache = true;

// Create optimized database connection
const sql = neon(process.env.DATABASE_URL);

// Export the database instance with proper configuration
export const db = drizzle(sql);

// Add a health check function with proper error handling
export async function checkDatabaseConnection() {
  try {
    const result = await sql`SELECT NOW()`;
    console.log("Database connection verified:", result);
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM signal, closing database connections...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT signal, closing database connections...');
  process.exit(0);
});