# Mudar o endereço do site

> **Endereço antigo:** `conexao.qidominios.com.br`
> **Endereço novo:** `qiconexao.qidominios.com.br`
>
> O envio de e-mails **não muda** nesta operação: continua por
> `mail.conexao.qidominios.com.br`, verificado no Resend. Foi uma decisão
> deliberada — ver "O que fica de fora", no fim.

## Estado: completo em 16/10/2026

Os onze passos estão feitos, e os três que importam estão **medidos de fora**,
não supostos:

```
1. O endereço novo responde?              ✓ 200
2. O endereço antigo manda para o novo?   ✓ 301, com caminho e pergunta
                                            preservados
3. Os cabeçalhos de segurança?            ✓ os 6 presentes
```

Para repetir esta medição a qualquer momento, sem acreditar em ninguém:

```
node scripts/conferir-o-endereco.mjs
```

Ele pede as páginas de fora e diz o que encontrou. É o mesmo programa que
produziu os números deste documento.

> **Vale a pena correr isto depois de qualquer mexida na Cloudflare, no GitHub
> Pages ou no DNS.** As três coisas que ele mede falham todas em silêncio: o
> site continua a abrir, bonito e normal, e mesmo assim os links antigos
> morrem ou a proteção desaparece.

## Por que isto tem um documento só para si

Mudar o endereço não é uma mudança de código: é uma mudança em **oito painéis
diferentes**, e as falhas não aparecem como erro. Aparecem assim:

| Esquecido | O que a pessoa vê |
|---|---|
| Supabase → Redirect URLs | clica no link do e-mail e **não entra**. Nenhum erro |
| Supabase → `URLS_DO_APP` | o pagamento não volta para o site |
| **GitHub → Settings → Pages** | o endereço novo responde **404**, com tudo o mais certo |
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

> A nuvem laranja tem de ficar **desligada enquanto o certificado não sair**.
> Com ela ligada o GitHub não consegue emitir o certificado de segurança, e o
> site aparece com aviso de "não seguro" — sem explicação de onde veio.
>
> **Depois** de o certificado estar emitido, a nuvem laranja volta a ser uma
> escolha — e uma escolha com consequência, que o passo 10 explica. Deixá-la
> cinzenta para sempre custa os seis cabeçalhos de segurança.

Sozinho, este passo não muda nada: o GitHub ainda não sabe servir este nome.

## Passo 2 — Supabase: aceitar os DOIS endereços

Supabase → o projeto → **Authentication** → **URL Configuration**.

Em **Redirect URLs**, **acrescentar** (sem apagar as que já lá estão):

```
https://qiconexao.qidominios.com.br/
https://qiconexao.qidominios.com.br/**
```

**Deixe o `Site URL` como está, por agora.** Ele muda no passo 8, depois de o
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

> É esta variável que faz a publicação escrever o ficheiro `CNAME`, que vai
> dentro do que é publicado. O código não tem o endereço escrito em lado
> nenhum — vem todo daqui.

## Passo 6 — Publicar

**Só agora** é que o código novo entra. Avise-me e eu junto o pedido: a
publicação escreve o `CNAME` novo.

## Passo 7 — GitHub → Settings → Pages: reivindicar o nome

**Este é o passo que eu omiti na primeira vez, e foi por isso que o endereço
novo respondeu 404 depois de tudo o resto estar certo.**

GitHub → o repositório → **Settings** → **Pages** → **Custom domain**:

```
qiconexao.qidominios.com.br
```

→ **Save**, e esperar o "DNS check successful".

### Por que o ficheiro `CNAME` não bastou

Era a minha suposição, e estava errada. O que está medido:

```
$ curl https://qiconexao.qidominios.com.br/CNAME
qiconexao.qidominios.com.br          ← o ficheiro ESTÁ publicado
```

O ficheiro foi escrito pela publicação, subiu, e **está servido no ar** — e
ainda assim o endereço respondia 404 até o campo acima ser preenchido à mão.

A razão: nesta publicação, quem reivindica o nome junto do GitHub é o **campo
do painel**, não o ficheiro. (No modo antigo de publicar — um `CNAME` fixo
dentro de um ramo do repositório — era o ficheiro que o definia. Esta base
publica pelo Actions, e aí o painel é que manda.) O `CNAME` continua a ser
necessário, só que não é suficiente.

O certificado de segurança pode demorar alguns minutos a sair depois do Save.
Enquanto não sair, o navegador avisa que a ligação não é segura — é normal, e
passa sozinho. Se passar de uma hora, tirar e repor o domínio próprio neste
mesmo campo força nova emissão.

## Passo 8 — Provar, e só então fechar

Com as contas que existem, no endereço novo:

1. Entrar com e-mail e senha.
2. Abrir uma conversa e ver as mensagens antigas.
3. Abrir o manual e baixar o PDF.

Só depois disto: Supabase → **Authentication** → **URL Configuration** →
**Site URL** → passar para `https://qiconexao.qidominios.com.br/`.

## Passo 9 — Mandar o endereço antigo para o novo

Quem tinha `conexao.qidominios.com.br` guardado precisa de chegar ao sítio
certo. Sem esta regra encontrava isto:

```
$ curl -I https://conexao.qidominios.com.br/
HTTP/2 404
server: cloudflare
```

O `server: cloudflare` na resposta diz que a nuvem laranja do nome antigo já
estava ligada: o pedido passava pela Cloudflare, que o entregava ao GitHub, e
o GitHub respondia 404 porque nenhum site Pages reivindicava aquele nome.
Faltava só a regra.

Cloudflare → **Regras** → **Regras de redirecionamento** → **Criar regra**.

**Não use os três modelos do topo da página.** O terceiro ("Redirecionar para
um domínio diferente") aplica-se a *todas* as solicitações do domínio — o
endereço novo incluído, que passaria a redirecionar para si próprio. Preencha
o formulário de baixo, que diz a origem por extenso.

| Campo | Valor |
|---|---|
| Nome da regra | `conexao antigo vai para qiconexao` |
| Coincidir com | **Padrão de curinga** |
| URL da solicitação | `https://conexao.qidominios.com.br/*` |
| URL de destino | `https://qiconexao.qidominios.com.br/${1}` |
| Status | **301** (permanente) |
| Preservar string de consulta | ligado |

O `*` apanha tudo o que vier depois da barra; o `${1}` volta a pô-lo no
endereço novo. É isso que faz um link antigo para `/termos.html` cair em
`/termos.html`, e não na página inicial — e é a parte que mais se esquece,
porque um redirecionamento que atira tudo para a raiz **parece** funcionar.

A regra responde na borda da Cloudflare, antes de chegar ao GitHub — por isso
o 404 deixou de existir no instante em que ela entrou.

Para conferir, sem abrir o navegador:

```
node scripts/conferir-o-endereco.mjs
```

Ele não se contenta com "redireciona": confere que o destino é o endereço
novo, que o **caminho** se mantém (um link antigo para `/termos.html` tem de
cair em `/termos.html`, não na página inicial) e que a **pergunta** do link
(`?...`) sobrevive.

## Passo 10 — Os cabeçalhos de segurança

Aqui eu disse-lhe uma coisa errada e corrijo-a. Eu disse que havia o risco de
a regra dos cabeçalhos estar **"presa ao nome antigo"**. Fui medir. Não é isso.

### O que está medido

O endereço novo **não passa pela Cloudflare**. A nuvem dele é cinzenta — como o
passo 1 manda, para o certificado poder sair — e por isso **nenhuma regra da
Cloudflare o alcança**. Não há regra errada: há uma regra que não é consultada.

Como se separou o que é da Cloudflare do que é do GitHub: pedi a **mesma**
página de erro do GitHub pelos dois caminhos e subtraí.

| Cabeçalho | Pelo antigo (via Cloudflare) | Pelo novo (direto ao GitHub) |
|---|---|---|
| `strict-transport-security` | presente | **ausente** |
| `x-frame-options` | presente | **ausente** |
| `x-content-type-options` | presente | **ausente** |
| `referrer-policy` | presente | **ausente** |
| `cross-origin-opener-policy` | presente | **ausente** |
| `permissions-policy` | presente | **ausente** |
| `content-security-policy` | presente | presente — **este é do GitHub** |

Os seis primeiros vêm da Cloudflare. O sétimo não: o GitHub manda um só dele, e
tratá-los todos como iguais daria um verde falso.

Que são mesmo da regra deste sistema, e não genéricos, vê-se no conteúdo de um
deles: `permissions-policy: camera=(self), microphone=(), geolocation=(self)` —
câmara e localização para o próprio site, microfone para ninguém. É a lista das
funções desta aplicação. Ninguém escreve isto por acidente.

**Conclusão: desde a troca de endereço, o site serve sem estes seis.** O site
funciona igual. É proteção a menos, não avaria.

### A escolha

Para os ter de volta, o endereço novo tem de passar pela Cloudflare — e aí a
regra passa a valer para ele. A regra vive em Cloudflare → **Rules** →
**Transform Rules**, nas de **Modify Response Header**; basta que o filtro dela
cubra o nome novo, ou que valha para todo o domínio.

**O GitHub Pages não tem como enviar estes cabeçalhos por si**: não existe
ficheiro de configuração para isso. Ou vêm de um intermediário, ou não vêm.

| | Ligar a nuvem laranja em `qiconexao` | Deixar como está |
|---|---|---|
| Os seis cabeçalhos | voltam | continuam ausentes |
| O site | **há um risco, abaixo** | funciona, e não se toca em nada |

**O risco era este:** se o modo SSL/TLS da zona estivesse em **"Flexible"**,
ligar a nuvem laranja punha o site num ciclo de redirecionamentos e ele
deixava de abrir.

**Conferido em 16/10/2026, e o risco não se aplica.** Cloudflare → **SSL/TLS**
→ **Overview** diz:

```
Modo de criptografia atual:  Completo        ← o "Full"
Modo automático ativado
```

"Completo" é o "Full": a Cloudflare liga-se à origem por HTTPS. É o modo em
que ligar a nuvem é seguro. (O modo automático pode reavaliar isto sozinho de
tempos a tempos, mas só sobe para o mais seguro que a origem aguenta — e o
GitHub Pages serve HTTPS, por isso não desce para "Flexible".)

### Os dois cliques, e o segundo é o que se esquece

1. Cloudflare → **DNS** → no registo `qiconexao`, **ligar a nuvem laranja** e
   **Salvar**.
2. Cloudflare → **Regras** → **Visão geral** → secção **Regras de
   Transformação de Cabeçalho de Resposta** → a regra `Cabeçalhos de
   segurança` → alargar o filtro dela ao nome novo.

O passo 2 é o que parece dispensável e não é. Com a nuvem ligada e o filtro
ainda preso ao nome antigo, mediu-se isto:

```
endereço antigo (Cloudflare)   permissions-policy: presente
endereço novo   (Cloudflare)   permissions-policy: AUSENTE
```

Os dois a passar pela Cloudflare; só um a receber. Fica assim, e parece feito.

O filtro ficou a cobrir os dois endereços — no painel, trocar o operador **"é
igual a"** por **"está em"** e pôr os dois nomes:

```
(http.host in {"conexao.qidominios.com.br" "qiconexao.qidominios.com.br"})
```

Cobrir os dois e não só o novo é de propósito: o antigo serve hoje apenas o
redirecionamento, mas um redirecionamento também devolve cabeçalhos, e não há
razão para o deixar nu.

E logo a seguir, para não ficar na suposição:

```
node scripts/conferir-o-endereco.mjs
```

Se alguma coisa correr mal, **desligar a nuvem laranja devolve o site ao estado
de antes em segundos**. É uma mudança reversível com um clique.

Feito em 16/10/2026, sem incidente: o site não piscou, e os seis cabeçalhos
apareceram na medição seguinte.

> Uma consequência a saber, que não é problema hoje: com a nuvem ligada, quem
> visita passa a receber o certificado da Cloudflare, não o do GitHub. O do
> GitHub continua a existir por baixo, e é o que a Cloudflare vê. Se um dia a
> renovação automática dele falhar, o site continua a abrir na mesma — o modo
> "Completo" não exige que esse certificado esteja perfeito.

## Passo 11 — O telefone

Estas duas coisas estão amarradas ao endereço, e não se transferem:

- **O aplicativo instalado** aponta para o endereço antigo. Desinstalar e
  instalar outra vez a partir de `qiconexao.qidominios.com.br`.
- **Os avisos no celular**. A inscrição é por endereço: é preciso abrir
  Configurações no endereço novo e **ligar outra vez** o aviso.

Com poucas contas isto é trabalho de minutos. É também a razão pela qual a
troca se faz agora, e não quando houver gente de fora a usar.

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

O mesmo ficheiro guarda também este documento: obriga-o a continuar a nomear o
painel do GitHub Pages e a não voltar a dizer que o ficheiro `CNAME` basta. Foi
o buraco que custou um 404 em produção, e um documento é onde ele se esconde
melhor.

`scripts/conferir-o-endereco.mjs` mede os dois pontos que ainda faltam. Não
corre nos testes de propósito: fala com a internet, e `npm run build` tem de
funcionar sem rede.
