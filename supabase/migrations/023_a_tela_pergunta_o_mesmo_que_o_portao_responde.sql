-- ---------------------------------------------------------------------------
-- 023 — A tela pergunta exatamente o que o portão responde.
--
-- `propostas_restantes()` respondia "quantas propostas sobram este mês",
-- contando linhas e lendo `users.plan`. Depois da 022 essa pergunta não existe
-- mais: não há cota mensal, há plano ativo ou não há.
--
-- POR QUE UM RPC, E NÃO UMA CONSULTA DO CLIENTE
--
-- Existe policy de leitura em `subscriptions`, então o navegador CONSEGUIRIA
-- buscar a linha e decidir sozinho: status 'ativa' e `expires_at` no futuro.
--
-- Seria uma SEGUNDA implementação da mesma regra. E duas regras parecidas
-- divergem — é o defeito mais caro deste projeto, repetido em 014, 015 e 019.
-- A tela pergunta, o banco responde, e a resposta vem da MESMA função que o
-- portão usa. Se a regra mudar, muda num lugar só.
--
-- A tela usa isto apenas para AVISAR ANTES, poupando a pessoa de escrever uma
-- proposta inteira para levar um "não" no fim. Quem recusa de verdade continua
-- sendo a policy e o gatilho da 022 — nenhuma resposta daqui libera nada.
-- ---------------------------------------------------------------------------

create or replace function public.meu_plano_esta_ativo()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select private.tem_plano_ativo((select auth.uid()));
$$;

revoke all on function public.meu_plano_esta_ativo() from public, anon;
grant execute on function public.meu_plano_esta_ativo() to authenticated;

-- A pergunta antiga sai. Deixá-la seria deixar uma segunda fonte da verdade
-- viva, respondendo sobre uma cota que não existe mais.
drop function if exists public.propostas_restantes();

do $$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'meu_plano_esta_ativo';
  if n <> 1 then raise exception 'meu_plano_esta_ativo nao foi criada'; end if;

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'propostas_restantes';
  if n <> 0 then raise exception 'propostas_restantes ainda existe'; end if;

  -- Quem pode executar: authenticated sim, anon nao.
  if not has_function_privilege('authenticated', 'public.meu_plano_esta_ativo()', 'execute') then
    raise exception 'authenticated nao pode executar meu_plano_esta_ativo';
  end if;
  if has_function_privilege('anon', 'public.meu_plano_esta_ativo()', 'execute') then
    raise exception 'anon NAO pode executar meu_plano_esta_ativo';
  end if;

  raise notice 'OK - a tela pergunta pela mesma funcao que o portao usa';
end $$;
