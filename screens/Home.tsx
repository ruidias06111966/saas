import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { blockedIdsFor, connectionsOf, findUser, messagesOf, otherId } from '../state/appState';
import { buildCandidates, dailyCuration } from '../services/curation';
import { profileCompletion } from '../services/compatibility';
import { conversationHealth } from '../services/conversation';
import { suggestProfileImprovements } from '../services/geminiService';
import { SAFETY_TIPS } from '../services/moderation';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Empty, Icon, Ring, SectionTitle } from '../components/ui';
import { EssenceCard } from '../components/EssenceCard';
import { CopilotPanel } from '../components/Copilot';
import { Avatar } from '../components/Portrait';
import { dateKey, firstName, timeAgo } from '../services/utils';

function Stat({ icon, value, label, onClick }: {
  icon: 'sparkle' | 'chat' | 'heart' | 'thermometer'; value: React.ReactNode; label: string; onClick?: () => void;
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
  const { me, state, navigate, quota, expressInterest, passOn, toast, canUseAi, spendAi } = useApp();
  const [tips, setTips] = useState<string[]>([]);
  const [loadingTips, setLoadingTips] = useState(false);

  const data = useMemo(() => {
    if (!me) return null;
    const conns = connectionsOf(state, me.id);
    const seen = new Set(conns.map((c) => otherId(c, me.id)));
    const blocked = blockedIdsFor(state, me.id);
    const candidates = buildCandidates(me, state.users, blocked, seen);
    const usage = state.usage.find((u) => u.userId === me.id && u.date === dateKey());
    const curation = dailyCuration(me, candidates, quota.discoverCards, quota.dailyInterests - (usage?.interests ?? 0));

    const active = conns.filter((c) => c.status === 'conectada');
    const staleOnes = active
      .map((c) => ({ c, h: conversationHealth(c, messagesOf(state, c.id)) }))
      .filter((x) => x.h.stale && x.h.messages > 0);
    const pending = conns.filter((c) => c.status === 'pendente' && !c.likes[me.id]);
    const talking = active.filter((c) => messagesOf(state, c.id).length > 0);

    return { curation, active, staleOnes, pending, talking, completion: profileCompletion(me) };
  }, [me, state, quota]);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    setLoadingTips(true);
    suggestProfileImprovements(me).then((t) => { if (alive) { setTips(t); setLoadingTips(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  if (!me || !data) return null;
  const tip = SAFETY_TIPS[new Date().getDate() % SAFETY_TIPS.length];

  const regenerateTips = async () => {
    if (!canUseAi) return;
    setLoadingTips(true);
    spendAi();
    setTips(await suggestProfileImprovements(me));
    setLoadingTips(false);
  };

  return (
    <Page maxWidth="max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Olá, {firstName(me.name)} 👋
          </h1>
          <p className="mt-1 text-sm text-muted">
            {data.curation.quotaLeft > 0
              ? `Você tem ${data.curation.quotaLeft} interesse(s) para usar hoje.`
              : 'Seus interesses de hoje acabaram. Amanhã tem mais.'}
          </p>
        </div>
        <button type="button" onClick={() => navigate({ name: 'profile' })} className="shrink-0">
          <Ring value={data.completion} size={72} sublabel="perfil" />
        </button>
      </header>

      <div className="mb-6 flex gap-3">
        <Stat icon="sparkle" value={data.curation.others.length + (data.curation.highlight ? 1 : 0)} label="pessoas na sua curadoria de hoje" onClick={() => navigate({ name: 'discover' })} />
        <Stat icon="chat" value={data.talking.length} label="conversas ativas" onClick={() => navigate({ name: 'chats' })} />
        <Stat icon="heart" value={data.active.length} label="conexões" onClick={() => navigate({ name: 'connections' })} />
      </div>

      {data.pending.length > 0 && (
        <div className="mb-6">
          <Banner
            tone="ok" icon="heart" title={`${data.pending.length} pessoa(s) demonstraram interesse em você`}
            action={<Button size="sm" onClick={() => navigate({ name: 'connections' })}>Ver</Button>}
          >
            Responder rápido aumenta muito a chance da conversa acontecer.
          </Banner>
        </div>
      )}

      {data.staleOnes.length > 0 && (
        <div className="mb-6">
          <Banner tone="warn" icon="clock" title="Conversas paradas">
            <p>
              {data.staleOnes.map(({ c }) => firstName(findUser(state, otherId(c, me.id))?.name ?? '')).join(', ')} está
              esperando há mais de cinco dias. Responder ou se despedir com gentileza vale mais que sumir —
              e conta na sua reputação de conversa.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.staleOnes.map(({ c }) => (
                <Button key={c.id} size="sm" variant="outline" onClick={() => navigate({ name: 'chat', id: c.id })}>
                  Abrir conversa com {firstName(findUser(state, otherId(c, me.id))?.name ?? '')}
                </Button>
              ))}
            </div>
          </Banner>
        </div>
      )}

      <section className="mb-8">
        <SectionTitle hint="Uma pessoa em destaque por dia. Some em 24 horas.">Encontro do dia</SectionTitle>
        {data.curation.highlight ? (
          <EssenceCard
            highlight
            user={data.curation.highlight.user}
            score={data.curation.highlight.score}
            shared={data.curation.highlight.shared}
            headline={data.curation.highlight.headline}
            distanceKm={data.curation.highlight.distanceKm}
            onOpen={() => navigate({ name: 'person', id: data.curation.highlight!.user.id })}
            onPass={() => { passOn(data.curation.highlight!.user.id); toast('Ok, não mostramos mais essa pessoa.', 'info'); }}
            onInterest={() => {
              const r = expressInterest(data.curation.highlight!.user.id);
              if (!r.ok) return toast(r.reason ?? 'Não foi possível.', 'warn');
              toast(r.connected ? 'Conexão! Vocês dois demonstraram interesse.' : 'Interesse enviado.', r.connected ? 'ok' : 'info');
            }}
          />
        ) : (
          <Empty
            icon="compass" title="Nenhuma pessoa nova hoje"
            body="Você já viu todo mundo que combina com seus filtros. Tente ampliar a distância ou a faixa de idade nas configurações."
            action={<Button size="sm" variant="outline" onClick={() => navigate({ name: 'settings' })}>Ajustar preferências</Button>}
          />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle hint="Sugestões do Copiloto para o seu perfil">Melhore seu perfil</SectionTitle>
          <CopilotPanel
            title="O que mudar primeiro"
            description="Sugestões focadas em atrair conversas melhores, não mais curtidas."
            suggestions={tips} loading={loadingTips} onGenerate={regenerateTips}
            generateLabel="Analisar meu perfil"
          />
        </div>

        <div>
          <SectionTitle hint="Últimas mensagens">Suas conversas</SectionTitle>
          {data.talking.length ? (
            <Card className="divide-y divide-line">
              {data.talking.slice(0, 4).map((c) => {
                const other = findUser(state, otherId(c, me.id));
                const msgs = messagesOf(state, c.id);
                const last = msgs[msgs.length - 1];
                const health = conversationHealth(c, msgs);
                if (!other) return null;
                return (
                  <button
                    key={c.id} type="button" onClick={() => navigate({ name: 'chat', id: c.id })}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-bg"
                  >
                    <Avatar seed={other.id} photo={other.photo} name={other.name} reveal={health.reveal} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{firstName(other.name)}</p>
                        <span className="shrink-0 text-[11px] text-muted">{last ? timeAgo(last.createdAt) : ''}</span>
                      </div>
                      <p className="truncate text-[13px] text-muted">{last?.text ?? 'Diga oi.'}</p>
                    </div>
                  </button>
                );
              })}
            </Card>
          ) : (
            <Empty icon="chat" title="Nenhuma conversa ainda" body="Assim que houver interesse dos dois lados, a conversa aparece aqui." />
          )}

          <div className="mt-4">
            <Banner tone="info" icon="shield" title="Dica de segurança">{tip}</Banner>
          </div>
        </div>
      </div>
    </Page>
  );
}
