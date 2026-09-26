// ---------------------------------------------------------------------------
// QICONEXÃO — modelo de domínio
//
// Em setembro de 2026 o produto mudou de assunto: deixou de aproximar pessoas
// por afinidade e passou a aproximá-las por TRABALHO. Estes tipos acompanharam.
//
// O que saiu daqui — gênero, idade, objetivo de relacionamento, bússola de
// personalidade, estilo de vida, interesses, preferências de descoberta — não
// foi "desativado": foi removido. Campo morto num modelo de domínio é uma
// pergunta que alguém vai acabar respondendo errado.
// ---------------------------------------------------------------------------

export type AccountStatus = 'ativo' | 'suspenso' | 'banido';
export type Plan = 'free' | 'premium';

export type ConsentKind = 'termos' | 'privacidade' | 'diretrizes' | 'maioridade' | 'dados_sensiveis';

export interface Consent {
  kind: ConsentKind;
  version: string;
  acceptedAt: string;
}

// ---------------------------------------------------------------------------
// Um `User` chega por dois caminhos, e eles carregam coisas diferentes.
//
//   • O PRÓPRIO registro, lido direto de `public.users`: vem completo.
//   • Um registro de TERCEIRO, lido da view `perfis_do_mercado`: vem só com o
//     crachá — nome, profissão, cidade, foto, verificado, reputação.
//
// Os campos opcionais abaixo marcam exatamente essa diferença. Não é descuido
// de tipagem: é o vazamento de dado pessoal corrigido em 03/09/2026 ficando
// visível no tipo, para que o compilador recuse quem tentar usá-los sem checar.
// ---------------------------------------------------------------------------
export interface User {
  id: string;
  name: string;
  /** Só do próprio registro (e para administração). Nunca de terceiros. */
  email?: string;
  /** Demo: SHA-256 no navegador. Em produção isto vive no provedor de auth. */
  passwordHash: string;
  city: string;
  state: string;
  /**
   * Coordenada APROXIMADA (arredondada a ~0.05°, ≈5 km). Nunca a exata, e
   * nunca de terceiros: a base inteira de coordenadas permite trilateração.
   */
  approxLat?: number;
  approxLng?: number;
  /** Distância até quem está olhando, em km. Calculada no servidor. */
  distanceKm?: number;
  photo?: string; // dataURL; ausente => retrato generativo determinístico
  extraPhotos: string[];

  // ------------------------------ o profissional ----------------------------

  /** Como a pessoa se apresenta: "Contadora", "Engenheiro civil". */
  profession: string;
  /** O resumo profissional. Substituiu a bio de relacionamento. */
  bio: string;
  /** Em que atua — ids de `public.categorias`. No máximo 5, e o banco cobra. */
  especialidades: string[];
  /** Trabalha a distância. Entra na busca por profissionais. */
  atendeRemoto: boolean;
  anosExperiencia?: number;
  /**
   * SÓ DO PRÓPRIO REGISTRO, e nem a view do crachá o carrega.
   *
   * O telefone não aparece em perfil nenhum: ele é revelado aos dois lados
   * quando uma proposta é aceita, pela função `contato_do_negocio` no banco.
   * Ver supabase/migrations/012_perfil_profissional.sql.
   */
  telefone?: string;

  verified: boolean;
  /** Reputação 0..100. */
  reputation: number;
  plan: Plan;
  /**
   * Só do próprio registro. A busca não recebe o papel de ninguém — antes
   * recebia, só para filtrar administradores no cliente, o que equivalia a
   * entregar a lista de administradores a todo mundo.
   */
  role?: 'user' | 'admin';
  status: AccountStatus;
  consents: Consent[];
  createdAt: string;
  lastActiveAt: string;
}

export type ConnectionStatus =
  | 'sugerida'    // curadoria do dia, ainda sem ação
  | 'pendente'    // um lado demonstrou interesse
  | 'conectada'   // interesse mútuo
  | 'recusada'
  | 'encerrada'
  | 'bloqueada';

export interface Connection {
  id: string;
  userA: string;
  userB: string;
  status: ConnectionStatus;
  /** quem demonstrou interesse: { [userId]: true } */
  likes: Record<string, boolean>;
  favorite: Record<string, boolean>;
  createdAt: string;
  connectedAt?: string;
  closedBy?: string;
  closedReason?: string;
  closedGently?: boolean;
}

export type MessageKind = 'texto' | 'imagem' | 'ritual' | 'sistema';

export interface Message {
  id: string;
  connectionId: string;
  senderId: string;
  kind: MessageKind;
  text: string;
  imageData?: string;
  ritualLevel?: 1 | 2 | 3 | 4;
  createdAt: string;
  readAt?: string;
  moderation?: ModerationResult;
}

export type RiskLevel = 'ok' | 'atencao' | 'risco';
export type RiskCategory =
  | 'financeiro'
  | 'contato_externo'
  | 'sexual_explicito'
  | 'odio'
  | 'assedio'
  | 'spam'
  | 'menor_de_idade';

export interface ModerationResult {
  level: RiskLevel;
  categories: RiskCategory[];
  advice: string;
  source: 'heuristica' | 'ia';
}

export type ReportReason =
  | 'perfil_falso'
  | 'assedio'
  | 'conteudo_ofensivo'
  | 'golpe'
  | 'sexual_inadequado'
  | 'spam'
  | 'menor_de_idade'
  | 'outro';

export type ReportStatus = 'aberta' | 'em_analise' | 'procedente' | 'improcedente';

export interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  evidenceMessageIds: string[];
  createdAt: string;
  resolvedAt?: string;
  adminNote?: string;
}

export interface ModerationItem {
  id: string;
  messageId: string;
  connectionId: string;
  authorId: string;
  excerpt: string;
  result: ModerationResult;
  status: 'pendente' | 'liberado' | 'removido';
  createdAt: string;
}

export type NotificationKind = 'conexao' | 'mensagem' | 'curadoria' | 'solicitacao' | 'sistema' | 'seguranca';

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: Route;
  read: boolean;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: Plan;
  status: 'ativa' | 'cancelada' | 'expirada';
  /**
   * Quem concedeu. `'stripe'` é assinatura paga; `'cortesia'` é a promoção de
   * lançamento, que ninguém pagou e que expira sozinha. A tela precisa saber a
   * diferença: oferecer "gerenciar cobrança" a quem ganhou de graça manda a
   * pessoa para um portal do Stripe que não conhece a assinatura dela.
   */
  provider?: string;
  startedAt: string;
  expiresAt?: string;
}

export interface Block {
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

/** Registro de uso diário — sustenta as cotas do plano gratuito. */
export interface DailyUsage {
  userId: string;
  date: string; // yyyy-mm-dd
  /**
   * Quantos pedidos de conversa hoje. A coluna no banco se chamava `interests`
   * — nome do app de relacionamentos — e passou a se chamar `contatos` na
   * migração 017. Não há mais mapeamento: o nome é o mesmo dos dois lados.
   */
  contatos: number;
  aiCalls: number;
}

// --------------------------- roteamento -----------------------------------

export type Route =
  | { name: 'landing' }
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'recuperarSenha' }
  | { name: 'redefinirSenha' }
  | { name: 'home' }
  | { name: 'profissionais' }          // quem faz o quê, e onde
  // ------------------------------ o mercado --------------------------------
  | { name: 'anuncios' }                 // buscar trabalho
  | { name: 'anuncio'; id: string }      // um anúncio, e propor nele
  | { name: 'publicar' }                 // publicar o que você precisa
  | { name: 'meusAnuncios' }             // o que publiquei, e quem respondeu
  | { name: 'minhasPropostas' }          // onde me ofereci
  | { name: 'person'; id: string }  // o perfil profissional de alguém
  | { name: 'connections' }
  | { name: 'chats' }
  | { name: 'chat'; id: string }
  | { name: 'profile' }
  | { name: 'profileEdit' }
  | { name: 'premium' }
  | { name: 'settings' }
  | { name: 'notifications' }
  | { name: 'admin' };

// --------------------------- conversa ---------------------------------------

export interface ConversationHealth {
  /** 0..100 */
  score: number;
  reciprocity: number;
  depth: number;
  consistency: number;
  openness: number;
  messages: number;
  days: number;
  stage: 0 | 1 | 2 | 3 | 4;
  stageLabel: string;
  nextGoal: string;
  stale: boolean;
  waitingOn?: string;
}
