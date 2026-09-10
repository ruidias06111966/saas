import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { WEIGHTS, atendeAPreferencia, computeCompatibility, isEligible } from '../services/compatibility';
import { SEED_USERS } from '../data/seed';

const [primeira, segunda] = SEED_USERS;
const semBloqueio = new Set<string>();

describe('compatibilidade', () => {
  it('os sete pesos somam 1 — senão o índice não é uma média', () => {
    const soma = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
    expect(soma).toBeCloseTo(1, 10);
  });

  it('é simétrica: quem vê quem não muda o índice', () => {
    for (const outra of SEED_USERS.slice(1, 6)) {
      expect(computeCompatibility(primeira, outra).score)
        .toBe(computeCompatibility(outra, primeira).score);
    }
  });

  it('fica entre 0 e 100 para todos os pares do seed', () => {
    for (const a of SEED_USERS) {
      for (const b of SEED_USERS) {
        const { score } = computeCompatibility(a, b);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('explica o índice: sete dimensões e ao menos um motivo', () => {
    const r = computeCompatibility(primeira, segunda);
    expect(r.dimensions).toHaveLength(7);
    expect(r.reasons.length).toBeGreaterThan(0);
    // O produto inteiro se apoia nisto: nada de "97% de match" sem dizer por quê.
    for (const d of r.dimensions) {
      expect(d.detail.length).toBeGreaterThan(0);
    }
  });

  it('a pessoa é sempre 100% compatível consigo mesma', () => {
    expect(computeCompatibility(primeira, primeira).score).toBe(100);
  });
});

describe('elegibilidade', () => {
  it('ninguém aparece para si mesmo', () => {
    expect(isEligible(primeira, primeira, semBloqueio)).toBe(false);
  });

  it('administrador nunca entra na curadoria', () => {
    const admin = { ...segunda, role: 'admin' as const };
    expect(isEligible(primeira, admin, semBloqueio)).toBe(false);
  });

  it('conta suspensa ou banida não aparece', () => {
    expect(isEligible(primeira, { ...segunda, status: 'suspenso' }, semBloqueio)).toBe(false);
    expect(isEligible(primeira, { ...segunda, status: 'banido' }, semBloqueio)).toBe(false);
  });

  it('bloqueio corta nos dois sentidos', () => {
    expect(isEligible(primeira, segunda, new Set([segunda.id]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Preferência ordena, não exclui.
//
// Estes testes existem por causa de uma falha medida em produção: nas quatro
// primeiras contas reais do app, todas na mesma cidade, os filtros duros
// deixavam ZERO pares. Ninguém via ninguém, e a tela vazia não tinha como
// explicar porquê — o motivo estava numa preferência escolhida noutro ecrã.
// ---------------------------------------------------------------------------
describe('preferência não exclui ninguém do funil', () => {
  // As quatro contas reais, como estavam no dia em que o problema apareceu.
  const conta = (over: Partial<User> & { prefs: Partial<User['preferences']> }): User => {
    const { prefs, ...resto } = over;
    return {
      ...primeira,
      ...resto,
      preferences: { ...primeira.preferences, seeking: ['todos'], ageMin: 18, ageMax: 99, maxDistanceKm: 50, goals: [], minCompatibility: 0, ...prefs },
    } as User;
  };

  const dani = conta({ id: 'dani', name: 'DANIELY', gender: 'mulher', age: 42, role: 'user', prefs: { seeking: ['homem'], ageMin: 35, ageMax: 50 } });
  const paulo = conta({ id: 'paulo', name: 'Paulo', gender: 'homem', age: 59, role: 'user', prefs: { seeking: ['mulher'], ageMin: 45, ageMax: 65 } });
  const celia = conta({ id: 'celia', name: 'Célia', gender: 'homem', age: 48, role: 'user', prefs: { seeking: ['homem'], ageMin: 47, ageMax: 56 } });

  it('idade fora da faixa dos dois lados já não exclui', () => {
    // Antes: bloqueado nos DOIS sentidos (59 fora de 35-50; 42 fora de 45-65).
    expect(isEligible(dani, paulo, semBloqueio)).toBe(true);
    expect(isEligible(paulo, dani, semBloqueio)).toBe(true);
  });

  it('gênero procurado já não exclui', () => {
    // Célia procura homem; DANIELY é mulher. Antes, bloqueado.
    expect(isEligible(celia, dani, semBloqueio)).toBe(true);
    expect(isEligible(paulo, celia, semBloqueio)).toBe(true);
  });

  it('distância acima do limite já não exclui', () => {
    const longe = { ...paulo, distanceKm: 4000 } as User;
    expect(isEligible(dani, longe, semBloqueio)).toBe(true);
  });

  it('as barreiras de segurança continuam de pé', () => {
    expect(isEligible(dani, dani, semBloqueio)).toBe(false);
    expect(isEligible(dani, { ...paulo, age: 17 } as User, semBloqueio)).toBe(false);
    expect(isEligible(dani, { ...paulo, status: 'banido' } as User, semBloqueio)).toBe(false);
    expect(isEligible(dani, { ...paulo, role: 'admin' } as User, semBloqueio)).toBe(false);
    expect(isEligible(dani, paulo, new Set([paulo.id]))).toBe(false);
  });

  it('a preferência declarada continua a valer — para ordenar', () => {
    // DANIELY procura homem, e Paulo procura mulher: reciprocidade completa.
    expect(atendeAPreferencia(dani, paulo)).toBe(true);
    // Célia procura homem e DANIELY é mulher: aparece, mas depois.
    expect(atendeAPreferencia(celia, dani)).toBe(false);
  });

  it('nenhuma das quatro contas reais fica sem ver ninguém', () => {
    const todos = [dani, paulo, celia];
    for (const eu of todos) {
      const vejo = todos.filter((o) => isEligible(eu, o, semBloqueio));
      expect(vejo.length, `${eu.name} não enxerga ninguém`).toBeGreaterThan(0);
    }
  });
});
