import { Router } from "express";
import { db } from "@db";
import { eq, and, or } from "drizzle-orm";
import { users, type User } from "@db/schema";

const router = Router();

// Search users for DM
router.get("/users/search", async (req, res) => {
  if (!req.user) {
    return res.status(401).send("Not authenticated");
  }

  const { query } = req.query;
  if (!query || typeof query !== "string") {
    return res.status(400).send("Search query is required");
  }

  try {
    // Search for users by username, excluding the current user
    const searchResults = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.username, query),
          or(
            eq(users.id, (req.user as User).id), // Include current user for self-messaging
          )
        )
      )
      .limit(10);

    res.json(searchResults);
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json([]); //Return empty array instead of undefined
  }
});

export default router;