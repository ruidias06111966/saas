import { requireSupabase, supabaseEnabled } from './supabaseClient';

// ---------------------------------------------------------------------------
// Assinatura.
//
// O cliente NUNCA diz "paguei". Ele só pede um link de checkout; quem afirma
// que o pagamento aconteceu é o Stripe, falando com a Edge Function
// `stripe-webhook`. `users.plan` está congelada para o cliente pelo gatilho
// campos_privilegiados — sem isso, virar premium seria uma requisição do
// console do navegador.
//
// Cancelar, trocar cartão e ver recibos acontecem no portal do próprio Stripe.
// Reimplementar isso aqui seria assumir responsabilidade sobre dado de cartão
// sem necessidade nenhuma.
// ---------------------------------------------------------------------------

export interface Subscription {
  plan: 'free' | 'premium';
  status: string;
  provider?: string;
  expiresAt?: string;
}

/** Onde o Stripe deve devolver a pessoa depois do pagamento. */
const voltarPara = (): string => `${window.location.origin}${window.location.pathname}`;

async function chamar(acao?: 'gerenciar'): Promise<{ url?: string; indisponivel?: boolean }> {
  const { data, error } = await requireSupabase().functions.invoke('assinar', {
    body: { voltarPara: voltarPara(), ...(acao ? { acao } : {}) },
  });
  const corpo = data as { url?: string; indisponivel?: boolean; erro?: string } | null;
  if (error || corpo?.erro) throw new Error(corpo?.erro ?? error?.message ?? 'Falha ao abrir o pagamento.');
  return corpo ?? {};
}

/** Abre o checkout. Devolve false quando a cobrança ainda não foi configurada. */
export async function startCheckout(): Promise<boolean> {
  const r = await chamar();
  if (r.indisponivel || !r.url) return false;
  window.location.href = r.url;
  return true;
}

/** Abre o portal do Stripe: cancelar, trocar cartão, ver recibos. */
export async function openBillingPortal(): Promise<void> {
  const r = await chamar('gerenciar');
  if (!r.url) throw new Error('Não foi possível abrir o portal de cobrança.');
  window.location.href = r.url;
}

export async function mySubscription(): Promise<Subscription | null> {
  const { data, error } = await requireSupabase().rpc('minha_assinatura');
  if (error) return null;
  const linha = (Array.isArray(data) ? data[0] : data) as
    { plano: 'free' | 'premium'; status: string; provedor: string | null; expira: string | null } | undefined;
  if (!linha) return null;
  return {
    plan: linha.plano, status: linha.status,
    provider: linha.provedor ?? undefined,
    expiresAt: linha.expira ?? undefined,
  };
}

export const billingEnabled = supabaseEnabled;
