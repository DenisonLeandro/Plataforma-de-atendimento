export const CONVERSATION_TOPICS = {
  // Comercial
  vendas: 'Vendas',
  cobranca: 'Cobrança',
  renovacao: 'Renovação',

  // Suporte
  duvida_tecnica: 'Dúvida Técnica',
  duvida_produto: 'Dúvida Produto',
  acesso: 'Acesso',

  // Relacionamento
  feedback: 'Feedback',
  cancelamento: 'Cancelamento',
  onboarding: 'Onboarding',

  // Operacional
  agendamento: 'Agendamento',
  documentacao: 'Documentação',
  atualizacao_cadastral: 'Atualização Cadastral',

  // Outros
  geral: 'Geral',
  spam: 'Spam',

  // Serviços / Comercial
  interesse_servico: 'Interesse em Serviço',
  orcamento: 'Orçamento',
  contratacao: 'Contratação',
  planos_valores: 'Planos e Valores',
  disponibilidade: 'Disponibilidade',

  // Serviços / Atendimento
  reagendamento: 'Reagendamento',
  acompanhamento: 'Acompanhamento',
  prazo_execucao: 'Prazo de Execução',
  duvida_servico: 'Dúvida sobre Serviço',

  // Serviços / Operacional
  envio_comprovante: 'Envio de Comprovante',
  suporte_operacional: 'Suporte Operacional',

  // Serviços / Financeiro
  pagamento: 'Pagamento',
  mensalidade: 'Mensalidade',
  reembolso: 'Reembolso',

  // Serviços / Relacionamento
  reclamacao: 'Reclamação',
  pos_atendimento: 'Pós-atendimento',
} as const;

export type ConversationTopic = keyof typeof CONVERSATION_TOPICS;

export const TOPIC_COLORS: Record<string, string> = {
  // Comercial - tons de verde/amarelo
  vendas: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cobranca: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  renovacao: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',

  // Suporte - tons de azul
  duvida_tecnica: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  duvida_produto: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  acesso: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',

  // Relacionamento - tons de roxo/rosa/vermelho
  feedback: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  cancelamento: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  onboarding: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',

  // Operacional - tons de laranja/âmbar
  agendamento: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  documentacao: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  atualizacao_cadastral: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',

  // Outros - tons de cinza
  geral: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  spam: 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100',

  // Serviços / Comercial - verdes/teal (positivos)
  interesse_servico: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  orcamento: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  contratacao: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  planos_valores: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  disponibilidade: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',

  // Serviços / Atendimento - azuis
  reagendamento: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  acompanhamento: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  prazo_execucao: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  duvida_servico: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',

  // Serviços / Operacional - âmbar/laranja
  envio_comprovante: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  suporte_operacional: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',

  // Serviços / Financeiro - amarelo/rosa (financeiro, sem parecer erro)
  pagamento: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  mensalidade: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  reembolso: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',

  // Serviços / Relacionamento - vermelho/roxo
  reclamacao: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  pos_atendimento: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

// Cores para gráficos (HSL)
export const TOPIC_CHART_COLORS: Record<string, string> = {
  vendas: 'hsl(142, 76%, 36%)',
  cobranca: 'hsl(48, 96%, 53%)',
  renovacao: 'hsl(160, 84%, 39%)',
  duvida_tecnica: 'hsl(221, 83%, 53%)',
  duvida_produto: 'hsl(239, 84%, 67%)',
  acesso: 'hsl(189, 94%, 43%)',
  feedback: 'hsl(271, 81%, 56%)',
  cancelamento: 'hsl(0, 84%, 60%)',
  onboarding: 'hsl(330, 81%, 60%)',
  agendamento: 'hsl(24, 95%, 53%)',
  documentacao: 'hsl(38, 92%, 50%)',
  atualizacao_cadastral: 'hsl(84, 81%, 44%)',
  geral: 'hsl(215, 16%, 47%)',
  spam: 'hsl(0, 72%, 51%)',

  // Serviços / Comercial
  interesse_servico: 'hsl(172, 66%, 45%)',
  orcamento: 'hsl(142, 70%, 42%)',
  contratacao: 'hsl(160, 84%, 39%)',
  planos_valores: 'hsl(174, 62%, 40%)',
  disponibilidade: 'hsl(150, 65%, 45%)',

  // Serviços / Atendimento
  reagendamento: 'hsl(200, 90%, 55%)',
  acompanhamento: 'hsl(217, 80%, 55%)',
  prazo_execucao: 'hsl(230, 70%, 60%)',
  duvida_servico: 'hsl(189, 85%, 45%)',

  // Serviços / Operacional
  envio_comprovante: 'hsl(38, 92%, 50%)',
  suporte_operacional: 'hsl(28, 92%, 52%)',

  // Serviços / Financeiro
  pagamento: 'hsl(48, 90%, 50%)',
  mensalidade: 'hsl(42, 88%, 52%)',
  reembolso: 'hsl(340, 75%, 60%)',

  // Serviços / Relacionamento
  reclamacao: 'hsl(0, 80%, 55%)',
  pos_atendimento: 'hsl(271, 70%, 58%)',
};
