import { useEffect, useState } from 'react';
import { PRECO_PREMIUM, QUOTAS, quantidade } from '../constants';
import { AvisoDeCortesia } from '../components/AvisoDeCortesia';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Icon, SectionTitle } from '../components/ui';
import { supabaseEnabled } from '../services/supabaseClient';
import { openBillingPortal, startCheckout } from '../services/billing';
import { uid } from '../services/utils';

// ---------------------------------------------------------------------------
// Os planos.
//
// Reescrita em 25/09/2026 porque a versão anterior confundia — e confundir na
// página de preço é o pior lugar para confundir. Ela listava oito linhas, das
// quais seis eram iguais nos dois planos, e a diferença real ficava perdida no
// meio.
//
// Agora a tela diz UMA COISA: o que muda é quantas propostas você pode enviar
// por mês. O resto é igual, e está dito de uma vez, no fim, em uma frase.
// ---------------------------------------------------------------------------

/** A única diferença que importa. Tudo o mais é igual e não vai para a tabela. */
const A_DIFERENCA = [
  {
    label: 'Enviar propostas',
    free: `${quantidade(QUOTAS.free.propostasPorMes)} por mês`,
    premium: 'Ilimitado',
    porque: 'É o que separa os planos. As três grátis existem para você fechar um trabalho antes de assinar.',
  },
  {
    label: 'Filtros avançados na busca de profissionais',
    free: '—',
    premium: 'Sim',
    porque: 'Refinar a busca por área, cidade e atendimento ao mesmo tempo.',
  },
  {
    label: 'Sugestões do Copiloto por dia',
    free: quantidade(QUOTAS.free.dailyAiCalls),
    premium: quantidade(QUOTAS.premium.dailyAiCalls),
    porque: 'A ajuda para escrever proposta, perfil e mensagem.',
  },
];

/** O que é igual nos dois. Fica fora da tabela de propósito. */
const IGUAL_NOS_DOIS = [
  'Publicar anúncios, sem limite nenhum',
  'Ver todos os anúncios abertos',
  'Ver o perfil de qualquer profissional',
  'Conversar com quem aceitou falar com você',
  'Receber propostas nos seus anúncios, e aceitar ou recusar',
  'Ver o telefone do outro lado quando uma proposta é aceita',
  'Selo de verificado, bloqueio, denúncia e moderação',
];

export function Premium() {
  const { me, dispatch, back, toast, refresh } = useApp();
  const [ocupado, setOcupado] = useState(false);
  const [semCobranca, setSemCobranca] = useState(false);

  // A volta do Stripe traz ?assinatura=ok. O plano em si quem muda é o
  // webhook, então aqui só recarregamos para ler o que o servidor decidiu.
  useEffect(() => {
    if (!supabaseEnabled) return;
    const p = new URLSearchParams(window.location.search).get('assinatura');
    if (!p) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (p === 'ok') {
      toast('Pagamento recebido. Confirmando com o provedor…', 'ok');
      // O webhook chega em segundos; uma recarga tardia evita mostrar
      // "gratuito" para quem acabou de pagar.
      void refresh();
      window.setTimeout(() => void refresh(), 4000);
    } else if (p === 'cancelada') {
      toast('Pagamento cancelado. Nada foi cobrado.', 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!me) return null;
  const isPremium = me.plan === 'premium';

  const subscribe = async () => {
    // Modo demo: não há servidor para cobrar nem para autorizar. Continua
    // simulando, e a tela diz que é simulação.
    if (!supabaseEnabled) {
      dispatch({
        type: 'SET_SUBSCRIPTION',
        subscription: {
          id: uid('sub'), userId: me.id, plan: isPremium ? 'free' : 'premium',
          status: isPremium ? 'cancelada' : 'ativa',
          startedAt: new Date().toISOString(),
          expiresAt: isPremium ? undefined : new Date(Date.now() + 30 * 86400000).toISOString(),
        },
      });
      toast(isPremium ? 'Assinatura cancelada (simulação).' : 'Premium ativado (simulação, sem cobrança).', 'ok');
      return;
    }

    setOcupado(true);
    try {
      if (isPremium) {
        await openBillingPortal();
        return;
      }
      const abriu = await startCheckout();
      if (!abriu) setSemCobranca(true);
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Page
      title="Planos"
      back={back}
      subtitle="Publicar anúncio é de graça, sempre. O que se paga é enviar proposta sem limite."
      maxWidth="max-w-3xl"
    >
      {/* Antes de qualquer coisa sobre pagar: quem já tem de graça precisa
          saber disso primeiro. Oferecer assinatura a quem está no meio da
          cortesia é o caminho mais curto para a pessoa achar que foi cobrada
          duas vezes. */}
      <AvisoDeCortesia compacto />

      {/* A regra do produto, dita em uma frase antes de qualquer tabela. */}
      <Card className="mt-4 border-brand/30 p-5">
        <p className="font-display text-lg font-semibold">Como funciona, em uma frase</p>
        <p className="mt-2 text-[15px] leading-relaxed">
          Quem <strong>precisa de um serviço</strong> nunca paga nada: publicar anúncio, receber
          propostas e escolher são de graça, para sempre. Quem <strong>oferece serviço</strong> envia{' '}
          <strong>{quantidade(QUOTAS.free.propostasPorMes)} propostas por mês</strong> de graça — e
          assina só quando quiser enviar mais.
        </p>
      </Card>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Card className={`p-6 ${!isPremium ? 'border-brand/50' : ''}`}>
          <h2 className="font-display text-xl font-bold">Gratuito</h2>
          <p className="mt-3 font-display text-3xl font-bold">R$ 0</p>
          <p className="mt-1 text-[13px] text-muted">para sempre</p>
          <p className="mt-4 text-[15px] font-semibold text-brand">
            {quantidade(QUOTAS.free.propostasPorMes)} propostas por mês
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Tudo o mais funciona igual. Se você só publica anúncios e contrata, este plano basta —
            não há nada que você precise pagar.
          </p>
          {!isPremium && (
            <p className="mt-5 rounded-2xl bg-brandSoft/60 p-2.5 text-center text-[13px] font-semibold text-brand">
              Seu plano atual
            </p>
          )}
        </Card>

        <Card className={`relative overflow-hidden p-6 ${isPremium ? 'border-ember/50' : ''}`}>
          <div className="absolute right-0 top-0 rounded-bl-2xl bg-gradient-to-r from-brand to-ember px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            Para quem vive disso
          </div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Icon name="crown" size={20} className="text-ember" /> Premium
          </h2>
          <p className="mt-3 font-display text-3xl font-bold">
            {PRECO_PREMIUM}<span className="text-base font-medium text-muted">/mês</span>
          </p>
          <p className="mt-1 text-[13px] text-muted">cancela quando quiser</p>
          <p className="mt-4 text-[15px] font-semibold text-ember">Propostas ilimitadas</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Faz sentido a partir do momento em que um trabalho fechado paga vários meses. Antes
            disso, fique no gratuito.
          </p>
          <Button
            full className="mt-5" loading={ocupado}
            variant={isPremium ? 'outline' : 'primary'} onClick={() => void subscribe()}
          >
            {isPremium ? 'Gerenciar assinatura' : 'Assinar o Premium'}
          </Button>
          {isPremium && supabaseEnabled && (
            <p className="mt-2 text-center text-[11px] text-muted">
              Cancelar, trocar o cartão e ver recibos acontecem no portal do Stripe.
            </p>
          )}
        </Card>
      </div>

      <section className="mt-7">
        <SectionTitle hint="Só três linhas, porque só três coisas mudam.">
          O que muda entre um e outro
        </SectionTitle>
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-bg text-left">
              <tr>
                <th className="p-3 font-semibold">O quê</th>
                <th className="p-3 font-semibold">Gratuito</th>
                <th className="p-3 font-semibold">Premium</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {A_DIFERENCA.map((f) => (
                <tr key={f.label}>
                  <td className="p-3">
                    {f.label}
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{f.porque}</span>
                  </td>
                  <td className="p-3 align-top text-muted">{f.free}</td>
                  <td className="p-3 align-top font-semibold text-ember">{f.premium}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="mt-7">
        <SectionTitle hint="Não está na tabela acima porque não muda de plano para plano.">
          Igual nos dois planos
        </SectionTitle>
        <Card className="p-5">
          <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
            {IGUAL_NOS_DOIS.map((t) => (
              <li key={t} className="flex gap-2">
                <Icon name="check" size={15} className="mt-0.5 shrink-0 text-sage" />{t}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <div className="mt-6">
        {!supabaseEnabled ? (
          <Banner tone="info" icon="info" title="Modo demonstração: nada é cobrado">
            Aqui o botão só troca o plano na tela. No modo online a cobrança é real, pelo Stripe.
          </Banner>
        ) : semCobranca ? (
          <Banner tone="warn" icon="info" title="A cobrança ainda não foi ligada neste projeto">
            O código está pronto; falta configurar a chave do provedor de pagamento nos segredos do
            servidor. Enquanto isso, nada é cobrado e nada muda de plano.
          </Banner>
        ) : (
          <Banner tone="info" icon="shield" title="O pagamento acontece no Stripe">
            Seus dados de cartão não passam por este aplicativo em momento nenhum. O plano só muda
            depois que o Stripe confirma o pagamento direto com o nosso servidor.
          </Banner>
        )}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        Segurança, verificação, moderação e os direitos de LGPD nunca ficam atrás do pagamento.
        Um aplicativo que cobra por proteção está cobrando pela coisa errada. E o limite de
        propostas é cobrado pelo servidor, não pela tela — a conta é a mesma para todo mundo.
      </p>
    </Page>
  );
}
