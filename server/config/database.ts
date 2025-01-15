import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import * as schema from "@db/schema";
import ws from "ws";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure neon with connection caching
neonConfig.fetchConnectionCache = true;

// Create a SQL connection
const sql = neon(process.env.DATABASE_URL);

// Export the database instance
export const db = drizzle({
  connection: sql,
  schema,
  ws: ws,
});

// Helper function to check database connection
export async function checkDatabaseConnection() {
  try {
    const result = await sql`SELECT NOW()`;
    return true;
  } catch (error) {
    console.error("Database connection error:", error);
    return false;
  }
}

// Initialize database with retries
export async function initializeDatabase(maxRetries = 3) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      await sql`SELECT 1`;
      console.log(
        `Database connection established successfully after ${attempts + 1} attempts`,
      );
      return true;
    } catch (error) {
      attempts++;
      if (attempts === maxRetries) {
        console.error(
          "Failed to connect to database after maximum retries:",
          error,
        );
        throw error;
      }
      console.log(
        `Retrying database connection (attempt ${attempts + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
    }
  }
  return false;
}
