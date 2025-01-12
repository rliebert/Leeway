import { db } from "@db";
import { sql } from "drizzle-orm";
import { file_attachments } from "@db/schema";

// Create file_attachments table if it doesn't exist
await db.execute(sql`
  CREATE TABLE IF NOT EXISTS file_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);
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
  console.log("🎬 Seeding database with awesome movie references...");

  // Create movie-themed users
  console.log("Creating users...");
  const movieUsers = await Promise.all([
    db.insert(users).values({
      username: "marty.mcfly",
      password: await hashPassword("hoverboard88"),
      email: "marty@bttf.com",
      status: "⚡ 1.21 GIGAWATTS!",
    }).returning(),
    db.insert(users).values({
      username: "t800",
      password: await hashPassword("illbeback"),
      email: "terminator@skynet.com",
      status: "🤖 Hasta la vista, baby",
    }).returning(),
    db.insert(users).values({
      username: "john.mcclane",
      password: await hashPassword("yippikayay"),
      email: "john@nakatomi.com",
      status: "🏢 Welcome to the party, pal!",
    }).returning(),
  ]);

  console.log("Creating movie-themed sections...");
  const movieSections = await Promise.all([
    db.insert(sections).values({
      name: "80s Classics",
      creator_id: movieUsers[0][0].id,
      order_index: 0,
    }).returning(),
    db.insert(sections).values({
      name: "90s Blockbusters",
      creator_id: movieUsers[1][0].id,
      order_index: 1,
    }).returning(),
  ]);

  console.log("Creating movie-themed channels...");
  const movieChannels = await Promise.all([
    // 80s channels
    db.insert(channels).values({
      name: "time-travelers",
      description: "Great Scott! A place to discuss time travel paradoxes",
      creator_id: movieUsers[0][0].id,
      section_id: movieSections[0][0].id,
      order_index: 0,
    }).returning(),
    db.insert(channels).values({
      name: "ghost-busters",
      description: "Who ya gonna call?",
      creator_id: movieUsers[0][0].id,
      section_id: movieSections[0][0].id,
      order_index: 1,
    }).returning(),
    // 90s channels
    db.insert(channels).values({
      name: "jurassic-lab",
      description: "Life, uh, finds a way",
      creator_id: movieUsers[1][0].id,
      section_id: movieSections[1][0].id,
      order_index: 0,
    }).returning(),
    db.insert(channels).values({
      name: "matrix",
      description: "There is no spoon",
      creator_id: movieUsers[2][0].id,
      section_id: movieSections[1][0].id,
      order_index: 1,
    }).returning(),
  ]);

  console.log("Creating nostalgic messages...");
  const now = new Date();
  await Promise.all([
    // Time travelers channel
    db.insert(messages).values({
      content: "🚗 Anyone seen my DeLorean? I parked it here in 2025... or was it 1955? 🤔",
      user_id: movieUsers[0][0].id,
      channel_id: movieChannels[0][0].id,
      created_at: new Date(now.getTime() - 7200000),
    }),
    db.insert(messages).values({
      content: "Doc, are you telling me you built a time machine... out of a DeLorean? 🚘⚡",
      user_id: movieUsers[1][0].id,
      channel_id: movieChannels[0][0].id,
      created_at: new Date(now.getTime() - 3600000),
    }),
    // Ghostbusters channel
    db.insert(messages).values({
      content: "👻 I ain't afraid of no ghost! But that Stay Puft Marshmallow Man... different story 🍡",
      user_id: movieUsers[2][0].id,
      channel_id: movieChannels[1][0].id,
      created_at: new Date(now.getTime() - 1800000),
    }),
    // Jurassic Lab channel
    db.insert(messages).values({
      content: "🦖 Clever girl... Just lost another security guard. HR is getting really annoyed 😅",
      user_id: movieUsers[1][0].id,
      channel_id: movieChannels[2][0].id,
      created_at: new Date(now.getTime() - 900000),
    }),
    // Matrix channel
    db.insert(messages).values({
      content: "💊 Red pill or blue pill? Also, anyone know a good chiropractor? All this dodging bullets is killing my back 🤸‍♂️",
      user_id: movieUsers[2][0].id,
      channel_id: movieChannels[3][0].id,
      created_at: new Date(now.getTime() - 300000),
    }),
  ]);

  console.log("✨ Seeding complete! Time circuits functioning normally.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Great Scott! Seeding failed:", err);
  process.exit(1);
});