import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";

// Vercel Edge Runtime entry point
export default async function handler(request: Request) {
  try {
    return await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: request,
      router: appRouter,
      createContext,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: {
          json: {
            message: `Edge Function Error: ${err?.message || String(err)}\nStack: ${err?.stack || "no stack"}`,
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
