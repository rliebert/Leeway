import { Router } from "express";
import { db } from "@db";
import { eq, and, or } from "drizzle-orm";
import { users, type User, dm_channels, channel_subscriptions } from "@db/schema";

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
router.get("/dm/channels/:userId", async (req, res) => {
  if (!req.user) return res.status(401).send("Not authenticated");

  const { userId } = req.params;
  if (!userId) return res.status(400).send("User ID is required");

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
    return res.status(404).send("No existing DM channel found");
  } catch (error) {
    console.error("[DM] Error checking DM channel:", error);
    return res.status(500).send("Internal server error");
  }
});

// Add endpoint to create a new DM channel
router.post("/dm/channels", async (req, res) => {
  if (!req.user) {
    console.log("[DM] User not authenticated");
    return res.status(401).send("Not authenticated");
  }

  const { invitedUserId } = req.body;
  if (!invitedUserId || typeof invitedUserId !== "string") {
    console.log("[DM] Invalid invitedUserId:", invitedUserId);
    return res.status(400).send("Invited user ID is required");
  }

  console.log("[DM] Processing request for users:", { 
    currentUser: (req.user as User).id, 
    targetUser: invitedUserId 
  });

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
      console.log("[DM] Found existing channel:", existingChannel[0]);
      return res.status(200).json(existingChannel[0]);
    }

    // Create new channel if none exists
    console.log("[DM] Creating new channel between users:", { 
      currentUser: (req.user as User).id, 
      targetUser: invitedUserId 
    });
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
    console.log("[DM] Created channel:", newChannel);

    // Add channel subscriptions
    console.log("[DM] Adding subscriptions for users");
    await db.insert(channel_subscriptions).values({ dm_channel_id: newChannel.id, user_id: (req.user as User).id });
    await db.insert(channel_subscriptions).values({ dm_channel_id: newChannel.id, user_id: invitedUserId });
    console.log("[DM] Added subscriptions successfully");

    return res.status(201).json(newChannel);
  } catch (error) {
    console.error("[DM] Error handling DM channel:", error);
    return res.status(500).send("Internal server error");
  }
});

// Fetch direct message channels for the authenticated user
router.get("/channels", async (req, res) => {
  if (!req.user) {
    return res.status(401).send("Not authenticated");
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
    res.status(500).send("Internal server error");
  }
});

// Delete a direct message channel
router.delete("/channels/:id", async (req, res) => {
  if (!req.user) {
    return res.status(401).send("Not authenticated");
  }

  const userId = (req.user as User).id;
  const { id: channelId } = req.params;

  try {
    // Check if the user is part of the channel
    const isParticipant = await db
      .select()
      .from(channel_subscriptions)
      .where(
        and(
          eq(channel_subscriptions.dm_channel_id, channelId),
          eq(channel_subscriptions.user_id, userId)
        )
      );

    if (!isParticipant.length) {
      return res.status(403).send("You are not authorized to delete this channel");
    }

    // Delete the channel
    await db.delete(dm_channels).where(eq(dm_channels.id, channelId));

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting DM channel:", error);
    res.status(500).send("Internal server error");
  }
});

// Commenting out duplicate endpoint - DM operations should use /dm/channels instead
/*
router.post("/channels", async (req, res) => {
  if (!req.user) {
    console.log("User not authenticated");
    return res.status(401).send("Not authenticated");
  }

  const { invitedUserId } = req.body;
  const initiatorId = (req.user as User).id;

  console.log("Incoming request to create DM channel:", { initiatorId, invitedUserId });

  if (!invitedUserId) {
    console.log("Invited user ID is missing");
    return res.status(400).send("Invited user ID is required");
  }

  try {
    // First check if channel exists
    const existingChannel = await db
      .select()
      .from(dm_channels)
      .where(
        or(
          and(
            eq(dm_channels.initiator_id, initiatorId),
            eq(dm_channels.invited_user_id, invitedUserId)
          ),
          and(
            eq(dm_channels.initiator_id, invitedUserId),
            eq(dm_channels.invited_user_id, initiatorId)
          )
        )
      );

    if (existingChannel.length > 0) {
      console.log("Found existing DM channel:", existingChannel[0]);
      return res.status(200).json(existingChannel[0]);
    }

    // Create new channel if none exists
    console.log("Creating new DM channel with:", { initiator_id: initiatorId, invited_user_id: invitedUserId });
    const newChannelResult = await db
      .insert(dm_channels)
      .values({ initiator_id: initiatorId, invited_user_id: invitedUserId })
      .returning({ id: dm_channels.id });
    const newChannel = newChannelResult[0];
    console.log("New DM channel created with ID:", newChannel.id);

    // Add channel subscriptions
    console.log("Adding initiator to channel subscriptions:", { dm_channel_id: newChannel.id, user_id: initiatorId });
    await db.insert(channel_subscriptions).values({ dm_channel_id: newChannel.id, user_id: initiatorId });

    console.log("Adding invited user to channel subscriptions:", { dm_channel_id: newChannel.id, user_id: invitedUserId });
    await db.insert(channel_subscriptions).values({ dm_channel_id: newChannel.id, user_id: invitedUserId });

    res.status(201).json(newChannel);
  } catch (error) {
    console.error("Error handling DM channel:", error);
    res.status(500).send("Internal server error");
  }
});
*/

export default router;

