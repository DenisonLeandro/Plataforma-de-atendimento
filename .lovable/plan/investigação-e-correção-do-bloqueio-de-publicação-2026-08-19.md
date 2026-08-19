# Investigação e correção do bloqueio de publicação

## Contexto
Ao tentar publicar uma mudança, o usuário recebeu um erro ao clicar em Publish e precisou alterar a URL publicada para `wpp-atendimento.lovable.app`.

## Diagnóstico preliminar
O scan de segurança mais recente (2026-08-19) contém findings críticos (`level: error`) em tabelas de backup (`backup_20260811_conversas`, `backup_20260811_mensagens`, `backup_20260811_sentimento`) com RLS desabilitado, expondo dados publicamente. A ferramenta `preview_ui--publish` bloqueia publicações quando existem findings críticos não resolvidos.

## Objetivo
1. Confirmar se os findings críticos foram a causa do bloqueio.
2. Eliminar os findings críticos (remover tabelas de backup desnecessárias ou habilitar RLS + policies).
3. Garantir que publicações futuras não sejam bloqueadas por segurança.
4. Verificar se o slug anterior ainda existe ou foi renomeado corretamente.

## Passos

### 1. Confirmação da causa
- Revisar os scan results atuais e identificar todos os findings de nível `error`.
- Verificar se há registro de tentativa de publicação bloqueada nos logs.

### 2. Limpeza dos findings críticos
- Verificar se as tabelas `backup_20260811_*` ainda são necessárias.
- Se não forem necessárias: removê-las via migration.
- Se forem necessárias: habilitar RLS e criar policies com escopo de company, equivalentes às tabelas de produção (`whatsapp_conversations`, `whatsapp_messages`, etc.).

### 3. Revalidação
- Rodar novo scan de segurança.
- Confirmar que não há mais findings críticos.
- Testar publicação (sem alterar código) para confirmar que o botão Publish funciona normalmente.

### 4. Verificação do slug/URL
- Confirmar que o slug atual `wpp-atendimento` é o desejado.
- Verificar se o slug anterior ainda está associado a algum projeto ou se foi liberado.

## Restrições
- Não alterar código de negócio ou UI, a menos que seja necessário para resolver findings.
- Não executar migrations sem aprovação explícita do usuário quando houver dados de backup envolvidos.
