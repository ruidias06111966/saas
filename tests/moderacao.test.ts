import { describe, expect, it } from 'vitest';
import { blocksSending, moderateText } from '../services/moderation';

describe('moderação local', () => {
  it('deixa passar conversa comum', () => {
    const r = moderateText('Combinado então! Qual o seu dia mais livre desta semana?');
    expect(r.level).toBe('ok');
    expect(blocksSending(r)).toBe(false);
  });

  it('sinaliza pedido de dinheiro — o golpe mais comum em app de relacionamento', () => {
    const r = moderateText('me manda um pix de 200 reais que eu devolvo amanha');
    expect(r.level).not.toBe('ok');
    expect(r.categories).toContain('financeiro');
    expect(r.advice.length).toBeGreaterThan(0);
  });

  it('texto vazio não vira alarme', () => {
    expect(moderateText('').level).toBe('ok');
  });
});
