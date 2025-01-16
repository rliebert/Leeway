
import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import * as schema from "@db/schema";
import ws from "ws";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure neon with connection pooling and caching
neonConfig.fetchConnectionCache = true;
neonConfig.webSocketConstructor = ws;
neonConfig.pipelineConnect = false; // Disable pipelining for more stable connections

// Use connection pooling URL
const poolUrl = process.env.DATABASE_URL.replace('.us-east-2', '-pooler.us-east-2');

// Create a SQL connection with retries
const sql = neon(poolUrl);

// Export the database instance with logging
export const db = drizzle(sql, {
  schema,
  logger: true
});

// Helper function to check database connection with retries
export async function checkDatabaseConnection(maxRetries = 5) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      const result = await sql`SELECT NOW()`;
      console.log("Database connection successful");
      return true;
    } catch (error) {
      attempts++;
      if (attempts === maxRetries) {
        console.error("Failed to connect to database after maximum retries:", error);
        return false;
      }
      console.log(`Retrying database connection (attempt ${attempts}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
  return false;
}

// Initialize database with automatic retries
export async function initializeDatabase(maxRetries = 5) {
  return checkDatabaseConnection(maxRetries);
}
