import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O DEFEITO QUE ESTE ARQUIVO GUARDA — e que esta base cometeu TRÊS vezes
//
// O Supabase concede, por padrão, INSERT/UPDATE/DELETE/TRUNCATE de toda tabela
// nova a `anon`. A RLS depois recusa — mas recusa EM SILÊNCIO: um `update` sem
// filtro devolve 200 e zero linhas, sem erro nenhum. Quem investiga conclui que
// a chamada funcionou e que não havia o que mudar.
//
// Etapa 3 (`planos`), Etapa 5 (`users`), e as duas vezes eu consertei a tabela
// da vez. Eram 18. A migração 028 corrigiu a classe: revoga em tudo o que
// existe, e muda a REGRA-PADRÃO para que a tabela número 19 já nasça fechada.
//
// Medido contra a API real depois de aplicar:
//   PATCH users      -> HTTP 401, código 42501 (antes: 200 + [])
//   PATCH anuncios   -> HTTP 401, código 42501
//   DELETE propostas -> HTTP 401, código 42501
//   POST subscriptions -> HTTP 401, código 42501
//   GET categorias   -> HTTP 200 com dados (leitura pública preservada)
//   GET planos       -> HTTP 200 com dados
//
// SOBRE A FORMA DOS TESTES
//
// O SQL é lido SEM COMENTÁRIOS. Esta base explica os defeitos dentro do próprio
// código, então as palavras do defeito aparecem nos comentários de propósito —
// e um teste que busque no texto cru passa por acidente. Já aconteceu nove
// vezes aqui, uma delas com `-- revoke ...` comentado a satisfazer a asserção.
// ---------------------------------------------------------------------------

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');
const semComentariosSQL = (sql: string): string =>
  sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');

const MIGRACAO = 'supabase/migrations/028_corrigi_o_caso_e_nao_a_classe.sql';
const SQL = semComentariosSQL(ler(MIGRACAO));

describe('quem não entrou não escreve — e a recusa é alta, não silenciosa', () => {
  it('revoga as quatro escritas de `anon`', () => {
    expect(SQL).toMatch(/revoke\s+insert,\s*update,\s*delete,\s*truncate\s+on\s+public\.%I\s+from\s+anon/i);
  });

  // A REGRESSÃO QUE DESFAZ TUDO SEM PARECER: alguém restringe o laço a uma
  // tabela "para ser conservador", e voltamos ao conserto do caso.
  it('varre TODAS as tabelas e views do esquema, não uma lista escrita à mão', () => {
    expect(SQL, 'o laço deixou de varrer o catálogo').toContain('from pg_class c');
    expect(SQL).toMatch(/nspname\s*=\s*'public'/);
    expect(SQL).toMatch(/relkind\s+in\s*\(\s*'r',\s*'v',\s*'m',\s*'p'\s*\)/);
    // Nenhum nome de tabela escrito à mão no revoke: é `%I` vindo do laço.
    expect(SQL, 'voltou a nomear tabelas uma a uma')
      .not.toMatch(/revoke[^;]*on\s+public\.(users|anuncios|propostas|messages)\b/i);
  });

  // A PARTE QUE FAZ DISTO CLASSE E NÃO CASO.
  it('muda a regra-padrão, para a próxima tabela já nascer fechada', () => {
    expect(SQL, 'sem isto, a tabela 19 nasce com o mesmo defeito')
      .toMatch(/alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+insert,\s*update,\s*delete,\s*truncate\s+on\s+tables\s+from\s+anon/i);
  });

  // A REGRESSÃO QUE QUEBRARIA O APLICATIVO INTEIRO: quem entrou PRECISA de
  // escrever — é assim que o perfil se edita e o anúncio se publica. Quem
  // decide o que essa pessoa pode fazer é a RLS, linha a linha.
  it('NÃO toca em `authenticated`', () => {
    expect(SQL, 'revogar de authenticated quebraria editar perfil e publicar anúncio')
      .not.toMatch(/revoke[^;]*from[^;]*authenticated/i);
    expect(SQL).not.toMatch(/alter\s+default\s+privileges[^;]*from[^;]*authenticated/i);
  });

  // A REGRESSÃO SILENCIOSA AO CONTRÁRIO: revogar SELECT também fecharia as
  // categorias e os planos, que a tela de preços lê ANTES de alguém entrar.
  it('NÃO revoga leitura — as categorias e os planos são públicos de propósito', () => {
    expect(SQL, 'revogar select fecharia a tela de planos para quem não entrou')
      .not.toMatch(/revoke[^;]*\bselect\b/i);
  });
});

describe('e nenhuma migração posterior devolve a escrita', () => {
  // O guarda de longo prazo: daqui a seis migrações, alguém "resolve" um erro
  // de permissão concedendo de novo a `anon`. Isto falha nesse dia.
  it('nenhuma migração concede INSERT, UPDATE ou DELETE a `anon`', () => {
    const pasta = 'supabase/migrations';
    const culpados: string[] = [];

    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.sql'))) {
      const sql = semComentariosSQL(ler(`${pasta}/${arquivo}`));
      // `grant select ... to anon` é legítimo (categorias, planos). O que não
      // pode é escrita. Daí olhar para o verbo, e não para o papel.
      for (const m of sql.matchAll(/grant\s+([^;]*?)\s+on\s+[^;]*?\sto\s+([^;]*?);/gis)) {
        const verbos = m[1].toLowerCase();
        const papeis = m[2].toLowerCase();
        if (!papeis.includes('anon')) continue;
        if (/\b(insert|update|delete|truncate|all)\b/.test(verbos)) {
          culpados.push(`${arquivo}: grant ${m[1].trim()} ... to ${m[2].trim()}`);
        }
      }
    }

    expect(culpados, `escrita devolvida a anon:\n${culpados.join('\n')}`).toEqual([]);
  });
});
