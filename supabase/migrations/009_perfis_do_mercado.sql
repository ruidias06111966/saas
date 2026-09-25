-- ---------------------------------------------------------------------------
-- 009 · Quem publicou, quem propôs
--
-- Aditiva. Cria uma view e amplia UMA política de leitura. Nada é removido,
-- nada muda de forma, e a versão publicada hoje continua funcionando igual.
--
-- O PROBLEMA
--
-- A migração 002 fechou `public.users` a terceiros, e fechou bem: hoje uma
-- conta comum lê a própria linha e mais nada. Testado agora, com um `uid`
-- qualquer: `select count(*) from public.users` devolve 0.
--
-- Isso é correto para o app de relacionamentos, onde tudo o que a tela mostra
-- de terceiros passa pela view `perfis_descobriveis`. Mas o mercado nasceu
-- depois e precisa de uma coisa que aquela view não entrega:
--
--   • `perfis_descobriveis` ESCONDE administração (`u.role <> 'admin'`), de
--     propósito — numa tela de descoberta, saber quem é administrador só ajuda
--     quem procura um alvo. Só que no mercado o administrador também publica,
--     e um anúncio sem autor não é um anúncio: é um bilhete anônimo.
--
-- Sem isto, o efeito prático seria este: quem recebe dez propostas não vê o
-- nome de nenhuma delas. É o tipo de defeito que passa despercebido porque o
-- dono do projeto é administrador — `private.is_admin()` abre `public.users`
-- para ele, então na conta dele tudo aparece, e só na conta dos outros é que
-- falta. Melhor descobrir aqui do que pelo suporte.
--
-- O QUE ESTA VIEW MOSTRA, E O QUE NÃO MOSTRA
--
-- Mostra: nome, profissão, cidade, estado, foto, selo de verificado e
-- reputação. É o crachá — exatamente o que alguém espera que apareça ao lado
-- de um anúncio ou de uma proposta.
--
-- NÃO mostra: e-mail, data de nascimento, coordenadas, papel, plano. As
-- colunas simplesmente não estão no `select`, e como a view tem direitos do
-- dono (`security_invoker = false`) ninguém alcança a tabela por trás dela.
--
-- A REGRA SOBRE ADMINISTRAÇÃO
--
-- Administração continua invisível ENQUANTO NÃO PARTICIPA. Ela só aparece
-- aqui se tiver publicado um anúncio ou enviado uma proposta — ou seja, se
-- tiver entrado no mercado como qualquer outra pessoa. Quem nunca publicou
-- nada continua fora, e a proteção da 001 fica de pé onde ela importa.
--
-- A SEGUNDA MUDANÇA: O ANÚNCIO QUE SOME
--
-- A política de leitura de `anuncios` mostra o anúncio aberto e dentro do
-- prazo, ou o próprio. Faltava um caso: quem ENVIOU UMA PROPOSTA. Hoje, no
-- instante em que o anúncio é encerrado — inclusive quando é encerrado porque
-- a proposta foi aceita —, o profissional perde de vista o anúncio em que
-- acabou de ser escolhido, e a tela "Minhas propostas" passa a dizer "Anúncio
-- indisponível" justamente no caso de sucesso.
--
-- Quem propôs continua vendo o anúncio em que propôs. Não é acesso novo: essa
-- pessoa já leu esse anúncio inteiro quando se ofereceu nele.
--
-- COMO REVERTER
--   drop view if exists public.perfis_do_mercado;
--   e recriar a política de select de `anuncios` sem a cláusula das propostas
--   (a definição anterior está em 008_mercado_anuncios_e_propostas.sql).
-- ---------------------------------------------------------------------------

-- ------------------------------ a view -------------------------------------

create or replace view public.perfis_do_mercado
with (security_invoker = false) as
select
  u.id,
  u.name,
  u.profession,
  u.city,
  u.state,
  u.photo_url,
  u.verified,
  u.reputation
from public.users u
where
  -- Conta ativa, não excluída, sem bloqueio entre as partes. A mesma função de
  -- sempre: uma regra só, num lugar só.
  private.perfil_visivel(u.id)

  -- Administração aparece apenas se participar do mercado. Ver o cabeçalho.
  and (
    u.role <> 'admin'
    or exists (select 1 from public.anuncios a where a.autor_id = u.id)
    or exists (select 1 from public.propostas p where p.profissional_id = u.id)
  );

comment on view public.perfis_do_mercado is
  'Crachá público de quem participa do mercado: nome, profissão, cidade, foto, verificado e reputação. Sem e-mail, sem nascimento, sem coordenadas, sem papel. Ver 009_perfis_do_mercado.sql.';

-- `anon` não lê nada neste projeto.
revoke all on public.perfis_do_mercado from public, anon;
grant select on public.perfis_do_mercado to authenticated;

-- --------------------- quem propôs continua vendo --------------------------

drop policy if exists "anúncio aberto é visível a quem tem conta" on public.anuncios;
create policy "anúncio aberto é visível a quem tem conta"
  on public.anuncios for select
  using (
    (status = 'aberto' and expires_at > now())
    or autor_id = (select auth.uid())
    -- Quem se ofereceu aqui não perde o anúncio de vista quando ele fecha.
    or exists (
      select 1 from public.propostas p
      where p.anuncio_id = anuncios.id and p.profissional_id = (select auth.uid())
    )
    or private.is_admin()
  );
