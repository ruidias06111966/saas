-- ---------------------------------------------------------------------------
-- 004 — Inscrições de notificação no aparelho (Web Push)
--
-- Guarda o endereço que o navegador entrega quando a pessoa aceita receber
-- aviso no celular. Uma linha por APARELHO, não por pessoa: quem usa o app no
-- telefone e no notebook tem duas, e quem troca de telefone deixa uma velha
-- para trás — daí a limpeza automática no fim deste arquivo.
--
-- POR QUE ISTO É DADO SENSÍVEL
--
-- O `endpoint` é uma URL única emitida pelo serviço de push do fabricante
-- (Google, Mozilla, Apple). Ele identifica um aparelho específico de uma
-- pessoa específica, e quem o tiver junto com as chaves pode ENTREGAR
-- notificação naquele aparelho. Num aplicativo de relacionamentos isso é
-- capaz de revelar que alguém tem conta aqui — exatamente o que o resto do
-- sistema evita. Por isso:
--
--   * RLS fecha a tabela: cada pessoa só enxerga as próprias linhas.
--   * NENHUMA política de leitura para outras pessoas, nem para admin.
--   * Só a Edge Function `notificar`, com service_role, lê as linhas de
--     terceiros — e ela nunca devolve o conteúdo delas para quem chamou.
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  -- A URL do serviço de push é a chave natural: já é única por aparelho, e
  -- reinscrever o mesmo navegador tem de atualizar a linha, não criar outra.
  endpoint   text primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  -- As duas chaves que o navegador gera. Sem elas o servidor não consegue
  -- cifrar o conteúdo — o padrão exige que a carga vá cifrada ponta a ponta,
  -- de modo que nem o Google lê o texto do aviso.
  p256dh     text not null,
  auth       text not null,
  -- Só para a pessoa reconhecer o aparelho numa futura tela de "aparelhos
  -- conectados". Não é usado em decisão nenhuma.
  user_agent text,
  created_at timestamptz not null default now(),
  -- Última entrega aceita. Serve para faxina: inscrição que o serviço de push
  -- recusa com 404/410 está morta e é apagada na hora.
  last_ok_at timestamptz
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Uma política só, para as quatro operações: a pessoa manda nas próprias
-- inscrições e não sabe da existência das outras.
drop policy if exists "dono gerencia as próprias inscrições" on public.push_subscriptions;
create policy "dono gerencia as próprias inscrições"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.push_subscriptions is
  'Inscrições de Web Push, uma por aparelho. Só o dono lê as próprias; a Edge Function `notificar` lê as de terceiros com service_role e nunca as devolve.';

-- ---------------------------------------------------------------------------
-- Excluir a conta tem de levar as inscrições junto.
--
-- A FK com `on delete cascade` já cobre o caminho normal. Este bloco existe
-- para o caso de `delete_my_account()` apagar em ordem própria: se a função
-- existir e não mencionar a tabela nova, o aviso abaixo aparece na migração em
-- vez de a linha ficar órfã em silêncio.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc where proname = 'delete_my_account')
     and not exists (
       select 1 from pg_proc
       where proname = 'delete_my_account'
         and prosrc like '%push_subscriptions%'
     )
  then
    raise notice 'delete_my_account() nao cita push_subscriptions; a exclusao depende da FK on delete cascade (que existe e basta).';
  end if;
end $$;
