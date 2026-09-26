-- ---------------------------------------------------------------------------
-- 019 · O rosto de quem presta serviço é credencial, não recompensa
--
-- O QUE ESTAVA ERRADO
--
-- O Véu era o diferencial do app de relacionamentos: a foto de perfil subia
-- como uma pirâmide de resoluções (12, 24, 48, 96 px e o original), e o banco
-- liberava um nível de cada vez conforme a conversa avançava. A foto era a
-- recompensa de uma conversa que valeu a pena.
--
-- No pivô, o cliente deixou de pedir nível velado — está escrito em
-- `services/media.ts`: "desde o pivô pede sempre o ORIGINAL — não há mais véu".
-- A POLÍTICA DO STORAGE não acompanhou. Medido contra produção:
--
--     nivel_permitido(outra pessoa) para um estranho = 0
--     -orig.jpg (nível 4) ... negado
--     -3 / -2 / -1 ......... negados
--     -0.jpg    (nível 0) ... LIBERADO   ← o mais borrado de todos
--
-- E `resolveImage` desce nível a nível até algo passar, sem erro nenhum. Então
-- não aparecia falha: aparecia a foto borrada — na tela "Quem faz" e no perfil
-- do profissional, exatamente onde alguém decide quem contratar.
--
-- Nunca foi visto porque só existe UMA conta no sistema. Ninguém jamais olhou
-- o perfil de outra pessoa.
--
-- A CORREÇÃO
--
-- A foto de perfil passa a seguir a MESMA regra do crachá: quem o
-- `perfis_do_mercado` mostra, a foto acompanha. Não é uma regra parecida — é a
-- mesma função, `private.perfil_visivel`, que já cobre conta ativa, conta não
-- apagada e bloqueio nos dois sentidos. Duas regras parecidas é como elas
-- divergem; foi assim que este bug nasceu.
--
-- Mais o dono (que vê a própria foto mesmo com a conta suspensa, senão o
-- editor de perfil fica cego) e o administrador (que precisa dela na fila de
-- revisão).
--
-- NÃO MEXE NO QUE JÁ ESTÁ GUARDADO. Os níveis velados continuam no bucket;
-- ninguém mais os pede, e `removeImage` já os apaga quando a foto é trocada.
-- ---------------------------------------------------------------------------

-- ─── 1. A política nova ───────────────────────────────────────────────────
drop policy if exists "foto de perfil respeita o véu" on storage.objects;

create policy "foto de perfil segue o crachá"
on storage.objects for select to authenticated
using (
  bucket_id = 'midia'
  and (storage.foldername(name))[2] = 'perfil'
  and (
    -- o dono, sempre
    (storage.foldername(name))[1] = (select auth.uid())::text
    -- o revisor, para a fila de verificação
    or private.is_admin()
    -- e quem quer que o crachá já mostre
    or private.perfil_visivel(((storage.foldername(name))[1])::uuid)
  )
);

-- ─── 2. As engrenagens do véu saem ────────────────────────────────────────
-- Só depois de provar que mais ninguém as usa. Deixá-las de pé é convidar a
-- mesma divergência de novo: código morto que ainda sabe fazer valer uma
-- regra que o produto não tem mais.
do $$
declare
  usos text;
begin
  select string_agg(quem, ', ') into usos from (
    select p.oid::regprocedure::text as quem from pg_proc p
     where p.prokind = 'f'
       and p.oid not in ('private.nivel_permitido(uuid)'::regprocedure,
                         'private.nivel_do_arquivo(text)'::regprocedure)
       and pg_get_functiondef(p.oid) ~ 'nivel_(permitido|do_arquivo)'
    union all
    select 'política ' || pol.policyname from pg_policies pol
     where coalesce(pol.qual,'') || coalesce(pol.with_check,'') ~ 'nivel_(permitido|do_arquivo)'
  ) t;
  if usos is not null then
    raise exception 'Ainda usam as funções do véu: %', usos;
  end if;
end $$;

drop function if exists private.nivel_permitido(uuid);
drop function if exists private.nivel_do_arquivo(text);

-- ─── 3. Conferência ───────────────────────────────────────────────────────
do $$
declare
  cond text;
begin
  if exists (select 1 from pg_policies
              where schemaname='storage' and tablename='objects'
                and policyname='foto de perfil respeita o véu') then
    raise exception 'A política antiga do véu continua de pé.';
  end if;

  select qual into cond from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname='foto de perfil segue o crachá';
  if cond is null then
    raise exception 'A política nova não foi criada.';
  end if;
  if cond !~ 'perfil_visivel' then
    raise exception 'A política nova não usa a mesma regra do crachá.';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='private' and p.proname in ('nivel_permitido','nivel_do_arquivo')) then
    raise exception 'As funções do véu continuam existindo.';
  end if;
end $$;
