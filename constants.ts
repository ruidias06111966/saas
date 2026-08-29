import type { AxisKey, ChatPace, Gender, Lifestyle, RelationshipGoal } from './types';

export const APP_NAME = 'CONEXÃO';
export const APP_TAGLINE = 'Antes de escolher alguém, conheça alguém.';
export const POLICY_VERSION = '2026.1';
export const STORAGE_KEY = 'conexao.state.v1';
export const MIN_AGE = 18;

export const GENDER_LABEL: Record<Gender, string> = {
  mulher: 'Mulher',
  homem: 'Homem',
  nao_binario: 'Não binário',
  outro: 'Prefiro me descrever de outra forma',
};

export const GOAL_LABEL: Record<RelationshipGoal, string> = {
  serio: 'Relacionamento sério',
  conhecer: 'Conhecer pessoas',
  amizade: 'Amizade',
  descobrindo: 'Ainda estou descobrindo',
};

export const GOAL_EMOJI: Record<RelationshipGoal, string> = {
  serio: '💍',
  conhecer: '🌱',
  amizade: '🤝',
  descobrindo: '🧭',
};

export const PACE_LABEL: Record<ChatPace, string> = {
  poucas_profundas: 'Poucas mensagens, mas profundas',
  equilibrado: 'Um equilíbrio entre as duas coisas',
  muitas_rapidas: 'Muitas mensagens curtas ao longo do dia',
};

export interface AxisSpec {
  key: AxisKey;
  label: string;
  left: string;
  right: string;
  /** Peso da penalidade por diferença. 1 = similaridade importa muito. */
  similarityWeight: number;
  hint: string;
}

export const AXES: AxisSpec[] = [
  { key: 'energia', label: 'Energia social', left: 'Introspectivo(a)', right: 'Expansivo(a)', similarityWeight: 0.65, hint: 'Você recarrega sozinho(a) ou junto?' },
  { key: 'ritmo', label: 'Ritmo de vida', left: 'Calmo', right: 'Intenso', similarityWeight: 1.0, hint: 'A velocidade confortável do seu dia.' },
  { key: 'planejamento', label: 'Planejamento', left: 'Espontâneo(a)', right: 'Planejador(a)', similarityWeight: 0.6, hint: 'Roteiro pronto ou decidir na hora?' },
  { key: 'afeto', label: 'Expressão afetiva', left: 'Reservado(a)', right: 'Demonstrativo(a)', similarityWeight: 1.0, hint: 'Como o carinho aparece em você.' },
  { key: 'novidade', label: 'Abertura ao novo', left: 'Raízes', right: 'Novidade', similarityWeight: 0.8, hint: 'Rotina que acolhe ou surpresa que move?' },
];

export const LIFESTYLE_FIELDS: {
  key: keyof Lifestyle;
  label: string;
  options: { value: string; label: string }[];
  weight: number;
}[] = [
  {
    key: 'bebida', label: 'Bebida', weight: 0.8,
    options: [
      { value: 'nunca', label: 'Não bebo' },
      { value: 'socialmente', label: 'Socialmente' },
      { value: 'frequente', label: 'Com frequência' },
    ],
  },
  {
    key: 'fumo', label: 'Fumo', weight: 1.2,
    options: [
      { value: 'nao', label: 'Não fumo' },
      { value: 'as_vezes', label: 'Às vezes' },
      { value: 'sim', label: 'Fumo' },
    ],
  },
  {
    key: 'exercicio', label: 'Exercício', weight: 0.6,
    options: [
      { value: 'raro', label: 'Raramente' },
      { value: 'as_vezes', label: 'Às vezes' },
      { value: 'frequente', label: 'Com frequência' },
    ],
  },
  {
    key: 'filhos', label: 'Filhos', weight: 1.6,
    options: [
      { value: 'nao_quero', label: 'Não quero ter' },
      { value: 'quero', label: 'Quero ter' },
      { value: 'tenho_e_quero', label: 'Tenho e quero mais' },
      { value: 'tenho_nao_quero', label: 'Tenho e não quero mais' },
      { value: 'indeciso', label: 'Ainda não sei' },
    ],
  },
  {
    key: 'animais', label: 'Animais', weight: 0.9,
    options: [
      { value: 'amo', label: 'Amo, tenho' },
      { value: 'gosto', label: 'Gosto' },
      { value: 'nao_tenho', label: 'Indiferente' },
      { value: 'alergia', label: 'Alergia / prefiro sem' },
    ],
  },
  {
    key: 'religiosidade', label: 'Espiritualidade', weight: 1.0,
    options: [
      { value: 'nada', label: 'Não faz parte' },
      { value: 'pouco', label: 'Pouco presente' },
      { value: 'importante', label: 'Importante' },
      { value: 'muito_importante', label: 'Central na minha vida' },
    ],
  },
];

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

/** Cotas do plano gratuito x premium. */
export interface PlanQuota {
  dailyInterests: number;
  dailyAiCalls: number;
  discoverCards: number;
  seeWhoLiked: boolean;
  advancedFilters: boolean;
}

export const QUOTAS: Record<'free' | 'premium', PlanQuota> = {
  free: { dailyInterests: 6, dailyAiCalls: 8, discoverCards: 5, seeWhoLiked: false, advancedFilters: false },
  premium: { dailyInterests: 40, dailyAiCalls: 100, discoverCards: 20, seeWhoLiked: true, advancedFilters: true },
};

export const VEIL_STAGES = [
  { label: 'Silhueta', min: 0, note: 'Vocês acabaram de começar.' },
  { label: 'Contornos', min: 20, note: 'A conversa começou a ganhar corpo.' },
  { label: 'Traços', min: 40, note: 'Vocês estão se ouvindo de verdade.' },
  { label: 'Quase lá', min: 62, note: 'Falta pouco para a revelação.' },
  { label: 'Revelado', min: 82, note: 'Vocês se revelaram um ao outro.' },
] as const;
