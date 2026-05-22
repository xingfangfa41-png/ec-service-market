import { useState, useEffect } from "react";

// Simple REST API client (replaces tRPC for Edge Runtime reliability)
const API_BASE = "/api/trpc";

async function get(path: string, params?: Record<string, string>) {
  const url = new URL(API_BASE + "/" + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "请求失败" } }));
    throw new Error(err.error?.message || "请求失败");
  }
  return res.json();
}

async function post(path: string, body: any) {
  const res = await fetch(API_BASE + "/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
    checkPublisher: {
      useQuery: (input: { publisherId: string }, opts?: any) => {
        const [data, setData] = useState<any | null>(null);

        const fetchData = async () => {
          if (!input.publisherId) return;
          try {
            const res = await get("listing.checkPublisher", { publisherId: input.publisherId });
            setData(res.result?.data || null);
          } catch { setData(null); }
        };

        useEffect(() => { fetchData(); }, [input.publisherId]);

        return { data };
      },
    },
    cooldownStatus: {
      useQuery: (input: { publisherId: string }, opts?: any) => {
        const [data, setData] = useState<any>(null);

        const fetchData = async () => {
          if (!input.publisherId) return;
          try {
            const res = await get("listing.cooldownStatus", { publisherId: input.publisherId });
            setData(res.result?.data || { inCooldown: false, remainingSeconds: 0 });
          } catch { setData({ inCooldown: false, remainingSeconds: 0 }); }
        };

        useEffect(() => { fetchData(); }, [input.publisherId]);

        return { data };
      },
    },
    create: {
      useMutation: (opts?: any) => {
        const [isPending, setPending] = useState(false);

        const mutate = async (body: any) => {
          setPending(true);
          try {
            const res = await post("listing.create", body);
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
        const mutate = async (body: any) => {
          const res = await post("listing.delete", body);
          opts?.onSuccess?.();
          return res;
        };
        return { mutate, isPending: false };
      },
    },
    update: {
      useMutation: (opts?: any) => {
        const [isPending, setPending] = useState(false);
        const mutate = async (body: any) => {
          setPending(true);
          try {
            const res = await post("listing.update", body);
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
  useUtils: () => ({
    invalidate: () => {},
  }),
};
