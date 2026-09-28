-- ---------------------------------------------------------------------------
-- 022 — Paga quem bate na porta dos outros.
--
-- A REGRA, NAS PALAVRAS DE QUEM A DEFINIU
--
--   "quem publica não paga, para responder ao que publica também não precisa
--    pagar, pois alguém aceitou seu anúncio e sim esse precisa pagar, só paga
--    para responder a anúncios que não foi ele que publicou"
--
-- Em uma linha: PAGA QUEM BATE NA PORTA DOS OUTROS. Quem abre a própria porta
-- nunca paga.
--
-- Isso não é generosidade, é a economia do lugar: se quem publicou não
-- conseguir responder, o profissional que pagou recebe silêncio — e cancela.
-- O lado que paga só continua pagando enquanto o outro lado responde.
--
-- ONDE O PORTÃO FICA, E ONDE NÃO FICA
--
--   propostas INSERT ...... PORTÃO. A policy já exige `autor_id <> auth.uid()`,
--                           então TODA proposta é, por definição, bater na
--                           porta de outra pessoa. Exigir plano aqui é exato.
--
--   connections INSERT .... PORTÃO, COM UMA EXCEÇÃO. Pedir conversa é bater na
--                           porta — salvo quando a pessoa JÁ VEIO ATÉ MIM
--                           (propôs num anúncio meu). Sem essa exceção, quem
--                           publicou e aceitou uma proposta seria barrado ao
--                           tentar conversar com quem ele mesmo escolheu.
--
--   propostas UPDATE ...... SEM PORTÃO. É aqui que o dono aceita ou recusa.
--                           Cobrar por isto quebraria a regra inteira.
--
--   messages INSERT ....... SEM PORTÃO. A policy já exige conexão `conectada`.
--                           Quem chegou até uma conversa aberta já passou pelo
--                           portão certo, ou não precisava passar. Cobrar aqui
--                           deixaria conversas mudas no meio — inclusive as de
--                           quem pagou e cujo plano venceu depois.
--
-- POR QUE UMA RESTRIÇÃO CHECK, E NÃO UM ENUM
--
-- `subscriptions.status` é texto livre hoje, e um erro de digitação no webhook
-- ('ativo' em vez de 'ativa') liberaria ou travaria acesso sem erro nenhum.
--
-- A correção óbvia seria um enum. Seria um TIRO NO PÉ: o webhook do Stripe
-- chama `aplicar_assinatura_stripe(..., novo_status text, ...)`, que repassa o
-- texto a `private.aplicar_assinatura`, que o insere na coluna. Postgres não
-- converte text→enum numa inserção, então o enum quebraria o caminho do
-- dinheiro na primeira cobrança — e só se descobriria com um cliente real
-- pagando e não recebendo acesso.
--
-- A restrição CHECK dá a mesma garantia sem tocar em nada do pagamento.
--
-- `pagamento_pendente` entra na lista por completude (§22 do pedido). NADA o
-- escreve hoje, de propósito: o webhook espera o Stripe desistir antes de
-- rebaixar alguém, para não punir quem só trocou de cartão.
--
-- SEM_PLANO não é um status: é a ausência de linha. Guardar "não tem" como
-- linha seria inventar um estado que o mundo não tem.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Os status ganham nome fixo.
-- ---------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists status_conhecido;
alter table public.subscriptions
  add constraint status_conhecido
  check (status in ('ativa', 'expirada', 'cancelada', 'pagamento_pendente'));

-- ---------------------------------------------------------------------------
-- 2. A ÚNICA fonte da verdade sobre "esta pessoa tem plano?".
--
-- Não lê `users.plan`. Aquela coluna é um espelho mantido pelo webhook, e
-- espelho atrasa: o que vale é a assinatura em si, com a data de validade.
-- Uma pessoa pode ter mais de uma linha (cortesia E Stripe) — qualquer uma
-- viva basta.
-- ---------------------------------------------------------------------------
create or replace function private.tem_plano_ativo(quem uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.subscriptions s
     where s.user_id = quem
       and s.status = 'ativa'
       and (s.expires_at is null or s.expires_at > now())
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. "Esta pessoa já veio até mim?"
--
-- Verdadeiro quando ela propôs em algum anúncio MEU. A partir daí, falar com
-- ela é responder — não é bater na porta de ninguém.
-- ---------------------------------------------------------------------------
create or replace function private.veio_ate_mim(eu uuid, outro uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from public.propostas p
      join public.anuncios a on a.id = p.anuncio_id
     where a.autor_id = eu
       and p.profissional_id = outro
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. A regra, num lugar só.
-- ---------------------------------------------------------------------------
create or replace function private.pode_iniciar_conversa(eu uuid, outro uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select private.tem_plano_ativo(eu) or private.veio_ate_mim(eu, outro);
$$;

grant execute on function private.tem_plano_ativo(uuid)          to authenticated;
grant execute on function private.veio_ate_mim(uuid, uuid)       to authenticated;
grant execute on function private.pode_iniciar_conversa(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. O portão em `propostas`.
--
-- A condição antiga fica INTEIRA — ela é que garante que ninguém propõe no
-- próprio anúncio, que o anúncio está aberto e que não venceu. O plano é uma
-- exigência A MAIS, não uma troca.
-- ---------------------------------------------------------------------------
drop policy if exists "profissional envia a própria proposta" on public.propostas;
drop policy if exists "responder a anúncio alheio exige plano ativo" on public.propostas;
create policy "responder a anúncio alheio exige plano ativo"
on public.propostas for insert to authenticated
with check (
  profissional_id = (select auth.uid())
  and exists (
    select 1 from public.anuncios a
     where a.id = propostas.anuncio_id
       and a.status = 'aberto'
       and a.expires_at > now()
       and a.autor_id <> (select auth.uid())
  )
  and private.tem_plano_ativo((select auth.uid()))
);

-- ---------------------------------------------------------------------------
-- 6. O portão em `connections`, com a exceção de quem já veio até mim.
-- ---------------------------------------------------------------------------
drop policy if exists "participantes criam a conexão" on public.connections;
drop policy if exists "quem bate na porta paga; quem já foi procurado não" on public.connections;
create policy "quem bate na porta paga; quem já foi procurado não"
on public.connections for insert to authenticated
with check (
  (user_a = (select auth.uid()) or user_b = (select auth.uid()))
  and private.pode_iniciar_conversa(
    (select auth.uid()),
    case when user_a = (select auth.uid()) then user_b else user_a end
  )
);

-- ---------------------------------------------------------------------------
-- 7. A mensagem de erro que a pessoa lê.
--
-- Sem isto a RLS recusa com "new row violates row-level security policy", que
-- não diz nada a ninguém. O gatilho roda ANTES do WITH CHECK e devolve uma
-- frase em português, com o mesmo errcode P0100 que o cliente já traduz.
--
-- A cota de 3 por mês SAI: no modelo novo não há plano gratuito para responder.
-- ---------------------------------------------------------------------------
create or replace function private.exige_plano_para_responder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Sem usuário autenticado é rotina do servidor (faxina, migração, painel).
  -- Decidido pelo fato direto, e não por `conexao.rotina_do_servidor`, que é
  -- local à transação e fica aberta pelo gatilho de cadastro — foi assim que a
  -- proteção da 008 nasceu desligada.
  if (select auth.uid()) is null then
    return new;
  end if;

  if private.tem_plano_ativo(new.profissional_id) then
    return new;
  end if;

  raise exception
    'Para responder a um anúncio de outra pessoa você precisa de um plano ativo. Publicar o que você precisa, ou o que você oferece, é sempre de graça.'
    using errcode = 'P0100';
end;
$$;

drop trigger if exists cota_de_propostas on public.propostas;
drop trigger if exists exige_plano_para_responder on public.propostas;
create trigger exige_plano_para_responder
  before insert on public.propostas
  for each row execute function private.exige_plano_para_responder();

drop function if exists private.cota_de_propostas();

-- ---------------------------------------------------------------------------
-- Verificação. Falha a migração se qualquer afirmação acima não for verdade.
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
begin
  select count(*) into n from pg_constraint
   where conrelid = 'public.subscriptions'::regclass and conname = 'status_conhecido';
  if n <> 1 then raise exception 'a restrição status_conhecido não ficou aplicada'; end if;

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'private'
     and p.proname in ('tem_plano_ativo', 'veio_ate_mim', 'pode_iniciar_conversa', 'exige_plano_para_responder');
  if n <> 4 then raise exception 'esperava 4 funções novas, encontrei %', n; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'propostas' and cmd = 'INSERT';
  if n <> 1 then raise exception 'propostas devia ter exatamente 1 policy de INSERT, tem %', n; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'propostas' and cmd = 'INSERT'
     and with_check like '%tem_plano_ativo%';
  if n <> 1 then raise exception 'a policy de propostas não exige plano ativo'; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'connections' and cmd = 'INSERT'
     and with_check like '%pode_iniciar_conversa%';
  if n <> 1 then raise exception 'a policy de connections não chama pode_iniciar_conversa'; end if;

  -- O portão NÃO pode ter encostado nestas duas.
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'messages' and cmd = 'INSERT'
     and with_check like '%plano%';
  if n <> 0 then raise exception 'mensagens não podem exigir plano — conversa aberta é livre'; end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'propostas' and cmd = 'UPDATE'
     and coalesce(qual, '') like '%plano%';
  if n <> 0 then raise exception 'aceitar uma proposta não pode exigir plano — é o anúncio do dono'; end if;

  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'propostas' and t.tgname = 'cota_de_propostas' and not t.tgisinternal;
  if n <> 0 then raise exception 'o gatilho antigo da cota de 3 por mês ainda está lá'; end if;

  raise notice 'OK — portão aplicado em propostas e connections; mensagens e aceite intocados';
end $$;
