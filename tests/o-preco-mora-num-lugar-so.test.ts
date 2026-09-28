import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O DEFEITO QUE ESTES TESTES GUARDAM
//
// O preço vivia em dois lugares:
//
//   constants.ts .................. 'R$ 39,90'   (o que a pessoa LIA)
//   functions/assinar/index.ts .... 2990         (o que o cartão PAGARIA)
//
// O primeiro virou 39,90 no PR #20. O segundo nasceu 2990 no PR #5 e ficou.
// Existia um teste — "o preço nos Termos é o preço que o app cobra" — que
// guardava o DOCUMENTO contra a tela. O documento ficou protegido e a caixa
// registadora não, porque ninguém ligou a tela à função que cobra.
//
// A correção não foi acertar os dois números. Foi não haver dois. Estes testes
// existem para que não voltem a ser dois.
//
// SOBRE A FORMA DESTES TESTES
//
// Cinco vezes nesta base um teste passou por acidente, sempre pela mesma causa:
// a busca encontrava, FORA do lugar pretendido, aquilo que devia achar dentro
// dele — uma linha de `import`, um botão vizinho, um `[\s\S]*?` que varria o
// arquivo inteiro.
//
// Aqui o risco é o comentário. Esta base explica os defeitos que corrige dentro
// do código, e por isso a string 'R$ 39,90' aparece de propósito em comentários
// de constants.ts e de services/planos.ts. Uma busca ingênua por 'R$' acharia
// esses comentários e falharia sem defeito nenhum — ou, pior, um dia acharia só
// eles e passaria com o defeito de volta. Por isso tudo aqui lê o código com os
// comentários REMOVIDOS.
// ---------------------------------------------------------------------------

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');

/**
 * O arquivo sem comentários — só o que o computador executa.
 *
 * Não é um analisador de sintaxe: uma barra dupla dentro de uma string viraria
 * comentário aos olhos desta função. Nesta base isso só aconteceria numa URL, e
 * apagar o resto de uma linha de URL não cria falso NEGATIVO aqui: o que
 * procuramos é preço, e preço não mora dentro de URL.
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * O SQL sem comentários.
 *
 * Existe por causa de uma passagem acidental: comentei `revoke update ...` e o
 * teste continuou verde, porque `-- revoke update ...` CONTÉM `revoke update
 * ...`. É a sexta vez nesta sessão, e literalmente a mesma causa da primeira —
 * a busca encontra, fora do lugar pretendido, o que devia achar dentro dele.
 *
 * Não é um analisador de SQL: dois traços dentro de uma string seriam tratados
 * como comentário. Não há nenhum nesta migração, e se houver um dia o efeito é
 * um teste que falha pedindo atenção, não um que passa escondendo defeito.
 */
const semComentariosSQL = (sql: string): string =>
  sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Todo arquivo de código do cliente e das funções, exceto testes. */
function arquivosDeCodigo(): string[] {
  const achados: string[] = [];
  const visitar = (dir: string): void => {
    for (const nome of readdirSync(dir)) {
      if (['node_modules', 'dist', '.git', 'tests', 'coverage'].includes(nome)) continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { visitar(caminho); continue; }
      if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) achados.push(caminho);
    }
  };
  visitar('.');
  return achados;
}

describe('não há preço escrito à mão fora do modo demonstração', () => {
  // A regressão que este teste pega: alguém "conserta" a tela pondo o número
  // de volta num arquivo, e a partir daí há dois números outra vez.
  it('nenhum arquivo de código traz centavos escritos à mão, salvo o seed da demonstração', () => {
    const culpados = arquivosDeCodigo()
      .filter((f) => /centavos:\s*\d|unit_amount:\s*\d/.test(semComentarios(ler(f))))
      .map((f) => f.replace(/^\.\//, ''));

    expect(culpados, 'só data/seed.ts pode ter preço escrito à mão')
      .toEqual(['data/seed.ts']);
  });

  it('nenhum arquivo de código traz um valor em reais escrito à mão', () => {
    // 'R$ 0' fica de fora: zero é o preço de não ter plano, e nunca envelhece.
    const culpados = arquivosDeCodigo()
      .filter((f) => /R\$\s?\d+,\d{2}/.test(semComentarios(ler(f))))
      .map((f) => f.replace(/^\.\//, ''));

    expect(culpados, 'o valor em reais tem de vir do banco').toEqual([]);
  });

  it('a constante PRECO_PREMIUM não existe mais', () => {
    const constantes = semComentarios(ler('constants.ts'));
    expect(constantes).not.toContain('PRECO_PREMIUM');
  });

  it('o seed da demonstração traz os dois planos, e diz que é demonstração', () => {
    const seed = ler('data/seed.ts');
    expect(seed).toContain('PLANOS_DEMO');
    expect(seed).toMatch(/codigo: 'mensal'/);
    expect(seed).toMatch(/codigo: 'anual'/);
    expect(seed).toMatch(/demonstra|Demonstra/);
  });
});

describe('a tela de Planos lê o preço do banco', () => {
  const tela = semComentarios(ler('screens/Premium.tsx'));

  it('mostra o valor vindo da linha do plano', () => {
    expect(tela).toContain('emReais(p.centavos)');
  });

  it('pergunta ao servidor quais planos estão à venda', () => {
    expect(tela).toContain('planosAVenda()');
  });

  // A regressão: alguém põe um preço de reserva para a tela "não ficar vazia".
  // Um preço de reserva na tela é o defeito desta etapa, de volta.
  it('enquanto não sabe o preço, não inventa um', () => {
    expect(tela).toContain('Carregando os preços');
    expect(tela).toContain('Não consegui carregar os preços');
    expect(tela).not.toMatch(/R\$\s?\d+,\d{2}/);
  });

  it('o botão de assinar diz QUAL plano está assinando', () => {
    expect(tela).toContain('subscribe(p.codigo)');
  });
});

describe('o navegador escolhe o plano, nunca o valor', () => {
  const billing = semComentarios(ler('services/billing.ts'));

  it('o checkout recebe o código do plano', () => {
    expect(billing).toMatch(/startCheckout\(\s*plano: CodigoPlano\s*\)/);
  });

  // A regressão que isto pega é a pior desta etapa: se o valor subisse do
  // navegador, quem abrisse o console pagaria o que quisesse.
  it('nada que se pareça com valor sobe do navegador', () => {
    expect(billing).not.toMatch(/\b(centavos|unit_amount|valor|preco|price)\b\s*:/i);
  });
});

describe('a função que cobra lê o preço do banco', () => {
  const assinar = semComentarios(ler('supabase/functions/assinar/index.ts'));

  it('não existe mais constante de preço nesta função', () => {
    expect(assinar).not.toContain('PRECO_CENTAVOS');
    expect(assinar).not.toContain('PRECO_DO_CATALOGO');
    expect(assinar).not.toContain('STRIPE_PRICE_ID');
  });

  it('o plano vem da tabela `planos`', () => {
    expect(assinar).toContain("from('planos')");
    expect(assinar).toContain("eq('ativo', true)");
  });

  it('o valor cobrado é o da linha do plano', () => {
    expect(assinar).toContain('unit_amount: plano.centavos');
    expect(assinar).toContain('currency: plano.moeda');
  });

  // A regressão: alguém põe um padrão ('mensal', digamos) para a função "não
  // falhar". Aí uma página em cache, que mostrava outro preço e não sabe mandar
  // `plano`, passa a cobrar um valor que ela nunca anunciou.
  it('sem plano dito, NÃO adivinha — recusa', () => {
    expect(assinar).toMatch(/if \(pedido !== 'mensal' && pedido !== 'anual'\) return null;/);
    expect(assinar).toContain('Atualize a página (F5)');
  });

  it('a recusa acontece antes de falar com o Stripe', () => {
    const antes = assinar.slice(0, assinar.indexOf('stripe.checkout.sessions.create'));
    expect(antes).toContain("body.plano !== 'mensal' && body.plano !== 'anual'");
  });

  it('um plano fora de venda não abre checkout', () => {
    expect(assinar).toContain("erro: 'Este plano não está à venda.'");
  });
});

describe('o catálogo do Stripe não pode divergir da tabela em silêncio', () => {
  // Esta é a parte que o diagnóstico antigo errava: ele comparava o catálogo
  // com uma CONSTANTE deste arquivo, e a constante já não era o que a tela
  // mostrava. Comparar com a coisa errada é pior do que não comparar, porque
  // devolve "confere" quando não confere.
  const assinar = ler('supabase/functions/assinar/index.ts');

  /** Recorte delimitado, em vez de `[\s\S]*?` — que já passou por acidente. */
  const trecho = (abre: string, fecha: string): string => {
    const i = assinar.indexOf(abre);
    expect(i, `não achei "${abre}"`).toBeGreaterThan(-1);
    const j = assinar.indexOf(fecha, i);
    expect(j, `não achei o fim a partir de "${abre}"`).toBeGreaterThan(i);
    return assinar.slice(i, j + fecha.length);
  };

  it('a conferência acontece ANTES de criar a sessão de pagamento', () => {
    const antes = assinar.slice(0, assinar.indexOf('stripe.checkout.sessions.create'));
    expect(antes).toContain('preco.unit_amount === plano.centavos');
  });

  it('divergiu, o checkout não abre', () => {
    const guarda = trecho('if (!confere) {', '}, 409);');
    expect(guarda).toContain('return responder(');
    expect(guarda).toContain('nada foi cobrado');
    expect(guarda).not.toContain('stripe.checkout.sessions.create');
  });

  it('a conferência olha valor, moeda, intervalo e se o preço está ativo', () => {
    const conf = trecho('const confere = preco.active', ';');
    expect(conf).toContain('preco.unit_amount === plano.centavos');
    expect(conf).toContain('preco.currency === plano.moeda');
    expect(conf).toContain('preco.recurring?.interval === plano.intervalo');
  });

  it('o diagnóstico compara o catálogo com a TABELA, não com uma constante', () => {
    expect(assinar).toContain('confere_com_a_tabela');
    expect(assinar).not.toContain('confere_com_a_tela');
  });
});

describe('o webhook registra QUAL plano foi pago', () => {
  const webhook = semComentarios(ler('supabase/functions/stripe-webhook/index.ts'));

  it('passa o código do plano para o banco', () => {
    expect(webhook).toContain('codigo_do_plano: codigo');
  });

  it('o código vem do metadado que nós gravamos, não de um valor do Stripe', () => {
    expect(webhook).toContain('meta?.conexao_plano');
  });

  // NULO significa "não sei", e não pode virar 'mensal' por conveniência: uma
  // assinatura de cortesia contada como mensal inflaria a receita do painel.
  it('o que não reconhece vira nulo, não vira mensal', () => {
    expect(webhook).toMatch(/bruto === 'mensal' \|\| bruto === 'anual' \? bruto : null/);
  });
});

describe('a migração 025 tranca o que o painel não pode mexer', () => {
  const sql = semComentariosSQL(ler('supabase/migrations/025_um_preco_so_para_a_tela_e_para_a_caixa.sql'));

  /** O mesmo recorte delimitado usado na etapa anterior, pela mesma razão. */
  const policy = (nome: string): string => {
    const abre = sql.indexOf(`create policy "${nome}"`);
    expect(abre, `não achei a policy "${nome}"`).toBeGreaterThan(-1);
    const fecha = sql.indexOf(';', abre);
    expect(fecha, `não achei o fim da policy "${nome}"`).toBeGreaterThan(abre);
    return sql.slice(abre, fecha + 1);
  };

  it('quem não entrou ainda consegue ver quanto custa', () => {
    expect(policy('qualquer um vê os planos à venda')).toContain('to anon, authenticated');
  });

  it('mudar preço exige ser administrador, na leitura E na escrita', () => {
    const p = policy('só administrador muda preço');
    expect(p).toContain('using (private.is_admin())');
    expect(p).toContain('with check (private.is_admin())');
  });

  it('não existe política de INSERT nem de DELETE em planos', () => {
    expect(sql).not.toMatch(/create policy[^;]*on public\.planos for insert/i);
    expect(sql).not.toMatch(/create policy[^;]*on public\.planos for delete/i);
  });

  // Estes dois `revoke` não vieram de raciocínio: vieram de testar contra a API
  // de verdade. Sem eles, apagar um plano e mudar o preço como anônimo
  // devolviam 200 com lista vazia — a RLS filtrava em SILÊNCIO. Silêncio é o
  // pior jeito de negar: não aparece em log nem em tela.
  it('o privilégio de tabela também nega INSERT e DELETE', () => {
    expect(sql).toContain('revoke insert, delete, truncate on public.planos from anon, authenticated');
  });

  it('quem não entrou não muda preço nem com a RLS aberta', () => {
    expect(sql).toContain('revoke update on public.planos from anon;');
  });

  it('código, intervalo e moeda são fixos depois de criados', () => {
    expect(sql).toContain('new.codigo <> old.codigo');
    expect(sql).toContain('new.intervalo <> old.intervalo');
    expect(sql).toContain('new.moeda <> old.moeda');
  });

  // A regressão mais cara desta migração: `create or replace` com um parâmetro
  // a mais NÃO substitui — cria uma segunda função, e o PostgREST recusa por
  // ambiguidade. Isso derrubaria o webhook do Stripe, e só se descobriria com
  // um cliente real pagando e não recebendo acesso.
  it('a função antiga é DERRUBADA antes de a nova ser criada', () => {
    const drop = sql.indexOf('drop function if exists public.aplicar_assinatura_stripe(uuid, plan_type, text, text, timestamptz);');
    const create = sql.indexOf('create or replace function public.aplicar_assinatura_stripe(');
    expect(drop, 'a função antiga não é derrubada').toBeGreaterThan(-1);
    expect(create, 'a função nova não é criada').toBeGreaterThan(-1);
    expect(drop, 'derrubar tem de vir ANTES de criar').toBeLessThan(create);
  });

  it('o parâmetro novo tem DEFAULT, para a chamada antiga continuar resolvendo', () => {
    expect(sql).toContain('codigo_do_plano text default null');
  });

  it('só o service_role executa o caminho do dinheiro', () => {
    expect(sql).toContain('grant execute on function public.aplicar_assinatura_stripe(uuid, plan_type, text, text, timestamptz, text) to service_role');
    expect(sql).toMatch(/revoke all on function public\.aplicar_assinatura_stripe\([^)]*\) from public, anon, authenticated/);
  });
});

describe('os documentos não repetem o preço', () => {
  // Repetir o número num documento estático é combinar para ele envelhecer: o
  // preço agora muda pelo painel, e o documento não muda junto. Foi assim que
  // os Termos disseram R$ 29,90 enquanto o app dizia R$ 39,90.
  for (const doc of ['termos', 'manual'] as const) {
    it(`${doc}.html não traz valor em reais`, () => {
      const html = ler(`public/${doc}.html`);
      const valores = [...html.matchAll(/R\$\s?\d+,\d{2}/g)].map((m) => m[0]);
      expect(valores, `${doc}.html repete preço: ${valores.join(', ')}`).toEqual([]);
    });

    it(`${doc}.html diz que existem dois planos e onde ver o preço`, () => {
      const html = ler(`public/${doc}.html`);
      expect(html).toMatch(/mensal/i);
      expect(html).toMatch(/anual/i);
      expect(html).toContain('Planos');
    });
  }

  it('os Termos dizem que quem já assinou mantém o valor contratado', () => {
    expect(ler('public/termos.html')).toContain('mantém o valor contratado');
  });
});
