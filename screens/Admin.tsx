import React, { useMemo, useState } from 'react';
import type { AccountStatus, ReportStatus } from '../types';
import { REPORT_REASON_LABEL } from '../constants';
import { CATEGORY_LABEL } from '../services/moderation';
import { useApp } from '../state/AppContext';
import { findUser } from '../state/appState';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Chip, Empty, Icon, Input, Tabs } from '../components/ui';
import { Avatar } from '../components/Portrait';
import { FilaVerificacao } from '../components/FilaVerificacao';
import { dateKey, firstName, timeAgo } from '../services/utils';

type Tab = 'painel' | 'usuarios' | 'denuncias' | 'moderacao' | 'verificacao';

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </Card>
  );
}

export function Admin() {
  const { me, state, dispatch, back, toast } = useApp();
  const [tab, setTab] = useState<Tab>('painel');
  const [query, setQuery] = useState('');

  const stats = useMemo(() => {
    const users = state.users.filter((u) => u.role !== 'admin');
    const today = dateKey();
    const dayAgo = Date.now() - 86400000;
    return {
      total: users.length,
      active: users.filter((u) => new Date(u.lastActiveAt).getTime() > dayAgo).length,
      newToday: users.filter((u) => u.createdAt.slice(0, 10) === today).length,
      verified: users.filter((u) => u.verified).length,
      premium: users.filter((u) => u.plan === 'premium').length,
      suspended: users.filter((u) => u.status !== 'ativo').length,
      connections: state.connections.filter((c) => c.status === 'conectada').length,
      conversations: new Set(state.messages.map((m) => m.connectionId)).size,
      messages: state.messages.length,
      openReports: state.reports.filter((r) => r.status === 'aberta' || r.status === 'em_analise').length,
      pendingModeration: state.moderationQueue.filter((m) => m.status === 'pendente').length,
      gentleClosures: state.connections.filter((c) => c.closedGently).length,
    };
  }, [state]);

  if (!me) return null;
  if (me.role !== 'admin') {
    return (
      <Page title="Área restrita" back={back}>
        <Banner tone="danger" icon="shield" title="Acesso negado">
          Esta área é exclusiva da equipe de moderação. Entre com a conta administrativa
          (<code className="font-mono">admin@conexao.app</code>) para acessar.
        </Banner>
      </Page>
    );
  }

  const users = state.users
    .filter((u) => u.role !== 'admin')
    .filter((u) => !query || `${u.name} ${u.email} ${u.city}`.toLowerCase().includes(query.toLowerCase()));

  const setStatus = (id: string, status: AccountStatus) => {
    dispatch({ type: 'UPDATE_USER', id, patch: { status } });
    toast(`Conta marcada como ${status}.`, status === 'ativo' ? 'ok' : 'warn');
  };

  const resolveReport = (id: string, status: ReportStatus, note: string) => {
    dispatch({ type: 'UPDATE_REPORT', id, patch: { status, resolvedAt: new Date().toISOString(), adminNote: note } });
    toast('Denúncia atualizada.', 'ok');
  };

  return (
    <Page
      title="Painel administrativo" back={back}
      subtitle="Nenhuma suspensão acontece automaticamente. Tudo o que a IA sinaliza para aqui, para decisão humana."
    >
      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { id: 'painel', label: 'Visão geral' },
          { id: 'usuarios', label: 'Usuários', count: stats.total },
          { id: 'denuncias', label: 'Denúncias', count: stats.openReports },
          { id: 'moderacao', label: 'Moderação', count: stats.pendingModeration },
          { id: 'verificacao', label: 'Verificação' },
        ]}
      />

      {tab === 'painel' && (
        <div className="mt-5 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Usuários" value={stats.total} hint={`${stats.verified} verificados`} />
            <Metric label="Ativos em 24 h" value={stats.active} />
            <Metric label="Novos hoje" value={stats.newToday} />
            <Metric label="Premium" value={stats.premium} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Conexões" value={stats.connections} />
            <Metric label="Conversas iniciadas" value={stats.conversations} />
            <Metric label="Mensagens" value={stats.messages} />
            <Metric label="Encerradas com despedida" value={stats.gentleClosures} hint="métrica anti-ghosting" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Denúncias abertas" value={stats.openReports} />
            <Metric label="Fila de moderação" value={stats.pendingModeration} />
            <Metric label="Contas suspensas" value={stats.suspended} />
            <Metric label="Taxa de conversa" value={`${stats.connections ? Math.round((stats.conversations / stats.connections) * 100) : 0}%`} hint="conexões que viraram conversa" />
          </div>

          <Banner tone="info" icon="chart" title="A métrica que importa aqui">
            Em um app de relacionamento comum, a métrica de sucesso é tempo em tela. No CONEXÃO é a
            <strong> taxa de conexões que viram conversa de verdade</strong> — e a de conversas que
            chegam ao estágio "Revelado". São essas que colocamos no topo do painel de propósito.
          </Banner>
        </div>
      )}

      {tab === 'usuarios' && (
        <div className="mt-5">
          <Input placeholder="Buscar por nome, e-mail ou cidade" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Card className="mt-4 divide-y divide-line overflow-hidden">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-4">
                <Avatar seed={u.id} photo={u.photo} name={u.name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {u.name}, {u.age}
                    {u.verified && <Icon name="check" size={12} className="ml-1.5 inline text-sage" />}
                  </p>
                  <p className="truncate text-[12px] text-muted">{u.email} · {u.city} · reputação {u.reputation}</p>
                </div>
                <Chip size="sm" tone={u.status === 'ativo' ? 'sage' : u.status === 'suspenso' ? 'warn' : 'danger'}>{u.status}</Chip>
                {u.status === 'ativo' ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setStatus(u.id, 'suspenso')}>Suspender</Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(u.id, 'banido')}>Banir</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setStatus(u.id, 'ativo')}>Reativar</Button>
                )}
              </div>
            ))}
            {users.length === 0 && <p className="p-6 text-center text-sm text-muted">Nenhum usuário encontrado.</p>}
          </Card>
        </div>
      )}

      {tab === 'denuncias' && (
        <div className="mt-5 space-y-3">
          {state.reports.length === 0 && <Empty icon="shield" title="Nenhuma denúncia" body="Quando alguém denunciar um perfil, ela aparece aqui." />}
          {state.reports.map((r) => {
            const reporter = findUser(state, r.reporterId);
            const reported = findUser(state, r.reportedId);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {firstName(reported?.name ?? '—')} denunciado(a) por {firstName(reporter?.name ?? '—')}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {REPORT_REASON_LABEL[r.reason]} · {timeAgo(r.createdAt)} atrás · {r.evidenceMessageIds.length} mensagem(ns) anexada(s)
                    </p>
                  </div>
                  <Chip size="sm" tone={r.status === 'aberta' ? 'warn' : r.status === 'procedente' ? 'danger' : r.status === 'improcedente' ? 'sage' : 'neutral'}>
                    {r.status}
                  </Chip>
                </div>
                {r.description && <p className="mt-2 rounded-2xl bg-bg p-3 text-[13px] leading-relaxed">{r.description}</p>}
                {r.adminNote && <p className="mt-2 text-[12px] text-muted">Nota da equipe: {r.adminNote}</p>}
                {(r.status === 'aberta' || r.status === 'em_analise') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => resolveReport(r.id, 'em_analise', 'Em apuração pela equipe.')}>Marcar em análise</Button>
                    <Button
                      size="sm" variant="danger"
                      onClick={() => { resolveReport(r.id, 'procedente', 'Conta suspensa após análise humana.'); if (reported) setStatus(reported.id, 'suspenso'); }}
                    >
                      Procedente e suspender
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => resolveReport(r.id, 'improcedente', 'Sem violação identificada.')}>Improcedente</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'moderacao' && (
        <div className="mt-5 space-y-3">
          <Banner tone="info" icon="shield" title="Como funciona a fila">
            A camada 1 é uma heurística local que roda antes do envio. A camada 2, opcional, usa o Gemini
            para classificar o que a heurística marcou. As duas apenas sinalizam — quem decide é você.
          </Banner>
          {state.moderationQueue.length === 0 && <Empty icon="shield" title="Fila vazia" body="Nenhuma mensagem sinalizada no momento." />}
          {state.moderationQueue.map((item) => {
            const author = findUser(state, item.authorId);
            return (
              <Card key={item.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{author?.name ?? 'Usuário removido'}</p>
                    <p className="text-[12px] text-muted">{timeAgo(item.createdAt)} atrás · fonte: {item.result.source}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip size="sm" tone={item.result.level === 'risco' ? 'danger' : 'warn'}>{item.result.level}</Chip>
                    {item.result.categories.map((c) => (
                      <Chip key={c} size="sm">{CATEGORY_LABEL[c] ?? c}</Chip>
                    ))}
                  </div>
                </div>
                <p className="mt-2 rounded-2xl bg-bg p-3 text-[13px] italic leading-relaxed">“{item.excerpt}”</p>
                <p className="mt-2 text-[12px] text-muted">{item.result.advice}</p>
                {item.status === 'pendente' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'UPDATE_MODERATION', id: item.id, patch: { status: 'liberado' } })}>
                      Liberar (falso positivo)
                    </Button>
                    <Button
                      size="sm" variant="danger"
                      onClick={() => { dispatch({ type: 'UPDATE_MODERATION', id: item.id, patch: { status: 'removido' } }); if (author) setStatus(author.id, 'suspenso'); }}
                    >
                      Remover e suspender autor
                    </Button>
                  </div>
                ) : (
                  <Chip size="sm" tone={item.status === 'liberado' ? 'sage' : 'danger'}>{item.status}</Chip>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'verificacao' && (
        <div className="mt-5">
          <Banner tone="info" icon="shield" title="Comparação feita por pessoa, não por máquina">
            Confira se a selfie reproduz a pose sorteada e se é a mesma pessoa da foto do perfil.
            Decidir apaga a selfie do servidor — ela existe só para esta decisão.
          </Banner>
          <FilaVerificacao />
        </div>
      )}

    </Page>
  );
}
