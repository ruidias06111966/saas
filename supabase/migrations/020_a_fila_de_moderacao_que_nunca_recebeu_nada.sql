-- ---------------------------------------------------------------------------
-- 020 · A fila de moderação nunca recebeu nada
--
-- COMO APARECEU
--
-- O dono criou uma segunda conta e conversou de verdade — a primeira vez que
-- duas pessoas usaram o sistema. Escreveu que combinariam o telefone pelo
-- WhatsApp, a mensagem ganhou a etiqueta "em revisão", e ela nunca saiu.
--
-- O QUE ESTAVA ACONTECENDO
--
-- A mensagem foi entregue normalmente: gravada às 17:02:47 e LIDA pela outra
-- pessoa às 17:02:49. Nada foi bloqueado em momento nenhum.
--
-- Mentira era a etiqueta. Medido:
--
--     linhas na fila de moderação ......... 0
--     gatilho que enfileira ............... nenhum
--     política de INSERT em moderation_queue  NÃO EXISTE
--
-- O cliente "enfileirava" com um `dispatch` que só mexia na memória do próprio
-- navegador. Nunca gravava no servidor — e nem poderia, porque a tabela só tem
-- política de SELECT e UPDATE, ambas para administrador. Ao recarregar a
-- página o item sumia. A tela de Administração esteve vazia desde sempre.
--
-- Então "em revisão" era uma frase sobre uma revisão que não existia, mostrada
-- para SEMPRE, e para os DOIS lados da conversa.
--
-- A DECISÃO
--
-- Quem enfileira passa a ser o BANCO, num gatilho, e não o navegador. Três
-- motivos:
--
--   1. O cliente não tem como esquecer, nem como ser fechado no meio.
--   2. A fila passa a refletir exatamente o que foi GRAVADO, não o que o
--      navegador achou que ia gravar.
--   3. Não precisa abrir `moderation_queue` para escrita de usuário comum —
--      o gatilho é SECURITY DEFINER, e a tabela continua fechada.
--
-- SÓ `risco` É ENFILEIRADO. `atencao` deixa de marcar a mensagem: vira conselho
-- para quem escreve, e nada mais. Num mercado de serviços, combinar o telefone
-- depois de uma proposta aceita é o OBJETIVO do produto — havia uma regra
-- herdada do app de relacionamentos tratando isso como suspeita.
-- ---------------------------------------------------------------------------

create or replace function private.enfileira_moderacao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Só risco grave. `atencao` é conselho a quem escreve, não acusação.
  if new.mod_level is distinct from 'risco' then
    return new;
  end if;

  insert into public.moderation_queue
    (message_id, connection_id, author_id, excerpt, level, categories, source, status)
  values
    (new.id, new.connection_id, new.sender_id,
     left(coalesce(new.body, ''), 240),
     new.mod_level,
     coalesce(new.mod_categories, '{}'),
     'heuristica',
     'pendente')
  on conflict do nothing;

  return new;
end;
$$;

comment on function private.enfileira_moderacao() is
  'Enfileira para revisão humana toda mensagem gravada como risco. Roda no banco, não no navegador: o cliente não tem como esquecer nem como ser fechado no meio.';

drop trigger if exists enfileira_moderacao on public.messages;
create trigger enfileira_moderacao
  after insert on public.messages
  for each row execute function private.enfileira_moderacao();

-- ─── Conferência ──────────────────────────────────────────────────────────
do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.messages'::regclass
       and tgname = 'enfileira_moderacao' and not tgisinternal
  ) then
    raise exception 'O gatilho não ficou instalado.';
  end if;

  -- A tabela continua fechada para escrita de usuário comum: quem escreve é o
  -- gatilho, com os direitos do dono. Se um dia aparecer uma política de
  -- INSERT aqui, é porque alguém abriu a fila para o cliente de novo.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'moderation_queue' and cmd = 'INSERT'
  ) then
    raise exception 'Apareceu política de INSERT em moderation_queue — a fila não deve ser escrita pelo cliente.';
  end if;
end $$;
