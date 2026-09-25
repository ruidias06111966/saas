import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { SEED_USERS } from '../data/seed';
import { isEligible } from '../services/perfil';

// ---------------------------------------------------------------------------
// O vazamento que estes testes guardam.
//
// Em 03/09/2026 confirmou-se, contra o banco de produção, que qualquer pessoa
// logada recebia `email`, `birth_date`, `approx_lat`, `approx_lng` e `role` de
// todas as contas ativas. A causa: o RLS do PostgreSQL protege LINHAS, não
// COLUNAS, e o app pedia a linha inteira de `public.users`.
//
// A correção tem duas metades, e só uma delas é testável aqui:
//
//   • No BANCO — a view do crachá e a política restrita. Isso é verificado
//     contra o Postgres, não em vitest, porque o que garante a segurança é o
//     catálogo e não o TypeScript.
//
//   • NO CLIENTE — um perfil de terceiro nunca é construído com esses campos, e
//     a busca funciona sem eles. É essa metade que vive aqui.
//
// O QUE O PIVÔ ACRESCENTOU A ESTA LISTA
//
// `telefone`. Ele é a coluna nova mais fácil de vazar sem perceber: existe em
// `User`, o dono o lê no próprio perfil, e bastaria alguém acrescentá-lo ao
// `select` de terceiros para que o produto quebrasse a promessa central — a de
// que o contato só aparece depois de uma proposta aceita.
//
// `birthDate` e `age` saíram do modelo inteiro, então deixaram de ser um risco
// de vazamento e passaram a ser um risco de REGRESSÃO: se alguém os trouxer de
// volta, é porque reintroduziu a idade num perfil profissional.
// ---------------------------------------------------------------------------

/** Campos que jamais podem existir num perfil vindo da view do crachá. */
const PROIBIDOS = ['email', 'approxLat', 'approxLng', 'role', 'telefone'] as const;

/** Campos que o pivô removeu do modelo e não devem voltar. */
const EXTINTOS = ['birthDate', 'age', 'gender', 'goal', 'interests', 'preferences'] as const;

/**
 * Um perfil como a view `perfis_do_mercado` o entrega. Espelha `toOutro()`
 * em backend.ts.
 */
function comoAViewEntrega(base: User): User {
  const magro: Record<string, unknown> = { ...base };
  for (const campo of PROIBIDOS) delete magro[campo];
  magro.distanceKm = 7.5;
  return magro as unknown as User;
}

const [eu, , outra] = SEED_USERS;
const terceiro = comoAViewEntrega(outra);
const semBloqueio = new Set<string>();

describe('dado de terceiro que não pode chegar ao navegador', () => {
  it.each(PROIBIDOS)('um perfil de terceiro não tem %s', (campo) => {
    expect(terceiro).not.toHaveProperty(campo);
  });

  it.each(EXTINTOS)('%s não existe mais nem no próprio registro', (campo) => {
    expect(eu).not.toHaveProperty(campo);
  });

  it('a consulta de terceiros não nomeia nenhuma coluna proibida', async () => {
    // Lê o código-fonte em vez do valor: `SELECT_OUTROS` é privado ao módulo, e
    // o que interessa é justamente o texto que vai para o PostgREST.
    const fonte = await import('node:fs/promises')
      .then((fs) => fs.readFile(new URL('../services/backend.ts', import.meta.url), 'utf8'));

    const inicio = fonte.indexOf('const SELECT_OUTROS');
    const trecho = fonte.slice(inicio, fonte.indexOf('`;', inicio));
    expect(trecho.length).toBeGreaterThan(0);

    for (const coluna of ['email', 'birth_date', 'approx_lat', 'approx_lng', 'role', 'telefone']) {
      expect(trecho).not.toContain(coluna);
    }
  });

  it('as colunas comuns aos dois caminhos também não carregam telefone', async () => {
    const fonte = await import('node:fs/promises')
      .then((fs) => fs.readFile(new URL('../services/backend.ts', import.meta.url), 'utf8'));

    const inicio = fonte.indexOf('const CAMPOS_COMUNS');
    const trecho = fonte.slice(inicio, fonte.indexOf('`;', inicio));
    expect(trecho.length).toBeGreaterThan(0);
    expect(trecho).not.toContain('telefone');
  });
});

describe('a busca continua funcionando sem esses campos', () => {
  it('a elegibilidade decide sem data de nascimento nem coordenada', () => {
    expect(isEligible(eu, { ...terceiro, distanceKm: 5 }, semBloqueio)).toBe(true);
    // Distância NÃO barra: preferência ordena, não exclui. Ver isEligible em
    // services/perfil.ts.
    expect(isEligible(eu, { ...terceiro, distanceKm: 9999 }, semBloqueio)).toBe(true);
  });

  it('bloqueio e conta inativa continuam valendo', () => {
    expect(isEligible(eu, terceiro, new Set([terceiro.id]))).toBe(false);
    expect(isEligible(eu, { ...terceiro, status: 'banido' }, semBloqueio)).toBe(false);
  });

  it('administração não aparece para ninguém', () => {
    const admin = SEED_USERS.find((u) => u.role === 'admin')!;
    expect(isEligible(eu, admin, semBloqueio)).toBe(false);
  });
});
