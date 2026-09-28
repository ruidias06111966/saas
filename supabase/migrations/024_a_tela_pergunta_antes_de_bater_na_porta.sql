-- ---------------------------------------------------------------------------
-- 024 — A tela pergunta antes de bater na porta.
--
-- `expressInterest` no cliente grava o pedido na MEMÓRIA primeiro e manda ao
-- servidor depois. Antes da 022 isso era inofensivo: o servidor aceitava. Com
-- o portão, quem não tem plano passa a ver "Pedido enviado" na tela enquanto o
-- banco recusa em silêncio — e a pessoa fica esperando uma resposta que nunca
-- vem, de um pedido que nunca existiu.
--
-- É o mesmo defeito que os três botões do painel administrativo tinham: decidir
-- na memória o que só o servidor pode decidir.
--
-- A tela precisa PERGUNTAR ANTES. E a pergunta não pode ser "tem plano?",
-- porque a regra tem uma exceção: quem já veio até mim não me custa nada. A
-- única pergunta certa é a que o portão faz, inteira.
--
-- Por isso este RPC devolve exatamente `private.pode_iniciar_conversa`, a
-- MESMA função que a policy de `connections` chama. Nenhuma segunda opinião.
--
-- E como sempre: isto não libera nada. Quem recusa é a policy.
-- ---------------------------------------------------------------------------

create or replace function public.posso_conversar_com(outro uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select private.pode_iniciar_conversa((select auth.uid()), outro);
$$;

revoke all on function public.posso_conversar_com(uuid) from public, anon;
grant execute on function public.posso_conversar_com(uuid) to authenticated;

do $$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'posso_conversar_com';
  if n <> 1 then raise exception 'posso_conversar_com nao foi criada'; end if;

  if not has_function_privilege('authenticated', 'public.posso_conversar_com(uuid)', 'execute') then
    raise exception 'authenticated nao pode executar posso_conversar_com';
  end if;
  if has_function_privilege('anon', 'public.posso_conversar_com(uuid)', 'execute') then
    raise exception 'anon NAO pode executar posso_conversar_com';
  end if;

  raise notice 'OK - a tela pode perguntar a mesma coisa que o portao responde';
end $$;
