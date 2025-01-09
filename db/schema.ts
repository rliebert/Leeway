import { pgTable, text, timestamp, uuid, serial, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// Users table - matches Supabase auth.users structure
export const users = pgTable("users", {
  id: text("id").primaryKey(),  // Match Supabase auth.users.id
  username: text("username").unique().notNull(),
  avatar_url: text("avatar_url"),
  last_active_at: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const sections = pgTable("sections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  creatorId: text("creator_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
  description: text("description"),
  creatorId: text("creator_id").references(() => users.id),
  sectionId: integer("section_id").references(() => sections.id),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  channelId: integer("channel_id").references(() => channels.id).notNull(),
  parentMessageId: integer("parent_message_id").references(() => messages.id),
  attachments: jsonb("attachments").$type<{
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    url: string;
  }[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const directMessageChannels = pgTable("direct_message_channels", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const directMessageParticipants = pgTable("direct_message_participants", {
  channelId: integer("channel_id").references(() => directMessageChannels.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  channelId: integer("channel_id").references(() => directMessageChannels.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Schema types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type DirectMessageChannel = typeof directMessageChannels.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;

// Zod schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertChannelSchema = createInsertSchema(channels);
export const selectChannelSchema = createSelectSchema(channels);
export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);
export const insertSectionSchema = createInsertSchema(sections);
export const selectSectionSchema = createSelectSchema(sections);
export const insertDirectMessageChannelSchema = createInsertSchema(directMessageChannels);
export const selectDirectMessageChannelSchema = createSelectSchema(directMessageChannels);
export const insertDirectMessageParticipantSchema = createInsertSchema(directMessageParticipants);
export const selectDirectMessageParticipantSchema = createSelectSchema(directMessageParticipants);
export const insertDirectMessageSchema = createInsertSchema(directMessages);
export const selectDirectMessageSchema = createSelectSchema(directMessages);