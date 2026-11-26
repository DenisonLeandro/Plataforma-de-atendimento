# Guia: investigar o servidor do WhatsApp (Hostinger)

Objetivo: descobrir por que o servidor derruba as conexões de todos os escritórios a cada 15 a 30 minutos. Nada será alterado no app.

## 1. Painel da Hostinger (sem precisar de conhecimento técnico)
- Abra hPanel → VPS → seu servidor → **Visão geral**.
- Veja os gráficos de **CPU, Memória (RAM) e Disco** das últimas 24 horas.
  - Memória batendo em 90–100% ou caindo de repente = o servidor está ficando sem memória e reiniciando o WhatsApp.
  - Disco acima de 90% = falta de espaço no servidor.
- Tire print desses gráficos e me envie.

## 2. Terminal (para quem cuida do servidor)
Acessar pelo botão **Terminal do navegador** no hPanel e rodar, um por vez:

```text
free -h                      # memória livre
df -h                        # espaço em disco
docker ps                    # mostra se a Evolution reinicia (coluna STATUS "Up X minutes")
docker stats --no-stream     # memória usada por cada parte
dmesg -T | grep -i -E "killed process|out of memory" | tail -20
docker logs --since 2h <nome-do-container-evolution> 2>&1 | grep -i -E "error|close|restart|lid" | tail -50
```

O que cada resultado significa:
- "Up 20 minutes" no `docker ps` = a Evolution está reiniciando sozinha. Confirma a causa.
- "Killed process" ou "out of memory" = falta de memória. Solução: aumentar o plano da VPS (mais RAM) ou limitar o histórico salvo.
- Muitos erros com "lid" ou "Connection Closed" = falha da versão 2.3.7. Solução: atualizar a Evolution.

## 3. Soluções possíveis, de acordo com o que aparecer
1. **Falta de memória**: subir a VPS para um plano com pelo menos 4 GB de RAM. Também dá para desligar o salvamento de histórico na Evolution (`DATABASE_SAVE_DATA_HISTORIC=false`, `DATABASE_SAVE_MESSAGE_UPDATE=false`).
2. **Disco cheio**: apagar logs e mídias antigas da Evolution, ou aumentar o disco da VPS.
3. **Problema da versão**: fazer backup e atualizar a Evolution para a versão estável mais recente. Depois, ler um QR Code novo no Centro e no Cinco Conjuntos.

## 4. Depois
Me envie os prints ou o texto que aparecer. Eu confirmo qual é a causa e acompanho pelo app se as quedas pararam.
