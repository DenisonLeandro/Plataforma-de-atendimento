/**
 * Detecta se um valor é um LID do WhatsApp (Linked Identity) em vez de um telefone.
 * LIDs são identificadores internos longos (14+ dígitos), sem padrão de DDI brasileiro.
 * Mesmo critério já usado em useWhatsAppActions.ts e phoneUtils.ts (/^\d{14,}$/).
 */
export function isLidValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, '');
  return /^\d{14,}$/.test(digits);
}

/**
 * Utility function to detect if a contact name is missing or invalid
 * A name is considered missing if it equals the phone number
 */
export function isContactNameMissing(
  name: string | null | undefined,
  phoneNumber: string | null | undefined
): boolean {
  // Name is missing if empty/null/undefined (e.g. LID-only contact saved with an empty name)
  if (!name) return true;

  // With a name but no phone, we can't compare — but the name itself is present
  if (!phoneNumber) return false;

  // Name is missing if it's exactly the phone number
  if (name === phoneNumber) return true;

  // Name is missing if it's actually a LID (internal WhatsApp identifier, not a name)
  if (isLidValue(name)) return true;

  // Also check normalized versions (only digits)
  const normalizedName = name.replace(/\D/g, '');
  const normalizedPhone = phoneNumber.replace(/\D/g, '');

  return normalizedName === normalizedPhone && normalizedName.length > 0;
}
