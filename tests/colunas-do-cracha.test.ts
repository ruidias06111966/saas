import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// O teste que faltava em 25/09/2026, e que teria evitado o app fora do ar.
//
// `services/backend.ts` pede um conjunto de colunas à view `perfis_do_mercado`.
// A view é definida em SQL, num arquivo de migração. Nada no TypeScript liga
// uma coisa à outra: a lista de colunas é uma string, e o Postgres só a vê em
// produção.
//
// Foi por aí que passou o defeito. A migração 012 recriou a view sem `bio`,
// `extra_photos` e `plan` — três colunas que o cliente continuava pedindo. O
// PostgREST respondeu 42703, `loadSnapshot` levantou exceção, e o aplicativo
// deixou de abrir. Build verde, 53 testes verdes, nove verificações em SQL
// verdes: nenhuma delas fazia a consulta que o CLIENTE faz.
//
// Este teste lê os dois lados e compara. É burro de propósito — ele não
// entende SQL, só procura nomes de coluna dentro do `select` da view. Um
// parser esperto falharia calado; este falha barulhento.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;

/** As colunas que uma constante de `backend.ts` pede, na ordem em que aparecem. */
function colunasPedidas(constante: string): string[] {
  const fonte = readFileSync(join(RAIZ, 'services/backend.ts'), 'utf8');
  const inicio = fonte.indexOf(`const ${constante}`);
  expect(inicio, `não achei ${constante} em backend.ts`).toBeGreaterThan(-1);

  const corpo = fonte.slice(fonte.indexOf('`', inicio) + 1, fonte.indexOf('`;', inicio));
  return corpo
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith('//') && !x.startsWith('$'))
    // `autor:users!fk ( name )` e afins não são colunas desta tabela.
    .filter((x) => !x.includes('(') && !x.includes(':'));
}

/** A definição mais recente da view, olhando todas as migrações em ordem. */
function definicaoDaView(): string {
  const dir = join(RAIZ, 'supabase/migrations');
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  let ultima = '';
  for (const arquivo of arquivos) {
    const sql = readFileSync(join(dir, arquivo), 'utf8');
    const i = sql.lastIndexOf('create or replace view public.perfis_do_mercado');
    if (i === -1) continue;
    // Do `create` até o `from public.users` — é ali que vive a lista de colunas.
    const fim = sql.indexOf('from public.users', i);
    ultima = sql.slice(i, fim);
  }
  return ultima;
}

describe('o que o cliente pede à view do crachá existe na view', () => {
  const view = definicaoDaView();

  it('achou a definição da view nas migrações', () => {
    expect(view.length).toBeGreaterThan(0);
  });

  it.each(colunasPedidas('SELECT_OUTROS').concat(colunasPedidas('CAMPOS_COMUNS')))(
    'a view expõe %s',
    (coluna) => {
      // `${CAMPOS_COMUNS}` interpolado não é coluna; o resto tem de estar lá.
      if (coluna.includes('CAMPOS_COMUNS') || coluna.includes('{')) return;
      expect(view).toMatch(new RegExp(`\\bu\\.${coluna}\\b`));
    },
  );

  it('a view NÃO expõe telefone, e isso é a promessa central do produto', () => {
    expect(view).not.toMatch(/\bu\.telefone\b/);
  });

  it('a consulta de terceiros não pede telefone', () => {
    const pedidas = colunasPedidas('SELECT_OUTROS').concat(colunasPedidas('CAMPOS_COMUNS'));
    expect(pedidas).not.toContain('telefone');
  });
});
