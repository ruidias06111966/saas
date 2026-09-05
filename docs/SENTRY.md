# Registro de erros do CONEXÃO

Roteiro para ligar o Sentry e, principalmente, para **limitar o que ele
recebe**. A parte de ligar leva cinco minutos; a de limitar é a que importa.

> O painel do Sentry é só em inglês, sem opção de troca. Os rótulos vão em
> inglês com a tradução ao lado.

---

## O que ficou valendo neste projeto

| coisa | valor |
|---|---|
| Projeto | `conexao`, plataforma React |
| DSN | variável de repositório `VITE_SENTRY_DSN`, no GitHub |
| Allowed Domains | `https://conexao.qidominios.com.br` |
| Prevent Storing of IP Addresses | **ligado** |
| Data Scrubber / Default Scrubbers | ligados |
| Session Replay | **nunca ativado** |
| Plano | gratuito, 5.000 erros/mês |

**Ligado em 05/09/2026**, confirmado pelo log da publicação: a linha
`=> Registro de erros LIGADO.`

---

## Por que existe

Sem registro de erros, uma falha de renderização é **tela branca**: a pessoa
fecha a aba e ninguém fica sabendo. Não há reclamação, não há alerta, não há
rastro. Com um sistema dá para viver assim; com vários é cegueira.

## 1. Criar o projeto

Em [sentry.io](https://sentry.io/signup/), plano gratuito. Plataforma
**React** (seção *Browser*), nome `conexao`.

Ele mostra um trecho de código com uma linha `dsn: "https://…"`. **Copie só o
que está entre aspas** — esse é o DSN.

**Ignore o resto da tela de instalação.** Ela manda instalar o pacote e colar
código; nada disso é necessário, porque `services/monitoring.ts` já existe e
espera apenas o endereço.

## 2. Guardar o DSN

GitHub → **Settings → Secrets and variables → Actions → Variables** →
**New repository variable**:

| | |
|---|---|
| Name | `VITE_SENTRY_DSN` |
| Value | o DSN do passo 1 |

**O DSN não é segredo.** Ele vai dentro do JavaScript que qualquer visitante
baixa — é assim que um SDK de navegador funciona. Por isso fica em *Variables*
e não em *Secrets*: guardá-lo como segredo daria uma falsa sensação de
proteção, e quem realmente protege o projeto é o passo 4.

## 3. Publicar

Variável nova **não republica sozinha**. Em **Actions → Publicar no GitHub
Pages → Run workflow**.

O log confirma: `=> Registro de erros LIGADO.` Se disser "desligado", a
variável não chegou — confira se está em *Variables* e não em *Secrets*, e se
o nome está exato.

## 4. Fechar a porta: Allowed Domains

**Settings → Projects → conexao → General Settings**, seção **Client
Security**.

O campo **Allowed Domains** vem com **`*`**, que significa "aceito evento de
qualquer origem". Apague o asterisco e ponha:

```
https://conexao.qidominios.com.br
```

**O asterisco precisa sair.** Se ficar junto com o domínio, ele vence: é
permissivo e anula a lista.

Sem isso, qualquer pessoa que leia o DSN no seu site pode gastar os 5.000
eventos do mês mandando lixo.

> Se um dia o Sentry parar de receber qualquer erro, este campo é a primeira
> suspeita. Voltar o `*` temporariamente separa "domínio escrito errado" de
> "não há erro nenhum acontecendo".

## 5. Não guardar endereço IP

**Settings → Projects → conexao → Security & Privacy** →
**Prevent Storing of IP Addresses** → **ligar**.

Endereço IP é dado pessoal pela LGPD: identifica indiretamente a pessoa e
revela aproximadamente onde ela está. Num aplicativo de relacionamentos isso
pesa mais do que em outros — um vazamento no Sentry passaria a ser vazamento
de localização.

E não precisamos dele. Interessa **onde no código** quebrou, não de que casa
veio o erro.

Na mesma tela, deixe **Data Scrubber** e **Use Default Scrubbers** ligados, e
acrescente em **Additional Sensitive Fields**, um por linha:

```
birth_date
approx_lat
approx_lng
password
token
```

São os campos que a auditoria de 03/09/2026 apontou como sensíveis neste
sistema. O código já não os envia; isto é cinto e suspensório, contra um
descuido futuro.

---

## O que o código já garante, e não depende do painel

Está em `services/monitoring.ts`, com o raciocínio ao lado de cada decisão:

**`sendDefaultPii: false`** — nem e-mail, nem IP, nem cabeçalho de requisição.

**Session Replay desligado, e nunca ativado.** Ele grava a tela; nesta tela há
conversa de gente real. Não é integração padrão do SDK — só entra se alguém
acrescentar. **Não acrescente.**

**A URL é limpa antes de sair.** Depois de confirmar o e-mail, o Supabase traz
a pessoa de volta com a sessão na própria URL (`#access_token=…`, ou `?code=…`
no PKCE). Existe uma janela em que a URL contém um token válido — e é
exatamente a URL que um SDK de erros manda junto. `limparUrl()` remove
`access_token`, `refresh_token`, `provider_token`, `provider_refresh_token`,
`token_hash` e `code`, tanto da parte de consulta quanto do fragmento.

**Console não vira migalha.** `beforeBreadcrumb` devolve `null` para
breadcrumbs de console: mensagens de depuração podem conter qualquer coisa.

**`tracesSampleRate: 0`** — sem medição de desempenho, que gastaria a cota sem
responder nenhuma pergunta que este projeto tenha hoje.

**Da pessoa sai só o id**, nunca nome ou e-mail. É o bastante para distinguir
"um erro atingiu três pessoas" de "uma pessoa tropeçou trezentas vezes", que é
a pergunta que o registro precisa responder.

---

## Como saber se está funcionando

Não há o que fazer: **o primeiro erro real aparece lá**. Um painel vazio depois
de uma semana é boa notícia, não sinal de falha.

Quem quiser confirmação imediata pode provocar um erro de propósito numa aba
anônima e ver se ele chega — mas isso consome um evento da cota e não prova
nada que o primeiro erro real não prove sozinho.
