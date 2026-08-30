import { useEffect } from 'react';
import type { AppNotification } from '../types';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Card, Empty, Icon, type IconName } from '../components/ui';
import { cx, timeAgo } from '../services/utils';

const KIND_ICON: Record<AppNotification['kind'], IconName> = {
  conexao: 'heart', mensagem: 'chat', curadoria: 'sparkle',
  solicitacao: 'bell', sistema: 'info', seguranca: 'shield',
};

export function Notifications() {
  const { me, state, dispatch, navigate, back } = useApp();

  useEffect(() => {
    if (me) {
      const t = window.setTimeout(() => dispatch({ type: 'READ_NOTIFICATIONS', userId: me.id }), 900);
      return () => window.clearTimeout(t);
    }
  }, [me, dispatch]);

  if (!me) return null;
  const items = state.notifications.filter((n) => n.userId === me.id);

  return (
    <Page title="Notificações" back={back}>
      {items.length === 0 ? (
        <Empty icon="bell" title="Nada por aqui" body="Conexões, mensagens e curadorias novas aparecem nesta tela." />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {items.map((n) => (
            <button
              key={n.id} type="button"
              onClick={() => n.link && navigate(n.link)}
              className={cx('flex w-full items-start gap-3.5 p-4 text-left transition-colors hover:bg-bg', !n.read && 'bg-brandSoft/40')}
            >
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brandSoft text-brand">
                <Icon name={KIND_ICON[n.kind]} size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cx('truncate text-sm', n.read ? 'font-medium' : 'font-bold')}>{n.title}</p>
                  <span className="shrink-0 text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{n.body}</p>
              </div>
              {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ember" />}
            </button>
          ))}
        </Card>
      )}
    </Page>
  );
}
