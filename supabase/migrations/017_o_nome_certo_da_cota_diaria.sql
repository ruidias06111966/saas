-- ---------------------------------------------------------------------------
-- 017 · O nome certo da cota diária
--
-- ⚠️  NÃO APLICAR ANTES DO DEPLOY DO CLIENTE QUE USA `contatos`.
--
-- `daily_usage.interests` conta quantas pessoas alguém abordou no dia. O nome
-- é do app de relacionamentos: ali era "interesse demonstrado". Hoje é pedido
-- de conversa, e o cliente já chama de `contatos` — mas o MAPEAMENTO para o
-- nome antigo continua vivo em `backend.bumpUsage`, que lê e escreve
-- `interests` em quatro pontos.
--
-- Esta renomeação estava dentro da 013 e foi tirada de lá na véspera de
-- aplicá-la, quando a verificação mostrou o mapeamento ainda de pé. Aplicá-la
-- junto teria quebrado o pedido de conversa no app publicado.
--
-- É o terceiro exemplar da mesma armadilha em 24 horas — a 014 e a 015 foram
-- os dois primeiros, e as duas derrubaram coisa em produção. A diferença aqui
-- é que desta vez a armadilha foi vista ANTES.
--
-- A ORDEM CORRETA:
--
--   1. `backend.bumpUsage` deixar de citar 'interests'
--   2. cliente publicado
--   3. esta migração
--
-- Enquanto isso, a coluna com o nome antigo não incomoda ninguém.
-- ---------------------------------------------------------------------------

alter table public.daily_usage rename column interests to contatos;

do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'daily_usage' and column_name = 'interests'
  ) then
    raise exception 'A coluna `interests` continua existindo.';
  end if;
end $$;
