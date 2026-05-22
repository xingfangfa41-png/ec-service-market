// Simple health check endpoint
export default async function handler(request: Request) {
  try {
    // Test direct Turso HTTP API call
    const TURSO_URL = process.env.TURSO_DATABASE_URL || "";
    const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || "";

    // Convert libsql:// to https://
    const httpUrl = TURSO_URL.replace("libsql://", "https://") + "/v2/pipeline";

    const res = await fetch(httpUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TURSO_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: "SELECT COUNT(*) as count FROM listings" } },
          { type: "close" },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(`Turso API error: ${res.status} ${text.slice(0, 200)}`, { status: 500 });
    }

    const data = await res.json();
    let count = "unknown";
    for (const r of data.results || []) {
      if (r.type === "ok" && r.response?.result?.rows?.length) {
        count = r.response.result.rows[0][0]?.value || "0";
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dbUrl: httpUrl,
        hasToken: !!TURSO_TOKEN,
        listingsCount: count,
        envKeys: Object.keys(process.env).filter(k => !k.includes("SECRET") && !k.includes("TOKEN") && !k.includes("KEY")),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || String(err),
        stack: err?.stack?.slice(0, 500),
      }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
}

export const config = {
  runtime: "edge",
};
