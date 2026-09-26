# QICONEXÃO — arquitetura e decisões

## Princípio que organiza tudo

**Regra de negócio não mora em componente React.** Termômetro de conversa, reputação,
moderação, perfil e localização são funções puras em `services/`, sem React e sem I/O.
E as regras do mercado — sigilo das propostas, cota, liberação do telefone — moram um
nível abaixo, **no banco**, com RLS e gatilhos: limite que só existe no navegador não é
limite.

```
types.ts            Modelo de domínio. Espelha as tabelas do Postgres.
constants.ts        Rótulos, cotas por plano, degraus da conversa, motivos de denúncia.

services/
  mercado.ts        Anúncios e propostas: busca sob demanda, paginada (ver abaixo)
  perfil.ts         Completude do perfil profissional e o que falta preencher
  conversation.ts   Termômetro (4 métricas) + reputação
  moderation.ts     Heurística local de risco (camada 1)
  geminiService.ts  Copiloto (camada 2 de moderação + sugestões), com fallback local
  localizacao.ts    Cidade → coordenada, sem acento decidir onde a pessoa mora
  lgpd.ts           Exportação, anonimização, retenção
  politicas.ts      Versão das políticas e pedido de reaceite
  verification.ts   Verificação por selfie
  billing.ts        Checkout e portal do Stripe
  push.ts, pwa.ts   Aviso no celular e app instalável
  monitoring.ts     Registro de erros (Sentry), limitado no que recebe
  backend.ts        Leitura e escrita no Supabase (modo online)
  storage.ts        Persistência local (modo demo)
  utils.ts          Hash determinístico, PRNG semeado, haversine, formatação

state/
  appState.ts       Reducer puro + seletores
  AppContext.tsx    Provider, roteamento, ações de domínio, toasts

data/               8 perfis profissionais fictícios, atividade semeada, perguntas curadas
components/         UI genérica + componentes de produto (Portrait, Termômetro, …)
screens/            22 rotas
supabase/           Edge Functions e migrações numeradas
```

## O mercado

O QICONEXÃO começou como aplicativo de relacionamentos e virou mercado de serviços
profissionais (migrações 008 a 020). O fluxo é: **quem precisa publica** um anúncio,
**quem sabe fazer envia proposta**, **quem publicou escolhe**, e a **proposta aceita
libera o telefone** dos dois lados.

As regras que sustentam a confiança são impostas no banco:

- **Proposta sigilosa.** Cada profissional lê só a própria proposta; quem publicou lê
  todas. Um gatilho impede o profissional de aceitar a própria proposta ou trocar o
  preço depois de enviada. A política de `anuncios` consultava `propostas`, cuja política
  consultava `anuncios` — recursão infinita; a pergunta foi para uma função com direitos
  do dono (011).
- **Telefone só depois do acordo.** A coluna não sai em nenhuma view. Quem a lê é
  `contato_do_negocio()`, que exige proposta aceita e que quem pergunta seja parte dela.
  Num quadro com telefone à vista, o primeiro a se cadastrar em massa é quem quer a lista.
- **Cota de propostas.** Três por mês no gratuito, imposta pelo gatilho
  `private.cota_de_propostas` (016). Retirar uma proposta não devolve cota. Publicar
  anúncio não tem limite: cobra-se do lado abundante e subsidia-se o escasso.
- **Busca sem acento.** Configuração de texto `portugues_sem_acento` com `unaccent`:
  "goiania" encontra "Goiânia". A mesma armadilha do acento já tinha posto três contas a
  870 km de casa, na localização.
- **Anúncios expiram** em 30 dias (`expires_at`) e saem do quadro sozinhos.
- **37 categorias em 9 grupos**, numa tabela: é catálogo, não dado de ninguém, e por isso
  é a única leitura pública.

**Por que `mercado.ts` não segue o padrão do resto do app.** `backend.ts` carrega um
retrato de tudo no arranque, e as telas leem da memória — funciona para o que é pequeno e
pessoal (as suas conversas, o seu perfil). Um quadro de anúncios é o contrário: grande, de
todo mundo, muda o dia inteiro e é **procurado**. Então aqui é busca sob demanda, 20 por
página, e cada tela guarda o próprio resultado. Por isso o mercado não tem modo demo.

## Termômetro de Conversa e reputação

A negociação acontece numa conversa, e o termômetro mede se ela **anda**. Quatro métricas
normalizadas e dois fatores de amortecimento; os fatores são o que impede a métrica de
ser enganada — sem eles, seis mensagens curtas em uma hora dariam nota alta.

```
score = (0,28·recip + 0,28·prof + 0,22·const + 0,22·abert)
        × log2(1+n)/log2(41)          ← substância
        × (0,65 + 0,35·min(1, dias/5)) ← duração
```

Cinco degraus: Primeiro contato (0), Conversando (20), Entendendo (40), Alinhando (62) e
Pronto (82). No app antigo o mesmo número abria o véu da foto; essa segunda função saiu no
pivô, e o termômetro ficou só com a primeira.

A reputação (`user.reputation`, 0–100) é ajustada no encerramento: +3 ao se despedir de
uma conversa com 6+ mensagens, −4 ao sumir. Quem grava é `encerrar_conversa()`, no banco,
contando as mensagens reais — não o número que o navegador afirma.

## A foto: credencial, não recompensa

No app antigo a foto era o prêmio da conversa: guardada como pirâmide de resoluções, com
o banco liberando um nível por vez (o "véu", ver o histórico no fim). Num mercado de
serviços é o contrário — o rosto de quem vai entrar na sua obra é credencial. Desde a
migração 019 a política do Storage chama `private.perfil_visivel`, **a mesma função** que
decide quem aparece em `perfis_do_mercado`: não uma regra parecida, a mesma. Duas regras
parecidas é como elas divergem, e foi assim que o bug da foto borrada nasceu.

O envio grava **um arquivo, o original** (#33). A Edge Function `velar` segue publicada
e sem nenhum chamador. A política de escrita não mudou nem precisou mudar — o dono sempre
só pôde escrever `-orig.jpg`; os níveis borrados só nasciam pela chave de serviço, dentro
da `velar`.

Duas cicatrizes que vale carregar:

- **O pivô chegou ao cliente e não ao banco.** `resolveImage` passou a pedir o original
  no dia do pivô; a policy continuou liberando só o nível 0 para quem não fosse dono.
  Não houve erro nenhum — apareceu a foto borrada de todo profissional, para todo mundo,
  por meses. Não foi visto porque existia UMA conta no sistema: ninguém nunca tinha
  aberto o perfil de outra pessoa.
- **A degradação graciosa esconde a falha.** `resolveImage` desce nível a nível até algo
  passar, transformando "o banco me negou" em "achei uma versão pior". É a mesma armadilha
  do bug de `grant` descrito no histórico do véu. A descida continua lá como rede de
  segurança para as fotos antigas, e continua sendo o lugar onde um sintoma vai sumir.

Sem foto, `GenerativePortrait` desenha um SVG determinístico a partir de `hash32(id)`.
Mesma pessoa, sempre a mesma arte, e nenhuma foto de pessoa real nos dados fictícios.

## IA: sugere, nunca escreve — e a chave nunca chega ao navegador

**A chave do Gemini não existe no cliente.** Não há caminho no código que a leve ao
navegador: o pacote `@google/genai` foi removido das dependências do app. Toda geração
passa pela Edge Function `copiloto` (`supabase/functions/copiloto`), onde a chave é
segredo do projeto.

Duas proteções de desenho na função:

1. **Exige JWT.** `verify_jwt` ligado — só gente autenticada chama. Foi por isso que
   esta etapa dependia da autenticação existir primeiro.
2. **O servidor é dono dos prompts.** O cliente envia apenas dados de perfil já
   públicos, em campos tipados e truncados em 4000 caracteres, e escolhe uma ação de
   uma lista fechada de oito. Não há como injetar `systemInstruction` nem transformar
   a função num proxy genérico de LLM. O `systemInstruction` inclui a instrução de
   ignorar ordens que apareçam dentro dos dados de perfil.

A regra estrutural continua: **toda função tem fallback determinístico local**. Sem
backend, ou sem `GEMINI_API_KEY` no servidor, a função devolve `{ fallback: true }` e o
app segue funcionando com o banco curado de perguntas. Nenhuma tela quebra em nenhuma
combinação.

O `profileDigest` que vai para o modelo só carrega o que já é público no perfil: nunca
e-mail, senha ou coordenada.

## Moderação em duas camadas

| | Camada 1 | Camada 2 |
|---|---|---|
| Onde | `services/moderation.ts` | `geminiService.moderateWithAI` |
| Quando | antes de todo envio | só quando a camada 1 acende amarelo/vermelho |
| Custo | zero, sem rede | uma chamada ao Gemini |
| Decide? | **não** | **não** |

Nenhuma das duas suspende conta. As duas apenas classificam e empurram para a fila de
revisão humana no painel administrativo. Mensagem de nível "risco" abre um diálogo de
confirmação consciente antes do envio, explicando o golpe ou a violação.

Há dois níveis. **Risco** marca a mensagem, aparece para os dois lados e entra na fila por
gatilho no banco (020). **Atenção** não marca nada: é conselho para quem escreve, mostrado
uma vez. A diferença nasceu de um caso real — combinar o telefone pelo WhatsApp ganhava
"em revisão" para sempre, e num mercado de serviços combinar contato depois do aceite é o
objetivo do produto. As decisões do painel ficam gravadas no servidor, com quem decidiu.

## LGPD implementada, não prometida

| Direito (art. 18) | Onde |
|---|---|
| II e V — acesso e portabilidade | `exportUserData` → download JSON |
| III — correção | tela de edição de perfil |
| VI — eliminação | `DELETE_ACCOUNT` + `anonymizeUser` |
| Art. 8º §1º — prova de consentimento | `user.consents`, versionados com data |

Denúncias **contra** a pessoa sobrevivem à exclusão, anonimizadas: a base legal ali é o
legítimo interesse de proteger outras pessoas, não o consentimento de quem saiu.

Localização é arredondada a 0,05° (≈5 km) antes de ser persistida (`blurCoord`) e nunca
exibida como número: só faixas (`distanceBand`).

## Persistência e o caminho para o backend

O app tem **dois modos**, decididos por variável de ambiente, e as telas não sabem em
qual estão rodando — com uma exceção deliberada: o mercado só existe no modo online.

| | Modo demo | Modo online |
|---|---|---|
| Gatilho | sem `VITE_SUPABASE_*` | com as duas variáveis |
| Persistência | `localStorage` | PostgreSQL, via `services/backend.ts` |
| Auth | SHA-256 local (`services/utils`) | Supabase Auth (`services/auth.ts`) |
| Imagens | dataURL | bucket privado `midia` (`services/media.ts`) |

O que tornou isso possível sem reescrever as telas foi o schema espelhar `types.ts`
quase 1:1. O estado continua sendo um `AppState` em memória; só muda de onde ele vem.

**Fluxo online.** Na montagem, `AppContext` restaura a sessão e chama
`backend.loadSnapshot()`, que traz exatamente o recorte que o RLS permite — perfis
visíveis (pela view `perfis_do_mercado`), apenas as conexões e mensagens em que a pessoa participa, e a fila de
moderação só para admin. O resultado entra no reducer por `HYDRATE_REMOTE`.

**Escrita local-first.** Cada ação de domínio despacha para o reducer primeiro (UI
instantânea) e chama `persist()` em seguida. Se o servidor recusar, aparece um toast
pedindo recarregar — o estado local nunca mente em silêncio sobre ter salvado.

**Privacidade do cache.** Em modo online, `saveState` grava no `localStorage`
**apenas o tema**. Espelhar o banco ali deixaria mensagens de conversas reais em claro
no navegador, sobrevivendo ao logout.

### Realtime

`services/realtime.ts` assina `messages` e `connections` por `postgres_changes`. Três
decisões que valem registro:

- **Não há filtro por id no cliente.** O Supabase entrega os eventos já filtrados pelo
  RLS de quem assina, e a policy de `messages` exige participar da conexão. Filtrar de
  novo aqui daria falsa sensação de segurança e esconderia um erro de policy.
- **`REPLICA IDENTITY FULL` nas duas tabelas.** Sem isso o WAL carrega apenas a chave
  primária nos `UPDATE`, e o RLS não teria colunas suficientes para decidir quem pode
  receber o evento. Custa mais WAL por escrita — na escala deste app, vale a correção.
- **`UPSERT_MESSAGE` é idempotente.** A mensagem que você acabou de enviar volta pelo
  stream, e o `UPDATE` de leitura chega com o mesmo id. Em ambos os casos o reducer
  substitui em vez de duplicar. É isso que faz o recibo de leitura ("enviada" → "lida")
  aparecer ao vivo no lado de quem enviou.

O handler consulta rota e lista de usuários por `ref`, não por dependência do efeito:
senão a assinatura seria refeita a cada navegação ou mudança de estado.

### Paginação, e a consequência que ela teve no termômetro

`loadSnapshot` trazia o histórico inteiro de todas as conversas de uma vez. Funciona
com poucos perfis fictícios e não funciona com quem conversa há um ano. Agora o
primeiro carregamento traz as **últimas 40 mensagens de cada conversa**
(`mensagens_recentes`), e o resto vem sob demanda (`mensagens_anteriores`).

A consequência não é óbvia e é a parte interessante: **sem o histórico completo, o
cliente não pode mais calcular o termômetro sozinho**. Ele contaria menos mensagens e
menos dias, e a conversa *regrediria* de degrau por causa de uma decisão de
performance. Numa conversa real de 14 mensagens, calcular só sobre as 5 últimas dá score
23 em vez de 58.

Por isso `termometros()` vem junto no primeiro carregamento, e o seletor `healthOf`
escolhe a fonte:

- **cliente tem tudo** (modo demo, ou conversa que coube numa página, ou já lida até o
  começo) → conta local, que reage na hora à mensagem que você acabou de mandar;
- **cliente tem só o fim** → valor do Postgres, recalculado a cada envio.

As duas implementações — `services/conversation.ts` e `private.termometro()` — foram
comparadas com a mesma conversa sintética e devolvem os mesmos oito números. Para não
duplicar a interpretação, só as *medidas cruas* têm duas origens: estágio, próximo
objetivo e silêncio são derivados uma única vez, em `buildHealth()`.

### Cota de IA imposta no servidor

O limite diário era conferido no cliente. Agora quem conta é `public.consumir_cota_ia()`,
chamada de dentro da Edge Function `copiloto` com o JWT de quem pediu; o `for update`
serializa dois pedidos simultâneos, que antes gastariam uma cota só. **`moderar` é
isenta**: é proteção, não conveniência, e não pode parar de funcionar porque as
sugestões do dia acabaram.

### "Digitando…" de verdade

Broadcast em canal privado (`conversa:<id>`), não tabela: o aviso é efêmero e não merece
uma linha no banco. O canal é privado por policy em `realtime.messages` — senão qualquer
pessoa autenticada poderia escutar a conversa alheia e saber quando os dois estão
trocando mensagens, que é metadado sobre gente real. O envio é limitado a um aviso a
cada 2 segundos e o indicador some sozinho em 4.

### RLS protege linhas, não colunas

A política de `public.users` é `id = auth.uid()`. Ela impede mexer no cadastro alheio —
e deixava mudar **qualquer coluna do próprio**. Medido antes da correção: `plan`, `role`,
`verified` e `reputation` cediam todos. Uma requisição do console do navegador bastava
para virar administradora e, daí, editar e banir qualquer pessoa.

Política não resolve; resolve gatilho. `campos_privilegiados` congela essas colunas para
quem é usuário comum, e **reverte em silêncio em vez de recusar** — `saveUser` manda a
linha inteira a cada salvamento de perfil, e recusar quebraria toda edição legítima.

Duas sutilezas que custaram uma iteração cada:

- **`current_user` não diz quem chamou.** Dentro de uma função `security definer` ele é o
  *dono* da função. A primeira versão do gatilho verificava `current_user` e por isso não
  congelava nada. Quem identifica o chamador é `auth.role()`, do JWT já verificado pelo
  PostgREST.
- **O gatilho bloqueou o caminho legítimo.** A reputação era gravada pelo cliente ao
  encerrar uma conversa; congelada a coluna, o delta era calculado e descartado. Agora ela
  muda dentro de `encerrar_conversa()`, que conta as mensagens reais em vez de aceitar o
  número que o navegador afirma, atrás de uma porta de sessão que o cliente não tem como
  ligar.

Esse gatilho é o que torna possíveis as três coisas seguintes: verificação escreve
`verified`, pagamento escreve `plan`, e nenhuma das duas pode ser afirmada pelo cliente.

### Verificação de perfil: revisão humana, não reconhecimento facial

Biometria é dado pessoal **sensível** na LGPD (art. 11), com base legal e exigências
próprias, e comparação facial confiável é serviço pago de terceiro. A pose sorteada
resolve o problema real — provar que existe alguém por trás do perfil — sem construir uma
base biométrica. A tela diz isso, em vez de prometer uma visão computacional que não
existe.

- **A pose é sorteada pelo servidor.** Se o cliente escolhesse, dava para garimpar entre
  fotos antigas uma que já servisse.
- **A selfie é apagada assim que há decisão**, aprovada ou recusada, pela Edge Function —
  se dependesse do navegador do revisor, fechar a aba deixaria a foto guardada. Ela sai
  *antes* do veredito: no pior caso o pedido é refeito, nunca uma selfie esquecida.
- **O bucket é mais fechado que o de fotos**: a escrita exige um pedido em aberto E que o
  arquivo se chame como o pedido; a leitura é só de administrador — nem quem enviou relê.
- **A recusa exige motivo**, que vai inteiro para a pessoa. Recusar sem dizer por quê
  deixa alguém tentando de novo do mesmo jeito.

Administrador vê a foto de qualquer perfil, porque a comparação exige. É poder real, e
desde a migração 019 está declarado onde se lê: a chamada a `private.is_admin()` dentro
da policy "foto de perfil segue o crachá". Antes vinha embutido em `nivel_permitido()`,
que não existe mais.

### Cadastro com confirmação de e-mail

Com a confirmação ligada, `signUp()` cria a conta e **não devolve sessão** — e sem sessão
o RLS recusa toda escrita, porque tanto a política de `users` quanto a do Storage comparam
com `auth.uid()`. O código gravava assim mesmo, então todo cadastro terminava com uma
conta de autenticação sem perfil nenhum. O banco tinha exatamente esse órfão.

Agora o perfil espera no aparelho (`services/signupDraft.ts`) e sobe na primeira entrada.
`pendingAccount` distingue "sessão sem perfil" de "sem sessão": não é erro, é o estado
normal entre confirmar o e-mail e completar o cadastro. Se a pessoa confirmar em outro
aparelho, o formulário reaparece com a sessão valendo — perde-se digitação, nunca a conta.

### Pagamento: o app nunca diz "paguei"

Quem afirma o pagamento é o Stripe, falando com a Edge Function `stripe-webhook`. O
webhook roda com `verify_jwt` desligado, porque o Stripe não tem sessão no app — e por
isso a primeira coisa que ele faz é conferir a **assinatura criptográfica** do evento. O
corpo é lido como texto cru: a assinatura cobre os bytes exatos, e reserializar o JSON
invalidaria a conferência. De quem é o pagamento sai do `client_reference_id`, que nós
gravamos ao criar o checkout.

Idempotência por id do evento, porque o Stripe reentrega quando não recebe 2xx rápido — e
se aplicar falha, a linha de idempotência sai junto, senão a reentrega seria descartada
como repetida sem nunca ter sido aplicada. `invoice.payment_failed` não rebaixa na hora:
derrubar o plano na primeira falha puniria quem só trocou de cartão.

Dados de cartão não passam pelo aplicativo em momento nenhum, nem no cancelamento, que
acontece no portal do próprio Stripe.

#### A falha que não dá erro em lugar nenhum

Um endpoint de webhook no Stripe pode estar criado, ativo, apontando para a URL certa e
com o segredo correto — e ainda assim **não assinar os eventos que importam**. Foi
exatamente o caso aqui: dos quatro eventos, só `invoice.payment_failed` estava marcado,
e ele é o único que o nosso código ignora de propósito. O pagamento seria cobrado, o
Stripe registraria sucesso, o app mostraria a tela de volta — e o plano continuaria
`free`, sem uma linha de erro em lugar nenhum para explicar por quê.

Nada no código detecta isso, porque do lado de cá não acontece nada: a entrega
simplesmente nunca é feita. Por isso a configuração do Stripe virou algo que se
**pergunta**, em vez de se supor. `assinar` responde a `{"acao":"diagnostico"}`, só para
administração, dizendo se o endpoint existe, se aponta para cá e quais dos quatro eventos
faltam; com `"corrigir": true` ele acrescenta os que faltam. O reparo tem duas amarras:
mexe unicamente no endpoint cuja URL é exatamente a nossa, e só acrescenta — nunca remove
um evento já assinado.

Os quatro eventos, e por que cada um:

| evento | para quê |
|---|---|
| `checkout.session.completed` | concede o premium — sem ele, nada acontece |
| `customer.subscription.updated` | renovação, e o rebaixamento quando o Stripe desiste |
| `customer.subscription.deleted` | fim da assinatura |
| `invoice.payment_failed` | registrado de propósito sem efeito, para não punir troca de cartão |

#### A versão da API do evento não é a versão do nosso código

O primeiro pagamento de verdade gravou o plano certo e a data de renovação
**nula**. A causa: o Stripe serializa cada evento na versão de API do *endpoint
do webhook*, que não é a versão que o nosso SDK usa para chamar a API. Aqui o
endpoint estava em `2026-08-26.dahlia` e o código pinado em `2025-01-27.acacia`
— e a partir da versão `basil` (2025-04-30) o `current_period_end` deixou de
viver na assinatura e passou a viver em cada item dela. O código lia o lugar
antigo, achava `undefined`, e gravava nulo.

Dos campos que lemos do evento, só esse mudou de lugar: `status`, `cancel_at`,
`metadata` e `client_reference_id` seguem onde sempre estiveram. Por isso o
premium funcionou e só a data se perdeu. `fimDoPeriodo()` passa a ler os dois
lugares, para não depender de uma configuração que ninguém lembra de conferir.

O mesmo episódio revelou um segundo problema. `aplicar_assinatura` substitui a
linha inteira, e o `checkout.session.completed` não conhece o fim do período —
manda nulo. Os dois eventos chegam quase juntos e sem ordem garantida, então
bastava o sem-data chegar por último para apagar a data do outro. Agora o nulo
significa "não sei", e preserva o valor anterior em vez de apagá-lo.

Como o diagnóstico não resolve entrega que nunca chegou, `assinar` também
responde a `{"acao":"ressincronizar"}`, de administração: toca nos metadados da
assinatura no Stripe para que ele reemita o estado atual. A verdade continua
vindo dele, pelo caminho normal — a alternativa seria corrigir o plano na mão,
no banco, sem nada que comprove o que o Stripe pensa.

### O RLS protege linhas, não colunas — na leitura

A política que deixa uma pessoa ver os perfis das outras autoriza a **linha inteira** de
`public.users` — e a linha inteira carrega e-mail, telefone, papel e coordenadas.
Confirmado contra o banco em 03/09/2026: uma usuária comum lia o e-mail de todas as contas
ativas. É a mesma dobra que já tinha mordido este projeto na escrita, agora na leitura.

A resposta é uma view de "crachá", hoje `perfis_do_mercado` (009, 010, 014): nome,
profissão, resumo, cidade, UF, foto, verificado, reputação, plano, atendimento remoto e
anos de experiência. **Sem e-mail, sem telefone, sem coordenadas, sem papel.**
Administradores só aparecem se tiverem anúncio ou proposta.

Três lições que ela custou:

- **A view saiu gravável** (010). `revoke all from public` não alcança o papel
  `authenticated`, e uma view autoatualizável com direitos do dono deixava escrever em
  `users` contornando o RLS. Agora é só `SELECT`, com `security_barrier`.
- **O app parou de abrir** (014). A 012 recriou a view sem colunas que o cliente ainda
  pedia; o PostgREST devolveu `42703` e `loadSnapshot` levantou exceção. Hoje dois testes
  leem o SQL das migrações e comparam com o que o cliente pede.
- **Roda com direitos do dono** (`security_invoker = false`), porque precisa enxergar
  `users` inteira. O que a mantém segura é o `WHERE` — `private.perfil_visivel()` — e
  nada além dele.

A antecessora, `perfis_descobriveis`, derivava idade e distância no servidor para o app
de relacionamentos. Saiu na migração 013.

### Recuperação de senha

O link do e-mail **cria uma sessão de verdade**. Sem tratar o evento
`PASSWORD_RECOVERY`, a pessoa cairia direto no app — logada, sem ter definido
senha nenhuma, e sem entender o motivo. Daí `onAuthChange` entregar o evento
junto do id.

A tela de pedido responde a mesma coisa exista a conta ou não. "E-mail não
encontrado" viraria um oráculo para descobrir quem tem conta no aplicativo. Verificado: `/auth/v1/recover` devolve 200 para endereço
inexistente, e a interface não desfaz isso.

### Por que os perfis ainda não são paginados

`loadSnapshot()` traz todos os perfis visíveis de `perfis_do_mercado` de uma vez, e é o
primeiro teto técnico do sistema. A correção parece óbvia — `range()` na consulta — e é
uma armadilha.

O motivo está em `findUser(state, id)`: **a mesma lista `state.users` resolve
conversas, conexões, denúncias e a fila de moderação.** Paginar "Quem faz" esvaziaria
todas elas ao mesmo tempo. Alguém com quem você negocia há semanas sumiria da lista de
conversas por não estar na página atual.

A implementação correta tem três partes, e nenhuma é pequena:

1. **A busca de profissionais vai para o servidor**, sob demanda e paginada, como o
   quadro de anúncios já faz em `mercado.ts`.
2. **Quem já tem vínculo é carregado à parte**, sempre: as pessoas das minhas
   conexões, das minhas denúncias e da fila. Essa lista é limitada por natureza
   e não depende de paginação.
3. **`state.users` deixa de ser "todo mundo"** e passa a ser "quem eu preciso
   resolver agora", com `findUser` capaz de buscar sob demanda o que faltar.

Fica para uma fase própria, com testes de conversa e conexão antes e depois.

### O que ainda falta para produção

Um trabalho de carga que este projeto nunca fez, e um provedor de e-mail com domínio
próprio — o serviço interno do Supabase é limitado a poucos envios por hora e, em projeto
novo, só entrega para o e-mail dono do projeto.

### Decisões de segurança do schema

Quatro pontos que não são óbvios e que já custaram uma revisão:

- **Nada com dado de alguém é legível pelo papel `anon`.** Toda policy de leitura
  de dado pessoal declara `to authenticated`: um `using (true)` entregaria a base
  inteira a quem tivesse só a chave pública — raspagem sem nem precisar de conta. A
  exceção é `categorias`, que é catálogo e não contém dado de ninguém.
- **Leitura de dado alheio passa por `private.perfil_visivel()`**, que exige
  perfil ativo, não excluído e sem bloqueio entre as duas partes.
- **Os auxiliares vivem no schema `private`.** O PostgREST só expõe `public`,
  então `is_admin`, `is_blocked_with` e `perfil_visivel` não ganham endpoint
  `/rest/v1/rpc/`. Em `public`, qualquer pessoa logada poderia sondar se um
  UUID existe ou se há bloqueio entre duas pessoas.
- **`public.users` precisa de policy de `insert`.** Sem ela o cadastro não
  conclui: o usuário autentica no Supabase Auth mas não consegue criar a
  própria linha de perfil.

As funções que ficam em `public` — como `delete_my_account` e `contato_do_negocio` —
são chamadas pelo cliente de propósito, têm `execute` revogado do `anon` e checam
`auth.uid()` internamente. O linter de segurança do Supabase as sinaliza como
`SECURITY DEFINER` acessíveis — é esperado e correto.

## O que ficou preparado e não implementado

Geolocalização por GPS, chamadas de áudio e vídeo, eventos e comunidades. Cada ponto
de extensão está comentado no código onde ele encaixa. (O aviso no celular, que estava
nesta lista, foi implementado: ver `docs/PUSH.md`.)

## Limitações conhecidas do MVP

- Autenticação é uma comparação de SHA-256 no navegador. Serve para navegar a demo;
  autenticação real é servidor, sempre.
- O botão "Simular resposta (demo)" existe para dar para ver o termômetro
  evoluindo sem uma segunda pessoa. Está rotulado como demonstração na interface.
- Fotos viram base64 no `localStorage`, o que estoura a cota se você enviar muitas.
  Em produção isso é Supabase Storage.
- A verificação por selfie continua simulada por um botão **no modo demo**, onde não há
  servidor para fazer valer nada. No modo online ela é real: pose sorteada, revisão
  humana, e o selo concedido pelo servidor.
- O quadro de anúncios e as propostas não têm modo demo: sem servidor, a tela mostra o
  aviso de Supabase não configurado.

## Histórico: o véu da foto (removido na migração 019)

As duas seções abaixo descrevem o mecanismo central do app de relacionamentos, que não
existe mais. Ficam como registro porque as lições valem para qualquer controle de acesso.
As duas funções do véu — `nivel_permitido` e `nivel_do_arquivo` — foram removidas na
019, e desde o #33 o envio não chama mais a `velar`: grava só o original.

#### O véu é gerado no servidor

A pirâmide de resoluções (12, 24, 48, 96 px e o original) era gerada no **navegador de
quem sobe a foto**. O portão de leitura sempre foi do banco — ninguém nunca conseguiu
ver a foto alheia antes da hora —, mas quem subia escolhia o conteúdo dos próprios
níveis borrados e podia mandar um "nível 0" nítido, revelando-se cedo demais para todo
mundo.

Agora o navegador entrega **só o original**, e a Edge Function `velar` gera os quatro
níveis com `service_role`. A política de escrita do Storage foi ajustada junto: o
cliente só consegue gravar `-orig.jpg`. Sem essa segunda metade a primeira não valeria
nada — bastaria subir o arquivo velado direto.

Falha fechada por construção: se a geração falhar, os níveis velados não existem, quem
não tem direito ao original recebe 404 e cai no retrato generativo. Nenhum caminho de
erro revela mais do que devia. O cliente ainda apaga o original órfão e avisa, porque
foto invisível é pior do que foto ausente.

#### Um bug que só apareceu quando o véu foi testado de ponta a ponta

`private.nivel_do_arquivo()` tinha `revoke execute ... from public, anon` e **nenhum
`grant` para `authenticated`**. A policy de leitura avalia
`nivel_do_arquivo(name) <= nivel_permitido(dono)`, e o operando da esquerda vem
primeiro: toda leitura de foto morria em *permission denied*, inclusive a da própria
pessoa.

O erro nunca chegou à tela. `resolveImage()` desce de nível quando a assinatura falha e,
ao esgotar os níveis, cai no retrato generativo — então o véu *parecia* funcionar e
nenhuma foto real jamais era exibida. Vale como lembrete: num sistema que degrada
graciosamente, a degradação esconde a falha. O teste que pegou isso foi o de ponta a
ponta, não o unitário.
