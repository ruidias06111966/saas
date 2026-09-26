-- ---------------------------------------------------------------------------
-- 018 · O nome certo da cota diária — SEGUNDA METADE (a coluna antiga sai)
--
-- ⚠️  SÓ APLICAR DEPOIS QUE O CLIENTE QUE USA `contatos` ESTIVER NO AR, e com
--     alguma folga — abas antigas ainda abertas escrevem `interests`, e é o
--     espelho da 017 que as mantém corretas. Enquanto ele existir, ninguém
--     perde contagem. Quando ele sair, uma aba velha passa a gravar numa
--     coluna que não existe mais e o pedido de conversa falha PARA ELA até a
--     página ser recarregada.
--
-- A 017 explica o caminho inteiro. Esta é só a limpeza do fim: apaga o
-- espelho e a coluna com o nome de app de relacionamentos.
--
-- IRREVERSÍVEL: `drop column` leva o dado embora. Mas o dado que vai embora é
-- uma cópia exata do que está em `contatos` (o espelho garantiu isso linha por
-- linha), e é um contador que zera todo dia à meia-noite.
-- ---------------------------------------------------------------------------

-- ─── 1. Antes de apagar, provar que nada mais pede o nome antigo ──────────
do $$
declare
  culpados text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into culpados
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prokind = 'f'
     and p.oid <> 'private.espelho_da_cota_diaria()'::regprocedure
     and pg_get_functiondef(p.oid) ilike '%interests%';
  if culpados is not null then
    raise exception 'Estas funções ainda citam `interests`: %', culpados;
  end if;

  select string_agg(c.relname, ', ') into culpados
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
     and pg_get_viewdef(c.oid) ilike '%interests%';
  if culpados is not null then
    raise exception 'Estas views ainda citam `interests`: %', culpados;
  end if;

  select string_agg(d.user_id::text, ', ') into culpados
    from public.daily_usage d where d.contatos <> d.interests;
  if culpados is not null then
    raise exception 'O espelho não fechou nestas linhas: %', culpados;
  end if;
end $$;

-- ─── 2. O espelho sai primeiro ────────────────────────────────────────────
-- Na ordem inversa: se a coluna saísse antes, o gatilho quebraria em toda
-- gravação no meio da própria migração.
drop trigger if exists espelho_da_cota_diaria on public.daily_usage;
drop function if exists private.espelho_da_cota_diaria();

-- ─── 3. A coluna ──────────────────────────────────────────────────────────
alter table public.daily_usage drop column if exists interests;

-- ─── 4. Conferência ───────────────────────────────────────────────────────
do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'daily_usage'
       and column_name = 'interests'
  ) then
    raise exception 'A coluna `interests` continua existindo.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'daily_usage'
       and column_name = 'contatos'
  ) then
    raise exception 'A coluna `contatos` não está lá.';
  end if;

  if exists (
    select 1 from pg_trigger
     where tgrelid = 'public.daily_usage'::regclass
       and tgname = 'espelho_da_cota_diaria' and not tgisinternal
  ) then
    raise exception 'O gatilho de espelho ficou para trás.';
  end if;
end $$;
