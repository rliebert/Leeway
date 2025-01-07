import { db } from "@db";
import { channels } from "./schema";

// Initialize default channels
export async function initializeDefaultChannels(userId: number) {
  try {
    // Create default channels without sections
    const defaultChannels = [
      {
        name: "general",
        description: "General discussions",
        creatorId: userId,
        position: 0,
      },
      {
        name: "announcements",
        description: "Important announcements",
        creatorId: userId,
        position: 1,
      },
    ];

    await db.insert(channels).values(defaultChannels);
  } catch (error) {
    console.error("Error initializing default channels:", error);
    throw error;
  }
}