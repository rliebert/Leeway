import { db } from "@db";
import { users, channels, sections, messages } from "@db/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  console.log("🌱 Seeding database...");

  // Create test users
  console.log("Creating users...");
  const testUsers = await Promise.all([
    db.insert(users).values({
      username: "alice",
      password: await hashPassword("password123"),
      email: "alice@example.com",
    }).returning(),
    db.insert(users).values({
      username: "bob",
      password: await hashPassword("password123"),
      email: "bob@example.com",
    }).returning(),
    db.insert(users).values({
      username: "charlie",
      password: await hashPassword("password123"),
      email: "charlie@example.com",
    }).returning(),
  ]);

  console.log("Creating sections...");
  const testSections = await Promise.all([
    db.insert(sections).values({
      name: "Important",
      creator_id: testUsers[0][0].id,
      order_index: 0,
    }).returning(),
    db.insert(sections).values({
      name: "Projects",
      creator_id: testUsers[0][0].id,
      order_index: 1,
    }).returning(),
  ]);

  console.log("Creating channels...");
  const testChannels = await Promise.all([
    // Channels in Important section
    db.insert(channels).values({
      name: "announcements",
      description: "Important announcements for the team",
      creator_id: testUsers[0][0].id,
      section_id: testSections[0][0].id,
      order_index: 0,
    }).returning(),
    db.insert(channels).values({
      name: "general",
      description: "General discussion",
      creator_id: testUsers[0][0].id,
      section_id: testSections[0][0].id,
      order_index: 1,
    }).returning(),
    // Channels in Projects section
    db.insert(channels).values({
      name: "project-alpha",
      description: "Discussion for Project Alpha",
      creator_id: testUsers[1][0].id,
      section_id: testSections[1][0].id,
      order_index: 0,
    }).returning(),
    db.insert(channels).values({
      name: "project-beta",
      description: "Discussion for Project Beta",
      creator_id: testUsers[1][0].id,
      section_id: testSections[1][0].id,
      order_index: 1,
    }).returning(),
    // Unsectioned channel
    db.insert(channels).values({
      name: "random",
      description: "Random discussions",
      creator_id: testUsers[2][0].id,
      section_id: null,
      order_index: 0,
    }).returning(),
  ]);

  console.log("Creating messages...");
  const now = new Date();
  await Promise.all([
    // Messages in announcements
    db.insert(messages).values({
      content: "Welcome to the team chat! 👋",
      user_id: testUsers[0][0].id,
      channel_id: testChannels[0][0].id,
      created_at: new Date(now.getTime() - 7200000), // 2 hours ago
    }),
    db.insert(messages).values({
      content: "Please remember to keep discussions in their appropriate channels!",
      user_id: testUsers[0][0].id,
      channel_id: testChannels[0][0].id,
      created_at: new Date(now.getTime() - 3600000), // 1 hour ago
    }),
    // Messages in general
    db.insert(messages).values({
      content: "Hey everyone! How's it going?",
      user_id: testUsers[1][0].id,
      channel_id: testChannels[1][0].id,
      created_at: new Date(now.getTime() - 1800000), // 30 mins ago
    }),
    db.insert(messages).values({
      content: "Great! Working on the new features 🚀",
      user_id: testUsers[2][0].id,
      channel_id: testChannels[1][0].id,
      created_at: new Date(now.getTime() - 900000), // 15 mins ago
    }),
    // Messages in project channels
    db.insert(messages).values({
      content: "Project Alpha kickoff meeting tomorrow at 10 AM!",
      user_id: testUsers[1][0].id,
      channel_id: testChannels[2][0].id,
      created_at: new Date(now.getTime() - 7200000),
    }),
    db.insert(messages).values({
      content: "Just pushed the latest changes to the beta branch",
      user_id: testUsers[2][0].id,
      channel_id: testChannels[3][0].id,
      created_at: new Date(now.getTime() - 3600000),
    }),
  ]);

  console.log("✅ Seeding complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});