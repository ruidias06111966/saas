import { describe, expect, it } from 'vitest';
import { newId, uid } from '../services/utils';

// ---------------------------------------------------------------------------
// Regressão do bug que quebrava TODA escrita no modo online.
//
// `uid('msg')` devolve `msg_m4x2abc`, e as tabelas declaram `id uuid`. O
// Postgres recusava com "invalid input syntax for type uuid", e como a escrita
// é otimista, a mensagem aparecia na tela de quem enviou e não existia para
// mais ninguém. Valia igual para conexão e denúncia.
// ---------------------------------------------------------------------------

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('devolve UUID v4, que é o que a coluna `id uuid` aceita', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('não colide em mil chamadas seguidas', () => {
    const vistos = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(vistos.size).toBe(1000);
  });
});

describe('uid', () => {
  it('NÃO é UUID — por isso não serve para nada que vá ao Postgres', () => {
    expect(uid('toast')).not.toMatch(UUID_V4);
    expect(uid('toast')).toMatch(/^toast_/);
  });
});
