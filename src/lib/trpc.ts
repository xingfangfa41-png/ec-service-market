import { useState, useEffect } from "react";

// Simple REST API client (replaces tRPC for Edge Runtime reliability)
const API_BASE = "/api/trpc";

// Store signed token in memory and localStorage
function getStoredToken() {
  try {
    const raw = localStorage.getItem("ec_token");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeToken(token) {
  localStorage.setItem("ec_token", JSON.stringify(token));
}

let cachedToken = getStoredToken();

// Ensure we have a valid signed token from backend
async function ensureToken() {
  if (cachedToken?.publisherId && cachedToken?.signature) {
    return cachedToken;
  }
  // Fetch new token from backend
  const res = await fetch(`${API_BASE}/listing.getToken`);
  const data = await res.json();
  if (data.result?.data) {
    cachedToken = {
      publisherId: data.result.data.publisherId,
      signature: data.result.data.signature,
    };
    storeToken(cachedToken);
    return cachedToken;
  }
  throw new Error("Failed to get token");
}

async function get(path: string, params?: Record<string, string>) {
  const token = await ensureToken();
  const url = new URL(API_BASE + "/" + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  }
  // Attach signature to query params
  url.searchParams.set("publisherId", token.publisherId);
  url.searchParams.set("signature", token.signature);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "请求失败" } }));
    throw new Error(err.error?.message || "请求失败");
  }
  return res.json();
}

async function post(path: string, body: any) {
  const token = await ensureToken();
  const res = await fetch(API_BASE + "/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      publisherId: token.publisherId,
      signature: token.signature,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "请求失败" } }));
    throw new Error(err.error?.message || "请求失败");
  }
  return res.json();
}

export const trpc = {
  listing: {
    list: {
      useQuery: (input?: { category?: string | null }, opts?: any) => {
        const [data, setData] = useState<any[] | null>(null);
        const [isLoading, setLoading] = useState(true);
        const [error, setError] = useState<Error | null>(null);

        const fetchData = async () => {
          setLoading(true);
          setError(null);
          try {
            const res = await get("listing.list", {
              category: input?.category || undefined,
            });
            setData(res.result?.data || []);
          } catch (err: any) {
            setError(err);
          } finally {
            setLoading(false);
          }
        };

        useEffect(() => { fetchData(); }, [input?.category]);

        return {
          data: data || [],
          isLoading,
          error: error ? { message: error.message } : null,
          refetch: fetchData,
        };
      },
    },
    getById: {
      useQuery: (input: { id: number }, opts?: any) => {
        const [data, setData] = useState<any | null>(null);
        const [isLoading, setLoading] = useState(true);
        const [error, setError] = useState<Error | null>(null);

        const fetchData = async () => {
          if (!input.id) return;
          setLoading(true);
          setError(null);
          try {
            const res = await get("listing.getById", { id: String(input.id) });
            setData(res.result?.data || null);
          } catch (err: any) {
            setError(err);
          } finally {
            setLoading(false);
          }
        };

        useEffect(() => { fetchData(); }, [input.id]);

        return { data, isLoading, error: error ? { message: error.message } : null };
      },
    },
    cooldownStatus: {
      useQuery: (opts?: any) => {
        const [data, setData] = useState<any>(null);

        const fetchData = async () => {
          try {
            const res = await get("listing.cooldownStatus");
            setData(res.result?.data || { inCooldown: false, remainingSeconds: 0 });
          } catch { setData({ inCooldown: false, remainingSeconds: 0 }); }
        };

        useEffect(() => { fetchData(); }, []);

        return { data };
      },
    },
    create: {
      useMutation: (opts?: any) => {
        const [isPending, setPending] = useState(false);

        const mutate = async (body: any) => {
          setPending(true);
          try {
            // Include human verification token
            const verifyRaw = sessionStorage.getItem("ec_verify");
            const verifyData = verifyRaw ? JSON.parse(verifyRaw) : null;
            const humanToken = verifyData?.token || "";
            // Check if token expired
            if (!humanToken || Date.now() > (verifyData?.expiresAt || 0)) {
              throw new Error("人机验证已过期，请重新验证");
            }
            const res = await post("listing.create", { ...body, humanToken });
            opts?.onSuccess?.();
            return res;
          } catch (err: any) {
            opts?.onError?.(err);
            throw err;
          } finally {
            setPending(false);
          }
        };

        return { mutate, isPending };
      },
    },
    delete: {
      useMutation: (opts?: any) => {
        const [isPending, setPending] = useState(false);
        const mutate = async (body: any) => {
          setPending(true);
          try {
            const verifyRaw = sessionStorage.getItem("ec_verify");
            const verifyData = verifyRaw ? JSON.parse(verifyRaw) : null;
            const humanToken = verifyData?.token || "";
            if (!humanToken || Date.now() > (verifyData?.expiresAt || 0)) {
              throw new Error("人机验证已过期，请重新验证");
            }
            const res = await post("listing.delete", { ...body, humanToken });
            opts?.onSuccess?.();
            return res;
          } catch (err: any) {
            opts?.onError?.(err);
            throw err;
          } finally {
            setPending(false);
          }
        };
        return { mutate, isPending };
      },
    },
    update: {
      useMutation: (opts?: any) => {
        const [isPending, setPending] = useState(false);
        const mutate = async (body: any) => {
          setPending(true);
          try {
            const verifyRaw = sessionStorage.getItem("ec_verify");
            const verifyData = verifyRaw ? JSON.parse(verifyRaw) : null;
            const humanToken = verifyData?.token || "";
            if (!humanToken || Date.now() > (verifyData?.expiresAt || 0)) {
              throw new Error("人机验证已过期，请重新验证");
            }
            const res = await post("listing.update", { ...body, humanToken });
            opts?.onSuccess?.();
            return res;
          } catch (err: any) {
            opts?.onError?.(err);
            throw err;
          } finally {
            setPending(false);
          }
        };
        return { mutate, isPending };
      },
    },
    checkOwner: {
      useMutation: (opts?: any) => {
        const [isPending, setPending] = useState(false);
        const mutate = async (body: any) => {
          setPending(true);
          try {
            const res = await post("listing.checkOwner", body);
            return res.result?.data;
          } catch (err: any) {
            return { isOwner: false };
          } finally {
            setPending(false);
          }
        };
        return { mutate, isPending };
      },
    },
  },
  useUtils: () => ({
    invalidate: () => {},
  }),
  comment: {
    list: {
      useQuery: (input: { listingId: number }, opts?: any) => {
        const [data, setData] = useState<any[] | null>(null);
        const [isLoading, setLoading] = useState(true);

        const fetchData = async () => {
          if (!input.listingId) return;
          setLoading(true);
          try {
            const res = await get("comment.list", { listingId: String(input.listingId) });
            setData(res.result?.data || []);
          } catch { setData([]); }
          finally { setLoading(false); }
        };

        useEffect(() => { fetchData(); }, [input.listingId]);

        return { data: data || [], isLoading };
      },
    },
    create: {
      useMutation: (opts?: any) => {
        const [isPending, setPending] = useState(false);
        const mutate = async (body: any) => {
          setPending(true);
          try {
            // Include human verification token
            const verifyRaw = sessionStorage.getItem("ec_verify");
            const verifyData = verifyRaw ? JSON.parse(verifyRaw) : null;
            const humanToken = verifyData?.token || "";
            if (!humanToken || Date.now() > (verifyData?.expiresAt || 0)) {
              throw new Error("人机验证已过期，请重新验证");
            }
            const res = await post("comment.create", { ...body, humanToken });
            opts?.onSuccess?.();
            return res;
          } catch (err: any) {
            opts?.onError?.(err);
            throw err;
          } finally {
            setPending(false);
          }
        };
        return { mutate, isPending };
      },
    },
  },
};
