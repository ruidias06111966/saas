import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { connectionsOf, healthOf, messagesOf } from '../state/appState';
import { profileCompletion, oQueFalta } from '../services/perfil';
import { suggestProfileImprovements } from '../services/geminiService';
import { SAFETY_TIPS } from '../services/moderation';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Empty, Icon, Ring, SectionTitle } from '../components/ui';
import { AvisoDeCortesia } from '../components/AvisoDeCortesia';
import { CopilotPanel } from '../components/Copilot';
import { firstName, timeAgo } from '../services/utils';
import {
  type Anuncio, type Proposta,
  buscarAnuncios, faixaDeOrcamento, meusAnuncios, minhasPropostas, ondeFica,
} from '../services/mercado';

// ---------------------------------------------------------------------------
// Início.
//
// Era o resumo do dia de um app de relacionamentos: a curadoria de hoje, o
// Encontro do Dia, quantas conexões, quantas conversas. Agora é o painel de
// quem trabalha — o que está esperando resposta de você, o que você mandou e
// ainda não voltou, e o que apareceu de novo no quadro.
//
// A ordem das seções é a ordem do que custa dinheiro deixar parado: propostas
// esperando a SUA decisão primeiro, porque quem publicou e não responde perde o
// profissional; depois as suas propostas pendentes; só então o quadro.
// ---------------------------------------------------------------------------

function Stat({ icon, value, label, onClick }: {
  icon: 'search' | 'chat' | 'send' | 'edit'; value: React.ReactNode; label: string; onClick?: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={!onClick}
      className="flex-1 rounded-xl3 border border-line bg-surface p-4 text-left transition-colors enabled:hover:border-brand/40"
    >
      <Icon name={icon} size={18} className="text-brand" />
      <p className="mt-2 font-display text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted">{label}</p>
    </button>
  );
}

export function Home() {
  const { me, state, navigate, toast, canUseAi, spendAi } = useApp();
  const [tips, setTips] = useState<string[]>([]);
  const [loadingTips, setLoadingTips] = useState(false);

  const [meus, setMeus] = useState<Anuncio[]>([]);
  const [minhas, setMinhas] = useState<Proposta[]>([]);
  const [recentes, setRecentes] = useState<Anuncio[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!me) return;
    let vivo = true;
    setCarregando(true);
    Promise.all([meusAnuncios(me.id), minhasPropostas(me.id), buscarAnuncios({})])
      .then(([a, p, q]) => {
        if (!vivo) return;
        setMeus(a);
        setMinhas(p);
        setRecentes(q.anuncios.filter((x) => x.autorId !== me.id).slice(0, 3));
      })
      .catch((e) => { if (vivo) toast((e as Error).message, 'danger'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [me, toast]);

  const data = useMemo(() => {
    if (!me) return null;
    const conns = connectionsOf(state, me.id);
    const active = conns.filter((c) => c.status === 'conectada');
    const staleOnes = active
      .map((c) => ({ c, h: healthOf(state, c, messagesOf(state, c.id)) }))
      .filter((x) => x.h.stale && x.h.messages > 0);
    const pending = conns.filter((c) => c.status === 'pendente' && !c.likes[me.id]);
    const talking = active.filter((c) => messagesOf(state, c.id).length > 0);
    return { active, staleOnes, pending, talking, completion: profileCompletion(me) };
  }, [me, state]);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    setLoadingTips(true);
    suggestProfileImprovements(me).then((t) => { if (alive) { setTips(t); setLoadingTips(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  if (!me || !data) return null;

  // Propostas esperando a decisão de quem publicou. É o número que mais custa
  // caro quando fica parado: do outro lado há alguém que já trabalhou para
  // escrever, e que some se não for respondido.
  const aguardandoMim = meus.reduce((s, a) => s + (a.propostas ?? 0), 0);
  const minhasPendentes = minhas.filter((p) => p.status === 'enviada').length;
  const minhasAceitas = minhas.filter((p) => p.status === 'aceita');
  const faltaNoPerfil = oQueFalta(me);

  return (
    <Page
      title={`Olá, ${firstName(me.name)}`}
      subtitle="O que está esperando por você hoje."
      maxWidth="max-w-4xl"
    >
      <div className="mb-6 flex gap-3">
        <Stat
          icon="edit" value={carregando ? '—' : aguardandoMim}
          label="propostas esperando sua resposta"
          onClick={() => navigate({ name: 'meusAnuncios' })}
        />
        <Stat
          icon="send" value={carregando ? '—' : minhasPendentes}
          label="propostas suas sem resposta"
          onClick={() => navigate({ name: 'minhasPropostas' })}
        />
        <Stat
          icon="chat" value={data.talking.length}
          label="conversas ativas"
          onClick={() => navigate({ name: 'chats' })}
        />
      </div>

      {minhasAceitas.length > 0 && (
        <div className="mb-5">
          <Banner
            tone="ok" icon="handshake" title={`Você foi escolhido em ${minhasAceitas.length} trabalho(s)`}
            action={<Button size="sm" onClick={() => navigate({ name: 'minhasPropostas' })}>Ver</Button>}
          >
            Combine os próximos passos com quem publicou. O telefone dos dois lados já foi liberado.
          </Banner>
        </div>
      )}

      {faltaNoPerfil.length > 0 && (
        <div className="mb-5">
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <Ring value={data.completion} size={72} sublabel="perfil" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold">Seu perfil ainda não está pronto</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                Falta {faltaNoPerfil.slice(0, 2).join(' e ')}. Quem contrata lê o perfil antes de
                responder a proposta — e descarta o que está pela metade.
              </p>
            </div>
            <Button size="sm" icon="edit" onClick={() => navigate({ name: 'profileEdit' })}>Completar</Button>
          </Card>
        </div>
      )}

      {data.pending.length > 0 && (
        <div className="mb-5">
          <Banner
            tone="info" icon="chat" title={`${data.pending.length} pessoa(s) querem falar com você`}
            action={<Button size="sm" onClick={() => navigate({ name: 'connections' })}>Ver</Button>}
          >
            Um pedido sem resposta é um negócio que não aconteceu.
          </Banner>
        </div>
      )}

      {data.staleOnes.length > 0 && (
        <div className="mb-5">
          <AvisoDeCortesia />
        </div>
      )}

      <section className="mb-6">
        <SectionTitle
          hint="O que apareceu de mais recente no quadro."
          action={<Button size="sm" variant="ghost" onClick={() => navigate({ name: 'anuncios' })}>Ver tudo</Button>}
        >
          Trabalho disponível
        </SectionTitle>

        {carregando ? (
          <div className="space-y-3">
            {[0, 1].map((i) => <Card key={i} className="h-24 animate-pulseSoft"><span /></Card>)}
          </div>
        ) : recentes.length === 0 ? (
          <Empty
            icon="search"
            title="O quadro ainda está vazio"
            body="Ninguém publicou nada por enquanto. Você pode ser o primeiro — e quem publica num quadro calmo costuma receber as melhores respostas."
            action={<Button size="sm" icon="plus" onClick={() => navigate({ name: 'publicar' })}>Publicar um anúncio</Button>}
          />
        ) : (
          <div className="space-y-3">
            {recentes.map((a) => (
              <Card key={a.id} className="transition-shadow hover:shadow-lift">
                <button
                  type="button" className="w-full p-4 text-left"
                  onClick={() => navigate({ name: 'anuncio', id: a.id })}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-[15px] font-semibold leading-snug">{a.titulo}</p>
                    <span className="shrink-0 text-[11px] text-muted">{timeAgo(a.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 text-[12px] text-muted">
                    {a.categoriaNome && `${a.categoriaNome} · `}{ondeFica(a)} · {faixaDeOrcamento(a)}
                  </p>
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        {/* No celular esta é a porta para a lista de profissionais: ela não
            cabe na barra de baixo, que já carrega seis itens. */}
        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold">Precisa de alguém agora?</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Em vez de esperar propostas, procure direto quem faz o que você precisa — por área,
              cidade ou palavra.
            </p>
          </div>
          <Button size="sm" icon="users" variant="outline" onClick={() => navigate({ name: 'profissionais' })}>
            Ver profissionais
          </Button>
        </Card>
      </section>

      <section className="mb-6">
        <CopilotPanel
          title="Como melhorar o seu perfil"
          description="Sugestões do Copiloto, olhando o que já está preenchido."
          suggestions={tips}
          loading={loadingTips}
          onGenerate={() => {
            if (!canUseAi) return;
            spendAi();
            setLoadingTips(true);
            void suggestProfileImprovements(me).then((t) => { setTips(t); setLoadingTips(false); });
          }}
          compact
        />
      </section>

      <section>
        <SectionTitle hint="Vale para qualquer negociação, aqui ou fora daqui.">Segurança</SectionTitle>
        <Card className="p-5">
          <ul className="space-y-2 text-[13px] leading-relaxed text-muted">
            {SAFETY_TIPS.slice(0, 4).map((t) => (
              <li key={t} className="flex gap-2">
                <Icon name="shield" size={15} className="mt-0.5 shrink-0 text-brand" />{t}
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </Page>
  );
}
