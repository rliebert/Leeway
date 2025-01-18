import { Router } from "express";
import { db } from "@db";
import { eq, and, or, asc } from "drizzle-orm";
import type { User, Message } from "@db/schema";
import { users, dm_channels, channel_subscriptions, messages, file_attachments } from "@db/schema";

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
    const searchResults = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.username, query),
          or(
            eq(users.id, (req.user as User).id),
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

// Add endpoint to check for existing DM channels
router.get("/channels/:userId", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    console.log("[DM] Checking for existing channel between users:", { currentUser: (req.user as User).id, targetUser: userId });
    const existingChannel = await db
      .select({
        id: dm_channels.id,
        initiator_id: dm_channels.initiator_id,
        invited_user_id: dm_channels.invited_user_id,
        created_at: dm_channels.created_at,
        order_index: dm_channels.order_index
      })
      .from(dm_channels)
      .where(
        or(
          and(
            eq(dm_channels.initiator_id, (req.user as User).id),
            eq(dm_channels.invited_user_id, userId)
          ),
          and(
            eq(dm_channels.initiator_id, userId),
            eq(dm_channels.invited_user_id, (req.user as User).id)
          )
        )
      );

    if (existingChannel.length > 0) {
      console.log("[DM] Found existing channel:", existingChannel[0]);
      return res.json(existingChannel[0]);
    }

    console.log("[DM] No existing channel found");
    return res.status(404).json({ error: "No existing DM channel found" });
  } catch (error) {
    console.error("[DM] Error checking DM channel:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Add endpoint to create a new DM channel
router.post("/channels", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { invitedUserId } = req.body;
  if (!invitedUserId || typeof invitedUserId !== "string") {
    return res.status(400).json({ error: "Invited user ID is required" });
  }

  try {
    // First check if channel exists
    const existingChannel = await db
      .select({
        id: dm_channels.id,
        initiator_id: dm_channels.initiator_id,
        invited_user_id: dm_channels.invited_user_id,
        created_at: dm_channels.created_at,
        order_index: dm_channels.order_index
      })
      .from(dm_channels)
      .where(
        or(
          and(
            eq(dm_channels.initiator_id, (req.user as User).id),
            eq(dm_channels.invited_user_id, invitedUserId)
          ),
          and(
            eq(dm_channels.initiator_id, invitedUserId),
            eq(dm_channels.invited_user_id, (req.user as User).id)
          )
        )
      );

    if (existingChannel.length > 0) {
      return res.json(existingChannel[0]);
    }

    // Create new channel
    const newChannelResult = await db
      .insert(dm_channels)
      .values({
        initiator_id: (req.user as User).id,
        invited_user_id: invitedUserId,
      })
      .returning({
        id: dm_channels.id,
        initiator_id: dm_channels.initiator_id,
        invited_user_id: dm_channels.invited_user_id,
        created_at: dm_channels.created_at,
        order_index: dm_channels.order_index
      });

    const newChannel = newChannelResult[0];

    // Add channel subscriptions
    await db.insert(channel_subscriptions).values({ dm_channel_id: newChannel.id, user_id: (req.user as User).id });
    await db.insert(channel_subscriptions).values({ dm_channel_id: newChannel.id, user_id: invitedUserId });

    return res.status(201).json(newChannel);
  } catch (error) {
    console.error("[DM] Error creating DM channel:", error);
    return res.status(500).json({ error: "Failed to create DM channel" });
  }
});

// Fetch direct message channels for the authenticated user
router.get("/channels", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = (req.user as User).id;

  try {
    const channels = await db
      .select()
      .from(dm_channels)
      .leftJoin(channel_subscriptions, eq(dm_channels.id, channel_subscriptions.dm_channel_id))
      .where(eq(channel_subscriptions.user_id, userId));

    res.json(channels);
  } catch (error) {
    console.error("Error fetching DM channels:", error);
    res.status(500).json({ error: "Failed to fetch DM channels" });
  }
});

// Delete a direct message channel
router.delete("/channels/:id", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = (req.user as User).id;
  const { id: channelId } = req.params;

  try {
    // Remove any dm_ prefix from the channel ID
    const cleanChannelId = channelId.replace(/^dm_/, '');
    // Check if the user is part of the channel
    const isParticipant = await db
      .select()
      .from(channel_subscriptions)
      .where(
        and(
          eq(channel_subscriptions.dm_channel_id, cleanChannelId),
          eq(channel_subscriptions.user_id, userId)
        )
      );

    if (!isParticipant.length) {
      return res.status(403).json({ error: "You are not authorized to delete this channel" });
    }

    // Delete the channel
    await db.delete(dm_channels).where(eq(dm_channels.id, cleanChannelId));

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting DM channel:", error);
    res.status(500).json({ error: "Failed to delete DM channel" });
  }
});

router.get("/channels/:channelId", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { channelId } = req.params;
  if (!channelId) {
    return res.status(400).json({ error: "Channel ID is required" });
  }

  try {
    // Remove any dm_ prefix from the channel ID
    const cleanChannelId = channelId.replace(/^dm_/, '');
    const channel = await db.query.dm_channels.findFirst({
      where: eq(dm_channels.id, cleanChannelId),
      with: {
        subscriptions: true
      }
    });

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    // Check if the user is a participant in this DM channel
    const isParticipant = channel.subscriptions.some(sub => sub.user_id === (req.user as User).id);
    if (!isParticipant) {
      return res.status(403).json({ error: "Not authorized to access this channel" });
    }

    return res.json(channel);
  } catch (error) {
    console.error("[DM] Error fetching DM channel:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/channels/:channelId/messages", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { channelId } = req.params;
  if (!channelId) {
    return res.status(400).json({ error: "Channel ID is required" });
  }

  try {
    // Remove any dm_ prefix from the channel ID
    const cleanChannelId = channelId.replace(/^dm_/, '');
    
    // First check if the user is a participant in this DM channel
    const subscriptions = await db
      .select()
      .from(channel_subscriptions)
      .where(
        and(
          eq(channel_subscriptions.dm_channel_id, cleanChannelId),
          eq(channel_subscriptions.user_id, (req.user as User).id)
        )
      );

    if (subscriptions.length === 0) {
      return res.status(403).json({ error: "Not authorized to access this channel" });
    }

    // Fetch messages for this channel
    const channelMessages = await db
      .select({
        message: messages,
        author: users,
        attachments: file_attachments
      })
      .from(messages)
      .leftJoin(users, eq(messages.user_id, users.id))
      .leftJoin(file_attachments, eq(messages.id, file_attachments.message_id))
      .where(eq(messages.dm_channel_id, cleanChannelId))
      .orderBy(asc(messages.created_at));

    // Transform the results to match the expected format
    const transformedMessages = channelMessages.reduce((acc: any[], row) => {
      const existingMessage = acc.find(m => m.id === row.message.id);
      if (existingMessage) {
        if (row.attachments) {
          existingMessage.attachments.push(row.attachments);
        }
      } else {
        acc.push({
          ...row.message,
          author: row.author,
          attachments: row.attachments ? [row.attachments] : []
        });
      }
      return acc;
    }, []);

    console.log('[DM] Fetched messages:', {
      channelId: cleanChannelId,
      messageCount: transformedMessages.length,
      messages: transformedMessages.map(m => ({
        id: m.id,
        content: m.content,
        user_id: m.user_id,
        created_at: m.created_at
      }))
    });

    return res.json(transformedMessages);
  } catch (error) {
    console.error("[DM] Error fetching messages:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;