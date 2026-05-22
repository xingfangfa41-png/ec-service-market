import { getDb } from "./connection.js";
import { listings, publishers } from "../../db/schema.js";
import { eq, desc } from "drizzle-orm";

export async function findAllListings(category?: string) {
  const db = getDb();
  if (category && category !== "all") {
    return db.select().from(listings).where(eq(listings.category, category)).orderBy(desc(listings.createdAt));
  }
  return db.select().from(listings).orderBy(desc(listings.createdAt));
}

export async function findListingById(id: number) {
  const db = getDb();
  const results = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  return results[0] || null;
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
}) {
  const db = getDb();
  const result = await db.insert(listings).values(data).returning();
  return result[0];
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
) {
  const db = getDb();
  const result = await db
    .update(listings)
    .set({
      category: data.category,
      title: data.title,
      description: data.description,
      serverName: data.serverName || null,
      price: data.price || null,
      contactType: data.contactType,
      contactValue: data.contactValue,
    })
    .where(eq(listings.id, id))
    .returning();
  return result[0] || null;
}

export async function deleteListing(id: number) {
  const db = getDb();
  await db.delete(listings).where(eq(listings.id, id));
}

export async function findPublisherByFingerprint(fingerprint: string) {
  const db = getDb();
  const results = await db.select().from(publishers).where(eq(publishers.fingerprint, fingerprint)).limit(1);
  return results[0] || null;
}

export async function createPublisher(fingerprint: string) {
  const db = getDb();
  const result = await db.insert(publishers).values({ fingerprint }).returning();
  return result[0];
}

export async function findListingByPublisherId(publisherId: string) {
  const db = getDb();
  const results = await db.select().from(listings).where(eq(listings.publisherId, publisherId)).limit(1);
  return results[0] || null;
}

/** Check if publisher is in cooldown (30 minutes) */
export async function checkPublisherCooldown(fingerprint: string): Promise<{ inCooldown: boolean; remainingSeconds: number }> {
  const db = getDb();
  const results = await db.select().from(publishers).where(eq(publishers.fingerprint, fingerprint)).limit(1);
  const publisher = results[0];

  if (!publisher || !publisher.lastPostedAt) {
    return { inCooldown: false, remainingSeconds: 0 };
  }

  const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();
  const lastPost = new Date(publisher.lastPostedAt).getTime();
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
export async function updatePublisherLastPosted(fingerprint: string) {
  const db = getDb();
  await db.update(publishers)
    .set({ lastPostedAt: new Date() })
    .where(eq(publishers.fingerprint, fingerprint));
}
