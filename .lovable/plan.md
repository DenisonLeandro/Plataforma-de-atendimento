## Objetivo

Adicionar um botão em cada card de instância que abre o painel do Evolution já na página da instância correspondente, para facilitar reconexão manual.

## Mudança

Arquivo único: `src/components/settings/InstanceCard.tsx`

- Adicionar constante `EVOLUTION_MANAGER_BASE = "https://evolution-api-hbbv.srv1746890.hstgr.cloud/manager/instance"`.
- Novo botão (ícone `ExternalLink` do lucide-react) na linha de botões inferior do card, ao lado dos existentes (Reconectar, QR, Sync, etc.).
- Só renderiza quando `instance.instance_id_external` existir.
- `onClick` abre `${EVOLUTION_MANAGER_BASE}/${instance.instance_id_external}/dashboard` em nova aba (`window.open(url, "_blank", "noopener,noreferrer")`).
- Tooltip "Abrir no Evolution".
- Segue o mesmo tamanho/variante dos outros botões do rodapé para manter o alinhamento com `flex-wrap` que já existe.

## Fora de escopo

- Nada de mudanças em banco, edge functions ou RLS.
- URL fica hard-coded (conforme confirmado: sempre o mesmo servidor).
- Botão aparece em toda instância que tenha `instance_id_external`, independente de `provider_type`.
