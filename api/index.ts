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
    commentCount: Number(extract(row, 10) || 0),
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

// ===== QQ LOGIN (OAuth2.0 via QQ互联) =====

// Site base URL (for QQ redirect_uri), configurable via SITE_URL
function getSiteUrl(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "market.ec-crystal-war.com";
  return `https://${host}`;
}

// HMAC hex signature of an arbitrary string
async function hmacHex(data) {
  const key = await getCryptoKey();
  const sig = await crypto.subtle.sign("HMAC", key, strToBuf(data));
  return bufToHex(sig);
}

// Stateless OAuth state: "ts:rand:encodedFrom:sig" (10 min validity, CSRF protection)
async function makeOAuthState(from) {
  const ts = Date.now();
  const rand = crypto.randomUUID();
  const safeFrom = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
  const data = `${ts}:${rand}:${encodeURIComponent(safeFrom)}`;
  const sig = await hmacHex(data);
  return `${data}:${sig}`;
}

// Verify state; returns { ok, from } on success
async function parseOAuthState(state) {
  if (!state || typeof state !== "string") return { ok: false };
  const parts = state.split(":");
  if (parts.length !== 4) return { ok: false };
  const [ts, rand, fromEnc, sig] = parts;
  if (isNaN(Number(ts)) || Math.abs(Date.now() - Number(ts)) > 10 * 60 * 1000) return { ok: false };
  const data = `${ts}:${rand}:${fromEnc}`;
  const expect = await hmacHex(data);
  if (expect !== sig) return { ok: false };
  let from = "/";
  try { from = decodeURIComponent(fromEnc); } catch { from = "/"; }
  if (!from.startsWith("/") || from.startsWith("//")) from = "/";
  return { ok: true, from };
}

// Session token: "openid:ts:sig" (valid 30 days)
async function makeSessionToken(openid) {
  const ts = Date.now();
  const sig = await hmacHex(`${openid}:${ts}`);
  return `${openid}:${ts}:${sig}`;
}

// Returns openid if token valid, else null
async function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(":");
  if (parts.length !== 3) return null;
  const [openid, ts, sig] = parts;
  if (!openid || isNaN(Number(ts))) return null;
  if (Date.now() - Number(ts) > 30 * 24 * 3600 * 1000) return null;
  const expect = await hmacHex(`${openid}:${ts}`);
  if (expect !== sig) return null;
  return openid;
}

// QQ API may return JSONP (callback({...});) or plain JSON
function parseJsonp(text) {
  const t = String(text || "").trim();
  if (t.startsWith("callback(")) {
    const end = t.lastIndexOf(")");
    if (end > 10) {
      try { return JSON.parse(t.slice(10, end)); } catch { return {}; }
    }
    return {};
  }
  try { return JSON.parse(t); } catch { return {}; }
}

// Keep QQ nickname compatible with the site's username rules
function sanitizeUsername(name) {
  const cleaned = String(name || "")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, "")
    .slice(0, 16);
  return cleaned.length >= 2 ? cleaned : "";
}

// Ensure users table has QQ columns (idempotent, works on existing DBs)
async function ensureUserTable() {
  await executeSql(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    avatar TEXT,
    fingerprint TEXT UNIQUE,
    qq_openid TEXT,
    qq_unionid TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`);
  try { await executeSql("ALTER TABLE users ADD COLUMN qq_openid TEXT"); } catch (e) { /* already exists */ }
  try { await executeSql("ALTER TABLE users ADD COLUMN qq_unionid TEXT"); } catch (e) { /* already exists */ }
  try { await executeSql("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_qq_openid ON users(qq_openid)"); } catch (e) { /* ignore */ }
}

// Upsert a user by QQ openid; returns the username (shared by OAuth callback & SDK login)
async function upsertQQUser(openid, unionid, nickname, avatar) {
  const found = await executeSql("SELECT id, username FROM users WHERE qq_openid = ? LIMIT 1", [openid]);
  let username;
  if (found[0]?.rows?.length) {
    username = String(extract(found[0].rows[0], 1) || "");
    if (avatar) {
      await executeSql("UPDATE users SET avatar = ? WHERE qq_openid = ?", [avatar, openid]);
    }
  } else {
    username = sanitizeUsername(nickname) || "QQ用户" + Math.floor(Math.random() * 90000 + 10000);
    const nameTaken = await executeSql("SELECT id FROM users WHERE username = ? LIMIT 1", [username]);
    if (nameTaken[0]?.rows?.length) {
      username = username.slice(0, 12) + Math.floor(Math.random() * 9000 + 1000);
    }
    await executeSql(
      "INSERT INTO users (username, avatar, qq_openid, qq_unionid) VALUES (?, ?, ?, ?)",
      [username, avatar, openid, unionid]
    );
  }
  return username;
}

// Fetch QQ nickname & avatar by access_token + openid (best-effort)
async function fetchQQUserInfo(appId, accessToken, openid) {
  let nickname = "";
  let avatar = null;
  try {
    const info = await (
      await fetch(
        "https://graph.qq.com/user/get_user_info" +
          "?access_token=" + encodeURIComponent(accessToken) +
          "&oauth_consumer_key=" + encodeURIComponent(appId) +
          "&openid=" + encodeURIComponent(openid) +
          "&fmt=json"
      )
    ).json();
    if (info.ret === 0) {
      nickname = String(info.nickname || "").trim();
      avatar = info.figureurl_qq_2 || info.figureurl_qq_1 || null;
      if (avatar) avatar = String(avatar).replace(/^http:\/\//, "https://");
    }
  } catch (e) { /* non-fatal */ }
  return { nickname, avatar };
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
      // QQ session token login
      const qqToken = url.searchParams.get("qq_token");
      if (qqToken) {
        const openid = await verifySessionToken(qqToken);
        if (!openid) return json({ result: { data: null } });
        const qqResults = await executeSql("SELECT id, username, avatar, created_at FROM users WHERE qq_openid = ? LIMIT 1", [openid]);
        if (!qqResults[0]?.rows?.length) return json({ result: { data: null } });
        const qr = qqResults[0].rows[0];
        return json({ result: { data: { id: Number(extract(qr, 0) || 0), username: String(extract(qr, 1) || ""), avatar: extract(qr, 2), createdAt: formatDate(extract(qr, 3)) } } });
      }
      const fingerprint = url.searchParams.get("fingerprint");
      if (!fingerprint) return json({ result: { data: null } });
      const results = await executeSql("SELECT id, username, avatar, created_at FROM users WHERE fingerprint = ? LIMIT 1", [fingerprint]);
      if (!results[0]?.rows?.length) return json({ result: { data: null } });
      const r = results[0].rows[0];
      return json({ result: { data: { id: Number(extract(r, 0) || 0), username: String(extract(r, 1) || ""), avatar: extract(r, 2), createdAt: formatDate(extract(r, 3)) } } });
    }

    // === user.list - usernames for comment @mentions ===
    if (path === "user.list") {
      const results = await executeSql("SELECT id, username, avatar FROM users ORDER BY id DESC LIMIT 100");
      const rows = results[0]?.rows || [];
      return json({
        result: {
          data: rows.map((r) => ({
            id: Number(extract(r, 0) || 0),
            username: String(extract(r, 1) || ""),
            avatar: extract(r, 2),
          })),
        },
      });
    }

    // === auth.qq.start (GET) - Redirect to QQ authorization page ===
    if (path === "auth.qq.start") {
      const appId = process.env.QQ_APP_ID;
      const appKey = process.env.QQ_APP_KEY;
      if (!appId || !appKey) {
        return json({ error: { message: "QQ登录未配置（缺少 QQ_APP_ID / QQ_APP_KEY）" } }, 500);
      }
      const from = url.searchParams.get("from") || "/";
      const site = getSiteUrl(request);
      const redirectUri = `${site}/api/auth/qq/callback`;
      const state = await makeOAuthState(from);
      const authorizeUrl =
        "https://graph.qq.com/oauth2.0/authorize" +
        "?response_type=code" +
        "&client_id=" + encodeURIComponent(appId) +
        "&redirect_uri=" + encodeURIComponent(redirectUri) +
        "&state=" + encodeURIComponent(state) +
        "&scope=get_user_info";
      return new Response(null, { status: 302, headers: { Location: authorizeUrl } });
    }

    // === auth.qq.callback (GET) - Exchange code, create/login user, redirect back ===
    if (path === "auth.qq.callback") {
      const appId = process.env.QQ_APP_ID;
      const appKey = process.env.QQ_APP_KEY;
      const site = getSiteUrl(request);
      const redirectUri = `${site}/api/auth/qq/callback`;
      const failRedirect = (msg) => new Response(null, {
        status: 302,
        headers: { Location: `${site}/?login_error=${encodeURIComponent(msg)}` },
      });

      if (!appId || !appKey) return failRedirect("QQ登录未配置，请联系管理员");
      const code = url.searchParams.get("code");
      if (!code) return failRedirect("QQ登录失败：未获取到授权码，请重试");

      const stateRes = await parseOAuthState(url.searchParams.get("state"));
      if (!stateRes.ok) return failRedirect("QQ登录失败：state校验未通过，请重试");

      // 1. Exchange code for access_token
      const tokenText = await (
        await fetch(
          "https://graph.qq.com/oauth2.0/token" +
            "?grant_type=authorization_code" +
            "&client_id=" + encodeURIComponent(appId) +
            "&client_secret=" + encodeURIComponent(appKey) +
            "&code=" + encodeURIComponent(code) +
            "&redirect_uri=" + encodeURIComponent(redirectUri) +
            "&fmt=json"
        )
      ).text();
      const tokenData = parseJsonp(tokenText);
      const accessToken = tokenData.access_token;
      if (!accessToken) return failRedirect("QQ登录失败：" + (tokenData.error_description || "获取令牌失败"));

      // 2. Get openid (+ unionid if enabled on the app)
      const meText = await (
        await fetch("https://graph.qq.com/oauth2.0/me?access_token=" + encodeURIComponent(accessToken) + "&fmt=json")
      ).text();
      const meData = parseJsonp(meText);
      const openid = meData.openid;
      if (!openid) return failRedirect("QQ登录失败：获取QQ身份失败，请重试");
      const unionid = meData.unionid || null;

      // 3. Get QQ nickname & avatar (best-effort, failures are non-fatal)
      const { nickname, avatar } = await fetchQQUserInfo(appId, accessToken, openid);

      // 4. Upsert user by qq_openid
      await ensureUserTable();
      const username = await upsertQQUser(openid, unionid, nickname, avatar);

      // 5. Issue session token and redirect back to the app
      const token = await makeSessionToken(openid);
      const from = stateRes.from;
      return new Response(null, {
        status: 302,
        headers: { Location: `${site}/?qq_token=${encodeURIComponent(token)}&from=${encodeURIComponent(from)}` },
      });
    }

    // === auth.qq.sdk (GET) - QQ 快捷登录 SDK：前端已拿到 openid+access_token，后端验证后签发会话 ===
    if (path === "auth.qq.sdk") {
      const appId = process.env.QQ_APP_ID;
      const appKey = process.env.QQ_APP_KEY;
      if (!appId || !appKey) {
        return json({ error: { message: "QQ登录未配置（缺少 QQ_APP_ID / QQ_APP_KEY）" } }, 500);
      }
      const openid = url.searchParams.get("openid");
      const accessToken = url.searchParams.get("access_token");
      if (!openid || !accessToken) {
        return json({ error: { message: "缺少 openid 或 access_token 参数" } }, 400);
      }
      // 1. 用 access_token 调 QQ 接口验证 openid 一致（防止伪造 openid）
      const meText = await (
        await fetch("https://graph.qq.com/oauth2.0/me?access_token=" + encodeURIComponent(accessToken) + "&fmt=json")
      ).text();
      const meData = parseJsonp(meText);
      if (!meData.openid || meData.openid !== openid) {
        return json({ error: { message: "QQ身份校验失败，请重新登录" } }, 401);
      }
      const unionid = meData.unionid || null;
      // 2. 获取昵称与头像（失败不致命）
      const { nickname, avatar } = await fetchQQUserInfo(appId, accessToken, openid);
      // 3. Upsert user and issue session token
      await ensureUserTable();
      await upsertQQUser(openid, unionid, nickname, avatar);
      const token = await makeSessionToken(openid);
      const uRow = await executeSql("SELECT id, username, avatar FROM users WHERE qq_openid = ? LIMIT 1", [openid]);
      const u = uRow[0]?.rows?.[0];
      const user = u
        ? { id: Number(extract(u, 0)), username: String(extract(u, 1) || ""), avatar: extract(u, 2) || null }
        : { id: 0, username: sanitizeUsername(nickname) || "QQ用户", avatar };
      return json({ token, user });
    }

    // === auth.qq.config (GET) - 前端快捷登录 SDK 初始化需要的公开配置 ===
    if (path === "auth.qq.config") {
      const appId = process.env.QQ_APP_ID || null;
      return json({ appId });
    }

    // === listing.list ===
    if (path === "listing.list" || path === "") {
      const category = url.searchParams.get("category") || undefined;
      let results;
      if (category && category !== "all") {
        results = await executeSql(
          "SELECT id, category, title, description, server_name, price, contact_type, contact_value, created_at, image, (SELECT COUNT(*) FROM comments WHERE listing_id = listings.id) AS comment_count FROM listings WHERE category = ? ORDER BY created_at DESC LIMIT 100",
          [category]
        );
      } else {
        results = await executeSql(
          "SELECT id, category, title, description, server_name, price, contact_type, contact_value, created_at, image, (SELECT COUNT(*) FROM comments WHERE listing_id = listings.id) AS comment_count FROM listings ORDER BY created_at DESC LIMIT 100"
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
        "SELECT id, category, title, description, server_name, price, contact_type, contact_value, created_at, image, (SELECT COUNT(*) FROM comments WHERE listing_id = listings.id) AS comment_count FROM listings WHERE id = ?",
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
        avatar: extract(r, 4),
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

      // 4. Check ban status
      const banCheck = await executeSql("SELECT banned FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      if (banCheck[0]?.rows?.length) {
        const banned = val(banCheck[0].rows[0][0]);
        if (banned === 1 || banned === "1") return json({ error: { message: "你的账号已被封禁" } }, 403);
      }

      // 5. Content validation
      if (!category || !title?.trim() || title.trim().length < 3) return json({ error: { message: "标题至少3个字符" } }, 400);
      if (!description?.trim() || description.trim().length < 10) return json({ error: { message: "描述至少10个字符" } }, 400);
      if (!contactValue?.trim()) return json({ error: { message: "请填写联系方式" } }, 400);

      // 6. Per-publisher cooldown
      const pubResults = await executeSql("SELECT last_posted_at FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      const lastPosted = val(pubResults[0]?.rows?.[0]?.[0]);
      if (lastPosted) {
        const elapsed = Date.now() - new Date(lastPosted).getTime();
        if (elapsed < COOLDOWN_MS) { const mins = Math.ceil((COOLDOWN_MS - elapsed) / 60000); return json({ error: { message: `发布太频繁，请等待 ${mins} 分钟后再试` } }, 400); }
      }

      // 7. Ensure publisher exists
      const pubCheck = await executeSql("SELECT id FROM publishers WHERE fingerprint = ? LIMIT 1", [publisherId]);
      if (!pubCheck[0]?.rows?.length) await executeSql("INSERT INTO publishers (fingerprint) VALUES (?)", [publisherId]);

      // 8. Insert listing
      const imageValue = body.image || null;
      await executeSql(
        `INSERT INTO listings (category, title, description, server_name, price, contact_type, contact_value, publisher_id, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [category, title.trim(), description.trim(), serverName || null, price || null, contactType, contactValue.trim(), publisherId, imageValue]
      );

      // 9. Update timestamp + record IP
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
