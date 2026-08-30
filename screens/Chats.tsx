import { useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { connectionsOf, findUser, messagesOf, otherId, unreadMessagesFor } from '../state/appState';
import { conversationHealth } from '../services/conversation';
import { Page } from '../components/layout/AppShell';
import { Button, Card, Empty, Icon } from '../components/ui';
import { Avatar } from '../components/Portrait';
import { cx, firstName, timeAgo } from '../services/utils';

export function Chats() {
  const { me, state, navigate } = useApp();

  const rows = useMemo(() => {
    if (!me) return [];
    return connectionsOf(state, me.id)
      .filter((c) => c.status === 'conectada' || c.status === 'encerrada')
      .map((c) => {
        const user = findUser(state, otherId(c, me.id));
        const msgs = messagesOf(state, c.id);
        return {
          c, user, last: msgs[msgs.length - 1],
          unread: unreadMessagesFor(state, me.id, c.id),
          health: conversationHealth(c, msgs),
        };
      })
      .filter((r) => !!r.user)
      .sort((a, b) => (b.last?.createdAt ?? b.c.createdAt).localeCompare(a.last?.createdAt ?? a.c.createdAt));
  }, [me, state]);

  if (!me) return null;

  return (
    <Page title="Conversas" subtitle="A foto de cada pessoa se revela conforme a conversa de vocês evolui.">
      {rows.length === 0 ? (
        <Empty
          icon="chat" title="Nenhuma conversa ainda"
          body="Quando houver interesse dos dois lados, a conversa aparece aqui — com sugestões para começar."
          action={<Button size="sm" variant="outline" onClick={() => navigate({ name: 'discover' })}>Descobrir pessoas</Button>}
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {rows.map(({ c, user, last, unread, health }) => {
            if (!user) return null;
            return (
              <button
                key={c.id} type="button" onClick={() => navigate({ name: 'chat', id: c.id })}
                className="flex w-full items-center gap-3.5 p-4 text-left transition-colors hover:bg-bg"
              >
                <Avatar seed={user.id} photo={user.photo} name={user.name} reveal={health.reveal} size={52} ring={unread > 0} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cx('truncate text-[15px]', unread ? 'font-bold' : 'font-semibold')}>
                      {firstName(user.name)}
                      {c.status === 'encerrada' && <span className="ml-2 text-[11px] font-normal text-muted">encerrada</span>}
                    </p>
                    <span className="shrink-0 text-[11px] text-muted">{last ? timeAgo(last.createdAt) : ''}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className={cx('flex-1 truncate text-[13px]', unread ? 'text-ink' : 'text-muted')}>
                      {last
                        ? `${last.senderId === me.id ? 'Você: ' : ''}${last.kind === 'imagem' ? '📷 Imagem' : last.text}`
                        : 'Vocês ainda não conversaram.'}
                    </p>
                    {unread > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ember px-1.5 text-[10px] font-bold text-white">{unread}</span>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                    <Icon name="lock" size={11} /> {health.stageLabel} · {Math.round(health.reveal * 100)}% revelado
                  </p>
                </div>
              </button>
            );
          })}
        </Card>
      )}
    </Page>
  );
}
