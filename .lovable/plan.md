## Objetivo
Recuperar (quando possível) o telefone real por trás das conversas marcadas com `@lid` e apresentar um relatório das que não têm como ser resolvidas — começando pelas 2 do print (Márcia e "Sem nome").

## Contexto técnico
- As 2 conversas (`64fab2be...` e `c18a26a1...`) têm `phone_number` que na verdade é um **LID interno do WhatsApp**, não telefone (confirmado em `metadata.lid`).
- Por isso `msg_count = 0` localmente, e a UI mostra "Sem nome" / sem como ligar.
- É a mesma limitação já registrada em `mem://integrations/evolution-lid-limitation`.

## Etapas

### 1. Relatório de diagnóstico (read-only)
Gerar uma planilha CSV em `/mnt/documents/` com TODAS as conversas afetadas por @lid em todas as instâncias, contendo:
- instância, conv_id, contact_name, lid armazenado, last_message_at, preview, agente, status
- se há uma conversa "irmã" no mesmo instance com mesma preview/timestamp e número real (`@s.whatsapp.net`) — candidato a merge.

### 2. Tentativa de resolução via Evolution API
Criar (ou reutilizar) uma Edge Function `resolve-lid-contacts` que, para cada conversa órfã:
- Consulta o endpoint da Evolution para mapear `lid → jid` (`/chat/findContacts` ou `whatsappNumbers`).
- Se encontrar telefone real, atualiza `whatsapp_contacts.phone_number` e `metadata.real_jid`.
- Se não encontrar, marca em `metadata.lid_unresolved = true`.

### 3. Apresentação dos resultados
Listar para o usuário no chat:
- Quantas conversas foram resolvidas (com número real recuperado).
- Quais ficaram sem resolução (incluindo as 2 do print, se for o caso).
- Recomendação de encerrar as não-resolvidas (já que sem número não dá para responder).

## Fora do escopo neste turno
- Refatorar o webhook para evitar criar contatos por LID (mudança maior, fica para um plano futuro).
- Excluir/mesclar automaticamente conversas duplicadas — só após sua aprovação caso a caso.

## Pergunta antes de implementar
Quer que eu já avance até a **Etapa 2** (chamar a Evolution e tentar resolver), ou prefere primeiro só o **relatório (Etapa 1)** para você revisar?
