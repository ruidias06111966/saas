import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  AppNotification, Connection, Message, ModerationResult, Report, ReportReason, Route, User,
} from '../types';
import { type PlanQuota, QUOTAS } from '../constants';
import {
  type Action, type AppState, blockedIdsFor, connectionWith, hasFullHistory, healthOf,
  initialState, reducer, usageToday,
} from './appState';
import { loadState, saveState } from '../services/storage';
import * as backend from '../services/backend';
import { onAuthChange, currentSession, signOut } from '../services/auth';
import { subscribeToConversations } from '../services/realtime';
import { supabaseEnabled } from '../services/supabaseClient';
import { identificarUsuario, reportarErro } from '../services/monitoring';
import { computeCompatibility } from '../services/compatibility';
import { reputationDelta } from '../services/conversation';
import { moderateText } from '../services/moderation';
import { dateKey, firstName, newId, uid } from '../services/utils';

export interface Toast {
  id: string;
  text: string;
  tone: 'ok' | 'info' | 'warn' | 'danger';
}

interface Ctx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  me: User | null;
  route: Route;
  navigate: (r: Route) => void;
  back: () => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
  // ações de domínio
  expressInterest: (targetId: string) => { ok: boolean; connected: boolean; reason?: string };
  passOn: (targetId: string) => void;
  toggleFavorite: (connectionId: string) => void;
  sendMessage: (connectionId: string, text: string, kind?: Message['kind'], extra?: Partial<Message>) => ModerationResult | null;
  closeConnection: (connectionId: string, gently: boolean, farewell?: string) => void;
  blockUser: (targetId: string) => void;
  reportUser: (targetId: string, reason: ReportReason, description: string) => void;
  setRevealConsent: (connectionId: string, value: boolean) => void;
  markRead: (connectionId: string) => void;
  /** Salva o perfil localmente e no servidor. Lança se o servidor recusar. */
  saveProfile: (user: User) => Promise<void>;
  logout: () => Promise<void>;
  /** LGPD art. 18, VI. No modo online roda dentro de delete_my_account(). */
  deleteAccount: () => Promise<void>;
  quota: PlanQuota;
  canUseAi: boolean;
  spendAi: () => void;
  /** 'demo' = perfis fictícios locais. 'online' = Postgres com RLS. */
  mode: 'demo' | 'online';
  /** true enquanto a sessão é restaurada e os dados são buscados. */
  booting: boolean;
  /** Recarrega o recorte que o RLS devolve. Usado ao concluir o cadastro. */
  refresh: () => Promise<void>;
  /** Busca a página anterior do histórico desta conversa. */
  loadOlder: (connectionId: string) => Promise<void>;
  /** true se ainda há mensagens mais antigas no servidor. */
  hasOlder: (connectionId: string) => boolean;
  /**
   * Sessão válida, mas sem linha em `public.users`. Acontece quando a pessoa
   * confirma o e-mail: a conta existe no Auth desde o cadastro, e o perfil só
   * pôde ser gravado agora, porque só agora existe sessão.
   */
  pendingAccount: { id: string; email: string } | null;
}

const AppCtx = createContext<Ctx | null>(null);

export const useApp = (): Ctx => {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppProvider>');
  return ctx;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState() ?? initialState());
  const [route, setRoute] = useState<Route>(() => ({ name: 'landing' }));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [booting, setBooting] = useState(supabaseEnabled);
  const [pendingAccount, setPendingAccount] = useState<{ id: string; email: string } | null>(null);
  const historyRef = useRef<Route[]>([]);
  // A rota vive num ref para o handler do Realtime poder consultá-la sem
  // entrar nas dependências do efeito — senão reassinaríamos a cada navegação.
  const routeRef = useRef<Route>({ name: 'landing' });
  // Mesma razão: o handler precisa resolver nomes sem que a lista de usuários
  // entre nas dependências e provoque uma reassinatura a cada mudança de estado.
  const usersRef = useRef<User[]>([]);

  const me = useMemo(
    () => state.users.find((u) => u.id === state.sessionUserId) ?? null,
    [state.users, state.sessionUserId],
  );

  useEffect(() => saveState(state), [state]);

  // ------------------------------------------------------------------------
  // Modo online: restaura a sessão e carrega o recorte que o RLS devolve.
  // ------------------------------------------------------------------------
  const hydrate = useCallback(async (userId: string, email = '') => {
    const snapshot = await backend.loadSnapshot(userId);
    dispatch({ type: 'HYDRATE_REMOTE', snapshot, sessionUserId: userId });
    // Sessão sem perfil = cadastro pela metade. Não é erro: com a confirmação
    // de e-mail ligada, o perfil não pôde ser gravado no momento do cadastro,
    // porque ainda não havia sessão.
    setPendingAccount(
      snapshot.users.some((u) => u.id === userId) ? null : { id: userId, email },
    );
  }, []);

  const refresh = useCallback(async () => {
    const session = await currentSession();
    if (session?.user?.id) await hydrate(session.user.id, session.user.email ?? '');
  }, [hydrate]);

  /**
   * Termômetro de uma conversa, recalculado no Postgres. Só faz sentido para as
   * conversas longas: nas curtas o cliente tem tudo e a conta local já reage
   * sozinha, sem ida ao servidor.
   */
  const refreshHealth = useCallback((connectionId: string) => {
    if (!supabaseEnabled) return;
    backend.loadHealth(connectionId)
      .then((health) => { if (health) dispatch({ type: 'SET_HEALTH', connectionId, health }); })
      .catch((err) => console.error('[CONEXÃO] Falha ao ler o termômetro.', err));
  }, []);

  const loadOlder = useCallback(async (connectionId: string) => {
    if (!supabaseEnabled) return;
    const atuais = state.messages.filter((m) => m.connectionId === connectionId);
    if (!atuais.length) return;
    const maisAntiga = atuais.reduce((min, m) => (m.createdAt < min ? m.createdAt : min), atuais[0].createdAt);
    const { messages, fim } = await backend.loadOlderMessages(connectionId, maisAntiga);
    dispatch({ type: 'PREPEND_MESSAGES', connectionId, messages, fim });
  }, [state.messages]);

  const hasOlder = useCallback(
    (connectionId: string) => !hasFullHistory(state, connectionId),
    [state],
  );

  useEffect(() => {
    if (!supabaseEnabled) return;
    let vivo = true;

    currentSession()
      .then(async (session) => {
        if (!vivo) return;
        if (session?.user?.id) await hydrate(session.user.id, session.user.email ?? '');
      })
      .catch((err) => {
        console.error('[CONEXÃO] Falha ao restaurar a sessão.', err);
        reportarErro(err, 'restaurar-sessao');
      })
      .finally(() => { if (vivo) setBooting(false); });

    const unsubscribe = onAuthChange((userId, evento) => {
      if (!vivo) return;
      identificarUsuario(userId);

      // O link de "esqueci minha senha" cria uma sessão de verdade. Sem este
      // desvio a pessoa cairia direto no app — logada, mas sem ter definido
      // senha nenhuma, e sem entender o que aconteceu.
      if (evento === 'PASSWORD_RECOVERY') {
        setRoute({ name: 'redefinirSenha' });
        setBooting(false);
        return;
      }

      if (userId) {
        void currentSession().then((s2) =>
          // Este catch protege a tela de quebrar, e por isso mesmo precisa
          // avisar: era aqui que uma falha ao carregar os dados da pessoa
          // deixava o app parado sem explicação para ninguém.
          hydrate(userId, s2?.user?.email ?? '').catch((err) => {
            reportarErro(err, 'hidratar-apos-login');
          }),
        );
      } else {
        setPendingAccount(null);
        dispatch({ type: 'LOGOUT' });
      }
    });

    return () => { vivo = false; unsubscribe(); };
  }, [hydrate]);

  // ------------------------------------------------------------------------
  // Realtime: mensagens e conexões chegam sem recarregar a página.
  // O RLS já filtra o stream, então não há filtro por id aqui de propósito.
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!supabaseEnabled || !me) return;
    const meId = me.id;

    return subscribeToConversations({
      onMessage: (message) => {
        dispatch({ type: 'UPSERT_MESSAGE', message });

        // Aviso só para mensagem de outra pessoa, e só se você não estiver
        // justamente naquela conversa — ali ela já aparece na tela.
        const rota = routeRef.current;
        const olhandoEsta = rota.name === 'chat' && rota.id === message.connectionId;
        if (message.senderId !== meId && !olhandoEsta && message.kind !== 'sistema') {
          setToasts((prev) => [...prev, {
            id: uid('toast'), tone: 'info',
            text: `Nova mensagem de ${firstName(
              usersRef.current.find((u) => u.id === message.senderId)?.name ?? 'alguém',
            )}.`,
          }]);
        }
      },
      onConnection: (connection) => {
        dispatch({ type: 'UPSERT_CONNECTION', connection });
      },
    });
  }, [me]);

  /**
   * Escrita no backend. O reducer já aplicou a mudança localmente (otimista),
   * então aqui só propagamos e avisamos se o servidor recusar.
   */
  const persist = useCallback((acao: () => Promise<void>, oQue: string) => {
    if (!supabaseEnabled) return;
    acao().catch((err: Error) => {
      console.error(`[CONEXÃO] ${oQue}`, err);
      setToasts((prev) => [...prev, {
        id: uid('toast'), tone: 'danger',
        // O motivo do servidor vai junto. Sem ele, "não chegou ao servidor" é
        // indistinguível entre queda de rede e recusa do banco — e foi isso que
        // deixou o id em formato errado passar despercebido.
        text: `${oQue} ${err.message}`,
      }]);
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
  }, [state.theme]);

  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => { usersRef.current = state.users; }, [state.users]);

  // Ao entrar/sair, leva para uma rota coerente.
  useEffect(() => {
    if (me && (route.name === 'landing' || route.name === 'login' || route.name === 'signup')) {
      setRoute({ name: 'home' });
    }
    if (!me && !['landing', 'login', 'signup'].includes(route.name)) {
      setRoute({ name: 'landing' });
    }
  }, [me, route.name]);

  const navigate = useCallback((r: Route) => {
    setRoute((prev) => {
      historyRef.current = [...historyRef.current.slice(-20), prev];
      return r;
    });
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    const prev = historyRef.current.pop();
    setRoute(prev ?? { name: 'home' });
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const t: Toast = { id: uid('toast'), text, tone };
    setToasts((prev) => [...prev, t]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4200);
  }, []);

  const notify = useCallback((n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => {
    dispatch({
      type: 'NOTIFY',
      notification: { ...n, id: newId(), read: false, createdAt: new Date().toISOString() },
    });
  }, []);

  const quota = QUOTAS[me?.plan ?? 'free'];
  const usage = me ? usageToday(state, me.id) : { interests: 0, aiCalls: 0, userId: '', date: dateKey() };
  const canUseAi = usage.aiCalls < quota.dailyAiCalls;

  const spendAi = useCallback(() => {
    if (!me) return;
    dispatch({ type: 'BUMP_USAGE', userId: me.id, field: 'aiCalls' });
    persist(() => backend.bumpUsage(me.id, 'aiCalls'), 'Não foi possível atualizar sua cota de IA.');
  }, [me, persist]);

  // ---------------------------- interesse ----------------------------------

  const expressInterest = useCallback((targetId: string) => {
    if (!me) return { ok: false, connected: false, reason: 'Sessão expirada.' };
    if (usage.interests >= quota.dailyInterests) {
      return {
        ok: false, connected: false,
        reason: `Você usou seus ${quota.dailyInterests} interesses de hoje. O limite existe de propósito: aqui a ideia é conversar, não colecionar.`,
      };
    }
    const target = state.users.find((u) => u.id === targetId);
    if (!target) return { ok: false, connected: false, reason: 'Perfil indisponível.' };

    const existing = connectionWith(state, me.id, targetId);
    const compatibility = computeCompatibility(me, target).score;
    dispatch({ type: 'BUMP_USAGE', userId: me.id, field: 'interests' });

    if (existing) {
      const likes = { ...existing.likes, [me.id]: true };
      const mutual = !!likes[existing.userA] && !!likes[existing.userB];
      const patch = {
        likes,
        status: (mutual ? 'conectada' : 'pendente') as Connection['status'],
        connectedAt: mutual ? new Date().toISOString() : existing.connectedAt,
        compatibility,
      };
      dispatch({ type: 'SET_CONNECTION', id: existing.id, patch });
      persist(() => backend.saveConnection({ ...existing, ...patch }), 'Não foi possível registrar seu interesse.');
      persist(() => backend.bumpUsage(me.id, 'interests'), 'Não foi possível atualizar sua cota diária.');
      if (mutual) {
        notify({
          userId: me.id, kind: 'conexao', title: `Conexão com ${firstName(target.name)} ❤️`,
          body: 'Vocês demonstraram interesse um pelo outro. Comece a conversa.',
          link: { name: 'chat', id: existing.id },
        });
      }
      return { ok: true, connected: mutual };
    }

    const conn: Connection = {
      id: newId(), userA: me.id, userB: targetId, status: 'pendente',
      likes: { [me.id]: true }, favorite: {}, revealConsent: {},
      compatibility, createdAt: new Date().toISOString(), curatedOn: dateKey(),
    };
    dispatch({ type: 'UPSERT_CONNECTION', connection: conn });
    persist(() => backend.saveConnection(conn), 'Não foi possível registrar seu interesse.');
    persist(() => backend.bumpUsage(me.id, 'interests'), 'Não foi possível atualizar sua cota diária.');
    return { ok: true, connected: false };
  }, [me, state, usage.interests, quota.dailyInterests, notify, persist]);

  const passOn = useCallback((targetId: string) => {
    if (!me) return;
    const existing = connectionWith(state, me.id, targetId);
    if (existing) {
      dispatch({ type: 'SET_CONNECTION', id: existing.id, patch: { status: 'recusada' } });
      persist(() => backend.saveConnection({ ...existing, status: 'recusada' }), 'Não foi possível registrar sua escolha.');
      return;
    }
    const conn: Connection = {
      id: newId(), userA: me.id, userB: targetId, status: 'recusada',
      likes: {}, favorite: {}, revealConsent: {}, compatibility: 0,
      createdAt: new Date().toISOString(), curatedOn: dateKey(),
    };
    dispatch({ type: 'UPSERT_CONNECTION', connection: conn });
    persist(() => backend.saveConnection(conn), 'Não foi possível registrar sua escolha.');
  }, [me, state, persist]);

  const toggleFavorite = useCallback((connectionId: string) => {
    if (!me) return;
    const c = state.connections.find((x) => x.id === connectionId);
    if (!c) return;
    const favorite = { ...c.favorite, [me.id]: !c.favorite[me.id] };
    dispatch({ type: 'SET_CONNECTION', id: connectionId, patch: { favorite } });
    persist(() => backend.saveConnection({ ...c, favorite }), 'Não foi possível salvar o favorito.');
  }, [me, state.connections, persist]);

  const setRevealConsent = useCallback((connectionId: string, value: boolean) => {
    if (!me) return;
    const c = state.connections.find((x) => x.id === connectionId);
    if (!c) return;
    const revealConsent = { ...c.revealConsent, [me.id]: value };
    dispatch({ type: 'SET_CONNECTION', id: connectionId, patch: { revealConsent } });
    persist(() => backend.saveConnection({ ...c, revealConsent }), 'Não foi possível salvar o pedido de revelação.');
    if (revealConsent[c.userA] && revealConsent[c.userB]) {
      toast('Vocês dois concordaram. As fotos foram reveladas.', 'ok');
    } else if (value) {
      toast('Pedido enviado. A foto só é revelada se a outra pessoa também aceitar.', 'info');
    }
  }, [me, state.connections, toast, persist]);

  // ---------------------------- mensagens ----------------------------------

  const sendMessage = useCallback((
    connectionId: string, text: string, kind: Message['kind'] = 'texto', extra: Partial<Message> = {},
  ): ModerationResult | null => {
    if (!me) return null;
    const trimmed = text.trim();
    if (!trimmed && kind !== 'imagem') return null;

    const result = kind === 'sistema' ? null : moderateText(trimmed);
    const message: Message = {
      id: newId(), connectionId, senderId: me.id, kind, text: trimmed,
      createdAt: new Date().toISOString(),
      ...(result && result.level !== 'ok' ? { moderation: result } : {}),
      ...extra,
    };
    dispatch({ type: 'SEND_MESSAGE', message });
    persist(() => backend.saveMessage(message), 'Sua mensagem não chegou ao servidor.');
    // Conversa longa: como o cliente não tem o histórico inteiro, quem sabe o
    // novo termômetro é o servidor.
    if (kind !== 'sistema' && !hasFullHistory(state, connectionId)) refreshHealth(connectionId);

    if (result && result.level !== 'ok') {
      dispatch({
        type: 'ADD_MODERATION',
        item: {
          id: newId(), messageId: message.id, connectionId, authorId: me.id,
          excerpt: trimmed.slice(0, 240), result, status: 'pendente',
          createdAt: new Date().toISOString(),
        },
      });
    }

    const conn = state.connections.find((c) => c.id === connectionId);
    if (conn && conn.status === 'encerrada') {
      dispatch({ type: 'SET_CONNECTION', id: connectionId, patch: { status: 'conectada' } });
      persist(() => backend.saveConnection({ ...conn, status: 'conectada' }), 'Não foi possível reabrir a conversa.');
    }
    return result;
  }, [me, state, persist, refreshHealth]);

  /** Marca como lidas as mensagens que a outra pessoa mandou nesta conexão. */
  const markRead = useCallback((connectionId: string) => {
    if (!me) return;
    dispatch({ type: 'MARK_READ', connectionId, readerId: me.id });
    persist(() => backend.markMessagesRead(connectionId, me.id), 'Não foi possível marcar como lida.');
  }, [me, persist]);

  // ---------------------------- encerrar / bloquear ------------------------

  const closeConnection = useCallback((connectionId: string, gently: boolean, farewell?: string) => {
    if (!me) return;
    const conn = state.connections.find((c) => c.id === connectionId);
    if (!conn) return;
    if (gently && farewell?.trim()) {
      dispatch({
        type: 'SEND_MESSAGE',
        message: {
          id: newId(), connectionId, senderId: me.id, kind: 'texto',
          text: farewell.trim(), createdAt: new Date().toISOString(),
        },
      });
    }
    const health = healthOf(state, conn, state.messages.filter((m) => m.connectionId === connectionId));
    const delta = reputationDelta(gently, health);
    const patch = {
      status: 'encerrada' as const, closedBy: me.id, closedGently: gently,
      closedReason: gently ? 'despedida' : 'sem_aviso',
    };
    dispatch({ type: 'SET_CONNECTION', id: connectionId, patch });
    // Otimista na tela; no servidor quem decide é encerrar_conversa(), que
    // conta as mensagens de verdade. A reputação não é mais gravável pelo
    // cliente — se fosse, bastava um PATCH para ficar com 100.
    dispatch({
      type: 'UPDATE_USER', id: me.id,
      patch: { reputation: Math.max(0, Math.min(100, me.reputation + delta)) },
    });
    if (supabaseEnabled) {
      backend.closeConversation(connectionId, gently)
        .then(({ reputation }) => dispatch({ type: 'UPDATE_USER', id: me.id, patch: { reputation } }))
        .catch((err: Error) => {
          console.error('[CONEXÃO] Falha ao encerrar a conversa.', err);
          setToasts((prev) => [...prev, {
            id: uid('toast'), tone: 'danger',
            text: `Não foi possível encerrar a conversa no servidor. ${err.message}`,
          }]);
        });
    }
    toast(
      gently
        ? 'Conversa encerrada com uma despedida. Sua reputação de conversa agradece.'
        : 'Conversa encerrada.',
      gently ? 'ok' : 'info',
    );
  }, [me, state, toast, persist]);

  const blockUser = useCallback((targetId: string) => {
    if (!me) return;
    dispatch({ type: 'BLOCK', blockerId: me.id, blockedId: targetId });
    persist(() => backend.setBlock(me.id, targetId, true), 'Não foi possível registrar o bloqueio.');
    const conn = connectionWith(state, me.id, targetId);
    if (conn) {
      persist(() => backend.saveConnection({ ...conn, status: 'bloqueada', closedBy: me.id }),
        'Não foi possível encerrar a conexão bloqueada.');
    }
    toast('Pessoa bloqueada. Ela não aparece mais para você e não pode te contatar.', 'ok');
  }, [me, state, toast, persist]);

  const reportUser = useCallback((targetId: string, reason: ReportReason, description: string) => {
    if (!me) return;
    const conn = connectionWith(state, me.id, targetId);
    const report: Report = {
      id: newId(), reporterId: me.id, reportedId: targetId, reason, description,
      status: 'aberta',
      evidenceMessageIds: conn
        ? state.messages.filter((m) => m.connectionId === conn.id && m.senderId === targetId).slice(-10).map((m) => m.id)
        : [],
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_REPORT', report });
    persist(() => backend.saveReport(report), 'Sua denúncia não chegou ao servidor.');
    toast('Denúncia enviada. Nossa equipe analisa em até 24 horas.', 'ok');
  }, [me, state, toast, persist]);

  const saveProfile = useCallback(async (u: User) => {
    dispatch({ type: 'UPDATE_USER', id: u.id, patch: u });
    if (supabaseEnabled) await backend.saveUser(u);
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setPendingAccount(null);
    dispatch({ type: 'LOGOUT' });
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!me) return;
    if (supabaseEnabled) {
      // Roda no servidor: apaga mensagens e conexões, anonimiza o cadastro e
      // preserva, sem autor, as denúncias feitas CONTRA a pessoa.
      await backend.deleteMyAccount();
      await signOut();
    }
    dispatch({ type: 'DELETE_ACCOUNT', userId: me.id });
  }, [me]);

  const value: Ctx = {
    state, dispatch, me, route, navigate, back,
    toasts, toast, dismissToast,
    expressInterest, passOn, toggleFavorite, sendMessage, closeConnection,
    blockUser, reportUser, setRevealConsent, markRead,
    saveProfile, logout, deleteAccount,
    quota, canUseAi, spendAi,
    mode: state.mode, booting, refresh, loadOlder, hasOlder, pendingAccount,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export { blockedIdsFor };
