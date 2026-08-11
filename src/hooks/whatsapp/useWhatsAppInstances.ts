import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useCompanyContext } from '@/hooks/useCompanyContext';

type Instance = Tables<'whatsapp_instances'> & { provider_type?: string };
type InstanceInsert = TablesInsert<'whatsapp_instances'>;
type InstanceUpdate = TablesUpdate<'whatsapp_instances'>;

// Extended types that include secrets and provider_type
type InstanceInsertWithSecrets = InstanceInsert & {
  api_url: string;
  api_key: string;
  provider_type?: string;
  instance_id_external?: string;
};

type InstanceUpdateWithSecrets = InstanceUpdate & {
  api_url?: string;
  api_key?: string;
  provider_type?: string;
  instance_id_external?: string;
};

/** Desfechos possíveis de `reconnect-instance`. */
export interface ReconnectResponse {
  success?: boolean;
  /** Já estava conectada: nada foi alterado na Evolution. */
  alreadyConnected?: boolean;
  /** Baileys já estava reconectando sozinho; não forçamos por cima. */
  stillConnecting?: boolean;
  /** Houve logout antes do connect (sessão suja). */
  cleanReconnect?: boolean;
  /** String crua do QR, quando a Evolution já devolve na resposta. */
  qr?: string | null;
  /** Imagem pronta do QR (data-URI). */
  qrBase64?: string | null;
  status?: string;
}

/**
 * Invoca uma edge function e propaga a mensagem real do erro.
 *
 * Em respostas não-2xx o supabase-js entrega só "Edge Function returned a
 * non-2xx status code" e esconde o corpo em `error.context`. Sem desembrulhar,
 * o cliente veria esse texto genérico em vez de "já existe uma operação em
 * andamento" — justamente a explicação de que ele precisa.
 */
async function invokeInstanceFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let message = error.message;
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) message = payload.error;
    } catch {
      // Corpo não-JSON ou já consumido: mantém a mensagem original.
    }
    throw new Error(message);
  }

  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error);
  }

  return data as T;
}

export const useWhatsAppInstances = () => {
  const queryClient = useQueryClient();
  const { companyId } = useCompanyContext();

  const { data: instances = [], isLoading, error } = useQuery({
    queryKey: ['whatsapp', 'instances', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Instance[];
    },
    enabled: !!companyId,
  });

  // Sem realtime, a tela de conexão ficava mentindo: o cliente lia o QR, o
  // celular pareava, e o card continuava "Desconectado" até um F5. Como o
  // webhook agora grava cada rotação de QR e cada mudança de estado, basta
  // ouvir a tabela para a tela acompanhar sozinha.
  //
  // O sufixo aleatório no nome do canal é obrigatório: este hook é usado por
  // ~16 componentes, vários montados ao mesmo tempo. Com nome fixo, o
  // supabase-js devolve o canal já existente e o segundo `.on()` cai depois do
  // `subscribe()`, quebrando o carregamento da plataforma inteira. Mesmo
  // padrão de useWhatsAppConversations e useWhatsAppSentiment.
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`whatsapp-instances-${companyId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances', companyId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);

  const createInstance = useMutation({
    mutationFn: async (instance: InstanceInsertWithSecrets) => {
      const { api_url, api_key, provider_type, instance_id_external, ...instanceData } = instance;

      // 1. Create instance in main table with provider_type and instance_id_external.
      // INSERT e SELECT separados para evitar o quirk de RLS no RETURNING.
      const { error: instanceError } = await supabase
        .from('whatsapp_instances')
        .insert({
          ...instanceData,
          provider_type: provider_type || 'self_hosted',
          instance_id_external: instance_id_external || null,
          company_id: companyId,
        } as any);

      if (instanceError) throw instanceError;

      const { data: instanceResult, error: instanceFetchError } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('instance_name', (instanceData as any).instance_name)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (instanceFetchError) throw instanceFetchError;

      // 2. Create secrets in separate table
      const { error: secretsError } = await supabase
        .from('whatsapp_instance_secrets')
        .insert({
          instance_id: instanceResult.id,
          api_url,
          api_key,
        });

      if (secretsError) {
        // Rollback: delete instance if secrets insertion fails
        await supabase
          .from('whatsapp_instances')
          .delete()
          .eq('id', instanceResult.id);
        throw secretsError;
      }

      return instanceResult;
    },
    onSuccess: (instanceResult: any) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
      // Configura o webhook (com MESSAGES_UPDATE) automaticamente. Falha silenciosa —
      // se a Evolution recusar, o admin ainda pode disparar manualmente pelo card.
      if (instanceResult?.id) {
        supabase.functions
          .invoke('sync-instance-webhook', { body: { instanceId: instanceResult.id } })
          .catch(() => undefined);
      }
    },
  });

  const updateInstance = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: InstanceUpdateWithSecrets }) => {
      const { api_url, api_key, provider_type, instance_id_external, ...instanceUpdates } = updates;

      // Build instance updates including provider_type and instance_id_external if provided
      const finalInstanceUpdates = {
        ...instanceUpdates,
        ...(provider_type && { provider_type }),
        ...(instance_id_external !== undefined && { instance_id_external }),
      };

      // 1. Update instance in main table
      const { data, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .update(finalInstanceUpdates as any)
        .eq('id', id)
        .select()
        .single();

      if (instanceError) throw instanceError;

      // 2. Update secrets if provided (upsert)
      if (api_url || api_key) {
        const { error: secretsError } = await supabase
          .from('whatsapp_instance_secrets')
          .upsert(
            {
              instance_id: id,
              ...(api_url && { api_url }),
              ...(api_key && { api_key }),
            },
            { onConflict: 'instance_id' }
          );

        if (secretsError) throw secretsError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  const deleteInstance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  const testConnection = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(
        'test-instance-connection',
        { body: { instanceId: id } }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate to fetch updated status
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  const reconnectInstance = useMutation({
    mutationFn: async (input: string | { id: string; clean?: boolean }) => {
      const id = typeof input === 'string' ? input : input.id;
      const clean = typeof input === 'string' ? false : !!input.clean;
      const data = await invokeInstanceFunction<ReconnectResponse>(
        'reconnect-instance',
        { instanceId: id, clean }
      );
      return { ...data, instanceId: id };
    },
    onSuccess: (data) => {
      const id = (data as { instanceId?: string })?.instanceId;
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
      // Reconectar frequentemente reseta a configuração de webhook do Baileys
      // no Evolution — reaplicamos MESSAGES_UPDATE em background.
      if (id) {
        supabase.functions
          .invoke('sync-instance-webhook', { body: { instanceId: id } })
          .catch(() => undefined);
      }
    },
  });

  // Logout da sessão do WhatsApp. Exige leitura de QR novo depois — a UI
  // cobre com dupla confirmação antes de chegar aqui.
  const disconnectInstance = useMutation({
    mutationFn: async (id: string) =>
      invokeInstanceFunction<{ success: boolean; status: string }>(
        'disconnect-instance',
        { instanceId: id }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'instances'] });
    },
  });

  const diagnoseInstance = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(
        'diagnose-instance',
        { body: { instanceId: id } }
      );
      if (error) throw error;
      return data;
    },
  });

  const resolveLidConversations = useMutation({
    mutationFn: async ({ id, dryRun }: { id: string; dryRun?: boolean }) => {
      const { data, error } = await supabase.functions.invoke(
        'resolve-lid-conversations',
        { body: { instanceId: id, dryRun: !!dryRun } }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'contacts'] });
    },
  });

  // Reconfigura o webhook da Evolution para a instância — garante que os
  // eventos MESSAGES_UPDATE (acks 1/2/3 = enviado/entregue/lido) sejam
  // enviados de volta pro `evolution-webhook`. Sem isso, mensagens antigas
  // ficam travadas em ✓ cinza (status `sent`).
  const syncInstanceWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke(
        'sync-instance-webhook',
        { body: { instanceId: id } }
      );
      if (error) throw error;
      return data;
    },
  });

  return {
    instances,
    isLoading,
    error,
    createInstance,
    updateInstance,
    deleteInstance,
    testConnection,
    reconnectInstance,
    disconnectInstance,
    diagnoseInstance,
    resolveLidConversations,
    syncInstanceWebhook,
  };
};