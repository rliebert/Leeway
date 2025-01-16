import { Router } from "express";
import { db } from "@db";
import { eq, and, or } from "drizzle-orm";
import { users, type User, dm_channels } from "@db/schema";

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

// Add endpoint to check for existing DM channels
router.get("/dm/channels", async (req, res) => {
  if (!req.user) return res.status(401).send("Not authenticated");

  const { userId } = req.query;
  if (!userId) return res.status(400).send("User ID is required");

  try {
    const existingChannel = await db
      .select()
      .from(dm_channels)
      .where(
        or(
          and(
            eq(dm_channels.creator_id, (req.user as User).id),
            eq(dm_channels.recipient_id, userId as string)
          ),
          and(
            eq(dm_channels.creator_id, userId as string),
            eq(dm_channels.recipient_id, (req.user as User).id)
          )
        )
      )
      .first();

    if (existingChannel) return res.json(existingChannel);
    return res.status(404).send("No existing DM channel found");
  } catch (error) {
    console.error("Error checking DM channel:", error);
    return res.status(500).send("Internal server error");
  }
});

// Add endpoint to create a new DM channel
router.post("/dm/channels", async (req, res) => {
  if (!req.user) {
    return res.status(401).send("Not authenticated");
  }

  const { userId } = req.body;
  if (!userId || typeof userId !== "string") {
    return res.status(400).send("User ID is required");
  }

  try {
    const newChannel = await db
      .insert(dm_channels)
      .values({
        creator_id: (req.user as User).id,
        recipient_id: userId,
      })
      .returning();

    return res.status(201).json(newChannel);
  } catch (error) {
    console.error("Error creating DM channel:", error);
    return res.status(500).send("Internal server error");
  }
});

export default router;