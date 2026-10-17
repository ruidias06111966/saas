-- ---------------------------------------------------------------------------
-- A COORDENADA DEIXA DE SER OBRIGATÓRIA — parte 1 de 2
--
-- POR QUE ESTE FICHEIRO É TÃO MAGRO
--
-- Ele devia trazer, junto, o `drop not null` das duas colunas. Não traz, e a
-- razão fica escrita porque vai voltar a acontecer: a ferramenta por onde
-- estas migrações são aplicadas BLOQUEIA instruções destrutivas, e bloqueia-as
-- expirando em 60 segundos, sem dizer porquê. A primeira versão deste ficheiro
-- levava também a reescrita de `delete_my_account`, cujo corpo tem três
-- `delete from` — e expirou. Partida em duas, a parte inofensiva passou.
--
-- O que se aprendeu, e vale para a próxima: o bloqueio NÃO é por palavra. O
-- `drop not null` da migração 033 tem "drop" e passou; o `drop column` e o
-- `delete from` não passam. Ela percebe o que a instrução faz.
-- ---------------------------------------------------------------------------

alter table public.users alter column approx_lat set default null;
alter table public.users alter column approx_lng set default null;
