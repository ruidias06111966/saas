import React from 'react';
import type { IconName } from '../ui';
import type { Route } from '../../types';
import { Icon } from '../ui';
import { useApp } from '../../state/AppContext';
import { connectionsOf, unreadCount } from '../../state/appState';
import { cx, firstName } from '../../services/utils';
import { Avatar } from '../Portrait';

const NAV: { route: Route['name']; label: string; icon: IconName }[] = [
  { route: 'home', label: 'Início', icon: 'home' },
  { route: 'discover', label: 'Descobrir', icon: 'compass' },
  { route: 'chats', label: 'Conversas', icon: 'chat' },
  { route: 'connections', label: 'Conexões', icon: 'sparkle' },
  { route: 'profile', label: 'Perfil', icon: 'user' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, route, navigate, state } = useApp();
  if (!me) return <>{children}</>;

  const unread = unreadCount(state, me.id);
  const pending = connectionsOf(state, me.id).filter(
    (c) => c.status === 'pendente' && !c.likes[me.id],
  ).length;
  const unreadChats = new Set(
    state.messages
      .filter((m) => !m.readAt && m.senderId !== me.id)
      .filter((m) => connectionsOf(state, me.id).some((c) => c.id === m.connectionId && c.status === 'conectada'))
      .map((m) => m.connectionId),
  ).size;

  const badgeFor = (name: Route['name']) =>
    name === 'chats' ? unreadChats : name === 'connections' ? pending : 0;

  const isActive = (name: Route['name']) =>
    route.name === name ||
    (name === 'chats' && route.name === 'chat') ||
    (name === 'discover' && route.name === 'person') ||
    (name === 'profile' && route.name === 'profileEdit');

  // O chat ocupa a tela inteira no celular: sem menu inferior competindo com
  // o campo de escrita.
  const fullscreen = route.name === 'chat';

  return (
    <div className="min-h-full lg:flex">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 lg:flex">
        <button type="button" onClick={() => navigate({ name: 'home' })} className="mb-8 px-2 text-left">
          <span className="font-display text-xl font-bold tracking-tight">CONEXÃO</span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-[0.18em] text-muted">conversa primeiro</span>
        </button>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const badge = badgeFor(item.route);
            return (
              <button
                key={item.route} type="button"
                onClick={() => navigate({ name: item.route } as Route)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive(item.route) ? 'bg-brandSoft text-brand' : 'text-muted hover:bg-bg hover:text-ink',
                )}
              >
                <Icon name={item.icon} size={19} />
                {item.label}
                {badge > 0 && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-ember px-1.5 text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-line pt-3">
          <button
            type="button" onClick={() => navigate({ name: 'notifications' })}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-bg hover:text-ink"
          >
            <Icon name="bell" size={19} /> Notificações
            {unread > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-ember" />}
          </button>
          {me.plan === 'free' && (
            <button
              type="button" onClick={() => navigate({ name: 'premium' })}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-ember transition-colors hover:bg-ember/10"
            >
              <Icon name="crown" size={19} /> Premium
            </button>
          )}
          {me.role === 'admin' && (
            <button
              type="button" onClick={() => navigate({ name: 'admin' })}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-bg hover:text-ink"
            >
              <Icon name="shield" size={19} /> Administração
            </button>
          )}
          <button
            type="button" onClick={() => navigate({ name: 'settings' })}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-bg hover:text-ink"
          >
            <Icon name="settings" size={19} /> Configurações
          </button>
        </div>

        <button
          type="button" onClick={() => navigate({ name: 'profile' })}
          className="mt-3 flex items-center gap-3 rounded-2xl border border-line p-2.5 text-left transition-colors hover:bg-bg"
        >
          <Avatar seed={me.id} photo={me.photo} name={me.name} size={36} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{firstName(me.name)}</p>
            <p className="text-[11px] capitalize text-muted">{me.plan === 'premium' ? 'Premium' : 'Plano gratuito'}</p>
          </div>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className={cx('flex-1', fullscreen ? 'pb-0 lg:pb-10' : 'pb-24 lg:pb-10')}>{children}</main>

        {/* Menu inferior — mobile */}
        <nav className={cx(
          'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden',
          fullscreen && 'hidden',
        )}>
          <div className="mx-auto flex max-w-lg">
            {NAV.map((item) => {
              const badge = badgeFor(item.route);
              const active = isActive(item.route);
              return (
                <button
                  key={item.route} type="button"
                  onClick={() => navigate({ name: item.route } as Route)}
                  className="relative flex flex-1 flex-col items-center gap-0.5 py-2.5"
                >
                  <span className={cx('relative transition-colors', active ? 'text-brand' : 'text-muted')}>
                    <Icon name={item.icon} size={22} filled={active && item.icon === 'heart'} />
                    {badge > 0 && (
                      <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-ember px-1 text-[9px] font-bold text-white">
                        {badge}
                      </span>
                    )}
                  </span>
                  <span className={cx('text-[10px] font-medium', active ? 'text-brand' : 'text-muted')}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function Page({ title, subtitle, action, children, back, maxWidth = 'max-w-3xl' }: {
  title?: string; subtitle?: string; action?: React.ReactNode;
  children: React.ReactNode; back?: () => void; maxWidth?: string;
}) {
  return (
    <div className={cx('mx-auto w-full px-4 py-5 sm:px-6 lg:py-8', maxWidth)}>
      {(title || back) && (
        <header className="mb-6 flex items-start gap-3">
          {back && (
            <button
              type="button" onClick={back} aria-label="Voltar"
              className="-ml-2 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-brandSoft hover:text-ink"
            >
              <Icon name="back" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            {title && <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </div>
  );
}
