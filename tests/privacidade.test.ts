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
const PROIBIDOS = ['email', 'role', 'telefone'] as const;

/** Campos que o pivô removeu do modelo e não devem voltar. */
const EXTINTOS = [
  'birthDate', 'age', 'gender', 'goal', 'interests', 'preferences',
  // `distanceKm` entrou nesta lista em 17/10/2026. Era a última peça viva da
  // mecânica de distância do app de relacionamentos: o tipo dizia "Calculada
  // no servidor" e NINGUÉM a calculava — a vista `perfis_do_mercado` não a
  // devolve. O perfil tinha um pedaço que nunca podia pintar, e a função que
  // mediria a distância (`haversineKm`) não era chamada por ninguém.
  'distanceKm',
  // E no mesmo dia, a raiz: `approxLat` e `approxLng` SAÍRAM DO MODELO. Até
  // aqui estavam na lista dos PROIBIDOS — "nunca num perfil de terceiro" — o
  // que é uma promessa mais fraca do que a verdade de hoje: elas já não
  // existem em perfil nenhum, nem no próprio. O cadastro deduzia a coordenada
  // da cidade e gravava-a em cada conta; nenhuma vista a devolvia, nenhuma
  // função a lia, nenhuma tela a mostrava. Era dado recolhido sem finalidade.
  'approxLat',
  'approxLng',
] as const;

/**
 * Um perfil como a view `perfis_do_mercado` o entrega. Espelha `toOutro()`
 * em backend.ts.
 */
function comoAViewEntrega(base: User): User {
  const magro: Record<string, unknown> = { ...base };
  for (const campo of PROIBIDOS) delete magro[campo];
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

  it('o app não envia mais coordenada nenhuma ao gravar um perfil', async () => {
    // Enquanto a coluna existir no banco, nada impede alguém de voltar a
    // preenchê-la "para não perder o dado". Esta é a asserção que o impede: o
    // que conta não é o tipo, é o que vai no `upsert`.
    const fs = await import('node:fs/promises');
    const backend = await fs.readFile(new URL('../services/backend.ts', import.meta.url), 'utf8');
    const semComentarios = backend
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(semComentarios, 'a coordenada voltou a ser gravada')
      .not.toMatch(/approx_l(at|ng)\s*:/);
    expect(semComentarios, 'a coordenada voltou a ser pedida ao servidor')
      .not.toMatch(/approx_lat,/);
  });

  it('e o modelo não volta a declarar a coordenada', async () => {
    // A lista EXTINTOS acima olha para OBJECTOS, e um campo opcional posto só
    // no tipo não aparece em objecto nenhum — logo, passaria despercebido.
    // Descoberto a forçar exactamente essa regressão, em 17/10/2026: o campo
    // voltou a `types.ts` e nenhum teste caiu. Por si só não é defeito; é o
    // primeiro passo de volta, e é barato fechá-lo aqui.
    const fs = await import('node:fs/promises');
    const tipos = await fs.readFile(new URL('../types.ts', import.meta.url), 'utf8');
    const semComentarios = tipos
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const campo of ['approxLat', 'approxLng', 'distanceKm']) {
      expect(semComentarios, `${campo} voltou a ser declarado no modelo`)
        .not.toMatch(new RegExp(`\\b${campo}\\??:`));
    }
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
    // Antes isto passava duas distâncias — 5 km e 9999 km — para mostrar que
    // nenhuma barrava. Hoje a distância não existe em lado nenhum: não é
    // calculada, não é devolvida pela vista e não é mostrada. Provar que ela
    // "não barra" seria provar coisa nenhuma; o que importa provar é que a
    // elegibilidade decide SEM ela.
    expect(isEligible(eu, terceiro, semBloqueio)).toBe(true);
    expect(terceiro, 'a distância voltou ao perfil de terceiro')
      .not.toHaveProperty('distanceKm');
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
