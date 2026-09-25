-- ---------------------------------------------------------------------------
-- 012 · O perfil deixa de ser de relacionamento
--
-- ADITIVA. Nada é removido aqui. A limpeza do que sobra do app de
-- relacionamentos vem na 013, e só DEPOIS que o cliente novo estiver
-- publicado — a 002 já nos ensinou o preço de inverter essa ordem: o banco é
-- um só, e derrubar hoje uma coluna que a versão no ar ainda lê quebra o site
-- no mesmo minuto.
--
-- O QUE ENTRA
--
--   users.telefone          privado, nunca sai em view nenhuma
--   users.atende_remoto     trabalha a distância? entra na busca
--   users.anos_experiencia  0 a 70, opcional
--   profissionais_categorias  em que a pessoa atua, até 5 das 37 categorias
--   contato_do_negocio()    o telefone do outro lado, só com proposta aceita
--
-- O TELEFONE, E POR QUE ELE NÃO APARECE NO PERFIL
--
-- A escolha foi deliberada: o telefone fica guardado e NÃO aparece para
-- ninguém. Ele só é revelado aos dois lados quando uma proposta é aceita.
--
-- A razão é simples: num quadro de anúncios com telefone à vista, o primeiro a
-- se cadastrar em massa não é o cliente nem o profissional — é quem quer a
-- lista. E quando o contato sai do app antes do acordo, o app deixa de ver o
-- que aconteceu, o que mata qualquer reputação futura.
--
-- Note que a coluna vive em `public.users`, que desde a 002 só o dono lê. Não
-- há view que a exponha; o único caminho é a função no fim deste arquivo, e
-- ela exige proposta ACEITA e que quem pergunta seja uma das duas partes.
--
-- ATÉ 5 ESPECIALIDADES, E POR QUE UM LIMITE
--
-- Quem diz que faz tudo não é procurado para nada. O limite não é técnico: é
-- para a lista continuar significando alguma coisa quando houver mil
-- cadastrados. Um `check` não conta linhas de outra linha, então é gatilho.
-- ---------------------------------------------------------------------------

-- ------------------------- colunas novas em users --------------------------

alter table public.users
  add column if not exists telefone         text,
  add column if not exists atende_remoto    boolean not null default true,
  add column if not exists anos_experiencia smallint;

do $$ begin
  alter table public.users add constraint telefone_plausivel
    check (telefone is null or length(regexp_replace(telefone, '\D', '', 'g')) between 10 and 13);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.users add constraint experiencia_plausivel
    check (anos_experiencia is null or anos_experiencia between 0 and 70);
exception when duplicate_object then null; end $$;

comment on column public.users.telefone is
  'Telefone de contato. NÃO sai em nenhuma view. Revelado só pela função contato_do_negocio(), e só com proposta aceita. Ver 012_perfil_profissional.sql.';

-- --------------------------- especialidades --------------------------------

create table if not exists public.profissionais_categorias (
  user_id      uuid not null references public.users(id) on delete cascade,
  categoria_id text not null references public.categorias(id),
  created_at   timestamptz not null default now(),
  primary key (user_id, categoria_id)
);

create index if not exists prof_cat_por_categoria on public.profissionais_categorias (categoria_id);

alter table public.profissionais_categorias enable row level security;

-- A especialidade é o que a pessoa anuncia saber fazer: é pública para quem
-- tem conta, como a profissão no crachá. Escrever, só a própria pessoa.
drop policy if exists "especialidade é visível a quem tem conta" on public.profissionais_categorias;
create policy "especialidade é visível a quem tem conta"
  on public.profissionais_categorias for select
  to authenticated
  using (true);

drop policy if exists "cada um escolhe as próprias" on public.profissionais_categorias;
create policy "cada um escolhe as próprias"
  on public.profissionais_categorias for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function private.no_maximo_cinco_especialidades()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  quantas int;
begin
  select count(*) into quantas
    from public.profissionais_categorias
   where user_id = new.user_id;
  if quantas > 5 then
    raise exception 'Escolha no máximo 5 áreas. Quem diz que faz tudo não é procurado para nada.'
      using errcode = '23514';
  end if;
  return null;
end $$;

drop trigger if exists limite_de_especialidades on public.profissionais_categorias;
create constraint trigger limite_de_especialidades
  after insert on public.profissionais_categorias
  deferrable initially immediate
  for each row execute function private.no_maximo_cinco_especialidades();

comment on table public.profissionais_categorias is
  'Em que cada profissional atua, até 5 das categorias do mercado. Pública para quem tem conta; só o dono escreve.';

-- ------------------- o crachá ganha os campos novos ------------------------
-- Continua sem e-mail, sem nascimento, sem coordenadas, sem papel — e sem
-- telefone. Ver 009 e a correção de permissões da 010, repetida no fim.

create or replace view public.perfis_do_mercado
with (security_invoker = false, security_barrier = true) as
select
  u.id,
  u.name,
  u.profession,
  u.city,
  u.state,
  u.photo_url,
  u.verified,
  u.reputation,
  u.atende_remoto,
  u.anos_experiencia
from public.users u
where
  private.perfil_visivel(u.id)
  and (
    u.role <> 'admin'
    or exists (select 1 from public.anuncios a where a.autor_id = u.id)
    or exists (select 1 from public.propostas p where p.profissional_id = u.id)
  );

comment on view public.perfis_do_mercado is
  'Crachá público de quem participa do mercado. Sem e-mail, sem nascimento, sem coordenadas, sem papel e SEM TELEFONE. Ver 009 e 012.';

-- `create or replace view` faz os privilégios padrão do Supabase voltarem a
-- dar tudo a `authenticated`. A 010 explica por que isso é grave numa view com
-- direitos do dono. Repetir o revoke aqui não é zelo excessivo: é obrigatório.
revoke all on public.perfis_do_mercado from public, anon, authenticated;
grant select on public.perfis_do_mercado to authenticated;

-- ---------------------- o contato, depois do acordo ------------------------

create or replace function public.contato_do_negocio(proposta uuid)
returns table (pessoa_id uuid, nome text, telefone text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select outro.id, outro.name, outro.telefone
  from public.propostas p
  join public.anuncios a on a.id = p.anuncio_id
  join public.users outro
    on outro.id = case
         when (select auth.uid()) = a.autor_id        then p.profissional_id
         when (select auth.uid()) = p.profissional_id then a.autor_id
       end
  where p.id = proposta
    and p.status = 'aceita'
    and (select auth.uid()) in (a.autor_id, p.profissional_id);
$$;

comment on function public.contato_do_negocio(uuid) is
  'O telefone do outro lado de uma proposta ACEITA, para quem é parte dela. Único caminho até users.telefone. Ver 012_perfil_profissional.sql.';

revoke all on function public.contato_do_negocio(uuid) from public, anon;
grant execute on function public.contato_do_negocio(uuid) to authenticated;
