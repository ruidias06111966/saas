-- ---------------------------------------------------------------------------
-- 011 · A política que se mordia
--
-- SEGUNDA CORREÇÃO DA 009, encontrada no teste funcional logo depois de
-- aplicá-la. Esta quebrava a leitura de anúncios por completo:
--
--   ERROR: 42P17: infinite recursion detected in policy for relation "anuncios"
--
-- O CICLO
--
-- A 009 acrescentou à política de leitura de `anuncios` a cláusula "ou quem
-- enviou proposta aqui", escrita como um `exists` sobre `propostas`. Só que a
-- política de leitura de `propostas`, criada pela 008, já consulta `anuncios`
-- para decidir se você é o dono do anúncio:
--
--   anuncios  --(preciso ver propostas)-->  propostas
--   propostas --(preciso ver anuncios)-->   anuncios
--   ...
--
-- O Postgres detecta o ciclo e recusa a consulta inteira. Não é lentidão: é
-- erro. Qualquer conta comum abrindo o quadro receberia isso na cara.
--
-- Não houve estrago: o mercado ainda não está publicado (as telas estão no PR
-- que introduz isto) e não existe nenhum anúncio no banco. O defeito viveu uns
-- minutos, entre aplicar a 009 e testá-la.
--
-- A CORREÇÃO
--
-- A pergunta "eu propus neste anúncio?" sai da política e vai para uma função
-- com direitos do dono, como `private.is_admin()` e `private.perfil_visivel()`
-- já fazem. Direitos do dono não passam pela RLS de `propostas`, então o ciclo
-- não se fecha.
--
-- A função responde uma pergunta só, e sempre sobre QUEM PERGUNTA: ela usa
-- `auth.uid()` internamente e não aceita outro usuário como argumento. Não dá
-- para perguntar "quem propôs naquele anúncio ali".
--
-- POR QUE O TESTE ACHOU E A LEITURA DO CÓDIGO NÃO
--
-- Porque as duas políticas estão em arquivos diferentes, escritas com semanas
-- de distância, e cada uma isolada parece óbvia. O ciclo só existe quando as
-- duas são lidas juntas — que é exatamente o que o banco faz, e o que uma
-- revisão por leitura não faz.
-- ---------------------------------------------------------------------------

create or replace function private.propus_neste_anuncio(alvo uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.propostas p
    where p.anuncio_id = alvo and p.profissional_id = auth.uid()
  );
$$;

comment on function private.propus_neste_anuncio(uuid) is
  'Eu enviei proposta neste anúncio? Direitos do dono para não fechar ciclo entre a RLS de anuncios e a de propostas. Ver 011_a_politica_que_se_mordia.sql.';

drop policy if exists "anúncio aberto é visível a quem tem conta" on public.anuncios;
create policy "anúncio aberto é visível a quem tem conta"
  on public.anuncios for select
  using (
    (status = 'aberto' and expires_at > now())
    or autor_id = (select auth.uid())
    -- Quem se ofereceu aqui não perde o anúncio de vista quando ele fecha.
    or private.propus_neste_anuncio(id)
    or private.is_admin()
  );
