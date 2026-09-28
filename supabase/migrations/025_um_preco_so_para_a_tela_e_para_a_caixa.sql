-- ===========================================================================
-- 025 — O PREÇO PASSA A MORAR NUM LUGAR SÓ
--
-- O DEFEITO QUE ESTA MIGRAÇÃO EXISTE PARA MATAR
--
-- Até aqui o preço vivia em DOIS lugares que ninguém obrigava a concordar:
--
--   constants.ts .................. 'R$ 39,90'   (o que a pessoa LÊ)
--   functions/assinar/index.ts .... 2990         (o que o cartão PAGA)
--
-- O primeiro virou 39,90 no PR #20. O segundo nasceu 2990 no PR #5 e ficou.
-- Havia um teste guardando o PREÇO DOS TERMOS contra a tela — o documento foi
-- protegido, e a caixa registadora não. Ninguém foi cobrado a menos porque
-- nenhum pagamento real chegou a acontecer.
--
-- A correção não é acertar os dois números. É NÃO HAVER DOIS. A partir daqui o
-- preço vive nesta tabela, e tanto a tela quanto o checkout leem daqui. Não há
-- constante para divergir porque não há constante.
--
-- POR QUE UMA TABELA, E NÃO UMA VARIÁVEL DE AMBIENTE
--
-- O dono pediu poder mudar o preço sozinho. Variável de ambiente exige
-- republicar a função; tabela com RLS é uma tela de administração. E o preço
-- fica versionado, com quem mudou e quando.
--
-- O QUE O ADMINISTRADOR NÃO PODE FAZER, DE PROPÓSITO
--
-- Não há política de INSERT nem de DELETE. As duas linhas nascem aqui e ficam.
-- O motivo é que o código (tela e checkout) sabe tratar 'mensal' e 'anual' —
-- um terceiro código inventado no painel viraria um plano que ninguém sabe
-- cobrar. O que se edita é nome, preço e se está à venda.
--
-- NÚMEROS DE HOJE, ESCOLHIDOS PELO DONO
--   mensal  R$  49,90
--   anual   R$ 449,00   (dez mensalidades: dois meses de desconto)
-- ===========================================================================

create table if not exists public.planos (
  codigo          text primary key,
  nome            text        not null,
  centavos        integer     not null,
  moeda           text        not null default 'brl',
  intervalo       text        not null,
  stripe_price_id text,
  ativo           boolean     not null default true,
  ordem           smallint    not null default 0,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid,

  -- Só os dois códigos que o código da aplicação sabe cobrar.
  constraint codigo_conhecido    check (codigo in ('mensal', 'anual')),
  constraint intervalo_conhecido check (intervalo in ('month', 'year')),
  constraint moeda_unica         check (moeda = 'brl'),
  -- Um piso e um teto contra o dedo escorregado no painel. Não pega trocar
  -- 49,90 por 4,90 — mas isso a própria tela de Planos denuncia, porque agora
  -- ela mostra ESTE número.
  constraint centavos_plausivel  check (centavos between 500 and 999900),
  constraint nome_tem_texto      check (length(btrim(nome)) between 2 and 40)
);

comment on table  public.planos is
  'O preço que a tela mostra E o que o Stripe cobra. Um lugar só, de propósito.';
comment on column public.planos.stripe_price_id is
  'Preço do catálogo do Stripe, quando houver. A função `assinar` confere se o '
  'valor do catálogo bate com `centavos` e RECUSA abrir o checkout se divergir.';

insert into public.planos (codigo, nome, centavos, intervalo, ordem) values
  ('mensal', 'Mensal', 4990,  'month', 1),
  ('anual',  'Anual',  44900, 'year',  2)
on conflict (codigo) do nothing;

-- Privilégio de tabela é a primeira porta; a RLS é a segunda. Explícito aqui
-- porque depender do "default privileges" do projeto é depender de uma
-- configuração que não está neste arquivo. Nem INSERT nem DELETE, para ninguém.
grant select on public.planos to anon, authenticated;
grant update on public.planos to authenticated;
-- O projeto concede tudo por omissão a tabelas novas. O ensaio mostrou o
-- efeito: apagar um plano não dava erro, dava "0 linhas" — a RLS filtrava em
-- silêncio. Revogar aqui faz a tentativa falhar com voz alta, e deixa a regra
-- escrita em dois lugares em vez de um.
revoke insert, delete, truncate on public.planos from anon, authenticated;
-- E `anon` não muda preço nem com a RLS aberta. Esta linha nasceu de um teste
-- contra a API de verdade: o anônimo tentou mudar o preço e recebeu 200 com
-- lista vazia, em vez de erro. O ensaio dentro do banco não pegou porque lá eu
-- olhava a linha, não o código HTTP.
revoke update on public.planos from anon;

alter table public.planos enable row level security;

-- Quem ainda não entrou precisa ver o preço: é a pergunta que vem ANTES de
-- criar conta. Por isso `anon` também lê.
drop policy if exists "qualquer um vê os planos à venda" on public.planos;
create policy "qualquer um vê os planos à venda"
on public.planos for select to anon, authenticated
using (ativo);

drop policy if exists "administrador vê todos os planos" on public.planos;
create policy "administrador vê todos os planos"
on public.planos for select to authenticated
using (private.is_admin());

drop policy if exists "só administrador muda preço" on public.planos;
create policy "só administrador muda preço"
on public.planos for update to authenticated
using (private.is_admin())
with check (private.is_admin());

-- ---------------------------------------------------------------------------
-- O que o painel PODE mexer numa linha que já existe.
--
-- `codigo`, `intervalo` e `moeda` são contrato com o código e com o Stripe.
-- Mudar 'mensal' para 'year' faria o checkout cobrar uma vez por ano um valor
-- pensado para o mês. O gatilho recusa antes de a RLS falar jargão.
-- ---------------------------------------------------------------------------
create or replace function private.plano_so_muda_o_que_pode()
returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.codigo <> old.codigo or new.intervalo <> old.intervalo or new.moeda <> old.moeda then
    raise exception
      'Aqui muda o nome, o preço e se o plano está à venda. O código, o intervalo e a moeda são fixos.'
      using errcode = 'P0101';
  end if;
  new.atualizado_em  := now();
  new.atualizado_por := (select auth.uid());
  return new;
end;
$f$;

drop trigger if exists plano_so_muda_o_que_pode on public.planos;
create trigger plano_so_muda_o_que_pode
  before update on public.planos
  for each row execute function private.plano_so_muda_o_que_pode();

-- ---------------------------------------------------------------------------
-- QUAL plano a pessoa comprou.
--
-- `subscriptions.plan` só sabe dizer free/premium. Para o painel somar receita
-- mensal e anual é preciso saber qual dos dois foi pago. Fica NULO nas
-- assinaturas de cortesia — que é o que elas são: acesso sem receita.
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists plano_codigo text references public.planos(codigo);

comment on column public.subscriptions.plano_codigo is
  'Qual plano foi pago. NULO = cortesia, ou assinatura anterior à migração 025.';

-- ---------------------------------------------------------------------------
-- O caminho do dinheiro ganha o código do plano — SEM quebrar o que já roda.
--
-- `create or replace` com um parâmetro a mais não substitui: cria uma SEGUNDA
-- função, e o PostgREST passa a ver duas e recusar por ambiguidade. Isso
-- derrubaria o webhook do Stripe. Por isso: derruba a antiga, cria a nova com
-- o parâmetro NOVO tendo DEFAULT, de modo que a chamada de cinco argumentos
-- que o webhook faz hoje continua resolvendo.
-- ---------------------------------------------------------------------------
drop function if exists public.aplicar_assinatura_stripe(uuid, plan_type, text, text, timestamptz);
drop function if exists private.aplicar_assinatura(uuid, plan_type, text, text, text, timestamptz);

create or replace function private.aplicar_assinatura(
  dono uuid, novo_plano plan_type, novo_status text,
  provedor text, id_no_provedor text, expira timestamptz,
  codigo_do_plano text default null
) returns void language plpgsql security definer set search_path to 'public' as $f$
declare
  anterior timestamptz;
begin
  perform set_config('conexao.rotina_do_servidor', 'on', true);

  update public.users set plan = novo_plano where id = dono;

  select s.expires_at into anterior
  from public.subscriptions s
  where s.user_id = dono and s.provider = provedor
  limit 1;

  -- Uma assinatura por pessoa por provedor: a de agora substitui a anterior.
  delete from public.subscriptions where user_id = dono and provider = provedor;
  insert into public.subscriptions
    (id, user_id, plan, status, provider, provider_id, started_at, expires_at, plano_codigo)
  values
    (gen_random_uuid(), dono, novo_plano, novo_status, provedor, id_no_provedor, now(),
     coalesce(expira, anterior), codigo_do_plano);

  perform set_config('conexao.rotina_do_servidor', 'off', true);
end;
$f$;

create or replace function public.aplicar_assinatura_stripe(
  dono uuid, novo_plano plan_type, novo_status text,
  id_no_provedor text, expira timestamptz,
  codigo_do_plano text default null
) returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  perform private.aplicar_assinatura(
    dono, novo_plano, novo_status, 'stripe', id_no_provedor, expira, codigo_do_plano);
end;
$f$;

revoke all on function public.aplicar_assinatura_stripe(uuid, plan_type, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.aplicar_assinatura_stripe(uuid, plan_type, text, text, timestamptz, text) to service_role;
