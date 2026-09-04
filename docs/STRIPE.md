# Pagamento do CONEXÃO

Roteiro para tirar a cobrança do modo de teste e colocá-la em produção.
Escrito para ser seguido de cima para baixo, sem pular.

> **Nenhuma chave secreta aparece neste documento, e nenhuma deve aparecer em
> conversa, commit ou variável do GitHub.** Elas vão do painel do Stripe direto
> para os segredos do Supabase. Chave que passa por outro lugar é chave que
> precisa ser trocada depois.

---

## Antes: o painel em português

O Stripe tem interface em português. Vale ligar antes de começar — errar de
botão num painel de cobrança custa caro.

No [dashboard.stripe.com](https://dashboard.stripe.com), canto superior
direito, clique no seu nome → **Profile** (Perfil) → seção **Language**
(Idioma) → **Português (Brasil)**.

Neste documento cada rótulo aparece nas duas línguas — **Português (English)** —
porque a tradução do Stripe muda de tempos em tempos, e o nome em inglês é o
que não muda.

**O Supabase não tem português.** O painel dele só existe em inglês e não há
opção de troca; aqui os rótulos vão em inglês com a tradução ao lado.

---

## O que muda, e o que não muda

Modo de teste e modo de produção são **duas contas paralelas** dentro do mesmo
Stripe. Não compartilham nada:

| | teste | produção |
|---|---|---|
| Chave secreta | `sk_test_…` | `sk_live_…` |
| Produtos e Preços | os do teste | **outros**, criados de novo |
| Endpoint do webhook | um | **outro**, com **outro** segredo |
| Clientes e assinaturas | os do teste | vazios no começo |

Disso vem a armadilha central desta troca: **cada coisa esquecida no modo
antigo falha de um jeito diferente**, e a pior delas falha calada.

## As três falhas possíveis, em ordem de gravidade

**1. Segredo do webhook não trocado. FALHA CALADA.**
O pagamento é cobrado de verdade. O Stripe entrega o evento. O nosso webhook
confere a assinatura criptográfica com o segredo errado, recusa, e devolve 400.
Do lado de quem pagou: dinheiro saiu, plano continua `free`, nenhuma mensagem
de erro em lugar nenhum. É a mesma classe de falha do `Site URL` no e-mail, e é
a razão de o passo 6 deste roteiro existir.

**2. `STRIPE_PRICE_ID` apontando para um Preço do teste.**
Falha alto: o checkout nem abre. Ruim, mas visível.

**3. Endpoint do webhook criado só no modo teste.**
O `diagnostico` mostra a lista de endpoints vazia — a listagem obedece ao modo
da chave. Detectável antes de qualquer pagamento.

---

## 1. Ativar a conta no Stripe

Sem isto não existe chave `sk_live_`. No painel, **Ativar pagamentos**
(*Activate payments*): dados da empresa ou do CPF, atividade, e a conta
bancária que recebe.

A análise costuma sair no mesmo dia. Enquanto não sair, o resto deste roteiro
não tem como ser feito.

## 2. Criar o Produto e o Preço, em produção

Ligue o modo produção: o botão **Modo de teste** (*Test mode*), no topo do
painel, tem de ficar **desligado**.

Em **Catálogo de produtos → Adicionar produto**
(*Product catalog → Add product*):

| campo | valor |
|---|---|
| Nome (*Name*) | `CONEXÃO Premium` |
| Descrição (*Description*) | `Mais alcance e mais ferramentas. Segurança e direitos de LGPD seguem fora do paywall.` |
| Preço (*Price*) | `29,90` |
| Moeda (*Currency*) | `BRL` |
| Período de cobrança (*Billing period*) | `Mensal` (*Monthly*) |

Guarde o **ID do Preço** (`price_…`, não o `prod_…`).

### Por que criar o catálogo agora, e não depois

Hoje o `STRIPE_PRICE_ID` não está definido, e o checkout manda o preço *inline*.
Isso funciona — mas o Stripe cria **um Produto e um Preço novos a cada
assinatura**. Com cem assinantes, cem Preços no painel, e o relatório de receita
por produto deixa de significar coisa alguma.

O momento de corrigir é este: quem já assinou não muda de preço nunca (o Stripe
mantém cada assinatura no preço contratado), então ligar a variável antes do
primeiro cliente real evita a bagunça em vez de ter que limpá-la depois.

## 3. Criar o endpoint do webhook, em produção

Ainda no modo produção, em **Desenvolvedores → Webhooks → Adicionar endpoint**
(*Developers → Webhooks → Add endpoint*):

- **URL**: `https://<ref-do-projeto>.supabase.co/functions/v1/stripe-webhook`
- **Eventos** (*Events*), exatamente estes quatro:

| evento | para quê |
|---|---|
| `checkout.session.completed` | concede o premium — sem ele, nada acontece |
| `customer.subscription.updated` | renovação, e o rebaixamento quando o Stripe desiste |
| `customer.subscription.deleted` | fim da assinatura |
| `invoice.payment_failed` | registrado de propósito sem efeito, para não punir troca de cartão |

Depois de criar, clique em **Revelar** (*Reveal*) no **Segredo de assinatura**
(*Signing secret*), que começa com `whsec_`, e guarde.

> Este segredo é **diferente** do de teste, mesmo que os dois comecem com
> `whsec_`. Nada no formato distingue um do outro — é por isso que o erro do
> item 1 lá em cima é tão fácil de cometer.

## 4. Pegar a chave secreta de produção

**Desenvolvedores → Chaves de API → Chave secreta → Revelar**
(*Developers → API keys → Secret key → Reveal*). Começa com `sk_live_`.

## 5. Trocar os três segredos no Supabase

O painel do Supabase é só em inglês. O caminho é
**Edge Functions** (Funções de Borda) **→ Secrets** (Segredos).

Três valores mudam:

| segredo | novo valor |
|---|---|
| `STRIPE_SECRET_KEY` | a `sk_live_…` do passo 4 |
| `STRIPE_WEBHOOK_SECRET` | o `whsec_…` do passo 3 (**o de produção**) |
| `STRIPE_PRICE_ID` | o `price_…` do passo 2 |

`URLS_DO_APP` não muda — só mudaria junto com o endereço do site.

As Edge Functions leem os segredos a cada execução; não é preciso republicar
nada.

## 6. Perguntar, em vez de supor

Com a conta de administração, chame a Edge Function `assinar` com
`{"acao":"diagnostico"}`. A resposta tem que dizer:

```
modo                            "producao"
endpoints[].aponta_para_ca      true
endpoints[].faltando            []
origem_do_preco                 "catalogo"
preco_do_catalogo.confere_com_a_tela   true
segredo_do_webhook_configurado  true
```

Dois desses merecem atenção:

- **`faltando: []`** é o que teria evitado o episódio de 02/09/2026, em que dos
  quatro eventos só `invoice.payment_failed` estava assinado — o único que o
  nosso código ignora de propósito. Se vier com itens, `{"acao":"diagnostico",
  "corrigir":true}` acrescenta os que faltam (só acrescenta, e só no endpoint
  cuja URL é exatamente a nossa).
- **`segredo_do_webhook_configurado: true` NÃO prova que o segredo está certo** —
  prova só que existe algum. Nenhuma chamada de API consegue distinguir. Quem
  responde essa pergunta é o passo 7, e só ele.

## 7. Um pagamento de verdade

É o único jeito de fechar a lacuna do passo 6. Assine com um cartão real, no app
publicado, e confira:

1. O checkout abre em português e mostra **R$ 29,90/mês**.
2. O pagamento passa e a tela volta para o app.
3. **O plano vira premium**, com data de renovação — não nula.
4. No Stripe, em **Webhooks → o endpoint → eventos recentes**
   (*recent events*), as entregas
   aparecem com **200**. Se aparecer **400**, o segredo do passo 5 está errado:
   é exatamente a falha calada do item 1.
5. O portal de cobrança abre e mostra a assinatura para cancelar.

Depois: cancele no portal e faça o **reembolso** no painel do Stripe. A taxa de
processamento não volta — custa alguns reais saber que o caminho inteiro
funciona antes de a primeira pessoa real pagar.

---

## O que o código já garante, e não precisa ser conferido

**O app nunca diz "paguei".** `assinar` só devolve um link. Quem afirma o
pagamento é o Stripe, falando com `stripe-webhook`, e `users.plan` está
congelada para o cliente pelo gatilho `campos_privilegiados`.

**A porta aberta se defende sozinha.** `stripe-webhook` roda sem JWT, porque o
Stripe não tem sessão no app — e por isso a primeira coisa que faz é conferir a
assinatura criptográfica do evento.

**Reentrega não cobra duas vezes.** Idempotência por id do evento; se aplicar
falha, a linha de idempotência sai junto, senão a reentrega seria descartada
como repetida sem nunca ter sido aplicada.

**A data de renovação não depende da versão da API do endpoint.**
`fimDoPeriodo()` lê os dois lugares onde o `current_period_end` pode estar —
mudou de lugar na versão `basil` (2025-04-30), e foi o que zerou a data no
primeiro pagamento real.

**Cancelar não depende de sorte.** O portal resolve o cliente do Stripe a partir
do id da própria assinatura, e não de uma busca por e-mail. A busca por e-mail
parecia equivalente: não é. O Stripe aceita vários Customers com o mesmo
endereço, e o nosso checkout cria um a cada pagamento — a escolha era arbitrária,
e quem trocasse de e-mail no app perdia o único caminho de cancelamento.

---

## Onde cada credencial mora

| coisa | onde vive | quem enxerga |
|---|---|---|
| `STRIPE_SECRET_KEY` | Supabase → Edge Functions → Secrets | só as Edge Functions |
| `STRIPE_WEBHOOK_SECRET` | mesmo lugar | só o webhook |
| `STRIPE_PRICE_ID` | mesmo lugar | não é segredo, mas mora junto |
| `URLS_DO_APP` | mesmo lugar | — |

Nenhuma delas entra no repositório, no `.env` do app ou em variável do GitHub.
Tudo que está nesses lugares acaba dentro do JavaScript que o navegador baixa.

## Depois de virar a chave

O modo de teste continua existindo e continua funcionando — ele só deixa de ser
o que o app usa. As assinaturas de teste (a da conta `marina@conexao.app`, por
exemplo) passam a não existir para a chave de produção: o portal de cobrança
delas responde `Assinatura não encontrada no Stripe`, que é o comportamento
correto e não um defeito.
