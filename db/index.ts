import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure connection with pooling and proper timeouts
const poolConfig = {
  max: 20, // Maximum number of connections
  connectionTimeoutMillis: 10000, // Connection timeout
  idleTimeoutMillis: 30000, // How long a connection can be idle before being closed
  retryInterval: 1000, // Time between connection retries
  maxRetries: 3, // Maximum number of connection retries
};

// Export the database instance with proper configuration
export const db = drizzle({
  connection: process.env.DATABASE_URL,
  schema,
  ws,
  connectionOptions: {
    ...poolConfig,
    keepAlive: true,
    onError: (err) => {
      console.error("Database connection error:", err);
      // Implement proper error handling and logging
    },
    onConnect: () => {
      console.log("Database connected successfully");
    },
  },
});

// Add a health check function
export async function checkDatabaseConnection() {
  try {
    // Simple query to verify connection
    await db.select().from(schema.users).limit(1);
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}