-- ---------------------------------------------------------------------------
-- 014 · O crachá estava sem o resumo (e o app não abria)
--
-- CORREÇÃO DE UMA QUEBRA EM PRODUÇÃO, causada pela 012 junto com o cliente da
-- Fase 2. Relatada pelo dono do projeto: "aplicativo não abre corretamente".
--
-- O QUE ACONTECEU
--
-- `services/backend.ts` tem uma constante, `CAMPOS_COMUNS`, com as colunas de
-- perfil usadas pelos DOIS caminhos de leitura: o próprio registro, que vem da
-- TABELA `public.users`, e o de terceiros, que vem da VIEW do crachá.
--
-- Uma lista só para duas fontes diferentes. Funcionou enquanto as duas tinham
-- as mesmas colunas. A 012 reescreveu a view acrescentando `atende_remoto` e
-- `anos_experiencia` — e, sem perceber, DEIXOU DE FORA três que a lista pedia:
--
--     bio, extra_photos, plan
--
-- O PostgREST não perdoa: pedir uma coluna que a view não tem devolve
--
--     42703 — column "bio" does not exist
--
-- e o carregamento inteiro do app falha. Não é um perfil que fica incompleto:
-- é `loadSnapshot` que levanta exceção, e o app não termina de abrir. Para
-- ninguém.
--
-- POR QUE PASSOU PELOS TESTES E PELO BUILD
--
-- Porque nada disso é TypeScript. `CAMPOS_COMUNS` é uma string que só o
-- servidor interpreta, e os 53 testes rodam sem banco. O compilador não tem
-- como saber que a view perdeu uma coluna — e eu tinha testado a 012 com nove
-- verificações em SQL, nenhuma delas pedindo as colunas que o CLIENTE pede.
--
-- A lição é a de sempre, e desta vez custou o app no ar: verificar a migração
-- não é verificar o app. Faltou a consulta que o cliente realmente faz.
--
-- A CORREÇÃO
--
-- As três colunas voltam para a view. Nenhuma é exposição nova: as três já
-- saíam em `perfis_descobriveis` desde a 001. `bio` é hoje o resumo
-- profissional — é o texto que faz alguém ser escolhido, e sem ele a busca por
-- profissionais mostraria cartões mudos.
--
-- O telefone continua fora, e continua sendo o ponto todo.
-- ---------------------------------------------------------------------------

create or replace view public.perfis_do_mercado
with (security_invoker = false, security_barrier = true) as
select
  u.id,
  u.name,
  u.profession,
  u.bio,
  u.city,
  u.state,
  u.photo_url,
  u.extra_photos,
  u.verified,
  u.reputation,
  u.plan,
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
  'Crachá público de quem participa do mercado: nome, profissão, resumo, cidade, fotos, verificado, reputação, plano e atendimento. Sem e-mail, sem nascimento, sem coordenadas, sem papel e SEM TELEFONE. Ver 009, 012 e 014.';

-- Obrigatório depois de todo `create or replace view`: os privilégios padrão
-- do Supabase devolvem TUDO a `authenticated` a cada recriação. A 010 explica
-- por que isso é grave numa view com direitos do dono.
revoke all on public.perfis_do_mercado from public, anon, authenticated;
grant select on public.perfis_do_mercado to authenticated;
