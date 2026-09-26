-- ---------------------------------------------------------------------------
-- 013 · A limpeza: o que era de relacionamento sai do banco
--
-- ⚠️  NÃO APLICAR ANTES DO DEPLOY DA FASE 2.
--
-- Esta é a segunda migração do repositório que QUEBRA A VERSÃO PUBLICADA se
-- for aplicada fora de ordem — a primeira foi a 002, e a lição custou caro o
-- bastante para estar escrita no cabeçalho dela até hoje.
--
-- O banco de produção é um só, compartilhado entre o site que está no ar e
-- qualquer ramo em desenvolvimento. A versão publicada HOJE ainda pede
-- `birth_date`, `gender`, `goal` e `chat_pace` de `public.users`, e ainda lê
-- `perfis_descobriveis`. No instante em que estas colunas caírem, aquela
-- versão para de carregar — não degrada: para.
--
-- A ORDEM CORRETA, e não há atalho:
--
--   1. 012 aplicada            (aditiva, já feito)
--   2. CLIENTE DA FASE 2 PUBLICADO E FUNCIONANDO
--   3. esta migração
--
-- Entre 2 e 3 não há pressa nenhuma: as colunas ficam paradas, sem ninguém
-- lendo, e não fazem mal a ninguém. A pressa é que faz mal.
--
-- O QUE SAI
--
--   tabelas   profiles, preferences, user_interests, interests,
--             prompt_answers, prompts
--   colunas   users.birth_date, users.gender, users.goal, users.chat_pace
--   view      perfis_descobriveis
--   funções   compatibility_score
--   redefine  fila_de_verificacao, que devolvia a data de nascimento
--
-- O QUE FICOU DE FORA, E POR QUÊ
--
-- A renomeação de `daily_usage.interests` para `contatos` estava aqui e SAIU,
-- para a 017. A verificação de véspera mostrou que `backend.bumpUsage` ainda
-- lê e escreve nessa coluna pelo nome antigo, em quatro pontos. Renomear hoje
-- quebraria o pedido de conversa no app publicado — exatamente o erro que a
-- 014 e a 015 corrigiram há poucas horas, e que esta migração existe para não
-- repetir.
--
-- A `fila_de_verificacao` é o outro achado. Ela devolve `u.birth_date` como
-- `nascimento`, e a tela do revisor mostrava "38 anos" ao lado do nome. Não
-- dava para dropar a coluna sem redefinir a função e mudar a tela junto — e a
-- idade não volta: num perfil profissional ela não deve aparecer. No lugar
-- entra a profissão, que é o que o revisor precisa ver.
--
-- E POR QUE A IDADE SAI JUNTO
--
-- `birth_date` não é só "um campo a menos". Ela era a origem da idade mostrada
-- ao lado do nome, e idade ao lado do nome num perfil PROFISSIONAL é convite
-- para discriminação etária — o tipo de coisa que um marketplace de trabalho
-- não deve facilitar. A exigência legal de 18 anos continua valendo e continua
-- registrada: é o consentimento `maioridade`, na tabela `consents`, que esta
-- migração não toca.
--
-- O QUE FICA, E DE PROPÓSITO
--
--   consents              registro legal, inclusive o de maioridade
--   connections/messages  a conversa continua existindo, agora sobre trabalho
--   conversation_health   o termômetro sobreviveu ao pivô
--   verification_requests o selo vale mais num mercado do que valia no namoro
--   blocks/reports        segurança não muda de assunto
--
-- COMO REVERTER
-- Não há reversão possível depois do drop: os dados vão junto. O que existe é
-- o backup em texto tirado antes da limpeza das linhas, em 25/09/2026, com a
-- única conta que existia. Se isto for aplicado com uma base real, tire um
-- `pg_dump` das seis tabelas ANTES.
-- ---------------------------------------------------------------------------

begin;

-- ------------------------ 1. a view antiga primeiro ------------------------
-- Ela depende de birth_date e das coordenadas; enquanto existir, o alter table
-- abaixo é recusado.

drop view if exists public.perfis_descobriveis;

-- ---------------------- 2. as funções que dependiam -----------------------
-- `compatibility_score` lia personality, lifestyle e interesses para pontuar
-- afinidade entre duas pessoas. Não há o que preservar: o conceito inteiro
-- saiu do produto.

drop function if exists public.compatibility_score(uuid, uuid);

-- ------------------- 2b. a fila do revisor, sem a idade -------------------
-- Ela devolve `u.birth_date` como `nascimento`; enquanto for assim, o
-- `drop column` abaixo é recusado. A idade sai e a profissão entra — é o que
-- um revisor de verificação profissional precisa ver ao lado do rosto.
--
-- O CLIENTE QUE LÊ ISTO JÁ FOI PUBLICADO. `services/verification.ts` pede
-- `profissao` e não pede mais `nascimento`. A ordem é a mesma de sempre, e
-- desta vez foi respeitada.
--
-- É `drop` e depois `create`, e não `create or replace`. O Postgres recusa
-- trocar o TIPO DE RETORNO de uma função existente:
--
--     42P13: cannot change return type of existing function
--     DETAIL: Row type defined by OUT parameters is different.
--
-- Aqui a coluna `nascimento date` vira `profissao text`, o que muda o tipo da
-- linha devolvida. E derrubar a função apaga as permissões dela — por isso os
-- `grant` no fim, que devolvem exatamente o que ela tinha antes.

drop function if exists public.fila_de_verificacao();

create function public.fila_de_verificacao()
returns table (
  id uuid, user_id uuid, nome text, pose text,
  criado_em timestamptz, foto_base text, cidade text, profissao text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.id, r.user_id, u.name, r.pose, r.created_at, u.photo_url, u.city, u.profession
  from public.verification_requests r
  join public.users u on u.id = r.user_id
  where r.status = 'pendente' and private.is_admin()
  order by r.created_at;
$$;

comment on function public.fila_de_verificacao() is
  'A fila do revisor. Devolve profissão, e não mais idade: num perfil profissional a idade não deve aparecer. Ver 013_a_limpeza_do_relacionamento.sql.';

-- As permissões que o `drop` levou embora. `anon` nunca teve, e continua sem:
-- a função já se protege por dentro com `private.is_admin()`, mas defesa em
-- duas camadas custa uma linha.
revoke all on function public.fila_de_verificacao() from public, anon;
grant execute on function public.fila_de_verificacao() to authenticated, service_role;

-- --------------------------- 3. as seis tabelas ---------------------------
-- Ordem importa: as de ligação antes dos catálogos.

drop table if exists public.user_interests;
drop table if exists public.prompt_answers;
drop table if exists public.interests;
drop table if exists public.prompts;
drop table if exists public.preferences;
drop table if exists public.profiles;

-- --------------------------- 4. as quatro colunas -------------------------

alter table public.users
  drop column if exists birth_date,
  drop column if exists gender,
  drop column if exists goal,
  drop column if exists chat_pace;

-- ------------------------------ 5. conferir -------------------------------
-- Falha alto e desfaz tudo se alguma coluna teimar em continuar existindo.

do $$
declare
  sobrando text;
begin
  select string_agg(column_name, ', ') into sobrando
    from information_schema.columns
   where table_schema = 'public' and table_name = 'users'
     and column_name in ('birth_date', 'gender', 'goal', 'chat_pace');
  if sobrando is not null then
    raise exception 'A limpeza não completou: ainda existem as colunas %', sobrando;
  end if;

  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public'
       and table_name in ('profiles','preferences','user_interests','interests','prompt_answers','prompts')
  ) then
    raise exception 'A limpeza não completou: ainda existem tabelas de relacionamento.';
  end if;
end $$;

commit;
