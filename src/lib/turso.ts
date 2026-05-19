import { createClient } from "@libsql/client/web";

const TURSO_URL = "https://ec-market-xingfangfa41-png.aws-ap-northeast-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJnaWQiOiJjNTFjZWU4OS04ZGI0LTQzOTAtODY0Yi03YzdjNmZhM2I1ZjQiLCJpYXQiOjE3NzkwOTc0MzksInJpZCI6IjdkOTRiNjM1LTc0YTktNGUwOC1hMzk5LWFiMDZkNjAwY2FkNSJ9.PfRu2bo3GE7yhYMkCUpgoqiDyJ1Pnt25anZrCPA2g1LiyLyCGbvu831EKmy5iN23X3hdok-YT8rH3iZkiMHoDg";

export const db = createClient({
  url: TURSO_URL,
  authToken: TURSO_TOKEN,
});

export interface Listing {
  id: number;
  category: string;
  title: string;
  description: string;
  server_name: string | null;
  price: string | null;
  contact_type: string;
  contact_value: string;
  publisher_id: string;
  created_at: string;
  image: string | null;
}

export async function getAllListings(category?: string): Promise<Listing[]> {
  if (category && category !== "all") {
    const result = await db.execute({
      sql: "SELECT * FROM listings WHERE category = ? ORDER BY created_at DESC",
      args: [category],
    });
    return result.rows.map(row => ({
      id: row.id as number,
      category: row.category as string,
      title: row.title as string,
      description: row.description as string,
      server_name: row.server_name as string | null,
      price: row.price as string | null,
      contact_type: row.contact_type as string,
      contact_value: row.contact_value as string,
      publisher_id: row.publisher_id as string,
      created_at: row.created_at as string,
      image: row.image as string | null,
    }));
  }
  const result = await db.execute("SELECT * FROM listings ORDER BY created_at DESC");
  return result.rows.map(row => ({
    id: row.id as number,
    category: row.category as string,
    title: row.title as string,
    description: row.description as string,
    server_name: row.server_name as string | null,
    price: row.price as string | null,
    contact_type: row.contact_type as string,
    contact_value: row.contact_value as string,
    publisher_id: row.publisher_id as string,
    created_at: row.created_at as string,
    image: row.image as string | null,
  }));
}

export async function getListingById(id: number): Promise<Listing | null> {
  const result = await db.execute({
    sql: "SELECT * FROM listings WHERE id = ?",
    args: [id],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    category: row.category as string,
    title: row.title as string,
    description: row.description as string,
    server_name: row.server_name as string | null,
    price: row.price as string | null,
    contact_type: row.contact_type as string,
    contact_value: row.contact_value as string,
    publisher_id: row.publisher_id as string,
    created_at: row.created_at as string,
    image: row.image as string | null,
  };
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
  image?: string;
}): Promise<void> {
  await db.execute({
    sql: `INSERT INTO listings (category, title, description, server_name, price, contact_type, contact_value, publisher_id, image) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      data.category,
      data.title,
      data.description,
      data.serverName || null,
      data.price || null,
      data.contactType,
      data.contactValue,
      data.publisherId,
      data.image || null,
    ],
  });
}

export async function updateListing(id: number, data: {
  category: string;
  title: string;
  description: string;
  serverName?: string;
  price?: string;
  contactType: string;
  contactValue: string;
  image?: string;
}): Promise<void> {
  await db.execute({
    sql: `UPDATE listings SET category = ?, title = ?, description = ?, server_name = ?, price = ?, contact_type = ?, contact_value = ?, image = ? WHERE id = ?`,
    args: [
      data.category,
      data.title,
      data.description,
      data.serverName || null,
      data.price || null,
      data.contactType,
      data.contactValue,
      data.image || null,
      id,
    ],
  });
}

export async function deleteListing(id: number): Promise<void> {
  await db.execute({
    sql: "DELETE FROM listings WHERE id = ?",
    args: [id],
  });
}

export async function checkPublisherListing(publisherId: string): Promise<Listing | null> {
  const result = await db.execute({
    sql: "SELECT * FROM listings WHERE publisher_id = ? LIMIT 1",
    args: [publisherId],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    category: row.category as string,
    title: row.title as string,
    description: row.description as string,
    server_name: row.server_name as string | null,
    price: row.price as string | null,
    contact_type: row.contact_type as string,
    contact_value: row.contact_value as string,
    publisher_id: row.publisher_id as string,
    created_at: row.created_at as string,
    image: row.image as string | null,
  };
}
