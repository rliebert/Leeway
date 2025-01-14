
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

async function createAIUser() {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.username, "ai.rob"),
  });

  if (!existingUser) {
    await db.insert(users).values({
      username: "ai.rob",
      email: "ai.rob@leeway.app",
      display_name: "AI Rob",
      avatar_url: "/ai-avatar.png", // You can update this with an actual avatar
      is_bot: true,
    });
    console.log("AI user created successfully");
  } else {
    console.log("AI user already exists");
  }
}

createAIUser().catch(console.error);
