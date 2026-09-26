-- ---------------------------------------------------------------------------
-- 015 · As colunas órfãs bloqueavam o salvamento (e o cadastro)
--
-- SEGUNDA QUEBRA EM PRODUÇÃO DA FASE 2, relatada pelo dono com a tela do erro:
--
--     Falha ao salvar o perfil: null value in column "birth_date" of
--     relation "users" violates not-null constraint
--
-- O QUE ACONTECEU
--
-- A Fase 2 tirou `birth_date`, `gender`, `goal` e `chat_pace` do cliente. A
-- limpeza que DERRUBA essas colunas é a 013, e ela está deliberadamente
-- parada, esperando autorização — foi a decisão certa.
--
-- O que ninguém considerou é o estado intermediário: as colunas continuam lá,
-- continuam `not null`, e três delas NÃO TÊM VALOR PADRÃO. `backend.saveUser`
-- faz um `upsert`, que o PostgREST traduz para `insert ... on conflict do
-- update`. O Postgres monta a tupla do INSERT primeiro e checa `not null`
-- ANTES de resolver o conflito. Sem `birth_date` no payload, a tupla nasce
-- nula e o banco recusa — mesmo quando a linha já existe e a operação ia
-- acabar sendo um UPDATE.
--
-- O ALCANCE, QUE É MAIOR DO QUE O ERRO SUGERE
--
--   • salvar o perfil      — quebrado, foi o que apareceu na tela
--   • CADASTRO NOVO        — quebrado também, pelo mesmo caminho
--
-- A segunda é a grave: ninguém consegue criar conta. E ela não apareceu para
-- ninguém porque só existe uma conta no sistema.
--
--     birth_date  not null, sem padrão   -> bloqueia
--     gender      not null, sem padrão   -> bloqueia
--     goal        not null, sem padrão   -> bloqueia
--     chat_pace   not null, COM padrão   -> não bloqueia
--
-- A CORREÇÃO
--
-- Tirar o `not null` das quatro. Não apaga nada, não muda tipo, não perde
-- dado, e é reversível com um `set not null`. As colunas continuam existindo
-- até a 013 — que agora fica menos urgente, porque o estado intermediário
-- deixou de ser um estado quebrado.
--
-- Fazer isto em vez de antecipar a 013 é deliberado: a 013 é irreversível e
-- espera autorização; esta não é nenhuma das duas coisas.
--
-- POR QUE PASSOU, DE NOVO
--
-- Porque eu verifiquei o caminho de LEITURA e não o de ESCRITA. A 014, duas
-- horas antes, foi exatamente a mesma lição na direção oposta: lá faltava a
-- consulta que o cliente faz, aqui faltava a gravação que o cliente faz.
-- Verificar a migração continua não sendo verificar o app.
-- ---------------------------------------------------------------------------

alter table public.users
  alter column birth_date drop not null,
  alter column gender     drop not null,
  alter column goal       drop not null,
  alter column chat_pace  drop not null;

-- Confere que nenhuma das quatro ficou para trás.
do $$
declare
  teimosas text;
begin
  select string_agg(column_name, ', ') into teimosas
    from information_schema.columns
   where table_schema = 'public' and table_name = 'users'
     and column_name in ('birth_date','gender','goal','chat_pace')
     and is_nullable = 'NO';
  if teimosas is not null then
    raise exception 'Ainda são not null: %', teimosas;
  end if;
end $$;
