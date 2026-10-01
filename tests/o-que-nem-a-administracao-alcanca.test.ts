import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O DEFEITO QUE ESTES TESTES GUARDAM
//
// A tabela "Quem enxerga o quê" da Política de Privacidade prometia três coisas
// que eram FALSAS para uma pessoa — o administrador:
//
//   Seu e-mail ..... "Só você. Nunca é mostrado a outras pessoas"
//   Seu telefone ... "Ninguém (...) o servidor se recusa a entregar o número
//                     fora dessa condição"
//   Sua coordenada . "Ninguém"
//
// A policy de leitura de `public.users` terminava em `or private.is_admin()`, e
// isso abre a LINHA INTEIRA. O documento até tem o hábito certo — na selfie
// escreve "apenas a administração" —, mas nestas três linhas não escreveu.
//
// Havia duas saídas. Corrigir o DOCUMENTO (barato, honesto) ou corrigir o
// SISTEMA. O dono escolheu o sistema, para a frase mais forte da política voltar
// a ser verdade sem exceção.
//
// O QUE O ENSAIO ENSINOU, E QUE O RACIOCÍNIO NÃO TINHA PREVISTO
//
// A primeira versão só estreitava a leitura. O ensaio devolveu:
//
//   admin REATIVA ... 0 linha(s)
//
// No Postgres um `update ... where id = X` precisa ENCONTRAR a linha, e encontrar
// passa pela policy de LEITURA. Estreitar a leitura tirou do administrador a
// capacidade de moderar — em silêncio, sem erro. Em produção teria quebrado a
// moderação e ninguém saberia por quê.
//
// Por isso suspender/banir/reativar passou a ser função com direitos do dono.
// ---------------------------------------------------------------------------

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');

const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const semComentariosSQL = (sql: string): string =>
  sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');

const SQL = semComentariosSQL(
  ler('supabase/migrations/027_a_politica_prometia_mais_do_que_o_sistema_cumpria.sql'),
);
const PAINEL = semComentarios(ler('services/painel.ts'));
const BACKEND = semComentarios(ler('services/backend.ts'));
const PRIVACIDADE = ler('public/privacidade.html');

/** Recorte delimitado do corpo de uma função SQL — nunca por contagem. */
function corpoSQL(assinatura: string): string {
  const abre = SQL.indexOf(assinatura);
  expect(abre, `não achei "${assinatura}"`).toBeGreaterThan(-1);
  const fecha = SQL.indexOf('$f$;', abre);
  expect(fecha, `não achei o fim de "${assinatura}"`).toBeGreaterThan(abre);
  return SQL.slice(abre, fecha);
}

describe('o telefone volta a estar fora do alcance de todos', () => {
  it('a leitura de `users` já não abre para administrador', () => {
    const abre = SQL.indexOf('create policy "usuário lê o próprio registro"');
    expect(abre, 'a policy não é recriada').toBeGreaterThan(-1);
    const fecha = SQL.indexOf(';', abre);
    const policy = SQL.slice(abre, fecha);
    expect(policy, 'a policy voltou a abrir para administrador').not.toContain('is_admin');
    expect(policy).toContain('id = (select auth.uid())');
  });

  // A REGRESSÃO MAIS IMPORTANTE DESTA ETAPA: alguém devolve o telefone à lista
  // de colunas "porque dava jeito ter".
  it('a função do painel NÃO devolve telefone nem coordenada', () => {
    const corpo = corpoSQL('create or replace function public.pessoas_do_painel(');
    for (const proibido of ['telefone', 'approx_lat', 'approx_lng']) {
      expect(corpo, `a função passou a devolver ${proibido}`).not.toContain(proibido);
    }
  });

  it('a função confere administrador ANTES de ler qualquer coisa', () => {
    const corpo = corpoSQL('create or replace function public.pessoas_do_painel(');
    const porta = corpo.indexOf('private.is_admin()');
    const leitura = corpo.indexOf('from public.users');
    expect(porta).toBeGreaterThan(-1);
    expect(leitura).toBeGreaterThan(-1);
    expect(porta, 'a porta tem de vir antes da leitura').toBeLessThan(leitura);
  });

  it('o painel lê pela função, nunca pela tabela', () => {
    expect(PAINEL).toContain("rpc('pessoas_do_painel'");
    expect(PAINEL, 'o painel voltou a ler a tabela users').not.toContain("from('users')");
  });

  it('o cliente nunca pede telefone ao listar pessoas', () => {
    expect(PAINEL).not.toMatch(/telefone|approx_lat|approx_lng/);
  });
});

describe('moderar continua possível — foi o que o ensaio quase deixou quebrado', () => {
  it('existe função própria para suspender, banir e reativar', () => {
    const corpo = corpoSQL('create or replace function public.definir_status_da_conta(');
    expect(corpo).toContain('private.is_admin()');
    expect(corpo).toContain('update public.users set status = novo where id = alvo');
  });

  it('a função recusa mexer em conta de administrador', () => {
    const corpo = corpoSQL('create or replace function public.definir_status_da_conta(');
    expect(corpo).toContain("u.role = 'admin'");
    expect(corpo).toContain("errcode = 'P0102'");
  });

  // A regressão: alguém devolve o UPDATE direto na tabela, que depois da 027
  // afeta ZERO linhas sem dar erro.
  it('o cliente muda o status pela função, não por UPDATE na tabela', () => {
    const abre = BACKEND.indexOf('export async function definirStatusDaConta');
    expect(abre).toBeGreaterThan(-1);
    const fecha = BACKEND.indexOf('\n}', abre);
    const corpo = BACKEND.slice(abre, fecha);
    expect(corpo).toContain("rpc('definir_status_da_conta'");
    expect(corpo, 'voltou ao UPDATE que afeta zero linhas em silêncio')
      .not.toContain("from('users')");
  });

  it('a policy que prometia o que já não entrega foi removida', () => {
    expect(SQL).toContain('drop policy if exists "admin atualiza qualquer registro" on public.users');
  });
});

describe('a Política de Privacidade passou a dizer a verdade', () => {
  it('a linha do e-mail declara que a administração vê', () => {
    const i = PRIVACIDADE.indexOf('Seu e-mail');
    expect(i).toBeGreaterThan(-1);
    const linha = PRIVACIDADE.slice(i, PRIVACIDADE.indexOf('</tr>', i));
    expect(linha).toContain('administração');
    expect(linha, 'a promessa velha, falsa, voltou')
      .not.toContain('Nunca é mostrado a outras pessoas');
  });

  it('o documento diz o que nem a administração alcança', () => {
    expect(PRIVACIDADE).toContain('O que nem a administração alcança');
    expect(PRIVACIDADE).toContain('corrigimos o sistema, não o texto');
  });

  it('a promessa sobre o telefone continua inteira, porque voltou a ser verdade', () => {
    expect(PRIVACIDADE).toContain('o servidor se recusa a entregar o número');
  });
});
