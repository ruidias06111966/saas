// ---------------------------------------------------------------------------
// CONEXÃO — webhook do Stripe. É aqui, e só aqui, que o plano muda.
//
// POR QUE `verify_jwt: false`
// O Stripe não tem sessão no nosso app; ele não manda JWT nenhum. A porta
// precisa ficar aberta para a internet — e é justamente por isso que a
// primeira coisa feita aqui é CONFERIR A ASSINATURA CRIPTOGRÁFICA do evento
// com o segredo do webhook. Sem essa conferência, qualquer pessoa que
// descobrisse a URL daria premium a quem quisesse com um POST.
//
// O corpo é lido como texto cru de propósito: a assinatura cobre os bytes
// exatos, e reserializar o JSON invalidaria a conferência.
//
// De quem é o pagamento: sai do `client_reference_id`, que NÓS gravamos ao
// criar o checkout, e não de qualquer campo controlável por quem paga.
// ---------------------------------------------------------------------------

import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405 });

  const chave = Deno.env.get('STRIPE_SECRET_KEY');
  const segredoWebhook = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const url = Deno.env.get('SUPABASE_URL');
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;

  if (!chave || !segredoWebhook || !url || !servico) {
    console.error('[stripe-webhook] ambiente incompleto');
    return new Response('Serviço indisponível.', { status: 503 });
  }

  const assinatura = req.headers.get('stripe-signature');
  if (!assinatura) return new Response('Sem assinatura.', { status: 400 });

  const stripe = new Stripe(chave, { apiVersion: '2025-01-27.acacia' });
  const cru = await req.text();

  let evento: Stripe.Event;
  try {
    // constructEventAsync porque no Deno a verificação usa Web Crypto.
    evento = await stripe.webhooks.constructEventAsync(cru, assinatura, segredoWebhook);
  } catch (err) {
    console.error('[stripe-webhook] assinatura inválida', err);
    return new Response('Assinatura inválida.', { status: 400 });
  }

  const db = createClient(url, servico, { auth: { persistSession: false } });

  // Idempotência: o Stripe reentrega quando não recebe 2xx rápido. Sem isto,
  // uma reentrega estenderia o vencimento de novo.
  const { error: erroDup } = await db.from('webhook_events')
    .insert({ id: evento.id, provider: 'stripe', type: evento.type });
  if (erroDup) {
    // Chave duplicada = já processamos. 200 para o Stripe parar de reentregar.
    if (erroDup.code === '23505') return new Response('ok (repetido)', { status: 200 });
    console.error('[stripe-webhook] falha ao registrar o evento', erroDup);
    return new Response('Erro interno.', { status: 500 });
  }

  const aplicar = async (
    uid: string, plano: 'free' | 'premium', status: string,
    idNoProvedor: string, expira: string | null,
  ) => {
    const { error } = await db.rpc('aplicar_assinatura_stripe', {
      dono: uid, novo_plano: plano, novo_status: status,
      id_no_provedor: idNoProvedor, expira,
    });
    if (error) throw error;
  };

  /** O id da nossa conta vive nos metadados que gravamos ao criar o checkout. */
  const donoDaAssinatura = async (assin: Stripe.Subscription): Promise<string | null> => {
    const meta = assin.metadata?.conexao_user_id;
    if (meta) return meta;
    // Assinatura antiga, sem metadado: procura pelo id que guardamos.
    const { data } = await db.from('subscriptions')
      .select('user_id').eq('provider', 'stripe').eq('provider_id', assin.id).maybeSingle();
    return data?.user_id ?? null;
  };

  try {
    switch (evento.type) {
      case 'checkout.session.completed': {
        const s = evento.data.object as Stripe.Checkout.Session;
        const uid = s.client_reference_id;
        if (!uid) { console.error('[stripe-webhook] checkout sem client_reference_id'); break; }
        if (s.payment_status !== 'paid' && s.status !== 'complete') break;
        const idAssinatura = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id;
        await aplicar(uid, 'premium', 'ativa', idAssinatura ?? s.id, null);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const assin = evento.data.object as Stripe.Subscription;
        const uid = await donoDaAssinatura(assin);
        if (!uid) { console.error('[stripe-webhook] assinatura sem dono conhecido'); break; }
        const viva = assin.status === 'active' || assin.status === 'trialing';
        const fim = assin.cancel_at ?? assin.current_period_end;
        await aplicar(
          uid,
          viva ? 'premium' : 'free',
          viva ? 'ativa' : (assin.status === 'canceled' ? 'cancelada' : 'expirada'),
          assin.id,
          fim ? new Date(fim * 1000).toISOString() : null,
        );
        break;
      }

      case 'invoice.payment_failed': {
        // Não rebaixa na hora: o Stripe ainda vai tentar de novo, e derrubar o
        // plano na primeira falha puniria quem só trocou de cartão. Quem
        // rebaixa é o customer.subscription.updated, quando o Stripe desiste.
        console.log('[stripe-webhook] pagamento falhou, aguardando o Stripe decidir');
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('[stripe-webhook] falha ao aplicar o evento', err);
    // Devolve 500 para o Stripe reentregar. A linha de idempotência sai, senão
    // a reentrega seria descartada como repetida sem nunca ter sido aplicada.
    await db.from('webhook_events').delete().eq('id', evento.id);
    return new Response('Erro ao aplicar.', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
