// ---------------------------------------------------------------------------
// CONEXÃO — modelo de domínio
// Estes tipos espelham 1:1 as tabelas em docs/SUPABASE.sql. Ao plugar o backend
// real, só a camada services/storage.ts muda; telas e regras continuam iguais.
// ---------------------------------------------------------------------------

export type Gender = 'mulher' | 'homem' | 'nao_binario' | 'outro';
export type SeekingGender = Gender | 'todos';

export type RelationshipGoal = 'serio' | 'conhecer' | 'amizade' | 'descobrindo';

/** Eixos da "Bússola de Conexão". Valores 0..100. */
export type AxisKey = 'energia' | 'ritmo' | 'planejamento' | 'afeto' | 'novidade';
export type Personality = Record<AxisKey, number>;

export interface Lifestyle {
  bebida: 'nunca' | 'socialmente' | 'frequente';
  fumo: 'nao' | 'as_vezes' | 'sim';
  exercicio: 'raro' | 'as_vezes' | 'frequente';
  filhos: 'nao_quero' | 'quero' | 'tenho_e_quero' | 'tenho_nao_quero' | 'indeciso';
  animais: 'amo' | 'gosto' | 'nao_tenho' | 'alergia';
  religiosidade: 'nada' | 'pouco' | 'importante' | 'muito_importante';
}

/** Ritmo de conversa preferido — entra no cálculo de compatibilidade. */
export type ChatPace = 'poucas_profundas' | 'equilibrado' | 'muitas_rapidas';

export interface PromptAnswer {
  promptId: string;
  answer: string;
}

export interface Preferences {
  seeking: SeekingGender[];
  ageMin: number;
  ageMax: number;
  maxDistanceKm: number;
  goals: RelationshipGoal[];
  minCompatibility: number;
}

export type ConsentKind = 'termos' | 'privacidade' | 'diretrizes' | 'maioridade' | 'dados_sensiveis';

export interface Consent {
  kind: ConsentKind;
  version: string;
  acceptedAt: string;
}

export type AccountStatus = 'ativo' | 'suspenso' | 'banido';
export type Plan = 'free' | 'premium';

export interface User {
  id: string;
  name: string;
  email: string;
  /** Demo: SHA-256 no navegador. Em produção isto vive no provedor de auth. */
  passwordHash: string;
  birthDate: string; // ISO yyyy-mm-dd
  gender: Gender;
  city: string;
  state: string;
  /** Coordenada APROXIMADA (arredondada a ~0.05°, ≈5 km). Nunca a exata. */
  approxLat: number;
  approxLng: number;
  photo?: string; // dataURL; ausente => retrato generativo determinístico
  extraPhotos: string[];
  profession: string;
  bio: string;
  interests: string[];
  personality: Personality;
  lifestyle: Lifestyle;
  chatPace: ChatPace;
  goal: RelationshipGoal;
  answers: PromptAnswer[];
  preferences: Preferences;
  verified: boolean;
  /** Reputação de conversa 0..100 (encerra com gentileza sobe, some baixa). */
  reputation: number;
  plan: Plan;
  role: 'user' | 'admin';
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
  /** "Revelar antes do tempo" — só vale se os dois marcarem. */
  revealConsent: Record<string, boolean>;
  compatibility: number;
  createdAt: string;
  connectedAt?: string;
  closedBy?: string;
  closedReason?: string;
  closedGently?: boolean;
  /** Data-chave (yyyy-mm-dd) da curadoria que gerou esta sugestão. */
  curatedOn?: string;
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
  interests: number;
  aiCalls: number;
}

// --------------------------- roteamento -----------------------------------

export type Route =
  | { name: 'landing' }
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'home' }
  | { name: 'discover' }
  | { name: 'person'; id: string }
  | { name: 'connections' }
  | { name: 'chats' }
  | { name: 'chat'; id: string }
  | { name: 'profile' }
  | { name: 'profileEdit' }
  | { name: 'premium' }
  | { name: 'settings' }
  | { name: 'notifications' }
  | { name: 'admin' };

// --------------------------- compatibilidade --------------------------------

export interface CompatibilityDimension {
  key: string;
  label: string;
  weight: number;
  /** 0..1 */
  score: number;
  detail: string;
}

export interface CompatibilityResult {
  score: number; // 0..100
  dimensions: CompatibilityDimension[];
  sharedInterests: string[];
  confidence: 'baixa' | 'media' | 'alta';
  headline: string;
  reasons: string[];
  distanceKm: number;
}

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
  /** 0..1 — quanto da foto já está revelado. */
  reveal: number;
  nextGoal: string;
  stale: boolean;
  waitingOn?: string;
}
