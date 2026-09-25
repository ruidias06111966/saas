import { describe, expect, it } from 'vitest';
import {
  buildHealth, conversationHealth, healthMetrics, nextRitualLevel,
  reputationDelta,
} from '../services/conversation';
import { AGORA, CONEXAO, DO_SERVIDOR, MENSAGENS } from './fixtures';

describe('termômetro — paridade com o Postgres', () => {
  // Se este teste quebrar, `private.termometro()` em docs/SUPABASE.sql precisa
  // mudar junto. Os dois lados calculam a mesma coisa de propósito: o cliente
  // para a tela reagir na hora, o servidor para ser a fonte da verdade.
  it('devolve os mesmos oito números que a função do banco', () => {
    const m = healthMetrics(CONEXAO, MENSAGENS, AGORA);
    expect(m).toEqual(DO_SERVIDOR);
  });

  // Antes da migração 006 esta mesma conversa parava no estágio 2 — catorze
  // mensagens boas e seis dias, e o termômetro ainda dizia "começando". Era o
  // sintoma que motivou a recalibração, e continua valendo depois do pivô:
  // uma negociação assim já está pronta para fechar.
  it('coloca a conversa no último estágio', () => {
    const h = conversationHealth(CONEXAO, MENSAGENS, AGORA);
    expect(h.stage).toBe(4);
    expect(h.stageLabel).toBe('Pronto');
  });
});

describe('termômetro — o que a paginação teria quebrado', () => {
  const cauda = MENSAGENS.slice(-5);

  it('calcular só sobre a cauda dá um número MENOR, e voltaria a conversa de etapa', () => {
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

describe('etapas da conversa', () => {
  it('sem nenhuma mensagem, a conversa fica no primeiro degrau', () => {
    const h = conversationHealth(CONEXAO, [], AGORA);
    expect(h.score).toBe(0);
    expect(h.stage).toBe(0);
    expect(h.stageLabel).toBe('Primeiro contato');
  });

  // O véu saiu no pivô, e com ele o `reveal` e o consentimento mútuo de
  // revelação. O que restou do mecanismo é o degrau, que mede se a conversa
  // anda — e isso vale igual para negócio.
  it('não existe mais nenhum grau de revelação de foto', () => {
    const h = conversationHealth(CONEXAO, MENSAGENS, AGORA);
    expect('reveal' in h).toBe(false);
  });
});

describe('regras de conversa', () => {
  it('a escada de perguntas sobe conforme a conversa avança', () => {
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
