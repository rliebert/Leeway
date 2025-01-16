import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  jsonb,
  varchar,
  json,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  username: text("username").unique().notNull(),
  password: text("password").notNull(),
  full_name: text("full_name"),
  avatar_url: text("avatar_url"),
  status: text("status"),
  last_active: timestamp("last_active"),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  role: text("role").default("user").notNull(),
  is_admin: boolean("is_admin").default(false).notNull(),
});

export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

export const sections = pgTable("sections", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  order_index: integer("order_index").notNull(),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  creator_id: uuid("creator_id").references(() => users.id),
});

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").unique().notNull(),
  description: text("description"),
  section_id: uuid("section_id").references(() => sections.id),
  creator_id: uuid("creator_id").references(() => users.id),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  order_index: integer("order_index").notNull().default(0),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  channel_id: uuid("channel_id")
    .references(() => channels.id, {
      onDelete: "cascade",
    })
    .notNull(),
  user_id: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  pinned_by: uuid("pinned_by").references(() => users.id),
  pinned_at: timestamp("pinned_at"),
  parent_id: uuid("parent_id"), // Remove circular reference
});

export const message_embeddings = pgTable("message_embeddings", {
  id: uuid("id").defaultRandom().primaryKey(),
  message_id: uuid("message_id")
    .references(() => messages.id, { onDelete: "cascade" })
    .notNull(),
  user_id: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  embedding: text("embedding").notNull(),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const file_attachments = pgTable("file_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  message_id: uuid("message_id")
    .references(() => messages.id, { onDelete: "cascade" })
    .notNull(),
  file_url: text("file_url").notNull(),
  file_name: text("file_name").notNull(),
  file_type: text("file_type").notNull(),
  file_size: integer("file_size").notNull(),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const dm_channels = pgTable("dm_channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").unique().notNull(),
  description: text("description"),
  creator_id: uuid("creator_id").references(() => users.id),
  created_at: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  order_index: integer("order_index").notNull().default(0),
});

export const channel_subscriptions = pgTable("channel_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").references(() => users.id).notNull(),
  channel_id: uuid("channel_id").references(() => channels.id),
  dm_channel_id: uuid("dm_channel_id").references(() => dm_channels.id),
  subscribed_at: timestamp("subscribed_at").default(sql`CURRENT_TIMESTAMP`),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  messages: many(messages),
  created_channels: many(channels, { relationName: "creator" }),
  created_sections: many(sections, { relationName: "creator" }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
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
  attachments: many(file_attachments),
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

export const fileAttachmentsRelations = relations(
  file_attachments,
  ({ one }) => ({
    message: one(messages, {
      fields: [file_attachments.message_id],
      references: [messages.id],
    }),
  }),
);

// Export schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type FileAttachment = typeof file_attachments.$inferSelect;
export type Message = typeof messages.$inferSelect & {
  author?: User;
  attachments?: FileAttachment[];
};
export type Channel = typeof channels.$inferSelect & {
  section?: typeof sections.$inferSelect;
  creator?: User;
};
export type Section = typeof sections.$inferSelect & {
  creator?: User;
  channels?: Channel[];
};
