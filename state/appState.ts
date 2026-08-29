import type {
  AppNotification, Block, Connection, DailyUsage, Message, ModerationItem,
  Report, Subscription, User,
} from '../types';
import { SEED_USERS } from '../data/seed';
import { buildSeedActivity } from '../data/seedActivity';
import { anonymizeUser } from '../services/lgpd';
import { dateKey, uid } from '../services/utils';

export interface AppState {
  users: User[];
  connections: Connection[];
  messages: Message[];
  reports: Report[];
  moderationQueue: ModerationItem[];
  notifications: AppNotification[];
  blocks: Block[];
  subscriptions: Subscription[];
  usage: DailyUsage[];
  sessionUserId: string | null;
  theme: 'light' | 'dark';
}

export function initialState(): AppState {
  const activity = buildSeedActivity();
  return {
    users: SEED_USERS,
    connections: activity.connections,
    messages: activity.messages,
    reports: activity.reports,
    moderationQueue: activity.moderationQueue,
    notifications: activity.notifications,
    blocks: [],
    subscriptions: [],
    usage: [],
    sessionUserId: null,
    theme: 'light',
  };
}

export type Action =
  | { type: 'HYDRATE'; state: AppState }
  | { type: 'RESET_DEMO' }
  | { type: 'LOGIN'; userId: string }
  | { type: 'LOGOUT' }
  | { type: 'REGISTER'; user: User }
  | { type: 'UPDATE_USER'; id: string; patch: Partial<User> }
  | { type: 'SET_THEME'; theme: 'light' | 'dark' }
  | { type: 'UPSERT_CONNECTION'; connection: Connection }
  | { type: 'SET_CONNECTION'; id: string; patch: Partial<Connection> }
  | { type: 'SEND_MESSAGE'; message: Message }
  | { type: 'MARK_READ'; connectionId: string; readerId: string }
  | { type: 'ADD_REPORT'; report: Report }
  | { type: 'UPDATE_REPORT'; id: string; patch: Partial<Report> }
  | { type: 'ADD_MODERATION'; item: ModerationItem }
  | { type: 'UPDATE_MODERATION'; id: string; patch: Partial<ModerationItem> }
  | { type: 'NOTIFY'; notification: AppNotification }
  | { type: 'READ_NOTIFICATIONS'; userId: string }
  | { type: 'BLOCK'; blockerId: string; blockedId: string }
  | { type: 'UNBLOCK'; blockerId: string; blockedId: string }
  | { type: 'BUMP_USAGE'; userId: string; field: 'interests' | 'aiCalls' }
  | { type: 'SET_SUBSCRIPTION'; subscription: Subscription }
  | { type: 'DELETE_ACCOUNT'; userId: string };

const patchIn = <T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] =>
  list.map((x) => (x.id === id ? { ...x, ...patch } : x));

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE':
      return action.state;

    case 'RESET_DEMO':
      return { ...initialState(), theme: state.theme };

    case 'LOGIN':
      return {
        ...state,
        sessionUserId: action.userId,
        users: patchIn(state.users, action.userId, { lastActiveAt: new Date().toISOString() }),
      };

    case 'LOGOUT':
      return { ...state, sessionUserId: null };

    case 'REGISTER':
      return { ...state, users: [...state.users, action.user], sessionUserId: action.user.id };

    case 'UPDATE_USER':
      return { ...state, users: patchIn(state.users, action.id, action.patch) };

    case 'SET_THEME':
      return { ...state, theme: action.theme };

    case 'UPSERT_CONNECTION': {
      const exists = state.connections.some((c) => c.id === action.connection.id);
      return {
        ...state,
        connections: exists
          ? state.connections.map((c) => (c.id === action.connection.id ? action.connection : c))
          : [...state.connections, action.connection],
      };
    }

    case 'SET_CONNECTION':
      return { ...state, connections: patchIn(state.connections, action.id, action.patch) };

    case 'SEND_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'MARK_READ': {
      const now = new Date().toISOString();
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.connectionId === action.connectionId && m.senderId !== action.readerId && !m.readAt
            ? { ...m, readAt: now }
            : m,
        ),
      };
    }

    case 'ADD_REPORT':
      return { ...state, reports: [action.report, ...state.reports] };

    case 'UPDATE_REPORT':
      return { ...state, reports: patchIn(state.reports, action.id, action.patch) };

    case 'ADD_MODERATION':
      return { ...state, moderationQueue: [action.item, ...state.moderationQueue] };

    case 'UPDATE_MODERATION':
      return { ...state, moderationQueue: patchIn(state.moderationQueue, action.id, action.patch) };

    case 'NOTIFY':
      return { ...state, notifications: [action.notification, ...state.notifications] };

    case 'READ_NOTIFICATIONS':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.userId === action.userId ? { ...n, read: true } : n,
        ),
      };

    case 'BLOCK': {
      const already = state.blocks.some(
        (b) => b.blockerId === action.blockerId && b.blockedId === action.blockedId,
      );
      const blocks = already
        ? state.blocks
        : [...state.blocks, { blockerId: action.blockerId, blockedId: action.blockedId, createdAt: new Date().toISOString() }];
      return {
        ...state,
        blocks,
        connections: state.connections.map((c) =>
          (c.userA === action.blockerId && c.userB === action.blockedId) ||
          (c.userB === action.blockerId && c.userA === action.blockedId)
            ? { ...c, status: 'bloqueada', closedBy: action.blockerId }
            : c,
        ),
      };
    }

    case 'UNBLOCK':
      return {
        ...state,
        blocks: state.blocks.filter(
          (b) => !(b.blockerId === action.blockerId && b.blockedId === action.blockedId),
        ),
      };

    case 'BUMP_USAGE': {
      const today = dateKey();
      const found = state.usage.find((u) => u.userId === action.userId && u.date === today);
      const usage = found
        ? state.usage.map((u) =>
            u === found ? { ...u, [action.field]: u[action.field] + 1 } : u,
          )
        : [...state.usage, { userId: action.userId, date: today, interests: 0, aiCalls: 0, [action.field]: 1 } as DailyUsage];
      return { ...state, usage };
    }

    case 'SET_SUBSCRIPTION':
      return {
        ...state,
        subscriptions: [
          action.subscription,
          ...state.subscriptions.filter((s) => s.userId !== action.subscription.userId),
        ],
        users: patchIn(state.users, action.subscription.userId, { plan: action.subscription.plan }),
      };

    case 'DELETE_ACCOUNT': {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target) return state;
      const mine = new Set(
        state.connections
          .filter((c) => c.userA === action.userId || c.userB === action.userId)
          .map((c) => c.id),
      );
      return {
        ...state,
        users: state.users.map((u) => (u.id === action.userId ? anonymizeUser(u) : u)),
        connections: state.connections.filter((c) => !mine.has(c.id)),
        messages: state.messages.filter((m) => !mine.has(m.connectionId)),
        notifications: state.notifications.filter((n) => n.userId !== action.userId),
        // Denúncias contra a pessoa permanecem, anonimizadas, para proteção de terceiros.
        reports: state.reports.filter((r) => r.reporterId !== action.userId),
        sessionUserId: state.sessionUserId === action.userId ? null : state.sessionUserId,
      };
    }

    default:
      return state;
  }
}

// ------------------------------- seletores ---------------------------------

export const findUser = (s: AppState, id: string | null | undefined): User | undefined =>
  id ? s.users.find((u) => u.id === id) : undefined;

export const otherId = (c: Connection, me: string): string => (c.userA === me ? c.userB : c.userA);

export const connectionsOf = (s: AppState, me: string): Connection[] =>
  s.connections.filter((c) => c.userA === me || c.userB === me);

export const connectionWith = (s: AppState, me: string, other: string): Connection | undefined =>
  s.connections.find(
    (c) => (c.userA === me && c.userB === other) || (c.userA === other && c.userB === me),
  );

export const messagesOf = (s: AppState, connectionId: string): Message[] =>
  s.messages
    .filter((m) => m.connectionId === connectionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const blockedIdsFor = (s: AppState, me: string): Set<string> =>
  new Set([
    ...s.blocks.filter((b) => b.blockerId === me).map((b) => b.blockedId),
    ...s.blocks.filter((b) => b.blockedId === me).map((b) => b.blockerId),
  ]);

export const usageToday = (s: AppState, me: string): DailyUsage =>
  s.usage.find((u) => u.userId === me && u.date === dateKey()) ??
  { userId: me, date: dateKey(), interests: 0, aiCalls: 0 };

export const unreadCount = (s: AppState, me: string): number =>
  s.notifications.filter((n) => n.userId === me && !n.read).length;

export const unreadMessagesFor = (s: AppState, me: string, connectionId: string): number =>
  s.messages.filter((m) => m.connectionId === connectionId && m.senderId !== me && !m.readAt).length;

export const makeConnectionId = () => uid('conn');
