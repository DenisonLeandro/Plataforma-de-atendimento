// Autorização compartilhada para ações de conexão de instância (conectar,
// reconectar, desconectar).
//
// Por que existe: as edge functions rodam com SERVICE ROLE, que ignora RLS.
// Toda checagem de acesso precisa ser feita à mão aqui dentro. Antes deste
// módulo, `reconnect-instance` validava apenas o papel (admin/supervisor) e
// NÃO a empresa — um admin da empresa A conseguia derrubar a sessão da
// empresa B mandando o UUID. Com a conexão virando um botão self-service,
// centralizamos a regra num lugar só para não repetir o erro.

export interface InstanceActionContext {
  userId: string;
  instance: {
    id: string;
    name: string;
    instance_name: string;
    provider_type: string | null;
    instance_id_external: string | null;
    company_id: string | null;
    status: string | null;
    metadata: Record<string, unknown>;
  };
  /** Base da Evolution já normalizada (sem barra final, sem /manager). */
  baseUrl: string;
  apiKey: string;
  /** Identificador que a Evolution espera: UUID externo (cloud) ou nome (self-hosted). */
  identifier: string;
}

export type AuthorizeResult =
  | { ok: true; ctx: InstanceActionContext }
  | { ok: false; status: number; error: string };

/**
 * Valida, em ordem: JWT -> papel (admin|supervisor) -> pertencimento à empresa
 * da instância -> existência dos segredos. Retorna tudo que a ação precisa,
 * para o chamador não repetir queries.
 */
export async function authorizeInstanceAction(
  supabaseAdmin: any,
  req: Request,
  instanceId: string,
): Promise<AuthorizeResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { ok: false, status: 401, error: 'Não autenticado' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return { ok: false, status: 401, error: 'Não autenticado' };
  }

  if (!instanceId) {
    return { ok: false, status: 400, error: 'instanceId é obrigatório' };
  }

  const { data: instance, error: instanceError } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, name, instance_name, provider_type, instance_id_external, company_id, status, metadata')
    .eq('id', instanceId)
    .maybeSingle();

  if (instanceError || !instance) {
    return { ok: false, status: 404, error: 'Instância não encontrada' };
  }

  // Papel: apenas admin e supervisor operam a conexão. O agente atende, não
  // administra o número — evita que um clique curioso derrube o atendimento
  // de todo mundo.
  const [{ data: isAdmin }, { data: isSupervisor }] = await Promise.all([
    supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
    supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'supervisor' }),
  ]);

  if (!isAdmin && !isSupervisor) {
    return { ok: false, status: 403, error: 'Apenas administradores e supervisores podem gerenciar a conexão' };
  }

  // Empresa: o alvo tem de ser da mesma empresa do chamador. Super admin passa
  // apenas com exceção explícita de escrita registrada para aquela empresa
  // (mesma regra que o resto do sistema usa via super_admin_can_write_company).
  const [{ data: callerCompanyId }, { data: superAdminCanWrite }] = await Promise.all([
    supabaseAdmin.rpc('get_user_company_id', { _user_id: user.id }),
    instance.company_id
      ? supabaseAdmin.rpc('super_admin_can_write_company', { _uid: user.id, _company_id: instance.company_id })
      : Promise.resolve({ data: false }),
  ]);

  const sameCompany = !!instance.company_id && instance.company_id === callerCompanyId;
  if (!sameCompany && !superAdminCanWrite) {
    // 404 em vez de 403 de propósito: não confirmamos a existência de uma
    // instância de outra empresa para quem não deveria enxergá-la.
    return { ok: false, status: 404, error: 'Instância não encontrada' };
  }

  const { data: secrets, error: secretsError } = await supabaseAdmin
    .from('whatsapp_instance_secrets')
    .select('api_url, api_key')
    .eq('instance_id', instanceId)
    .maybeSingle();

  if (secretsError || !secrets?.api_url || !secrets?.api_key) {
    return { ok: false, status: 404, error: 'Credenciais da instância não configuradas' };
  }

  const providerType = instance.provider_type || 'self_hosted';
  const identifier = providerType === 'cloud' && instance.instance_id_external
    ? instance.instance_id_external
    : instance.instance_name;

  const baseUrl = (secrets.api_url.endsWith('/') ? secrets.api_url.slice(0, -1) : secrets.api_url)
    .replace(/\/manager$/, '');

  return {
    ok: true,
    ctx: {
      userId: user.id,
      instance: {
        ...instance,
        metadata: (instance.metadata || {}) as Record<string, unknown>,
      },
      baseUrl,
      apiKey: secrets.api_key,
      identifier,
    },
  };
}

/** Janela do lock. Depois disso um lock preso é considerado abandonado. */
const LOCK_TTL_MS = 45_000;

/**
 * Compare-and-set atômico do lock de conexão.
 *
 * O filtro `.or(...)` vira um WHERE na mesma UPDATE, então dois cliques
 * simultâneos disputam a linha no banco e apenas um ganha — não é
 * read-then-write. Comparação lexicográfica de ISO-8601 equivale à
 * cronológica, o que permite expirar lock órfão sem coluna nova.
 */
export async function acquireConnectionLock(
  supabaseAdmin: any,
  ctx: InstanceActionContext,
  action: string,
): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - LOCK_TTL_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from('whatsapp_instances')
    .update({
      metadata: {
        ...ctx.instance.metadata,
        connection_lock_at: now.toISOString(),
        connection_lock_by: ctx.userId,
        connection_lock_action: action,
      },
      updated_at: now.toISOString(),
    })
    .eq('id', ctx.instance.id)
    // O valor vai entre aspas porque o ISO-8601 tem pontos, que são o
    // separador de `campo.operador.valor` no PostgREST.
    .or(`metadata->>connection_lock_at.is.null,metadata->>connection_lock_at.lt."${cutoff}"`)
    .select('id');

  if (error) {
    console.error('[instance-auth] Falha ao adquirir lock:', error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

/**
 * Libera o lock e grava o estado final da ação. `patch` altera colunas da
 * instância (status, qr_code, ...) na mesma escrita, para o realtime não expor
 * um estado intermediário.
 *
 * O metadata é relido logo antes de gravar, e não reaproveitado do snapshot
 * feito na autorização: entre adquirir e liberar o lock passam-se até 20s de
 * chamada à Evolution, e nesse intervalo o webhook pode ter gravado um
 * `qrcode.updated` mais recente. Escrever por cima do snapshot antigo faria a
 * tela voltar para um QR já vencido.
 */
export async function releaseConnectionLock(
  supabaseAdmin: any,
  ctx: InstanceActionContext,
  patch: Record<string, unknown> = {},
  metadataPatch: Record<string, unknown> = {},
): Promise<void> {
  const { data: fresh } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('metadata')
    .eq('id', ctx.instance.id)
    .maybeSingle();

  const currentMetadata = (fresh?.metadata ?? ctx.instance.metadata) as Record<string, unknown>;

  await supabaseAdmin
    .from('whatsapp_instances')
    .update({
      ...patch,
      metadata: {
        ...currentMetadata,
        ...metadataPatch,
        connection_lock_at: null,
        connection_lock_by: null,
        connection_lock_action: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.instance.id);
}

/**
 * Auditoria. Usa `_write_activity_log` (ator explícito) porque `log_activity`
 * deriva o ator de auth.uid(), que é nulo sob service role. Nunca lança: um
 * problema de log não pode impedir o cliente de reconectar o WhatsApp.
 */
export async function logInstanceActivity(
  supabaseAdmin: any,
  ctx: InstanceActionContext,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabaseAdmin.rpc('_write_activity_log', {
      _actor: ctx.userId,
      _action: action,
      _target_type: 'whatsapp_instance',
      _target_id: ctx.instance.id,
      _target_label: ctx.instance.name,
      _company_id: ctx.instance.company_id,
      _metadata: metadata,
    });
  } catch (e) {
    console.error('[instance-auth] Falha ao registrar auditoria:', e);
  }
}

/** Traduz o estado bruto da Evolution para o status usado no banco. */
export function mapEvolutionState(raw: unknown): 'connected' | 'connecting' | 'disconnected' {
  const state = typeof raw === 'string' ? raw : '';
  if (state === 'open' || state === 'connected') return 'connected';
  if (state === 'connecting') return 'connecting';
  return 'disconnected';
}

/**
 * Extrai o QR da resposta da Evolution.
 *
 * `code` é a string crua que vira QR na tela; `base64` é uma imagem pronta.
 * São coisas diferentes e não podem ser trocadas — renderizar o base64 como
 * se fosse `code` produz um QR ilegível. Devolvemos os dois separados e a UI
 * decide como desenhar.
 */
export function extractQrCode(data: any): { code: string | null; base64: string | null } {
  const source = data?.qrcode ?? data ?? {};
  const code = typeof source.code === 'string' && source.code.length > 20 ? source.code : null;
  const rawBase64 = typeof source.base64 === 'string' && source.base64.length > 20 ? source.base64 : null;
  const base64 = rawBase64
    ? (rawBase64.startsWith('data:') ? rawBase64 : `data:image/png;base64,${rawBase64}`)
    : null;
  return { code, base64 };
}
