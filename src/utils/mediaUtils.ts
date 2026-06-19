/**
 * Detecta se uma URL de mídia aponta para o CDN cru do WhatsApp (blob `.enc` cifrado)
 * em vez do nosso Storage. Mídias importadas pelo sync antigo ficaram com essa URL e,
 * quando o CDN expira, não são mais recuperáveis — a UI deve tratá-las como indisponíveis.
 * URLs do nosso Storage (host Supabase, sem `.enc`) retornam false.
 */
export function isRawWhatsAppMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.enc(\?|$)/.test(url) || /https?:\/\/[^/]*whatsapp\.net/i.test(url);
}
