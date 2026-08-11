import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { logActivity } from '@/lib/activity-log';

type Conversation = Tables<'whatsapp_conversations'>;
type Contact = Tables<'whatsapp_contacts'>;

interface CreateConversationParams {
  instanceId: string;
  phoneNumber: string;
  contactName: string;
  profilePictureUrl?: string;
}

export const useCreateConversation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: CreateConversationParams) => {
      // 1. Upsert contact — UPSERT e SELECT separados para evitar o quirk de RLS no RETURNING.
      const { error: contactError } = await supabase
        .from('whatsapp_contacts')
        .upsert({
          instance_id: params.instanceId,
          phone_number: params.phoneNumber,
          name: params.contactName,
          profile_picture_url: params.profilePictureUrl,
        }, {
          onConflict: 'instance_id,phone_number',
        });

      if (contactError) throw contactError;

      const { data: contact, error: contactFetchError } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('instance_id', params.instanceId)
        .eq('phone_number', params.phoneNumber)
        .single();

      if (contactFetchError) throw contactFetchError;

      // 2. Check if conversation already exists
      // .order().limit(1): com mais de uma conversa para o contato, o
      // maybeSingle devolveria nulo e abriríamos outra em vez de reabrir a
      // existente. Na dúvida, sempre a mais antiga.
      const { data: existingConv, error: checkError } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('instance_id', params.instanceId)
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingConv) {
        return { conversation: existingConv, contact };
      }

      // 3. Create new conversation
      // INSERT sem .select() para evitar o quirk de RLS no RETURNING:
      // `INSERT ... RETURNING *` é reprovado pela policy de SELECT, mas um
      // SELECT separado da mesma linha passa. Por isso separamos as duas operações.
      const { error: insertError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          instance_id: params.instanceId,
          contact_id: contact.id,
          status: 'active',
          unread_count: 0,
        });

      // 23505 = a restrição única barrou porque uma mensagem recebida criou a
      // conversa entre a verificação e a inserção. O resultado desejado (existe
      // uma conversa com este contato) já foi alcançado — seguimos para buscá-la
      // em vez de mostrar erro a quem só queria abrir a conversa.
      if (insertError && (insertError as { code?: string }).code !== '23505') {
        throw insertError;
      }

      // Busca a conversa recém-criada em query separada (SELECT puro passa pela RLS).
      const { data: conversation, error: convError } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('instance_id', params.instanceId)
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (convError) throw convError;

      // Só registra criação se a inserção realmente ocorreu: no caminho do
      // 23505 a conversa foi criada pela mensagem recebida, não por este clique.
      if (!insertError) {
        logActivity('conversation.create', {
          targetType: 'conversation',
          targetId: conversation.id,
          targetLabel: contact.name,
          companyId: conversation.company_id ?? undefined,
        });
      }

      return { conversation, contact };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
  });

  return mutation;
};
