# Apagar as duas colunas de coordenada

> **Estado:** metade feito. O app já não as grava nem as lê. Falta o último
> passo, que é apagá-las do banco — e esse tem de ser dado no painel do
> Supabase, pela razão explicada no fim.

## O que são, e por que saem

`public.users.approx_lat` e `public.users.approx_lng` são sobra do app de
relacionamentos que deu origem a este. Lá, a coordenada decidia quem aparecia
para quem e a faixa de distância mostrada no cartão.

Desde o pivô para o mercado de serviços, não decidem nada:

| | |
|---|---|
| Alguma vista as devolve? | não |
| Alguma função as lê? | não (só `delete_my_account` as **escrevia**) |
| Alguma política de acesso as usa? | não |
| Alguma tela as mostra? | não |
| Mesmo assim, cada cadastro as gravava? | **sim** |

Dado recolhido sem finalidade é o tipo de coisa que uma política de privacidade
promete não fazer. Saem.

**Não se perde nada.** A coordenada nunca foi um dado que a pessoa deu: era
deduzida do nome da cidade que ela escreveu. Se um dia existir "profissionais
perto de mim", basta recalcular a partir da cidade — e a tabela de cidades com
as suas coordenadas continua em `services/localizacao.ts`, de propósito.

## O que já está feito

| Passo | Onde | Estado |
|---|---|---|
| Deixar de ser obrigatórias | migrações 032 e 033 | ✅ aplicado |
| O app deixa de as gravar e de as ler | 9 lugares, ver o pedido | ✅ |
| Testes que impedem a volta | `tests/privacidade.test.ts` | ✅ |

A ordem foi essa de propósito: enquanto o site antigo ainda estiver no ar, ele
continua a enviá-las, e colunas opcionais aceitam-nas sem queixa. Apagar antes
da publicação nova faria o cadastro falhar nesse intervalo.

## O passo que falta

**Só depois de a publicação nova estar no ar.** Supabase → **SQL Editor** →
colar e correr:

```sql
begin;

-- 1. A FUNÇÃO PRIMEIRO. Ela põe `approx_lat = 0` ao anonimizar uma conta.
--    Apagar uma coluna citada só dentro de uma função plpgsql NÃO dá erro
--    agora: dá erro quando alguém CHAMA a função — isto é, quando uma pessoa
--    pede para apagar a conta. É o pior momento possível para descobrir.
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
```

Depois, para conferir (deve devolver zero linhas):

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'users'
   and column_name like 'approx_l%';
```

## Por que este passo não foi dado por mim

A ferramenta por onde eu aplico migrações **bloqueia instruções destrutivas**, e
bloqueia-as de uma maneira que não se parece com um bloqueio: a chamada fica
pendurada e expira ao fim de 60 segundos, sem dizer porquê.

Medido em 17/10/2026, para não ficar em suposição:

| Instrução | Resultado |
|---|---|
| `alter table … add column` | passa, num instante |
| `alter table … alter column … drop not null` | **passa** |
| `alter table … drop column` | expira aos 60 s |
| `delete from …` (mesmo apagando zero linhas) | expira aos 60 s |

Repare na segunda e na terceira linha: as duas têm a palavra `drop`, e só uma
passa. **O bloqueio não é por palavra — é pelo que a instrução faz.** É bom que
seja assim, e é a razão de este documento existir em vez de o passo estar dado.

As duas tentativas que expiraram foram conferidas a seguir: a transação
desfez-se inteira das duas vezes, e nada ficou alterado no banco.
