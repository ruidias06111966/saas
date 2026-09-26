-- ---------------------------------------------------------------------------
-- 017 · O nome certo da cota diária — PRIMEIRA METADE (a coluna nova nasce)
--
-- `daily_usage.interests` conta quantos pedidos de conversa alguém mandou no
-- dia. O nome é do app de relacionamentos: ali era "interesse demonstrado".
-- Hoje é pedido de conversa, e o cliente já chama de `contatos`.
--
-- POR QUE NÃO É UM `RENAME` SIMPLES
--
-- A versão anterior deste arquivo era uma linha:
--
--     alter table public.daily_usage rename column interests to contatos;
--
-- Um `rename` troca o nome NO MESMO INSTANTE para todo mundo. E no instante em
-- que ele rodasse, dois pedaços do sistema ainda pediriam o nome antigo:
--
--   • o aplicativo PUBLICADO, em `backend.bumpUsage` — quatro citações;
--   • a função `public.consumir_cota_ia`, dentro do próprio banco, que faz
--     `insert into daily_usage (user_id, day, interests, ai_calls)`.
--
-- Ou seja: renomear primeiro derruba o pedido de conversa e a cota de IA;
-- publicar o cliente novo primeiro derruba também, porque ele pediria uma
-- coluna `contatos` que ainda não existe. Não há ordem certa entre dois passos
-- — é preciso um terceiro.
--
-- É o terceiro exemplar da mesma armadilha — a 014 e a 015 foram os dois
-- primeiros, e as duas derrubaram coisa em produção. A diferença é que desta
-- vez a armadilha foi vista ANTES de aplicar.
--
-- O CAMINHO SEM JANELA QUEBRADA (três passos, dois deles nesta pasta)
--
--   1. ESTA migração: nasce `contatos`, com o valor de `interests` copiado, e
--      as duas colunas passam a andar juntas por um gatilho de espelho. Quem
--      escreve num nome escreve no outro sem saber. O app publicado continua
--      funcionando exatamente como está.
--   2. O cliente troca para `contatos` e vai para o ar. Durante a virada, as
--      abas antigas que ficaram abertas com o código velho ainda escrevem
--      `interests` — e por causa do espelho a contagem continua certa para
--      todos, sem ninguém ganhar cota extra nem perder.
--   3. A migração 018 apaga `interests`, o espelho e a última menção.
--
-- Dá para parar depois do passo 1 sem estrago: o banco fica com uma coluna a
-- mais, e nada mais.
-- ---------------------------------------------------------------------------

-- ─── 1. A coluna nova, com a mesma forma da antiga ────────────────────────
-- `smallint not null default 0`, igual a `interests`: se a forma divergir, o
-- `upsert` do cliente quebra na primeira gravação — foi assim que a 015 nasceu.
alter table public.daily_usage
  add column if not exists contatos smallint not null default 0;

-- ─── 2. O valor que já estava lá ──────────────────────────────────────────
update public.daily_usage set contatos = interests where contatos <> interests;

-- ─── 3. O espelho ─────────────────────────────────────────────────────────
-- Vive só entre esta migração e a 018. Regra: quem mudou manda no outro.
--
-- O `upsert` do PostgREST é `insert ... on conflict do update`, então este
-- gatilho é chamado nas duas pontas — primeiro como INSERT (com a linha que
-- seria inserida) e, se houver conflito, como UPDATE. Os dois casos precisam
-- estar cobertos.
create or replace function private.espelho_da_cota_diaria()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    -- Só um dos dois nomes vem preenchido; o outro chega no `default 0`.
    new.contatos  := greatest(coalesce(new.contatos, 0), coalesce(new.interests, 0));
    new.interests := new.contatos;
  else
    if new.contatos is distinct from old.contatos then
      new.interests := new.contatos;
    elsif new.interests is distinct from old.interests then
      new.contatos := new.interests;
    end if;
  end if;
  return new;
end;
$$;

comment on function private.espelho_da_cota_diaria() is
  'Temporário: mantém daily_usage.contatos e daily_usage.interests iguais '
  'durante a troca de nome. Sai na 018, junto com a coluna `interests`.';

drop trigger if exists espelho_da_cota_diaria on public.daily_usage;
create trigger espelho_da_cota_diaria
  before insert or update on public.daily_usage
  for each row execute function private.espelho_da_cota_diaria();

-- ─── 4. A função do banco deixa de citar o nome antigo ────────────────────
-- Mesma assinatura e mesmo tipo de retorno, então `create or replace` basta e
-- as permissões de execução ficam de pé (foi o tropeço da 013, onde o tipo de
-- retorno mudou e o `replace` foi recusado com 42P13).
--
-- A única mudança é o `insert`: em vez de nomear `interests` e `ai_calls` com
-- zero, deixa os `default 0` da tabela fazerem o trabalho. Assim a função não
-- precisa ser tocada de novo na 018.
create or replace function public.consumir_cota_ia()
returns table(permitido boolean, usadas integer, limite integer)
language plpgsql
security definer
set search_path to 'public'
as $$
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

  insert into public.daily_usage (user_id, day)
  values (me, current_date)
  on conflict (user_id, day) do nothing;

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

-- ─── 5. Conferência ───────────────────────────────────────────────────────
do $$
declare
  faltando text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'daily_usage'
       and column_name = 'contatos' and data_type = 'smallint'
       and is_nullable = 'NO' and column_default = '0'
  ) then
    raise exception 'A coluna `contatos` não nasceu com a forma da antiga.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'daily_usage'
       and column_name = 'interests'
  ) then
    raise exception 'A coluna `interests` sumiu — ela tem de sobreviver até a 018.';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.daily_usage'::regclass
       and tgname = 'espelho_da_cota_diaria' and not tgisinternal
  ) then
    raise exception 'O gatilho de espelho não ficou instalado.';
  end if;

  select string_agg(d.user_id::text, ', ') into faltando
    from public.daily_usage d where d.contatos <> d.interests;
  if faltando is not null then
    raise exception 'Linhas com os dois nomes em desacordo: %', faltando;
  end if;

  if pg_get_functiondef('public.consumir_cota_ia()'::regprocedure) ilike '%interests%' then
    raise exception '`consumir_cota_ia` ainda cita `interests`.';
  end if;
end $$;
