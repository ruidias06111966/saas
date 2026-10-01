-- ===========================================================================
-- 028 — CORRIGI O CASO E NÃO A CLASSE (três vezes seguidas)
--
-- COMO ISTO APARECEU
--
-- O dono abriu o Sentry pela primeira vez. Havia lá dois erros de produção. O
-- segundo, `permission denied for view perfis_do_mercado`, podia ter sido culpa
-- da migração 027 — que fechou a leitura de `users` —, e fui verificar.
--
-- Não era: a view roda com os direitos do dono (`security_invoker=false`), logo
-- não depende do que eu revoguei. Mas a verificação passou pela lista de
-- permissões, e lá estava outra coisa.
--
-- O DEFEITO, QUE JÁ ERA O MESMO PELA TERCEIRA VEZ
--
-- O Supabase concede, por padrão, INSERT/UPDATE/DELETE/TRUNCATE de toda tabela
-- nova a `anon` e a `authenticated`. A RLS depois recusa — mas RECUSA EM
-- SILÊNCIO: um `update` sem filtro devolve 200 e zero linhas, sem erro nenhum.
--
-- Esta base já tropeçou nisso duas vezes:
--
--   Etapa 3, tabela `planos` — `revoke insert, delete, truncate` depois de o
--     ensaio mostrar "0 linhas"; e logo a seguir a API mostrou que o UPDATE
--     anónimo também devolvia 200 + [], o que obrigou a um segundo revoke.
--   Etapa 5, tabela `users` — `revoke select ... from anon`, pelo mesmo motivo,
--     escrito no comentário da 027: "silêncio é o pior jeito de negar".
--
-- E nas duas eu consertei A TABELA DA VEZ. Eram 18.
--
-- O ENSAIO, CONTRA A PRODUÇÃO, DENTRO DE TRANSAÇÃO DESFEITA
--
--   ANTES  anon UPDATE users sem filtro: sem erro, 0 linhas (SILENCIOSO)
--   DEPOIS anon UPDATE users: ERRO 42501 (alto, como se quer)
--   DEPOIS anon DELETE anuncios: ERRO 42501 (alto)
--   DEPOIS anon LÊ categorias: OK (leitura pública preservada)
--   DEPOIS usuário EDITA o próprio perfil: 1 linha(s) (OK)
--   DEPOIS usuário LÊ o mercado: OK
--   DEPOIS usuário LÊ anúncios: OK
--
-- As três últimas linhas são metade do ensaio e não um detalhe: um revoke
-- largo demais que quebrasse a edição de perfil teria custado mais do que o
-- defeito que corrige.
--
-- NADA ESTAVA EXPOSTO, E ISTO NÃO É UM REMENDO DE EMERGÊNCIA
--
-- Antes desta migração ninguém conseguia escrever nada sem conta. Em `users` a
-- escrita com filtro já falhava alto, por acidente feliz: o filtro precisa de
-- ler, e ler foi revogado na 027. Nas outras 17 quem segurava era a RLS, e
-- segurava bem — conferi as quatro tabelas cujas policies dizem `{public}` e
-- todas condicionam a `auth.uid()`, que para o anónimo é nulo.
--
-- O que muda é que a negação deixa de ser silenciosa, e deixa de depender de
-- uma só camada. O dia perigoso é aquele em que alguém reabrir a leitura de
-- `users` para fazer, por exemplo, uma página de perfil pública: aí o UPDATE
-- anónimo volta a ser silenciosamente possível, e ninguém se lembraria do
-- porquê.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- O QUE EXISTE HOJE.
--
-- Em laço, e não com 18 nomes escritos à mão, por uma razão: a lista de tabelas
-- muda, e uma lista escrita à mão envelhece em silêncio — que é exatamente o
-- defeito que esta migração corrige.
--
-- Views entram também. Não são escrevíveis sem regra, mas a concessão existe na
-- mesma, e deixá-la seria repetir o hábito de limpar só o que incomoda hoje.
--
-- `authenticated` NÃO é tocado. Quem entrou precisa de escrever: é assim que o
-- perfil se edita, o anúncio se publica e a proposta se envia. Quem decide o
-- que essa pessoa pode fazer é a RLS, linha a linha.
-- ---------------------------------------------------------------------------
do $$
declare alvo record;
begin
  for alvo in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
     order by c.relname
  loop
    execute format(
      'revoke insert, update, delete, truncate on public.%I from anon', alvo.relname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- E O QUE AINDA NÃO EXISTE — a parte que faz disto classe e não caso.
--
-- Sem esta linha, a tabela número 19 nasce com o mesmo problema, e alguém
-- escreve a migração 035 a revogar de novo.
--
-- O SELECT continua no padrão de propósito: há leitura pública legítima (as
-- categorias), e tirá-la obrigaria a conceder à mão em cada tabela nova — o que
-- faria o padrão ser contornado em vez de respeitado.
--
-- Vale para o que o papel `postgres` criar, que é o papel das nossas migrações.
-- O `supabase_admin` tem regra-padrão própria, para os objetos internos dele;
-- não é nossa para mexer, e as tabelas do aplicativo não nascem por ele.
-- ---------------------------------------------------------------------------
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon;
