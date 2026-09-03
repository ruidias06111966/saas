import { describe, expect, it } from 'vitest';
import {
  buildHealth, conversationHealth, healthMetrics, nextRitualLevel,
  reputationDelta, veilBlur,
} from '../services/conversation';
import { AGORA, CONEXAO, DO_SERVIDOR, MENSAGENS } from './fixtures';

describe('termômetro — paridade com o Postgres', () => {
  // Se este teste quebrar, `private.termometro()` em docs/SUPABASE.sql precisa
  // mudar junto. Os dois lados calculam a mesma coisa de propósito: o cliente
  // para a tela reagir na hora, o servidor porque é ele quem abre o véu.
  it('devolve os mesmos oito números que a função do banco', () => {
    const m = healthMetrics(CONEXAO, MENSAGENS, AGORA);
    expect(m).toEqual(DO_SERVIDOR);
  });

  it('coloca a conversa no estágio 2 e revela 71% do retrato', () => {
    const h = conversationHealth(CONEXAO, MENSAGENS, AGORA);
    expect(h.stage).toBe(2);
    expect(Math.round(h.reveal * 100)).toBe(71);
  });
});

describe('termômetro — o que a paginação teria quebrado', () => {
  const cauda = MENSAGENS.slice(-5);

  it('calcular só sobre a cauda dá um número MENOR, e fecharia o véu', () => {
    const so = conversationHealth(CONEXAO, cauda, AGORA);
    const tudo = conversationHealth(CONEXAO, MENSAGENS, AGORA);
    expect(so.score).toBeLessThan(tudo.score);
    expect(so.stage).toBeLessThan(tudo.stage);
  });

  it('cauda + medidas do servidor devolve exatamente o histórico completo', () => {
    const tudo = conversationHealth(CONEXAO, MENSAGENS, AGORA);
    const remontado = buildHealth(CONEXAO, DO_SERVIDOR, cauda, AGORA);
    expect(remontado).toEqual(tudo);
  });
});

describe('véu', () => {
  it('consentimento mútuo revela por completo, passando por cima do termômetro', () => {
    const comAcordo = { ...CONEXAO, revealConsent: { [CONEXAO.userA]: true, [CONEXAO.userB]: true } };
    expect(conversationHealth(comAcordo, MENSAGENS, AGORA).reveal).toBe(1);
  });

  it('sem nenhuma mensagem, nada é revelado', () => {
    const h = conversationHealth(CONEXAO, [], AGORA);
    expect(h.score).toBe(0);
    expect(h.reveal).toBe(0);
    expect(veilBlur(h.reveal)).toBeGreaterThan(0);
  });

  it('desfoque some quando a revelação é total', () => {
    expect(veilBlur(1)).toBe(0);
  });
});

describe('regras de conversa', () => {
  it('a escada de rituais sobe conforme a conversa avança', () => {
    expect(nextRitualLevel([])).toBe(1);
    expect(nextRitualLevel(MENSAGENS)).toBeGreaterThan(1);
  });

  it('quem se despede ganha reputação; quem some, perde', () => {
    const h = conversationHealth(CONEXAO, MENSAGENS, AGORA);
    expect(reputationDelta(true, h)).toBeGreaterThan(0);
    expect(reputationDelta(false, h)).toBeLessThan(0);
  });

  it('sumir de uma conversa longa custa mais do que de uma curta', () => {
    const longa = conversationHealth(CONEXAO, MENSAGENS, AGORA);
    const curta = conversationHealth(CONEXAO, MENSAGENS.slice(0, 3), AGORA);
    expect(reputationDelta(false, longa)).toBeLessThan(reputationDelta(false, curta));
  });
});
