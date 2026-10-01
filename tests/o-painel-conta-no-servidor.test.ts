import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O DEFEITO QUE ESTES TESTES GUARDAM
//
// Todos os números do painel administrativo saíam de `state` — a lista que o
// navegador CARREGOU para montar as telas do mercado. Três razões pelas quais
// essa lista não é a base:
//
//   1. as pessoas vinham da view `perfis_do_mercado`, que exige
//      `status = 'ativo'`. Conta SUSPENSA sai da lista. Logo:
//        • "Contas suspensas" só sabia dizer ZERO;
//        • o botão "Reativar" só aparecia para quem não está ativo — isto é,
//          para uma linha que nunca estava na lista. Suspender por engano não
//          tinha volta pela tela.
//   2. as mensagens vinham paginadas (40 por conversa). "Mensagens" era
//      "mensagens recentes carregadas".
//   3. o PostgREST corta no teto de linhas, em silêncio.
//
// Provado no ensaio contra a produção: com uma conta suspensa, a view devolveu
// ZERO linhas para ela, e a contagem nova devolveu 1.
//
// SOBRE A FORMA DESTES TESTES
//
// Sete vezes nesta sessão um teste passou por acidente, sempre pela mesma
// causa: a busca encontrava, FORA do lugar pretendido, o que devia achar dentro
// dele — uma linha de import, um botão vizinho, um `[\s\S]*?` que varria o
// arquivo, um `--` que comentava sem deixar de casar.
//
// Por isso: o código é lido SEM COMENTÁRIOS (esta base explica os defeitos que
// corrige dentro do código, e as palavras do defeito aparecem nos comentários
// de propósito), e os recortes são DELIMITADOS, nunca por contagem de
// caracteres.
// ---------------------------------------------------------------------------

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');

const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const semComentariosSQL = (sql: string): string =>
  sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');

const SQL = semComentariosSQL(
  ler('supabase/migrations/026_o_painel_contava_o_que_o_navegador_tinha_na_memoria.sql'),
);
const TELA = semComentarios(ler('screens/Admin.tsx'));
const SERVICO = semComentarios(ler('services/painel.ts'));

/** Recorte delimitado do corpo de uma função SQL. */
function corpoSQL(assinatura: string): string {
  const abre = SQL.indexOf(assinatura);
  expect(abre, `não achei "${assinatura}"`).toBeGreaterThan(-1);
  const fecha = SQL.indexOf('$f$;', abre);
  expect(fecha, `não achei o fim de "${assinatura}"`).toBeGreaterThan(abre);
  return SQL.slice(abre, fecha);
}

describe('os números do painel são contados no servidor', () => {
  it('a função existe e recusa quem não é administrador ANTES de contar', () => {
    const corpo = corpoSQL('create or replace function public.painel_do_administrador()');
    const porta = corpo.indexOf('private.is_admin()');
    const primeiraContagem = corpo.indexOf('count(*)');
    expect(porta, 'a função não confere is_admin()').toBeGreaterThan(-1);
    expect(primeiraContagem, 'a função não conta nada').toBeGreaterThan(-1);
    expect(porta, 'a conferência tem de vir ANTES de contar').toBeLessThan(primeiraContagem);
    expect(corpo).toContain("raise exception 'Somente administradores.'");
  });

  it('quem não entrou não executa a função', () => {
    expect(SQL).toContain('revoke all on function public.painel_do_administrador() from public, anon');
    expect(SQL).toContain('grant execute on function public.painel_do_administrador() to authenticated');
  });

  it('conta as mensagens TODAS, não as carregadas', () => {
    expect(corpoSQL('create or replace function public.painel_do_administrador()'))
      .toContain("'mensagens',  (select count(*) from public.messages)");
  });

  it('conta as suspensas sem passar pela view que as esconde', () => {
    const corpo = corpoSQL('create or replace function public.painel_do_administrador()');
    expect(corpo).toContain("'suspensas'");
    expect(corpo).toContain("status <> 'ativo'");
    // A view do mercado é justamente o que não serve aqui.
    expect(corpo).not.toContain('perfis_do_mercado');
  });

  // A REGRESSÃO MAIS IMPORTANTE DESTA ETAPA: alguém "conserta" a tela fazendo
  // ela voltar a somar da memória quando o servidor demora.
  it('com servidor, a tela NÃO conta da memória', () => {
    const abre = TELA.indexOf('const numerosDaDemonstracao');
    expect(abre, 'não achei o cálculo da demonstração').toBeGreaterThan(-1);
    const fecha = TELA.indexOf('const num =', abre);
    expect(fecha).toBeGreaterThan(abre);
    const bloco = TELA.slice(abre, fecha);
    expect(bloco, 'o caminho da memória tem de desistir quando há servidor')
      .toContain('if (supabaseEnabled) return null;');
  });

  it('a tela pede os números ao servidor', () => {
    expect(TELA).toContain('numerosDoPainel()');
  });

  // Sem números, a tela tem de ficar sem números — e dizer isso.
  it('sem resposta do servidor, a tela não inventa número', () => {
    expect(TELA).toContain('Não consegui apurar os números agora');
    expect(TELA).toContain('Apurando no servidor');
  });

  it('o serviço não tem rede de segurança que volte para a memória', () => {
    const abre = SERVICO.indexOf('export async function numerosDoPainel');
    expect(abre).toBeGreaterThan(-1);
    const fecha = SERVICO.indexOf('\n}', abre);
    const corpo = SERVICO.slice(abre, fecha);
    expect(corpo).toContain("rpc('painel_do_administrador')");
    expect(corpo, 'falha tem de virar null, não um número').toContain('return null');
  });
});

describe('a conta suspensa volta a aparecer, e por isso o botão de reativar funciona', () => {
  // MUDOU DE MECANISMO NA MIGRAÇÃO 027, E A INTENÇÃO CONTINUA A MESMA.
  //
  // Na Etapa 4 este teste exigia que a lista viesse da tabela `users`, porque o
  // defeito era vir da view do mercado (que esconde as suspensas). Na Etapa 5 a
  // leitura de `users` fechou para o administrador — a policy abria a linha
  // inteira, telefone incluído, e a Política de Privacidade prometia o
  // contrário. A lista passou a vir de `pessoas_do_painel`, que devolve só as
  // colunas da tela.
  //
  // O que o teste guarda não é o mecanismo: é que a lista não volte à view que
  // esconde quem está suspenso.
  it('a lista de pessoas vem da função do painel, nunca da view do mercado', () => {
    const abre = SERVICO.indexOf('export async function pessoasDoPainel');
    expect(abre).toBeGreaterThan(-1);
    const fecha = SERVICO.indexOf('export async function', abre + 10);
    const corpo = SERVICO.slice(abre, fecha);
    expect(corpo).toContain("rpc('pessoas_do_painel'");
    expect(corpo).not.toContain('perfis_do_mercado');
    expect(corpo, 'voltou a ler a tabela, que já não entrega as suspensas')
      .not.toContain("from('users')");
  });

  it('a função do servidor NÃO filtra por status — é isso que mantém a suspensa visível', () => {
    const sql = semComentariosSQL(
      ler('supabase/migrations/027_a_politica_prometia_mais_do_que_o_sistema_cumpria.sql'),
    );
    const abre = sql.indexOf('create or replace function public.pessoas_do_painel(');
    expect(abre).toBeGreaterThan(-1);
    const corpo = sql.slice(abre, sql.indexOf('$f$;', abre));
    expect(corpo, 'a função passou a esconder quem não está ativo')
      .not.toMatch(/status\s*=\s*'ativo'/);
    expect(corpo, 'a função passou a esconder as contas apagadas')
      .not.toMatch(/deleted_at\s+is\s+null/);
  });

  it('a tela diz, em texto, que a lista inclui suspensas e banidas', () => {
    expect(TELA).toContain('suspensas e banidas');
  });

  it('suspender manda a lista do servidor ler de novo', () => {
    const abre = TELA.indexOf('const setStatus');
    const fecha = TELA.indexOf('};', abre);
    expect(TELA.slice(abre, fecha)).toContain('setRecarga');
  });
});

describe('MRR e ARR somam o que foi contratado, não o preço de hoje', () => {
  const corpo = corpoSQL('create or replace function public.painel_do_administrador()');

  // A regressão: alguém troca `s.centavos` por `p.centavos` "para refletir o
  // preço atual". Aí aumentar o preço aumentaria a receita PASSADA, e os Termos
  // prometem o contrário — quem assinou mantém o valor contratado.
  it('a soma usa o valor gravado NA ASSINATURA', () => {
    expect(corpo).toContain('s.centavos');
    expect(corpo).not.toMatch(/sum\([^)]*p\.centavos/);
  });

  it('a assinatura guarda o preço no momento da contratação', () => {
    const aplicar = corpoSQL('create or replace function private.aplicar_assinatura(');
    expect(aplicar).toContain('select p.centavos into preco from public.planos p');
    expect(aplicar).toContain('plano_codigo, centavos');
  });

  // A ordem importa: MRR primeiro e ARR = MRR x 12 erra o anual, porque
  // 44900/12 truncado dá 3741 e 3741x12 = 44892. O ARR tem de bater com o
  // extrato, então ele é que é somado.
  it('o ARR é somado e o MRR é derivado, não o contrário', () => {
    expect(corpo).toMatch(/into\s+arr/);
    expect(corpo).toContain('mrr := round(arr / 12.0)');
    expect(corpo).not.toMatch(/arr\s*:=\s*mrr\s*\*\s*12/);
  });

  it('cortesia não entra na receita', () => {
    expect(corpo).toContain('s.centavos is not null');
  });

  it('a tela mostra que mudar o preço não mexe em quem já assinou', () => {
    expect(TELA).toContain('mantém o valor que contratou');
  });
});

describe('a aba de anúncios mostra o que nenhuma outra tela mostra', () => {
  it('filtra por tipo, situação e texto', () => {
    const abre = SERVICO.indexOf('export async function anunciosDoPainel');
    const fecha = SERVICO.indexOf('return (data as', abre);
    const corpo = SERVICO.slice(abre, fecha);
    expect(corpo).toContain("eq('tipo_anuncio', f.tipo)");
    expect(corpo).toContain("eq('status', f.status)");
    expect(corpo).toContain('titulo.ilike');
  });

  it('as situações que só o administrador vê estão no filtro da tela', () => {
    for (const situacao of ['rascunho', 'fechado', 'concluido', 'cancelado']) {
      expect(TELA, `falta a situação "${situacao}" no filtro`).toContain(`value="${situacao}"`);
    }
  });

  // A regressão: contar propostas com um laço no navegador — uma requisição
  // por anúncio.
  it('a contagem de propostas vem na mesma consulta', () => {
    expect(SERVICO).toContain('propostas(count)');
  });
});

describe('a aba de planos devolve de volta o que entendeu', () => {
  // O guarda contra o dedo escorregado: a restrição do banco recusa abaixo de
  // R$ 5,00, mas 4,90 passaria por 490 e seria recusado; 499,00 passaria. O que
  // pega o engano de verdade é a tela repetir o valor ANTES de salvar.
  it('mostra o valor que vai salvar antes de salvar', () => {
    expect(TELA).toContain('Vai passar a custar');
    expect(TELA).toContain('emReais(novo)');
  });

  it('não adivinha quando não entende o que foi digitado', () => {
    expect(TELA).toContain('Não entendi esse valor');
  });

  it('o botão de salvar fica inerte quando nada mudou', () => {
    expect(TELA).toContain('disabled={!mudou}');
  });

  it('o painel não cria nem apaga plano — o banco também não deixa', () => {
    expect(SERVICO).not.toMatch(/from\('planos'\)\s*\.\s*(insert|delete)/);
    expect(TELA).not.toContain('criarPlano');
    expect(TELA).not.toContain('apagarPlano');
  });
});
