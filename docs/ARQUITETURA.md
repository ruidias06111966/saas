# CONEXÃO — arquitetura e decisões

## Princípio que organiza tudo

**Regra de negócio não mora em componente React.** Compatibilidade, termômetro de
conversa, curadoria e moderação são funções puras em `services/`, sem React e sem I/O.
Isso significa que dá para testá-las, portá-las para o servidor (há uma versão SQL da
compatibilidade em `docs/SUPABASE.sql`) e trocar toda a camada visual sem tocar nelas.

```
types.ts            Modelo de domínio. Espelha 1:1 as tabelas do Postgres.
constants.ts        Eixos da Bússola, rótulos, cotas por plano, estágios do véu.

services/
  compatibility.ts  Índice explicável (7 dimensões) + filtros duros de elegibilidade
  conversation.ts   Termômetro (4 métricas) + véu + reputação
  curation.ts       Curadoria diária determinística
  moderation.ts     Heurística local de risco (camada 1)
  geminiService.ts  Copiloto (camada 2 de moderação + sugestões), com fallback local
  lgpd.ts           Exportação, anonimização, retenção
  storage.ts        Persistência — A ÚNICA camada que muda ao plugar backend real
  utils.ts          Hash determinístico, PRNG semeado, haversine, formatação

state/
  appState.ts       Reducer puro + seletores
  AppContext.tsx    Provider, roteamento, ações de domínio, toasts

data/               Interesses, perguntas, 12 perfis fictícios, atividade semeada
components/         UI genérica + componentes de produto (Portrait, EssenceCard, …)
screens/            15 telas
```

## Os três mecanismos

### 1. Revelação Progressiva

**O Véu é controle de acesso, não efeito visual.** Cada foto de perfil é guardada como
uma pirâmide de resoluções — 12, 24, 48, 96 px e a original — e o banco decide qual
nível você pode baixar, a partir do estágio real da conversa entre vocês
(`private.nivel_permitido`, aplicada como policy no `storage.objects`).

Resolução em vez de desfoque foi escolha deliberada: um arquivo de 12 px **não tem
detalhe a recuperar**, enquanto um JPEG desfocado ainda carrega mais informação do que
parece. `Portrait` continua aplicando `blur((1 - reveal) * 26)px`, mas agora isso é só
suavização por cima de uma imagem que já não contém o rosto.

Consequência importante: **o termômetro precisou existir no banco**. `private.termometro`
espelha `services/conversation.ts` — as duas foram comparadas com a mesma conversa
sintética e devolveram `score 58, estágio 2`. O cliente continua calculando o número para
*exibir* (ele tem todas as mensagens, então o cálculo é fiel, não um palpite), mas quem
guarda o portão é o banco. Ao mexer numa fórmula, mexa na outra.

No modo demo não há servidor para fazer valer nada, e o véu volta a ser cosmético — a
tela de privacidade diz isso com todas as letras em vez de fingir proteção.

Sem foto, `GenerativePortrait` desenha um SVG determinístico a partir de `hash32(id)`:
gradiente de dois matizes, três blobs e uma silhueta. Mesma pessoa, sempre a mesma arte.
Isso resolve dois problemas ao mesmo tempo — não usar foto de pessoa real em dados
fictícios, e manter a descoberta legível mesmo com perfis sem foto.

**Revelação consensual:** `connection.revealConsent` é um mapa `{ userId: boolean }`. Só
vale quando os dois lados estão marcados. Um lado sozinho vê "aguardando o aceite".
Nunca há revelação unilateral.

### 2. Curadoria Diária

`seededRandom(userId + data)` (xorshift sobre FNV-1a) garante que a lista do dia é a
mesma o dia inteiro, sem precisar guardar nada. Pegamos o topo do ranking (3× o limite),
embaralhamos com a semente e cortamos — assim a ordem não engessa nos mesmos perfis, mas
também não muda a cada recarga.

Perfis já vistos são excluídos por qualquer conexão existente (inclusive `recusada`).

### 3. Termômetro de Conversa

Quatro métricas normalizadas e dois fatores de amortecimento. Os fatores são o que impede
a métrica de ser enganada: sem eles, seis mensagens curtas em uma hora dariam nota alta.

```
score = (0,28·recip + 0,28·prof + 0,22·const + 0,22·abert)
        × log2(1+n)/log2(41)          ← substância
        × (0,65 + 0,35·min(1, dias/5)) ← duração
```

A reputação de conversa (`user.reputation`, 0–100) é ajustada no encerramento:
+3 ao se despedir de uma conversa com 6+ mensagens, −4 ao desfazer em silêncio. É o
incentivo econômico contra o ghosting.

## Compatibilidade: por que explicável

Um número sozinho é uma caixa-preta que a pessoa não pode contestar. Toda dimensão
devolve `{ score, weight, detail }` e o produto sempre mostra a decomposição junto do
total. Três consequências deliberadas:

1. O **grau de confiança** cai quando os perfis estão incompletos, e o app diz isso.
2. O **ponto de atrito** (dimensão de menor score) aparece mesmo quando o total é alto.
3. O texto "isto é uma sugestão de conversa, não uma previsão de relacionamento" é fixo.

A similaridade de personalidade é **tolerante**: cada eixo tem um `similarityWeight`.
Ritmo de vida e expressão afetiva pesam 1,0 (diferença aí desgasta); energia social 0,65
e planejamento 0,6 (complementaridade funciona). Não é "quanto mais parecido, melhor".

Interesses usam Jaccard **ponderado por raridade**, suavizado por raiz quadrada. Bater em
"astronomia" (peso 1,5) vale mais que bater em "séries" (peso 0,8), e quem marca 20
interesses não é punido pelo denominador.

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

O app tem **dois modos**, decididos por variável de ambiente, e nenhuma das 15 telas
sabe em qual está rodando.

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
visíveis, apenas as conexões e mensagens em que a pessoa participa, e a fila de
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

### O que ainda falta para produção

1. **Os níveis velados são gerados no navegador.** Quem sobe a foto pode, em tese,
   mandar um "nível 0" mais nítido do que devia — mas é a foto dele mesmo, e o único
   efeito é se revelar mais cedo. O que ninguém consegue é ver a foto de OUTRA pessoa
   antes da hora, que é o que importa. Gerar a pirâmide numa Edge Function fecharia
   também esse buraco.
2. **Cota de IA no servidor.** O limite diário de chamadas é conferido no cliente, em
   `daily_usage`. A Edge Function tem o JWT em mãos e poderia checar e incrementar a
   cota ela mesma — hoje não faz. Quem quiser abusar consegue, dentro do limite de
   quem tem conta.
3. **"Digitando…" de verdade.** O indicador existe na interface mas só é acionado pela
   simulação do modo demo. Fazer valer exige Broadcast ou Presence do Realtime, que é
   um canal diferente do `postgres_changes` usado aqui.
4. **Paginação.** `loadSnapshot` traz tudo de uma vez. Funciona na escala de um MVP e
   quebra na de milhares de perfis.

### Decisões de segurança do schema

Quatro pontos que não são óbvios e que já custaram uma revisão:

- **Nada é legível pelo papel `anon`.** Toda policy de leitura declara
  `to authenticated`. Um `using (true)` em `profiles` ou `prompt_answers`
  entregaria a base inteira de respostas a quem tivesse só a chave pública —
  raspagem sem nem precisar de conta. As únicas exceções são `interests` e
  `prompts`, que são catálogos e não contêm dado de ninguém.
- **Leitura de dado alheio passa por `private.perfil_visivel()`**, que exige
  perfil ativo, não excluído e sem bloqueio entre as duas partes.
- **Os auxiliares vivem no schema `private`.** O PostgREST só expõe `public`,
  então `is_admin`, `is_blocked_with` e `perfil_visivel` não ganham endpoint
  `/rest/v1/rpc/`. Em `public`, qualquer pessoa logada poderia sondar se um
  UUID existe ou se há bloqueio entre duas pessoas.
- **`public.users` precisa de policy de `insert`.** Sem ela o cadastro não
  conclui: o usuário autentica no Supabase Auth mas não consegue criar a
  própria linha de perfil.

As duas funções que ficam em `public` (`compatibility_score` e
`delete_my_account`) são chamadas pelo cliente de propósito, têm `execute`
revogado do `anon` e checam `auth.uid()` internamente. O linter de segurança do
Supabase as sinaliza como `SECURITY DEFINER` acessíveis — é esperado e correto.

## O que ficou preparado e não implementado

Pagamento real (a estrutura de `subscriptions` e as cotas por plano já existem),
notificações push, geolocalização por GPS, chamadas de áudio e vídeo, eventos e
comunidades. Cada ponto de extensão está comentado no código onde ele encaixa.

## Limitações conhecidas do MVP

- Autenticação é uma comparação de SHA-256 no navegador. Serve para navegar a demo;
  autenticação real é servidor, sempre.
- O botão "Simular resposta (demo)" existe para dar para ver o termômetro e o véu
  evoluindo sem uma segunda pessoa. Está rotulado como demonstração na interface.
- Fotos viram base64 no `localStorage`, o que estoura a cota se você enviar muitas.
  Em produção isso é Supabase Storage.
- A verificação por selfie é simulada por um botão. O estado `verified` e o selo são
  reais e já circulam pelo produto inteiro.
