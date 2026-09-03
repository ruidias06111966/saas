import { useApp } from '../state/AppContext';
import { profileCompletion } from '../services/compatibility';
import { connectionsOf, messagesOf } from '../state/appState';
import { AXES, GOAL_EMOJI, GOAL_LABEL, LIFESTYLE_FIELDS, PACE_LABEL } from '../constants';
import { INTEREST_MAP } from '../data/interests';
import { PROFILE_PROMPT_MAP } from '../data/prompts';
import { Page } from '../components/layout/AppShell';
import { VerificacaoCard } from '../components/Verificacao';
import { Bar, Banner, Button, Card, Chip, Icon, Ring, SectionTitle } from '../components/ui';
import { Portrait } from '../components/Portrait';
import { EssenceCard } from '../components/EssenceCard';
import { firstName } from '../services/utils';

export function Profile() {
  const { me, state, navigate, logout } = useApp();
  if (!me) return null;

  const completion = profileCompletion(me);
  const conns = connectionsOf(state, me.id);
  const active = conns.filter((c) => c.status === 'conectada');
  const talking = active.filter((c) => messagesOf(state, c.id).length > 0);

  return (
    <Page
      title="Seu perfil"
      subtitle="É assim que você aparece — mas lembre: para quem ainda não conversou com você, a foto entra velada."
      action={<Button size="sm" icon="edit" onClick={() => navigate({ name: 'profileEdit' })}>Editar</Button>}
    >
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Portrait seed={me.id} photo={me.photo} name={me.name} reveal={1} className="h-32 w-32 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-bold">
              {me.name}, {me.age}
              {me.verified && <Icon name="check" size={16} className="ml-2 inline text-sage" />}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {me.profession && `${me.profession} · `}{me.city}, {me.state}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip size="sm" tone="brand">{GOAL_EMOJI[me.goal]} {GOAL_LABEL[me.goal]}</Chip>
              <Chip size="sm">{PACE_LABEL[me.chatPace]}</Chip>
              <Chip size="sm" tone={me.plan === 'premium' ? 'ember' : 'neutral'}>
                {me.plan === 'premium' ? '👑 Premium' : 'Plano gratuito'}
              </Chip>
            </div>
          </div>
          <div className="flex shrink-0 gap-6 sm:flex-col sm:items-center">
            <Ring value={completion} size={84} sublabel="completo" />
          </div>
        </div>

        {completion < 85 && (
          <div className="mt-5">
            <Banner
              tone="info" icon="sparkle" title="Complete seu perfil"
              action={<Button size="sm" variant="secondary" onClick={() => navigate({ name: 'profileEdit' })}>Completar</Button>}
            >
              Perfis completos aparecem em mais curadorias e recebem uma leitura de compatibilidade
              com confiança maior.
            </Banner>
          </div>
        )}
      </Card>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: 'conexões', value: active.length },
          { label: 'conversas ativas', value: talking.length },
          { label: 'reputação de conversa', value: me.reputation },
        ].map((s) => (
          <Card key={s.label} className="p-4 text-center">
            <p className="font-display text-2xl font-bold">{s.value}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      <section className="mt-7">
        <SectionTitle hint="Assim ela aparece na curadoria de outras pessoas">Prévia do seu Cartão de Essência</SectionTitle>
        <EssenceCard
          user={me} score={100} shared={me.interests.slice(0, 3)} distanceKm={3}
          headline="As pessoas veem suas palavras antes da sua foto." compact
        />
      </section>

      {me.bio && (
        <Card className="mt-6 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Bio</p>
          <p className="mt-1.5 font-display text-[15px] leading-relaxed">{me.bio}</p>
        </Card>
      )}

      <section className="mt-6">
        <SectionTitle>Suas respostas</SectionTitle>
        <div className="space-y-3">
          {me.answers.filter((a) => a.answer.trim()).map((a) => (
            <Card key={a.promptId} className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                {PROFILE_PROMPT_MAP[a.promptId]?.label ?? a.promptId}
              </p>
              <p className="mt-1.5 font-display text-[15px] leading-relaxed">“{a.answer}”</p>
            </Card>
          ))}
          {me.answers.filter((a) => a.answer.trim()).length === 0 && (
            <Card className="p-5 text-center text-sm text-muted">
              Você ainda não respondeu nenhuma pergunta.{' '}
              <button type="button" className="font-semibold text-brand hover:underline" onClick={() => navigate({ name: 'profileEdit' })}>
                Responder agora
              </button>
            </Card>
          )}
        </div>
      </section>

      <section className="mt-6">
        <SectionTitle>Interesses</SectionTitle>
        <Card className="p-5">
          <div className="flex flex-wrap gap-1.5">
            {me.interests.map((i) => (
              <Chip key={i} size="sm">{INTEREST_MAP[i]?.emoji} {INTEREST_MAP[i]?.label ?? i}</Chip>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <SectionTitle>Bússola e estilo de vida</SectionTitle>
        <Card className="p-5">
          <div className="space-y-3">
            {AXES.map((ax) => (
              <div key={ax.key}>
                <div className="flex justify-between text-[11px] text-muted">
                  <span>{ax.left}</span><span className="font-semibold text-ink">{ax.label}</span><span>{ax.right}</span>
                </div>
                <Bar value={me.personality[ax.key]} className="mt-1" />
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-x-6 gap-y-2 border-t border-line pt-4 sm:grid-cols-2">
            {LIFESTYLE_FIELDS.map((f) => (
              <div key={f.key} className="flex justify-between gap-3 text-[13px]">
                <span className="text-muted">{f.label}</span>
                <span className="font-medium">{f.options.find((o) => o.value === me.lifestyle[f.key])?.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <VerificacaoCard />
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="outline" icon="settings" onClick={() => navigate({ name: 'settings' })}>Configurações e privacidade</Button>
        {me.plan === 'free' && <Button variant="secondary" icon="crown" onClick={() => navigate({ name: 'premium' })}>Ver Premium</Button>}
        <Button variant="ghost" icon="logout" onClick={() => void logout()}>Sair da conta</Button>
      </div>
      <p className="mt-4 text-xs text-muted">Olá, {firstName(me.name)} — conta criada em {new Date(me.createdAt).toLocaleDateString('pt-BR')}.</p>
    </Page>
  );
}
