import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// O nome da coluna que o cliente pede tem de existir no banco.
//
// `daily_usage.interests` virou `daily_usage.contatos`. Uma renomeação parece a
// coisa mais inofensiva do mundo e é justamente onde a casa caiu duas vezes:
//
//   • 014 — a view perdeu três colunas que o `select` do cliente pedia, e o app
//     parou de ABRIR;
//   • 015 — colunas órfãs com `not null` fizeram o `upsert` do perfil falhar, e
//     ninguém conseguia salvar nem criar conta.
//
// Nos dois casos o SQL foi verificado e passou. O que não foi verificado é se a
// CONSULTA QUE O CLIENTE FAZ continuava de pé. Este teste faz essa conferência,
// para este caso, de forma que não dependa de ninguém lembrar.
//
// A renomeação foi partida em duas migrações de propósito (a 017 cria o nome
// novo, a 018 apaga o antigo) porque entre elas existe um momento em que o app
// publicado e o app novo convivem. O teste também guarda essa ordem.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;
const MIGRACOES = join(RAIZ, 'supabase/migrations');

const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

/** Todo o SQL da pasta de migrações, na ordem em que roda. */
function todoOSql(): { arquivo: string; sql: string }[] {
  return readdirSync(MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((arquivo) => ({ arquivo, sql: readFileSync(join(MIGRACOES, arquivo), 'utf8') }));
}

const backend = ler('services/backend.ts');

/**
 * Os nomes de coluna que `bumpUsage` manda para o PostgREST — o `select` e o
 * `upsert`. Lê o CÓDIGO, não o valor, porque é o texto que vai para a rede.
 */
function colunasQueOClientePede(): string[] {
  const corpo = backend.slice(backend.indexOf('export async function bumpUsage'));
  const fim = corpo.indexOf('\n}');
  const trecho = corpo.slice(0, fim);

  const nomes = new Set<string>();
  for (const [, lista] of trecho.matchAll(/\.select\('([^']+)'\)/g)) {
    for (const nome of lista.split(',')) nomes.add(nome.trim());
  }
  for (const [, nome] of trecho.matchAll(/field === '\w+' \? '(\w+)' : '(\w+)'/g)) nomes.add(nome);
  for (const [, , nome] of trecho.matchAll(/field === '\w+' \? '(\w+)' : '(\w+)'/g)) nomes.add(nome);
  return [...nomes];
}

describe('a cota diária tem o mesmo nome no cliente e no banco', () => {
  it('o cliente pede `contatos` e `ai_calls`, e mais nada', () => {
    expect(colunasQueOClientePede().sort()).toEqual(['ai_calls', 'contatos']);
  });

  it('nenhuma consulta do cliente nomeia mais `interests`', () => {
    // Fora de comentário: o histórico pode ser contado, mas não pedido.
    const semComentarios = backend
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(semComentarios).not.toContain('interests');
  });

  it('existe uma migração que cria a coluna `contatos`', () => {
    const cria = todoOSql().filter((m) =>
      /add column if not exists contatos/.test(m.sql));
    expect(cria.length, 'nenhuma migração cria `contatos`').toBeGreaterThan(0);

    // Mesma forma da antiga. Se divergir, o `upsert` quebra — foi a 015.
    expect(cria[0].sql).toMatch(/contatos\s+smallint\s+not null\s+default 0/);
  });

  it('a migração que cria mantém a coluna antiga viva', () => {
    // Sem isso, o app PUBLICADO (que ainda escreve `interests`) cai no
    // instante em que a migração roda.
    const cria = todoOSql().find((m) => /add column if not exists contatos/.test(m.sql))!;
    expect(cria.sql).not.toMatch(/drop column\s+(if exists\s+)?interests/);
    expect(cria.sql).toMatch(/update public\.daily_usage set contatos = interests/);
  });

  it('apagar a coluna antiga vem depois, em migração separada', () => {
    const migracoes = todoOSql();
    const iCria = migracoes.findIndex((m) => /add column if not exists contatos/.test(m.sql));
    const iApaga = migracoes.findIndex((m) => /drop column if exists interests/.test(m.sql));

    expect(iApaga, 'nenhuma migração apaga `interests`').toBeGreaterThan(-1);
    expect(iApaga, 'apagar não pode estar na mesma migração que criar').not.toBe(iCria);
    expect(iApaga).toBeGreaterThan(iCria);
  });

  it('o espelho nasce com a coluna nova e morre com a antiga', () => {
    const migracoes = todoOSql();
    const cria = migracoes.find((m) => /add column if not exists contatos/.test(m.sql))!;
    const apaga = migracoes.find((m) => /drop column if exists interests/.test(m.sql))!;

    expect(cria.sql).toMatch(/create trigger espelho_da_cota_diaria/);
    expect(apaga.sql).toMatch(/drop trigger if exists espelho_da_cota_diaria/);
    expect(apaga.sql).toMatch(/drop function if exists private\.espelho_da_cota_diaria/);
  });

  it('nenhuma função do banco fica citando o nome antigo', () => {
    // `consumir_cota_ia` nomeava `interests` no seu `insert`. A 017 tirou.
    const ultima = new Map<string, string>();
    for (const { sql } of todoOSql()) {
      for (const [, nome] of sql.matchAll(
        /create or replace function\s+((?:public|private)\.\w+)/g,
      )) {
        const inicio = sql.indexOf(`function ${nome}`);
        ultima.set(nome, sql.slice(inicio, sql.indexOf('$$;', inicio)));
      }
    }

    const culpadas = [...ultima.entries()]
      .filter(([nome, corpo]) => !nome.includes('espelho') && corpo.includes('interests'))
      .map(([nome]) => nome);
    expect(culpadas).toEqual([]);
  });
});
