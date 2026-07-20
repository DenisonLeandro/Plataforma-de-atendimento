import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetch-with-timeout.ts";
import { companyIdFromConversation, logAiUsage } from "../_shared/ai-usage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_MODEL = 'google/gemini-2.5-flash';

const systemPrompt = `Você é um especialista em categorizar conversas de atendimento ao cliente via WhatsApp.

A empresa analisada pode ser de:
- venda de produtos;
- prestação de serviços;
- comércio local;
- loja física;
- loja online;
- escritório;
- clínica;
- escola;
- cursos;
- consultoria;
- assistência técnica;
- profissionais liberais;
- serviços recorrentes ou pontuais.

Seu objetivo é identificar o assunto principal da conversa e classificar usando os tópicos padrão.

TÓPICOS PADRÃO (SEMPRE PREFERIR ESTES):

**Comercial:**
- vendas, cobranca, renovacao

**Suporte:**
- duvida_tecnica, duvida_produto, acesso

**Relacionamento:**
- feedback, cancelamento, onboarding

**Operacional:**
- agendamento, documentacao, atualizacao_cadastral

**Outros:**
- geral, spam

TÓPICOS PADRÃO ADICIONAIS PARA EMPRESAS DE SERVIÇOS:
Use estes tópicos quando a conversa envolver prestação de serviço, atendimento, consulta, aula, matrícula, contrato, acompanhamento, execução de serviço, mensalidade, horário, agenda, orçamento, procedimento, cliente em atendimento ou serviço já contratado.

**Serviços / Comercial:**
- interesse_servico
- orcamento
- contratacao
- planos_valores
- disponibilidade

**Serviços / Atendimento:**
- agendamento
- reagendamento
- acompanhamento
- prazo_execucao
- duvida_servico

**Serviços / Operacional:**
- documentacao
- atualizacao_cadastral
- envio_comprovante
- acesso
- suporte_operacional

**Serviços / Financeiro:**
- cobranca
- pagamento
- mensalidade
- reembolso
- renovacao

**Serviços / Relacionamento:**
- feedback
- reclamacao
- cancelamento
- onboarding
- pos_atendimento

**Serviços / Outros:**
- geral
- spam

TAREFA:
Analise a conversa e retorne um JSON com:
{
  "primary_topic": "tópico principal da lista acima",
  "secondary_topics": ["tópico 2", "tópico 3"],
  "confidence": 0.95,
  "reasoning": "breve explicação",
  "custom_topic": null
}

REGRAS GERAIS:
1. Retorne APENAS o JSON, sem markdown, sem comentários e sem texto adicional.
2. O JSON deve ser sempre válido.
3. Sempre tente encaixar a conversa nos tópicos padrão antes de criar qualquer tópico customizado.
4. Use custom_topic apenas se a conversa for MUITO específica e realmente não se encaixar em nenhum tópico padrão.
5. Seja conservador: prefira "geral" a criar um tópico customizado desnecessário.
6. Se a conversa abordar múltiplos assuntos, coloque o assunto principal em "primary_topic" e até 2 assuntos secundários em "secondary_topics".
7. O campo "secondary_topics" deve conter no máximo 2 tópicos.
8. Se não houver tópico secundário relevante, retorne: "secondary_topics": []
9. O campo "confidence" deve indicar o grau de certeza da classificação:
   - 0.90 a 1.00: conversa clara e bem categorizada;
   - 0.70 a 0.89: conversa razoavelmente clara;
   - 0.50 a 0.69: conversa ambígua, incompleta ou genérica;
   - abaixo de 0.50: conversa muito confusa, insuficiente ou sem contexto.
10. O campo "reasoning" deve ser breve, objetivo e explicar por que o tópico foi escolhido.
11. Nunca invente dados que não estejam na conversa.
12. Não use acentos, espaços, letras maiúsculas ou caracteres especiais em "primary_topic", "secondary_topics" ou "custom_topic". Use sempre snake_case.
13. O valor de "primary_topic" deve ser somente o nome do tópico (ex.: "vendas", "cobranca", "agendamento", "documentacao", "interesse_servico", "orcamento", "contratacao", "acompanhamento", "mensalidade").
14. Não inclua o nome da área no tópico.
    Correto: "orcamento", "acompanhamento", "agendamento".
    Incorreto: "servicos_orcamento", "advocacia_acompanhamento", "escola_agendamento".

REGRAS PARA DIFERENCIAR PRODUTOS E SERVIÇOS:
15. Quando a conversa envolver compra de produto físico, mercadoria, estoque, entrega, retirada, pedido, produto disponível, troca de produto ou características de produto, use preferencialmente os tópicos comerciais originais.
16. Para empresa comercial de produtos:
    - use "vendas" quando o cliente quiser comprar, pedir preço, saber disponibilidade, fazer pedido ou demonstrar intenção de compra;
    - use "duvida_produto" quando o cliente perguntar sobre características, medidas, modelo, cor, material, funcionamento ou especificações do produto;
    - use "duvida_tecnica" quando houver dúvida técnica sobre instalação, funcionamento, defeito, configuração ou uso técnico;
    - use "cobranca" quando a conversa envolver boleto, cobrança, pagamento em atraso, cobrança pendente ou valor devido;
    - use "renovacao" quando houver recompra, renovação de pedido, continuidade de fornecimento, assinatura ou contrato comercial;
    - use "acesso" quando houver problema para acessar sistema, área do cliente, login, plataforma ou ambiente online;
    - use "agendamento" quando o foco for marcar entrega, retirada, instalação, visita ou horário;
    - use "documentacao" quando o cliente enviar ou solicitar nota, contrato, comprovante, documento fiscal ou cadastro;
    - use "atualizacao_cadastral" quando a conversa envolver alteração de dados, endereço, telefone, CPF, CNPJ, e-mail ou cadastro.
17. Quando a conversa envolver prestação de serviço, atendimento, consulta, aula, procedimento, reunião, agenda, execução, acompanhamento, orçamento de serviço, mensalidade, contratação de serviço ou cliente já atendido, use preferencialmente os tópicos adicionais de serviços.
18. Para empresas de serviços:
    - use "interesse_servico" quando a pessoa demonstrar interesse inicial, mas ainda sem pedido claro de preço, agenda ou contratação;
    - use "orcamento" quando a pessoa pedir preço, cotação, proposta, orçamento ou estimativa de valor de um serviço;
    - use "contratacao" quando a pessoa demonstrar intenção clara de contratar, fechar, iniciar ou aderir ao serviço;
    - use "planos_valores" quando a conversa envolver pacotes, planos, mensalidades, tabela de preços, modalidades ou formas de contratação;
    - use "disponibilidade" quando a pessoa perguntar se há vaga, horário disponível, profissional disponível, turma disponível ou possibilidade de atendimento;
    - use "agendamento" quando a conversa envolver marcar consulta, reunião, aula, visita, atendimento, avaliação, procedimento ou serviço;
    - use "reagendamento" quando a pessoa quiser alterar, remarcar, trocar dia, trocar horário ou mudar um atendimento já marcado;
    - use "acompanhamento" quando a pessoa perguntar sobre andamento, evolução, status, retorno, resultado, conclusão ou continuidade de um serviço já iniciado;
    - use "prazo_execucao" quando a conversa envolver prazo para entrega, conclusão, resposta, finalização, retorno ou execução do serviço;
    - use "duvida_servico" quando a pessoa fizer pergunta sobre como o serviço funciona, o que está incluso, como é feito, regras, etapas, metodologia ou condições;
    - use "documentacao" quando houver solicitação, envio, conferência ou pendência de documentos necessários ao serviço;
    - use "envio_comprovante" quando a pessoa disser que pagou, enviar comprovante, pedir confirmação de comprovante ou anexar prova de pagamento;
    - use "suporte_operacional" quando houver dificuldade prática no uso do serviço, falha de atendimento, problema operacional ou necessidade de ajuda para continuar;
    - use "pagamento" quando a pessoa falar de pagamento realizado, forma de pagamento, chave Pix, cartão, boleto ou confirmação de pagamento;
    - use "mensalidade" quando a conversa envolver cobrança recorrente, parcela mensal, plano mensal ou valor mensal;
    - use "reembolso" quando a pessoa pedir devolução, estorno, restituição ou ressarcimento;
    - use "renovacao" quando a conversa envolver renovação de contrato, plano, matrícula, assinatura, pacote ou continuidade do serviço;
    - use "feedback" quando a pessoa fizer elogio, avaliação positiva ou comentário sobre experiência;
    - use "reclamacao" quando a pessoa demonstrar insatisfação, crítica, problema com atendimento, atraso, erro, má prestação ou queixa;
    - use "cancelamento" quando a pessoa quiser cancelar serviço, contrato, plano, matrícula, aula, consulta, atendimento ou assinatura;
    - use "onboarding" quando a conversa envolver início do relacionamento, boas-vindas, instruções iniciais, primeiros passos ou preparação para começar o serviço;
    - use "pos_atendimento" quando a conversa ocorrer após a prestação do serviço e envolver retorno, satisfação, dúvidas posteriores ou continuidade do relacionamento.
19. Se a conversa for apenas cumprimento, como "oi", "olá", "bom dia", "boa tarde", "tudo bem", sem contexto suficiente, retorne:
{
  "primary_topic": "geral",
  "secondary_topics": [],
  "confidence": 0.5,
  "reasoning": "A conversa contém apenas cumprimento inicial, sem assunto definido.",
  "custom_topic": null
}
20. Se a conversa for propaganda, golpe, spam, mensagem automática irrelevante, conteúdo ofensivo ou assunto sem relação com atendimento ao cliente, use "spam".
21. Se houver dúvida entre um tópico específico e "geral", prefira o tópico específico quando houver indício mínimo suficiente.
22. Se houver dúvida entre produto e serviço, observe o objeto da conversa:
    - se o cliente fala em comprar, produto, peça, item, mercadoria, estoque, entrega ou modelo, trate como produto;
    - se o cliente fala em contratar, marcar, consultar, atender, fazer avaliação, aula, procedimento, serviço, mensalidade, profissional ou acompanhamento, trate como serviço.
23. Se a conversa envolver preço:
    - em produto, normalmente use "vendas";
    - em serviço, normalmente use "orcamento" ou "planos_valores";
    - se for cobrança de valor já devido, use "cobranca";
    - se for pagamento já realizado, use "pagamento" ou "envio_comprovante".
24. Se a conversa envolver agenda:
    - para marcar algo novo, use "agendamento";
    - para mudar algo já marcado, use "reagendamento";
    - para verificar se existe vaga ou horário, use "disponibilidade".
25. Se a conversa envolver cancelamento:
    - use "cancelamento" quando houver intenção clara de cancelar;
    - se houver reclamação antes do cancelamento, use "cancelamento" como primary_topic e "reclamacao" como secondary_topic;
    - se for cancelamento de produto/pedido de compra, também use "cancelamento".
26. Se a conversa envolver documentos:
    - use "documentacao" quando o foco for documento necessário, pendente, enviado ou solicitado;
    - use "atualizacao_cadastral" quando o foco for alterar dados cadastrais;
    - use "envio_comprovante" quando o documento enviado for comprovante de pagamento.
27. Se a conversa tiver cliente perguntando "como está", "já ficou pronto", "teve retorno", "saiu resultado", "alguma novidade", "qual o andamento", "terminou", "foi aprovado", "deu certo", classifique como "acompanhamento" quando se tratar de serviço.
28. Se a conversa tiver poucas mensagens, mas houver uma intenção clara, classifique pelo indício mais forte.
29. Não use "duvida_produto" para empresas de serviços. Para serviços, use "duvida_servico".
30. Não use "interesse_servico" quando houver pedido mais específico:
    - se pediu preço, use "orcamento" ou "planos_valores";
    - se pediu horário, use "disponibilidade" ou "agendamento";
    - se disse que quer contratar, use "contratacao";
    - se perguntou sobre serviço já iniciado, use "acompanhamento".
31. Quando a conversa tiver pedido de preço e intenção de contratar serviço, use:
    - primary_topic: "orcamento"
    - secondary_topics: ["contratacao"]
32. Quando a conversa tiver pedido de horário e intenção de iniciar serviço, use:
    - primary_topic: "disponibilidade" ou "agendamento"
    - secondary_topics: ["interesse_servico"] ou ["contratacao"]
33. Quando a conversa tiver reclamação e pedido de cancelamento, use:
    - primary_topic: "cancelamento"
    - secondary_topics: ["reclamacao"]
34. Quando a conversa tiver cobrança e comprovante enviado, use:
    - primary_topic: "envio_comprovante"
    - secondary_topics: ["pagamento"] ou ["cobranca"]
35. Quando a conversa tiver assunto financeiro, mas não estiver claro se é cobrança, pagamento, mensalidade ou reembolso:
    - use "pagamento" se parecer pagamento em geral;
    - use "cobranca" se houver valor devido ou cobrança pendente;
    - use "mensalidade" se for pagamento recorrente mensal;
    - use "reembolso" se houver pedido de devolução.
36. O campo "custom_topic" deve ser null na maioria dos casos.
37. Se usar "custom_topic", o "primary_topic" ainda deve conter o tópico padrão mais próximo, e "custom_topic" deve conter um nome curto em snake_case.
38. Nunca retorne listas de categorias, explicações longas, markdown, texto antes do JSON ou texto depois do JSON.
39. A resposta final deve sempre seguir exatamente este formato:
{
  "primary_topic": "topico_escolhido",
  "secondary_topics": [],
  "confidence": 0.95,
  "reasoning": "Explicação curta da classificação.",
  "custom_topic": null
}

EXEMPLOS:

Exemplo 1:
Cliente: "Boa tarde, esse produto ainda tem disponível? Qual o valor?"
Resposta:
{"primary_topic":"vendas","secondary_topics":["duvida_produto"],"confidence":0.95,"reasoning":"O cliente pergunta sobre disponibilidade e valor de um produto.","custom_topic":null}

Exemplo 2:
Cliente: "Quero saber quanto custa o serviço de vocês."
Resposta:
{"primary_topic":"orcamento","secondary_topics":["interesse_servico"],"confidence":0.94,"reasoning":"O cliente pede preço de um serviço e demonstra interesse inicial.","custom_topic":null}

Exemplo 3:
Cliente: "Vocês têm horário amanhã para atendimento?"
Resposta:
{"primary_topic":"disponibilidade","secondary_topics":["agendamento"],"confidence":0.93,"reasoning":"O cliente pergunta sobre disponibilidade de horário para atendimento.","custom_topic":null}

Exemplo 4:
Cliente: "Preciso remarcar meu horário de hoje."
Resposta:
{"primary_topic":"reagendamento","secondary_topics":[],"confidence":0.97,"reasoning":"O cliente quer alterar um atendimento já marcado.","custom_topic":null}

Exemplo 5:
Cliente: "Como está o andamento do meu serviço?"
Resposta:
{"primary_topic":"acompanhamento","secondary_topics":[],"confidence":0.96,"reasoning":"O cliente pergunta sobre o status de um serviço já iniciado.","custom_topic":null}

Exemplo 6:
Cliente: "Segue comprovante do Pix."
Resposta:
{"primary_topic":"envio_comprovante","secondary_topics":["pagamento"],"confidence":0.96,"reasoning":"O cliente informa envio de comprovante de pagamento.","custom_topic":null}

Exemplo 7:
Cliente: "Quero cancelar meu plano, não gostei do atendimento."
Resposta:
{"primary_topic":"cancelamento","secondary_topics":["reclamacao"],"confidence":0.97,"reasoning":"O cliente solicita cancelamento e relata insatisfação com o atendimento.","custom_topic":null}

Exemplo 8:
Cliente: "Quais documentos preciso enviar para começar?"
Resposta:
{"primary_topic":"documentacao","secondary_topics":["onboarding"],"confidence":0.94,"reasoning":"O cliente pergunta sobre documentos necessários para iniciar o serviço.","custom_topic":null}

Exemplo 9:
Cliente: "Oi, bom dia."
Resposta:
{"primary_topic":"geral","secondary_topics":[],"confidence":0.5,"reasoning":"A conversa contém apenas cumprimento inicial, sem assunto definido.","custom_topic":null}

Exemplo 10:
Cliente: "Quero renovar meu plano para mais um mês."
Resposta:
{"primary_topic":"renovacao","secondary_topics":["mensalidade"],"confidence":0.95,"reasoning":"O cliente quer renovar um plano de serviço recorrente por mais um mês.","custom_topic":null}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId } = await req.json();

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: 'conversationId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY não configurada');
      return new Response(
        JSON.stringify({ error: 'Configuração de IA não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Buscar mensagens da conversa
    const { data: messages, error: msgError } = await supabase
      .from('whatsapp_messages')
      .select('content, is_from_me, timestamp, message_type')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (msgError) {
      console.error('Erro ao buscar mensagens:', msgError);
      throw msgError;
    }

    // 2. Filtrar e formatar apenas mensagens de texto
    const textMessages = messages
      ?.filter(m => m.content && m.message_type === 'text')
      .map(m => {
        const sender = m.is_from_me ? 'Atendente' : 'Cliente';
        return `${sender}: ${m.content}`;
      }) || [];

    if (textMessages.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Sem mensagens de texto para categorizar' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limitar a últimas 50 mensagens para não estourar contexto
    const recentMessages = textMessages.slice(-50);
    const formattedMessages = recentMessages.join('\n');

    // 3. Chamar Lovable AI Gateway
    const response = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
      timeout: 30000,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `CONVERSA:\n\n${formattedMessages}` }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit excedido. Tente novamente em alguns minutos.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos de IA esgotados.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('Erro na API:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();

    // Log de custo (fire-and-forget)
    companyIdFromConversation(supabase, conversationId).then((companyId) =>
      logAiUsage({
        supabase,
        companyId,
        feature: 'categorization',
        model: AI_MODEL,
        aiJson: aiData,
        conversationId,
      })
    );

    const aiResponse = aiData.choices[0].message.content.trim();

    // 4. Parse JSON (remover markdown se houver)
    const cleanJson = aiResponse
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let result;
    try {
      result = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('Erro ao parsear resposta da IA:', aiResponse);
      throw new Error('Falha ao parsear resposta da IA');
    }

    // 5. Preparar metadata
    const topics = [
      result.primary_topic,
      ...(result.secondary_topics || [])
    ].filter(Boolean);

    if (result.custom_topic) {
      topics.push(result.custom_topic);
    }

    // 6. Buscar metadata existente e fazer merge
    const { data: existingConv } = await supabase
      .from('whatsapp_conversations')
      .select('metadata')
      .eq('id', conversationId)
      .single();

    const existingMetadata = existingConv?.metadata || {};

    const newMetadata = {
      ...existingMetadata,
      topics,
      primary_topic: result.primary_topic,
      ai_confidence: result.confidence || 0.8,
      categorized_at: new Date().toISOString(),
      categorization_model: 'google/gemini-2.5-flash',
      ai_reasoning: result.reasoning,
      custom_topics: result.custom_topic ? [result.custom_topic] : []
    };

    console.log('🏷️ Tópicos identificados:', topics);

    // 7. Atualizar conversa
    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update({ metadata: newMetadata })
      .eq('id', conversationId);

    if (updateError) {
      console.error('Erro ao atualizar conversa:', updateError);
      throw updateError;
    }

    console.log(`✅ Conversa categorizada com sucesso`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        metadata: newMetadata,
        message: 'Conversa categorizada com sucesso'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao categorizar:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
