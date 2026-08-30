import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { connectionWith, findUser, messagesOf } from '../state/appState';
import { computeCompatibility } from '../services/compatibility';
import { conversationHealth } from '../services/conversation';
import { explainMatch, suggestOpeners } from '../services/geminiService';
import { AXES, GOAL_EMOJI, GOAL_LABEL, LIFESTYLE_FIELDS, PACE_LABEL } from '../constants';
import { INTEREST_MAP } from '../data/interests';
import { PROFILE_PROMPT_MAP } from '../data/prompts';
import { Page } from '../components/layout/AppShell';
import { Bar, Banner, Button, Card, Chip, Icon, SectionTitle } from '../components/ui';
import { Portrait } from '../components/Portrait';
import { CompatibilityPanel } from '../components/CompatibilityPanel';
import { CopilotPanel } from '../components/Copilot';
import { ReportDialog } from '../components/ReportDialog';
import { age, distanceBand, firstName, timeAgo } from '../services/utils';

export function PersonProfile({ id }: { id: string }) {
  const { me, state, back, navigate, expressInterest, blockUser, toast, canUseAi, spendAi } = useApp();
  const other = findUser(state, id);
  const [explanation, setExplanation] = useState('');
  const [openers, setOpeners] = useState<string[]>([]);
  const [loadingOpeners, setLoadingOpeners] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (!me || !other) return;
    let alive = true;
    explainMatch(me, other).then((t) => alive && setExplanation(t));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, other?.id]);

  if (!me || !other) {
    return (
      <Page title="Perfil indisponível" back={back}>
        <Banner tone="warn" icon="info">Este perfil não existe mais ou foi removido.</Banner>
      </Page>
    );
  }

  const result = computeCompatibility(me, other);
  const conn = connectionWith(state, me.id, other.id);
  const health = conn ? conversationHealth(conn, messagesOf(state, conn.id)) : null;
  const reveal = conn?.status === 'conectada' && health ? health.reveal : 0.14;
  const connected = conn?.status === 'conectada';
  const iLiked = !!conn?.likes[me.id];

  const genOpeners = async () => {
    if (!canUseAi) return;
    setLoadingOpeners(true);
    spendAi();
    setOpeners(await suggestOpeners(me, other));
    setLoadingOpeners(false);
  };

  return (
    <Page back={back} maxWidth="max-w-3xl">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <Portrait
            seed={other.id} photo={other.photo} name={other.name} reveal={reveal}
            className="aspect-square w-full sm:h-44 sm:w-44" showLock stageLabel={health?.stageLabel ?? 'Velado'}
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold leading-tight">
              {firstName(other.name)}, {age(other.birthDate)}
              {other.verified && <Icon name="check" size={16} className="ml-2 inline text-sage" />}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {other.profession && `${other.profession} · `}{other.city}, {other.state} · {distanceBand(result.distanceKm)}
            </p>
            <p className="mt-0.5 text-xs text-muted">Ativo(a) {timeAgo(other.lastActiveAt)} atrás</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip size="sm" tone="brand">{GOAL_EMOJI[other.goal]} {GOAL_LABEL[other.goal]}</Chip>
              <Chip size="sm">{PACE_LABEL[other.chatPace]}</Chip>
              <Chip size="sm" tone={other.reputation >= 80 ? 'sage' : 'neutral'}>
                Reputação de conversa {other.reputation}
              </Chip>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {connected ? (
                <Button icon="chat" onClick={() => navigate({ name: 'chat', id: conn!.id })}>Abrir conversa</Button>
              ) : (
                <Button
                  icon="heart" disabled={iLiked}
                  onClick={() => {
                    const r = expressInterest(other.id);
                    if (!r.ok) return toast(r.reason ?? 'Não foi possível.', 'warn');
                    toast(r.connected ? 'Conexão! ❤️' : 'Interesse enviado.', r.connected ? 'ok' : 'info');
                  }}
                >
                  {iLiked ? 'Interesse enviado' : 'Tenho interesse'}
                </Button>
              )}
              <Button variant="outline" icon="flag" onClick={() => setReporting(true)}>Denunciar</Button>
              <Button variant="ghost" icon="block" onClick={() => { blockUser(other.id); back(); }}>Bloquear</Button>
            </div>
          </div>
        </div>

        {!connected && (
          <div className="border-t border-line bg-bg px-5 py-3 text-[12px] leading-relaxed text-muted sm:px-6">
            <Icon name="lock" size={13} className="mr-1.5 inline text-brand" />
            A foto de {firstName(other.name)} está velada. Ela se revela conforme a conversa de vocês evolui —
            ou antes, se os dois concordarem.
          </div>
        )}
      </Card>

      {other.bio && (
        <Card className="mt-5 p-5">
          <p className="font-display text-[15px] leading-relaxed">{other.bio}</p>
        </Card>
      )}

      {other.answers.length > 0 && (
        <section className="mt-6">
          <SectionTitle hint="Nas palavras dela(e)">Respostas</SectionTitle>
          <div className="space-y-3">
            {other.answers.filter((a) => a.answer.trim()).map((a) => (
              <Card key={a.promptId} className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                  {PROFILE_PROMPT_MAP[a.promptId]?.label ?? a.promptId}
                </p>
                <p className="mt-1.5 font-display text-[15px] leading-relaxed">“{a.answer}”</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <SectionTitle hint="Como calculamos — e o que pesa em cada parte">Compatibilidade</SectionTitle>
        {explanation && (
          <div className="mb-3">
            <Banner tone="info" icon="sparkle" title="Leitura do Copiloto">{explanation}</Banner>
          </div>
        )}
        <CompatibilityPanel result={result} name={firstName(other.name)} />
      </section>

      {!connected && (
        <section className="mt-6">
          <SectionTitle hint="Você edita e envia. O Copiloto nunca envia por você.">Como começar</SectionTitle>
          <CopilotPanel
            title={`Primeiras mensagens para ${firstName(other.name)}`}
            description="Baseadas no que ela(e) escreveu no perfil, não em elogio genérico."
            suggestions={openers} loading={loadingOpeners} onGenerate={genOpeners}
            generateLabel="Sugerir aberturas"
            onUse={(t) => { navigator.clipboard?.writeText(t); toast('Copiado. Envie quando vocês se conectarem.', 'ok'); }}
          />
        </section>
      )}

      <section className="mt-6">
        <SectionTitle>Interesses e estilo de vida</SectionTitle>
        <Card className="p-5">
          <div className="flex flex-wrap gap-1.5">
            {other.interests.map((i) => (
              <Chip key={i} size="sm" tone={result.sharedInterests.includes(i) ? 'sage' : 'neutral'}>
                {INTEREST_MAP[i]?.emoji} {INTEREST_MAP[i]?.label ?? i}
              </Chip>
            ))}
          </div>

          <div className="mt-5 grid gap-x-6 gap-y-2 border-t border-line pt-4 sm:grid-cols-2">
            {LIFESTYLE_FIELDS.map((f) => (
              <div key={f.key} className="flex justify-between gap-3 text-[13px]">
                <span className="text-muted">{f.label}</span>
                <span className="font-medium">
                  {f.options.find((o) => o.value === other.lifestyle[f.key])?.label ?? '—'}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2.5 border-t border-line pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Bússola de conexão</p>
            {AXES.map((ax) => (
              <div key={ax.key}>
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{ax.left}</span><span className="font-semibold text-ink">{ax.label}</span><span>{ax.right}</span>
                </div>
                <div className="relative mt-1">
                  <Bar value={other.personality[ax.key]} />
                  <span
                    className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-ember"
                    style={{ left: `${me.personality[ax.key]}%` }}
                    title={`Você: ${me.personality[ax.key]}`}
                  />
                </div>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-muted">
              <span className="mr-1 inline-block h-2 w-1 rounded bg-ember align-middle" /> marca a sua posição em cada eixo.
            </p>
          </div>
        </Card>
      </section>

      <ReportDialog open={reporting} onClose={() => setReporting(false)} target={other} />
    </Page>
  );
}
