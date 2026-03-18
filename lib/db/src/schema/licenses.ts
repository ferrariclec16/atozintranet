import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

export const licensesTable = pgTable("licenses", {
  id: serial("id").primaryKey(),
  licenseKey: varchar("license_key", { length: 255 }).unique().notNull(),
  userName: varchar("user_name", { length: 255 }).notNull(),
  hwid: varchar("hwid", { length: 500 }).default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const loginLogsTable = pgTable("login_logs", {
  id: serial("id").primaryKey(),
  time: varchar("time", { length: 50 }).notNull(),
  licenseKey: varchar("license_key", { length: 255 }).notNull(),
  userName: varchar("user_name", { length: 255 }).notNull(),
  hwid: varchar("hwid", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const securityLogsTable = pgTable("security_logs", {
  id: serial("id").primaryKey(),
  time: varchar("time", { length: 50 }).notNull(),
  licenseKey: varchar("license_key", { length: 255 }).notNull(),
  userName: varchar("user_name", { length: 255 }).notNull(),
  registeredHwid: varchar("registered_hwid", { length: 500 }).notNull(),
  attemptedHwid: varchar("attempted_hwid", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type License = typeof licensesTable.$inferSelect;
export type NewLicense = typeof licensesTable.$inferInsert;
export type LoginLog = typeof loginLogsTable.$inferSelect;
export type SecurityLog = typeof securityLogsTable.$inferSelect;
