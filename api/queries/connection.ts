import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../db/schema.js";

const fullSchema = { ...schema };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

export function getDb() {
  if (!instance) {
    const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:local.db";
    const authToken = process.env.TURSO_AUTH_TOKEN;

    const client = createClient({
      url,
      ...(authToken ? { authToken } : {}),
    });

    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
