import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";

// Vercel Edge Runtime entry point
export default async function handler(request: Request) {
  try {
    // Reconstruct the original tRPC URL from rewrite query params
    const url = new URL(request.url);
    const trpcPath = url.searchParams.get("trpc_path");

    let req = request;
    if (trpcPath) {
      // Rewrite changed /api/trpc/X to /api?trpc_path=X
      // Reconstruct the original URL so tRPC can parse the path
      const newUrl = new URL(url);
      newUrl.pathname = `/api/trpc/${trpcPath}`;
      // Preserve other query params (like input=)
      newUrl.searchParams.delete("trpc_path");
      req = new Request(newUrl, request);
    }

    return await fetchRequestHandler({
      endpoint: "/api/trpc",
      req,
      router: appRouter,
      createContext,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: {
          json: {
            message: `Edge Function Error: ${err?.message || String(err)}`,
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
          },
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export const config = {
  runtime: "edge",
};
