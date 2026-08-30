-- ===========================================================================
-- CONEXÃO — schema PostgreSQL / Supabase
-- Espelha 1:1 os tipos de types.ts. Aplique com:
--   supabase db push          (ou cole no SQL Editor do painel)
-- ===========================================================================

create extension if not exists "pgcrypto";
-- postgis não é necessário: a distância roda sobre coordenadas já arredondadas
-- a ~5 km, escala em que o erro do plano equirretangular é irrelevante.

-- --------------------------------------------------------------------------
-- Enums
-- --------------------------------------------------------------------------
create type gender            as enum ('mulher','homem','nao_binario','outro');
create type relationship_goal as enum ('serio','conhecer','amizade','descobrindo');
create type chat_pace         as enum ('poucas_profundas','equilibrado','muitas_rapidas');
create type account_status    as enum ('ativo','suspenso','banido');
create type plan_type         as enum ('free','premium');
create type connection_status as enum ('sugerida','pendente','conectada','recusada','encerrada','bloqueada');
create type message_kind      as enum ('texto','imagem','ritual','sistema');
create type risk_level        as enum ('ok','atencao','risco');
create type report_reason     as enum ('perfil_falso','assedio','conteudo_ofensivo','golpe','sexual_inadequado','spam','menor_de_idade','outro');
create type report_status     as enum ('aberta','em_analise','procedente','improcedente');

-- --------------------------------------------------------------------------
-- users — 1:1 com auth.users. Senhas ficam no Supabase Auth, nunca aqui.
-- --------------------------------------------------------------------------
create table public.users (
  id             uuid primary key references auth.users(id) on delete cascade,
  name           text not null check (char_length(name) between 2 and 80),
  email          text not null unique,
  birth_date     date not null,
  gender         gender not null,
  city           text not null,
  state          char(2) not null,
  -- NUNCA a coordenada exata: arredondada a ~0,05° (≈5 km) antes de gravar.
  approx_lat     numeric(6,3) not null,
  approx_lng     numeric(6,3) not null,
  photo_url      text,
  extra_photos   text[] not null default '{}',
  profession     text default '',
  bio            text default '' check (char_length(bio) <= 400),
  goal           relationship_goal not null,
  chat_pace      chat_pace not null default 'equilibrado',
  verified       boolean not null default false,
  reputation     smallint not null default 70 check (reputation between 0 and 100),
  plan           plan_type not null default 'free',
  role           text not null default 'user' check (role in ('user','admin')),
  status         account_status not null default 'ativo',
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  deleted_at     timestamptz,
  -- Regra de negócio inegociável: 18+.
  constraint maior_de_idade check (birth_date <= (current_date - interval '18 years'))
);
create index on public.users (status, plan);
create index on public.users (approx_lat, approx_lng);

-- profiles — atributos calculados/estendidos, separados para não inchar users
create table public.profiles (
  user_id            uuid primary key references public.users(id) on delete cascade,
  personality        jsonb not null default '{"energia":50,"ritmo":50,"planejamento":50,"afeto":50,"novidade":50}',
  lifestyle          jsonb not null default '{}',
  profile_completion smallint not null default 0,
  updated_at         timestamptz not null default now()
);

-- interests / user_interests
create table public.interests (
  id       text primary key,
  label    text not null,
  emoji    text not null default '',
  category text not null,
  weight   numeric(3,2) not null default 1.0   -- raridade
);

create table public.user_interests (
  user_id     uuid references public.users(id) on delete cascade,
  interest_id text references public.interests(id) on delete cascade,
  primary key (user_id, interest_id)
);
create index on public.user_interests (interest_id);

-- prompts / answers
create table public.prompts (
  id         text primary key,
  label      text not null,
  max_length smallint not null default 220
);

create table public.prompt_answers (
  user_id    uuid references public.users(id) on delete cascade,
  prompt_id  text references public.prompts(id) on delete cascade,
  answer     text not null check (char_length(answer) <= 400),
  updated_at timestamptz not null default now(),
  primary key (user_id, prompt_id)
);

-- preferences — filtros duros da descoberta
create table public.preferences (
  user_id           uuid primary key references public.users(id) on delete cascade,
  seeking           text[] not null default '{todos}',
  age_min           smallint not null default 18 check (age_min >= 18),
  age_max           smallint not null default 99,
  max_distance_km   smallint not null default 50,
  goals             relationship_goal[] not null default '{}',
  min_compatibility smallint not null default 0,
  check (age_min <= age_max)
);

-- consents — versionados, exigência da LGPD (art. 8º, §1º e art. 9º)
create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  kind        text not null,
  version     text not null,
  accepted_at timestamptz not null default now(),
  ip_hash     text,
  unique (user_id, kind, version)
);

-- --------------------------------------------------------------------------
-- connections — sempre com user_a < user_b para garantir unicidade do par
-- --------------------------------------------------------------------------
create table public.connections (
  id                uuid primary key default gen_random_uuid(),
  user_a            uuid not null references public.users(id) on delete cascade,
  user_b            uuid not null references public.users(id) on delete cascade,
  status            connection_status not null default 'pendente',
  likes             jsonb not null default '{}',
  favorite          jsonb not null default '{}',
  reveal_consent    jsonb not null default '{}',
  compatibility     smallint not null default 0,
  curated_on        date,
  created_at        timestamptz not null default now(),
  connected_at      timestamptz,
  closed_by         uuid references public.users(id),
  closed_reason     text,
  closed_gently     boolean not null default false,
  constraint par_ordenado unique (user_a, user_b),
  constraint sem_auto_conexao check (user_a <> user_b),
  constraint ordem_canonica check (user_a < user_b)
);
create index on public.connections (user_a, status);
create index on public.connections (user_b, status);

-- messages
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  sender_id     uuid not null references public.users(id) on delete cascade,
  kind          message_kind not null default 'texto',
  body          text not null default '' check (char_length(body) <= 2000),
  image_url     text,
  ritual_level  smallint check (ritual_level between 1 and 4),
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  mod_level     risk_level not null default 'ok',
  mod_categories text[] not null default '{}'
);
create index on public.messages (connection_id, created_at desc);
create index on public.messages (connection_id) where read_at is null;

-- conversation_health — materializada por trigger/cron, para não recalcular
create table public.conversation_health (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  score         smallint not null default 0,
  reciprocity   smallint not null default 0,
  depth         smallint not null default 0,
  consistency   smallint not null default 0,
  openness      smallint not null default 0,
  reveal        numeric(4,3) not null default 0,
  stage         smallint not null default 0,
  updated_at    timestamptz not null default now()
);

-- blocks / reports / moderation
create table public.blocks (
  blocker_id uuid references public.users(id) on delete cascade,
  blocked_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid references public.users(id) on delete set null,
  reported_id   uuid not null references public.users(id) on delete cascade,
  reason        report_reason not null,
  description   text default '',
  status        report_status not null default 'aberta',
  evidence_ids  uuid[] not null default '{}',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.users(id),
  admin_note    text
);
create index on public.reports (status, created_at desc);

create table public.moderation_queue (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid references public.messages(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete cascade,
  author_id     uuid references public.users(id) on delete cascade,
  excerpt       text not null,
  level         risk_level not null,
  categories    text[] not null default '{}',
  source        text not null default 'heuristica',
  status        text not null default 'pendente' check (status in ('pendente','liberado','removido')),
  created_at    timestamptz not null default now(),
  reviewed_by   uuid references public.users(id),
  reviewed_at   timestamptz
);

-- notifications / subscriptions / usage
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  link       jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, read, created_at desc);

create table public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  plan        plan_type not null,
  status      text not null default 'ativa' check (status in ('ativa','cancelada','expirada')),
  provider    text,               -- 'stripe' | 'mercadopago'
  provider_id text,
  started_at  timestamptz not null default now(),
  expires_at  timestamptz
);
create index on public.subscriptions (user_id, status);

create table public.daily_usage (
  user_id   uuid references public.users(id) on delete cascade,
  day       date not null default current_date,
  interests smallint not null default 0,
  ai_calls  smallint not null default 0,
  primary key (user_id, day)
);

-- --------------------------------------------------------------------------
-- Row Level Security — o coração da segurança. Nada é público por padrão, e
-- NADA é legível pelo papel `anon`: sem conta, não se lê perfil nenhum.
-- --------------------------------------------------------------------------
alter table public.users               enable row level security;
alter table public.profiles            enable row level security;
alter table public.preferences         enable row level security;
alter table public.prompt_answers      enable row level security;
alter table public.user_interests      enable row level security;
alter table public.consents            enable row level security;
alter table public.connections         enable row level security;
alter table public.messages            enable row level security;
alter table public.conversation_health enable row level security;
alter table public.blocks              enable row level security;
alter table public.reports             enable row level security;
alter table public.moderation_queue    enable row level security;
alter table public.notifications       enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.daily_usage         enable row level security;

-- Catálogos são a única leitura pública legítima: não contêm dado de ninguém.
alter table public.interests enable row level security;
alter table public.prompts   enable row level security;
create policy "catálogo de interesses é legível" on public.interests for select using (true);
create policy "catálogo de perguntas é legível"  on public.prompts   for select using (true);

-- --------------------------------------------------------------------------
-- Auxiliares das policies.
-- Ficam no schema `private` de propósito: o PostgREST só expõe os schemas
-- configurados (public), então aqui elas NÃO ganham endpoint /rest/v1/rpc/.
-- Se ficassem em public, qualquer pessoa logada poderia sondar se um UUID
-- existe (perfil_visivel) ou se há bloqueio entre duas pessoas.
-- --------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

create or replace function private.is_blocked_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  );
$$;

-- Um perfil só é visível se estiver ativo, não excluído e sem bloqueio entre as partes.
create or replace function private.perfil_visivel(alvo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = alvo and u.status = 'ativo' and u.deleted_at is null
  ) and not private.is_blocked_with(alvo);
$$;

revoke execute on function private.is_admin()            from public, anon;
revoke execute on function private.is_blocked_with(uuid) from public, anon;
revoke execute on function private.perfil_visivel(uuid)  from public, anon;
grant  execute on function private.is_admin()            to authenticated;
grant  execute on function private.is_blocked_with(uuid) to authenticated;
grant  execute on function private.perfil_visivel(uuid)  to authenticated;

-- --------------------------------------------------------------------------
-- users
-- --------------------------------------------------------------------------
create policy "usuário lê o próprio registro"
  on public.users for select to authenticated
  using (id = auth.uid() or private.is_admin());
create policy "usuário lê perfis visíveis"
  on public.users for select to authenticated
  using (status = 'ativo' and deleted_at is null and not private.is_blocked_with(id));
-- Sem esta policy o cadastro não conclui: o INSERT do próprio registro falha.
create policy "usuário cria o próprio registro"
  on public.users for insert to authenticated with check (id = auth.uid());
create policy "usuário atualiza o próprio registro"
  on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admin atualiza qualquer registro"
  on public.users for update to authenticated using (private.is_admin());

-- --------------------------------------------------------------------------
-- Tabelas 1:1 com o usuário.
-- Atenção: leitura de dado alheio NUNCA é `using (true)` — isso liberaria a
-- base inteira para o papel anônimo, que é raspagem servida de bandeja.
-- --------------------------------------------------------------------------
create policy "dono gerencia o próprio profile"
  on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leitura de profiles de perfis visíveis"
  on public.profiles for select to authenticated using (private.perfil_visivel(user_id));

-- preferences são privadas: ninguém além do dono precisa saber seus filtros.
create policy "dono gerencia preferences"
  on public.preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "dono gerencia as próprias respostas"
  on public.prompt_answers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leitura de respostas de perfis visíveis"
  on public.prompt_answers for select to authenticated using (private.perfil_visivel(user_id));

create policy "dono gerencia os próprios interesses"
  on public.user_interests for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leitura de interesses de perfis visíveis"
  on public.user_interests for select to authenticated using (private.perfil_visivel(user_id));

create policy "dono lê consentimentos"
  on public.consents for select to authenticated
  using (user_id = auth.uid() or private.is_admin());
create policy "dono registra consentimento"
  on public.consents for insert to authenticated with check (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- connections: só os dois lados
-- --------------------------------------------------------------------------
create policy "participantes leem a conexão"
  on public.connections for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid() or private.is_admin());
create policy "participantes criam a conexão"
  on public.connections for insert to authenticated
  with check (user_a = auth.uid() or user_b = auth.uid());
create policy "participantes atualizam a conexão"
  on public.connections for update to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- --------------------------------------------------------------------------
-- messages: só quem participa da conexão. É a regra mais importante do banco.
-- --------------------------------------------------------------------------
create policy "participantes leem mensagens"
  on public.messages for select to authenticated using (
    exists (
      select 1 from public.connections c
      where c.id = connection_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    ) or private.is_admin()
  );
create policy "participante envia mensagem"
  on public.messages for insert to authenticated with check (
    sender_id = auth.uid() and exists (
      select 1 from public.connections c
      where c.id = connection_id
        and c.status = 'conectada'
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );
create policy "destinatário marca como lida"
  on public.messages for update to authenticated using (
    sender_id <> auth.uid() and exists (
      select 1 from public.connections c
      where c.id = connection_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );
-- LGPD: o autor pode apagar o que escreveu.
create policy "autor apaga a própria mensagem"
  on public.messages for delete to authenticated using (sender_id = auth.uid());

create policy "participantes leem o termômetro"
  on public.conversation_health for select to authenticated using (
    exists (
      select 1 from public.connections c
      where c.id = connection_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- --------------------------------------------------------------------------
-- Segurança, moderação e conta
-- --------------------------------------------------------------------------
create policy "dono gerencia bloqueios"
  on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "denunciante cria denúncia"
  on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "denunciante e admin leem denúncia"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid() or private.is_admin());
create policy "admin resolve denúncia"
  on public.reports for update to authenticated using (private.is_admin());

create policy "só admin vê a fila de moderação"
  on public.moderation_queue for select to authenticated using (private.is_admin());
create policy "só admin decide na fila"
  on public.moderation_queue for update to authenticated using (private.is_admin());

create policy "dono lê notificações"
  on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "dono marca notificação como lida"
  on public.notifications for update to authenticated using (user_id = auth.uid());

create policy "dono lê assinatura"
  on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or private.is_admin());

create policy "dono gerencia seu uso diário"
  on public.daily_usage for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- Compatibilidade no banco: a mesma fórmula de services/compatibility.ts.
-- Rodar no servidor evita expor perfis inteiros ao cliente só para ranquear.
-- --------------------------------------------------------------------------
create or replace function public.compatibility_score(a uuid, b uuid)
returns table (score smallint, shared_interests text[])
language plpgsql stable security definer set search_path = public as $$
declare
  w_goal      constant numeric := 0.22;
  w_interests constant numeric := 0.18;
  w_distance  constant numeric := 0.08;
  ua public.users%rowtype; ub public.users%rowtype;
  s_goal numeric; s_int numeric; s_dist numeric;
  shared text[]; total_w numeric; shared_w numeric; km numeric;
begin
  -- A função é SECURITY DEFINER: sem esta guarda, qualquer pessoa logada
  -- poderia pedir a compatibilidade entre dois terceiros quaisquer.
  if auth.uid() is null or (a <> auth.uid() and not private.is_admin()) then
    raise exception 'Só é possível calcular a compatibilidade a partir do próprio perfil.'
      using errcode = '42501';
  end if;
  if not private.perfil_visivel(b) then
    raise exception 'Perfil indisponível.' using errcode = '42501';
  end if;

  select * into ua from public.users where id = a;
  select * into ub from public.users where id = b;
  if ua.id is null or ub.id is null then
    raise exception 'Perfil não encontrado.' using errcode = 'P0002';
  end if;

  s_goal := case
    when ua.goal = ub.goal then 1.0
    when ua.goal = 'serio'  and ub.goal = 'conhecer' then 0.55
    when ua.goal = 'conhecer' and ub.goal = 'descobrindo' then 0.80
    else 0.50 end;

  select array_agg(i.interest_id), coalesce(sum(it.weight), 0)
    into shared, shared_w
  from public.user_interests i
  join public.user_interests j on j.interest_id = i.interest_id and j.user_id = b
  join public.interests it on it.id = i.interest_id
  where i.user_id = a;

  select coalesce(sum(it.weight), 1) into total_w
  from public.interests it
  where it.id in (
    select interest_id from public.user_interests where user_id in (a, b)
  );

  s_int := least(1, sqrt(coalesce(shared_w, 0) / nullif(total_w, 0)) * 1.35);

  km := 111 * sqrt(power(ua.approx_lat - ub.approx_lat, 2) + power(ua.approx_lng - ub.approx_lng, 2));
  s_dist := case when km <= 10 then 1 else greatest(0, 1 - (km - 10) / 60.0) end;

  -- As demais dimensões (personalidade, estilo de vida, ritmo, idade) seguem
  -- a mesma estrutura; ver services/compatibility.ts para os pesos completos.
  return query select
    (round((s_goal * w_goal + s_int * w_interests + s_dist * w_distance)
           / (w_goal + w_interests + w_distance) * 100))::smallint,
    coalesce(shared, '{}');
end;
$$;

-- --------------------------------------------------------------------------
-- LGPD art. 18, VI — eliminação com anonimização do que precisa sobreviver.
-- --------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'É preciso estar autenticado para excluir a conta.'
      using errcode = '42501';
  end if;

  delete from public.messages where sender_id = me;
  delete from public.connections where user_a = me or user_b = me;
  delete from public.notifications where user_id = me;

  -- Denúncias FEITAS pela pessoa perdem o autor; denúncias CONTRA ela
  -- permanecem, por legítimo interesse de proteger outras pessoas.
  update public.reports set reporter_id = null where reporter_id = me;

  update public.users set
    name = 'Conta removida', email = 'removido+' || me || '@conexao.local',
    photo_url = null, extra_photos = '{}', bio = '', profession = '',
    city = '—', approx_lat = 0, approx_lng = 0,
    status = 'banido', deleted_at = now()
  where id = me;
end;
$$;

-- Estas duas SÃO chamadas pelo cliente, e por isso ficam em `public` — mas
-- nunca abertas ao papel anônimo, e ambas checam auth.uid() internamente.
revoke execute on function public.compatibility_score(uuid, uuid) from public, anon;
revoke execute on function public.delete_my_account()             from public, anon;
grant  execute on function public.compatibility_score(uuid, uuid) to authenticated;
grant  execute on function public.delete_my_account()             to authenticated;

-- --------------------------------------------------------------------------
-- Catálogos — espelham data/interests.ts e data/prompts.ts.
-- Idempotente: pode rodar de novo depois de mexer no catálogo do app.
-- --------------------------------------------------------------------------
insert into public.interests (id, label, emoji, category, weight) values
  ('viagens', 'Viagens', '✈️', 'Mundo', 1.0),
  ('trilhas', 'Trilhas', '🥾', 'Mundo', 1.25),
  ('praia', 'Praia', '🏖️', 'Mundo', 1.0),
  ('acampar', 'Acampar', '⛺', 'Mundo', 1.35),
  ('road_trip', 'Road trip', '🚗', 'Mundo', 1.25),
  ('musica', 'Música', '🎵', 'Sons', 0.85),
  ('shows', 'Shows ao vivo', '🎤', 'Sons', 1.1),
  ('vinil', 'Vinil', '💿', 'Sons', 1.4),
  ('instrumento', 'Tocar instrumento', '🎸', 'Sons', 1.35),
  ('samba', 'Samba e pagode', '🥁', 'Sons', 1.2),
  ('mpb', 'MPB', '🎼', 'Sons', 1.2),
  ('gastronomia', 'Gastronomia', '🍝', 'Sabores', 0.95),
  ('cozinhar', 'Cozinhar', '👨‍🍳', 'Sabores', 1.15),
  ('cafe', 'Café', '☕', 'Sabores', 1.0),
  ('vinho', 'Vinho', '🍷', 'Sabores', 1.15),
  ('feira', 'Feira livre', '🥬', 'Sabores', 1.35),
  ('confeitaria', 'Confeitaria', '🧁', 'Sabores', 1.3),
  ('cinema', 'Cinema', '🎬', 'Cultura', 0.85),
  ('series', 'Séries', '📺', 'Cultura', 0.8),
  ('livros', 'Livros', '📚', 'Cultura', 1.05),
  ('teatro', 'Teatro', '🎭', 'Cultura', 1.35),
  ('museus', 'Museus', '🖼️', 'Cultura', 1.25),
  ('poesia', 'Poesia', '✒️', 'Cultura', 1.45),
  ('podcasts', 'Podcasts', '🎧', 'Cultura', 1.0),
  ('corrida', 'Corrida', '🏃', 'Movimento', 1.05),
  ('academia', 'Academia', '🏋️', 'Movimento', 0.9),
  ('yoga', 'Yoga', '🧘', 'Movimento', 1.2),
  ('danca', 'Dança', '💃', 'Movimento', 1.2),
  ('futebol', 'Futebol', '⚽', 'Movimento', 0.9),
  ('surf', 'Surf', '🏄', 'Movimento', 1.4),
  ('ciclismo', 'Ciclismo', '🚴', 'Movimento', 1.2),
  ('escalada', 'Escalada', '🧗', 'Movimento', 1.45),
  ('animais', 'Animais', '🐶', 'Casa', 0.9),
  ('plantas', 'Plantas', '🪴', 'Casa', 1.15),
  ('jogos', 'Jogos', '🎮', 'Casa', 1.0),
  ('boardgames', 'Jogos de tabuleiro', '🎲', 'Casa', 1.35),
  ('marcenaria', 'Fazer com as mãos', '🔨', 'Casa', 1.45),
  ('fotografia', 'Fotografia', '📷', 'Criação', 1.2),
  ('desenho', 'Desenho', '🎨', 'Criação', 1.3),
  ('escrita', 'Escrita', '📝', 'Criação', 1.35),
  ('moda', 'Moda', '👗', 'Criação', 1.15),
  ('ciencia', 'Ciência', '🔬', 'Mente', 1.3),
  ('tecnologia', 'Tecnologia', '💻', 'Mente', 0.95),
  ('filosofia', 'Filosofia', '🧠', 'Mente', 1.45),
  ('historia', 'História', '🏛️', 'Mente', 1.3),
  ('idiomas', 'Idiomas', '🗣️', 'Mente', 1.25),
  ('voluntariado', 'Voluntariado', '🤝', 'Mente', 1.4),
  ('astronomia', 'Astronomia', '🔭', 'Mente', 1.5)
on conflict (id) do update set label = excluded.label, emoji = excluded.emoji, category = excluded.category, weight = excluded.weight;

insert into public.prompts (id, label, max_length) values
  ('encontro_ideal', 'Meu encontro ideal seria...', 220),
  ('adoro_fazer', 'Uma coisa que eu adoro fazer é...', 220),
  ('lugar_conhecer', 'Um lugar que eu gostaria de conhecer...', 220),
  ('relacionamento_significa', 'Para mim, relacionamento significa...', 260),
  ('valorizo', 'O que eu mais valorizo em alguém...', 220),
  ('domingo', 'Meu domingo perfeito tem...', 200),
  ('me_ganha', 'Você me ganha se...', 200),
  ('aprendendo', 'Estou aprendendo a...', 200),
  ('opiniao_impopular', 'Minha opinião impopular é...', 200),
  ('trilha_sonora', 'A trilha sonora da minha semana é...', 160),
  ('orgulho', 'Uma coisa de que tenho orgulho...', 220),
  ('nao_negociavel', 'Meu inegociável é...', 200),
  ('me_faz_rir', 'O que sempre me faz rir...', 180),
  ('daqui_cinco_anos', 'Daqui a cinco anos, eu quero...', 220)
on conflict (id) do update set label = excluded.label, max_length = excluded.max_length;

-- ---------------------------------------------------------------------------
-- Realtime na conversa.
--
-- O Supabase entrega eventos de postgres_changes já filtrados pelo RLS de quem
-- assina. Como a policy de `messages` exige participar da conexão, ninguém
-- recebe evento de conversa alheia — a MESMA regra que protege o SELECT
-- protege o stream, sem precisar de filtro no cliente.
-- ---------------------------------------------------------------------------

-- REPLICA IDENTITY FULL: sem isso o WAL carrega apenas a chave primária nos
-- UPDATE, e o RLS não tem colunas suficientes para decidir quem pode receber
-- o evento. Custa mais WAL por escrita; na escala deste app, vale a correção.
alter table public.messages    replica identity full;
alter table public.connections replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'connections'
  ) then
    alter publication supabase_realtime add table public.connections;
  end if;
end $$;

-- ===========================================================================
-- O VÉU SERVIDO PELO SERVIDOR
--
-- Antes, o navegador recebia a foto original e aplicava blur em CSS. Quem
-- abrisse o inspetor via a original: era mecânica de produto, não proteção.
--
-- Agora cada foto de perfil é uma pirâmide de resoluções, e o banco decide
-- qual nível você pode baixar a partir do estágio REAL da conversa. O nível 0
-- tem 12 pixels de largura — não há detalhe a recuperar, porque o detalhe não
-- está nos bytes.
--
-- Layout: {userId}/perfil/{timestamp}-{nivel}.jpg
--   nivel 0..3 = velado (12, 24, 48, 96 px)  |  'orig' = original
-- ===========================================================================

create or replace function private.limitar(v numeric) returns numeric
language sql immutable as $$ select least(1, greatest(0, v)) $$;

-- Espelha services/conversation.ts, medida por medida.
--
-- As duas implementações foram comparadas com a mesma conversa sintética (14
-- mensagens, 6 dias, 2 rituais) e devolveram exatamente os mesmos oito
-- números: score 58, estágio 2, reciprocidade 100, profundidade 77,
-- constância 94, abertura 40. Ao mexer numa, mexa na outra.
--
-- Por que existem as duas: o cliente calcula para a UI reagir na hora à
-- mensagem que você acabou de mandar; o servidor calcula porque é ele quem
-- abre o véu, e porque com a paginação o cliente deixou de ter o histórico
-- inteiro das conversas longas.
create or replace function private.termometro(conn uuid)
returns table (
  score smallint, estagio smallint,
  reciprocidade smallint, profundidade smallint,
  constancia smallint, abertura smallint,
  mensagens int, dias int
)
language plpgsql stable security definer set search_path = public as $$
declare
  ua uuid; ub uuid;
  n numeric; na numeric; nb numeric;
  media_palavras numeric; perguntas numeric;
  rituais numeric; max_nivel numeric;
  primeira timestamptz; mediana numeric;
  recip numeric; prof numeric; const numeric; abert numeric;
  volume numeric; d numeric; espalha numeric; bruto numeric;
  s smallint;
begin
  select c.user_a, c.user_b into ua, ub from public.connections c where c.id = conn;
  if ua is null then
    return query select 0::smallint, 0::smallint, 0::smallint, 0::smallint,
                        0::smallint, 0::smallint, 0, 1; return;
  end if;

  select
    count(*)::numeric,
    count(*) filter (where m.sender_id = ua)::numeric,
    count(*) filter (where m.sender_id = ub)::numeric,
    coalesce(avg(array_length(regexp_split_to_array(btrim(m.body), '\s+'), 1)), 0)::numeric,
    count(*) filter (where m.body like '%?%')::numeric,
    count(*) filter (where m.kind = 'ritual')::numeric,
    coalesce(max(m.ritual_level), 0)::numeric,
    min(m.created_at)
  into n, na, nb, media_palavras, perguntas, rituais, max_nivel, primeira
  from public.messages m
  where m.connection_id = conn and m.kind <> 'sistema';

  if n = 0 then
    return query select 0::smallint, 0::smallint, 0::smallint, 0::smallint,
                        0::smallint, 0::smallint, 0, 1; return;
  end if;

  -- 1. Reciprocidade
  recip := case when n < 4 then private.limitar(n / 4) * 0.5
                else 1 - abs(na - nb) / n end;

  -- 2. Profundidade
  prof := private.limitar(
    private.limitar(media_palavras / 22) * 0.65 +
    private.limitar((perguntas / n) / 0.3) * 0.35
  );

  -- 3. Constância: mediana do intervalo entre turnos alternados.
  select percentile_cont(0.5) within group (order by x.seg) into mediana
  from (
    select extract(epoch from (t.created_at - lag(t.created_at) over w)) as seg,
           t.sender_id, lag(t.sender_id) over w as anterior
    from public.messages t
    where t.connection_id = conn and t.kind <> 'sistema'
    window w as (order by t.created_at)
  ) x
  where x.anterior is not null and x.sender_id <> x.anterior;

  const := case
    when mediana is null then 0
    when mediana <= 21600 then 1
    when mediana >= 259200 then 0.1
    else private.limitar(1 - (mediana - 21600) / 259200)
  end;

  -- 4. Abertura: rituais respondidos.
  abert := private.limitar(rituais / 6) * 0.6 + private.limitar(max_nivel / 4) * 0.4;

  -- Amortecedores: conversa curta ou concentrada num dia não chega longe.
  volume := private.limitar(log(2, 1 + n) / log(2, 41));
  d := greatest(1, round(extract(epoch from (now() - primeira)) / 86400));
  espalha := private.limitar(d / 5) * 0.35 + 0.65;

  bruto := (recip * 0.28 + prof * 0.28 + const * 0.22 + abert * 0.22) * volume * espalha;
  s := round(private.limitar(bruto) * 100)::smallint;

  return query select
    s,
    (case when s >= 82 then 4 when s >= 62 then 3
          when s >= 40 then 2 when s >= 20 then 1 else 0 end)::smallint,
    round(recip * 100)::smallint, round(prof * 100)::smallint,
    round(const * 100)::smallint, round(abert * 100)::smallint,
    n::int, d::int;
end;
$$;

create or replace function private.nivel_do_arquivo(caminho text)
returns int language sql immutable as $$
  select case
    when caminho ~ '-orig\.jpg$' then 4
    else coalesce((substring(caminho from '-([0-3])\.jpg$'))::int, 0)
  end;
$$;

create or replace function private.nivel_permitido(dono uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then -1
    when dono = auth.uid() then 4
    else coalesce((
      select max(case
        when (c.reveal_consent ->> auth.uid()::text) = 'true'
         and (c.reveal_consent ->> dono::text) = 'true' then 4
        else (select t.estagio from private.termometro(c.id) t)
      end)
      from public.connections c
      where c.status = 'conectada'
        and ((c.user_a = auth.uid() and c.user_b = dono)
          or (c.user_b = auth.uid() and c.user_a = dono))
    ), 0)
  end;
$$;

revoke execute on function private.limitar(numeric)       from public, anon;
revoke execute on function private.termometro(uuid)       from public, anon;
revoke execute on function private.nivel_do_arquivo(text) from public, anon;
revoke execute on function private.nivel_permitido(uuid)  from public, anon;
grant  execute on function private.termometro(uuid)       to authenticated;
grant  execute on function private.nivel_permitido(uuid)  to authenticated;
-- ATENÇÃO: este grant é obrigatório. A política de leitura abaixo avalia
-- nivel_do_arquivo(name) ANTES de nivel_permitido(...), e sem ele toda
-- leitura de foto morre em "permission denied for function
-- nivel_do_arquivo" — inclusive a da própria pessoa. O erro não aparece na
-- tela: resolveImage() desce de nível quando a assinatura falha e acaba no
-- retrato generativo, então o véu PARECE funcionar e nenhuma foto real
-- jamais é exibida.
grant  execute on function private.nivel_do_arquivo(text) to authenticated;

-- --------------------------------------------------------------------------
-- Políticas do bucket `midia`
--
-- LEITURA: o nível pedido tem de caber no que a conversa autoriza.
-- ESCRITA: o cliente só entrega o ORIGINAL. Os níveis velados são gravados
--          exclusivamente pela Edge Function `velar`, que usa service_role e
--          por isso não passa por estas políticas. Sem essa restrição, quem
--          sobe a foto escolheria o conteúdo do próprio borrão e poderia se
--          revelar antes da hora para todo mundo.
-- --------------------------------------------------------------------------

drop policy if exists "autenticado lê mídia" on storage.objects;
drop policy if exists "dono envia na própria pasta" on storage.objects;
drop policy if exists "dono atualiza a própria pasta" on storage.objects;
drop policy if exists "dono envia só o original ou imagem de conversa" on storage.objects;
drop policy if exists "dono atualiza só o que ele mesmo pode enviar" on storage.objects;
drop policy if exists "dono apaga a própria pasta" on storage.objects;
drop policy if exists "foto de perfil respeita o véu" on storage.objects;
drop policy if exists "imagem de conversa entre conectados" on storage.objects;

create policy "foto de perfil respeita o véu"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'midia'
    and (storage.foldername(name))[2] = 'perfil'
    and private.nivel_do_arquivo(name)
        <= private.nivel_permitido(((storage.foldername(name))[1])::uuid)
  );

-- Imagens trocadas na conversa não passam pelo véu: foram enviadas de
-- propósito. Mas só quem já está conectado com quem enviou as vê.
create policy "imagem de conversa entre conectados"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'midia'
    and (storage.foldername(name))[2] = 'conversa'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.connections c
        where c.status = 'conectada'
          and ((c.user_a = auth.uid() and c.user_b::text = (storage.foldername(name))[1])
            or (c.user_b = auth.uid() and c.user_a::text = (storage.foldername(name))[1]))
      )
    )
  );

create policy "dono envia só o original ou imagem de conversa"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      ((storage.foldername(name))[2] = 'perfil' and name ~ '-orig\.jpg$')
      or ((storage.foldername(name))[2] = 'conversa' and name ~ '\.jpg$')
    )
  );

create policy "dono atualiza só o que ele mesmo pode enviar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      ((storage.foldername(name))[2] = 'perfil' and name ~ '-orig\.jpg$')
      or ((storage.foldername(name))[2] = 'conversa' and name ~ '\.jpg$')
    )
  );

-- Apagar continua liberado na própria pasta: remover um nível velado só
-- esconde mais, nunca revela — e trocar de foto precisa limpar a pirâmide.
create policy "dono apaga a própria pasta"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'midia'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ===========================================================================
-- PAGINAÇÃO DE MENSAGENS
--
-- O cliente baixava o histórico inteiro de todas as conversas de uma vez.
-- Funciona com doze perfis fictícios; não funciona com alguém que conversa há
-- um ano. Agora vêm as últimas 40 de cada conversa, e o resto sob demanda.
--
-- A consequência não é óbvia: sem o histórico completo, o cliente NÃO pode
-- mais calcular o termômetro sozinho — contaria menos mensagens e menos dias,
-- e o véu FECHARIA. Numa conversa real de 14 mensagens, calcular só sobre as
-- 5 últimas dá score 23 em vez de 58: o retrato voltaria de 71% para 28%
-- revelado. Por isso `termometros()` vem junto no primeiro carregamento.
-- ===========================================================================

create or replace function public.mensagens_recentes(por_conversa int default 40)
returns setof public.messages
language sql stable security definer set search_path = public as $$
  select m.id, m.connection_id, m.sender_id, m.kind, m.body, m.image_url,
         m.ritual_level, m.created_at, m.read_at, m.mod_level, m.mod_categories
  from (
    select mm.*,
           row_number() over (partition by mm.connection_id order by mm.created_at desc) as rn
    from public.messages mm
    join public.connections c on c.id = mm.connection_id
    where c.user_a = auth.uid() or c.user_b = auth.uid()
  ) m
  where m.rn <= least(greatest(coalesce(por_conversa, 40), 1), 200)
  order by m.created_at;
$$;

create or replace function public.mensagens_anteriores(
  conn uuid, antes timestamptz, limite int default 40
) returns setof public.messages
language sql stable security definer set search_path = public as $$
  select m.id, m.connection_id, m.sender_id, m.kind, m.body, m.image_url,
         m.ritual_level, m.created_at, m.read_at, m.mod_level, m.mod_categories
  from public.messages m
  join public.connections c on c.id = m.connection_id
  where m.connection_id = conn
    and m.created_at < antes
    and (c.user_a = auth.uid() or c.user_b = auth.uid())
  order by m.created_at desc
  limit least(greatest(coalesce(limite, 40), 1), 200);
$$;

-- Estas funções são SECURITY DEFINER (o RLS de messages não se aplica dentro
-- delas), então a checagem de participação está escrita à mão em cada uma.
create or replace function public.termometros()
returns table (
  connection_id uuid, score smallint, estagio smallint,
  reciprocidade smallint, profundidade smallint,
  constancia smallint, abertura smallint, mensagens int, dias int
)
language sql stable security definer set search_path = public as $$
  select c.id, t.score, t.estagio, t.reciprocidade, t.profundidade,
         t.constancia, t.abertura, t.mensagens, t.dias
  from public.connections c
  cross join lateral private.termometro(c.id) t
  where c.user_a = auth.uid() or c.user_b = auth.uid();
$$;

create or replace function public.termometro_da_conversa(conn uuid)
returns table (
  score smallint, estagio smallint,
  reciprocidade smallint, profundidade smallint,
  constancia smallint, abertura smallint, mensagens int, dias int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.connections c
    where c.id = conn
      and (c.user_a = auth.uid() or c.user_b = auth.uid() or private.is_admin())
  ) then
    raise exception 'Conversa indisponível.' using errcode = '42501';
  end if;
  return query select * from private.termometro(conn);
end;
$$;

revoke execute on function public.mensagens_recentes(int)                    from public, anon;
revoke execute on function public.mensagens_anteriores(uuid, timestamptz, int) from public, anon;
revoke execute on function public.termometros()                              from public, anon;
revoke execute on function public.termometro_da_conversa(uuid)               from public, anon;
grant  execute on function public.mensagens_recentes(int)                    to authenticated;
grant  execute on function public.mensagens_anteriores(uuid, timestamptz, int) to authenticated;
grant  execute on function public.termometros()                              to authenticated;
grant  execute on function public.termometro_da_conversa(uuid)               to authenticated;

-- ===========================================================================
-- COTA DE IA IMPOSTA NO SERVIDOR
--
-- Antes só o cliente contava as chamadas, e quem tivesse conta podia ignorar
-- o limite. Agora quem conta é o banco, dentro da Edge Function `copiloto`.
-- A moderação é isenta: é proteção, não conveniência, e não pode parar de
-- funcionar porque as sugestões do dia acabaram.
-- ===========================================================================

create or replace function public.consumir_cota_ia()
returns table (permitido boolean, usadas int, limite int)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  plano plan_type;
  teto int;
  atual int;
begin
  if me is null then
    raise exception 'É preciso estar autenticado.' using errcode = '42501';
  end if;

  select u.plan into plano from public.users u where u.id = me;
  teto := case when plano = 'premium' then 100 else 8 end;

  insert into public.daily_usage (user_id, day, interests, ai_calls)
  values (me, current_date, 0, 0)
  on conflict (user_id, day) do nothing;

  -- `for update` serializa duas chamadas simultâneas da mesma pessoa; sem
  -- isso dois pedidos no mesmo instante gastariam uma cota só.
  select d.ai_calls into atual
  from public.daily_usage d
  where d.user_id = me and d.day = current_date
  for update;

  if atual >= teto then
    return query select false, atual, teto; return;
  end if;

  update public.daily_usage d set ai_calls = d.ai_calls + 1
  where d.user_id = me and d.day = current_date;

  return query select true, atual + 1, teto;
end;
$$;

revoke execute on function public.consumir_cota_ia() from public, anon;
grant  execute on function public.consumir_cota_ia() to authenticated;

-- ===========================================================================
-- CANAL PRIVADO DE "DIGITANDO…"
--
-- O aviso de digitação é Broadcast, não tabela: é efêmero e não merece uma
-- linha no banco. Mas o canal precisa ser privado, senão qualquer pessoa
-- autenticada poderia escutar `conversa:<id>` alheia e saber quando os dois
-- estão conversando — metadado sobre gente real.
-- ===========================================================================

alter table realtime.messages enable row level security;

drop policy if exists "participantes escutam o canal da conversa" on realtime.messages;
drop policy if exists "participantes falam no canal da conversa" on realtime.messages;

create policy "participantes escutam o canal da conversa"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'conversa:%'
    and exists (
      select 1 from public.connections c
      where c.id = (split_part(realtime.topic(), ':', 2))::uuid
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "participantes falam no canal da conversa"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'conversa:%'
    and exists (
      select 1 from public.connections c
      where c.id = (split_part(realtime.topic(), ':', 2))::uuid
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );


-- ===========================================================================
-- COLUNAS PRIVILEGIADAS: O RLS PROTEGE LINHAS, NÃO COLUNAS
--
-- A política "usuário atualiza o próprio registro" é `id = auth.uid()`. Ela
-- impede mexer no cadastro alheio — e deixa a pessoa mudar QUALQUER coluna do
-- próprio, inclusive `role`. Medido antes desta correção:
--
--   mexer no cadastro de OUTRA pessoa ......... bloqueado
--   no PRÓPRIO: plano, papel, selo, reputação . conseguiu as quatro
--   já como admin, banir qualquer pessoa ...... conseguiu
--
-- Ou seja: uma requisição do console do navegador bastava para virar
-- administradora e, daí, dominar a plataforma. Política não resolve isso,
-- porque RLS não tem granularidade de coluna. Resolve com gatilho.
--
-- Ele reverte em silêncio em vez de recusar, de propósito: `saveUser` manda a
-- linha inteira a cada salvamento de perfil, e recusar quebraria toda edição
-- legítima. O cliente pode mandar o que quiser; o banco ignora a parte que não
-- é dele.
-- ===========================================================================

create or replace function private.campos_privilegiados()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Porta do servidor, ligada só de dentro das nossas rotinas. O PostgREST
  -- nunca executa set_config a mando de quem chama, então o cliente não a liga.
  if coalesce(current_setting('conexao.rotina_do_servidor', true), '') = 'on' then
    return new;
  end if;

  -- `auth.role()` vem de request.jwt.claims, que o PostgREST preenche do JWT já
  -- verificado — não dá para forjar sem o segredo do projeto. Note que
  -- `current_user` NÃO serve aqui: dentro de uma função security definer ele é
  -- o dono da função, não quem chamou.
  --   'authenticated' -> pessoa comum, congela
  --   'service_role'  -> Edge Function / webhook, passa
  --   null            -> acesso direto ao banco (editor SQL, migração), passa
  if auth.role() is distinct from 'authenticated' then return new; end if;
  if private.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    -- Cadastro nasce sempre igual, não importa o que o cliente mandou.
    new.role       := 'user';
    new.plan       := 'free';
    new.verified   := false;
    new.reputation := 70;
    new.status     := 'ativo';
    new.deleted_at := null;
    -- O e-mail é o do Supabase Auth. Sem isto dava para exibir no perfil um
    -- e-mail que não é o seu.
    new.email := coalesce((select au.email from auth.users au where au.id = new.id), new.email);
  else
    new.role       := old.role;
    new.plan       := old.plan;
    new.verified   := old.verified;
    new.reputation := old.reputation;
    new.status     := old.status;
    new.email      := old.email;
    new.deleted_at := old.deleted_at;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

revoke execute on function private.campos_privilegiados() from public, anon, authenticated;

drop trigger if exists campos_privilegiados on public.users;
create trigger campos_privilegiados
  before insert or update on public.users
  for each row execute function private.campos_privilegiados();

-- ---------------------------------------------------------------------------
-- O caminho legítimo da reputação.
--
-- Ela era calculada e gravada pelo cliente ao encerrar uma conversa. Com a
-- coluna congelada, precisa de uma porta — e a porta faz a conta ela mesma,
-- sobre a contagem real de mensagens, em vez de aceitar o número que o
-- navegador afirma.
-- ---------------------------------------------------------------------------

create or replace function public.encerrar_conversa(conn uuid, gentilmente boolean)
returns table (reputacao smallint, delta smallint)
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  msgs int; d smallint; nova smallint;
begin
  if me is null then
    raise exception 'É preciso estar autenticado.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.connections c
    where c.id = conn and (c.user_a = me or c.user_b = me)
  ) then
    raise exception 'Conversa indisponível.' using errcode = '42501';
  end if;

  select t.mensagens into msgs from private.termometro(conn) t;

  -- Espelha reputationDelta() em services/conversation.ts: quem se despede
  -- ganha, quem some perde, e conversa longa pesa mais que conversa curta.
  d := case
    when gentilmente then case when msgs >= 6 then 3 else 1 end
    else case when msgs >= 6 then -4 else -1 end
  end;

  update public.connections set
    status = 'encerrada', closed_by = me, closed_gently = gentilmente,
    closed_reason = case when gentilmente then 'despedida' else 'sem_aviso' end
  where id = conn;

  perform set_config('conexao.rotina_do_servidor', 'on', true);
  update public.users u
     set reputation = greatest(0, least(100, u.reputation + d))
   where u.id = me
  returning u.reputation into nova;
  perform set_config('conexao.rotina_do_servidor', 'off', true);

  return query select nova, d;
end;
$$;

revoke execute on function public.encerrar_conversa(uuid, boolean) from public, anon;
grant  execute on function public.encerrar_conversa(uuid, boolean) to authenticated;
