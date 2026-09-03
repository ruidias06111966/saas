// ---------------------------------------------------------------------------
// CONEXÃO — abre o checkout da assinatura.
//
// O QUE ESTA FUNÇÃO NÃO FAZ: mudar o plano. Ela só devolve um link de
// pagamento. Quem diz que o pagamento aconteceu é o Stripe, falando com o
// nosso webhook — nunca o navegador de quem pagou, que poderia simplesmente
// afirmar que pagou.
//
// O preço vai inline (`price_data`) em vez de referenciar um Price criado à mão
// no painel. Assim o valor da tela e o valor cobrado saem do mesmo lugar, e
// não há como a página dizer R$ 29,90 enquanto a cobrança é outra.
// ---------------------------------------------------------------------------

import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const PRECO_CENTAVOS = 2990;
const MOEDA = 'brl';
const NOME_DO_PLANO = 'CONEXÃO Premium';

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

  let body: { voltarPara?: string; acao?: string; corrigir?: boolean; de?: string };
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

    return responder({
      modo: chaveStripe.startsWith('sk_test') ? 'teste' : 'producao',
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
      const { data: assinaturas } = await comoUsuario.rpc('minha_assinatura');
      const linha = Array.isArray(assinaturas) ? assinaturas[0] : assinaturas;
      if (!linha?.provedor) return responder({ erro: 'Você não tem assinatura ativa.' }, 404);

      const clientes = await stripe.customers.list({ email: email ?? undefined, limit: 1 });
      if (!clientes.data.length) return responder({ erro: 'Assinatura não encontrada.' }, 404);

      const portal = await stripe.billingPortal.sessions.create({
        customer: clientes.data[0].id,
        return_url: voltar,
      });
      return responder({ url: portal.url });
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      // Amarra a sessão de pagamento à conta. O webhook lê daqui de quem é o
      // pagamento — nunca de um campo que o navegador tenha mandado.
      client_reference_id: uid,
      customer_email: email ?? undefined,
      locale: 'pt-BR',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: MOEDA,
          unit_amount: PRECO_CENTAVOS,
          recurring: { interval: 'month' },
          product_data: {
            name: NOME_DO_PLANO,
            description: 'Mais alcance e mais ferramentas. Segurança e direitos de LGPD seguem fora do paywall.',
          },
        },
      }],
      subscription_data: { metadata: { conexao_user_id: uid } },
      success_url: `${voltar}?assinatura=ok`,
      cancel_url: `${voltar}?assinatura=cancelada`,
    });

    return responder({ url: checkout.url });
  } catch (err) {
    console.error('[assinar] falha no Stripe', err);
    return responder({ erro: 'Não foi possível abrir o pagamento. Tente de novo.' }, 502);
  }
});
