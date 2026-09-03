import { describe, expect, it } from 'vitest';
import { limparUrl } from '../services/monitoring';

// Depois de confirmar o e-mail, o Supabase traz a pessoa de volta com a sessão
// na PRÓPRIA URL. O Sentry anexa a URL corrente a todo evento, então um erro
// qualquer nessa janela mandaria a credencial para fora — e quem visse o painel
// poderia entrar na conta.
//
// Um defeito aqui não quebra nada: o app continua funcionando e o token só
// passa a sair junto. Por isso estes testes existem.

const APP = 'https://ruidias06111966.github.io/saas/';

describe('limpeza da URL antes de sair para o registro de erros', () => {
  it('remove o token do fragmento, que é onde o Supabase o entrega', () => {
    const limpa = limparUrl(`${APP}#access_token=eyJhbGciOiJIUzI1NiJ9.SEGREDO&token_type=bearer`);
    expect(limpa).not.toContain('SEGREDO');
    expect(limpa).toContain('access_token=REMOVIDO');
  });

  it('remove também o refresh_token, que vale mais que o de acesso', () => {
    const limpa = limparUrl(`${APP}#access_token=A&refresh_token=B&expires_in=3600`);
    expect(limpa).not.toMatch(/=A\b/);
    expect(limpa).not.toMatch(/=B\b/);
  });

  it('remove o code do fluxo PKCE, que fica na busca e não no fragmento', () => {
    const limpa = limparUrl(`${APP}?code=abc123-troca-por-sessao`);
    expect(limpa).not.toContain('abc123');
    expect(limpa).toContain('code=REMOVIDO');
  });

  it('preserva o que não é segredo, para o erro continuar diagnosticável', () => {
    const limpa = limparUrl(`${APP}?assinatura=ok&access_token=SEGREDO`);
    expect(limpa).toContain('assinatura=ok');
    expect(limpa).not.toContain('SEGREDO');
  });

  it('devolve a URL intacta quando não há nada sensível', () => {
    expect(limparUrl(`${APP}?assinatura=cancelada`)).toBe(`${APP}?assinatura=cancelada`);
  });

  it('perde a URL em vez de arriscar, quando ela não parseia', () => {
    // O caso estranho é justamente o que não dá para inspecionar com segurança.
    expect(limparUrl('nao-e-uma-url#access_token=SEGREDO')).toBe('(url ilegível)');
  });
});
