-- ---------------------------------------------------------------------------
-- A COORDENADA DEIXA DE SER OBRIGATÓRIA — parte 2 de 2 (a que conta)
--
-- `approx_lat` e `approx_lng` são sobra do app de relacionamentos: lá, a
-- coordenada decidia quem aparecia para quem. Desde o pivô não servem para
-- nada — nenhuma vista as devolve, nenhuma função as lê, nenhuma tela as usa.
-- O cadastro continuava a gravá-las só porque eram `not null`.
--
-- POR QUE ISTO É UM PASSO, E O APAGAR É OUTRO
--
-- O site que está no ar ainda as envia em cada cadastro. Apagar as colunas
-- agora faria o cadastro falhar no instante seguinte, até a publicação nova
-- subir — uma janela de app partido, por nada.
--
--   agora       deixam de ser obrigatórias. O site ANTIGO continua a enviá-las
--               e funciona; o NOVO pode deixar de as enviar e também funciona.
--               Não há um minuto sequer em que o cadastro esteja partido.
--   depois      as colunas saem de vez, com a reescrita de `delete_my_account`
--               na mesma transação. Ver docs/COORDENADAS.md.
--
-- A ARMADILHA DO PASSO SEGUINTE, ESCRITA AQUI PARA NÃO SE PERDER
--
-- `delete_my_account` põe `approx_lat = 0` ao anonimizar. Apagar uma coluna
-- citada só no corpo de uma função plpgsql NÃO dá erro na hora: dá erro quando
-- alguém chama a função — ou seja, quando uma pessoa pede para apagar a conta.
-- É o pior momento possível para descobrir. Por isso os dois têm de ir juntos.
-- ---------------------------------------------------------------------------

alter table public.users alter column approx_lat drop not null;
alter table public.users alter column approx_lng drop not null;
