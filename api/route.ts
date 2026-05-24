// REST API endpoint - mapped via vercel.json rewrite
import { executeSql } from "./queries/connection.js";

const COOLDOWN_MS = 30 * 60 * 1000;
const IP_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_POSTS_PER_IP_PER_HOUR = 10;

const SECRET_KEY = process.env.APP_SECRET || "ec-market-default-secret-change-me";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function strToBuf(str: string) {
  return new TextEncoder().encode(str);
}

function bufToHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

let _cryptoKey: CryptoKey | null = null;
async function getCryptoKey() {
  if (_cryptoKey) return _cryptoKey;
  _cryptoKey = await crypto.subtle.importKey(
    "raw",
    strToBuf(SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return _cryptoKey;
}

async function signPublisherId(publisherId: string) {
  const key = await getCryptoKey();
  const sig = await crypto.subtle.sign("HMAC", key, strToBuf(publisherId));
  return bufToHex(sig);
}

async function verifyPublisherId(publisherId: string, signature: string) {
  if (!publisherId || !signature) return false;
  const key = await getCryptoKey();
  try {
    const sigBuf = new Uint8Array(signature.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    return await crypto.subtle.verify("HMAC", key, sigBuf, strToBuf(publisherId));
  } catch {
    return false;
  }
}

async function generatePublisherId() {
  const id = crypto.randomUUID();
  const signature = await signPublisherId(id);
  return { id, signature };
}

// IP-based rate limiting
const ipPostCounts = new Map<string, { count: number; resetTime: number }>();
const ipLastPost = new Map<string, number>();

function getClientIP(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkIPLimit(ip: string) {
  const now = Date.now();
  const entry = ipPostCounts.get(ip);
  if (entry) {
    if (now < entry.resetTime) {
      if (entry.count >= MAX_POSTS_PER_IP_PER_HOUR) {
        return { allowed: false, reason: "IP发帖频率过高，请稍后再试" };
      }
    } else {
      ipPostCounts.set(ip, { count: 0, resetTime: now + 3600000 });
    }
  } else {
    ipPostCounts.set(ip, { count: 0, resetTime: now + 3600000 });
  }
  const lastPost = ipLastPost.get(ip);
  if (lastPost && now - lastPost < IP_COOLDOWN_MS) {
    const remaining = Math.ceil((IP_COOLDOWN_MS - (now - lastPost)) / 60000);
    return { allowed: false, reason: `IP冷却中，剩余 ${remaining} 分钟` };
  }
  return { allowed: true };
}

function recordIPPost(ip: string) {
  const entry = ipPostCounts.get(ip);
  if (entry) entry.count++;
  ipLastPost.set(ip, Date.now());
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  let path = url.pathname.replace("/api/trpc/", "").replace("/api/trpc", "").replace("/api", "");
  if (!path) path = url.searchParams.get("path") || "";
  const clientIP = getClientIP(request);

  try {
    // === listing.getToken ===
    if (path === "listing.getToken") {
      const { id, signature } = await generatePublisherId();
      return json({ result: { data: { publisherId: id, signature } } });
    }

    // === listing.list ===
    if (path === "listing.list" || path === "") {
      const category = url.searchParams.get("category") || undefined;
      let results;
      if (category && category !== "all") {
        results = await executeSql(
          "SELECT id, category, title, description, server_name, price, contact_type, contact_value, created_at, image FROM listings WHERE category = ? ORDER BY created_at DESC LIMIT 100",
          [category]
        );
      } else {
        results = await executeSql(
          "SELECT id, category, title, description, server_name, price, contact_type, contact_value, created_at, image FROM listings ORDER BY created_at DESC LIMIT 100"
        );
      }
      const { rows } = results[0] || { columns: [], rows: [] };
      const listings = rows.map((r: any) => ({
        id: Number(r[0]), category: String(r[1] || ""), title: String(r[2] || ""),
        description: String(r[3] || ""), serverName: r[4] || null, price: r[5] || null,
        contactType: String(r[6] || ""), contactValue: String(r[7] || ""),
        image: r[10] || null, createdAt: r[9] || null,
      }));
      return json({ result: { data: listings } });
    }

    // === listing.getById ===
    if (path === "listing.getById") {
      const id = Number(url.searchParams.get("id"));
      if (!id) return json({ error: "Missing id" }, 400);
      const results = await executeSql(
        "SELECT id, category, title, description, server_name, price, contact_type, contact_value, created_at, image FROM listings WHERE id = ?",
        [id]
      );
      if (!results[0]?.rows?.length) return json({ result: { data: null } });
      const r = results[0].rows[0];
      return json({ result: { data: { id: Number(r[0]), category: String(r[1] || ""), title: String(r[2] || ""), description: String(r[3] || ""), serverName: r[4] || null, price: r[5] || null, contactType: String(r[6] || ""), contactValue: String(r[7] || ""), createdAt: r[9] || null, image: r[10] || null } } });
    }

    // === listing.checkOwner (POST) ===
    if (path === "listing.checkOwner" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId, signature } = body;
      const sigValid = await verifyPublisherId(publisherId, signature);
      if (!sigValid) return json({ result: { data: { isOwner: false } } });
      if (!id || !publisherId) return json({ result: { data: { isOwner: false } } });
      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ result: { data: { isOwner: false } } });
      const isOwner = results[0].rows[0][0] === publisherId;
      return json({ result: { data: { isOwner } } });
    }

    // === listing.cooldownStatus ===
    if (path === "listing.cooldownStatus") {
      const publisherId = url.searchParams.get("publisherId");
      const signature = url.searchParams.get("signature");
      if (!publisherId) return json({ error: "Missing publisherId" }, 400);
      const sigValid = await verifyPublisherId(publisherId, signature || "");
      if (!sigValid) return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });
      const results = await executeSql("SELECT last_posted_at FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      const lastPosted = results[0]?.rows?.[0]?.[0];
      if (!lastPosted) return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });
      const elapsed = Date.now() - new Date(lastPosted).getTime();
      if (elapsed < COOLDOWN_MS) return json({ result: { data: { inCooldown: true, remainingSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000) } } });
      return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });
    }

    // === listing.create (POST) ===
    if (path === "listing.create" && request.method === "POST") {
      const body = await request.json();
      const { category, title, description, serverName, price, contactType, contactValue, publisherId, signature } = body;

      // Verify signature
      const sigValid = await verifyPublisherId(publisherId, signature);
      if (!sigValid) return json({ error: { message: "非法请求，请刷新页面后重试" } }, 403);

      // IP rate limiting
      const ipLimit = checkIPLimit(clientIP);
      if (!ipLimit.allowed) return json({ error: { message: ipLimit.reason } }, 429);

      // Content validation
      if (!category || !title?.trim() || title.trim().length < 3) return json({ error: { message: "标题至少3个字符" } }, 400);
      if (!description?.trim() || description.trim().length < 10) return json({ error: { message: "描述至少10个字符" } }, 400);
      if (!contactValue?.trim()) return json({ error: { message: "请填写联系方式" } }, 400);

      // Cooldown check
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
      recordIPPost(clientIP);
      return json({ result: { data: { success: true } } });
    }

    // === listing.delete (POST) ===
    if (path === "listing.delete" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId, signature } = body;
      const sigValid = await verifyPublisherId(publisherId, signature);
      if (!sigValid) return json({ error: { message: "非法请求" } }, 403);
      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ error: { message: "帖子不存在" } }, 400);
      if (results[0].rows[0][0] !== publisherId) return json({ error: { message: "无权删除" } }, 400);
      await executeSql("DELETE FROM listings WHERE id = ?", [id]);
      return json({ result: { data: { success: true } } });
    }

    // === listing.update (POST) ===
    if (path === "listing.update" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId, signature, category, title, description, serverName, price, contactType, contactValue } = body;
      const sigValid = await verifyPublisherId(publisherId, signature);
      if (!sigValid) return json({ error: { message: "非法请求" } }, 403);
      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ error: { message: "帖子不存在" } }, 400);
      if (results[0].rows[0][0] !== publisherId) return json({ error: { message: "无权编辑" } }, 400);
      await executeSql(`UPDATE listings SET category = ?, title = ?, description = ?, server_name = ?, price = ?, contact_type = ?, contact_value = ? WHERE id = ?`, [category, title.trim(), description.trim(), serverName || null, price || null, contactType, contactValue.trim(), id]);
      return json({ result: { data: { success: true } } });
    }

    return json({ error: `Unknown path: ${path}` }, 404);
  } catch (err: any) {
    return json({ error: { message: err?.message || String(err) } }, 500);
  }
}

export const config = {
  runtime: "edge",
};
