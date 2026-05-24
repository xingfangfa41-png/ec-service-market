import { executeSql, parseRow } from "./connection.js";

export interface Listing {
  id: number;
  category: string;
  title: string;
  description: string;
  serverName: string | null;
  price: string | null;
  contactType: string;
  contactValue: string;
  publisherId: string;
  image: string | null;
  createdAt: string | null;
}

export interface Publisher {
  id: number;
  fingerprint: string;
  lastPostedAt: string | null;
  createdAt: string | null;
}

function toListing(row: Record<string, any>): Listing {
  return {
    id: Number(row.id ?? row.ID),
    category: String(row.category ?? row.CATEGORY ?? ""),
    title: String(row.title ?? row.TITLE ?? ""),
    description: String(row.description ?? row.DESCRIPTION ?? ""),
    serverName: row.serverName ?? row.server_name ?? null,
    price: row.price ?? null,
    contactType: String(row.contactType ?? row.contact_type ?? ""),
    contactValue: String(row.contactValue ?? row.contact_value ?? ""),
    publisherId: String(row.publisherId ?? row.publisher_id ?? ""),
    image: row.image ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
  };
}

export async function findAllListings(category?: string): Promise<Listing[]> {
  let results;
  const limit = 100;
  if (category && category !== "all") {
    results = await executeSql(
      "SELECT * FROM listings WHERE category = ? ORDER BY created_at DESC LIMIT ?",
      [category, limit]
    );
  } else {
    results = await executeSql(
      "SELECT * FROM listings ORDER BY created_at DESC LIMIT ?",
      [limit]
    );
  }

  if (!results.length) return [];
  const { columns, rows } = results[0];
  return rows.map((r) => toListing(parseRow(columns, r)));
}

export async function findListingById(id: number): Promise<Listing | null> {
  const results = await executeSql("SELECT * FROM listings WHERE id = ?", [id]);
  if (!results.length || !results[0].rows.length) return null;
  return toListing(parseRow(results[0].columns, results[0].rows[0]));
}

export async function createListing(data: {
  category: string;
  title: string;
  description: string;
  serverName?: string;
  price?: string;
  contactType: string;
  contactValue: string;
  publisherId: string;
}): Promise<Listing> {
  const results = await executeSql(
    `INSERT INTO listings (category, title, description, server_name, price, contact_type, contact_value, publisher_id, image)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
     RETURNING *`,
    [
      data.category,
      data.title,
      data.description,
      data.serverName || null,
      data.price || null,
      data.contactType,
      data.contactValue,
      data.publisherId,
    ]
  );

  if (!results.length || !results[0].rows.length) {
    // Fallback: get the last inserted row
    const all = await executeSql("SELECT * FROM listings WHERE publisher_id = ? ORDER BY id DESC LIMIT 1", [data.publisherId]);
    if (all.length && all[0].rows.length) {
      return toListing(parseRow(all[0].columns, all[0].rows[0]));
    }
    throw new Error("Failed to create listing");
  }

  return toListing(parseRow(results[0].columns, results[0].rows[0]));
}

export async function updateListing(
  id: number,
  data: {
    category: string;
    title: string;
    description: string;
    serverName?: string;
    price?: string;
    contactType: string;
    contactValue: string;
  }
): Promise<Listing | null> {
  await executeSql(
    `UPDATE listings SET category = ?, title = ?, description = ?, server_name = ?, price = ?,
     contact_type = ?, contact_value = ? WHERE id = ?`,
    [
      data.category,
      data.title,
      data.description,
      data.serverName || null,
      data.price || null,
      data.contactType,
      data.contactValue,
      id,
    ]
  );
  return findListingById(id);
}

export async function deleteListing(id: number): Promise<void> {
  await executeSql("DELETE FROM listings WHERE id = ?", [id]);
}

export async function findPublisherByFingerprint(fingerprint: string): Promise<Publisher | null> {
  const results = await executeSql("SELECT * FROM publishers WHERE fingerprint = ? LIMIT 1", [fingerprint]);
  if (!results.length || !results[0].rows.length) return null;
  const row = parseRow(results[0].columns, results[0].rows[0]);
  return {
    id: Number(row.id),
    fingerprint: String(row.fingerprint ?? ""),
    lastPostedAt: row.lastPostedAt ?? row.last_posted_at ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
  };
}

export async function createPublisher(fingerprint: string): Promise<Publisher> {
  const results = await executeSql(
    "INSERT INTO publishers (fingerprint) VALUES (?) RETURNING *",
    [fingerprint]
  );
  if (results.length && results[0].rows.length) {
    const row = parseRow(results[0].columns, results[0].rows[0]);
    return {
      id: Number(row.id),
      fingerprint: String(row.fingerprint ?? ""),
      lastPostedAt: row.lastPostedAt ?? row.last_posted_at ?? null,
      createdAt: row.createdAt ?? row.created_at ?? null,
    };
  }
  // Fallback
  return findPublisherByFingerprint(fingerprint) || { id: 0, fingerprint, lastPostedAt: null, createdAt: null };
}

/** Check if publisher is in cooldown (30 minutes) */
export async function checkPublisherCooldown(fingerprint: string): Promise<{ inCooldown: boolean; remainingSeconds: number }> {
  const results = await executeSql("SELECT last_posted_at FROM publishers WHERE fingerprint = ? LIMIT 1", [fingerprint]);
  if (!results.length || !results[0].rows.length) {
    return { inCooldown: false, remainingSeconds: 0 };
  }

  const lastPosted = results[0].rows[0][0];
  if (!lastPosted) return { inCooldown: false, remainingSeconds: 0 };

  const COOLDOWN_MS = 30 * 60 * 1000;
  const now = Date.now();
  const lastPost = new Date(lastPosted).getTime();
  const elapsed = now - lastPost;

  if (elapsed < COOLDOWN_MS) {
    return {
      inCooldown: true,
      remainingSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000),
    };
  }

  return { inCooldown: false, remainingSeconds: 0 };
}

/** Update publisher's last posted timestamp */
export async function updatePublisherLastPosted(fingerprint: string): Promise<void> {
  await executeSql(
    "UPDATE publishers SET last_posted_at = ? WHERE fingerprint = ?",
    [new Date().toISOString(), fingerprint]
  );
}
