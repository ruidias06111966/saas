-- ---------------------------------------------------------------------------
-- 007 — Quem é procurado precisa ficar sabendo
--
-- O app entrou em impasse total, e o diagnóstico só apareceu nos dados: quatro
-- contas, SEIS conexões, todas `pendente`, ZERO mensagens. Com quatro pessoas,
-- seis é exatamente o número máximo de pares possíveis — ou seja, todo mundo
-- já tinha pedido para falar com todo mundo, e ninguém tinha aceitado.
--
-- Ninguém aceitou porque ninguém sabia. O `notify()` do cliente só escrevia no
-- estado do React: nunca chegava ao banco, sumia ao recarregar a página. E não
-- podia chegar — `notifications` tem RLS ligada e NENHUMA política de INSERT,
-- nem para a própria pessoa.
--
-- Isso não é um descuido a corrigir afrouxando a tabela. Deixar o cliente
-- escrever notificações para terceiros seria um canal de spam direto: qualquer
-- pessoa poderia encher a caixa de qualquer outra. O aviso tem de nascer no
-- SERVIDOR, a partir de um fato que o servidor observou — e o fato aqui é a
-- linha de conexão mudando de estado.
--
-- Daí este gatilho. Ele é a única coisa autorizada a criar notificação, e só
-- cria as duas que importam:
--
--   • alguém pediu para conversar com você;
--   • o interesse virou recíproco, e agora dá para conversar.
-- ---------------------------------------------------------------------------

create or replace function private.avisar_da_conexao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_gostou boolean := coalesce((new.likes ->> new.user_a::text)::boolean, false);
  b_gostou boolean := coalesce((new.likes ->> new.user_b::text)::boolean, false);
  pediu uuid;
  recebeu uuid;
  primeiro_nome text;
begin
  -- ---------------------------------------------------------------------
  -- 1. Pedido de um lado só.
  -- ---------------------------------------------------------------------
  if new.status = 'pendente' and (a_gostou <> b_gostou) then
    pediu   := case when a_gostou then new.user_a else new.user_b end;
    recebeu := case when a_gostou then new.user_b else new.user_a end;

    -- Uma vez por conexão. Sem isto, cada UPDATE na linha (favoritar, mudar
    -- compatibilidade) geraria um aviso novo do mesmo pedido antigo.
    if not exists (
      select 1 from public.notifications n
      where n.user_id = recebeu
        and n.kind = 'solicitacao'
        and n.link ->> 'conexao' = new.id::text
    ) then
      select nullif(split_part(btrim(u.name), ' ', 1), '')
        into primeiro_nome
        from public.users u where u.id = pediu;

      insert into public.notifications (user_id, kind, title, body, link)
      values (
        recebeu,
        'solicitacao',
        coalesce(primeiro_nome, 'Alguém') || ' quer conversar com você',
        'Abra Conexões, na aba Solicitações, para aceitar e começar a conversa.',
        -- `name` é a rota que o app entende; `conexao` é só a marca que o
        -- `not exists` acima usa para não repetir o aviso.
        jsonb_build_object('name', 'connections', 'conexao', new.id::text)
      );
    end if;
  end if;

  -- ---------------------------------------------------------------------
  -- 2. Virou recíproco. Os DOIS precisam saber — inclusive quem acabou de
  --    aceitar, porque é o aviso que leva à conversa.
  -- ---------------------------------------------------------------------
  if new.status = 'conectada'
     and (tg_op = 'INSERT' or old.status is distinct from 'conectada') then
    insert into public.notifications (user_id, kind, title, body, link)
    select
      destino,
      'conexao',
      coalesce(
        nullif(split_part(btrim(u.name), ' ', 1), ''),
        'Alguém'
      ) || ': vocês se conectaram',
      'O interesse foi dos dois lados. A conversa já pode começar.',
      jsonb_build_object('name', 'chat', 'id', new.id::text)
    from (values (new.user_a, new.user_b), (new.user_b, new.user_a))
      as p(destino, outro)
    join public.users u on u.id = p.outro
    where not exists (
      select 1 from public.notifications n
      where n.user_id = p.destino
        and n.kind = 'conexao'
        and n.link ->> 'id' = new.id::text
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.avisar_da_conexao() from public, anon, authenticated;

drop trigger if exists avisar_da_conexao on public.connections;
create trigger avisar_da_conexao
  after insert or update on public.connections
  for each row execute function private.avisar_da_conexao();

comment on function private.avisar_da_conexao() is
  'Única fonte de notificações de conexão. Mora no servidor porque `notifications` não tem política de INSERT para o cliente — e não deve ter: seria um canal de spam entre usuários.';

-- ---------------------------------------------------------------------------
-- As seis que ficaram presas.
--
-- Os pedidos que já existiam foram feitos antes deste gatilho e ninguém foi
-- avisado. Um UPDATE que não muda nada faz o gatilho correr para cada um e
-- gerar o aviso que faltou.
-- ---------------------------------------------------------------------------
do $$
declare
  quantos integer;
begin
  update public.connections set likes = likes where status = 'pendente';
  get diagnostics quantos = row_count;
  raise notice 'Gatilho reexecutado para % conexao(oes) pendente(s).', quantos;
end $$;
