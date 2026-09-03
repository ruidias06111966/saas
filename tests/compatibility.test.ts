import { describe, expect, it } from 'vitest';
import { WEIGHTS, computeCompatibility, isEligible } from '../services/compatibility';
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
