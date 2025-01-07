import { Router } from "express";
import { db } from "@db";
import { eq, and, or } from "drizzle-orm";
import { directMessageChannels, directMessageParticipants, directMessages, users } from "@db/schema";

const router = Router();

// Get all DM channels for the current user
router.get("/channels", async (req, res) => {
  if (!req.user) {
    return res.status(401).send("Not authenticated");
  }

  try {
    const channels = await db.query.directMessageChannels.findMany({
      where: (dmc) => {
        return eq(directMessageParticipants.userId, req.user!.id);
      },
      with: {
        participants: {
          with: {
            user: true,
          },
        },
      },
    });

    res.json(channels);
  } catch (error) {
    console.error("Error fetching DM channels:", error);
    res.status(500).send("Failed to fetch DM channels");
  }
});

// Create a new DM channel with another user
router.post("/channels", async (req, res) => {
  if (!req.user) {
    return res.status(401).send("Not authenticated");
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).send("Target user ID is required");
  }

  try {
    // Check if DM channel already exists between these users
    const existingChannel = await db.query.directMessageChannels.findFirst({
      where: (dmc) => {
        return and(
          eq(directMessageParticipants.userId, req.user!.id),
          eq(directMessageParticipants.userId, userId)
        );
      },
      with: {
        participants: true,
      },
    });

    if (existingChannel) {
      return res.json(existingChannel);
    }

    // Create new DM channel
    const [channel] = await db
      .insert(directMessageChannels)
      .values({})
      .returning();

    // Add both users as participants
    await db.insert(directMessageParticipants).values([
      { channelId: channel.id, userId: req.user.id },
      { channelId: channel.id, userId },
    ]);

    const fullChannel = await db.query.directMessageChannels.findFirst({
      where: (dmc) => eq(dmc.id, channel.id),
      with: {
        participants: {
          with: {
            user: true,
          },
        },
      },
    });

    res.json(fullChannel);
  } catch (error) {
    console.error("Error creating DM channel:", error);
    res.status(500).send("Failed to create DM channel");
  }
});

// Send a message in a DM channel
router.post("/channels/:channelId/messages", async (req, res) => {
  if (!req.user) {
    return res.status(401).send("Not authenticated");
  }

  const { channelId } = req.params;
  const { content } = req.body;

  if (!content?.trim()) {
    return res.status(400).send("Message content is required");
  }

  try {
    // Verify user is a participant
    const participant = await db.query.directMessageParticipants.findFirst({
      where: (dmp) => 
        and(
          eq(dmp.channelId, parseInt(channelId)),
          eq(dmp.userId, req.user!.id)
        ),
    });

    if (!participant) {
      return res.status(403).send("Not a participant in this DM channel");
    }

    const [message] = await db
      .insert(directMessages)
      .values({
        content,
        channelId: parseInt(channelId),
        userId: req.user.id,
      })
      .returning();

    const fullMessage = await db.query.directMessages.findFirst({
      where: (dm) => eq(dm.id, message.id),
      with: {
        user: true,
      },
    });

    res.json(fullMessage);
  } catch (error) {
    console.error("Error sending DM:", error);
    res.status(500).send("Failed to send message");
  }
});

// Get messages for a DM channel
router.get("/channels/:channelId/messages", async (req, res) => {
  if (!req.user) {
    return res.status(401).send("Not authenticated");
  }

  const { channelId } = req.params;

  try {
    // Verify user is a participant
    const participant = await db.query.directMessageParticipants.findFirst({
      where: (dmp) => 
        and(
          eq(dmp.channelId, parseInt(channelId)),
          eq(dmp.userId, req.user!.id)
        ),
    });

    if (!participant) {
      return res.status(403).send("Not a participant in this DM channel");
    }

    const messages = await db.query.directMessages.findMany({
      where: (dm) => eq(dm.channelId, parseInt(channelId)),
      with: {
        user: true,
      },
      orderBy: (dm) => dm.createdAt,
    });

    res.json(messages);
  } catch (error) {
    console.error("Error fetching DMs:", error);
    res.status(500).send("Failed to fetch messages");
  }
});

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
            eq(users.id, req.user.id), // Include current user for self-messaging
          )
        )
      )
      .limit(10);

    res.json(searchResults);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).send("Failed to search users");
  }
});

export default router;
