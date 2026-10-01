-- ===========================================================================
-- 026 — O PAINEL CONTAVA O QUE O NAVEGADOR TINHA NA MEMÓRIA
--
-- O DEFEITO
--
-- Todos os números do painel administrativo saíam de `state`, isto é, da lista
-- que o navegador CARREGOU. E o que o navegador carrega não é a verdade:
--
--   • as pessoas vinham da view `perfis_do_mercado`, que filtra por
--     `private.perfil_visivel(id)` — e essa função exige `status = 'ativo'` e
--     `deleted_at is null`. Conta suspensa SAI da lista.
--
--     Consequências, as duas reais hoje:
--       - a métrica "Contas suspensas" só sabia dizer ZERO, sempre;
--       - suspender alguém fazia a pessoa DESAPARECER do painel, e o botão
--         "Reativar" existia para uma linha que nunca aparecia. Suspender por
--         engano era irreversível pela tela.
--
--   • as mensagens vinham de `mensagens_recentes(por_conversa := 40)`. A
--     métrica "Mensagens" era, portanto, "mensagens recentes carregadas". Hoje
--     há 17 mensagens numa conversa só, menos que 40, e por isso o número está
--     por acaso certo. Com dez conversas de duzentas mensagens, mostraria 400
--     em vez de 2000 — sem erro nenhum na tela.
--
--   • o PostgREST tem teto de linhas por resposta. Passando dele, a lista
--     corta em silêncio e a contagem passa a ser o teto.
--
-- O BANCO JÁ PERMITIA O CERTO
--
-- Toda policy de leitura destas tabelas já termina em `or private.is_admin()`.
-- O administrador sempre pôde ver tudo. O painel é que nunca perguntou — ele
-- reaproveitava o que a tela do mercado tinha trazido para outro fim.
--
-- A correção é contar no SERVIDOR, sobre TODAS as linhas, e devolver números
-- em vez de listas. De quebra, o painel deixa de trafegar a base inteira para
-- somar.
--
-- MRR E ARR, E POR QUE O PREÇO FICA CONGELADO NA ASSINATURA
--
-- A migração 025 pôs o preço na tabela `planos`, editável pelo dono. Se o MRR
-- lesse `planos.centavos`, aumentar o preço aumentaria a receita PASSADA no
-- relatório — e os Termos acabaram de prometer o contrário: "uma assinatura já
-- contratada mantém o valor contratado".
--
-- Por isso `subscriptions.centavos` guarda quanto AQUELA assinatura custou,
-- copiado de `planos` no instante da contratação. O relatório soma o que foi
-- realmente cobrado, não o que custaria hoje.
-- ===========================================================================

alter table public.subscriptions
  add column if not exists centavos integer;

comment on column public.subscriptions.centavos is
  'Quanto esta assinatura custou, copiado de `planos` na contratação. NULO em '
  'cortesia (não há receita) e nas assinaturas anteriores à migração 026.';

-- ---------------------------------------------------------------------------
-- O caminho do dinheiro passa a congelar o preço.
--
-- Mesmo cuidado da 025: derruba antes de criar, porque `create or replace` com
-- assinatura diferente criaria uma SEGUNDA função e o PostgREST recusaria por
-- ambiguidade — derrubando o webhook do Stripe. Aqui a assinatura não muda,
-- então `create or replace` basta; fica o comentário para quem mexer depois.
-- ---------------------------------------------------------------------------
create or replace function private.aplicar_assinatura(
  dono uuid, novo_plano plan_type, novo_status text,
  provedor text, id_no_provedor text, expira timestamptz,
  codigo_do_plano text default null
) returns void language plpgsql security definer set search_path to 'public' as $f$
declare
  anterior timestamptz;
  preco    integer;
begin
  perform set_config('conexao.rotina_do_servidor', 'on', true);

  update public.users set plan = novo_plano where id = dono;

  select s.expires_at into anterior
  from public.subscriptions s
  where s.user_id = dono and s.provider = provedor
  limit 1;

  -- O preço de HOJE do plano contratado. Depois disto, mudar `planos` não
  -- mexe nesta assinatura — nem na cobrança, nem no relatório.
  if codigo_do_plano is not null then
    select p.centavos into preco from public.planos p where p.codigo = codigo_do_plano;
  end if;

  delete from public.subscriptions where user_id = dono and provider = provedor;
  insert into public.subscriptions
    (id, user_id, plan, status, provider, provider_id, started_at, expires_at,
     plano_codigo, centavos)
  values
    (gen_random_uuid(), dono, novo_plano, novo_status, provedor, id_no_provedor, now(),
     coalesce(expira, anterior), codigo_do_plano, preco);

  perform set_config('conexao.rotina_do_servidor', 'off', true);
end;
$f$;

-- ---------------------------------------------------------------------------
-- OS NÚMEROS DO PAINEL, CONTADOS NO SERVIDOR.
--
-- `security definer` porque conta linhas que o administrador PODE ver, mas
-- contá-las uma a uma no navegador custaria trazer a base inteira. A primeira
-- linha do corpo é a porta: sem `is_admin()`, nada sai daqui.
--
-- Devolve JSON porque são grupos de números de formas diferentes, e uma tabela
-- de trinta colunas seria pior de ler do que o objeto.
--
-- `stable`, não `volatile`: só lê.
-- ---------------------------------------------------------------------------
create or replace function public.painel_do_administrador()
returns json language plpgsql stable security definer set search_path to 'public' as $f$
declare
  resposta json;
  arr      bigint;
  mrr      bigint;
begin
  if not private.is_admin() then
    raise exception 'Somente administradores.' using errcode = '42501';
  end if;

  -- RECEITA ANUAL PRIMEIRO, MENSAL DEPOIS — e a ordem importa.
  --
  -- O caminho natural seria somar o MRR e multiplicar por 12. Com o plano anual
  -- isso ERRA: 44900 / 12 = 3741,67, que truncado dá 3741, e 3741 × 12 = 44892.
  -- O relatório mostraria 44892 onde o banco recebeu 44900.
  --
  -- Então soma-se o ARR, que é dinheiro de verdade — mensal × 12, anual como
  -- está — e o MRR passa a ser o derivado, que é o papel dele: uma conveniência
  -- de leitura. Assim o número que tem de bater com o extrato bate.
  --
  -- Cada assinatura entra pelo valor que ELA contratou. Cortesia tem `centavos`
  -- nulo e soma zero, que é a verdade: acesso sem receita.
  select coalesce(sum(
           case when p.intervalo = 'year' then s.centavos else s.centavos * 12 end
         ), 0)
    into arr
    from public.subscriptions s
    join public.planos p on p.codigo = s.plano_codigo
   where s.status = 'ativa'
     and (s.expires_at is null or s.expires_at > now())
     and s.centavos is not null;

  mrr := round(arr / 12.0);

  select json_build_object(
    'pessoas', json_build_object(
      'total',       (select count(*) from public.users where role <> 'admin' and deleted_at is null),
      'ativas_24h',  (select count(*) from public.users where role <> 'admin' and deleted_at is null
                        and last_active_at > now() - interval '24 hours'),
      'novas_hoje',  (select count(*) from public.users where role <> 'admin' and deleted_at is null
                        and created_at >= date_trunc('day', now())),
      'verificadas', (select count(*) from public.users where role <> 'admin' and deleted_at is null and verified),
      'suspensas',   (select count(*) from public.users where role <> 'admin' and deleted_at is null and status <> 'ativo'),
      'apagadas',    (select count(*) from public.users where deleted_at is not null)
    ),
    'mercado', json_build_object(
      'procuras',        (select count(*) from public.anuncios where tipo_anuncio = 'procurando'),
      'ofertas',         (select count(*) from public.anuncios where tipo_anuncio = 'oferecendo'),
      'abertos',         (select count(*) from public.anuncios where status = 'aberto' and expires_at > now()),
      'com_proposta',    (select count(distinct a.id) from public.anuncios a
                           join public.propostas pr on pr.anuncio_id = a.id),
      'propostas',       (select count(*) from public.propostas),
      'propostas_aceitas',(select count(*) from public.propostas where status = 'aceita')
    ),
    'conversa', json_build_object(
      'conexoes',   (select count(*) from public.connections where status = 'conectada'),
      'conversas',  (select count(distinct connection_id) from public.messages),
      -- Contagem REAL, não "o que o navegador carregou".
      'mensagens',  (select count(*) from public.messages),
      'despedidas', (select count(*) from public.connections where closed_gently)
    ),
    'cuidado', json_build_object(
      'denuncias_abertas', (select count(*) from public.reports
                             where status in ('aberta', 'em_analise')),
      'fila_moderacao',    (select count(*) from public.moderation_queue where status = 'pendente')
    ),
    'dinheiro', json_build_object(
      'assinaturas_ativas', (select count(*) from public.subscriptions
                              where status = 'ativa' and (expires_at is null or expires_at > now())),
      'pagantes',           (select count(*) from public.subscriptions
                              where status = 'ativa' and (expires_at is null or expires_at > now())
                                and centavos is not null),
      'cortesias',          (select count(*) from public.subscriptions
                              where status = 'ativa' and (expires_at is null or expires_at > now())
                                and centavos is null),
      'mensais',            (select count(*) from public.subscriptions
                              where status = 'ativa' and (expires_at is null or expires_at > now())
                                and plano_codigo = 'mensal'),
      'anuais',             (select count(*) from public.subscriptions
                              where status = 'ativa' and (expires_at is null or expires_at > now())
                                and plano_codigo = 'anual'),
      'mrr_centavos',       mrr,
      -- O ARR é somado do que foi contratado; o MRR é o derivado. Ver o
      -- comentário longo acima: na ordem inversa o anual não fecha.
      'arr_centavos',       arr
    ),
    'apurado_em', now()
  ) into resposta;

  return resposta;
end;
$f$;

revoke all on function public.painel_do_administrador() from public, anon;
grant execute on function public.painel_do_administrador() to authenticated;
