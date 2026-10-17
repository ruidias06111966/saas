# Apagar as duas colunas de coordenada

> **Estado: FEITO, em 17/10/2026.** As colunas não existem mais. O que está
> escrito abaixo fica como registo do que se fez e porquê — e porque o último
> passo teve de ser dado à mão, no painel, pela razão explicada no fim.
>
> **Conferido depois de correr:**
>
> | | |
> |---|---|
> | colunas `approx_*` em `users` | 0 |
> | `delete_my_account` ainda as cita | não |
> | índice sobre a coordenada | 0 |
> | vistas ou funções que as mencionem | 0 |
> | contas intactas | 1 |
> | categorias intactas | 37 |
>
> E um cadastro de ensaio, **sem** coordenada — tal como o app publicado passou
> a fazer — foi inserido, apareceu na vista do crachá, e foi desfeito sem
> deixar sobras. É a prova que importava: o caminho que as pessoas usam
> continua a funcionar.

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
| O app deixa de as gravar e de as ler | 9 lugares | ✅ publicado e conferido no pacote no ar |
| Testes que impedem a volta | `tests/privacidade.test.ts` | ✅ |
| Apagar as colunas | migração 034, à mão no painel | ✅ aplicado |

A ordem foi essa de propósito: enquanto o site antigo ainda estiver no ar, ele
continua a enviá-las, e colunas opcionais aceitam-nas sem queixa. Apagar antes
da publicação nova faria o cadastro falhar nesse intervalo.

## O passo que faltava, e o texto que foi corrido

Foi dado **depois** de a publicação nova estar no ar — conferido no pacote
servido, onde `approx_lat` já não aparecia. Supabase → **SQL Editor**:

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
