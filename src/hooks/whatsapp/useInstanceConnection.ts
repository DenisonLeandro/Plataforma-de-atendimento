import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWhatsAppInstances } from './useWhatsAppInstances';
import { useAuth } from '@/contexts/AuthContext';
import { Tables } from '@/integrations/supabase/types';

type Instance = Tables<'whatsapp_instances'>;

/**
 * Situação da conexão traduzida para a linguagem do cliente.
 *
 * O banco guarda três status crus (connected/connecting/disconnected), mas do
 * ponto de vista de quem opera existem situações distintas escondidas dentro
 * deles: "conectado mas rejeitando envios" exige a mesma ação que uma queda,
 * e "aguardando leitura do QR" é diferente de "tentando reconectar sozinho".
 */
export type ConnectionState =
  | 'connected'
  | 'degraded'
  | 'awaiting_qr'
  | 'connecting'
  | 'disconnected';

/** O QR do WhatsApp roda a cada ~40s; damos folga antes de chamá-lo de velho. */
const QR_TTL_SECONDS = 60;

export interface InstanceConnection {
  instance: Instance;
  state: ConnectionState;
  /** Rótulo curto para o badge de status. */
  label: string;
  /** Explicação em linguagem de leigo do que está acontecendo. */
  description: string;
  /** String crua do QR (renderizar com QRCodeSVG). */
  qrCode: string | null;
  /** Imagem pronta do QR, quando a Evolution manda só ela. */
  qrImage: string | null;
  /** Segundos restantes até o QR rodar. Zero quando não há QR. */
  qrSecondsLeft: number;
  /** Quantas vezes o QR já rodou nesta tentativa (indica demora no pareamento). */
  qrRotation: number | null;
  canOperate: boolean;
  isBusy: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Campos que as edge functions e o webhook gravam em
 * `whatsapp_instances.metadata`. O schema tipado enxerga isso como `Json`
 * genérico, então declaramos aqui a forma que de fato usamos.
 */
interface InstanceMetadata {
  delivery_degraded?: boolean;
  qr_base64?: string | null;
  qr_updated_at?: string | null;
  qr_rotation?: number | null;
}

function readMetadata(instance: Instance): InstanceMetadata {
  return (instance.metadata || {}) as InstanceMetadata;
}

function deriveState(instance: Instance, hasFreshQr: boolean): ConnectionState {
  const metadata = readMetadata(instance);

  // A Evolution reporta socket aberto, mas os envios voltam com erro. Para o
  // cliente isso é indistinguível de estar fora do ar — e a saída é a mesma:
  // sessão limpa + QR novo.
  if (metadata.delivery_degraded === true) return 'degraded';

  switch (instance.status) {
    case 'connected':
      return 'connected';
    case 'connecting':
      return hasFreshQr ? 'awaiting_qr' : 'connecting';
    default:
      return hasFreshQr ? 'awaiting_qr' : 'disconnected';
  }
}

const COPY: Record<ConnectionState, { label: string; description: string }> = {
  connected: {
    label: 'Conectado',
    description: 'Seu WhatsApp está conectado e recebendo mensagens normalmente.',
  },
  degraded: {
    label: 'Com problema',
    description:
      'A conexão está aberta, mas o WhatsApp está recusando os envios. Reconecte e leia o QR Code para normalizar.',
  },
  awaiting_qr: {
    label: 'Aguardando leitura',
    description: 'Abra o WhatsApp no seu celular e leia o QR Code ao lado para concluir a conexão.',
  },
  connecting: {
    label: 'Conectando',
    description: 'Estamos restabelecendo a conexão. Isso costuma levar alguns segundos.',
  },
  disconnected: {
    label: 'Desconectado',
    description:
      'Seu WhatsApp não está conectado — nenhuma mensagem entra ou sai. Clique em Conectar para gerar o QR Code.',
  },
};

/**
 * Concentra tudo que a tela de conexão precisa: estado traduzido, QR com
 * validade e as duas ações. A UI fica só com a apresentação.
 */
export function useInstanceConnection(instance: Instance): InstanceConnection {
  const { reconnectInstance, disconnectInstance } = useWhatsAppInstances();
  const { isAdmin, isSupervisor, isReadOnlyView } = useAuth();

  const metadata = readMetadata(instance);
  const qrUpdatedAt = metadata.qr_updated_at ?? undefined;

  // Recontagem local: o QR expira sozinho na tela mesmo que nenhum evento novo
  // chegue, para nunca exibirmos um código morto como se fosse válido.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!qrUpdatedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [qrUpdatedAt]);

  const qrSecondsLeft = useMemo(() => {
    if (!qrUpdatedAt) return 0;
    const elapsed = Math.floor((now - new Date(qrUpdatedAt).getTime()) / 1000);
    return Math.max(0, QR_TTL_SECONDS - elapsed);
  }, [qrUpdatedAt, now]);

  const hasFreshQr = qrSecondsLeft > 0 && !!(instance.qr_code || metadata.qr_base64);
  const state = deriveState(instance, hasFreshQr);

  // Super admin visitando outra empresa sem exceção de escrita não mexe na
  // conexão dela — mesma regra que a edge function aplica no servidor.
  const canOperate = (isAdmin || isSupervisor) && !isReadOnlyView;

  const connect = useCallback(async () => {
    // Sessão degradada precisa de logout antes: reconectar por cima mantém o
    // socket quebrado e o cliente ficaria clicando à toa.
    await reconnectInstance.mutateAsync({
      id: instance.id,
      clean: readMetadata(instance).delivery_degraded === true,
    });
  }, [instance, reconnectInstance]);

  const disconnect = useCallback(async () => {
    await disconnectInstance.mutateAsync(instance.id);
  }, [instance.id, disconnectInstance]);

  return {
    instance,
    state,
    label: COPY[state].label,
    description: COPY[state].description,
    qrCode: hasFreshQr ? instance.qr_code : null,
    qrImage: hasFreshQr ? (metadata.qr_base64 ?? null) : null,
    qrSecondsLeft,
    qrRotation: metadata.qr_rotation ?? null,
    canOperate,
    isBusy: reconnectInstance.isPending || disconnectInstance.isPending,
    connect,
    disconnect,
  };
}
