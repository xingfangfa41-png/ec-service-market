// REST API - Vercel Edge Runtime entry point
import { executeSql } from "./queries/connection.js";

const COOLDOWN_MS = 30 * 60 * 1000;
const IP_COOLDOWN_MS = 30 * 60 * 1000; // IP-level cooldown fallback
const MAX_POSTS_PER_IP_PER_HOUR = 10;

// Get secret key for signing
const SECRET_KEY = process.env.APP_SECRET || "ec-market-default-secret-change-me";

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
    return null;
  }
  return cell;
}

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
    createdAt: formatDate(extract(row, 8)),
    image: extract(row, 9),
  };
}

// ===== TOKEN SIGNING (prevents forged publisherId) =====

// Encode string to Uint8Array
function strToBuf(str) {
  return new TextEncoder().encode(str);
}

// Convert ArrayBuffer to hex string
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Get or create crypto key for HMAC
let _cryptoKey = null;
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

// Sign a publisherId with HMAC-SHA256
async function signPublisherId(publisherId) {
  const key = await getCryptoKey();
  const sig = await crypto.subtle.sign("HMAC", key, strToBuf(publisherId));
  return bufToHex(sig);
}

// Verify a publisherId + signature
async function verifyPublisherId(publisherId, signature) {
  if (!publisherId || !signature) return false;
  const key = await getCryptoKey();
  try {
    const sigBuf = new Uint8Array(signature.match(/.{2}/g).map((b) => parseInt(b, 16)));
    return await crypto.subtle.verify("HMAC", key, sigBuf, strToBuf(publisherId));
  } catch {
    return false;
  }
}

// Generate a new verified publisherId
async function generatePublisherId() {
  const id = crypto.randomUUID();
  const signature = await signPublisherId(id);
  return { id, signature };
}

// ===== IP-BASED RATE LIMITING =====

// Simple in-memory IP tracking (resets on cold start, but good enough)
const ipPostCounts = new Map(); // ip -> { count, resetTime }
const ipLastPost = new Map(); // ip -> timestamp

function getClientIP(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Validate human verification token (returns null if valid, error message if invalid)

function checkIPLimit(ip) {
  const now = Date.now();

  // Check per-hour limit
  const entry = ipPostCounts.get(ip);
  if (entry) {
    if (now < entry.resetTime) {
      if (entry.count >= MAX_POSTS_PER_IP_PER_HOUR) {
        return { allowed: false, reason: "IP发帖频率过高，请稍后再试" };
      }
    } else {
      // Reset window
      ipPostCounts.set(ip, { count: 0, resetTime: now + 3600000 });
    }
  } else {
    ipPostCounts.set(ip, { count: 0, resetTime: now + 3600000 });
  }

  // Check cooldown
  const lastPost = ipLastPost.get(ip);
  if (lastPost && now - lastPost < IP_COOLDOWN_MS) {
    const remaining = Math.ceil((IP_COOLDOWN_MS - (now - lastPost)) / 1000);
    return { allowed: false, reason: `IP冷却中，剩余 ${Math.ceil(remaining / 60)} 分钟` };
  }

  return { allowed: true };
}

function recordIPPost(ip) {
  const entry = ipPostCounts.get(ip);
  if (entry) entry.count++;
  ipLastPost.set(ip, Date.now());
}

// ===== CLOUDINARY UPLOAD =====

async function uploadToCloudinary(base64Image) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
  const apiKey = process.env.CLOUDINARY_API_KEY || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary config missing");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signatureStr = `timestamp=${timestamp}${apiSecret}`;

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-1", encoder.encode(signatureStr));
  const signature = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
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

// ===== MAIN HANDLER =====

export default async function handler(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  const clientIP = getClientIP(request);

  try {
    // === verify.human (POST) - Issue a human-verified token after interactive challenge ===
    if (path === "verify.human" && request.method === "POST") {
      const body = await request.json();
      const { challenge } = body;
      if (!challenge || typeof challenge !== "string" || challenge.length < 10) {
        return json({ error: { message: "无效验证" } }, 400);
      }
      
      // Sign the challenge with server secret + timestamp
      // Token format: "challenge:timestamp:signature"
      // timestamp prevents replay attacks (token expires after 10 min)
      const now = Date.now();
      const tokenData = `${challenge}:${now}`;
      const key = await getCryptoKey();
      const sig = await crypto.subtle.sign("HMAC", key, strToBuf(tokenData));
      const signature = bufToHex(sig);
      
      const token = `${challenge}:${now}:${signature}`;
      
      // Token valid for 10 minutes
      return json({ result: { data: { token, expiresAt: now + 10 * 60 * 1000 } } });
    }

    // === listing.getToken (GET) - Generate a new signed publisherId ===
    if (path === "listing.getToken") {
      const { id, signature } = await generatePublisherId();
      return json({ result: { data: { publisherId: id, signature } } });
    }

    // === user.register (POST) ===
    if (path === "user.register" && request.method === "POST") {
      const body = await request.json();
      const { username, avatar, fingerprint } = body;

      // Validation
      if (!username?.trim()) return json({ error: { message: "请输入用户名" } }, 400);
      const trimmed = username.trim();
      if (trimmed.length < 2 || trimmed.length > 16) return json({ error: { message: "用户名2-16个字符" } }, 400);
      if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(trimmed)) return json({ error: { message: "用户名只能包含中文、英文、数字和下划线" } }, 400);

      // Create users table if not exists
      await executeSql(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        avatar TEXT,
        fingerprint TEXT UNIQUE,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`);

      // Check username uniqueness
      const check = await executeSql("SELECT id FROM users WHERE username = ? LIMIT 1", [trimmed]);
      if (check[0]?.rows?.length) return json({ error: { message: "用户名已被使用" } }, 400);

      // Check if fingerprint already registered
      if (fingerprint) {
        const fpCheck = await executeSql("SELECT id FROM users WHERE fingerprint = ? LIMIT 1", [fingerprint]);
        if (fpCheck[0]?.rows?.length) return json({ error: { message: "你已注册过账号" } }, 400);
      }

      // Insert user
      await executeSql("INSERT INTO users (username, avatar, fingerprint) VALUES (?, ?, ?)", [trimmed, avatar || null, fingerprint || null]);
      return json({ result: { data: { success: true, username: trimmed } } });
    }

    // === user.checkUsername ===
    if (path === "user.checkUsername") {
      const username = url.searchParams.get("username")?.trim();
      if (!username) return json({ result: { data: { available: false } } });
      // Ensure users table exists
      await executeSql("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, avatar TEXT, fingerprint TEXT UNIQUE, created_at INTEGER DEFAULT (strftime('%s', 'now')))");
      const check = await executeSql("SELECT id FROM users WHERE username = ? LIMIT 1", [username]);
      return json({ result: { data: { available: !check[0]?.rows?.length } } });
    }

    // === user.getMe ===
    if (path === "user.getMe") {
      const fingerprint = url.searchParams.get("fingerprint");
      if (!fingerprint) return json({ result: { data: null } });
      const results = await executeSql("SELECT id, username, avatar, created_at FROM users WHERE fingerprint = ? LIMIT 1", [fingerprint]);
      if (!results[0]?.rows?.length) return json({ result: { data: null } });
      const r = results[0].rows[0];
      return json({ result: { data: { id: Number(extract(r, 0) || 0), username: String(extract(r, 1) || ""), avatar: extract(r, 2), createdAt: formatDate(extract(r, 3)) } } });
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
      const rows = results[0]?.rows || [];
      return json({ result: { data: rows.map(toListing) } });
    }

    // === listing.getById ===
    if (path === "listing.getById") {
      const id = Number(url.searchParams.get("id"));
      if (!id) return json({ error: "Missing id" }, 400);
      const results = await executeSql(
        "SELECT id, category, title, description, server_name, price, contact_type, contact_value, created_at, image FROM listings WHERE id = ?",
        [id]
      );
      const rows = results[0]?.rows || [];
      return json({ result: { data: rows.length ? toListing(rows[0]) : null } });
    }

    // === listing.checkOwner (POST) ===
    if (path === "listing.checkOwner" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId, signature } = body;
      // Verify signature
      const sigValid = await verifyPublisherId(publisherId, signature);
      if (!sigValid) return json({ result: { data: { isOwner: false } } });

      if (!id || !publisherId) return json({ result: { data: { isOwner: false } } });
      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ result: { data: { isOwner: false } } });
      const isOwner = val(results[0].rows[0][0]) === publisherId;
      return json({ result: { data: { isOwner } } });
    }

    // === listing.cooldownStatus ===
    if (path === "listing.cooldownStatus") {
      const publisherId = url.searchParams.get("publisherId");
      const signature = url.searchParams.get("signature");
      if (!publisherId) return json({ error: "Missing publisherId" }, 400);

      // Verify signature
      const sigValid = await verifyPublisherId(publisherId, signature);
      if (!sigValid) return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });

      const results = await executeSql("SELECT last_posted_at FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      const lastPosted = val(results[0]?.rows?.[0]?.[0]);
      if (!lastPosted) return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });
      const elapsed = Date.now() - new Date(lastPosted).getTime();
      if (elapsed < COOLDOWN_MS) return json({ result: { data: { inCooldown: true, remainingSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000) } } });
      return json({ result: { data: { inCooldown: false, remainingSeconds: 0 } } });
    }

    // === upload.image (POST) ===
    if (path === "upload.image" && request.method === "POST") {
      const body = await request.json();
      const { image } = body;
      if (!image) return json({ error: { message: "No image provided" } }, 400);
      if (!image.startsWith("data:image/")) return json({ error: { message: "Invalid image format" } }, 400);
      try {
        const imageUrl = await uploadToCloudinary(image);
        return json({ result: { data: { url: imageUrl } } });
      } catch (err) {
        return json({ error: { message: err?.message || "Upload failed" } }, 500);
      }
    }

    // === comment.create (POST) ===
    if (path === "comment.create" && request.method === "POST") {
      const body = await request.json();
      const { listingId, content, nickname, color } = body;


      // 2. Content validation
      if (!listingId || !content?.trim()) return json({ error: { message: "评论内容不能为空" } }, 400);
      if (content.length > 500) return json({ error: { message: "评论最多500字" } }, 400);

      // 3. Ensure comments table exists
      await executeSql(`CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        nickname TEXT,
        color TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`);

      // 4. Insert comment
      await executeSql(
        `INSERT INTO comments (listing_id, content, nickname, color) VALUES (?, ?, ?, ?)`,
        [listingId, content.trim(), nickname || null, color || null]
      );

      return json({ result: { data: { success: true } } });
    }

    // === comment.list ===
    if (path === "comment.list") {
      const listingId = Number(url.searchParams.get("listingId"));
      if (!listingId) return json({ error: "Missing listingId" }, 400);

      const results = await executeSql(
        `SELECT id, listing_id, content, nickname, color, created_at FROM comments 
         WHERE listing_id = ? ORDER BY created_at DESC LIMIT 50`,
        [listingId]
      );
      const rows = results[0]?.rows || [];
      const comments = rows.map((r) => ({
        id: Number(extract(r, 0) || 0),
        listingId: Number(extract(r, 1) || 0),
        content: String(extract(r, 2) || ""),
        nickname: extract(r, 3),
        color: extract(r, 4),
        createdAt: formatDate(extract(r, 5)),
      }));
      return json({ result: { data: comments } });
    }

    // === listing.create (POST) ===
    if (path === "listing.create" && request.method === "POST") {
      const body = await request.json();
      const { category, title, description, serverName, price, contactType, contactValue, publisherId, signature } = body;


      // 2. Validate publisherId signature (prevents forged publisherId)
      const sigValid = await verifyPublisherId(publisherId, signature);
      if (!sigValid) return json({ error: { message: "非法请求，请刷新页面后重试" } }, 403);

      // 3. IP-level rate limiting
      const ipLimit = checkIPLimit(clientIP);
      if (!ipLimit.allowed) return json({ error: { message: ipLimit.reason } }, 429);

      // 4. Content validation
      if (!category || !title?.trim() || title.trim().length < 3) return json({ error: { message: "标题至少3个字符" } }, 400);
      if (!description?.trim() || description.trim().length < 10) return json({ error: { message: "描述至少10个字符" } }, 400);
      if (!contactValue?.trim()) return json({ error: { message: "请填写联系方式" } }, 400);

      // 5. Per-publisher cooldown
      const pubResults = await executeSql("SELECT last_posted_at FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      const lastPosted = val(pubResults[0]?.rows?.[0]?.[0]);
      if (lastPosted) {
        const elapsed = Date.now() - new Date(lastPosted).getTime();
        if (elapsed < COOLDOWN_MS) { const mins = Math.ceil((COOLDOWN_MS - elapsed) / 60000); return json({ error: { message: `发布太频繁，请等待 ${mins} 分钟后再试` } }, 400); }
      }

      // 6. Ensure publisher exists
      const pubCheck = await executeSql("SELECT id FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      if (!pubCheck[0]?.rows?.length) await executeSql("INSERT INTO publishers (fingerprint) VALUES (?)", [publisherId]);

      // 7. Insert listing
      const imageValue = body.image || null;
      await executeSql(
        `INSERT INTO listings (category, title, description, server_name, price, contact_type, contact_value, publisher_id, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [category, title.trim(), description.trim(), serverName || null, price || null, contactType, contactValue.trim(), publisherId, imageValue]
      );

      // 7. Update timestamp + record IP
      await executeSql("UPDATE publishers SET last_posted_at = ? WHERE fingerprint = ?", [new Date().toISOString(), publisherId]);
      recordIPPost(clientIP);

      return json({ result: { data: { success: true } } });
    }

    // === listing.delete (POST) ===
    if (path === "listing.delete" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId, signature } = body;

      // Verify human token

      // Verify signature
      const sigValid = await verifyPublisherId(publisherId, signature);
      if (!sigValid) return json({ error: { message: "非法请求" } }, 403);

      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ error: { message: "帖子不存在" } }, 400);
      if (val(results[0].rows[0][0]) !== publisherId) return json({ error: { message: "无权删除" } }, 400);
      await executeSql("DELETE FROM listings WHERE id = ?", [id]);
      return json({ result: { data: { success: true } } });
    }

    // === listing.update (POST) ===
    if (path === "listing.update" && request.method === "POST") {
      const body = await request.json();
      const { id, publisherId, signature, category, title, description, serverName, price, contactType, contactValue } = body;

      // Verify human token

      // Verify signature
      const sigValid = await verifyPublisherId(publisherId, signature);
      if (!sigValid) return json({ error: { message: "非法请求" } }, 403);

      const results = await executeSql("SELECT publisher_id FROM listings WHERE id = ?", [id]);
      if (!results[0]?.rows?.length) return json({ error: { message: "帖子不存在" } }, 400);
      if (val(results[0].rows[0][0]) !== publisherId) return json({ error: { message: "无权编辑" } }, 400);
      await executeSql(
        `UPDATE listings SET category = ?, title = ?, description = ?, server_name = ?, price = ?, contact_type = ?, contact_value = ? WHERE id = ?`,
        [category, title.trim(), description.trim(), serverName || null, price || null, contactType, contactValue.trim(), id]
      );
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
