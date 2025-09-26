
// src/lib/fetcher.ts
/* E-Tag aware fetcher for SWR.
   Returns cached data when the API replies 304. */

const cache = new Map<string, { etag?: string; data: unknown }>();

export async function etagFetcher<T>(url: string): Promise<T> {
  const prev = cache.get(url);

  const res = await fetch(url, {
    headers: prev?.etag ? { "If-None-Match": prev.etag } : undefined,
    cache: "no-store",
  });

  if (res.status === 304 && prev) return prev.data as T;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = (await res.json()) as T;
  cache.set(url, { etag: res.headers.get("etag") ?? undefined, data });
  return data;
}
