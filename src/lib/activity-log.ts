import { supabase } from '@/integrations/supabase/client';

/**
 * Catálogo de ações de auditoria. A `key` é o valor gravado em activity_logs.action.
 * Rótulos amigáveis + ícone (emoji) para a aba "Atividades".
 * Mantido em sincronia com os triggers da migration 20260728120000_activity_logs.sql.
 */
export const ACTIVITY_LABELS: Record<string, { label: string; icon: string }> = {
  // Conversa (via triggers de status)
  'conversation.archive': { label: 'Arquivou conversa', icon: '🗄️' },
  'conversation.close': { label: 'Encerrou conversa', icon: '📁' },
  'conversation.reopen': { label: 'Reabriu conversa', icon: '📂' },
  'conversation.status_change': { label: 'Mudou status da conversa', icon: '🔄' },
  'conversation.create': { label: 'Criou conversa', icon: '➕' },
  'conversation.assign': { label: 'Atribuiu/transferiu conversa', icon: '👥' },
  // Contato (via trigger)
  'contact.update': { label: 'Editou contato', icon: '✏️' },
  'contact.delete': { label: 'Excluiu contato', icon: '🗑️' },
  // Mensagem (via front)
  'message.send': { label: 'Respondeu', icon: '💬' },
  'message.edit': { label: 'Editou mensagem', icon: '📝' },
  'message.react': { label: 'Reagiu a mensagem', icon: '👍' },
  // IA (via front)
  'ai.transcription': { label: 'Transcreveu áudio', icon: '🎤' },
  'ai.sentiment': { label: 'Analisou sentimento', icon: '💭' },
  'ai.categorization': { label: 'Categorizou conversa', icon: '🏷️' },
  'ai.summary': { label: 'Gerou resumo', icon: '🧾' },
  'ai.smart_replies': { label: 'Usou sugestão de IA', icon: '⚡' },
  'ai.composer': { label: 'Usou compositor IA', icon: '✍️' },
  // Deletes reais (via triggers)
  'instance.delete': { label: 'Excluiu instância', icon: '🗑️' },
  'note.delete': { label: 'Excluiu nota', icon: '🗑️' },
  'summary.delete': { label: 'Excluiu resumo', icon: '🗑️' },
  'rule.delete': { label: 'Excluiu regra de atribuição', icon: '🗑️' },
  'macro.delete': { label: 'Excluiu macro', icon: '🗑️' },
  'company.delete': { label: 'Excluiu empresa', icon: '🗑️' },
};

/** Grupos para o filtro de tipo de ação na aba. */
export const ACTIVITY_GROUPS: { label: string; actions: string[] }[] = [
  { label: 'Conversas', actions: ['conversation.archive', 'conversation.close', 'conversation.reopen', 'conversation.status_change', 'conversation.create', 'conversation.assign'] },
  { label: 'Mensagens', actions: ['message.send', 'message.edit', 'message.react'] },
  { label: 'Contatos', actions: ['contact.update', 'contact.delete'] },
  { label: 'IA', actions: ['ai.transcription', 'ai.sentiment', 'ai.categorization', 'ai.summary', 'ai.smart_replies', 'ai.composer'] },
  { label: 'Exclusões', actions: ['instance.delete', 'note.delete', 'summary.delete', 'rule.delete', 'macro.delete', 'company.delete'] },
];

export function activityLabel(action: string): { label: string; icon: string } {
  return ACTIVITY_LABELS[action] ?? { label: action, icon: '•' };
}

export type ActivityAction = keyof typeof ACTIVITY_LABELS;

export interface LogActivityOptions {
  targetType?: string;
  targetId?: string | null;
  targetLabel?: string | null;
  companyId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Registra uma ação de intenção do usuário logado (fire-and-forget).
 * O ator é derivado do JWT no servidor (RPC log_activity, SECURITY DEFINER) —
 * o front só informa O QUE foi feito. Nunca lança nem atrasa a ação real.
 */
export function logActivity(action: string, opts: LogActivityOptions = {}): void {
  try {
    Promise.resolve(
      (supabase.rpc as any)('log_activity', {
        _action: action,
        _target_type: opts.targetType ?? null,
        _target_id: opts.targetId ?? null,
        _target_label: opts.targetLabel ?? null,
        _company_id: opts.companyId ?? null,
        _metadata: opts.metadata ?? {},
      })
    ).then(
      (res: any) => {
        if (res?.error) console.warn('[activity-log] falha ao registrar:', res.error);
      },
      (err: unknown) => console.warn('[activity-log] falha ao registrar:', err)
    );
  } catch (err) {
    console.warn('[activity-log] falha ao registrar:', err);
  }
}
