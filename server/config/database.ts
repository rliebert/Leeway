import { drizzle } from "drizzle-orm/neon-http";
import { neon } from '@neondatabase/serverless';
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Create a SQL connection with pooling configuration
const sql = neon(process.env.DATABASE_URL);

// Export the database instance with pooling
export const db = drizzle(sql, { schema });

// Helper function to check database connection
export async function checkDatabaseConnection() {
  try {
    const result = await sql`SELECT NOW()`;
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}