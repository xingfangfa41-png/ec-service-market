import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import type { AppRouter } from "../../api/router";

// tRPC client for React
export const trpc = createTRPCReact<AppRouter>();

export function getTrpcClient() {
  // Determine API URL - works in both dev and production
  const getBaseUrl = () => {
    if (typeof window !== "undefined") {
      // Browser: use relative path
      return "";
    }
    // SSR/Node: need absolute URL (not used in this project)
    return process.env.API_URL || "http://localhost:3000";
  };

  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getBaseUrl()}/api/trpc`,
        // Optional: headers for auth (not needed for public endpoints)
        headers() {
          return {};
        },
      }),
    ],
  });
}
