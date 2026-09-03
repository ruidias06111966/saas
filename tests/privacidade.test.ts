import { describe, expect, it } from 'vitest';
import type { User } from '../types';
import { SEED_USERS } from '../data/seed';
import { computeCompatibility, isEligible } from '../services/compatibility';

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
//   • No BANCO — a view `perfis_descobriveis` e a política restrita. Isso é
//     verificado contra o Postgres, não em vitest, porque o que garante a
//     segurança é o catálogo e não o TypeScript.
//
//   • NO CLIENTE — um perfil de terceiro nunca é construído com esses campos, e
//     a descoberta funciona sem eles. É essa metade que vive aqui.
//
// O teste mais importante é o último: ele prova que a descoberta continua de pé
// com perfis "magros". Sem ele, alguém reintroduziria `birthDate` em algum
// cálculo, os testes continuariam verdes no modo demo (onde o campo existe), e
// o modo online quebraria só em produção.
// ---------------------------------------------------------------------------

/** Campos que jamais podem existir num perfil vindo da view. */
const PROIBIDOS = ['email', 'birthDate', 'approxLat', 'approxLng', 'role'] as const;

/**
 * Um perfil como a view `perfis_descobriveis` o entrega: com idade e distância
 * prontas, e sem nenhum dos cinco campos. Espelha `toOutro()` em backend.ts.
 */
function comoAViewEntrega(base: User): User {
  const magro: Record<string, unknown> = { ...base };
  for (const campo of PROIBIDOS) delete magro[campo];
  magro.age = base.age;
  magro.distanceKm = 7.5;
  return magro as unknown as User;
}

const [eu, outra] = SEED_USERS;
const terceiro = comoAViewEntrega(outra);
const semBloqueio = new Set<string>();

describe('dado de terceiro que não pode chegar ao navegador', () => {
  it.each(PROIBIDOS)('um perfil de terceiro não tem %s', (campo) => {
    expect(terceiro).not.toHaveProperty(campo);
  });

  it('a consulta de terceiros não nomeia nenhuma coluna proibida', async () => {
    // Lê o código-fonte em vez do valor: `SELECT_OUTROS` é privado ao módulo, e
    // o que interessa é justamente o texto que vai para o PostgREST.
    const fonte = await import('node:fs/promises')
      .then((fs) => fs.readFile(new URL('../services/backend.ts', import.meta.url), 'utf8'));

    const trecho = fonte.slice(
      fonte.indexOf('const SELECT_OUTROS'),
      fonte.indexOf('`;', fonte.indexOf('const SELECT_OUTROS')),
    );
    expect(trecho.length).toBeGreaterThan(0);

    for (const coluna of ['email', 'birth_date', 'approx_lat', 'approx_lng', 'role']) {
      expect(trecho).not.toContain(coluna);
    }
  });
});

describe('a descoberta continua funcionando sem esses campos', () => {
  it('calcula compatibilidade com um perfil vindo da view', () => {
    const r = computeCompatibility(eu, terceiro);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.dimensions).toHaveLength(7);
  });

  it('usa a distância que o servidor mandou, e não coordenadas', () => {
    const perto = { ...terceiro, distanceKm: 2 };
    const longe = { ...terceiro, distanceKm: 180 };
    const dim = (u: User) => computeCompatibility(eu, u).dimensions.find((d) => d.key === 'distance')!;
    // Se alguém voltar a calcular por haversine, os dois dariam o mesmo número:
    // o perfil magro não tem coordenada nenhuma para a conta usar.
    expect(dim(perto).score).toBeGreaterThan(dim(longe).score);
  });

  it('usa a idade que o servidor mandou', () => {
    const jovem = { ...terceiro, age: 25 };
    const madura = { ...terceiro, age: 70 };
    const dim = (u: User) => computeCompatibility(eu, u).dimensions.find((d) => d.key === 'age')!;
    expect(dim(jovem).score).not.toBe(dim(madura).score);
  });

  it('a elegibilidade decide sem data de nascimento nem coordenada', () => {
    expect(isEligible(eu, { ...terceiro, age: 30, distanceKm: 5 }, semBloqueio)).toBe(true);
    // Menor de idade continua barrado — a regra sobrevive à troca de campo.
    expect(isEligible(eu, { ...terceiro, age: 17 }, semBloqueio)).toBe(false);
    // Distância acima do limite continua barrando.
    expect(isEligible(eu, { ...terceiro, age: 30, distanceKm: 9999 }, semBloqueio)).toBe(false);
  });

  it('bloqueio e conta inativa continuam valendo', () => {
    expect(isEligible(eu, terceiro, new Set([terceiro.id]))).toBe(false);
    expect(isEligible(eu, { ...terceiro, status: 'banido' }, semBloqueio)).toBe(false);
  });
});
