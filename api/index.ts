// REST API - Vercel Edge Runtime entry point
import { executeSql } from "./queries/connection.js";

const COOLDOWN_MS = 30 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function val(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "object") {
    if (cell.type === "null") return null;
    if (cell.value !== undefined) return cell.value;
    // Handle Turso column name format
    return null;
  }
  return cell;
}

// Extract raw value from Turso result row (handles {type, value} format)
function extract(row, index) {
  if (!row || index >= row.length) return null;
  const cell = row[index];
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "object") {
    if (cell.type === "null") return null;
    if (cell.value !== undefined) return cell.value;
  }
  return cell;
}

function formatDate(ts) {
  if (!ts) return null;
  const num = Number(ts);
  if (!isNaN(num) && num > 1000000000) {
    return new Date(num * 1000).toISOString();
  }
  return ts;
}

function toListing(row) {
  return {
    id: Number(extract(row, 0) || 0),
    category: String(extract(row, 1) || ""),
    title: String(extract(row, 2) || ""),
    description: String(extract(row, 3) || ""),
    serverName: extract(row, 4),
    price: extract(row, 5),
    contactType: String(extract(row, 6) || ""),
    contactValue: String(extract(row, 7) || ""),
    publisherId: String(extract(row, 8) || ""),
    createdAt: formatDate(extract(row, 9)),
    image: extract(row, 10),
  };
}

// Only select needed columns, exclude large fields from list view
const LIST_COLUMNS = "*";


// Upload image to Cloudinary
async function uploadToCloudinary(base64Image: string): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
  const apiKey = process.env.CLOUDINARY_API_KEY || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary config missing");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signatureStr = `timestamp=${timestamp}${apiSecret}`;

  // SHA1 hash
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-1", encoder.encode(signatureStr));
  const signature = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  const formData = new FormData();
  formData.append("file", base64Image);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary upload failed: ${err.slice(0, 200)}`);
  }

  const result = await res.json();
  return result.secure_url;
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
          `SELECT ${LIST_COLUMNS} FROM listings WHERE category = ? ORDER BY created_at DESC LIMIT 100`,
          [category]
        );
      } else {
        results = await executeSql(`SELECT ${LIST_COLUMNS} FROM listings ORDER BY created_at DESC LIMIT 100`);
      }
      const rows = results[0]?.rows || [];
      return json({ result: { data: rows.map(toListing) } });
    }

    if (path === "listing.getById") {
      const id = Number(url.searchParams.get("id"));
      if (!id) return json({ error: "Missing id" }, 400);
      const results = await executeSql("SELECT * FROM listings WHERE id = ?", [id]);
      const rows = results[0]?.rows || [];
      return json({ result: { data: rows.length ? toListing(rows[0]) : null } });
    }

    if (path === "listing.checkPublisher") {
      const publisherId = url.searchParams.get("publisherId");
      if (!publisherId) return json({ error: "Missing publisherId" }, 400);
      const results = await executeSql("SELECT * FROM listings WHERE publisher_id = ? LIMIT 1", [publisherId]);
      const rows = results[0]?.rows || [];
      return json({ result: { data: rows.length ? toListing(rows[0]) : null } });
    }

    if (path === "listing.cooldownStatus") {
      const publisherId = url.searchParams.get("publisherId");
      if (!publisherId) return json({ error: "Missing publisherId" }, 400);
      const results = await executeSql("SELECT last_posted_at FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      const lastPosted = val(results[0]?.rows?.[0]?.[0]);
      if (!lastPosted) return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });
      const elapsed = Date.now() - new Date(lastPosted).getTime();
      if (elapsed < COOLDOWN_MS) return json({ result: { data: { inCooldown: true, remainingSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000) } } });
      return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });
    }

    // --- upload.image (POST) ---
    if (path === "upload.image" && request.method === "POST") {
      const body = await request.json();
      const { image } = body;
      if (!image) return json({ error: { message: "No image provided" } }, 400);
      if (!image.startsWith("data:image/")) return json({ error: { message: "Invalid image format" } }, 400);
      try {
        const url = await uploadToCloudinary(image);
        return json({ result: { data: { url } } });
      } catch (err) {
        return json({ error: { message: err?.message || "Upload failed" } }, 500);
      }
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
      const lastPosted = val(pubResults[0]?.rows?.[0]?.[0]);
      if (lastPosted) {
        const elapsed = Date.now() - new Date(lastPosted).getTime();
        if (elapsed < COOLDOWN_MS) { const mins = Math.ceil((COOLDOWN_MS - elapsed) / 60000); return json({ error: { message: `发布太频繁，请等待 ${mins} 分钟后再试` } }, 400); }
      }
      const pubCheck = await executeSql("SELECT id FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      if (!pubCheck[0]?.rows?.length) await executeSql("INSERT INTO publishers (fingerprint) VALUES (?)", [publisherId]);
      const imageValue = body.image || null;
      await executeSql(`INSERT INTO listings (category, title, description, server_name, price, contact_type, contact_value, publisher_id, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [category, title.trim(), description.trim(), serverName || null, price || null, contactType, contactValue.trim(), publisherId, imageValue]);
      await executeSql("UPDATE publishers SET last_posted_at = ? WHERE fingerprint = ?", [new Date().toISOString(), publisherId]);
      return json({ result: { data: { success: true } } });
    }

    if (path === "listing.delete" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId } = body;
      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ error: { message: "帖子不存在" } }, 400);
      if (val(results[0].rows[0][0]) !== publisherId) return json({ error: { message: "无权删除" } }, 400);
      await executeSql("DELETE FROM listings WHERE id = ?", [id]);
      return json({ result: { data: { success: true } } });
    }

    if (path === "listing.update" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId, category, title, description, serverName, price, contactType, contactValue } = body;
      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ error: { message: "帖子不存在" } }, 400);
      if (val(results[0].rows[0][0]) !== publisherId) return json({ error: { message: "无权编辑" } }, 400);
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
