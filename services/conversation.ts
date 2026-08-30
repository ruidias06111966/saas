import type { Connection, ConversationHealth, Message } from '../types';
import { VEIL_STAGES } from '../constants';
import { clamp } from './utils';

// ---------------------------------------------------------------------------
// Termômetro de Conversa
// Mede a QUALIDADE da troca, não o volume. É o motor que abre o véu da foto,
// alimenta a reputação e dispara o fluxo anti-ghosting.
// ---------------------------------------------------------------------------

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const hasQuestion = (t: string) => /\?/.test(t);

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function conversationHealth(
  connection: Connection,
  messages: Message[],
  now: number = Date.now(),
): ConversationHealth {
  const real = messages.filter((m) => m.kind !== 'sistema');
  const a = connection.userA;
  const b = connection.userB;
  const byA = real.filter((m) => m.senderId === a);
  const byB = real.filter((m) => m.senderId === b);
  const total = real.length;

  // 1. Reciprocidade — quem fala demais e quem fala de menos.
  const reciprocity = total < 4
    ? clamp(total / 4) * 0.5
    : 1 - Math.abs(byA.length - byB.length) / total;

  // 2. Profundidade — tamanho médio + proporção de perguntas feitas ao outro.
  const avgWords = total ? real.reduce((s, m) => s + wordCount(m.text), 0) / total : 0;
  const questionRatio = total ? real.filter((m) => hasQuestion(m.text)).length / total : 0;
  const depth = clamp(clamp(avgWords / 22) * 0.65 + clamp(questionRatio / 0.3) * 0.35);

  // 3. Constância — mediana do intervalo entre turnos alternados.
  const gaps: number[] = [];
  for (let i = 1; i < real.length; i++) {
    if (real[i].senderId !== real[i - 1].senderId) {
      gaps.push(new Date(real[i].createdAt).getTime() - new Date(real[i - 1].createdAt).getTime());
    }
  }
  const med = median(gaps);
  const consistency = !gaps.length ? 0 : med <= 6 * HOUR ? 1 : med >= 3 * DAY ? 0.1 : clamp(1 - (med - 6 * HOUR) / (3 * DAY));

  // 4. Abertura — rituais respondidos (a Escada de Intimidade).
  const rituals = real.filter((m) => m.kind === 'ritual');
  const maxLevel = rituals.reduce((mx, m) => Math.max(mx, m.ritualLevel ?? 0), 0);
  const openness = clamp(rituals.length / 6) * 0.6 + clamp(maxLevel / 4) * 0.4;

  // Fator de substância: conversas curtas não podem atingir nota alta.
  const volume = clamp(Math.log2(1 + total) / Math.log2(1 + 40));

  const firstTs = real.length ? new Date(real[0].createdAt).getTime() : now;
  const days = Math.max(1, Math.round((now - firstTs) / DAY) || 1);
  const spread = clamp(days / 5) * 0.35 + 0.65;

  const rawScore =
    (reciprocity * 0.28 + depth * 0.28 + consistency * 0.22 + openness * 0.22) * volume * spread;
  const score = Math.round(clamp(rawScore) * 100);

  let stageIdx = 0;
  VEIL_STAGES.forEach((s, i) => { if (score >= s.min) stageIdx = i; });
  const stageIndex = stageIdx as ConversationHealth['stage'];
  const mutualReveal = !!connection.revealConsent[a] && !!connection.revealConsent[b];
  const reveal = mutualReveal ? 1 : clamp(score / 82);

  const last = real[real.length - 1];
  const silence = last ? now - new Date(last.createdAt).getTime() : 0;
  const stale = !!last && silence > 5 * DAY;
  const waitingOn = last ? (last.senderId === a ? b : a) : undefined;

  const nextGoal =
    stageIndex >= 4 ? 'Vocês já se revelaram. Agora é com vocês.'
      : reciprocity < 0.6 ? 'Dê espaço para o outro falar — a troca precisa ser dos dois.'
      : depth < 0.5 ? 'Faça uma pergunta aberta. Respostas longas revelam mais.'
      : openness < 0.5 ? 'Aceite um Ritual de Conversa para subir um degrau.'
      : 'Continue no ritmo. O véu está abrindo.';

  return {
    score,
    reciprocity: Math.round(reciprocity * 100),
    depth: Math.round(depth * 100),
    consistency: Math.round(consistency * 100),
    openness: Math.round(openness * 100),
    messages: total,
    days,
    stage: stageIndex,
    stageLabel: VEIL_STAGES[stageIndex].label,
    reveal,
    nextGoal,
    stale,
    waitingOn,
  };
}

/** Blur em pixels aplicado ao retrato, dado o quanto já foi revelado. */
export const veilBlur = (reveal: number): number => Math.round((1 - clamp(reveal)) * 26 * 10) / 10;

/** Nível do próximo ritual a ser sugerido nesta conversa. */
export function nextRitualLevel(messages: Message[]): 1 | 2 | 3 | 4 {
  const used = messages.filter((m) => m.kind === 'ritual').length;
  const real = messages.filter((m) => m.kind !== 'sistema').length;
  if (real < 6 || used < 1) return 1;
  if (real < 16 || used < 3) return 2;
  if (real < 30 || used < 5) return 3;
  return 4;
}

/** Ajuste de reputação ao encerrar uma conversa. */
export function reputationDelta(closedGently: boolean, health: ConversationHealth): number {
  if (closedGently) return health.messages >= 6 ? 3 : 1;
  return health.messages >= 6 ? -4 : -1;
}
