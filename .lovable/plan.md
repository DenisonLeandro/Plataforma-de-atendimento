# Encerramento em massa — Advocacia Ibiporã

## Diagnóstico

Olhei a instância **Advocacia Ibiporã** no banco e confirmei o cenário:

- **136 conversas ativas** nessa instância.
- Dessas, **128 estão sem atendente atribuído** e só **8 estão atribuídas ao Leonardo**.
- Como o Leonardo é admin/atendente da instância, ele enxerga tanto as 8 dele quanto a fila das 128 não atribuídas — por isso "todas" parecem estar abertas para ele.
- **125 das 136 ativas** têm a última mensagem em **23/06 ou antes** (são essas que vamos encerrar).
- **Duplicadas**: confirmei várias (Luiz, Ana, Bia, Franklin, Paulo, Nando, etc.). Os pares sempre têm um número "normal" (`5543...`) e um número longo estranho (`19895...`, `12663...`). Isso é a **limitação conhecida do Evolution API com `@lid` vs `@s.whatsapp.net`** já registrada no projeto — não é bug novo, é o webhook recebendo o mesmo contato com dois identificadores diferentes em conexões QR Baileys. Não vou mexer nas duplicadas agora; o tratamento delas é outra discussão (merge manual ou aguardar correção da Evolution).

## O que vou fazer

Uma única ação de dados, sem alterar código:

**Encerrar todas as conversas ativas da instância Advocacia Ibiporã cuja última mensagem é até 23/06/2026 (inclusive).**

Concretamente:

```sql
UPDATE whatsapp_conversations
SET status = 'closed', updated_at = now()
WHERE instance_id = '47090649-e7bb-46f4-9089-6c108d3cfb4b'
  AND status = 'active'
  AND last_message_at < '2026-06-24'::date;
```

Isso encerra as ~125 conversas antigas (atribuídas ou não), liberando a fila do Leonardo. As 11 ativas com mensagem em 24/06 ficam intocadas. Conversas já `closed` / `archived` não são tocadas.

## Não incluído neste plano

- **Mesclar/limpar contatos duplicados** (@lid) — requer decisão de produto sobre qual número manter e remapeamento de mensagens. Posso fazer num plano separado se quiser.
- **Gerar resumo por IA** ao encerrar — pulado de propósito no bulk (seriam 125 chamadas de IA). Se quiser resumos automáticos, me diz e eu adapto.

Confirma que posso rodar o `UPDATE`?
