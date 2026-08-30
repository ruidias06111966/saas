# CONEXÃO — prompt em 9 etapas encadeadas

Use este arquivo quando a ferramenta truncar o `PROMPT-MESTRE.md`, ou quando você quiser
ver o app crescendo por partes e corrigir o rumo no meio do caminho. Envie um bloco por
vez, na ordem, e só siga para o próximo depois de ver o anterior funcionando.

Cada bloco começa com uma linha de contexto para o caso de a ferramenta perder o fio.

---

## Etapa 1 — Fundação e identidade

```
Crie um app web React 19 + TypeScript + Vite + Tailwind chamado CONEXÃO, um aplicativo
de relacionamentos em que a conversa vem antes da aparência. Mobile-first.

Nesta primeira etapa, entregue só a fundação:

1. Estrutura de pastas: types.ts, constants.ts, services/, state/, components/ui/,
   components/layout/, screens/, data/.
2. Identidade visual em variáveis CSS, com modo claro e escuro:
   areia #FAF6F1 (fundo), tinta #1F1A2E (texto), ameixa #6E4C9B (primária),
   brasa #CA6A43 (acento), sálvia #5A8667 (positivo).
   Tipografia: Fraunces (serifa) para títulos e números, Inter para o resto.
   Cantos de 20 a 36 px, muito espaço em branco, sombras suaves.
   Proibido: rosa-choque, vermelho saturado, estética de "match".
3. Componentes de UI: Button, IconButton, Card, Chip, Field, Input, Textarea, Select,
   Slider, Toggle, Checkbox, Modal, Tabs, Bar, Ring, Banner, Empty, Toast.
4. Um componente Icon com SVG inline (sem biblioteca de ícones).
5. Uma landing page com: herói "Encontre alguém que combine com você", subtítulo
   "Conexões baseadas em interesses, personalidade e boas conversas", os 4 passos de
   "Como funciona", os 3 diferenciais e um bloco de segurança.

Ainda não crie telas de app nem lógica. TypeScript strict, sem any.
```

## Etapa 2 — Modelo de domínio e dados fictícios

```
Continuando o CONEXÃO. Agora o modelo de domínio.

1. types.ts com: User (id, nome, e-mail, nascimento, gênero, cidade, coordenada
   APROXIMADA arredondada a 0,05°, foto, profissão, bio, interesses, personality com 5
   eixos 0-100, lifestyle, chatPace, goal, answers, preferences, verified, reputation,
   plan, role, status, consents), Connection, Message, Report, ModerationItem,
   AppNotification, Subscription, Block, DailyUsage, Route.
2. Catálogo de ~48 interesses com id, rótulo, emoji, categoria e um PESO de raridade
   entre 0,8 e 1,5 (astronomia e filosofia pesam mais que séries e cinema).
3. 14 perguntas de perfil ("Meu encontro ideal seria...", "Você me ganha se...") e uma
   Escada de Intimidade com ~30 perguntas em 4 níveis.
4. 12 perfis fictícios brasileiros completos, com respostas escritas com voz própria e
   específica — nada de "gosto de viajar e de rir". Mais uma conta de usuário e uma de
   administrador. Nenhuma foto de pessoa real.
```

## Etapa 3 — Índice de Compatibilidade explicável

```
Continuando o CONEXÃO. Crie services/compatibility.ts como funções PURAS, sem React.

computeCompatibility(a, b) devolve { score 0-100, dimensions[], sharedInterests[],
confidence, headline, reasons[], distanceKm }. Cada dimensão traz score 0-1, peso e uma
FRASE de explicação.

Dimensões e pesos: objetivo 22% (matriz simétrica), jeito de ser 20% (5 eixos com
similaridade tolerante — ritmo de vida e afeto pesam 1,0; energia social 0,65;
planejamento 0,6), interesses 18% (Jaccard ponderado por raridade, suavizado com
sqrt * 1,35), estilo de vida 14% (matriz por campo, "filhos" com peso 1,6), ritmo de
conversa 10%, faixa etária 8% (mútua), distância 8%.

Confiança pela completude média dos dois perfis: >=78 alta, >=50 média, senão baixa.
Sempre destaque a dimensão de MENOR score como "ponto de atenção".

Crie também isEligible(me, other, bloqueados) com os filtros duros: gênero nos dois
sentidos, faixa etária nos dois sentidos, distância, bloqueios, status e 18+.

E profileCompletion(user) devolvendo 0-100.
```

## Etapa 4 — Curadoria Diária e o Cartão de Essência

```
Continuando o CONEXÃO. Agora o diferencial nº 2.

1. services/curation.ts: seleção determinística por semente hash(userId + data). Mesma
   semente = mesma lista o dia inteiro. 1 Encontro do Dia em destaque + 5 perfis no plano
   gratuito, 20 no Premium. O Encontro do Dia expira em 24 h.
2. Componente Portrait: retrato com VÉU. Recebe reveal 0-1 e aplica
   blur = (1 - reveal) * 26 px. Sem foto enviada, gera um retrato abstrato SVG
   determinístico a partir do id (mesma pessoa, sempre a mesma arte).
3. Componente EssenceCard: o retrato entra PEQUENO e MUITO desfocado; o centro do cartão
   é uma resposta escrita da pessoa, em serifa, entre aspas. Ao redor: nome, idade,
   cidade, faixa de distância, objetivo, índice de compatibilidade e interesses em comum.
4. Tela Descobrir com esses cartões, os filtros (idade, distância, cidade, objetivo) e o
   limite diário de 6 "Tenho interesse" no plano gratuito, com a explicação do porquê.

Proibido: swipe, feed infinito, foto grande e nítida de desconhecido.
```

## Etapa 5 — Termômetro de Conversa

```
Continuando o CONEXÃO. Agora o diferencial nº 3, em services/conversation.ts (funções puras).

conversationHealth(connection, messages) devolve score 0-100 e as quatro métricas:
- Reciprocidade 28%: 1 - |msgsA - msgsB| / total, exigindo pelo menos 4 mensagens.
- Profundidade 28%: média de palavras (normalizada em 22) * 0,65 + proporção de
  mensagens com pergunta (normalizada em 0,3) * 0,35.
- Constância 22%: mediana do intervalo entre turnos alternados; <=6h vale 1, >=72h vale
  0,1, linear no meio.
- Abertura 22%: rituais respondidos (normalizado em 6) * 0,6 + maior nível atingido
  (de 4) * 0,4.

Multiplique por um fator de substância log2(1+total)/log2(41) e por um fator de duração
0,65 + 0,35 * min(1, dias/5).

Derive: reveal = min(1, score/82) e 5 estágios nomeados — Silhueta 0-19, Contornos 20-39,
Traços 40-61, Quase lá 62-81, Revelado 82-100. E uma frase de "próximo passo".

Marque a conversa como parada (stale) após 5 dias sem resposta de um lado.

Crie os componentes ConversationThermometer (as 4 barras, o número e o próximo passo) e
VeilProgress (os 5 estágios e o botão "Propor revelar as fotos agora", que só tem efeito
se as DUAS pessoas marcarem).
```

## Etapa 6 — Conexões, chat e Rituais

```
Continuando o CONEXÃO. Agora as telas de relacionamento.

1. Estado global com useReducer + Context, persistido em localStorage, isolado em
   services/storage.ts.
2. Tela Conexões com abas: Novas, Conversando, Solicitações, Favoritos, Encerradas.
   Interesse dos dois lados vira conexão.
3. Tela Conversas (lista) mostrando o estágio do véu de cada pessoa e as não lidas.
4. Tela Chat: mensagens agrupadas por dia, indicadores de enviada e lida, "digitando...",
   envio de imagem, e painel lateral com Véu + Termômetro + Copiloto. Tela cheia no
   celular (sem menu inferior).
5. Rituais de Conversa: botão que envia uma pergunta da Escada de Intimidade no nível
   liberado pelo volume da conversa. Rituais aumentam a métrica de "abertura".
6. Anti-ghosting: quando a conversa fica parada, ofereça "Encerrar com gentileza" com 3
   despedidas educadas e editáveis. Quem se despede ganha +3 de reputação de conversa;
   quem desfaz em silêncio perde -4.
```

## Etapa 7 — Copiloto Gemini

```
Continuando o CONEXÃO. Agora a IA, em services/geminiService.ts.

Use @google/genai, modelo gemini-2.5-flash, chave em process.env.API_KEY,
responseMimeType 'application/json' e responseSchema para saída estruturada.

Funções: suggestOpeners (3 aberturas), suggestNextQuestion (no nível certo da escada),
explainMatch (2 frases), suggestProfileImprovements (3 dicas), summarizeAffinities,
readThermometer, moderateWithAI, suggestGentleGoodbye.

No systemInstruction, escreva estas regras:
- A IA nunca envia mensagem sozinha: ela preenche o campo, a pessoa edita e envia.
- A IA nunca se passa pelo usuário nem inventa fatos sobre ele.
- Nunca sugerir pedir telefone, endereço, redes sociais ou dinheiro.
- Nada de conteúdo sexual nem elogio à aparência física.
- Nenhum dado sensível entra no prompt: só o que já é público no perfil.

REQUISITO CRÍTICO: toda função precisa de um fallback determinístico local. Sem API_KEY o
app funciona 100%, com sugestões vindas do banco curado de perguntas, e exibe um aviso
discreto de "modo local" — nunca uma tela de erro.

Crie um componente CopilotPanel que mostra as sugestões como rascunhos clicáveis, com o
texto "O Copiloto nunca envia mensagem por você e nunca finge ser você".
```

## Etapa 8 — Segurança, moderação e LGPD

```
Continuando o CONEXÃO. Agora a camada que não pode faltar.

1. services/moderation.ts: heurística local em regex, rodando ANTES do envio, cobrindo
   pedido financeiro (Pix, transferência, cripto, código de verificação), contato externo
   precoce, conteúdo sexual não solicitado, discurso de ódio, assédio, spam com link e
   suspeita de menor de idade. Cada regra devolve nível (ok/atenção/risco), categorias e
   um conselho em texto.
2. Mensagem de risco abre um diálogo de confirmação consciente explicando o perigo antes
   de deixar enviar, e vai para a fila de revisão humana.
3. Denunciar (8 motivos, com opção de bloquear junto) e bloquear em toda tela de perfil e
   de conversa.
4. Tela de Configurações e Privacidade com os direitos da LGPD FUNCIONANDO:
   exportar todos os meus dados em JSON, corrigir dados, excluir a conta com anonimização
   do que precisa sobreviver (denúncias feitas contra a pessoa), e consentimentos
   versionados com data visível.
5. Localização: apenas cidade + coordenada arredondada a 0,05°. Exiba só faixas
   ("até 30 km"). E-mail nunca aparece em perfil público.
6. Painel administrativo: visão geral, usuários (buscar, suspender, banir, reativar),
   denúncias (analisar, procedente com suspensão, improcedente), fila de moderação
   (liberar como falso positivo, remover e suspender autor).
   Nenhuma suspensão é automática — escreva isso na interface.
   Métrica de topo: taxa de conexões que viraram conversa, não tempo de tela.
```

## Etapa 9 — Premium, polimento e schema do banco

```
Continuando o CONEXÃO. Fechamento.

1. Cotas por plano em uma única constante: gratuito 6 interesses/dia, 5 perfis na
   curadoria, 8 chamadas de IA; premium 40, 20 e 100, mais filtros avançados e ver quem
   demonstrou interesse.
2. Tela Premium com comparativo honesto. Segurança, verificação, moderação e direitos de
   LGPD JAMAIS entram na lista do plano pago. Sem cobrança real: deixe o ponto de
   integração comentado.
3. Tela Início (dashboard): saudação, anel de completude, três indicadores, alerta de
   solicitações pendentes, alerta de conversas paradas, Encontro do Dia, sugestões do
   Copiloto e dica de segurança rotativa.
4. Central de notificações.
5. Acessibilidade: contraste AA, aria-label em todo ícone interativo, foco visível,
   respeito a prefers-reduced-motion.
6. Gere docs/SUPABASE.sql com o schema PostgreSQL equivalente e RLS: ninguém lê mensagem
   de conversa alheia, fila de moderação só para admin, 18+ como constraint no banco,
   e uma função delete_my_account() que anonimiza.
7. Verifique os critérios de aceitação: tsc limpo, funciona sem API_KEY, o fluxo completo
   de cadastro até "encerrar com gentileza" roda sem tela morta, "me manda um pix de 200
   reais" abre o diálogo de moderação, exportar dados baixa JSON de verdade, e nenhuma
   tela mostra percentual de compatibilidade sem a decomposição ao lado.
```
