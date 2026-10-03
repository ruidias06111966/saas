-- ===========================================================================
-- 031 — A COLUNA NOVA QUEBROU QUEM LIA A TABELA
--
-- O ACIDENTE, EM UMA FRASE
--
-- A migração 030 acrescentou três colunas a `messages` (`arquivo_path`,
-- `arquivo_nome`, `arquivo_bytes`) e, com isso, quebrou as duas funções que
-- carregam as conversas. O dono do site não conseguiu mais entrar.
--
-- POR QUE "ENTRAR" FOI O QUE PAROU
--
-- Entrar não parou. O que parou foi a CARGA que vem logo depois do login:
-- `loadSnapshot` pede as conversas, as duas funções respondem com erro, e a
-- tela não chega a montar. Para quem está do lado de fora é indistinguível de
-- "o login não funciona" — e foi exatamente assim que o defeito foi relatado.
--
-- A ARMADILHA, QUE VALE GUARDAR
--
-- As duas funções foram declaradas `RETURNS SETOF messages` (migração 026).
-- Isso NÃO quer dizer "devolve linhas desta tabela": quer dizer "devolve linhas
-- do tipo que esta tabela tem AGORA". E o corpo delas lista as colunas uma a
-- uma. Então no instante em que a tabela ganhou a décima segunda coluna, o
-- corpo passou a devolver 11 e a assinatura a exigir 14:
--
--   ERROR 42P13: return type mismatch in function declared to return messages
--   DETAIL: Final statement returns too few columns.
--
-- O Postgres não avisa ao alterar a TABELA. Ele só reclama quando alguém CHAMA
-- a função — isto é, em produção, na cara de quem usa.
--
-- Nenhuma outra função do projeto está declarada `RETURNS SETOF <tabela>`;
-- foi conferido. Estas duas são o caso inteiro.
--
-- A CORREÇÃO JÁ ESTAVA APLICADA NO SERVIDOR
--
-- O conserto foi feito em produção no momento do incidente, porque o sistema
-- estava fora do ar. Esta migração é o mesmo conserto GUARDADO NO CÓDIGO: sem
-- ela, um banco recriado a partir das migrações voltaria a nascer quebrado.
--
-- O que muda em relação à 026: as três colunas de arquivo entram na lista de
-- `select`, na MESMA ORDEM em que existem na tabela — `SETOF` casa por posição,
-- não por nome, e uma ordem trocada passaria pelo Postgres devolvendo o caminho
-- do arquivo no campo do nome.
--
-- O teste que impede a volta: `tests/o-ficheiro-na-conversa.test.ts` recolhe
-- todas as colunas que as migrações dão a `messages` e exige que cada uma
-- apareça nestas duas funções. Na próxima coluna nova, o teste cai ANTES do
-- deploy — que é onde isto tinha de ter caído.
-- ===========================================================================

-- As 40 mensagens mais recentes de cada conversa de quem está pedindo.
create or replace function public.mensagens_recentes(por_conversa int default 40)
returns setof public.messages
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.connection_id, m.sender_id, m.kind, m.body, m.image_url,
         m.ritual_level, m.created_at, m.read_at, m.mod_level, m.mod_categories,
         m.arquivo_path, m.arquivo_nome, m.arquivo_bytes
  from (
    select mm.*,
           row_number() over (partition by mm.connection_id order by mm.created_at desc) as rn
    from public.messages mm
    join public.connections c on c.id = mm.connection_id
    where c.user_a = auth.uid() or c.user_b = auth.uid()
  ) m
  where m.rn <= least(greatest(coalesce(por_conversa, 40), 1), 200)
  order by m.created_at;
$$;

-- A página seguinte, para cima, quando a pessoa rola a conversa.
create or replace function public.mensagens_anteriores(
  conn uuid,
  antes timestamptz,
  limite int default 40
)
returns setof public.messages
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.connection_id, m.sender_id, m.kind, m.body, m.image_url,
         m.ritual_level, m.created_at, m.read_at, m.mod_level, m.mod_categories,
         m.arquivo_path, m.arquivo_nome, m.arquivo_bytes
  from public.messages m
  join public.connections c on c.id = m.connection_id
  where m.connection_id = conn
    and m.created_at < antes
    and (c.user_a = auth.uid() or c.user_b = auth.uid())
  order by m.created_at desc
  limit least(greatest(coalesce(limite, 40), 1), 200);
$$;

-- Quem pode chamar: só quem entrou. Repetido aqui porque `create or replace`
-- preserva as permissões, mas um banco novo nasce sem elas.
revoke all on function public.mensagens_recentes(int) from public, anon;
revoke all on function public.mensagens_anteriores(uuid, timestamptz, int) from public, anon;
grant execute on function public.mensagens_recentes(int) to authenticated;
grant execute on function public.mensagens_anteriores(uuid, timestamptz, int) to authenticated;
