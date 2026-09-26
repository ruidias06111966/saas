-- ---------------------------------------------------------------------------
-- 016 · A cota de propostas: três por mês no plano gratuito
--
-- Aditiva. Não apaga nada, não muda coluna nenhuma.
--
-- O MODELO, E POR QUE ELE É ASSIM
--
-- Publicar anúncio é de graça, sempre, para todo mundo. Não é generosidade: é
-- a economia de qualquer marketplace. Cobra-se do lado ABUNDANTE e subsidia-se
-- o lado ESCASSO. Em Brasília, na contabilidade e nas licenças, há muito mais
-- contador procurando cliente do que empresa procurando contador — quem
-- publica traz o combustível, e cobrar dele é apagar o fogo.
--
-- Quem paga é o profissional, e só depois de já ter tirado valor: as três
-- propostas gratuitas por mês existem para ele fechar uma antes de assinar.
--
-- POR QUE A REGRA MORA AQUI, E NÃO NA TELA
--
-- Porque limite que só existe no navegador não é limite. Qualquer pessoa com
-- o console aberto manda a quarta proposta direto ao PostgREST, e a cota vira
-- decoração. A tela avisa antes; o banco é quem recusa.
--
-- É a mesma decisão do limite de 5 áreas de atuação (012) e da regra de quem
-- pode aceitar uma proposta (008). O cliente não repete nenhuma delas.
--
-- O QUE CONTA PARA A COTA
--
-- Toda proposta CRIADA no mês corrente, inclusive as retiradas depois. Se
-- retirar devolvesse a cota, bastaria enviar, retirar e reenviar para ter
-- propostas infinitas — e o profissional que fizesse isso estaria, sem querer,
-- avisando dez clientes e sumindo com todos.
--
-- O mês é o do servidor, em UTC. Uma proposta enviada em 31/10 às 22h de
-- Brasília cai em novembro. É uma imprecisão conhecida e aceita: o erro é de
-- poucas horas por mês, sempre a favor de quem usa.
-- ---------------------------------------------------------------------------

create or replace function private.cota_de_propostas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plano   plan_type;
  enviadas int;
  limite  constant int := 3;
begin
  -- Sem usuário autenticado é rotina do servidor (semeadura, migração,
  -- correção manual). A cota é do cliente, não do servidor.
  --
  -- Decidido pelo FATO DIRETO, e não consultando
  -- `conexao.rotina_do_servidor`: aquela porta é local à TRANSAÇÃO e o
  -- gatilho de cadastro a deixa aberta o tempo todo. Foi exatamente assim que
  -- a proteção de propostas da 008 nasceu desligada.
  if (select auth.uid()) is null then
    return new;
  end if;

  select u.plan into plano from public.users u where u.id = new.profissional_id;
  if plano = 'premium' then
    return new;
  end if;

  select count(*) into enviadas
    from public.propostas p
   where p.profissional_id = new.profissional_id
     and p.created_at >= date_trunc('month', now());

  if enviadas >= limite then
    raise exception
      'No plano gratuito você envia % propostas por mês, e as suas já foram. Assine o Premium para enviar sem limite, ou espere o mês virar.',
      limite
      using errcode = 'P0100';
  end if;

  return new;
end $$;

comment on function private.cota_de_propostas() is
  'Recusa a quarta proposta do mês de quem está no plano gratuito. O limite de verdade do produto. Ver 016_a_cota_de_propostas.sql.';

drop trigger if exists cota_de_propostas on public.propostas;
create trigger cota_de_propostas
  before insert on public.propostas
  for each row execute function private.cota_de_propostas();

-- --------------------- quantas ainda restam neste mês ----------------------
-- A tela precisa do número ANTES de a pessoa escrever a proposta inteira.
-- Contar no cliente exigiria ler as propostas de terceiros; esta função conta
-- só as de quem pergunta.

create or replace function public.propostas_restantes()
returns int
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when (select u.plan from public.users u where u.id = (select auth.uid())) = 'premium'
      then 2147483647
    else greatest(0, 3 - (
      select count(*)::int from public.propostas p
       where p.profissional_id = (select auth.uid())
         and p.created_at >= date_trunc('month', now())
    ))
  end;
$$;

comment on function public.propostas_restantes() is
  'Quantas propostas ainda cabem no mês de quem pergunta. Devolve um número enorme para quem é Premium. Ver 016_a_cota_de_propostas.sql.';

revoke all on function public.propostas_restantes() from public, anon;
grant execute on function public.propostas_restantes() to authenticated;
