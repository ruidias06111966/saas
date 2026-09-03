-- ---------------------------------------------------------------------------
-- 003 · Fixa o `search_path` de duas funções auxiliares
--
-- O QUE MUDA
-- Só o `search_path`. O corpo das duas funções é idêntico ao que já estava em
-- produção — conferido no catálogo antes de escrever esta migração.
--
-- POR QUÊ
-- O detector do Supabase aponta `function_search_path_mutable` nas duas. Com o
-- caminho de busca aberto, alguém que consiga criar um objeto num schema
-- visível pode fazer a função resolver para outra coisa. Nenhuma das duas é
-- `security definer`, o que reduz muito o alcance — mas as duas são SQL puro,
-- usando só `pg_catalog` (`least`, `greatest`, `substring`, `coalesce`), então
-- fechar o caminho custa nada e não altera resultado.
--
-- CUIDADO QUE ESTA MIGRAÇÃO EXIGE
-- `nivel_do_arquivo` é usada pela política de leitura do bucket `midia`: ela
-- decide qual nível do véu cada pessoa pode ver. Uma função quebrada aqui faz
-- TODA foto de perfil parar de carregar — e em silêncio, porque o cliente cai
-- no retrato generativo sem avisar. Já aconteceu neste projeto, por um `grant`
-- faltando. Por isso o corpo foi copiado sem uma vírgula de diferença.
-- ---------------------------------------------------------------------------

create or replace function private.limitar(v numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$ select least(1, greatest(0, v)) $$;

create or replace function private.nivel_do_arquivo(caminho text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when caminho ~ '-orig\.jpg$' then 4
    else coalesce((substring(caminho from '-([0-3])\.jpg$'))::int, 0)
  end;
$$;
