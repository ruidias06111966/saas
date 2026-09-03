import { describe, expect, it } from 'vitest';
import { fimDoPeriodo } from '../supabase/functions/stripe-webhook/periodo.ts';

// O primeiro pagamento de verdade gravou o plano certo e a data de renovação
// NULA, porque o endpoint do webhook estava em `2026-08-26.dahlia` e o código
// lia `current_period_end` no lugar onde ele vivia antes da versão `basil`.
// Estes testes fixam as duas serializações, porque uma regressão aqui volta a
// perder a data sem erro nenhum — o plano continua certo, e nada acusa.

const OUTUBRO = 1791072610; // 2026-10-03T00:10:10Z, o caso real

describe('fim do período da assinatura', () => {
  it('lê do item, que é onde o campo vive desde a versão basil', () => {
    expect(fimDoPeriodo({ items: { data: [{ current_period_end: OUTUBRO }] } })).toBe(OUTUBRO);
  });

  it('ainda lê do lugar antigo, para endpoints em versão anterior', () => {
    expect(fimDoPeriodo({ current_period_end: OUTUBRO })).toBe(OUTUBRO);
  });

  it('prefere o item quando os dois vêm, porque é a serialização mais nova', () => {
    expect(fimDoPeriodo({
      items: { data: [{ current_period_end: OUTUBRO }] },
      current_period_end: 1,
    })).toBe(OUTUBRO);
  });

  it('devolve null quando o evento não diz, em vez de undefined', () => {
    // A diferença importa: o webhook manda este valor ao Postgres, e `undefined`
    // some do JSON — o parâmetro chegaria ausente em vez de nulo.
    expect(fimDoPeriodo({})).toBeNull();
    expect(fimDoPeriodo({ items: { data: [] } })).toBeNull();
    expect(fimDoPeriodo({ items: null })).toBeNull();
    expect(fimDoPeriodo({ items: { data: [{}] } })).toBeNull();
  });
});
