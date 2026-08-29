import type {
  CompatibilityDimension,
  CompatibilityResult,
  Lifestyle,
  RelationshipGoal,
  User,
} from '../types';
import { AXES, GOAL_LABEL, LIFESTYLE_FIELDS } from '../constants';
import { INTEREST_MAP } from '../data/interests';
import { age, clamp, distanceBand, firstName, haversineKm } from './utils';

// ---------------------------------------------------------------------------
// Índice de Compatibilidade — EXPLICÁVEL por construção.
// Toda dimensão devolve (score 0..1 + texto do porquê). O produto nunca mostra
// só o número: mostra a decomposição. É uma sugestão, não uma promessa.
// ---------------------------------------------------------------------------

export const WEIGHTS = {
  goal: 0.22,
  personality: 0.20,
  interests: 0.18,
  lifestyle: 0.14,
  pace: 0.10,
  age: 0.08,
  distance: 0.08,
} as const;

/** Quão bem dois objetivos de relacionamento convivem. Simétrica. */
const GOAL_MATRIX: Record<RelationshipGoal, Record<RelationshipGoal, number>> = {
  serio:       { serio: 1.0, conhecer: 0.55, amizade: 0.20, descobrindo: 0.50 },
  conhecer:    { serio: 0.55, conhecer: 1.0, amizade: 0.50, descobrindo: 0.80 },
  amizade:     { serio: 0.20, conhecer: 0.50, amizade: 1.0, descobrindo: 0.55 },
  descobrindo: { serio: 0.50, conhecer: 0.80, amizade: 0.55, descobrindo: 0.85 },
};

const PACE_MATRIX: Record<string, Record<string, number>> = {
  poucas_profundas: { poucas_profundas: 1, equilibrado: 0.7, muitas_rapidas: 0.35 },
  equilibrado:      { poucas_profundas: 0.7, equilibrado: 1, muitas_rapidas: 0.75 },
  muitas_rapidas:   { poucas_profundas: 0.35, equilibrado: 0.75, muitas_rapidas: 1 },
};

const LIFESTYLE_MATRIX: Record<keyof Lifestyle, Record<string, Record<string, number>>> = {
  bebida: {
    nunca: { nunca: 1, socialmente: 0.7, frequente: 0.3 },
    socialmente: { nunca: 0.7, socialmente: 1, frequente: 0.75 },
    frequente: { nunca: 0.3, socialmente: 0.75, frequente: 1 },
  },
  fumo: {
    nao: { nao: 1, as_vezes: 0.45, sim: 0.2 },
    as_vezes: { nao: 0.45, as_vezes: 1, sim: 0.8 },
    sim: { nao: 0.2, as_vezes: 0.8, sim: 1 },
  },
  exercicio: {
    raro: { raro: 1, as_vezes: 0.75, frequente: 0.5 },
    as_vezes: { raro: 0.75, as_vezes: 1, frequente: 0.85 },
    frequente: { raro: 0.5, as_vezes: 0.85, frequente: 1 },
  },
  filhos: {
    nao_quero: { nao_quero: 1, quero: 0.1, tenho_e_quero: 0.1, tenho_nao_quero: 0.6, indeciso: 0.45 },
    quero: { nao_quero: 0.1, quero: 1, tenho_e_quero: 0.85, tenho_nao_quero: 0.3, indeciso: 0.6 },
    tenho_e_quero: { nao_quero: 0.1, quero: 0.85, tenho_e_quero: 1, tenho_nao_quero: 0.55, indeciso: 0.55 },
    tenho_nao_quero: { nao_quero: 0.6, quero: 0.3, tenho_e_quero: 0.55, tenho_nao_quero: 1, indeciso: 0.6 },
    indeciso: { nao_quero: 0.45, quero: 0.6, tenho_e_quero: 0.55, tenho_nao_quero: 0.6, indeciso: 1 },
  },
  animais: {
    amo: { amo: 1, gosto: 0.9, nao_tenho: 0.6, alergia: 0.2 },
    gosto: { amo: 0.9, gosto: 1, nao_tenho: 0.8, alergia: 0.5 },
    nao_tenho: { amo: 0.6, gosto: 0.8, nao_tenho: 1, alergia: 0.8 },
    alergia: { amo: 0.2, gosto: 0.5, nao_tenho: 0.8, alergia: 1 },
  },
  religiosidade: {
    nada: { nada: 1, pouco: 0.8, importante: 0.45, muito_importante: 0.25 },
    pouco: { nada: 0.8, pouco: 1, importante: 0.75, muito_importante: 0.5 },
    importante: { nada: 0.45, pouco: 0.75, importante: 1, muito_importante: 0.85 },
    muito_importante: { nada: 0.25, pouco: 0.5, importante: 0.85, muito_importante: 1 },
  },
};

// ------------------------------ dimensões ----------------------------------

function goalScore(a: User, b: User): CompatibilityDimension {
  const s = GOAL_MATRIX[a.goal][b.goal];
  const same = a.goal === b.goal;
  return {
    key: 'goal',
    label: 'Objetivo',
    weight: WEIGHTS.goal,
    score: s,
    detail: same
      ? `Os dois querem ${GOAL_LABEL[a.goal].toLowerCase()}.`
      : `Você quer ${GOAL_LABEL[a.goal].toLowerCase()} e ${firstName(b.name)} quer ${GOAL_LABEL[b.goal].toLowerCase()}.`,
  };
}

function personalityScore(a: User, b: User): CompatibilityDimension {
  let total = 0;
  let wsum = 0;
  let closest = AXES[0];
  let closestDiff = 101;
  for (const axis of AXES) {
    const diff = Math.abs(a.personality[axis.key] - b.personality[axis.key]);
    // Similaridade tolerante: eixos com peso menor aceitam complementaridade.
    const s = clamp(1 - (diff / 100) * axis.similarityWeight);
    total += s * axis.similarityWeight;
    wsum += axis.similarityWeight;
    if (diff < closestDiff) { closestDiff = diff; closest = axis; }
  }
  const score = wsum ? total / wsum : 0.5;
  return {
    key: 'personality',
    label: 'Jeito de ser',
    weight: WEIGHTS.personality,
    score,
    detail: closestDiff <= 18
      ? `Vocês têm "${closest.label.toLowerCase()}" bem parecido.`
      : 'Vocês se aproximam em alguns eixos e se completam em outros.',
  };
}

export function sharedInterestIds(a: User, b: User): string[] {
  const setB = new Set(b.interests);
  return a.interests
    .filter((i) => setB.has(i))
    .sort((x, y) => (INTEREST_MAP[y]?.weight ?? 1) - (INTEREST_MAP[x]?.weight ?? 1));
}

function interestScore(a: User, b: User, shared: string[]): CompatibilityDimension {
  const weightOf = (ids: string[]) => ids.reduce((s, id) => s + (INTEREST_MAP[id]?.weight ?? 1), 0);
  const union = new Set([...a.interests, ...b.interests]);
  const jac = union.size ? weightOf(shared) / weightOf([...union]) : 0;
  // Jaccard puro pune quem tem muitos interesses; suavizamos com raiz.
  const score = clamp(Math.sqrt(jac) * 1.35);
  return {
    key: 'interests',
    label: 'Interesses',
    weight: WEIGHTS.interests,
    score,
    detail: shared.length
      ? `${shared.length} interesse(s) em comum, incluindo ${INTEREST_MAP[shared[0]]?.label ?? shared[0]}.`
      : 'Nenhum interesse em comum declarado — o que também pode ser interessante.',
  };
}

function lifestyleScore(a: User, b: User): CompatibilityDimension {
  let total = 0;
  let wsum = 0;
  let worst = { label: '', s: 2 };
  for (const f of LIFESTYLE_FIELDS) {
    const va = a.lifestyle[f.key];
    const vb = b.lifestyle[f.key];
    const s = LIFESTYLE_MATRIX[f.key]?.[va]?.[vb] ?? 0.5;
    total += s * f.weight;
    wsum += f.weight;
    if (s < worst.s) worst = { label: f.label, s };
  }
  const score = wsum ? total / wsum : 0.5;
  return {
    key: 'lifestyle',
    label: 'Estilo de vida',
    weight: WEIGHTS.lifestyle,
    score,
    detail: worst.s < 0.45
      ? `Atenção ao item "${worst.label}": vocês responderam bem diferente.`
      : 'Rotinas e escolhas do dia a dia combinam bem.',
  };
}

function paceScore(a: User, b: User): CompatibilityDimension {
  const s = PACE_MATRIX[a.chatPace]?.[b.chatPace] ?? 0.5;
  return {
    key: 'pace',
    label: 'Ritmo de conversa',
    weight: WEIGHTS.pace,
    score: s,
    detail: s >= 0.9 ? 'Vocês conversam no mesmo ritmo.' : s >= 0.6 ? 'Ritmos diferentes, mas conciliáveis.' : 'Ritmos de conversa bem distintos.',
  };
}

function ageScore(a: User, b: User): CompatibilityDimension {
  const ageA = age(a.birthDate);
  const ageB = age(b.birthDate);
  const fit = (u: User, other: number) => {
    if (other >= u.preferences.ageMin && other <= u.preferences.ageMax) return 1;
    const dist = other < u.preferences.ageMin ? u.preferences.ageMin - other : other - u.preferences.ageMax;
    return clamp(1 - dist / 8);
  };
  const score = (fit(a, ageB) + fit(b, ageA)) / 2;
  return {
    key: 'age',
    label: 'Faixa etária',
    weight: WEIGHTS.age,
    score,
    detail: score === 1 ? 'A idade de cada um está dentro do que o outro procura.' : 'A idade está um pouco fora da faixa preferida de alguém.',
  };
}

function distanceScore(a: User, b: User): { dim: CompatibilityDimension; km: number } {
  const km = haversineKm(a.approxLat, a.approxLng, b.approxLat, b.approxLng);
  const limit = Math.min(a.preferences.maxDistanceKm, b.preferences.maxDistanceKm);
  const score = km <= 10 ? 1 : clamp(1 - (km - 10) / Math.max(20, limit * 1.2));
  return {
    km,
    dim: {
      key: 'distance',
      label: 'Distância',
      weight: WEIGHTS.distance,
      score,
      detail: a.city === b.city ? `Os dois em ${a.city}.` : `${b.city} — ${distanceBand(km)} de você.`,
    },
  };
}

// ------------------------------ completude ----------------------------------

export function profileCompletion(u: User): number {
  const checks: [boolean, number][] = [
    [!!u.name, 6],
    [!!u.photo, 12],
    [u.extraPhotos.length >= 2, 6],
    [u.bio.trim().length >= 60, 12],
    [!!u.profession, 5],
    [u.interests.length >= 5, 14],
    [u.answers.filter((x) => x.answer.trim().length >= 20).length >= 3, 18],
    [AXES.every((ax) => typeof u.personality[ax.key] === 'number'), 10],
    [!!u.lifestyle.filhos, 7],
    [u.verified, 10],
  ];
  return Math.round(checks.reduce((s, [ok, w]) => s + (ok ? w : 0), 0));
}

// ------------------------------ resultado -----------------------------------

export function computeCompatibility(a: User, b: User): CompatibilityResult {
  const shared = sharedInterestIds(a, b);
  const { dim: distDim, km } = distanceScore(a, b);
  const dimensions: CompatibilityDimension[] = [
    goalScore(a, b),
    personalityScore(a, b),
    interestScore(a, b, shared),
    lifestyleScore(a, b),
    paceScore(a, b),
    ageScore(a, b),
    distDim,
  ];

  const raw = dimensions.reduce((s, d) => s + d.score * d.weight, 0);
  const score = Math.round(clamp(raw) * 100);

  const completion = (profileCompletion(a) + profileCompletion(b)) / 2;
  const confidence: CompatibilityResult['confidence'] =
    completion >= 78 ? 'alta' : completion >= 50 ? 'media' : 'baixa';

  const ranked = [...dimensions].sort((x, y) => y.score * y.weight - x.score * x.weight);
  const headline =
    score >= 85 ? 'Vocês têm muito em comum onde importa.'
      : score >= 70 ? 'Há bastante base para uma boa conversa.'
      : score >= 55 ? 'Diferenças interessantes, com pontos de encontro.'
      : 'Perfis distintos — pode ser surpresa ou pode não engatar.';

  const reasons = ranked.slice(0, 3).map((d) => d.detail);
  const weakest = [...dimensions].sort((x, y) => x.score - y.score)[0];
  if (weakest.score < 0.45) reasons.push(`Ponto de atenção — ${weakest.label.toLowerCase()}: ${weakest.detail}`);

  return { score, dimensions, sharedInterests: shared, confidence, headline, reasons, distanceKm: km };
}

// ------------------------------ elegibilidade -------------------------------

const genderMatches = (seeking: User['preferences']['seeking'], g: User['gender']) =>
  seeking.includes('todos') || seeking.includes(g);

/** Filtros duros. Se qualquer um falhar, a pessoa nem entra no funil. */
export function isEligible(me: User, other: User, blockedIds: Set<string>): boolean {
  if (me.id === other.id) return false;
  if (other.status !== 'ativo') return false;
  if (other.role === 'admin') return false;
  if (blockedIds.has(other.id)) return false;
  if (age(other.birthDate) < 18 || age(me.birthDate) < 18) return false;
  if (!genderMatches(me.preferences.seeking, other.gender)) return false;
  if (!genderMatches(other.preferences.seeking, me.gender)) return false;

  const ageOther = age(other.birthDate);
  const ageMe = age(me.birthDate);
  if (ageOther < me.preferences.ageMin || ageOther > me.preferences.ageMax) return false;
  if (ageMe < other.preferences.ageMin || ageMe > other.preferences.ageMax) return false;

  const km = haversineKm(me.approxLat, me.approxLng, other.approxLat, other.approxLng);
  if (km > Math.max(me.preferences.maxDistanceKm, 10)) return false;

  if (me.preferences.goals.length && !me.preferences.goals.includes(other.goal)) return false;
  return true;
}
