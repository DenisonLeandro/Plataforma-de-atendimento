import { useCallback } from 'react';
import { logActivity, type LogActivityOptions } from '@/lib/activity-log';
import { useCompanyContext } from '@/hooks/useCompanyContext';

/**
 * Versão de logActivity que atribui a ação à empresa em que o usuário está
 * PRESENTE (contexto atual / view-as do super_admin), nunca à empresa base a que
 * ele está vinculado. Use este em vez do logActivity "cru" para ações de intenção
 * disparadas pela UI (IA, envio/edição de mensagem, etc.).
 *
 * Se a chamada passar um companyId explícito (ex.: a empresa real do alvo), ele
 * tem prioridade sobre o contexto.
 */
export function useLogActivity() {
  const { companyId } = useCompanyContext();

  return useCallback(
    (action: string, opts: LogActivityOptions = {}) => {
      logActivity(action, {
        ...opts,
        companyId: opts.companyId ?? companyId,
      });
    },
    [companyId]
  );
}
