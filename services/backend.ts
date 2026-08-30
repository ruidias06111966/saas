import type {
  AppNotification, Block, Connection, Consent, DailyUsage, Lifestyle, Message,
  ModerationItem, Personality, Preferences, Report, User,
} from '../types';
import type { HealthMetrics } from './conversation';
import { requireSupabase, supabaseEnabled } from './supabaseClient';
import { dateKey } from './utils';

// ---------------------------------------------------------------------------
// Camada de acesso ao Supabase.
//
// O schema foi desenhado espelhando `types.ts`, então o mapeamento é quase 1:1
// e as 15 telas não mudam: elas continuam lendo o mesmo AppState em memória.
// O que muda é de onde esse estado vem e para onde as mutações vão.
//
// Estratégia: local-first otimista. O reducer aplica a mudança na hora (UI
// instantânea) e a escrita no Postgres acontece em seguida. Se a escrita
// falhar, o chamador recebe o erro e avisa a pessoa.
// ---------------------------------------------------------------------------

/** Ordem canônica do par, exigida pela constraint `ordem_canonica`. */
export const pairOrder = (x: string, y: string): [string, string] =>
  x < y ? [x, y] : [y, x];

const SELECT_USER = `
  id, name, email, birth_date, gender, city, state, approx_lat, approx_lng,
  photo_url, extra_photos, profession, bio, goal, chat_pace, verified,
  reputation, plan, role, status, created_at, last_active_at,
  profiles ( personality, lifestyle ),
  preferences ( seeking, age_min, age_max, max_distance_km, goals, min_compatibility ),
  user_interests ( interest_id ),
  prompt_answers ( prompt_id, answer ),
  consents ( kind, version, accepted_at )
`;

interface RawUser {
  id: string; name: string; email: string; birth_date: string;
  gender: User['gender']; city: string; state: string;
  approx_lat: number | string; approx_lng: number | string;
  photo_url: string | null; extra_photos: string[] | null;
  profession: string | null; bio: string | null;
  goal: User['goal']; chat_pace: User['chatPace'];
  verified: boolean; reputation: number; plan: User['plan'];
  role: User['role']; status: User['status'];
  created_at: string; last_active_at: string;
  profiles: { personality: Personality; lifestyle: Lifestyle } | null;
  preferences: {
    seeking: string[]; age_min: number; age_max: number;
    max_distance_km: number; goals: string[]; min_compatibility: number;
  } | null;
  user_interests: { interest_id: string }[] | null;
  prompt_answers: { prompt_id: string; answer: string }[] | null;
  consents: { kind: string; version: string; accepted_at: string }[] | null;
}

const DEFAULT_PERSONALITY: Personality = {
  energia: 50, ritmo: 50, planejamento: 50, afeto: 50, novidade: 50,
};
const DEFAULT_LIFESTYLE: Lifestyle = {
  bebida: 'socialmente', fumo: 'nao', exercicio: 'as_vezes',
  filhos: 'indeciso', animais: 'gosto', religiosidade: 'pouco',
};
const DEFAULT_PREFERENCES: Preferences = {
  seeking: ['todos'], ageMin: 18, ageMax: 99,
  maxDistanceKm: 50, goals: [], minCompatibility: 0,
};

function toUser(r: RawUser): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    // A senha vive no Supabase Auth. Este campo existe só para o modo demo.
    passwordHash: '',
    birthDate: r.birth_date,
    gender: r.gender,
    city: r.city,
    state: r.state,
    approxLat: Number(r.approx_lat),
    approxLng: Number(r.approx_lng),
    photo: r.photo_url ?? undefined,
    extraPhotos: r.extra_photos ?? [],
    profession: r.profession ?? '',
    bio: r.bio ?? '',
    interests: (r.user_interests ?? []).map((i) => i.interest_id),
    personality: r.profiles?.personality ?? DEFAULT_PERSONALITY,
    lifestyle: r.profiles?.lifestyle ?? DEFAULT_LIFESTYLE,
    chatPace: r.chat_pace,
    goal: r.goal,
    answers: (r.prompt_answers ?? []).map((a) => ({ promptId: a.prompt_id, answer: a.answer })),
    preferences: r.preferences
      ? {
          seeking: r.preferences.seeking as Preferences['seeking'],
          ageMin: r.preferences.age_min,
          ageMax: r.preferences.age_max,
          maxDistanceKm: r.preferences.max_distance_km,
          goals: r.preferences.goals as Preferences['goals'],
          minCompatibility: r.preferences.min_compatibility,
        }
      : DEFAULT_PREFERENCES,
    verified: r.verified,
    reputation: r.reputation,
    plan: r.plan,
    role: r.role,
    status: r.status,
    consents: (r.consents ?? []).map((c) => ({
      kind: c.kind as Consent['kind'], version: c.version, acceptedAt: c.accepted_at,
    })),
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
  };
}

export interface RawConnection {
  id: string; user_a: string; user_b: string; status: Connection['status'];
  likes: Record<string, boolean>; favorite: Record<string, boolean>;
  reveal_consent: Record<string, boolean>; compatibility: number;
  curated_on: string | null; created_at: string; connected_at: string | null;
  closed_by: string | null; closed_reason: string | null; closed_gently: boolean;
}

export const toConnection = (r: RawConnection): Connection => ({
  id: r.id,
  userA: r.user_a,
  userB: r.user_b,
  status: r.status,
  likes: r.likes ?? {},
  favorite: r.favorite ?? {},
  revealConsent: r.reveal_consent ?? {},
  compatibility: r.compatibility,
  createdAt: r.created_at,
  connectedAt: r.connected_at ?? undefined,
  closedBy: r.closed_by ?? undefined,
  closedReason: r.closed_reason ?? undefined,
  closedGently: r.closed_gently,
  curatedOn: r.curated_on ?? undefined,
});

export interface RawMessage {
  id: string; connection_id: string; sender_id: string; kind: Message['kind'];
  body: string; image_url: string | null; ritual_level: number | null;
  created_at: string; read_at: string | null;
  mod_level: 'ok' | 'atencao' | 'risco'; mod_categories: string[] | null;
}

export const toMessage = (r: RawMessage): Message => ({
  id: r.id,
  connectionId: r.connection_id,
  senderId: r.sender_id,
  kind: r.kind,
  text: r.body,
  imageData: r.image_url ?? undefined,
  ritualLevel: (r.ritual_level ?? undefined) as Message['ritualLevel'],
  createdAt: r.created_at,
  readAt: r.read_at ?? undefined,
  moderation: r.mod_level === 'ok' ? undefined : {
    level: r.mod_level,
    categories: (r.mod_categories ?? []) as never,
    advice: '',
    source: 'heuristica',
  },
});

// ------------------------------- leitura -----------------------------------

/**
 * Quantas mensagens por conversa vêm no primeiro carregamento. Antes o cliente
 * baixava o histórico inteiro de todas as conversas de uma vez — funciona com
 * doze perfis fictícios e não funciona com uma pessoa que conversa há um ano.
 */
export const PAGINA_MENSAGENS = 40;

/** Termômetro calculado no Postgres, para as conversas que chegam truncadas. */
export interface RemoteHealth extends HealthMetrics {
  connectionId: string;
}

interface RawTermometro {
  connection_id: string; score: number; estagio: number;
  reciprocidade: number; profundidade: number; constancia: number;
  abertura: number; mensagens: number; dias: number;
}

const toHealth = (r: RawTermometro): RemoteHealth => ({
  connectionId: r.connection_id,
  score: r.score,
  reciprocity: r.reciprocidade,
  depth: r.profundidade,
  consistency: r.constancia,
  openness: r.abertura,
  messages: r.mensagens,
  days: r.dias,
});

export interface RemoteSnapshot {
  users: User[];
  connections: Connection[];
  messages: Message[];
  notifications: AppNotification[];
  blocks: Block[];
  reports: Report[];
  moderationQueue: ModerationItem[];
  usage: DailyUsage[];
  /** Termômetro do servidor, por conexão. */
  healths: Record<string, HealthMetrics>;
  /** Conexões cujo histórico completo já está no cliente. */
  fullyLoaded: string[];
}

/**
 * Carrega tudo o que a pessoa logada pode ver. O RLS decide o recorte: perfis
 * ativos e não bloqueados, apenas as conexões e mensagens em que ela participa,
 * e a fila de moderação só para quem é admin.
 *
 * As mensagens vêm paginadas (as últimas PAGINA_MENSAGENS de cada conversa), e
 * por isso o termômetro vem junto, calculado no servidor: sem o histórico
 * inteiro o cliente não teria como contar reciprocidade nem dias de conversa.
 */
export async function loadSnapshot(meId: string): Promise<RemoteSnapshot> {
  const db = requireSupabase();

  const [users, connections, notifications, blocks, reports, moderation, usage, mensagens, termometros] =
    await Promise.all([
      db.from('users').select(SELECT_USER),
      db.from('connections').select('*'),
      db.from('notifications').select('*').order('created_at', { ascending: false }),
      db.from('blocks').select('*'),
      db.from('reports').select('*').order('created_at', { ascending: false }),
      db.from('moderation_queue').select('*').order('created_at', { ascending: false }),
      db.from('daily_usage').select('*').eq('user_id', meId).eq('day', dateKey()),
      db.rpc('mensagens_recentes', { por_conversa: PAGINA_MENSAGENS }),
      db.rpc('termometros'),
    ]);

  const firstError = [users, connections, notifications, blocks, reports, moderation, usage, mensagens, termometros]
    .find((r) => r.error)?.error;
  if (firstError) throw new Error(`Falha ao carregar dados: ${firstError.message}`);

  const conns = (connections.data ?? []).map((c) => toConnection(c as RawConnection));
  const messages = ((mensagens.data ?? []) as RawMessage[]).map(toMessage);

  const healths: Record<string, HealthMetrics> = {};
  for (const t of (termometros.data ?? []) as RawTermometro[]) {
    const { connectionId, ...metricas } = toHealth(t);
    healths[connectionId] = metricas;
  }

  // Uma conversa que devolveu menos que uma página inteira não tem passado
  // escondido: o cliente tem tudo e pode calcular o termômetro sozinho.
  const porConversa = new Map<string, number>();
  for (const m of messages) {
    porConversa.set(m.connectionId, (porConversa.get(m.connectionId) ?? 0) + 1);
  }
  const fullyLoaded = conns
    .filter((c) => (porConversa.get(c.id) ?? 0) < PAGINA_MENSAGENS)
    .map((c) => c.id);

  return {
    users: (users.data ?? []).map((u) => toUser(u as unknown as RawUser)),
    connections: conns,
    messages,
    healths,
    fullyLoaded,
    notifications: (notifications.data ?? []).map((n) => ({
      id: n.id, userId: n.user_id, kind: n.kind, title: n.title,
      body: n.body, link: n.link ?? undefined, read: n.read, createdAt: n.created_at,
    })),
    blocks: (blocks.data ?? []).map((b) => ({
      blockerId: b.blocker_id, blockedId: b.blocked_id, createdAt: b.created_at,
    })),
    reports: (reports.data ?? []).map((r) => ({
      id: r.id, reporterId: r.reporter_id, reportedId: r.reported_id,
      reason: r.reason, description: r.description ?? '', status: r.status,
      evidenceMessageIds: r.evidence_ids ?? [], createdAt: r.created_at,
      resolvedAt: r.resolved_at ?? undefined, adminNote: r.admin_note ?? undefined,
    })),
    moderationQueue: (moderation.data ?? []).map((m) => ({
      id: m.id, messageId: m.message_id, connectionId: m.connection_id,
      authorId: m.author_id, excerpt: m.excerpt, status: m.status,
      createdAt: m.created_at,
      result: { level: m.level, categories: m.categories ?? [], advice: '', source: m.source },
    })),
    usage: (usage.data ?? []).map((u) => ({
      userId: u.user_id, date: u.day, interests: u.interests, aiCalls: u.ai_calls,
    })),
  };
}

/**
 * Busca o pedaço anterior de uma conversa. `antes` é o createdAt da mensagem
 * mais antiga que o cliente já tem.
 *
 * `fim: true` significa que o servidor não tem mais nada para trás — daí em
 * diante o cliente detém o histórico completo e volta a calcular o termômetro
 * localmente, que é o comportamento que reage à mensagem recém-enviada.
 */
export async function loadOlderMessages(
  connectionId: string, antes: string, limite = PAGINA_MENSAGENS,
): Promise<{ messages: Message[]; fim: boolean }> {
  const db = requireSupabase();
  const { data, error } = await db.rpc('mensagens_anteriores', {
    conn: connectionId, antes, limite,
  });
  if (error) throw new Error(`Falha ao carregar o histórico: ${error.message}`);
  const rows = (data ?? []) as RawMessage[];
  return { messages: rows.map(toMessage), fim: rows.length < limite };
}

/** Recalcula no servidor o termômetro de uma conversa só. */
export async function loadHealth(connectionId: string): Promise<HealthMetrics | null> {
  const db = requireSupabase();
  const { data, error } = await db.rpc('termometro_da_conversa', { conn: connectionId });
  if (error) throw new Error(`Falha ao ler o termômetro: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as RawTermometro | undefined;
  if (!row) return null;
  const { connectionId: _ignorado, ...metricas } = toHealth({ ...row, connection_id: connectionId });
  return metricas;
}

// ------------------------------- escrita -----------------------------------

/** Grava o perfil inteiro: users + profiles + preferences + interesses + respostas. */
export async function saveUser(u: User): Promise<void> {
  const db = requireSupabase();

  const { error } = await db.from('users').upsert({
    id: u.id, name: u.name, email: u.email, birth_date: u.birthDate,
    gender: u.gender, city: u.city, state: u.state,
    approx_lat: u.approxLat, approx_lng: u.approxLng,
    photo_url: u.photo ?? null, extra_photos: u.extraPhotos,
    profession: u.profession, bio: u.bio, goal: u.goal, chat_pace: u.chatPace,
    verified: u.verified, reputation: u.reputation, plan: u.plan,
    role: u.role, status: u.status, last_active_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Falha ao salvar o perfil: ${error.message}`);

  const [profile, prefs] = await Promise.all([
    db.from('profiles').upsert({
      user_id: u.id, personality: u.personality, lifestyle: u.lifestyle,
      updated_at: new Date().toISOString(),
    }),
    db.from('preferences').upsert({
      user_id: u.id, seeking: u.preferences.seeking,
      age_min: u.preferences.ageMin, age_max: u.preferences.ageMax,
      max_distance_km: u.preferences.maxDistanceKm,
      goals: u.preferences.goals, min_compatibility: u.preferences.minCompatibility,
    }),
  ]);
  if (profile.error) throw new Error(`Falha ao salvar o perfil: ${profile.error.message}`);
  if (prefs.error) throw new Error(`Falha ao salvar preferências: ${prefs.error.message}`);

  // Interesses e respostas são conjuntos: apaga o que saiu, insere o que ficou.
  await db.from('user_interests').delete().eq('user_id', u.id);
  if (u.interests.length) {
    const { error: e } = await db.from('user_interests')
      .insert(u.interests.map((interest_id) => ({ user_id: u.id, interest_id })));
    if (e) throw new Error(`Falha ao salvar interesses: ${e.message}`);
  }

  await db.from('prompt_answers').delete().eq('user_id', u.id);
  const answers = u.answers.filter((a) => a.answer.trim());
  if (answers.length) {
    const { error: e } = await db.from('prompt_answers').insert(
      answers.map((a) => ({ user_id: u.id, prompt_id: a.promptId, answer: a.answer })),
    );
    if (e) throw new Error(`Falha ao salvar respostas: ${e.message}`);
  }
}

export async function saveConsents(userId: string, consents: Consent[]): Promise<void> {
  if (!consents.length) return;
  const db = requireSupabase();
  const { error } = await db.from('consents').upsert(
    consents.map((c) => ({
      user_id: userId, kind: c.kind, version: c.version, accepted_at: c.acceptedAt,
    })),
    { onConflict: 'user_id,kind,version' },
  );
  if (error) throw new Error(`Falha ao registrar consentimentos: ${error.message}`);
}

export async function saveConnection(c: Connection): Promise<void> {
  const db = requireSupabase();
  const [user_a, user_b] = pairOrder(c.userA, c.userB);
  const { error } = await db.from('connections').upsert({
    id: c.id, user_a, user_b, status: c.status,
    likes: c.likes, favorite: c.favorite, reveal_consent: c.revealConsent,
    compatibility: c.compatibility, curated_on: c.curatedOn ?? null,
    created_at: c.createdAt, connected_at: c.connectedAt ?? null,
    closed_by: c.closedBy ?? null, closed_reason: c.closedReason ?? null,
    closed_gently: !!c.closedGently,
  });
  if (error) throw new Error(`Falha ao salvar a conexão: ${error.message}`);
}

export async function saveMessage(m: Message): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('messages').insert({
    id: m.id, connection_id: m.connectionId, sender_id: m.senderId,
    kind: m.kind, body: m.text, image_url: m.imageData ?? null,
    ritual_level: m.ritualLevel ?? null, created_at: m.createdAt,
    mod_level: m.moderation?.level ?? 'ok',
    mod_categories: m.moderation?.categories ?? [],
  });
  if (error) throw new Error(`Falha ao enviar a mensagem: ${error.message}`);
}

export async function markMessagesRead(connectionId: string, readerId: string): Promise<void> {
  const db = requireSupabase();
  await db.from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('connection_id', connectionId).neq('sender_id', readerId).is('read_at', null);
}

export async function saveReport(r: Report): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('reports').insert({
    id: r.id, reporter_id: r.reporterId, reported_id: r.reportedId,
    reason: r.reason, description: r.description, status: r.status,
    evidence_ids: r.evidenceMessageIds, created_at: r.createdAt,
  });
  if (error) throw new Error(`Falha ao enviar a denúncia: ${error.message}`);
}

export async function setBlock(blockerId: string, blockedId: string, on: boolean): Promise<void> {
  const db = requireSupabase();
  const { error } = on
    ? await db.from('blocks').upsert({ blocker_id: blockerId, blocked_id: blockedId })
    : await db.from('blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  if (error) throw new Error(`Falha ao atualizar o bloqueio: ${error.message}`);
}

export async function bumpUsage(userId: string, field: 'interests' | 'aiCalls'): Promise<void> {
  const db = requireSupabase();
  const column = field === 'interests' ? 'interests' : 'ai_calls';
  const day = dateKey();
  const { data } = await db.from('daily_usage')
    .select('interests, ai_calls').eq('user_id', userId).eq('day', day).maybeSingle();
  const current = (data?.[column as 'interests' | 'ai_calls'] as number | undefined) ?? 0;
  await db.from('daily_usage').upsert({
    user_id: userId, day, [column]: current + 1,
  }, { onConflict: 'user_id,day' });
}

/** LGPD art. 18, VI — a exclusão roda no servidor, dentro de delete_my_account(). */
export async function deleteMyAccount(): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.rpc('delete_my_account');
  if (error) throw new Error(`Falha ao excluir a conta: ${error.message}`);
}

export const backendEnabled = supabaseEnabled;
