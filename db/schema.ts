import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").unique().notNull(),
  description: text("description"),
  creatorId: integer("creator_id").references(() => users.id), 
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  channelId: integer("channel_id").references(() => channels.id).notNull(),
  parentMessageId: integer("parent_message_id").references(() => messages.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  messages: many(messages),
  channels: many(channels, { relationName: "channelCreator" }),
}));

export const channelsRelations = relations(channels, ({ many, one }) => ({
  messages: many(messages),
  creator: one(users, {
    fields: [channels.creatorId],
    references: [users.id],
    relationName: "channelCreator",
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  replies: many(messages, {
    fields: [messages.id],
    references: [messages.parentMessageId],
    relationName: "messageThread",
  }),
  parentMessage: one(messages, {
    fields: [messages.parentMessageId],
    references: [messages.id],
    relationName: "messageThread",
  }),
}));

export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertChannelSchema = createInsertSchema(channels);
export const selectChannelSchema = createSelectSchema(channels);
export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);

export type User = typeof users.$inferSelect;
export type Channel = typeof channels.$inferSelect & {
  creator?: User;
};
export type Message = typeof messages.$inferSelect & {
  user?: User;
  replies?: Message[];
  parentMessage?: Message;
};