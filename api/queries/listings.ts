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
