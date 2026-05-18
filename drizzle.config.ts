import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("TURSO_DATABASE_URL or DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: connectionString,
    ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}),
  },
});
