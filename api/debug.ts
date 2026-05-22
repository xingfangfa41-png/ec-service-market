// Debug endpoint - shows request info
export default async function handler(request: Request) {
  const url = new URL(request.url);
  return new Response(
    JSON.stringify({
      url: request.url,
      pathname: url.pathname,
      search: url.search,
      trpc_path: url.searchParams.get("trpc_path"),
      headers: Object.fromEntries(request.headers.entries()),
    }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
}

export const config = {
  runtime: "edge",
};
