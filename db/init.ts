import { db } from "@db";
import { sections, channels } from "./schema";

// Initialize default channels and sections
export async function initializeDefaultChannels(userId: number) {
  try {
    // Create Main section
    const [section] = await db
      .insert(sections)
      .values({
        name: "Default",
        creatorId: userId,
      })
      .returning();

    // Create default channels
    const defaultChannels = [
      {
        name: "general",
        description: "General discussions",
        creatorId: userId,
        sectionId: section.id,
        position: 0,
      },
      {
        name: "announcements",
        description: "Important announcements",
        creatorId: userId,
        sectionId: section.id,
        position: 1,
      },
      {
        name: "help",
        description: "Get help and support",
        creatorId: userId,
        sectionId: section.id,
        position: 2,
      },
    ];

    await db.insert(channels).values(defaultChannels);

    return section;
  } catch (error) {
    console.error("Error initializing default channels:", error);
    throw error;
  }
}