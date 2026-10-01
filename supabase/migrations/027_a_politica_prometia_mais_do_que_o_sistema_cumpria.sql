-- ===========================================================================
-- 027 — A POLÍTICA PROMETIA MAIS DO QUE O SISTEMA CUMPRIA
--
-- O DEFEITO, ACHADO LENDO O DOCUMENTO CONTRA O BANCO
--
-- A tabela "Quem enxerga o quê" da Política de Privacidade dizia:
--
--   Seu e-mail ......... "Só você. Nunca é mostrado a outras pessoas"
--   Seu telefone ....... "Ninguém — até que uma proposta seja aceita. (...)
--                         Não é uma promessa de tela: o servidor se recusa a
--                         entregar o número fora dessa condição"
--   Sua coordenada ..... "Ninguém"
--
-- As três eram falsas para UMA pessoa: o administrador. A policy de leitura de
-- `public.users` terminava em `or private.is_admin()`, e isso abre a LINHA
-- INTEIRA — telefone, coordenada aproximada e e-mail incluídos.
--
-- O documento até tem o hábito certo: na selfie ele escreve "apenas a
-- administração". Nestas três linhas não escreveu.
--
-- DUAS SAÍDAS, E A ESCOLHA FOI DO DONO
--
-- Dava para corrigir o DOCUMENTO — declarar que a administração vê tudo. Seria
-- honesto e barato. O dono escolheu o contrário: corrigir o SISTEMA, para a
-- frase mais forte da política ("o servidor se recusa a entregar o número")
-- voltar a ser verdade sem exceção.
--
-- POR QUE NÃO BASTA REVOGAR A COLUNA
--
-- Privilégio de coluna em Postgres é por PAPEL, não por linha. Revogar
-- `select (telefone)` de `authenticated` tiraria o telefone também do DONO do
-- número, que precisa dele na tela de perfil. RLS resolve linha, não coluna.
--
-- Então: a policy de leitura deixa de abrir para administrador, e o painel passa
-- a ler por uma função que devolve SÓ as colunas de que ele precisa. O telefone
-- e a coordenada deixam de estar ao alcance — não por disciplina de tela, mas
-- porque o banco não os entrega.
--
-- O QUE O ADMINISTRADOR CONTINUA PODENDO
--
-- Suspender, banir e reativar (policy de UPDATE, intocada) e ver a lista do
-- painel, inclusive contas suspensas e apagadas — que foi o que a migração 026
-- consertou e não se perde aqui.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A lista do painel: só o que o painel mostra, e nada além.
--
-- Note o que NÃO está no `returns table`: telefone, approx_lat, approx_lng,
-- bio, photo_url, extra_photos. A ausência é a feature.
--
-- `security definer` para alcançar as contas suspensas, que a policy de leitura
-- (agora restrita ao próprio registro) não entrega. A primeira linha do corpo é
-- a porta.
-- ---------------------------------------------------------------------------
create or replace function public.pessoas_do_painel(
  busca text default '', limite integer default 200
)
returns table (
  id uuid, nome text, email text, cidade text, uf text, profissao text,
  verificada boolean, reputacao integer, plano plan_type, status account_status,
  apagada_em timestamptz, criada_em timestamptz
) language plpgsql stable security definer set search_path to 'public' as $f$
declare
  termo text := btrim(coalesce(busca, ''));
begin
  if not private.is_admin() then
    raise exception 'Somente administradores.' using errcode = '42501';
  end if;

  return query
    -- Os `::text` não são enfeite: `users.state` é `character(2)` e
    -- `reputation` não é `integer`. Sem a conversão o Postgres recusa a função
    -- com "structure of query does not match function result type" — o ensaio
    -- apanhou isto antes da produção.
    select u.id, u.name::text, u.email::text, u.city::text, u.state::text, u.profession::text,
           u.verified, u.reputation::integer, u.plan, u.status, u.deleted_at, u.created_at
      from public.users u
     where u.role <> 'admin'
       and (termo = ''
            or u.name     ilike '%' || termo || '%'
            or u.email     ilike '%' || termo || '%'
            or u.city      ilike '%' || termo || '%')
     order by u.created_at desc
     -- Teto no servidor: um `limite` enorme vindo do navegador não vira uma
     -- varredura da base inteira.
     limit greatest(1, least(coalesce(limite, 200), 500));
end;
$f$;

revoke all on function public.pessoas_do_painel(text, integer) from public, anon;
grant execute on function public.pessoas_do_painel(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- A leitura de `users` deixa de abrir para administrador.
--
-- É esta linha que fazia a política mentir. Depois dela, nem o administrador
-- alcança o telefone ou a coordenada de outra pessoa pela API.
--
-- `(select auth.uid())` em vez de `auth.uid()` de passagem: a forma antiga
-- reavalia a função por LINHA, e o relatório de desempenho do Supabase aponta
-- exatamente esta policy. Mesmo resultado, uma avaliação só.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- SUSPENDER, BANIR E REATIVAR PASSA A IR POR AQUI — E O ENSAIO É QUE ENSINOU.
--
-- A primeira versão desta migração só estreitava a leitura. O ensaio mostrou o
-- preço: `admin REATIVA ... 0 linha(s)`.
--
-- O motivo é que no Postgres um `UPDATE ... WHERE id = X` precisa ENCONTRAR a
-- linha, e encontrar passa pela policy de LEITURA. Estreitar a leitura tirou do
-- administrador a capacidade de moderar — em silêncio, sem erro, só zero linhas.
-- Em produção isso teria quebrado a moderação e ninguém saberia por quê.
--
-- Então a ação deixa de depender da policy: vira função com direitos do dono,
-- que a RLS não filtra. A porta é a primeira linha do corpo, como sempre.
-- ---------------------------------------------------------------------------
create or replace function public.definir_status_da_conta(
  alvo uuid, novo account_status
) returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not private.is_admin() then
    raise exception 'Somente administradores.' using errcode = '42501';
  end if;

  -- Ninguém se suspende a si mesmo por acidente, e ninguém suspende um
  -- administrador pela tela: perder o único acesso administrativo é o tipo de
  -- erro que não tem desfazer.
  if exists (select 1 from public.users u where u.id = alvo and u.role = 'admin') then
    raise exception 'Conta de administrador não se mexe por aqui.' using errcode = 'P0102';
  end if;

  perform set_config('conexao.rotina_do_servidor', 'on', true);
  update public.users set status = novo where id = alvo;
  perform set_config('conexao.rotina_do_servidor', 'off', true);
end;
$f$;

revoke all on function public.definir_status_da_conta(uuid, account_status) from public, anon;
grant execute on function public.definir_status_da_conta(uuid, account_status) to authenticated;

-- ---------------------------------------------------------------------------
-- A leitura de `users` deixa de abrir para administrador.
--
-- É esta linha que fazia a política mentir. Depois dela, nem o administrador
-- alcança o telefone ou a coordenada de outra pessoa pela API.
--
-- `(select auth.uid())` em vez de `auth.uid()` de passagem: a forma antiga
-- reavalia a função por LINHA, e o relatório de desempenho do Supabase aponta
-- exatamente esta policy. Mesmo resultado, uma avaliação só.
-- ---------------------------------------------------------------------------
drop policy if exists "usuário lê o próprio registro" on public.users;
create policy "usuário lê o próprio registro"
on public.users for select to authenticated
using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- E a policy que prometia o que já não entrega sai.
--
-- "admin atualiza qualquer registro" ficou INERTE no instante em que a leitura
-- estreitou: sem achar a linha, não há o que atualizar. Deixá-la seria repetir
-- no esquema o defeito que esta migração corrige no documento — uma regra que
-- diz poder mais do que pode. Quem atualiza agora é a função acima.
-- ---------------------------------------------------------------------------
drop policy if exists "admin atualiza qualquer registro" on public.users;

-- ---------------------------------------------------------------------------
-- E quem nem entrou passa a receber ERRO, não lista vazia.
--
-- Testando de fora pela API, `anon` pedindo `users?select=name,telefone` recebia
-- HTTP 200 com `[]`. Está barrado — nenhuma policy casa com `anon` —, mas
-- barrado em SILÊNCIO. Foi exatamente o que aconteceu com a tabela de preços na
-- Etapa 3, e a lição é a mesma: silêncio é o pior jeito de negar, porque quem
-- investiga conclui que a chamada funcionou e que a tabela está vazia.
--
-- Seguro porque nenhum caminho anônimo lê esta tabela: o cadastro passa pelo
-- GoTrue, e as duas leituras do cliente acontecem depois de entrar.
-- ---------------------------------------------------------------------------
revoke select on public.users from anon;

-- ---------------------------------------------------------------------------
-- O último aviso do relatório de segurança do Supabase.
--
-- `private.marcar_updated_at` não fixava `search_path`. O risco aqui é pequeno
-- — ela é SECURITY INVOKER, roda com os direitos de quem fez o UPDATE, e por
-- isso não há escalada a ganhar. Mas o corpo todo é `new.updated_at := now()`,
-- que só precisa de `pg_catalog`, então o caminho mais estrito possível é de
-- graça: vazio.
-- ---------------------------------------------------------------------------
create or replace function private.marcar_updated_at()
returns trigger language plpgsql set search_path to '' as $f$
begin new.updated_at := now(); return new; end;
$f$;
