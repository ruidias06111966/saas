import type { Connection, User } from '../types';
import { computeCompatibility, isEligible } from './compatibility';
import { dateKey, seededRandom, shuffle } from './utils';

export interface Candidate {
  user: User;
  score: number;
  shared: string[];
  headline: string;
  reasons: string[];
  distanceKm: number;
}

/**
 * Curadoria Diária.
 * O app NÃO entrega um feed infinito. Todo dia, uma seleção determinística
 * (mesma semente = mesma lista o dia inteiro) com um destaque: o Encontro do Dia.
 * A ordem mistura qualidade e um pouco de acaso, para não engessar o resultado.
 */
export function buildCandidates(
  me: User,
  everyone: User[],
  blockedIds: Set<string>,
  seenIds: Set<string>,
): Candidate[] {
  return everyone
    .filter((u) => isEligible(me, u, blockedIds) && !seenIds.has(u.id))
    .map((u) => {
      const c = computeCompatibility(me, u);
      return {
        user: u,
        score: c.score,
        shared: c.sharedInterests,
        headline: c.headline,
        reasons: c.reasons,
        distanceKm: c.distanceKm,
      };
    })
    .filter((c) => c.score >= me.preferences.minCompatibility)
    .sort((a, b) => b.score - a.score);
}

export interface DailyCuration {
  date: string;
  highlight?: Candidate;
  others: Candidate[];
  quotaLeft: number;
}

export function dailyCuration(
  me: User,
  candidates: Candidate[],
  limit: number,
  quotaLeft: number,
  today = dateKey(),
): DailyCuration {
  const rnd = seededRandom(`${me.id}:${today}`);
  // Pega o topo e embaralha dentro de uma janela: evita mostrar sempre os mesmos.
  const pool = candidates.slice(0, Math.max(limit * 3, limit));
  const picked = shuffle(pool, rnd).slice(0, limit);
  // O destaque do dia é o de maior score entre os escolhidos.
  const ordered = [...picked].sort((a, b) => b.score - a.score);
  return { date: today, highlight: ordered[0], others: ordered.slice(1), quotaLeft };
}

/** Conexões que expiraram sem ação (sugestões de dias anteriores). */
export function expiredSuggestions(connections: Connection[], today = dateKey()): Connection[] {
  return connections.filter((c) => c.status === 'sugerida' && c.curatedOn && c.curatedOn !== today);
}
