// Temporary: create database indexes
import { executeSql } from "./queries/connection.js";

export default async function handler(request: Request) {
  try {
    const results = [];
    for (const sql of [
      "CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_listings_category_created_at ON listings(category, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS idx_listings_publisher_id ON listings(publisher_id)"
    ]) {
      try {
        await executeSql(sql);
        results.push({ sql: sql.slice(0, 40), ok: true });
      } catch (e: any) {
        results.push({ sql: sql.slice(0, 40), ok: false, error: e?.message });
      }
    }
    return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export const config = { runtime: "edge" };
