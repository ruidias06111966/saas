# Aviso no celular do QICONEXÃO

Roteiro para ligar as notificações que chegam ao aparelho mesmo com o
aplicativo fechado. **O código já está pronto e publicado.** Falta uma coisa
só, e ela precisa das suas mãos: um par de chaves.

---

## O que ficou valendo neste projeto

| coisa | valor |
|---|---|
| Tabela | `public.push_subscriptions`, uma linha por aparelho |
| Servidor | Edge Function `notificar` |
| Service worker | `public/sw.js`, ouvintes `push` e `notificationclick` |
| Cliente | `services/push.ts`, interruptor em Configurações |
| Chave pública | variável de repositório `VITE_VAPID_PUBLIC_KEY`, no GitHub |
| Chave privada | segredo `VAPID_PRIVATE_KEY`, no Supabase |
| Conteúdo do aviso | "Você tem uma mensagem nova" — e nada mais |

---

## Por que existe

Num aplicativo de conversa, o aviso é a diferença entre a pessoa responder
hoje ou daqui a três dias. Sem ele, quem recebe mensagem só descobre se
resolver abrir o app por conta própria — e num produto novo, quase ninguém
resolve.

## O que o aviso NÃO leva, e por quê

O aviso diz **"Você tem uma mensagem nova"**. Não diz de quem, não mostra
trecho, não leva foto.

Não é timidez de design. O conteúdo de um push passa pelos servidores do
fabricante do sistema — Google no Android, Apple no iPhone — e fica visível na
tela bloqueada do aparelho. Num aplicativo de relacionamentos, o nome de quem
mandou mensagem aparecendo na tela travada do celular de alguém pode ser o
problema, não o serviço.

Quem quiser saber quem foi, abre o app. É um toque a mais e uma preocupação a
menos.

---

## 1. Gerar o par de chaves

**Você gera, no seu computador.** Eu não gero por você de propósito: a chave
privada é segredo, e segredo que passa por uma conversa é segredo que precisa
ser trocado depois.

Abra o terminal e rode:

```
npx web-push generate-vapid-keys
```

Sai algo assim:

```
=======================================
Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkT...

Private Key:
8eDyX_uCN0XRhSbCYwF1a5yAcA6mnZ...
=======================================
```

> **VAPID** é o padrão que prova ao Google e à Mozilla que o aviso partiu do
> nosso servidor, e não de qualquer um que tenha descoberto o endereço do
> aparelho de alguém. As duas chaves são um par: uma sem a outra não serve.

## 2. Guardar a chave PÚBLICA no GitHub

GitHub → **Settings → Secrets and variables → Actions → Variables** →
**New repository variable**:

| | |
|---|---|
| Name | `VITE_VAPID_PUBLIC_KEY` |
| Value | a **Public Key** do passo 1 |

**Esta chave não é segredo.** Ela vai dentro do JavaScript que qualquer
visitante baixa — é assim que o padrão funciona, porque o navegador precisa
dela para se inscrever. Por isso fica em *Variables* e não em *Secrets*.

## 3. Guardar a chave PRIVADA no Supabase

O painel do Supabase é só em inglês. O caminho é
**Edge Functions** (Funções de Borda) **→ Secrets** (Segredos) →
**Add new secret**.

| segredo | valor |
|---|---|
| `VAPID_PRIVATE_KEY` | a **Private Key** do passo 1 |
| `VAPID_PUBLIC_KEY` | a **Public Key** do passo 1 (a mesma, o servidor também precisa) |
| `VAPID_SUBJECT` | `mailto:` mais um e-mail seu de contato |

> **A privada nunca sai daqui.** Não entra no repositório, não entra em
> variável do GitHub, não passa por conversa nenhuma. Quem a tiver consegue
> mandar notificação em nome do QICONEXÃO para qualquer aparelho inscrito.

`VAPID_SUBJECT` é exigência do padrão: os serviços de push querem um contato
para avisar caso algo dê errado do lado deles.

## 4. Publicar

Variável nova **não republica sozinha**. Em **Actions → Publicar no GitHub
Pages → Run workflow**.

## 5. Conferir

No celular, com o app instalado:

1. **Configurações** → o cartão **Avisos no celular** tem de aparecer com um
   interruptor. Se ele disser "Este navegador não recebe avisos", a variável
   do passo 2 não chegou ao pacote.
2. Ligue o interruptor e aceite a permissão que o navegador pede.
3. Peça a alguém para te mandar uma mensagem — ou entre por outra conta e
   mande você mesmo, de outro aparelho.
4. O aviso chega em segundos.

Se o interruptor liga mas nada chega, o problema está nos segredos do passo 3.
Nos **Logs** da Edge Function `notificar`, procure por `Push não configurado`.

---

## O que funciona onde

**Android (Chrome, Edge, Samsung Internet):** funciona, com ou sem o app
instalado.

**iPhone:** funciona **só a partir do iOS 16.4** e **só depois de adicionar o
QICONEXÃO à Tela de Início pelo Safari**. Aberto no Safari comum, a API nem
existe — e o app diz isso na tela, em vez de esconder o cartão e deixar a
pessoa achando que o aviso está ligado.

**Computador:** funciona em Chrome, Edge e Firefox.

---

## O que o código já garante, e não depende do painel

**O cliente não escolhe a quem avisar.** A Edge Function recebe só o id da
conversa; quem descobre o destinatário é ela, lendo a conexão no banco, depois
de conferir que quem chamou participa mesmo dela. Se o cliente pudesse nomear
o destinatário, qualquer pessoa autenticada mandaria notificação para qualquer
outra — num aplicativo de relacionamentos, isso é ferramenta de assédio.

**Bloqueio cala o aviso.** Havendo bloqueio entre as duas partes, ninguém é
notificado.

**A permissão só é pedida com um toque.** Pedir ao abrir o app é o caminho
mais curto para o "Bloquear", que é definitivo e o aplicativo não desfaz. Por
isso a única chamada está atrás do interruptor.

**Aparelho morto sai da tabela.** Quando o serviço de push responde 404 ou 410,
a inscrição é apagada na hora. Só essas duas respostas autorizam apagar — erro
de rede, não.

**Inscrição pela metade não existe.** Se guardar no servidor falhar, o app
desfaz a inscrição no navegador. Ficaria um aparelho inscrito que o servidor
não conhece, e o interruptor mentiria dizendo "ligado".

**A tabela é fechada por RLS.** Cada pessoa só enxerga as próprias inscrições —
nem admin lê as dos outros. O endereço de push identifica um aparelho, e saber
que ele existe já é saber que a pessoa tem conta aqui.
