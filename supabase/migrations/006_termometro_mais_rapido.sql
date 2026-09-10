-- ---------------------------------------------------------------------------
-- 006 — O véu abre mais cedo
--
-- O termômetro estava calibrado para uma paciência que ninguém tem. Medido:
-- uma conversa ÓTIMA (recíproca, mensagens longas, perguntas, rituais,
-- resposta em minutos) só alcançava "Revelado" no QUINTO dia, com 30
-- mensagens. Uma conversa boa e normal — a que a maioria das pessoas tem —
-- travava em 68 e **nunca revelava**, por mais que durasse.
--
-- O mistério é o produto, e continua sendo. Mas mistério que não abre vira
-- desistência: a pessoa conclui que o véu é enfeite e para de tentar.
--
-- Nada de estrutura muda aqui. São cinco constantes, e cada uma tem um
-- motivo escrito ao lado. O cliente espelha esta função em
-- services/conversation.ts — os dois têm de andar juntos, e o teste
-- tests/conversation.test.ts existe para não deixar divergirem.
--
-- MEDIDO, DEPOIS E ANTES:
--
--   cenário              msgs dias   antes  depois   estágio
--   ótima                  20    1      54      84   Revelado
--   ótima                  25    3      69      98   Revelado
--   normal com ritual      20    2      47      80   Quase lá
--   normal com ritual      25    3      55      86   Revelado
--   normal sem ritual      25    3      49      77   Quase lá (véu 94% aberto)
--   fraca                  30    5      30      37   Contornos
--
-- Conversa fraca continua não revelando, que é o ponto. E quem faz uma
-- conversa boa sem aceitar ritual nenhum chega a 94% de véu aberto — o rosto
-- fica visível, mas os últimos 6% continuam sendo conquistados. Quem quiser
-- pular isso tem o acordo mútuo de revelação, que já existe e vale 100%.
-- ---------------------------------------------------------------------------

create or replace function private.termometro(conn uuid)
returns table (
  score smallint, estagio smallint,
  reciprocidade smallint, profundidade smallint,
  constancia smallint, abertura smallint,
  mensagens int, dias int
)
language plpgsql stable security definer set search_path = public as $$
declare
  ua uuid; ub uuid;
  n numeric; na numeric; nb numeric;
  media_palavras numeric; perguntas numeric;
  rituais numeric; max_nivel numeric;
  primeira timestamptz; mediana numeric;
  recip numeric; prof numeric; const numeric; abert numeric;
  volume numeric; d numeric; espalha numeric; bruto numeric;
  s smallint;
begin
  select c.user_a, c.user_b into ua, ub from public.connections c where c.id = conn;
  if ua is null then
    return query select 0::smallint, 0::smallint, 0::smallint, 0::smallint,
                        0::smallint, 0::smallint, 0, 1; return;
  end if;

  select
    count(*)::numeric,
    count(*) filter (where m.sender_id = ua)::numeric,
    count(*) filter (where m.sender_id = ub)::numeric,
    coalesce(avg(array_length(regexp_split_to_array(btrim(m.body), '\s+'), 1)), 0)::numeric,
    count(*) filter (where m.body like '%?%')::numeric,
    count(*) filter (where m.kind = 'ritual')::numeric,
    coalesce(max(m.ritual_level), 0)::numeric,
    min(m.created_at)
  into n, na, nb, media_palavras, perguntas, rituais, max_nivel, primeira
  from public.messages m
  where m.connection_id = conn and m.kind <> 'sistema';

  if n = 0 then
    return query select 0::smallint, 0::smallint, 0::smallint, 0::smallint,
                        0::smallint, 0::smallint, 0, 1; return;
  end if;

  -- 1. Reciprocidade. Inalterada: quem fala demais e quem fala de menos.
  recip := case when n < 4 then private.limitar(n / 4) * 0.5
                else 1 - abs(na - nb) / n end;

  -- 2. Profundidade. A régua era de 22 palavras por mensagem e 30% de
  --    perguntas — medida de carta, não de conversa. Gente conversando de
  --    verdade escreve 10 a 12 palavras e pergunta em uma mensagem a cada
  --    quatro. As réguas passam a 14 palavras e 22% de perguntas.
  prof := private.limitar(
    private.limitar(media_palavras / 14) * 0.65 +
    private.limitar((perguntas / n) / 0.22) * 0.35
  );

  -- 3. Constância. Inalterada.
  select percentile_cont(0.5) within group (order by x.seg) into mediana
  from (
    select extract(epoch from (t.created_at - lag(t.created_at) over w)) as seg,
           t.sender_id, lag(t.sender_id) over w as anterior
    from public.messages t
    where t.connection_id = conn and t.kind <> 'sistema'
    window w as (order by t.created_at)
  ) x
  where x.anterior is not null and x.sender_id <> x.anterior;

  const := case
    when mediana is null then 0
    when mediana <= 21600 then 1
    when mediana >= 259200 then 0.1
    else private.limitar(1 - (mediana - 21600) / 259200)
  end;

  -- 4. Abertura. Exigia SEIS rituais para nota cheia, e quase ninguém chega
  --    lá. Passa a três — que é o que uma conversa boa alcança sem esforço.
  abert := private.limitar(rituais / 3) * 0.6 + private.limitar(max_nivel / 4) * 0.4;

  -- Amortecedor de volume. Nota cheia exigia 40 mensagens; passa a 20. Vinte
  -- mensagens já são uma conversa, não uma troca de cumprimentos.
  volume := private.limitar(log(2, 1 + n) / log(2, 21));

  -- Amortecedor de calendário. Impedia nota cheia antes do QUINTO dia, e
  -- começava em 0,65 — o que sozinho tirava um terço da nota de qualquer
  -- primeiro dia. Passa a três dias, começando em 0,78.
  d := greatest(1, round(extract(epoch from (now() - primeira)) / 86400));
  espalha := private.limitar(d / 3) * 0.22 + 0.78;

  -- Os pesos. Abertura caiu de 0,22 para 0,16 e a diferença foi para
  -- reciprocidade e profundidade. Sem isso, quem nunca aceita um ritual
  -- ficaria preso abaixo de 80 fizesse o que fizesse — e ritual é convite,
  -- não obrigação.
  bruto := (recip * 0.30 + prof * 0.32 + const * 0.22 + abert * 0.16) * volume * espalha;
  s := round(private.limitar(bruto) * 100)::smallint;

  return query select
    s,
    (case when s >= 82 then 4 when s >= 62 then 3
          when s >= 40 then 2 when s >= 20 then 1 else 0 end)::smallint,
    round(recip * 100)::smallint, round(prof * 100)::smallint,
    round(const * 100)::smallint, round(abert * 100)::smallint,
    n::int, d::int;
end;
$$;

-- As conversas que já existem foram medidas com a régua antiga e estão
-- guardadas em conversation_health. Recalcula todas, senão o véu delas só
-- abriria na próxima mensagem — e quem está no meio de uma conversa boa
-- veria a foto continuar fechada sem entender por quê.
do $$
declare
  c record;
  t record;
  quantas integer := 0;
begin
  for c in select id from public.connections loop
    select * into t from private.termometro(c.id);
    insert into public.conversation_health
      (connection_id, score, reciprocity, depth, consistency, openness, reveal, stage, updated_at)
    values
      (c.id, t.score, t.reciprocidade, t.profundidade, t.constancia, t.abertura,
       least(1.0, t.score / 82.0), t.estagio, now())
    on conflict (connection_id) do update set
      score = excluded.score, reciprocity = excluded.reciprocity,
      depth = excluded.depth, consistency = excluded.consistency,
      openness = excluded.openness, reveal = excluded.reveal,
      stage = excluded.stage, updated_at = now();
    quantas := quantas + 1;
  end loop;
  raise notice 'Termometro recalculado para % conversa(s).', quantas;
end $$;
