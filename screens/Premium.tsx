import { useEffect, useState } from 'react';
import { QUOTAS } from '../constants';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Icon } from '../components/ui';
import { supabaseEnabled } from '../services/supabaseClient';
import { openBillingPortal, startCheckout } from '../services/billing';
import { uid } from '../services/utils';

const FEATURES: { label: string; free: string; premium: string }[] = [
  { label: 'Interesses por dia', free: String(QUOTAS.free.dailyInterests), premium: String(QUOTAS.premium.dailyInterests) },
  { label: 'Pessoas na curadoria diária', free: String(QUOTAS.free.discoverCards), premium: String(QUOTAS.premium.discoverCards) },
  { label: 'Sugestões do Copiloto por dia', free: String(QUOTAS.free.dailyAiCalls), premium: String(QUOTAS.premium.dailyAiCalls) },
  { label: 'Ver quem demonstrou interesse', free: '—', premium: 'Sim' },
  { label: 'Filtros avançados', free: '—', premium: 'Compatibilidade mínima e interesses obrigatórios' },
  { label: 'Decomposição completa da compatibilidade', free: 'Resumida', premium: 'Todas as dimensões e pesos' },
  { label: 'Destaque na curadoria de outras pessoas', free: '—', premium: '1x por semana' },
  { label: 'Bloquear, denunciar e moderação', free: 'Sim', premium: 'Sim' },
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
    <Page title="CONEXÃO Premium" back={back} subtitle="Mais alcance e mais ferramentas — sem mudar as regras do jogo para quem é gratuito.">
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className={`p-6 ${!isPremium ? 'border-brand/40' : ''}`}>
          <h2 className="font-display text-xl font-bold">Gratuito</h2>
          <p className="mt-1 text-sm text-muted">Tudo que é preciso para conversar de verdade.</p>
          <p className="mt-4 font-display text-3xl font-bold">R$ 0</p>
          <ul className="mt-4 space-y-2 text-[13px]">
            {['Perfil completo e Cartão de Essência', `${QUOTAS.free.dailyInterests} interesses por dia`, 'Curadoria diária com Encontro do Dia', 'Conversas ilimitadas com quem já conectou', 'Rituais de conversa e Termômetro', 'Bloqueio, denúncia e verificação'].map((t) => (
              <li key={t} className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-sage" />{t}</li>
            ))}
          </ul>
          {!isPremium && <p className="mt-5 text-center text-[13px] font-semibold text-brand">Seu plano atual</p>}
        </Card>

        <Card className={`relative overflow-hidden p-6 ${isPremium ? 'border-ember/50' : ''}`}>
          <div className="absolute right-0 top-0 rounded-bl-2xl bg-gradient-to-r from-brand to-ember px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            Recomendado
          </div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Icon name="crown" size={20} className="text-ember" /> Premium
          </h2>
          <p className="mt-1 text-sm text-muted">Para quem quer alcance maior sem perder a curadoria.</p>
          <p className="mt-4 font-display text-3xl font-bold">R$ 29,90<span className="text-base font-medium text-muted">/mês</span></p>
          <ul className="mt-4 space-y-2 text-[13px]">
            {[`${QUOTAS.premium.dailyInterests} interesses por dia`, `${QUOTAS.premium.discoverCards} pessoas na curadoria`, 'Ver quem demonstrou interesse em você', 'Filtros avançados de compatibilidade', 'Copiloto de conversa sem limite prático', 'Destaque semanal na curadoria'].map((t) => (
              <li key={t} className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-ember" />{t}</li>
            ))}
          </ul>
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

      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-bg text-left">
            <tr>
              <th className="p-3 font-semibold">Recurso</th>
              <th className="p-3 font-semibold">Gratuito</th>
              <th className="p-3 font-semibold">Premium</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {FEATURES.map((f) => (
              <tr key={f.label}>
                <td className="p-3">{f.label}</td>
                <td className="p-3 text-muted">{f.free}</td>
                <td className="p-3 font-medium text-ember">{f.premium}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        Segurança, verificação, moderação e os direitos de LGPD nunca ficam atrás do paywall.
        Um app de relacionamento que cobra por proteção está cobrando pela coisa errada.
      </p>
    </Page>
  );
}
