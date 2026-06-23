import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const KNOWN_BUCKETS = ["avatars", "whatsapp-media"] as const;
type KnownBucket = (typeof KNOWN_BUCKETS)[number];

/**
 * Extracts the bucket id and object path from a Supabase Storage URL
 * (public, signed, or authenticated variants). Returns null when the URL is
 * external (e.g. WhatsApp CDN profile pictures) or unparseable.
 */
export function parseStorageUrl(
  url: string | null | undefined
): { bucket: KnownBucket; path: string } | null {
  if (!url) return null;
  for (const bucket of KNOWN_BUCKETS) {
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
      `/storage/v1/object/${bucket}/`,
    ];
    for (const m of markers) {
      const idx = url.indexOf(m);
      if (idx !== -1) {
        const rest = url.slice(idx + m.length).split("?")[0];
        try {
          return { bucket, path: decodeURIComponent(rest) };
        } catch {
          return { bucket, path: rest };
        }
      }
    }
  }
  return null;
}

/**
 * Returns a signed URL for a stored Supabase Storage asset. If `rawUrl` is
 * external (e.g. a WhatsApp CDN profile picture) it is passed through
 * unchanged. Signed URLs are cached for slightly less than their TTL.
 */
export function useSignedUrl(
  rawUrl: string | null | undefined,
  expiresIn = 3600
): string | undefined {
  const parsed = parseStorageUrl(rawUrl);
  const { data } = useQuery({
    queryKey: ["signed-url", parsed?.bucket, parsed?.path, expiresIn],
    queryFn: async () => {
      if (!parsed) return null;
      const { data, error } = await supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, expiresIn);
      if (error || !data) return null;
      return data.signedUrl;
    },
    enabled: !!parsed,
    staleTime: Math.max(0, (expiresIn - 60) * 1000),
    gcTime: Math.max(0, (expiresIn - 60) * 1000),
  });

  if (!parsed) return rawUrl ?? undefined;
  return data ?? undefined;
}