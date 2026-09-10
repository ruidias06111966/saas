-- ---------------------------------------------------------------------------
-- 005 — Promoção de lançamento: 60 dias de Premium para quem chegar cedo
--
-- Quem criar conta até 09/12/2026 ganha 60 dias de Premium, contados da
-- própria data de inscrição. Depois dessa data, cadastro novo nasce no plano
-- gratuito como sempre.
--
-- POR QUE ISTO VIVE NO BANCO, E NÃO NO APP
--
-- `users.plan` é congelada para o cliente pelo gatilho `campos_privilegiados`:
-- ninguém se promove a premium editando o próprio registro. Um app que
-- tentasse conceder a cortesia seria recusado pelo próprio banco — e teria de
-- ser destravado, o que abriria a porta para qualquer pessoa se dar Premium.
--
-- Concedendo aqui, a regra é do servidor, roda dentro da mesma transação do
-- cadastro, e não existe caminho pelo qual o cliente peça a cortesia duas
-- vezes ou fora da janela.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- A janela, num lugar só.
--
-- Fim do dia 09/12/2026 no horário de Brasília. Escrito com fuso explícito
-- porque `now()` no Postgres do Supabase é UTC: sem o fuso, a promoção
-- terminaria três horas antes do que a página promete.
-- ---------------------------------------------------------------------------
create or replace function private.fim_da_promocao() returns timestamptz
language sql immutable set search_path = public as $$
  select timestamptz '2026-12-10 00:00:00-03';
$$;

create or replace function private.dias_de_cortesia() returns interval
language sql immutable set search_path = public as $$
  select interval '60 days';
$$;

-- ---------------------------------------------------------------------------
-- A concessão.
--
-- AFTER INSERT, e não BEFORE: assim não depende da ordem alfabética dos
-- gatilhos para vencer o `campos_privilegiados`, que roda BEFORE e zeraria o
-- plano de volta para 'free'. O UPDATE daqui reacende aquele gatilho, e é por
-- isso que a porta de rotina do servidor é ligada antes — é exatamente para
-- este caso que ela existe.
-- ---------------------------------------------------------------------------
create or replace function private.promocao_de_lancamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if now() >= private.fim_da_promocao() then
    return new;
  end if;

  -- Local à transação: sai sozinha quando o cadastro termina.
  perform set_config('conexao.rotina_do_servidor', 'on', true);

  insert into public.subscriptions (user_id, plan, status, provider, started_at, expires_at)
  values (
    new.id, 'premium', 'ativa', 'cortesia',
    new.created_at,
    new.created_at + private.dias_de_cortesia()
  );

  update public.users set plan = 'premium' where id = new.id;

  return new;
end;
$$;

revoke execute on function private.promocao_de_lancamento() from public, anon, authenticated;

drop trigger if exists promocao_de_lancamento on public.users;
create trigger promocao_de_lancamento
  after insert on public.users
  for each row execute function private.promocao_de_lancamento();

-- ---------------------------------------------------------------------------
-- O fim da cortesia.
--
-- Assinatura do Stripe é rebaixada pelo webhook, quando o Stripe desiste de
-- cobrar. A cortesia não tem webhook nenhum — se ninguém a encerrar, ela vale
-- para sempre, calada. Daí a faxina diária.
--
-- Só toca em quem tem `provider = 'cortesia'`: assinatura paga não é assunto
-- desta função, mesmo que esteja vencida.
-- ---------------------------------------------------------------------------
create or replace function private.expirar_cortesias()
returns integer language plpgsql security definer set search_path = public as $$
declare
  quantos integer;
begin
  perform set_config('conexao.rotina_do_servidor', 'on', true);

  with vencidas as (
    update public.subscriptions
       set status = 'expirada'
     where provider = 'cortesia'
       and status = 'ativa'
       and expires_at is not null
       and expires_at <= now()
    returning user_id
  ),
  -- Rebaixa só quem não arrumou uma assinatura paga no meio do caminho.
  rebaixados as (
    update public.users u
       set plan = 'free'
      from vencidas v
     where u.id = v.user_id
       and not exists (
         select 1 from public.subscriptions s
          where s.user_id = u.id
            and s.status = 'ativa'
            and s.provider is distinct from 'cortesia'
       )
    returning u.id
  )
  select count(*) into quantos from rebaixados;

  return quantos;
end;
$$;

revoke execute on function private.expirar_cortesias() from public, anon, authenticated;

-- Uma vez por dia, de madrugada. O minuto quebrado é de propósito: tarefa
-- agendada na hora cheia disputa espaço com todas as outras do servidor.
create extension if not exists pg_cron;

select cron.unschedule('expirar-cortesias')
 where exists (select 1 from cron.job where jobname = 'expirar-cortesias');

select cron.schedule(
  'expirar-cortesias', '17 6 * * *',   -- 06:17 UTC = 03:17 em Brasília
  $cron$ select private.expirar_cortesias(); $cron$
);

-- ---------------------------------------------------------------------------
-- Quem já estava aqui antes da promoção existir.
--
-- As pessoas que se cadastraram antes desta migração não passaram pelo gatilho
-- acima. Recebem a cortesia contada da inscrição delas, e não de hoje — quem
-- entrou dia 8 ganha até dia 7 de novembro, não até dia 9.
--
-- `on conflict do nothing` não serve aqui porque não há chave única em
-- user_id; o `not exists` é o que impede conceder duas vezes se esta migração
-- for reexecutada.
-- ---------------------------------------------------------------------------
do $$
declare
  concedidas integer;
begin
  perform set_config('conexao.rotina_do_servidor', 'on', true);

  with novas as (
    insert into public.subscriptions (user_id, plan, status, provider, started_at, expires_at)
    select u.id, 'premium', 'ativa', 'cortesia', u.created_at,
           u.created_at + private.dias_de_cortesia()
      from public.users u
     where u.deleted_at is null
       and u.created_at < private.fim_da_promocao()
       and u.created_at + private.dias_de_cortesia() > now()
       and not exists (select 1 from public.subscriptions s where s.user_id = u.id)
    returning user_id
  )
  update public.users u set plan = 'premium'
    from novas n where u.id = n.user_id;

  get diagnostics concedidas = row_count;
  raise notice 'Cortesia retroativa concedida a % pessoa(s).', concedidas;
end $$;

comment on function private.fim_da_promocao() is
  'Data em que a promoção de lançamento para de conceder cortesia a cadastros novos. Mudar aqui muda o gatilho e a concessão retroativa de uma vez.';
