// Direct Turso HTTP API - works in Vercel Edge Runtime
const TURSO_URL = process.env.TURSO_DATABASE_URL || "";
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || "";

// Convert libsql:// to https:// for HTTP API
function getHttpUrl(url: string): string {
  if (url.startsWith("libsql://")) {
    return url.replace("libsql://", "https://");
  }
  if (url.startsWith("http://")) {
    return url.replace("http://", "https://");
  }
  return url;
}

interface TursoResult {
  columns: string[];
  rows: (string | number | null)[][];
}

export async function executeSql(sql: string, args: (string | number | null)[] = []): Promise<TursoResult[]> {
  const url = getHttpUrl(TURSO_URL) + "/v2/pipeline";

  const requests: any[] = [
    {
      type: "execute",
      stmt: {
        sql,
        args: args.map((arg) =>
          arg === null
            ? { type: "null" }
            : typeof arg === "number"
            ? { type: "integer", value: String(arg) }
            : { type: "text", value: arg }
        ),
      },
    },
    { type: "close" },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TURSO_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Turso API error: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const results: TursoResult[] = [];

  for (const result of data.results || []) {
    if (result.type === "ok") {
      const response = result.response;
      if (response?.type === "execute") {
        const resultSet = response.result;
        if (resultSet) {
          results.push({
            columns: resultSet.cols?.map((c: any) => c.name) || [],
            rows: resultSet.rows?.map((r: any) => r) || [],
          });
        }
      }
    } else if (result.type === "error") {
      throw new Error(`SQL error: ${result.error?.message || "unknown"}`);
    }
  }

  return results;
}

// Parse Turso row into object
export function parseRow(columns: string[], row: (string | number | null)[]): Record<string, any> {
  const obj: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    // Convert snake_case to camelCase for schema compatibility
    const camelKey = col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    obj[camelKey] = row[i];
  }
  return obj;
}
