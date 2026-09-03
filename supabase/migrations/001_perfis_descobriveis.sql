-- ---------------------------------------------------------------------------
-- 001 · Camada segura de leitura de perfis alheios
--
-- O QUE MUDA
-- Cria a view `public.perfis_descobriveis`. Nada existente é alterado: nenhuma
-- política, nenhuma tabela, nenhuma função. É seguro aplicar com o site no ar.
--
-- POR QUÊ
-- O RLS do PostgreSQL protege LINHAS, não COLUNAS. A política que deixa uma
-- pessoa ver os perfis das outras autoriza a linha inteira de `public.users` —
-- e a linha inteira carrega `email`, `birth_date`, `approx_lat`, `approx_lng` e
-- `role`. Confirmado contra este banco em 03/09/2026: uma usuária comum lia o
-- e-mail e a data de nascimento de todas as contas ativas.
--
-- Esconder na interface não resolve: o dado já viajou. A correção é não deixá-lo
-- sair do banco.
--
-- POR QUE UMA VIEW COM DIREITOS DO DONO (`security_invoker = false`)
-- É a única forma de a view enxergar `users` inteira para poder DERIVAR idade e
-- distância, enquanto projeta só o que é seguro. Com `security_invoker = true`
-- ela herdaria o RLS do chamador e devolveria apenas a própria linha.
--
-- Isso a torna uma superfície privilegiada, da mesma classe das RPCs
-- `security definer` que o projeto já usa. O que a mantém segura é o WHERE
-- abaixo, e nada além dele. Qualquer alteração aqui exige o mesmo rigor de uma
-- política de RLS.
--
-- O detector do Supabase vai sinalizar esta view (`security_definer_view`).
-- É esperado e intencional.
-- ---------------------------------------------------------------------------

create or replace view public.perfis_descobriveis
with (security_invoker = false) as
select
  u.id,
  u.name,
  u.gender,
  u.city,
  u.state,
  u.photo_url,
  u.extra_photos,
  u.profession,
  u.bio,
  u.goal,
  u.chat_pace,
  u.verified,
  u.reputation,
  u.plan,
  u.status,
  u.created_at,
  u.last_active_at,

  -- DERIVADO, não bruto. A tela sempre quis a idade; `birth_date` era só o
  -- caminho até ela, e carregava o dia e o mês de brinde.
  date_part('year', age(current_date, u.birth_date))::int as idade,

  -- DERIVADO, não bruto. O cliente calculava a distância a partir de duas
  -- coordenadas; agora recebe só o resultado. Uma distância não permite
  -- trilateração, um par de coordenadas de toda a base permite.
  case
    when eu.approx_lat is null or u.approx_lat is null then null
    else round(
      (6371 * acos(least(1, greatest(-1,
        cos(radians(eu.approx_lat)) * cos(radians(u.approx_lat))
          * cos(radians(u.approx_lng) - radians(eu.approx_lng))
        + sin(radians(eu.approx_lat)) * sin(radians(u.approx_lat))
      ))))::numeric, 1)
  end as distancia_km

from public.users u
-- A própria linha de quem chama, só para a conta de distância.
left join lateral (
  select m.approx_lat, m.approx_lng
  from public.users m
  where m.id = auth.uid()
) eu on true

where
  -- As mesmas regras de sempre: conta ativa, não excluída, sem bloqueio entre
  -- as partes. Reusar a função em vez de repetir a condição garante que uma
  -- mudança futura nas regras valha aqui também.
  private.perfil_visivel(u.id)

  -- A própria pessoa não se descobre. Ela lê a própria linha direto de `users`,
  -- onde tem acesso completo — inclusive ao e-mail, que é dela.
  and u.id <> auth.uid()

  -- Administração não aparece na descoberta. Antes o cliente recebia `role` e
  -- filtrava sozinho, o que significava entregar a todo mundo a lista de quem
  -- é administrador — informação que só ajuda quem procura um alvo. Agora a
  -- linha simplesmente não sai.
  and u.role <> 'admin';

comment on view public.perfis_descobriveis is
  'Perfis visíveis para descoberta, sem e-mail, sem data de nascimento, sem coordenadas e sem papel. Idade e distância vêm derivadas. Ver 001_perfis_descobriveis.sql.';

-- `anon` não lê nada neste projeto, e esta view não é exceção.
revoke all on public.perfis_descobriveis from public, anon;
grant select on public.perfis_descobriveis to authenticated;
