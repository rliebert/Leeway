import { pgTable, text, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  full_name: text("full_name"),
  avatar_url: text("avatar_url"),
  status: text("status"),
  last_active: timestamp("last_active"),
  created_at: timestamp("created_at").defaultNow(),
  role: text("role").default('user').notNull(),
  is_admin: boolean("is_admin").default(false).notNull(),
});

export const sections = pgTable("sections", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  order_index: integer("order_index").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  creator_id: uuid("creator_id").references(() => users.id),
});

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").unique().notNull(),
  description: text("description"),
  section_id: uuid("section_id").references(() => sections.id),
  creator_id: uuid("creator_id").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
  order_index: integer("order_index").notNull().default(0),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  channel_id: uuid("channel_id").references(() => channels.id, { onDelete: 'cascade' }),
  user_id: uuid("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  parent_id: uuid("parent_id").references(() => messages.id),
  pinned_by: uuid("pinned_by").references(() => users.id),
  pinned_at: timestamp("pinned_at"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  messages: many(messages),
  created_channels: many(channels, { relationName: "creator" }),
  created_sections: many(sections, { relationName: "creator" }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  channel: one(channels, {
    fields: [messages.channel_id],
    references: [channels.id],
  }),
  author: one(users, {
    fields: [messages.user_id],
    references: [users.id],
  }),
  parent: one(messages, {
    fields: [messages.parent_id],
    references: [messages.id],
  }),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  section: one(sections, {
    fields: [channels.section_id],
    references: [sections.id],
  }),
  creator: one(users, {
    fields: [channels.creator_id],
    references: [users.id],
    relationName: "creator",
  }),
  messages: many(messages),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  creator: one(users, {
    fields: [sections.creator_id],
    references: [users.id],
    relationName: "creator",
  }),
  channels: many(channels),
}));

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Message = typeof messages.$inferSelect & {
  author?: User;
  channel?: Channel;
};
export type Channel = typeof channels.$inferSelect & {
  section?: Section;
  creator?: User;
};
export type Section = typeof sections.$inferSelect & {
  creator?: User;
};