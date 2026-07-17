# Diagnóstico

A mensagem `ERR_BLOCKED_BY_CLIENT` no Chrome é **sempre** causada por uma extensão do próprio navegador do usuário (adblocker, antivírus, Brave Shields, Kaspersky Protection, uBlock, AdGuard, etc.) que corta a requisição antes de sair da máquina. Confirmações:

- Não é firewall corporativo (aí a mensagem seria diferente — "site bloqueado pelo administrador").
- Não é problema do nosso backend: outros usuários abrem os mesmos arquivos normalmente.
- Não é problema de permissão (URL assinada já está funcionando; nós validamos o Storage há pouco).
- Como só o link do documento falha e o resto da plataforma funciona, a extensão tem alguma regra que reconhece o padrão da URL de mídia (subdomínio randômico + path `/storage/v1/object/...`) e bloqueia downloads.

O domínio do backend do Lovable Cloud (`zmmuwinmtsczewmgysnl.supabase.co`) **não pode ser renomeado**, e as Edge Functions e o Storage também moram nele — não temos como servir os arquivos de outro host sem sair do Lovable Cloud.

# Plano

## 1. Ação imediata para o usuário (sem código)

Enviar instruções passo a passo para desbloquear no Chrome da máquina afetada. Duas rotas equivalentes:

1. **Ícone do cadeado** ao lado da URL da plataforma → "Configurações do site" → em "Anúncios" e "Conteúdo intrusivo" marcar como **Permitir**. Em seguida, no ícone da extensão de adblock (uBlock/AdGuard/Brave Shield/Kaspersky), clicar em **desativar para este site** e recarregar.
2. Se persistir, adicionar exceção explícita para `*.supabase.co` (e `chat-heartbeat-57.lovable.app`) na lista branca do adblock.
3. Como validação, abrir uma aba anônima com todas as extensões desabilitadas — se o PDF abrir, é 100% extensão.

## 2. Mitigação dentro da plataforma (código)

Melhorar a UX quando o `ERR_BLOCKED_BY_CLIENT` acontecer, para que qualquer usuário nessa situação já receba a orientação certa em vez de "não abre e pronto":

- Em `MessageBubble.tsx` (renderização de `document`), envolver o clique no link com uma verificação: tentar `fetch(signedMediaUrl, { method: 'HEAD' })` antes de abrir. Se falhar com `TypeError` (que é o sintoma de `ERR_BLOCKED_BY_CLIENT` no fetch), abrir um modal com:
  - Texto explicativo curto ("O download foi bloqueado por uma extensão do navegador").
  - Botão "Tentar novamente".
  - Link "Como desbloquear" que abre um Popover com o passo a passo da seção 1.
- Aplicar o mesmo tratamento a imagens, áudios e vídeos (que também usam Storage).
- Não mexer na RLS nem na policy — não é a causa.

## 3. Verificar se há filtro conhecido divulgado

Enquanto o usuário aplica a exceção, checar em `easylist`/`easyprivacy` se algum padrão bloqueia `*.supabase.co/storage/*`. Se houver, orientar como reportar como falso positivo à lista usada. (Isso é ação fora do código, informativa.)

# Detalhes técnicos

- `ERR_BLOCKED_BY_CLIENT` não é retornável pelo servidor; o navegador nunca faz a requisição. Por isso não há como "desbloquear pelo Supabase".
- Edge Functions também rodam sob `*.supabase.co/functions/v1/...` → montar um proxy em Edge Function **não resolve**, seria bloqueado pela mesma regra.
- A única forma real de mudar o hostname seria usar Supabase self-hosted com domínio próprio — fora do escopo do Lovable Cloud.
- Mudança na UI é isolada em `src/components/chat/MessageBubble.tsx` + um pequeno componente `MediaBlockedByClientHint.tsx`. Nenhum impacto em backend, RLS ou banco.
