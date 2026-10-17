-- ---------------------------------------------------------------------------
-- A COORDENADA SAI DE VEZ — o último dos três passos
--
-- APLICADA À MÃO, PELO PAINEL, EM 17/10/2026
--
-- Este ficheiro NÃO foi aplicado pela ferramenta de migração: ela bloqueia
-- instruções destrutivas, expirando aos 60 segundos sem dizer porquê. Foi
-- corrido pelo dono no SQL Editor do Supabase. Fica aqui porque quem
-- reconstruir este banco de raiz precisa destes dois passos na ordem certa —
-- e porque a razão da ordem é o tipo de coisa que se perde.
--
-- Ver docs/COORDENADAS.md para a medição de o que a ferramenta bloqueia e o
-- que deixa passar (`drop not null` passa; `drop column` não).
--
-- A ORDEM, QUE É A PARTE QUE IMPORTA
--
-- A função vem PRIMEIRO. `delete_my_account` punha `approx_lat = 0` ao
-- anonimizar uma conta. Apagar uma coluna citada só dentro do corpo de uma
-- função plpgsql não dá erro nenhum no momento do `drop`: dá erro quando
-- alguém CHAMA a função — isto é, quando uma pessoa pede para apagar a sua
-- conta. Seria uma falha escondida à espera do pior momento possível.
--
-- CONFERIDO DEPOIS DE CORRER
--
--   colunas approx_* em users ............ 0
--   delete_my_account ainda as cita ...... não
--   índice sobre a coordenada ............ 0
--   vistas ou funções que as mencionem ... 0
--   contas intactas ...................... 1
--   categorias intactas .................. 37
--
-- E um cadastro de ensaio, SEM coordenada — tal como o app publicado passou a
-- fazer — foi inserido, apareceu na vista do crachá, e foi desfeito:
--
--   cadastro sem coordenada funcionou: sim
--   aparece no crachá: 1 linha
--   sobras depois de desfazer: 0
-- ---------------------------------------------------------------------------

begin;

-- 1. A FUNÇÃO PRIMEIRO. Ver acima por que a ordem não é indiferente.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'É preciso estar autenticado para excluir a conta.'
      using errcode = '42501';
  end if;

  delete from public.messages where sender_id = me;
  delete from public.connections where user_a = me or user_b = me;
  delete from public.notifications where user_id = me;

  -- Denúncias FEITAS pela pessoa perdem o autor; denúncias CONTRA ela
  -- permanecem, por legítimo interesse de proteger outras pessoas.
  update public.reports set reporter_id = null where reporter_id = me;

  update public.users set
    name = 'Conta removida', email = 'removido+' || me || '@conexao.local',
    photo_url = null, extra_photos = '{}', bio = '', profession = '',
    city = '—',
    status = 'banido', deleted_at = now()
  where id = me;
end;
$function$;

-- 2. AGORA as colunas. O índice sobre elas desaparece junto, sozinho.
alter table public.users
  drop column approx_lat,
  drop column approx_lng;

commit;
