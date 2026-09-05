# O CONEXÃO no celular

Dois assuntos que parecem um só e não são: **instalar direto do navegador**
(pronto, funcionando) e **publicar na Play Store** (depende de decisões que
custam dinheiro). O primeiro é pré-requisito do segundo.

---

## O que ficou valendo neste projeto

| coisa | valor |
|---|---|
| Manifest | `public/manifest.webmanifest` |
| Ícones | `public/icones/`, gerados por `scripts/gerar-icones.py` |
| Service worker | `public/sw.js`, cache `conexao-v1` |
| Registro | `services/pwa.ts`, chamado no `index.tsx` |
| Modo de exibição | `standalone` — sem barra de endereço |
| Cor da barra de status | `#1F1A2E` |
| Play Store | **ainda não** — ver a parte 2 |

---

## Parte 1 — instalar direto do navegador

Já funciona. Não custa nada, não passa por loja nenhuma, e a pessoa fica com o
ícone do CONEXÃO na tela do celular.

**Android (Chrome).** Abrir `https://conexao.qidominios.com.br`, tocar nos três
pontinhos (⋮) e escolher **Instalar aplicativo**. Em alguns aparelhos aparece
sozinho um aviso na parte de baixo da tela.

**iPhone (Safari).** Abrir o mesmo endereço, tocar no botão de **Compartilhar**
(o quadrado com a seta para cima) e escolher **Adicionar à Tela de Início**. O
iPhone só instala pelo Safari — pelo Chrome do iPhone a opção não existe.

Depois disso o app abre em tela cheia, com o ícone próprio, e **funciona sem
internet até a tela aparecer** — o que estiver além disso precisa de rede,
porque as conversas moram no servidor.

### O que faz isso funcionar, e o que quebra se sumir

São três coisas, e a falta de qualquer uma **não dá erro nenhum**: o Android
simplesmente deixa de oferecer a instalação, calado.

1. **O manifest** — nome, cores, ícones e `display: standalone`.
2. **Os ícones de 192 e 512 pixels**, mais a versão *maskable*. Sem a maskable
   o Android recorta o ícone na forma dele e corta a marca no meio.
3. **Um service worker registrado, com tratamento de `fetch`.** É exigência do
   Chrome, não escolha nossa.

Por isso o workflow de publicação confere os três e **aborta** se algum faltar.

### O medo do service worker

Ele é a única peça deste projeto capaz de servir uma versão velha para sempre,
sem erro em lugar nenhum. Três regras seguram isso, e estão escritas dentro do
`public/sw.js`:

- **Navegação é sempre rede primeiro.** Estando online, o `index.html` nunca sai
  do cache. É ele que aponta para os arquivos da versão nova.
- **Só entra em cache o que tem hash no nome** (`assets/…`), e esse nunca muda
  de conteúdo.
- **Nada de outra origem passa por ali.** Supabase, Stripe, Sentry e as fontes
  do Google vão direto para a rede. Guardar resposta de API num app com conversa
  de gente real seria vazamento esperando data.

Conferido em 05/09/2026 com um navegador de verdade: publicação nova, o app
recarregou já com os arquivos novos; sem internet, a tela abriu igual.

**Se um dia algo der errado assim mesmo**, o console do navegador resolve sem
depender de publicação nova:

```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
caches.keys().then(ns => ns.forEach(n => caches.delete(n)));
```

### Trocar o ícone

```
python3 scripts/gerar-icones.py
```

As cores e a forma estão no próprio script. Imagem binária no repositório é
decisão que ninguém revisa depois; o script é revisável.

---

## Parte 2 — chegar à Play Store

Não se reescreve nada. O caminho é **TWA** (*Trusted Web Activity*): um app
Android de casca fina que abre o site em tela cheia, sem barra do navegador. É
como Twitter Lite e Uber chegaram lá.

### Antes de começar: a decisão que custa dinheiro

**O Google exige que venda de conteúdo digital dentro do app passe pelo Google
Play Billing, e fica com 15% a 30%.** Vender o Premium por Stripe dentro do app
Android é violação de política — e a punição é a remoção do app.

A saída usual, e a que este projeto recomenda: **o app da loja não vende nada**.
Quem quiser o Premium assina pelo site, no navegador. É o que Spotify e Netflix
fazem, é permitido, e não muda uma linha do que já está construído. O que **não**
se pode fazer é botão de assinatura dentro do app apontando para o Stripe.

### O que ainda falta, e não é código

| item | situação |
|---|---|
| Conta de desenvolvedor Google Play (US$ 25, uma vez) | não criada |
| Verificação de identidade do Google | leva dias |
| Política de privacidade em página pública | **não existe** — é obrigatória |
| Classificação etária 18+ (questionário IARC) | não feita |
| Formulário de Segurança de Dados | não feito |

A política de privacidade é o item mais parado: o Google exige uma **URL pública,
que abra sem login**. Hoje o texto de privacidade do CONEXÃO só existe dentro do
app, nas telas de cadastro e configurações.

### Os passos, quando a hora chegar

**1. Conta.** [play.google.com/console](https://play.google.com/console), US$ 25
uma única vez. Escolher **organização** (com CNPJ) em vez de **pessoal** dispensa
a regra dos 12 testadores por 14 dias, que vale para contas pessoais novas.

**2. Gerar o pacote.** Em [pwabuilder.com](https://www.pwabuilder.com), colar
`https://conexao.qidominios.com.br` e mandar gerar o pacote Android. Sai um
arquivo `.aab` e, junto, o `assetlinks.json`. Não é preciso programar nada.

**3. Publicar o `assetlinks.json`.** Ele vai em
`public/.well-known/assetlinks.json` deste repositório — já foi conferido que o
Vite copia pastas começadas com ponto para o site publicado.

> **A armadilha aqui.** O SHA-256 que entra nesse arquivo é o da chave que o
> **Google** usa para assinar (Play Console → *Configuração* → *Integridade do
> app* → *Assinatura de app*), e não o da chave que você enviou. Errar isso não
> derruba o app: ele abre **com a barra do navegador aparecendo**, parecendo um
> site dentro de um app. É a falha calada desta etapa.

**4. Subir e responder os formulários.** Classificação etária, Segurança de
Dados, e a declaração de app de relacionamento.

**5. Esperar a análise.** Costuma levar de alguns dias a duas semanas na
primeira publicação.

### E a App Store da Apple?

Outra conversa, e mais cara: US$ 99 por ano, e a Apple **rejeita** app que seja
só um site empacotado. Exigiria funções nativas de verdade. Fica para depois de
o produto ter gente usando.

---

## Como saber se está funcionando

**No celular:** o navegador oferecer "Instalar aplicativo" é a prova. Se não
oferecer, é uma das três coisas da parte 1 que faltou.

**No log da publicação:** a linha
`Aplicativo de celular: manifest, service worker e os quatro icones no lugar.`

**Depois de instalado:** abrir o app e olhar o topo da tela. Sem barra de
endereço = está em modo aplicativo. Com barra = o `display: standalone` não foi
lido, ou (na Play Store) o `assetlinks.json` está errado.
