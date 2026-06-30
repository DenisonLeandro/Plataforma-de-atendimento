import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a URL final do avatar de um contato a partir do campo
 * `profile_picture_url` de whatsapp_contacts.
 *
 * - `null`/`undefined` → `undefined` (o componente mostra o avatar genérico).
 * - URL externa legada (`http...`, ex.: CDN do Facebook) → usada direto. Pode
 *   eventualmente dar 403 quando expira, mas não quebra a UI.
 * - Path do Storage (ex.: `<instance_id>/profiles/<phone>.jpg`) → gera uma
 *   signed URL no bucket `whatsapp-media` (válida por 1h, cacheada).
 */
export function useContactAvatar(
  profilePictureUrl: string | null | undefined,
): string | undefined {
  const isExternal =
    !!profilePictureUrl && /^https?:\/\//i.test(profilePictureUrl);
  const isStoragePath = !!profilePictureUrl && !isExternal;

  const { data } = useQuery({
    queryKey: ["contact-avatar", profilePictureUrl],
    queryFn: async () => {
      if (!isStoragePath) return null;
      const { data, error } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(profilePictureUrl as string, 3600);
      if (error || !data) return null;
      return data.signedUrl;
    },
    enabled: isStoragePath,
    staleTime: Math.max(0, (3600 - 60) * 1000),
    gcTime: Math.max(0, (3600 - 60) * 1000),
  });

  if (!profilePictureUrl) return undefined;
  if (isExternal) return profilePictureUrl;
  return data ?? undefined;
}
