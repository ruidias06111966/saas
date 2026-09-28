-- ---------------------------------------------------------------------------
-- 021 — O anúncio passa a dizer se PROCURA ou OFERECE.
--
-- Até aqui `anuncios` só sabia guardar um lado do mercado: alguém que PRECISA
-- de um serviço. Quem OFERECE existia apenas como perfil em
-- `perfis_do_mercado` — visível para quem procurasse, mas incapaz de aparecer
-- no quadro, de ser buscado por categoria, ou de receber uma resposta.
--
-- Metade do mercado não tinha onde se anunciar.
--
-- UMA COLUNA, E SÓ UMA
--
-- A tentação aqui é criar uma segunda tabela, `ofertas`, espelhando `anuncios`.
-- Seria errado: os dois objetos têm os MESMOS campos (título, descrição,
-- categoria, lugar, modalidade, valor), as mesmas regras de tamanho, a mesma
-- busca, as mesmas políticas de RLS e o mesmo ciclo de vida. Duas tabelas
-- quase iguais é como elas divergem — foi assim que a foto e o crachá
-- passaram a discordar (ver 019).
--
-- `propostas` também não muda de forma: uma proposta passa a ser "a resposta a
-- um anúncio", seja ela um profissional se oferecendo numa procura, ou um
-- cliente querendo contratar numa oferta. Os campos (mensagem, valor, prazo)
-- servem aos dois sentidos sem uma linha de código nova.
--
-- O QUE OS VALORES SÃO
--
-- Minúsculos, como TODOS os enums desta base (`aberto`, `remoto`, `enviada`).
-- A tela mostra "PROCURANDO" e "OFERECENDO" em maiúsculas; o banco guarda
-- `procurando` e `oferecendo`. Rótulo é assunto da tela.
--
-- OS ANÚNCIOS QUE JÁ EXISTEM
--
-- Todos os 3 são procura — o aplicativo nunca soube publicar outra coisa.
-- O `default 'procurando'` já os classifica certo, e o bloco de verificação no
-- fim PROVA isso em vez de supor.
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.tipo_anuncio as enum ('procurando', 'oferecendo');
exception when duplicate_object then null;
end $$;

alter table public.anuncios
  add column if not exists tipo_anuncio public.tipo_anuncio not null default 'procurando';

-- PRAZO É DO TRABALHO A FAZER, não de quem se oferece.
--
-- "Preciso de contador até outubro" tem prazo. "Ofereço contabilidade" não
-- tem — o que teria prazo seria o serviço, que ainda nem foi combinado.
-- Sem esta restrição a tela de oferta poderia gravar um prazo que nenhuma
-- outra tela sabe exibir, e ninguém descobriria.
alter table public.anuncios drop constraint if exists prazo_so_em_procura;
alter table public.anuncios
  add constraint prazo_so_em_procura
  check (tipo_anuncio = 'procurando' or prazo_dias is null);

-- O quadro é sempre filtrado por tipo + status, e ordenado por data. Sem este
-- índice cada abertura da tela varre a tabela inteira.
create index if not exists anuncios_tipo_status_data
  on public.anuncios (tipo_anuncio, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Verificação. Falha a migração se qualquer afirmação acima não for verdade.
-- ---------------------------------------------------------------------------
do $$
declare
  sem_tipo   int;
  procurando int;
  oferecendo int;
  tem_check  int;
  tem_indice int;
begin
  select count(*) into sem_tipo   from public.anuncios where tipo_anuncio is null;
  select count(*) into procurando from public.anuncios where tipo_anuncio = 'procurando';
  select count(*) into oferecendo from public.anuncios where tipo_anuncio = 'oferecendo';

  select count(*) into tem_check from pg_constraint
   where conrelid = 'public.anuncios'::regclass and conname = 'prazo_so_em_procura';

  select count(*) into tem_indice from pg_indexes
   where schemaname = 'public' and indexname = 'anuncios_tipo_status_data';

  if sem_tipo > 0 then
    raise exception 'ficaram % anúncios sem tipo', sem_tipo;
  end if;
  if oferecendo > 0 then
    raise exception 'apareceram % anúncios de oferta antes de existir tela para criá-los', oferecendo;
  end if;
  if tem_check <> 1 then
    raise exception 'a restrição prazo_so_em_procura não ficou aplicada';
  end if;
  if tem_indice <> 1 then
    raise exception 'o índice anuncios_tipo_status_data não foi criado';
  end if;

  raise notice 'OK — % anúncios classificados como procura, 0 como oferta, restrição e índice no lugar', procurando;
end $$;
