-- ---------------------------------------------------------------------------
-- 008 — O mercado: anúncios e propostas
--
-- Primeira migração do QICONEXÃO profissional. O produto deixa de aproximar
-- pessoas por afinidade e passa a aproximá-las por TRABALHO: alguém publica o
-- que precisa, profissionais respondem com proposta, e a conversa nasce dali.
--
-- ESTA MIGRAÇÃO É ADITIVA DE PROPÓSITO.
--
-- Nada do que existe é apagado aqui. O app que está no ar continua a
-- funcionar exatamente como antes enquanto as telas novas não ficam prontas —
-- e só quando elas entrarem é que o que é de relacionamento sai, noutra
-- migração. Derrubar tabelas que o cliente publicado ainda lê quebraria o
-- site no mesmo minuto.
--
-- AS DUAS TABELAS CENTRAIS
--
--   anuncios  — o que alguém precisa que seja feito
--   propostas — quem se oferece para fazer, por quanto e em quanto tempo
--
-- E uma regra que decide a confiança do mercado inteiro: cada profissional vê
-- apenas a PRÓPRIA proposta. Quem publicou o anúncio vê todas. Proposta é
-- informação competitiva — deixá-la à vista faria todo mundo copiar o preço
-- de quem chegou primeiro.
-- ---------------------------------------------------------------------------

-- --------------------------------- tipos -----------------------------------

do $$ begin
  create type modalidade_trabalho as enum ('remoto', 'presencial', 'hibrido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_orcamento as enum ('fechado', 'por_hora', 'a_combinar');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_anuncio as enum ('rascunho', 'aberto', 'fechado', 'concluido', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_proposta as enum ('enviada', 'aceita', 'recusada', 'retirada');
exception when duplicate_object then null; end $$;

-- ------------------------------- categorias --------------------------------
--
-- Tabela, e não enum: a lista vai mudar conforme o mercado responder, e mudar
-- um enum no Postgres é bem mais caro do que mudar uma linha.
-- ---------------------------------------------------------------------------

create table if not exists public.categorias (
  id      text primary key,          -- slug estável, usado na URL e no filtro
  nome    text not null,
  grupo   text not null,             -- agrupa na tela de busca
  ordem   smallint not null default 0,
  ativa   boolean not null default true
);

alter table public.categorias enable row level security;

drop policy if exists "categorias são públicas" on public.categorias;
create policy "categorias são públicas"
  on public.categorias for select
  using (ativa);

comment on table public.categorias is
  'Taxonomia dos anúncios. Pública para leitura; só a administração escreve, pelo painel do Supabase.';

-- ---------------------------- a busca, sem acento --------------------------
--
-- Medido: um anúncio com "construção civil" NÃO era encontrado por quem
-- procurasse "construcao". A configuração `portuguese` do Postgres reduz a
-- palavra ao radical, mas trata as duas grafias como palavras diferentes.
--
-- No Brasil isso mata uma busca: as pessoas digitam sem acento, no celular,
-- com pressa — "orcamento", "manutencao", "licitacao", "goiania". Quem
-- procurasse assim veria o quadro vazio e concluiria que não há trabalho
-- nenhum. É a mesma armadilha que já nos custou caro no nome das cidades.
--
-- Esta configuração tira o acento ANTES de reduzir ao radical, então as duas
-- grafias caem na mesma palavra guardada. O CLIENTE TEM DE USAR A MESMA
-- CONFIGURAÇÃO na consulta, senão a assimetria volta pela outra ponta.
-- ---------------------------------------------------------------------------
create extension if not exists unaccent with schema extensions;

drop text search configuration if exists public.portugues_sem_acento;
create text search configuration public.portugues_sem_acento ( copy = portuguese );

alter text search configuration public.portugues_sem_acento
  alter mapping for hword, hword_part, word
  with extensions.unaccent, portuguese_stem;

comment on text search configuration public.portugues_sem_acento is
  'Português com acentos removidos antes do radical. "construcao" encontra "construção".';

-- -------------------------------- anúncios ---------------------------------

create table if not exists public.anuncios (
  id           uuid primary key default gen_random_uuid(),
  autor_id     uuid not null references public.users(id) on delete cascade,

  titulo       text not null check (length(btrim(titulo)) between 8 and 120),
  descricao    text not null check (length(btrim(descricao)) between 30 and 5000),
  categoria_id text not null references public.categorias(id),

  modalidade   modalidade_trabalho not null,
  -- Cidade e UF são obrigatórias quando o trabalho exige presença. Num
  -- anúncio remoto ficam nulas de propósito: pedir local a quem não precisa
  -- dele é atrito, e local falso é pior do que local nenhum.
  cidade       text,
  uf           char(2),

  orcamento_tipo tipo_orcamento not null,
  orcamento_min  numeric(12,2) check (orcamento_min is null or orcamento_min >= 0),
  orcamento_max  numeric(12,2) check (orcamento_max is null or orcamento_max >= 0),
  prazo_dias     smallint check (prazo_dias is null or prazo_dias between 1 and 3650),

  status      status_anuncio not null default 'aberto',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Anúncio sem prazo apodrece o quadro: o profissional responde a um pedido
  -- de três meses atrás e não recebe resposta nenhuma. Trinta dias, e a
  -- faxina no fim deste arquivo encerra os vencidos.
  expires_at  timestamptz not null default now() + interval '30 days',

  constraint presencial_exige_lugar check (
    modalidade = 'remoto' or (cidade is not null and uf is not null)
  ),
  constraint faixa_coerente check (
    orcamento_min is null or orcamento_max is null or orcamento_max >= orcamento_min
  ),

  -- Busca em português, com o título pesando mais do que a descrição.
  -- Busca em português COM OS ACENTOS REMOVIDOS. Ver a configuração logo
  -- acima da tabela: metade do Brasil digita "construcao" e "orcamento", e a
  -- configuração `portuguese` crua trata isso como outra palavra.
  busca tsvector generated always as (
    setweight(to_tsvector('public.portugues_sem_acento', coalesce(titulo, '')), 'A') ||
    setweight(to_tsvector('public.portugues_sem_acento', coalesce(descricao, '')), 'B')
  ) stored
);

create index if not exists anuncios_busca_idx      on public.anuncios using gin (busca);
create index if not exists anuncios_abertos_idx    on public.anuncios (status, created_at desc) where status = 'aberto';
create index if not exists anuncios_categoria_idx  on public.anuncios (categoria_id) where status = 'aberto';
create index if not exists anuncios_lugar_idx      on public.anuncios (uf, cidade) where status = 'aberto';
create index if not exists anuncios_autor_idx      on public.anuncios (autor_id);

alter table public.anuncios enable row level security;

-- Anúncio aberto é público para quem tem conta: é a vitrine do mercado.
-- Rascunho e encerrado só o dono enxerga.
drop policy if exists "anúncio aberto é visível a quem tem conta" on public.anuncios;
create policy "anúncio aberto é visível a quem tem conta"
  on public.anuncios for select
  using (
    (status = 'aberto' and expires_at > now())
    or autor_id = (select auth.uid())
    or private.is_admin()
  );

drop policy if exists "autor publica o próprio anúncio" on public.anuncios;
create policy "autor publica o próprio anúncio"
  on public.anuncios for insert
  with check (autor_id = (select auth.uid()));

drop policy if exists "autor edita o próprio anúncio" on public.anuncios;
create policy "autor edita o próprio anúncio"
  on public.anuncios for update
  using (autor_id = (select auth.uid()))
  with check (autor_id = (select auth.uid()));

drop policy if exists "autor apaga o próprio anúncio" on public.anuncios;
create policy "autor apaga o próprio anúncio"
  on public.anuncios for delete
  using (autor_id = (select auth.uid()));

comment on table public.anuncios is
  'O que alguém precisa que seja feito. Aberto e dentro do prazo é visível a qualquer conta; rascunho e encerrado, só ao dono.';

-- -------------------------------- propostas --------------------------------

create table if not exists public.propostas (
  id              uuid primary key default gen_random_uuid(),
  anuncio_id      uuid not null references public.anuncios(id) on delete cascade,
  profissional_id uuid not null references public.users(id) on delete cascade,

  mensagem   text not null check (length(btrim(mensagem)) between 20 and 3000),
  valor      numeric(12,2) check (valor is null or valor >= 0),
  prazo_dias smallint check (prazo_dias is null or prazo_dias between 1 and 3650),

  status     status_proposta not null default 'enviada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Uma proposta por profissional por anúncio. Sem isto, quem quisesse
  -- aparecer mais mandaria cinco.
  constraint uma_proposta_por_anuncio unique (anuncio_id, profissional_id)
);

create index if not exists propostas_anuncio_idx      on public.propostas (anuncio_id, created_at desc);
create index if not exists propostas_profissional_idx on public.propostas (profissional_id, created_at desc);

alter table public.propostas enable row level security;

-- A REGRA QUE SUSTENTA A CONFIANÇA DO MERCADO.
--
-- Quem publicou vê todas as propostas do próprio anúncio. O profissional vê
-- só a dele. Ninguém vê a dos concorrentes — proposta é preço, e preço à
-- vista faz todo mundo copiar quem chegou primeiro.
drop policy if exists "dono do anúncio e autor da proposta leem" on public.propostas;
create policy "dono do anúncio e autor da proposta leem"
  on public.propostas for select
  using (
    profissional_id = (select auth.uid())
    or exists (
      select 1 from public.anuncios a
      where a.id = anuncio_id and a.autor_id = (select auth.uid())
    )
    or private.is_admin()
  );

-- Só dá para propor em anúncio aberto, dentro do prazo, e que não seja seu.
drop policy if exists "profissional envia a própria proposta" on public.propostas;
create policy "profissional envia a própria proposta"
  on public.propostas for insert
  with check (
    profissional_id = (select auth.uid())
    and exists (
      select 1 from public.anuncios a
      where a.id = anuncio_id
        and a.status = 'aberto'
        and a.expires_at > now()
        and a.autor_id <> (select auth.uid())
    )
  );

drop policy if exists "os dois lados atualizam a proposta" on public.propostas;
create policy "os dois lados atualizam a proposta"
  on public.propostas for update
  using (
    profissional_id = (select auth.uid())
    or exists (
      select 1 from public.anuncios a
      where a.id = anuncio_id and a.autor_id = (select auth.uid())
    )
  );

comment on table public.propostas is
  'Quem se oferece para fazer o trabalho. Cada profissional vê apenas a própria; o dono do anúncio vê todas.';

-- ---------------------------------------------------------------------------
-- Quem pode mudar o quê.
--
-- A política de UPDATE acima deixa os dois lados escreverem na linha — o que é
-- necessário, e perigoso sozinho: sem este gatilho, o profissional marcaria a
-- própria proposta como `aceita` e reivindicaria o trabalho.
--
-- Então: aceitar e recusar é do dono do anúncio. Retirar é do profissional.
-- E o texto da proposta congela depois de enviada, para que ninguém combine
-- um preço e troque por outro depois.
-- ---------------------------------------------------------------------------
create or replace function private.quem_muda_a_proposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eu uuid := auth.uid();
  dono_do_anuncio uuid;
begin
  -- NÃO usa a porta `conexao.rotina_do_servidor`, e isso é deliberado.
  --
  -- Aquela porta é local à TRANSAÇÃO, não ao comando, e o gatilho de cadastro
  -- (promocao_de_lancamento) abre-a. Qualquer coisa que acontecesse depois, na
  -- mesma transação, passava sem ser conferida — foi assim que o primeiro
  -- teste deste arquivo conseguiu aceitar a própria proposta e trocar o preço
  -- depois de enviada.
  --
  -- Um gatilho que protege dinheiro e autoria não pode depender de uma porta
  -- que outra pessoa abriu. Decide pelo fato direto: existe usuário
  -- autenticado? Então é cliente, e as regras valem.
  if eu is null then
    new.updated_at := now();
    return new;
  end if;

  select a.autor_id into dono_do_anuncio from public.anuncios a where a.id = old.anuncio_id;

  if new.status is distinct from old.status then
    if new.status in ('aceita', 'recusada') and eu is distinct from dono_do_anuncio then
      raise exception 'Só quem publicou o anúncio pode aceitar ou recusar uma proposta.'
        using errcode = '42501';
    end if;
    if new.status = 'retirada' and eu is distinct from old.profissional_id then
      raise exception 'Só quem enviou a proposta pode retirá-la.'
        using errcode = '42501';
    end if;
    if new.status = 'enviada' and old.status <> 'enviada' then
      raise exception 'Uma proposta já respondida não volta ao estado inicial.'
        using errcode = '42501';
    end if;
  end if;

  -- O conteúdo da oferta é imutável depois de enviada.
  new.mensagem        := old.mensagem;
  new.valor           := old.valor;
  new.prazo_dias      := old.prazo_dias;
  new.anuncio_id      := old.anuncio_id;
  new.profissional_id := old.profissional_id;
  new.created_at      := old.created_at;
  new.updated_at      := now();

  return new;
end;
$$;

revoke execute on function private.quem_muda_a_proposta() from public, anon, authenticated;

drop trigger if exists quem_muda_a_proposta on public.propostas;
create trigger quem_muda_a_proposta
  before update on public.propostas
  for each row execute function private.quem_muda_a_proposta();

-- ------------------------------ updated_at ---------------------------------

create or replace function private.marcar_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists anuncios_updated_at on public.anuncios;
create trigger anuncios_updated_at
  before update on public.anuncios
  for each row execute function private.marcar_updated_at();

-- ------------------------------- os avisos ---------------------------------
--
-- Mesma razão da migração 007: `notifications` não tem política de INSERT para
-- o cliente, e não deve ter. O aviso nasce no servidor, a partir de um fato
-- que o servidor observou.
-- ---------------------------------------------------------------------------
create or replace function private.avisar_da_proposta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  anuncio record;
  nome text;
begin
  select a.id, a.titulo, a.autor_id into anuncio
    from public.anuncios a where a.id = new.anuncio_id;

  if tg_op = 'INSERT' then
    select nullif(split_part(btrim(u.name), ' ', 1), '') into nome
      from public.users u where u.id = new.profissional_id;

    insert into public.notifications (user_id, kind, title, body, link)
    values (
      anuncio.autor_id,
      'solicitacao',
      coalesce(nome, 'Alguém') || ' enviou uma proposta',
      'No seu anúncio "' || left(anuncio.titulo, 60) || '".',
      jsonb_build_object('name', 'anuncio', 'id', anuncio.id::text)
    );
    return new;
  end if;

  if new.status = 'aceita' and old.status is distinct from 'aceita' then
    insert into public.notifications (user_id, kind, title, body, link)
    values (
      new.profissional_id,
      'conexao',
      'Sua proposta foi aceita',
      'Em "' || left(anuncio.titulo, 60) || '". A conversa já pode começar.',
      jsonb_build_object('name', 'proposta', 'id', new.id::text)
    );
  elsif new.status = 'recusada' and old.status is distinct from 'recusada' then
    insert into public.notifications (user_id, kind, title, body, link)
    values (
      new.profissional_id,
      'sistema',
      'Sua proposta não foi escolhida desta vez',
      'Em "' || left(anuncio.titulo, 60) || '".',
      jsonb_build_object('name', 'anuncio', 'id', anuncio.id::text)
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.avisar_da_proposta() from public, anon, authenticated;

drop trigger if exists avisar_da_proposta on public.propostas;
create trigger avisar_da_proposta
  after insert or update on public.propostas
  for each row execute function private.avisar_da_proposta();

-- ------------------------------- a faxina ----------------------------------

create or replace function private.encerrar_anuncios_vencidos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare quantos integer;
begin
  perform set_config('conexao.rotina_do_servidor', 'on', true);
  with vencidos as (
    update public.anuncios
       set status = 'fechado'
     where status = 'aberto' and expires_at <= now()
    returning id
  )
  select count(*) into quantos from vencidos;
  return quantos;
end;
$$;

revoke execute on function private.encerrar_anuncios_vencidos() from public, anon, authenticated;

select cron.unschedule('encerrar-anuncios-vencidos')
 where exists (select 1 from cron.job where jobname = 'encerrar-anuncios-vencidos');

select cron.schedule(
  'encerrar-anuncios-vencidos', '23 7 * * *',   -- 07:23 UTC = 04:23 em Brasília
  $cron$ select private.encerrar_anuncios_vencidos(); $cron$
);

-- ------------------------------ as categorias ------------------------------
--
-- Ponto de partida, desenhado para Centro-Oeste, Goiás e Minas: contabilidade,
-- tributário, licenciamento e obras pesam mais aqui do que pesariam num
-- mercado de tecnologia puro. Ajustar é editar linha, não migrar esquema.
-- ---------------------------------------------------------------------------
insert into public.categorias (id, nome, grupo, ordem) values
  ('contabilidade',        'Contabilidade',                  'Contábil e Tributário', 10),
  ('abertura-empresa',     'Abertura e alteração de empresa','Contábil e Tributário', 11),
  ('tributario',           'Planejamento tributário',        'Contábil e Tributário', 12),
  ('folha-pagamento',      'Folha de pagamento',             'Contábil e Tributário', 13),
  ('imposto-renda',        'Imposto de renda',               'Contábil e Tributário', 14),

  ('direito-trabalhista',  'Direito trabalhista',            'Jurídico', 20),
  ('direito-empresarial',  'Direito empresarial',            'Jurídico', 21),
  ('direito-tributario',   'Direito tributário',             'Jurídico', 22),
  ('contratos',            'Contratos',                      'Jurídico', 23),
  ('licitacoes',           'Licitações e contratos públicos','Jurídico', 24),

  ('desenvolvimento-web',  'Sites e sistemas web',           'Tecnologia', 30),
  ('aplicativos',          'Aplicativos',                    'Tecnologia', 31),
  ('dados',                'Dados e relatórios',             'Tecnologia', 32),
  ('ia-automacao',         'IA e automação',                 'Tecnologia', 33),
  ('suporte-ti',           'Suporte e infraestrutura',       'Tecnologia', 34),

  ('redes-sociais',        'Redes sociais',                  'Marketing e Vendas', 40),
  ('trafego-pago',         'Tráfego pago',                   'Marketing e Vendas', 41),
  ('design',               'Design e identidade visual',     'Marketing e Vendas', 42),
  ('conteudo',             'Conteúdo e redação',             'Marketing e Vendas', 43),
  ('vendas',               'Vendas e prospecção',            'Marketing e Vendas', 44),

  ('projetos-engenharia',  'Projetos de engenharia',         'Engenharia e Obras', 50),
  ('laudos-tecnicos',      'Laudos e perícias',              'Engenharia e Obras', 51),
  ('obras-reformas',       'Obras e reformas',               'Engenharia e Obras', 52),
  ('eletrica-hidraulica',  'Elétrica e hidráulica',          'Engenharia e Obras', 53),
  ('ambiental',            'Licenciamento ambiental',        'Engenharia e Obras', 54),

  ('alvaras',              'Alvarás e licenciamento',        'Licenças e Segurança', 60),
  ('vigilancia-sanitaria', 'Vigilância sanitária',           'Licenças e Segurança', 61),
  ('seguranca-trabalho',   'Segurança do trabalho',          'Licenças e Segurança', 62),
  ('bombeiros',            'Projeto e vistoria de bombeiros','Licenças e Segurança', 63),

  ('assistente-virtual',   'Assistente virtual',             'Administrativo', 70),
  ('financeiro',           'Financeiro e cobrança',          'Administrativo', 71),
  ('rh-recrutamento',      'RH e recrutamento',              'Administrativo', 72),
  ('traducao',             'Tradução e revisão',             'Administrativo', 73),

  ('consultoria-gestao',   'Consultoria de gestão',          'Consultoria', 80),
  ('processos',            'Processos e qualidade',          'Consultoria', 81),
  ('captacao-recursos',    'Captação de recursos',           'Consultoria', 82),
  ('outros',               'Outros',                         'Outros', 99)
on conflict (id) do update set
  nome = excluded.nome, grupo = excluded.grupo, ordem = excluded.ordem, ativa = true;
