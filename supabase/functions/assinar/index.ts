// ---------------------------------------------------------------------------
// QICONEXÃO — abre o checkout da assinatura.
//
// O QUE ESTA FUNÇÃO NÃO FAZ: mudar o plano. Ela só devolve um link de
// pagamento. Quem diz que o pagamento aconteceu é o Stripe, falando com o
// nosso webhook — nunca o navegador de quem pagou, que poderia simplesmente
// afirmar que pagou.
//
// De onde sai o preço está explicado logo abaixo: da tabela `planos`, a mesma
// que a tela de Planos lê. Aqui não há número escrito à mão.
// ---------------------------------------------------------------------------

import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const NOME_DO_PLANO = 'QICONEXÃO Premium';

// ---------------------------------------------------------------------------
// DE ONDE SAI O PREÇO — e por que já não sai daqui.
//
// Até 28/09/2026 esta linha era `const PRECO_CENTAVOS = 2990`, enquanto a tela
// mostrava 'R$ 39,90', vindo de constants.ts. Dois números, dois arquivos,
// nenhuma regra obrigando-os a concordar: o primeiro virou 39,90 no PR #20, o
// segundo nasceu 2990 no PR #5 e ficou. Havia teste guardando os Termos contra
// a tela — o documento ficou protegido, a caixa registadora não. Ninguém foi
// cobrado a menos porque nenhum pagamento real chegou a acontecer.
//
// Agora o preço vem da tabela `planos`, a MESMA que a tela lê. O navegador
// manda só o CÓDIGO do plano ('mensal' ou 'anual'); quanto vale cada código é
// lido aqui. Se o navegador mandasse o valor, quem abrisse o console do
// navegador pagaria o que quisesse.
//
// CATÁLOGO DO STRIPE, QUANDO HOUVER
//
// Quando a linha do plano traz `stripe_price_id`, o checkout usa o Preço do
// catálogo: um Produto, um Preço, relatório de receita limpo — em vez de um
// Preço novo a cada assinatura, que era o custo do modo inline apontado na
// auditoria de 03/09/2026.
//
// Mas ANTES de usar, confere se o valor do catálogo bate com `centavos`. Se
// divergir, o checkout NÃO ABRE. Cobrar um valor diferente do que a tela
// mostrou é pior do que não vender.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Só aceitamos voltar para onde o próprio app está. */
function destinoSeguro(bruto: unknown, permitidas: string[]): string | null {
  if (typeof bruto !== 'string' || !bruto) return null;
  try {
    const url = new URL(bruto);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    const ok = permitidas.some((p) => {
      try { return new URL(p).origin === url.origin; } catch { return false; }
    });
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Uma linha da tabela `planos`, que é de onde o preço sai. */
interface LinhaPlano {
  codigo: string;
  nome: string;
  centavos: number;
  intervalo: string;
  moeda: string;
  stripe_price_id: string | null;
}

const COLUNAS_PLANO = 'codigo, nome, centavos, intervalo, moeda, stripe_price_id';

/**
 * O plano pedido, lido do banco — nunca do corpo da requisição.
 *
 * O navegador escolhe o CÓDIGO; o valor é sempre daqui. Só devolve plano que
 * está à venda: um plano desativado no painel some do checkout no mesmo
 * instante em que some da tela.
 *
 * NÃO TEM PADRÃO, E ISSO É DE PROPÓSITO.
 *
 * Esta função publica-se à parte do site, e o site fica em cache por até dez
 * minutos. Entre uma publicação e outra existe uma janela em que uma página
 * ANTIGA — que mostrava outro preço e não sabia mandar `plano` — conversa com
 * esta função nova. Se aqui houvesse um padrão ('mensal', digamos), essa página
 * cobraria um valor que ela mesma não mostrou.
 *
 * Cobrar mais do que a tela anunciou é o pior resultado possível. Por isso a
 * ausência do campo é recusa, com um recado que diz o que fazer.
 */
async function planoPedido(
  cliente: ReturnType<typeof createClient>, pedido: unknown,
): Promise<LinhaPlano | null> {
  if (pedido !== 'mensal' && pedido !== 'anual') return null;
  const { data } = await cliente
    .from('planos').select(COLUNAS_PLANO)
    .eq('codigo', pedido).eq('ativo', true).maybeSingle();
  return (data as LinhaPlano | null) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'Use POST.' }, 405);

  const autorizacao = req.headers.get('Authorization');
  if (!autorizacao) return responder({ erro: 'É preciso estar autenticado.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const chaveStripe = Deno.env.get('STRIPE_SECRET_KEY');
  if (!url || !anon) return responder({ erro: 'Serviço indisponível.' }, 503);
  if (!chaveStripe) {
    // Sem chave configurada o app não quebra: a tela mostra que a cobrança
    // ainda não está ligada, em vez de um erro cru.
    return responder({ indisponivel: true, motivo: 'pagamento ainda não configurado' }, 200);
  }

  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
  });
  const { data: sessao, error: erroAuth } = await comoUsuario.auth.getUser();
  const uid = sessao?.user?.id;
  const email = sessao?.user?.email;
  if (erroAuth || !uid) return responder({ erro: 'Sessão inválida.' }, 401);

  let body: { voltarPara?: string; acao?: string; corrigir?: boolean; de?: string; plano?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const permitidas = (Deno.env.get('URLS_DO_APP') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  // Diagnóstico da cobrança, só para administração. Responde, sem abrir o
  // painel do Stripe, à única pergunta cuja resposta errada faz um pagamento
  // passar sem o plano mudar: o endpoint do webhook existe, aponta para cá e
  // ouve os eventos certos? Nada de segredo sai daqui — só a forma da
  // configuração, e do modo da chave apenas o prefixo.
  if (body.acao === 'diagnostico') {
    const { data: eu } = await comoUsuario
      .from('users').select('role').eq('id', uid).maybeSingle();
    if (eu?.role !== 'admin') return responder({ erro: 'Somente administradores.' }, 403);

    const esperado = `${url}/functions/v1/stripe-webhook`;
    const precisamos = [
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_failed',
    ];
    const stripe = new Stripe(chaveStripe, { apiVersion: '2025-01-27.acacia' });
    let registrados;
    try {
      registrados = await stripe.webhookEndpoints.list({ limit: 20 });
    } catch (err) {
      console.error('[assinar] diagnóstico: o Stripe recusou a chave', err);
      return responder({ erro: 'O Stripe recusou a chave configurada.' }, 502);
    }

    // Reparo, e só quando pedido explicitamente. Duas restrições o tornam
    // seguro: mexe unicamente no endpoint cuja URL é exatamente a nossa (nunca
    // em outro destino da mesma conta Stripe), e só ACRESCENTA eventos — nada
    // que já esteja assinado é removido.
    if (body.corrigir === true) {
      for (const e of registrados.data) {
        if (e.url !== esperado) continue;
        const faltando = e.enabled_events.includes('*')
          ? []
          : precisamos.filter((n) => !e.enabled_events.includes(n));
        if (!faltando.length) continue;
        await stripe.webhookEndpoints.update(e.id, {
          enabled_events: [...new Set([...e.enabled_events, ...faltando])],
        } as Stripe.WebhookEndpointUpdateParams);
      }
      registrados = await stripe.webhookEndpoints.list({ limit: 20 });
    }

    // Cada plano à venda, confrontado com o Stripe.
    //
    // Esta é a pergunta que o diagnóstico antigo respondia errado: ele comparava
    // o catálogo com uma constante deste arquivo, e a constante já não era o que
    // a tela mostrava. Agora a comparação é entre o catálogo e a TABELA — a
    // mesma linha que a tela leu.
    const { data: linhas } = await comoUsuario
      .from('planos').select('codigo, nome, centavos, intervalo, moeda, stripe_price_id, ativo').order('ordem');

    const planos = [];
    for (const linha of (linhas ?? []) as (LinhaPlano & { ativo: boolean })[]) {
      let catalogo: Record<string, unknown> | null = null;
      if (linha.stripe_price_id) {
        try {
          const preco = await stripe.prices.retrieve(linha.stripe_price_id);
          catalogo = {
            id: preco.id,
            ativo: preco.active,
            centavos: preco.unit_amount,
            moeda: preco.currency,
            intervalo: preco.recurring?.interval ?? null,
            confere_com_a_tabela:
              preco.active
              && preco.unit_amount === linha.centavos
              && preco.currency === linha.moeda
              && preco.recurring?.interval === linha.intervalo,
          };
        } catch {
          catalogo = { id: linha.stripe_price_id, erro: 'o Stripe não conhece este preço' };
        }
      }
      planos.push({
        codigo: linha.codigo,
        nome: linha.nome,
        a_venda: linha.ativo,
        centavos_na_tabela: linha.centavos,
        intervalo: linha.intervalo,
        origem_do_preco: linha.stripe_price_id
          ? 'catalogo do Stripe'
          : 'inline (um Preço novo por assinatura)',
        catalogo,
      });
    }

    return responder({
      modo: chaveStripe.startsWith('sk_test') ? 'teste' : 'producao',
      planos,
      segredo_do_webhook_configurado: Boolean(Deno.env.get('STRIPE_WEBHOOK_SECRET')),
      urls_do_app: permitidas,
      endpoint_esperado: esperado,
      endpoints: registrados.data.map((e) => ({
        url: e.url,
        status: e.status,
        // A versão da API do ENDPOINT decide como o Stripe serializa o evento,
        // independente da versão que o SDK daqui usa para chamar a API. Se ela
        // for `basil` ou mais nova, `current_period_end` já não vive na
        // assinatura, e sim em cada item dela.
        versao_da_api: e.api_version,
        aponta_para_ca: e.url === esperado,
        // `*` no Stripe significa "todos os eventos", e cobre a lista toda.
        faltando: e.enabled_events.includes('*')
          ? []
          : precisamos.filter((n) => !e.enabled_events.includes(n)),
      })),
    });
  }

  // Ressincronizar: pede ao Stripe que reemita o estado atual de uma assinatura,
  // tocando nos metadados dela. Existe porque entrega de webhook falha — o
  // Stripe desiste depois de algumas tentativas, e sem isto a única saída seria
  // corrigir o plano na mão, no banco, sem nada que comprove o que o Stripe
  // pensa. Aqui a verdade continua vindo dele, pelo caminho normal.
  if (body.acao === 'ressincronizar') {
    const { data: eu } = await comoUsuario
      .from('users').select('role').eq('id', uid).maybeSingle();
    if (eu?.role !== 'admin') return responder({ erro: 'Somente administradores.' }, 403);

    const alvo = typeof body.de === 'string' && /^[0-9a-f-]{36}$/.test(body.de) ? body.de : uid;
    const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
    if (!servico) return responder({ erro: 'Serviço indisponível.' }, 503);

    const db = createClient(url, servico, { auth: { persistSession: false } });
    const { data: linha } = await db.from('subscriptions')
      .select('provider_id').eq('user_id', alvo).eq('provider', 'stripe').maybeSingle();
    if (!linha?.provider_id?.startsWith('sub_')) {
      return responder({ erro: 'Sem assinatura do Stripe para essa conta.' }, 404);
    }

    const stripe = new Stripe(chaveStripe, { apiVersion: '2025-01-27.acacia' });
    try {
      // O Stripe mescla metadados no update: as chaves que não vão aqui ficam
      // como estavam, então `conexao_user_id` sobrevive.
      await stripe.subscriptions.update(linha.provider_id, {
        metadata: { conexao_ressincronizado_em: new Date().toISOString() },
      });
    } catch (err) {
      console.error('[assinar] falha ao ressincronizar', err);
      return responder({ erro: 'O Stripe recusou a ressincronização.' }, 502);
    }
    return responder({ ok: true, assinatura: linha.provider_id });
  }

  const voltar = destinoSeguro(body.voltarPara, permitidas)
    ?? permitidas[0]
    ?? null;
  if (!voltar) {
    console.error('[assinar] URLS_DO_APP não configurada');
    return responder({ erro: 'Serviço indisponível.' }, 503);
  }

  const stripe = new Stripe(chaveStripe, { apiVersion: '2025-01-27.acacia' });

  try {
    // Portal de cobrança: cancelar, trocar cartão, ver recibos. Tudo isso é do
    // Stripe — reimplementar aqui seria assumir responsabilidade sobre dados de
    // cartão sem necessidade nenhuma.
    if (body.acao === 'gerenciar') {
      // O cliente do Stripe vem da PRÓPRIA assinatura, e não de uma busca por
      // e-mail.
      //
      // Buscar por e-mail parecia equivalente e não é. O Stripe permite vários
      // Customers com o mesmo endereço, e o nosso checkout cria um a cada
      // pagamento (`customer_email`). Com `limit: 1` a escolha era arbitrária:
      // o portal podia abrir num cliente vazio, e quem paga não encontraria a
      // assinatura para cancelar. Pior ainda para quem trocasse de e-mail no
      // app — a busca não acharia nada, e o único caminho de cancelamento
      // sumiria. Cancelar é direito de quem assina, não pode depender de sorte.
      //
      // O id guardado em `subscriptions` responde isso sem ambiguidade. A
      // leitura é com a chave de serviço porque `provider_id` não sai para o
      // cliente — nem precisa.
      const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
      if (!servico) return responder({ erro: 'Serviço indisponível.' }, 503);

      const db = createClient(url, servico, { auth: { persistSession: false } });
      const { data: linha } = await db.from('subscriptions')
        .select('provider_id').eq('user_id', uid).eq('provider', 'stripe').maybeSingle();
      if (!linha?.provider_id) return responder({ erro: 'Você não tem assinatura ativa.' }, 404);

      // Normalmente um `sub_`. Pode ser um `cs_` quando o evento de checkout
      // chegou sem o id da assinatura — os dois sabem dizer de quem são.
      let cliente: string | null = null;
      try {
        const id = linha.provider_id;
        const obj = id.startsWith('cs_')
          ? await stripe.checkout.sessions.retrieve(id)
          : await stripe.subscriptions.retrieve(id);
        cliente = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id ?? null;
      } catch (err) {
        // Cai aqui, entre outros casos, quando a assinatura é de um modo
        // diferente do da chave em uso: um `sub_` criado em teste não existe
        // para uma chave de produção.
        console.error('[assinar] o Stripe não reconhece a assinatura guardada', err);
      }
      if (!cliente) return responder({ erro: 'Assinatura não encontrada no Stripe.' }, 404);

      const portal = await stripe.billingPortal.sessions.create({
        customer: cliente,
        return_url: voltar,
      });
      return responder({ url: portal.url });
    }

    // O preço sai DAQUI, do banco. O corpo da requisição escolhe o código do
    // plano e mais nada.
    if (body.plano !== 'mensal' && body.plano !== 'anual') {
      // Página em cache, de uma versão anterior. Ela mostrava outro preço, e
      // adivinhar qual plano ela queria seria cobrar um valor que ela não
      // anunciou.
      return responder({
        erro: 'Esta página é de uma versão anterior. Atualize a página (F5) e tente de novo — '
            + 'nada foi cobrado.',
      }, 409);
    }
    const plano = await planoPedido(comoUsuario, body.plano);
    if (!plano) return responder({ erro: 'Este plano não está à venda.' }, 400);

    // Quando há Preço de catálogo, ele só é usado depois de bater com a tabela.
    // Divergiu, o checkout não abre: cobrar um valor diferente do que a tela
    // mostrou é pior do que não vender.
    let item: Stripe.Checkout.SessionCreateParams.LineItem;
    if (plano.stripe_price_id) {
      const preco = await stripe.prices.retrieve(plano.stripe_price_id);
      const confere = preco.active
        && preco.unit_amount === plano.centavos
        && preco.currency === plano.moeda
        && preco.recurring?.interval === plano.intervalo;
      if (!confere) {
        console.error('[assinar] catálogo do Stripe diverge da tabela planos', {
          codigo: plano.codigo,
          tabela: { centavos: plano.centavos, moeda: plano.moeda, intervalo: plano.intervalo },
          catalogo: {
            ativo: preco.active, centavos: preco.unit_amount,
            moeda: preco.currency, intervalo: preco.recurring?.interval ?? null,
          },
        });
        return responder({
          erro: 'O preço cadastrado no provedor de pagamento não confere com o preço desta tela. '
              + 'Por segurança nada foi cobrado. Avise o administrador.',
        }, 409);
      }
      item = { price: plano.stripe_price_id, quantity: 1 };
    } else {
      item = {
        quantity: 1,
        price_data: {
          currency: plano.moeda,
          unit_amount: plano.centavos,
          recurring: { interval: plano.intervalo as Stripe.Price.Recurring.Interval },
          product_data: {
            name: `${NOME_DO_PLANO} — ${plano.nome}`,
            description: 'Mais alcance e mais ferramentas. Segurança e direitos de LGPD seguem fora do paywall.',
          },
        },
      };
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      // Amarra a sessão de pagamento à conta. O webhook lê daqui de quem é o
      // pagamento — nunca de um campo que o navegador tenha mandado.
      client_reference_id: uid,
      customer_email: email ?? undefined,
      locale: 'pt-BR',
      line_items: [item],
      // `conexao_plano` é como o webhook sabe QUAL plano foi pago, para
      // gravar em `subscriptions.plano_codigo` e o painel poder somar receita
      // mensal e anual separadamente.
      subscription_data: { metadata: { conexao_user_id: uid, conexao_plano: plano.codigo } },
      metadata: { conexao_plano: plano.codigo },
      success_url: `${voltar}?assinatura=ok`,
      cancel_url: `${voltar}?assinatura=cancelada`,
    });

    return responder({ url: checkout.url });
  } catch (err) {
    console.error('[assinar] falha no Stripe', err);
    return responder({ erro: 'Não foi possível abrir o pagamento. Tente de novo.' }, 502);
  }
});
