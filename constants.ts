
/**
 * O nome que aparece na tela, e o único lugar onde ele mora.
 *
 * Estava declarado aqui desde o começo e nenhuma tela o usava — cada uma
 * escrevia "CONEXÃO" à mão. A troca para QICONEXÃO, em 06/09/2026, custou
 * dez arquivos por causa disso; a próxima custa esta linha.
 */
export const APP_NAME = 'QICONEXÃO';
export const APP_TAGLINE = 'Trabalho, negócios e quem sabe fazer.';
export const POLICY_VERSION = '2026.2';

/**
 * ATENÇÃO: esta chave e as irmãs dela (`conexao.auth` em supabaseClient.ts,
 * `conexao.cadastro.rascunho` em signupDraft.ts) NÃO acompanham o nome do
 * produto. Elas nomeiam o que já está guardado no navegador de quem usa o
 * app: mudá-las desloga todo mundo e apaga cadastros pela metade, sem erro
 * nenhum que explique. O mesmo vale para `conexao_user_id` na metadata do
 * Stripe e para o endereço do site.
 */
export const STORAGE_KEY = 'conexao.state.v1';
/**
 * Continua valendo — os Termos são para maiores de 18. O que mudou é COMO se
 * comprova: o app não guarda mais data de nascimento, guarda o consentimento
 * `maioridade` dado no cadastro. Dado que não é usado não deve ser coletado.
 */
export const MIN_AGE = 18;

// A Política de Privacidade é uma PÁGINA ESTÁTICA, e não uma tela do app.
//
// Tem de ser assim: o Google Play exige um endereço público, que abra sem
// login e sem instalar nada — e este app é uma única tela controlada por
// estado, sem rotas. `public/privacidade.html` vai para a raiz do site no
// build, então o endereço existe para qualquer pessoa, inclusive para o
// robô que revisa a loja.
//
// Sempre aberta em aba nova: quem clica no meio do cadastro não pode perder
// o que já preencheu por ler aquilo que está aceitando.
export const URL_PRIVACIDADE = '/privacidade.html';
export const URL_TERMOS = '/termos.html';
export const URL_DIRETRIZES = '/diretrizes.html';

export const REPORT_REASON_LABEL: Record<string, string> = {
  perfil_falso: 'Perfil falso',
  assedio: 'Assédio',
  conteudo_ofensivo: 'Conteúdo ofensivo',
  golpe: 'Golpe ou fraude',
  sexual_inadequado: 'Conteúdo sexual inadequado',
  spam: 'Spam',
  menor_de_idade: 'Suspeita de menor de idade',
  outro: 'Outro',
};

/**
 * O QUE CADA PLANO DÁ.
 *
 * O modelo decidido em 25/09/2026, e a razão de ser dele:
 *
 *   PUBLICAR ANÚNCIO É DE GRAÇA, SEMPRE, PARA TODO MUNDO.
 *
 * Não é generosidade: é a economia de qualquer marketplace. Cobra-se do lado
 * ABUNDANTE e subsidia-se o lado ESCASSO. Em Brasília, na contabilidade e nas
 * licenças, há muito mais contador procurando cliente do que empresa
 * procurando contador. Quem publica traz o combustível — cobrar dele é apagar
 * o fogo e depois reclamar do frio.
 *
 * Quem paga é o profissional, e só quando já tirou valor: as três propostas
 * gratuitas por mês existem para ele fechar uma antes de assinar. Não se vende
 * acesso a uma sala vazia.
 *
 * O LIMITE DE VERDADE ESTÁ NO BANCO, não aqui. O gatilho
 * `private.cota_de_propostas` recusa a quarta proposta do mês de quem está no
 * gratuito (migração 016). Estes números servem para a tela avisar ANTES, e
 * têm de bater com os de lá.
 */
export interface PlanQuota {
  /** Propostas por MÊS. É a única cota que separa os planos de verdade. */
  propostasPorMes: number;
  /**
   * Pedidos de conversa por dia. NÃO é monetização — é anti-spam, e por isso
   * os dois planos têm um número generoso. Quem dispara mensagem para todo
   * mundo não fecha negócio com ninguém.
   */
  conversasPorDia: number;
  /** Sugestões do Copiloto por dia. */
  dailyAiCalls: number;
  /** Filtros avançados na busca por profissionais. */
  filtrosAvancados: boolean;
}

/** Quanto custa o Premium. Tem de bater com o preço cadastrado no Stripe. */
export const PRECO_PREMIUM = 'R$ 39,90';

export const QUOTAS: Record<'free' | 'premium', PlanQuota> = {
  free:    { propostasPorMes: 3,        conversasPorDia: 10, dailyAiCalls: 8,   filtrosAvancados: false },
  premium: { propostasPorMes: Infinity, conversasPorDia: 40, dailyAiCalls: 100, filtrosAvancados: true },
};

/** "3" ou "Ilimitado" — o `Infinity` nunca chega cru a uma tela. */
export const quantidade = (n: number): string => (Number.isFinite(n) ? String(n) : 'Ilimitado');

/**
 * Os degraus de uma conversa, do primeiro "bom dia" ao acordo.
 *
 * Substituem os VEIL_STAGES, que mediam quanto da FOTO já estava revelada —
 * mecânica de aplicativo de namoro que não sobrevive ao pivô: num mercado de
 * trabalho a foto é nítida desde o primeiro segundo, e esconder a cara de quem
 * vai entrar na sua obra é o contrário de confiança.
 *
 * O que continua fazendo sentido é medir se a conversa ANDA: quem fala sozinho,
 * quem some, quem responde. Isso vale igual para negócio.
 */
export const ETAPAS_DA_CONVERSA = [
  { label: 'Primeiro contato', min: 0,  note: 'Vocês acabaram de começar.' },
  { label: 'Conversando',      min: 20, note: 'A conversa começou a ganhar corpo.' },
  { label: 'Entendendo',       min: 40, note: 'Vocês estão se ouvindo de verdade.' },
  { label: 'Alinhando',        min: 62, note: 'Já dá para falar de prazo e preço.' },
  { label: 'Pronto',           min: 82, note: 'Está na hora de fechar o combinado.' },
] as const;
