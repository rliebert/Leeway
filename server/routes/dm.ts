import { Router } from "express";
import { db } from "@db";
import { eq, and, or, ilike } from "drizzle-orm";
import { directMessageChannels, directMessageParticipants, directMessages, users } from "@db/schema";

const router = Router();

// Get all DM channels for the current user
router.get("/channels", async (req, res) => {
  if (!req.user) {
    return res.status(401).send("Not authenticated");
  }

  try {
    const channels = await db.query.directMessageParticipants.findMany({
      where: (dmp) => eq(dmp.userId, req.user!.id),
      with: {
        channel: {
          with: {
            participants: {
              with: {
                user: true,
              },
            },
          },
        },
      },
    });

    // Transform the data to match the expected format
    const formattedChannels = channels.map((participation) => ({
      ...participation.channel,
      participants: participation.channel.participants.map((p) => p.user),
    }));

    res.json(formattedChannels);
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
    const existingChannel = await db.query.directMessageParticipants.findFirst({
      where: (dmp, { and, eq }) => {
        return and(
          eq(dmp.userId, req.user!.id),
          eq(dmp.userId, userId)
        );
      },
      with: {
        channel: {
          with: {
            participants: {
              with: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (existingChannel) {
      return res.json({
        ...existingChannel.channel,
        participants: existingChannel.channel.participants.map((p) => p.user),
      });
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

    if (!fullChannel) {
      throw new Error("Failed to create DM channel");
    }

    res.json({
      ...fullChannel,
      participants: fullChannel.participants.map((p) => p.user),
    });
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
    // Search for users by username, including current user for self-messaging
    const searchResults = await db
      .select()
      .from(users)
      .where(
        ilike(users.username, `%${query}%`)
      )
      .limit(10);

    res.json(searchResults);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).send("Failed to search users");
  }
});

export default router;