// REST API - Vercel Edge Runtime entry point
import { executeSql } from "./queries/connection.js";

const COOLDOWN_MS = 30 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";

  try {
    if (path === "listing.list" || path === "") {
      const category = url.searchParams.get("category") || undefined;
      let results;
      if (category && category !== "all") {
        results = await executeSql(
          "SELECT * FROM listings WHERE category = ? ORDER BY created_at DESC LIMIT 100",
          [category]
        );
      } else {
        results = await executeSql("SELECT * FROM listings ORDER BY created_at DESC LIMIT 100");
      }
      const { columns, rows } = results[0] || { columns: [], rows: [] };
      const listings = rows.map((r) => ({
        id: Number(r[0]), category: String(r[1] || ""), title: String(r[2] || ""),
        description: String(r[3] || ""), serverName: r[4] || null, price: r[5] || null,
        contactType: String(r[6] || ""), contactValue: String(r[7] || ""),
        publisherId: String(r[8] || ""), image: r[10] || null, createdAt: r[9] || null,
      }));
      return json({ result: { data: listings } });
    }

    if (path === "listing.getById") {
      const id = Number(url.searchParams.get("id"));
      if (!id) return json({ error: "Missing id" }, 400);
      const results = await executeSql("SELECT * FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ result: { data: null } });
      const r = results[0].rows[0];
      return json({ result: { data: { id: Number(r[0]), category: String(r[1] || ""), title: String(r[2] || ""), description: String(r[3] || ""), serverName: r[4] || null, price: r[5] || null, contactType: String(r[6] || ""), contactValue: String(r[7] || ""), publisherId: String(r[8] || ""), createdAt: r[9] || null, image: r[10] || null } } });
    }

    if (path === "listing.checkPublisher") {
      const publisherId = url.searchParams.get("publisherId");
      if (!publisherId) return json({ error: "Missing publisherId" }, 400);
      const results = await executeSql("SELECT * FROM listings WHERE publisher_id = ? LIMIT 1", [publisherId]);
      if (!results[0]?.rows?.length) return json({ result: { data: null } });
      const r = results[0].rows[0];
      return json({ result: { data: { id: Number(r[0]), category: String(r[1] || ""), title: String(r[2] || ""), description: String(r[3] || ""), serverName: r[4] || null, price: r[5] || null, contactType: String(r[6] || ""), contactValue: String(r[7] || ""), publisherId: String(r[8] || ""), createdAt: r[9] || null, image: r[10] || null } } });
    }

    if (path === "listing.cooldownStatus") {
      const publisherId = url.searchParams.get("publisherId");
      if (!publisherId) return json({ error: "Missing publisherId" }, 400);
      const results = await executeSql("SELECT last_posted_at FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      const lastPosted = results[0]?.rows?.[0]?.[0];
      if (!lastPosted) return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });
      const elapsed = Date.now() - new Date(lastPosted).getTime();
      if (elapsed < COOLDOWN_MS) return json({ result: { data: { inCooldown: true, remainingSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000) } } });
      return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });
    }

    if (path === "listing.create" && request.method === "POST") {
      const body = await request.json();
      const { category, title, description, serverName, price, contactType, contactValue, publisherId } = body;
      if (!category || !title?.trim() || title.trim().length < 3) return json({ error: { message: "标题至少3个字符" } }, 400);
      if (!description?.trim() || description.trim().length < 10) return json({ error: { message: "描述至少10个字符" } }, 400);
      if (!contactValue?.trim()) return json({ error: { message: "请填写联系方式" } }, 400);
      const existing = await executeSql("SELECT id FROM listings WHERE publisher_id = ? LIMIT 1", [publisherId]);
      if (existing[0]?.rows?.length) return json({ error: { message: "你已经发布过帖子了，每个人只能发布一个" } }, 400);
      const pubResults = await executeSql("SELECT last_posted_at FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      const lastPosted = pubResults[0]?.rows?.[0]?.[0];
      if (lastPosted) {
        const elapsed = Date.now() - new Date(lastPosted).getTime();
        if (elapsed < COOLDOWN_MS) { const mins = Math.ceil((COOLDOWN_MS - elapsed) / 60000); return json({ error: { message: `发布太频繁，请等待 ${mins} 分钟后再试` } }, 400); }
      }
      const pubCheck = await executeSql("SELECT id FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      if (!pubCheck[0]?.rows?.length) await executeSql("INSERT INTO publishers (fingerprint) VALUES (?)", [publisherId]);
      await executeSql(`INSERT INTO listings (category, title, description, server_name, price, contact_type, contact_value, publisher_id, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`, [category, title.trim(), description.trim(), serverName || null, price || null, contactType, contactValue.trim(), publisherId]);
      await executeSql("UPDATE publishers SET last_posted_at = ? WHERE fingerprint = ?", [new Date().toISOString(), publisherId]);
      return json({ result: { data: { success: true } } });
    }

    if (path === "listing.delete" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId } = body;
      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ error: { message: "帖子不存在" } }, 400);
      if (results[0].rows[0][0] !== publisherId) return json({ error: { message: "无权删除" } }, 400);
      await executeSql("DELETE FROM listings WHERE id = ?", [id]);
      return json({ result: { data: { success: true } } });
    }

    if (path === "listing.update" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId, category, title, description, serverName, price, contactType, contactValue } = body;
      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ error: { message: "帖子不存在" } }, 400);
      if (results[0].rows[0][0] !== publisherId) return json({ error: { message: "无权编辑" } }, 400);
      await executeSql(`UPDATE listings SET category = ?, title = ?, description = ?, server_name = ?, price = ?, contact_type = ?, contact_value = ? WHERE id = ?`, [category, title.trim(), description.trim(), serverName || null, price || null, contactType, contactValue.trim(), id]);
      return json({ result: { data: { success: true } } });
    }

    return json({ error: `Unknown path: ${path}` }, 404);

  } catch (err) {
    return json({ error: { message: err?.message || String(err) } }, 500);
  }
}

export const config = {
  runtime: "edge",
};
