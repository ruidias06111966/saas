# Promoção de lançamento — 60 dias de Premium

Quem criar conta até **09/12/2026** ganha **60 dias de Premium**, contados da
própria data de inscrição. Sem cartão, sem pedir, sem clicar em nada.

---

## O que ficou valendo neste projeto

| coisa | valor |
|---|---|
| Fim da janela de captação | `09/12/2026`, em `private.fim_da_promocao()` |
| Duração por pessoa | 60 dias, em `private.dias_de_cortesia()` |
| Onde é concedida | gatilho `promocao_de_lancamento` em `public.users` |
| Como é encerrada | `private.expirar_cortesias()`, todo dia às 06:17 UTC |
| Como aparece na tela | `components/AvisoDeCortesia.tsx`, no Início e no Premium |
| Marca no banco | `subscriptions.provider = 'cortesia'` |

Ligada em 10/09/2026. Concedida retroativamente às três contas que já
existiam, cada uma contada da inscrição delas.

---

## Por que a concessão mora no banco, e não no app

`users.plan` é congelada para o cliente pelo gatilho `campos_privilegiados`:
ninguém se promove a Premium editando o próprio registro. Um app que tentasse
conceder a cortesia seria recusado pelo próprio banco — e para funcionar teria
de destravar aquela coluna, o que abriria a porta para **qualquer pessoa** se
dar Premium.

Concedendo no banco, a regra é do servidor, roda dentro da mesma transação do
cadastro, e não existe caminho pelo qual o cliente peça a cortesia duas vezes
ou fora da janela.

## Por que existe uma faxina diária

Assinatura do Stripe é rebaixada pelo webhook, quando o Stripe desiste de
cobrar. **A cortesia não tem webhook nenhum.** Se ninguém a encerrar, ela vale
para sempre — calada, e sem que nada na tela indique o erro.

Daí o `pg_cron` rodando `private.expirar_cortesias()` uma vez por dia. Ele só
toca em quem tem `provider = 'cortesia'`, e não rebaixa quem tiver arrumado uma
assinatura paga no meio do caminho.

---

## Mexer na promoção

Tudo passa por duas funções. Trocar o valor delas muda o gatilho, a faxina e a
concessão retroativa de uma vez — não há uma segunda cópia da data em lugar
nenhum.

**Estender ou encurtar a janela de captação:**

```sql
create or replace function private.fim_da_promocao() returns timestamptz
language sql immutable set search_path = public as $$
  select timestamptz '2027-03-01 00:00:00-03';
$$;
```

**Mudar quantos dias cada pessoa ganha** (vale só para quem entrar depois; quem
já ganhou tem a data guardada em `subscriptions.expires_at`):

```sql
create or replace function private.dias_de_cortesia() returns interval
language sql immutable set search_path = public as $$
  select interval '90 days';
$$;
```

**Encerrar a promoção hoje**, sem tirar de quem já ganhou: ponha
`fim_da_promocao()` numa data passada. O gatilho para de conceder na hora; as
cortesias em curso seguem até a data de cada uma.

**Conferir quem está com cortesia:**

```sql
select u.email, to_char(s.expires_at,'DD/MM/YYYY') as ate,
       (s.expires_at::date - current_date) as dias_restantes
from public.subscriptions s
join public.users u on u.id = s.user_id
where s.provider = 'cortesia' and s.status = 'ativa'
order by s.expires_at;
```

**Ver se a faxina está agendada:**

```sql
select jobname, schedule, active from cron.job where jobname = 'expirar-cortesias';
```

---

## O que a pessoa vê

No **Início** e na tela do **Premium**, um aviso que some sozinho quando a
cortesia expira — pela data que veio do servidor, não por contagem no
navegador.

Nos **últimos dez dias** o tom muda de novidade para lembrete, dizendo a data
em que a conta volta ao plano gratuito e deixando claro que nada do que a
pessoa escreveu se perde. Antes disso, insistir seria cobrança disfarçada de
aviso.

Na tela do Premium o aviso vem **antes** de qualquer coisa sobre pagar:
oferecer assinatura a quem está no meio da cortesia é o caminho mais curto para
a pessoa achar que foi cobrada duas vezes.

---

## O que acontece no dia 61

A faxina põe `subscriptions.status = 'expirada'` e `users.plan = 'free'`.

Conversas, conexões, mensagens e perfil continuam intactos — o plano gratuito
muda quanto a pessoa alcança, nunca o que ela já escreveu. Quem quiser
continuar assina pelo Stripe normalmente, e aí a assinatura nasce com
`provider = 'stripe'`, fora do alcance desta faxina.
