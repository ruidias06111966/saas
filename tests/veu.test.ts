import { describe, expect, it } from 'vitest';
import { NIVEL_ORIGINAL, nivelDoReveal } from '../services/media';

// Os cinco níveis da pirâmide: 12, 24, 48 e 96 px, mais o original. O portão
// de verdade é do Postgres (private.nivel_permitido); isto aqui é só o cliente
// pedindo o nível certo. Se pedir alto demais, o servidor recusa e o cliente
// desce um degrau.
describe('nível da pirâmide para um dado reveal', () => {
  it('nada revelado pede o nível mais velado', () => {
    expect(nivelDoReveal(0)).toBe(0);
  });

  it('tudo revelado pede o original', () => {
    expect(nivelDoReveal(1)).toBe(NIVEL_ORIGINAL);
  });

  it('nunca sai da faixa, mesmo com valor absurdo', () => {
    expect(nivelDoReveal(-5)).toBe(0);
    expect(nivelDoReveal(99)).toBe(NIVEL_ORIGINAL);
  });

  it('sobe em degraus, sem pular nem voltar', () => {
    const niveis = [0, 0.3, 0.55, 0.8, 1].map(nivelDoReveal);
    expect(niveis).toEqual([0, 1, 2, 3, 4]);
  });

  it('71% — o estágio 2 da conversa de teste — para no nível 2', () => {
    expect(nivelDoReveal(0.71)).toBe(2);
  });
});
