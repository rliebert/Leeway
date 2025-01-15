import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function createAIUser() {
  try {
    const existingUser = await db.query.users.findFirst({
      where: eq(users.username, "ai.rob"),
    });

    if (!existingUser) {
      // Generate a secure random password for the AI user
      const password = randomBytes(32).toString("hex");
      const hashedPassword = await hashPassword(password);

      const [newUser] = await db.insert(users).values({
        username: "ai.rob",
        password: hashedPassword,
        email: "ai.rob@leeway.app",
        status: "🤖 AI Assistant",
        is_admin: false,
      }).returning();

      console.log("AI user created successfully:", newUser.username);
    } else {
      console.log("AI user already exists");
    }
  } catch (error) {
    console.error("Error creating AI user:", error);
    throw error;
  }
}

createAIUser().catch(console.error);