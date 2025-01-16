import { Router } from "express";
import { db } from "@db";
import { eq, and, or } from "drizzle-orm";
import { users, type User, dm_channels } from "@db/schema";

const router = Router();

// Search users for DM
router.get("/users/search", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { query } = req.query;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Search query is required" });
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
    return res.status(500).json({ error: "Failed to search users" });
  }
});

// Get existing DM channel
router.get("/channels/:userId", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const existingChannel = await db
      .select()
      .from(dm_channels)
      .where(
        or(
          and(
            eq(dm_channels.creator_id, (req.user as User).id),
            eq(dm_channels.recipient_id, userId)
          ),
          and(
            eq(dm_channels.creator_id, userId),
            eq(dm_channels.recipient_id, (req.user as User).id)
          )
        )
      )
      .limit(1);

    if (!existingChannel.length) {
      return res.status(404).json({ error: "No DM channel found" });
    }

    const [channel] = existingChannel;

    // Get participants information
    const participants = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.id, channel.creator_id),
          eq(users.id, channel.recipient_id)
        )
      );

    return res.json({ ...channel, participants });
  } catch (error) {
    console.error("Error finding DM channel:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Create new DM channel
router.post("/channels", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    // Check if channel already exists
    const existingChannel = await db
      .select()
      .from(dm_channels)
      .where(
        or(
          and(
            eq(dm_channels.creator_id, (req.user as User).id),
            eq(dm_channels.recipient_id, userId)
          ),
          and(
            eq(dm_channels.creator_id, userId),
            eq(dm_channels.recipient_id, (req.user as User).id)
          )
        )
      )
      .limit(1);

    if (existingChannel.length) {
      const [channel] = existingChannel;
      const participants = await db
        .select()
        .from(users)
        .where(
          or(
            eq(users.id, channel.creator_id),
            eq(users.id, channel.recipient_id)
          )
        );

      return res.json({ ...channel, participants });
    }

    // Create new channel
    const [newChannel] = await db
      .insert(dm_channels)
      .values({
        creator_id: (req.user as User).id,
        recipient_id: userId,
        name: `DM-${Date.now()}`, // Generate a unique name
        description: "Direct Message Channel",
        order_index: 0
      })
      .returning();

    // Get participants information
    const participants = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.id, newChannel.creator_id),
          eq(users.id, newChannel.recipient_id)
        )
      );

    return res.status(201).json({ ...newChannel, participants });
  } catch (error) {
    console.error("Error creating DM channel:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;