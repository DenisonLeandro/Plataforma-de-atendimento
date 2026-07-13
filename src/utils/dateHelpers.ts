/**
 * Parseia uma string "YYYY-MM-DD" como data no fuso local do usuário.
 *
 * NUNCA use `new Date("YYYY-MM-DD")` diretamente: o JS interpreta como
 * UTC 00:00, o que em fusos negativos (ex.: America/Sao_Paulo, UTC-3)
 * empurra a data para o dia anterior — causando bugs do tipo "mensagem
 * de hoje aparece como Ontem".
 */
export function parseLocalDay(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}