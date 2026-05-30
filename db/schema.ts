import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

// Categories: 陪聊, 找搭子, 公会宣传, 卖号
export const listings = sqliteTable("listings", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  category: text("category", { length: 50 }).notNull(),
  title: text("title", { length: 200 }).notNull(),
  description: text("description").notNull(),
  serverName: text("server_name", { length: 200 }),
  price: text("price", { length: 100 }),
  contactType: text("contact_type", { length: 20 }).notNull(), // "wechat" | "qq"
  contactValue: text("contact_value", { length: 200 }).notNull(),
  publisherId: text("publisher_id", { length: 255 }).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const publishers = sqliteTable("publishers", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  fingerprint: text("fingerprint", { length: 255 }).notNull().unique(),
  lastPostedAt: integer("last_posted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;
export type Publisher = typeof publishers.$inferSelect;
export type InsertPublisher = typeof publishers.$inferInsert;
