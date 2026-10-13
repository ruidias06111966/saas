# Mudar o endereço do site

> **Endereço antigo:** `conexao.qidominios.com.br`
> **Endereço novo:** `qiconexao.qidominios.com.br`
>
> O envio de e-mails **não muda** nesta operação: continua por
> `mail.conexao.qidominios.com.br`, verificado no Resend. Foi uma decisão
> deliberada — ver "O que fica de fora", no fim.

## Por que isto tem um documento só para si

Mudar o endereço não é uma mudança de código: é uma mudança em **sete painéis
diferentes**, e as falhas não aparecem como erro. Aparecem assim:

| Esquecido | O que a pessoa vê |
|---|---|
| Supabase → Redirect URLs | clica no link do e-mail e **não entra**. Nenhum erro |
| Supabase → `URLS_DO_APP` | o pagamento não volta para o site |
| Cloudflare → regra dos cabeçalhos | nada. Os cabeçalhos de segurança simplesmente deixam de valer |
| Cloudflare → redirecionamento | quem tinha o endereço antigo guardado encontra uma página de erro |
| Sentry → Allowed Domains | os erros do site param de ser registados |

Nenhuma destas dá erro em lugar nenhum. É por isso que a **ordem** abaixo
importa: ela foi montada para que não exista nenhum momento em que o login
esteja partido.

## A regra que torna isto seguro

**Acrescentar antes de tirar.** O Supabase, o Sentry e a variável do Stripe
aceitam LISTA de endereços. Durante a troca, os dois endereços ficam na lista.
Só depois de o novo estar provado é que o antigo sai — e mesmo assim, só de
onde faz sentido.

---

## Passo 1 — Cloudflare: criar o nome novo

Cloudflare → o domínio `qidominios.com.br` → **DNS** → **Add record**:

| Campo | Valor |
|---|---|
| Type | `CNAME` |
| Name | `qiconexao` |
| Target | `ruidias06111966.github.io` |
| Proxy status | **DNS only** (nuvem CINZENTA, não laranja) |

> A nuvem laranja tem de ficar **desligada**. Com ela ligada o GitHub não
> consegue emitir o certificado de segurança, e o site aparece com aviso de
> "não seguro" — sem explicação de onde veio.

Sozinho, este passo não muda nada: o GitHub ainda não sabe servir este nome.

## Passo 2 — Supabase: aceitar os DOIS endereços

Supabase → o projeto → **Authentication** → **URL Configuration**.

Em **Redirect URLs**, **acrescentar** (sem apagar as que já lá estão):

```
https://qiconexao.qidominios.com.br/
https://qiconexao.qidominios.com.br/**
```

**Deixe o `Site URL` como está, por agora.** Ele muda no passo 7, depois de o
endereço novo estar provado.

> Por que acrescentar e não substituir: um destino fora da lista não é
> recusado pelo Supabase — é **substituído em silêncio** pelo `Site URL`. Com
> os dois na lista, os dois funcionam, e não existe um minuto sequer em que
> entrar esteja partido.

## Passo 3 — Supabase: a variável do pagamento

Supabase → **Edge Functions** → **Secrets** → `URLS_DO_APP`.

É uma lista separada por vírgulas. Acrescentar o novo, mantendo o antigo:

```
https://conexao.qidominios.com.br,https://qiconexao.qidominios.com.br
```

## Passo 4 — Sentry: aceitar os dois

Sentry → o projeto → **Settings** → **Client Security** → **Allowed Domains**.

Acrescentar `https://qiconexao.qidominios.com.br` numa linha nova, mantendo o
antigo.

## Passo 5 — GitHub: dizer qual é o endereço

GitHub → o repositório → **Settings** → **Secrets and variables** → **Actions**
→ aba **Variables** → `DOMINIO_DO_SITE`:

```
qiconexao.qidominios.com.br
```

(Sem `https://`, sem barra no fim. É só o nome.)

> É esta variável que faz a publicação escrever o ficheiro `CNAME`, que é como
> o GitHub Pages sabe em que endereço servir. O código não tem o endereço
> escrito em lado nenhum — vem todo daqui.

## Passo 6 — Publicar

**Só agora** é que o código novo entra. Avise-me e eu junto o pedido: a
publicação escreve o `CNAME` novo, e o site passa a responder em
`qiconexao.qidominios.com.br`.

O certificado de segurança pode demorar alguns minutos a sair. Enquanto não
sair, o navegador avisa que a ligação não é segura — é normal, e passa
sozinho. Se passar de uma hora, GitHub → Settings → Pages → tirar e repor o
domínio próprio força nova emissão.

## Passo 7 — Provar, e só então fechar

Com as **duas contas**, no endereço novo:

1. Entrar com e-mail e senha.
2. Abrir uma conversa e ver as mensagens antigas.
3. Abrir o manual e baixar o PDF.

Só depois disto: Supabase → **Authentication** → **URL Configuration** →
**Site URL** → passar para `https://qiconexao.qidominios.com.br/`.

## Passo 8 — Mandar o endereço antigo para o novo

Quem tinha `conexao.qidominios.com.br` guardado precisa de chegar ao sítio
certo. Sem isto, encontra uma página de erro do GitHub.

Cloudflare → **DNS** → no registo `conexao`, **ligar a nuvem laranja**
(proxied). Depois, Cloudflare → **Rules** → **Redirect Rules** → **Create
rule**:

| Campo | Valor |
|---|---|
| Nome | `conexao antigo vai para qiconexao` |
| Quando | `Hostname` **equals** `conexao.qidominios.com.br` |
| Tipo | **Dynamic** |
| Expressão | `concat("https://qiconexao.qidominios.com.br", http.request.uri.path)` |
| Status | **301** (permanente) |
| Preserve query string | ligado |

## Passo 9 — Conferir a regra dos cabeçalhos de segurança

Cloudflare → **Rules** → **Transform Rules** → a regra dos cabeçalhos de
segurança que já existe.

**Se o filtro dela mencionar o endereço antigo**, troque para o novo — ou
mude-o para valer para todo o domínio. Se ficar preso ao nome antigo, os
cabeçalhos deixam de ser aplicados **sem aviso nenhum**: o site continua a
funcionar, só que desprotegido.

## Passo 10 — O telefone

Estas duas coisas estão amarradas ao endereço, e não se transferem:

- **O aplicativo instalado** aponta para o endereço antigo. Desinstalar e
  instalar outra vez a partir de `qiconexao.qidominios.com.br`.
- **Os avisos no celular**. A inscrição é por endereço: é preciso abrir
  Configurações no endereço novo e **ligar outra vez** o aviso.

Com duas contas isto é trabalho de minutos. É também a razão pela qual a troca
se faz agora, e não quando houver gente de fora a usar.

---

## O que fica de fora, e porquê

**O envio de e-mails.** Continua por `mail.conexao.qidominios.com.br`. Mudá-lo
exige criar registos de DNS novos, esperar a verificação do Resend e trocar o
remetente — é uma segunda operação arriscada, e fazê-la no mesmo dia que esta
significaria, se algo partisse, não saber qual das duas foi. Quem recebe um
e-mail praticamente nunca repara no domínio técnico do remetente.

**O endereço antigo não é apagado.** Fica a redirecionar, de propósito e para
sempre: links já enviados, mensagens de WhatsApp antigas e o que estiver escrito
num papel continuam a funcionar. Um endereço que já esteve no ar não se apaga.

## O que impede isto de se desfazer

`tests/o-endereco-do-sistema.test.ts` proíbe o endereço antigo de voltar aos
textos que as pessoas leem. Ele conhece a armadilha: `mail.conexao.…` e
`qiconexao.…` **contêm** `conexao.qidominios.com.br` como pedaço, e o teste
tem de deixar passar os dois.
