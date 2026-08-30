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
