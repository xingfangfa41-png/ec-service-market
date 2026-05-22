import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../router.js";
import { createContext } from "../context.js";

export default async function handler(request: Request) {
  const start = Date.now();
  try {
    const result = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: request,
      router: appRouter,
      createContext,
    });
    return result;
  } catch (err: any) {
    const elapsed = Date.now() - start;
    return new Response(
      JSON.stringify({
        error: {
          json: {
            message: `Error after ${elapsed}ms: ${err?.message || String(err)}`,
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
