# Diagnóstico do servidor da Hostinger (pelo print)

## O que o print mostrou
1. **A Evolution não está reiniciando.** Todas as partes estão ligadas há 5 semanas sem parar ("Up 5 weeks").
   - Então as quedas que vemos no app acontecem **dentro** da Evolution: a ligação dela com o WhatsApp cai e volta sozinha, sem o programa reiniciar.
2. **A versão é a 2.3.7**, instalada há 5 meses e nunca atualizada. É a versão com falhas conhecidas com o novo formato de contatos do WhatsApp (os números terminados em "@lid").
3. **O log tem um aviso repetido**: "mensagens duplicadas ignoradas para evitar travamento" (avoid deadlock). Isso mostra que a própria Evolution percebe que está travando e pula mensagens para não parar.
4. **O servidor pede reinício** ("System restart required"). Há atualizações do sistema esperando há semanas.
5. Memória, CPU e disco estão com folga. Não é falta de espaço.

## Causa mais provável
A versão antiga da Evolution trava internamente com o formato novo do WhatsApp. Quando trava, as mensagens dos clientes ficam presas e só chegam quando a conexão é refeita. Por isso desconectar e conectar ajuda por pouco tempo.

## Solução sugerida (feita no Console web da Hostinger, fora do horário de atendimento)
1. **Backup antes**: no painel da Hostinger, criar um snapshot da VPS.
2. **Atualizar a Evolution** para a versão mais nova:
```text
cd $(docker inspect evolution-api-hbbv-api-1 --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}')
docker compose pull
docker compose up -d
```
3. **Reiniciar o servidor** pelo botão "Reiniciar" do painel, para aplicar as atualizações do sistema.
4. Conferir se a versão nova aparece no log:
```text
docker logs --tail 20 evolution-api-hbbv-api-1
```
5. Ler um QR Code novo no Centro e no Cinco Conjuntos (os outros só se aparecer aviso).
6. Eu acompanho pelo app por 1 dia para confirmar se as quedas e os atrasos pararam.

## Riscos
- Durante a atualização (cerca de 5 minutos) nenhum escritório recebe mensagens. Elas chegam depois que voltar.
- Se a versão nova der problema, o snapshot permite voltar ao estado atual.
- Nada é alterado no app.
