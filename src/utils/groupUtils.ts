/** Identifica se um contato é um grupo do WhatsApp. */
export function isGroupContact(
  contact?: { is_group?: boolean | null; phone_number?: string | null } | null
): boolean {
  if (!contact) return false;
  if (contact.is_group) return true;
  const phone = contact.phone_number ?? "";
  if (phone.includes("@g.us")) return true;
  // IDs de grupo do WhatsApp começam com 120363 e têm 18 dígitos
  return /^120363\d{12,}$/.test(phone);
}
