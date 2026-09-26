import type {
  AppNotification, Block, Connection, Consent, DailyUsage, Message,
  ModerationItem, Report, Subscription, User,
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

/**
 * As colunas de perfil que valem para os dois caminhos de leitura.
 *
 * ⚠️  UMA LISTA, DUAS FONTES — e foi exatamente isso que derrubou o app em
 * 25/09/2026. Estas colunas são pedidas tanto à TABELA `public.users` quanto à
 * VIEW `perfis_do_mercado`. A migração 012 recriou a view e deixou de fora
 * `bio`, `extra_photos` e `plan`, que continuavam nesta lista. O PostgREST
 * respondeu `42703 — column "bio" does not exist`, `loadSnapshot` levantou
 * exceção, e o app parou de abrir. Para todo mundo.
 *
 * O compilador não pega isso: é uma string que só o servidor interpreta. Quem
 * pega é `tests/colunas-do-cracha.test.ts`, que compara esta lista com a
 * definição da view no arquivo de migração. Se você acrescentar uma coluna
 * aqui, acrescente na view — ou o teste quebra antes do deploy.
 */
const CAMPOS_COMUNS = `
  city, state, photo_url, extra_photos, profession, bio,
  verified, reputation, plan, atende_remoto, anos_experiencia
`;

/**
 * O PRÓPRIO registro, direto de `public.users`. Vem completo — e-mail,
 * coordenadas e TELEFONE são da própria pessoa, e ela tem todo o direito de
 * recebê-los. `consents` também só existe aqui: o RLS dele é
 * `user_id = auth.uid()`, então nunca viria de outra pessoa mesmo.
 */
const SELECT_EU = `
  id, name, email, approx_lat, approx_lng, role, status, telefone,
  created_at, last_active_at,
  ${CAMPOS_COMUNS},
  consents ( kind, version, accepted_at )
`;

/**
 * TERCEIROS, pela view `perfis_do_mercado`.
 *
 * A view é a correção do vazamento confirmado em 03/09/2026: o RLS protege
 * linhas, não colunas, então ler `users` direto entregava e-mail, coordenadas
 * e papel de todas as contas ativas. Aqui sai só o crachá — e, desde o pivô,
 * SEM TELEFONE: ele só é revelado com proposta aceita, pela função
 * `contato_do_negocio`. Ver 009 e 012.
 */
const SELECT_OUTROS = `
  id, name, ${CAMPOS_COMUNS}
`;

/** O que os dois caminhos de leitura têm em comum. */
interface RawComum {
  id: string; name: string;
  city: string; state: string;
  photo_url: string | null; extra_photos: string[] | null;
  profession: string | null; bio: string | null;
  verified: boolean; reputation: number; plan: User['plan'];
  atende_remoto: boolean | null; anos_experiencia: number | null;
}

/** O próprio registro, de `public.users`. */
interface RawEu extends RawComum {
  email: string; role: User['role']; status: User['status'];
  telefone: string | null;
  created_at: string; last_active_at: string;
  approx_lat: number | string; approx_lng: number | string;
  consents: { kind: string; version: string; accepted_at: string }[] | null;
}

/**
 * Terceiros, da view do crachá.
 *
 * A view não carrega `status` (só devolve conta ativa, então a coluna seria
 * sempre a mesma) nem as datas. Os valores abaixo refletem isso: quem está na
 * view está ativo, por construção.
 */
type RawOutro = RawComum;

/** O miolo compartilhado. Nada aqui é dado de contato nem de localização. */
function baseUser(r: RawComum): User {
  return {
    id: r.id,
    name: r.name,
    // A senha vive no Supabase Auth. Este campo existe só para o modo demo.
    passwordHash: '',
    city: r.city,
    state: r.state,
    photo: r.photo_url ?? undefined,
    extraPhotos: r.extra_photos ?? [],
    profession: r.profession ?? '',
    bio: r.bio ?? '',
    // As especialidades vivem em tabela à parte e são carregadas em bloco,
    // para todo mundo de uma vez. Ver `carregarEspecialidades`.
    especialidades: [],
    atendeRemoto: r.atende_remoto ?? true,
    anosExperiencia: r.anos_experiencia ?? undefined,
    consents: [],
    verified: r.verified,
    reputation: r.reputation,
    plan: r.plan,
    status: 'ativo',
    createdAt: new Date(0).toISOString(),
    lastActiveAt: new Date(0).toISOString(),
  };
}

/** O próprio registro: completo, porque o dado é da própria pessoa. */
function toEu(r: RawEu): User {
  return {
    ...baseUser(r),
    email: r.email,
    telefone: r.telefone ?? undefined,
    approxLat: Number(r.approx_lat),
    approxLng: Number(r.approx_lng),
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
    consents: (r.consents ?? []).map((c) => ({
      kind: c.kind as Consent['kind'], version: c.version, acceptedAt: c.accepted_at,
    })),
  };
}

/** Terceiros: sem e-mail, sem coordenadas, sem papel e sem telefone. */
function toOutro(r: RawOutro): User {
  return baseUser(r);
}

/**
 * As especialidades de um conjunto de pessoas, numa consulta só.
 *
 * Fica fora do `select` do perfil de propósito: são muitas linhas por pessoa,
 * e o PostgREST as devolveria aninhadas em cada perfil, repetindo o mesmo
 * conjunto em toda busca. Aqui vêm uma vez e são distribuídas.
 */
export async function carregarEspecialidades(ids: string[]): Promise<Map<string, string[]>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const mapa = new Map<string, string[]>();
  if (unicos.length === 0) return mapa;

  const { data, error } = await requireSupabase()
    .from('profissionais_categorias')
    .select('user_id, categoria_id')
    .in('user_id', unicos);
  if (error) return mapa;

  for (const linha of data ?? []) {
    const atual = mapa.get(linha.user_id) ?? [];
    atual.push(linha.categoria_id);
    mapa.set(linha.user_id, atual);
  }
  return mapa;
}

/**
 * Trocar as especialidades de alguém pelas que ela escolheu agora.
 *
 * Apaga e reinsere em vez de calcular a diferença: são no máximo 5 linhas, a
 * RLS já garante que só o dono mexe nas próprias, e um `delete` seguido de
 * `insert` não tem o caso de borda que um diff mal feito tem.
 */
export async function salvarEspecialidades(userId: string, categorias: string[]): Promise<void> {
  const db = requireSupabase();
  const { error: erroApagando } = await db
    .from('profissionais_categorias').delete().eq('user_id', userId);
  if (erroApagando) throw new Error(`Não foi possível salvar as áreas: ${erroApagando.message}`);

  const escolhidas = [...new Set(categorias)].slice(0, 5);
  if (escolhidas.length === 0) return;

  const { error } = await db.from('profissionais_categorias')
    .insert(escolhidas.map((categoria_id) => ({ user_id: userId, categoria_id })));
  if (error) throw new Error(`Não foi possível salvar as áreas: ${error.message}`);
}

/**
 * O telefone do outro lado de uma proposta ACEITA.
 *
 * É o único caminho do navegador até `users.telefone`, e quem decide se ele
 * responde é o banco: a função exige proposta aceita e que quem pergunta seja
 * uma das duas partes. Ver 012_perfil_profissional.sql.
 */
export async function contatoDoNegocio(
  propostaId: string,
): Promise<{ pessoaId: string; nome: string; telefone?: string } | null> {
  const { data, error } = await requireSupabase()
    .rpc('contato_do_negocio', { proposta: propostaId });
  if (error || !data || data.length === 0) return null;
  const c = data[0] as { pessoa_id: string; nome: string; telefone: string | null };
  return { pessoaId: c.pessoa_id, nome: c.nome, telefone: c.telefone ?? undefined };
}

export interface RawConnection {
  id: string; user_a: string; user_b: string; status: Connection['status'];
  likes: Record<string, boolean>; favorite: Record<string, boolean>;
  created_at: string; connected_at: string | null;
  closed_by: string | null; closed_reason: string | null; closed_gently: boolean;
}

export const toConnection = (r: RawConnection): Connection => ({
  id: r.id,
  userA: r.user_a,
  userB: r.user_b,
  status: r.status,
  likes: r.likes ?? {},
  favorite: r.favorite ?? {},
  createdAt: r.created_at,
  connectedAt: r.connected_at ?? undefined,
  closedBy: r.closed_by ?? undefined,
  closedReason: r.closed_reason ?? undefined,
  closedGently: r.closed_gently,
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
  /**
   * A assinatura da própria pessoa, quando existe. O RLS já limita a leitura
   * ao dono — a política "dono lê assinatura" existe desde o começo e nunca
   * tinha sido usada. Passou a ser porque a cortesia de lançamento precisa de
   * uma data para mostrar na tela: dizer "você é premium" sem dizer até
   * quando seria a mesma coisa que não dizer nada.
   */
  subscription?: Subscription;
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

  const [eu, outros, connections, notifications, blocks, reports, moderation, usage, mensagens, termometros, assinatura] =
    await Promise.all([
      // Duas leituras em vez de uma. O próprio registro vem completo de
      // `users`; todo o resto vem da view do crachá, que não carrega e-mail,
      // coordenada nem TELEFONE. Ver 009 e 012.
      db.from('users').select(SELECT_EU).eq('id', meId).maybeSingle(),
      db.from('perfis_do_mercado').select(SELECT_OUTROS),
      db.from('connections').select('*'),
      db.from('notifications').select('*').order('created_at', { ascending: false }),
      db.from('blocks').select('*'),
      db.from('reports').select('*').order('created_at', { ascending: false }),
      db.from('moderation_queue').select('*').order('created_at', { ascending: false }),
      db.from('daily_usage').select('*').eq('user_id', meId).eq('day', dateKey()),
      db.rpc('mensagens_recentes', { por_conversa: PAGINA_MENSAGENS }),
      db.rpc('termometros'),
      // `maybeSingle` e não `single`: quem está no plano gratuito não tem
      // linha nenhuma, e isso é o normal, não um erro.
      db.from('subscriptions').select('*')
        .eq('user_id', meId).eq('status', 'ativa')
        .order('expires_at', { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle(),
    ]);

  const firstError = [eu, outros, connections, notifications, blocks, reports, moderation, usage, mensagens, termometros, assinatura]
    .find((r) => r.error)?.error;
  if (firstError) throw new Error(`Falha ao carregar dados: ${firstError.message}`);

  const conns = (connections.data ?? []).map((c) => toConnection(c as RawConnection));

  // As áreas de atuação de todo mundo, numa consulta só. Vêm depois porque
  // dependem da lista de ids que as duas leituras acima acabaram de trazer.
  const pessoas: User[] = [
    ...(eu.data ? [toEu(eu.data as unknown as RawEu)] : []),
    ...((outros.data ?? []) as unknown as RawOutro[]).map(toOutro),
  ];
  const areas = await carregarEspecialidades(pessoas.map((p) => p.id));
  const users = pessoas.map((p) => ({ ...p, especialidades: areas.get(p.id) ?? [] }));
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
    // O próprio registro primeiro: várias telas assumem que ele está na lista.
    // Sem ele, `me` fica indefinido e o app trata como "sessão sem perfil".
    users,
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
      userId: u.user_id, date: u.day, contatos: u.interests, aiCalls: u.ai_calls,
    })),
    subscription: assinatura.data
      ? {
        id: assinatura.data.id,
        userId: assinatura.data.user_id,
        plan: assinatura.data.plan,
        status: assinatura.data.status,
        provider: assinatura.data.provider ?? undefined,
        startedAt: assinatura.data.started_at,
        expiresAt: assinatura.data.expires_at ?? undefined,
      }
      : undefined,
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

/**
 * Grava o perfil.
 *
 * Ficou curto porque o perfil encurtou: saíram `profiles` (bússola e estilo de
 * vida), `preferences` (quem você quer conhecer), `user_interests` e
 * `prompt_answers`. As áreas de atuação vão por `salvarEspecialidades`, que é
 * chamada à parte — ela escreve noutra tabela e pode falhar sozinha, e juntar
 * as duas aqui esconderia qual das duas falhou.
 */
export async function saveUser(u: User): Promise<void> {
  const db = requireSupabase();

  const { error } = await db.from('users').upsert({
    id: u.id, name: u.name, email: u.email,
    city: u.city, state: u.state,
    approx_lat: u.approxLat, approx_lng: u.approxLng,
    photo_url: u.photo ?? null, extra_photos: u.extraPhotos,
    profession: u.profession, bio: u.bio,
    telefone: u.telefone?.trim() || null,
    atende_remoto: u.atendeRemoto,
    anos_experiencia: u.anosExperiencia ?? null,
    verified: u.verified, reputation: u.reputation, plan: u.plan,
    role: u.role, status: u.status, last_active_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Falha ao salvar o perfil: ${error.message}`);
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
    likes: c.likes, favorite: c.favorite,
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

/**
 * `contatos` era `interests`, e a COLUNA no banco ainda se chama assim — a
 * renomeação vai junto com a limpeza da 013. Este é o único lugar do cliente
 * que conhece o nome antigo, e é de propósito.
 */
export async function bumpUsage(userId: string, field: 'contatos' | 'aiCalls'): Promise<void> {
  const db = requireSupabase();
  const column = field === 'contatos' ? 'interests' : 'ai_calls';
  const day = dateKey();
  const { data } = await db.from('daily_usage')
    .select('interests, ai_calls').eq('user_id', userId).eq('day', day).maybeSingle();
  const current = (data?.[column as 'interests' | 'ai_calls'] as number | undefined) ?? 0;
  await db.from('daily_usage').upsert({
    user_id: userId, day, [column]: current + 1,
  }, { onConflict: 'user_id,day' });
}

/**
 * Encerra a conversa e ajusta a reputação — tudo no servidor.
 *
 * A reputação deixou de ser gravável pelo cliente (ver o gatilho
 * `campos_privilegiados` em docs/SUPABASE.sql), senão bastava um PATCH para
 * ficar com 100. Aqui o servidor conta as mensagens reais e aplica a regra.
 */
export async function closeConversation(
  connectionId: string, gently: boolean,
): Promise<{ reputation: number; delta: number }> {
  const db = requireSupabase();
  const { data, error } = await db.rpc('encerrar_conversa', {
    conn: connectionId, gentilmente: gently,
  });
  if (error) throw new Error(`Falha ao encerrar a conversa: ${error.message}`);
  const linha = (Array.isArray(data) ? data[0] : data) as { reputacao: number; delta: number };
  return { reputation: linha.reputacao, delta: linha.delta };
}

/** LGPD art. 18, VI — a exclusão roda no servidor, dentro de delete_my_account(). */
export async function deleteMyAccount(): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.rpc('delete_my_account');
  if (error) throw new Error(`Falha ao excluir a conta: ${error.message}`);
}

export const backendEnabled = supabaseEnabled;
