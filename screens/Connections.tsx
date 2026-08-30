import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { connectionsOf, findUser, healthOf, messagesOf, otherId } from '../state/appState';
import { Page } from '../components/layout/AppShell';
import { Button, Card, Chip, Empty, Icon, Tabs } from '../components/ui';
import { CompatBadge } from '../components/EssenceCard';
import { ConversationThermometer } from '../components/ConversationThermometer';
import { Avatar } from '../components/Portrait';
import { age, firstName, timeAgo } from '../services/utils';

type Tab = 'novas' | 'conversando' | 'favoritos' | 'solicitacoes' | 'encerradas';

export function Connections() {
  const { me, state, navigate, expressInterest, passOn, toggleFavorite, toast } = useApp();
  const [tab, setTab] = useState<Tab>('novas');

  const groups = useMemo(() => {
    if (!me) return null;
    const rows = connectionsOf(state, me.id)
      .filter((c) => c.status !== 'recusada' && c.status !== 'sugerida')
      .map((c) => {
        const user = findUser(state, otherId(c, me.id));
        const msgs = messagesOf(state, c.id);
        return { c, user, msgs, health: healthOf(state, c, msgs) };
      })
      .filter((r) => !!r.user);

    return {
      novas: rows.filter((r) => r.c.status === 'conectada' && r.msgs.length === 0),
      conversando: rows.filter((r) => r.c.status === 'conectada' && r.msgs.length > 0),
      favoritos: rows.filter((r) => r.c.favorite[me.id] && r.c.status !== 'bloqueada'),
      solicitacoes: rows.filter((r) => r.c.status === 'pendente' && !r.c.likes[me.id]),
      enviadas: rows.filter((r) => r.c.status === 'pendente' && r.c.likes[me.id]),
      encerradas: rows.filter((r) => r.c.status === 'encerrada' || r.c.status === 'bloqueada'),
    };
  }, [me, state]);

  if (!me || !groups) return null;

  const list = tab === 'solicitacoes' ? groups.solicitacoes : groups[tab];

  return (
    <Page title="Minhas conexões" subtitle="Interesse dos dois lados vira conexão. Conexão sem conversa não vira nada.">
      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { id: 'novas', label: 'Novas', count: groups.novas.length },
          { id: 'conversando', label: 'Conversando', count: groups.conversando.length },
          { id: 'solicitacoes', label: 'Solicitações', count: groups.solicitacoes.length },
          { id: 'favoritos', label: 'Favoritos', count: groups.favoritos.length },
          { id: 'encerradas', label: 'Encerradas', count: groups.encerradas.length },
        ]}
      />

      {tab === 'solicitacoes' && groups.enviadas.length > 0 && (
        <p className="mt-4 rounded-2xl bg-bg px-4 py-3 text-[13px] text-muted">
          Você também tem <strong className="text-ink">{groups.enviadas.length}</strong> interesse(s) enviado(s)
          aguardando resposta.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {list.length === 0 && (
          <Empty
            icon={tab === 'solicitacoes' ? 'heart' : 'sparkle'}
            title={
              tab === 'novas' ? 'Nenhuma conexão nova'
                : tab === 'conversando' ? 'Nenhuma conversa em andamento'
                : tab === 'solicitacoes' ? 'Nenhuma solicitação no momento'
                : tab === 'favoritos' ? 'Você ainda não favoritou ninguém'
                : 'Nada encerrado por aqui'
            }
            body={
              tab === 'solicitacoes'
                ? 'Quando alguém demonstrar interesse em você, aparece aqui para você decidir.'
                : 'Comece pela aba Descobrir: a curadoria de hoje já está pronta.'
            }
            action={<Button size="sm" variant="outline" onClick={() => navigate({ name: 'discover' })}>Ir para Descobrir</Button>}
          />
        )}

        {list.map(({ c, user, msgs, health }) => {
          if (!user) return null;
          const isRequest = tab === 'solicitacoes';
          const closed = c.status === 'encerrada' || c.status === 'bloqueada';
          return (
            <Card key={c.id} className="p-4">
              <div className="flex items-start gap-3.5">
                <button type="button" onClick={() => navigate({ name: 'person', id: user.id })}>
                  <Avatar seed={user.id} photo={user.photo} name={user.name} reveal={c.status === 'conectada' ? health.reveal : 0.14} size={56} />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-semibold">
                        {firstName(user.name)}, {age(user.birthDate)}
                        {user.verified && <Icon name="check" size={12} className="ml-1.5 inline text-sage" />}
                      </p>
                      <p className="truncate text-[12px] text-muted">
                        {user.city} · {closed ? 'encerrada' : `conectados ${timeAgo(c.connectedAt ?? c.createdAt)} atrás`}
                      </p>
                    </div>
                    <CompatBadge score={c.compatibility} size="sm" />
                  </div>

                  {c.status === 'conectada' && msgs.length > 0 && (
                    <div className="mt-2"><ConversationThermometer health={health} compact /></div>
                  )}

                  {closed && c.closedGently && (
                    <Chip size="sm" tone="sage">Encerrada com despedida</Chip>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isRequest ? (
                      <>
                        <Button
                          size="sm" icon="heart"
                          onClick={() => {
                            const r = expressInterest(user.id);
                            if (!r.ok) return toast(r.reason ?? 'Não foi possível.', 'warn');
                            toast('Conexão criada. Comece a conversa.', 'ok');
                          }}
                        >
                          Também tenho interesse
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => passOn(user.id)}>Passar</Button>
                      </>
                    ) : c.status === 'conectada' ? (
                      <>
                        <Button size="sm" icon="chat" onClick={() => navigate({ name: 'chat', id: c.id })}>
                          {msgs.length ? 'Continuar conversa' : 'Começar conversa'}
                        </Button>
                        <Button
                          size="sm" variant="ghost" icon="star"
                          onClick={() => toggleFavorite(c.id)}
                        >
                          {c.favorite[me.id] ? 'Favorito' : 'Favoritar'}
                        </Button>
                      </>
                    ) : c.status === 'pendente' ? (
                      <Chip size="sm">Aguardando resposta</Chip>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => navigate({ name: 'person', id: user.id })}>Ver perfil</Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}
