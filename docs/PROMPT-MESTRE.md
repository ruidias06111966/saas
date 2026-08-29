# PROMPT-MESTRE — CONEXÃO
### Versão melhorada, pronta para colar no Google AI Studio (Build) ou no Lovable

> Como usar: cole **tudo** o que está entre as linhas `>>>` e `<<<` como primeira
> mensagem. Se a ferramenta truncar, use `PROMPT-ETAPAS.md`, que quebra este mesmo
> conteúdo em 9 blocos encadeados.

---

>>> COMEÇA O PROMPT

# CONEXÃO — aplicativo de relacionamentos em que a conversa vem antes da aparência

Construa um aplicativo web responsivo, mobile-first, em **React + TypeScript**, chamado
**CONEXÃO**. Não é um clone de Tinder com outra paleta. É um produto com uma tese
própria, e o seu trabalho é implementar essa tese sem diluí-la.

## 0. A tese, e a anti-tese

**Tese:** *"Antes de escolher alguém, conheça alguém."* O gargalo dos aplicativos de
relacionamento não é a falta de perfis — é a quantidade de conexões que morrem sem
nunca virar conversa. O CONEXÃO otimiza para **conversas que acontecem de verdade**,
não para tempo de tela.

**Anti-tese — o que este app NÃO deve ter, em nenhuma hipótese:**

- Nada de deslizar cartões para os lados (swipe) como mecânica principal.
- Nada de feed infinito de perfis.
- Nada de foto grande e nítida como primeiro elemento de um perfil desconhecido.
- Nada de gradiente rosa-vermelho, coração pulsante ou estética de "match".
- Nada de IA escrevendo mensagens no lugar da pessoa e enviando sozinha.
- Nada de contagem de curtidas, ranking de popularidade ou "quem te viu" como isca.

Se alguma decisão de implementação empurrar o produto para um desses itens, escolha
a outra saída.

## 1. Os três mecanismos que definem o produto

Estes três são o produto. Implemente-os **completos e integrados**, não como enfeite.

### 1.1 Revelação Progressiva (o Véu)

A foto de uma pessoa desconhecida **nunca** aparece nítida.

- Na descoberta, todo perfil aparece como **Cartão de Essência**: um retrato fortemente
  desfocado e pequeno, e no centro do cartão o que a pessoa **escreveu** — uma resposta
  de perfil destacada, objetivo de relacionamento, interesses em comum e o índice de
  compatibilidade.
- Dentro de uma conversa, o desfoque diminui conforme o **Índice de Conversa** (item 1.3)
  sobe. Fórmula exata: `blur_px = (1 - reveal) * 26`, onde `reveal = min(1, indice / 82)`.
- Cinco estágios visíveis, com nome: **Silhueta** (0–19), **Contornos** (20–39),
  **Traços** (40–61), **Quase lá** (62–81), **Revelado** (82–100). Mostre sempre o
  estágio atual e a porcentagem — a pessoa precisa entender a regra.
- **Atalho consensual:** existe o botão "Propor revelar as fotos agora". Ele só produz
  efeito se **as duas pessoas** marcarem. Um lado sozinho vê "aguardando o aceite da
  outra pessoa". Consentimento mútuo, nunca unilateral.
- Sem foto enviada, gere um **retrato abstrato determinístico** por SVG a partir do id
  do usuário (mesma pessoa, sempre a mesma arte). Nunca use foto de banco de imagens
  representando pessoas reais.

### 1.2 Curadoria Diária (o Encontro do Dia)

Acabe com a rolagem infinita.

- Uma vez por dia, o app monta uma seleção determinística por semente `hash(userId + data)`:
  **1 Encontro do Dia em destaque** + **5 perfis** (plano gratuito) ou **20** (Premium).
  Mesma semente = mesma lista o dia inteiro, mesmo recarregando a página.
- O Encontro do Dia **expira em 24 horas**. Sem ação, some.
- O plano gratuito tem **6 "Tenho interesse" por dia**. Quando acabam, mostre uma
  mensagem que explica o porquê ("o limite existe de propósito: aqui a ideia é conversar,
  não colecionar"), não uma tela de venda agressiva.
- Todo cartão explica **por que** aquela pessoa está ali, com frases derivadas do
  algoritmo — nunca só um número solto.

### 1.3 Termômetro de Conversa e anti-ghosting

Meça a qualidade da troca, e mostre a medição abertamente.

Quatro métricas, todas 0–100, calculadas sobre as mensagens da conexão:

| Métrica | Como calcular | Peso |
|---|---|---|
| Reciprocidade | `1 - |msgsA - msgsB| / total` (mínimo de 4 mensagens para valer) | 28% |
| Profundidade | média de palavras por mensagem (normalizada em 22) 65% + proporção de mensagens com pergunta (normalizada em 0,3) 35% | 28% |
| Constância | mediana do intervalo entre turnos alternados: ≤6 h = 1, ≥72 h = 0,1, linear no meio | 22% |
| Abertura | rituais respondidos (normalizado em 6) 60% + maior nível de ritual atingido (de 4) 40% | 22% |

Multiplique o resultado por um **fator de substância** `log2(1+total) / log2(41)` e por
um **fator de duração** `0,65 + 0,35 * min(1, dias/5)`. Isso impede que uma conversa de
seis mensagens em uma hora atinja nota alta.

- Exiba as quatro barras, o número e uma frase de **próximo passo** ("Dê espaço para o
  outro falar", "Faça uma pergunta aberta", "Aceite um Ritual para subir um degrau").
- **Rituais de Conversa:** uma Escada de Intimidade com 4 níveis, ~30 perguntas curadas.
  Nível 1 leve e concreto; 2 histórias e preferências; 3 valores e como a pessoa se
  relaciona; 4 vulnerabilidade, com cuidado. O nível liberado depende do volume da
  conversa e de quantos rituais já foram usados. Nada invasivo: nenhuma pergunta sobre
  renda, endereço, histórico sexual ou dado sensível.
- **Anti-ghosting:** depois de 5 dias sem resposta de um lado, ofereça
  **"Encerrar com gentileza"** — 3 mensagens de despedida educadas, editáveis, que a
  pessoa escolhe e envia. Quem se despede **ganha** reputação de conversa (+3); quem
  simplesmente desfaz a conexão em silêncio **perde** (-4). Exponha esse número no perfil
  como "reputação de conversa".

## 2. Índice de Compatibilidade — explicável por construção

Nunca mostre só o percentual. Toda tela que exibe compatibilidade exibe também a
**decomposição** e o **grau de confiança**.

Sete dimensões, cada uma devolvendo score 0–1 **e uma frase de explicação**:

| Dimensão | Peso | Regra |
|---|---|---|
| Objetivo de relacionamento | 22% | matriz simétrica: sério×sério 1,0; sério×conhecer 0,55; sério×amizade 0,20; conhecer×descobrindo 0,80; etc. |
| Jeito de ser | 20% | 5 eixos 0–100 ("Bússola de Conexão"). Similaridade **tolerante**: `1 - (diff/100) * pesoDoEixo`. Ritmo de vida e expressão afetiva pesam 1,0 (semelhança importa); energia social 0,65 e planejamento 0,6 (complementaridade é aceitável). |
| Interesses | 18% | Jaccard **ponderado por raridade** (cada interesse tem peso 0,8–1,5), suavizado: `min(1, sqrt(jaccard) * 1,35)`. Bater em "astronomia" vale mais que bater em "séries". |
| Estilo de vida | 14% | matriz por campo (bebida, fumo, exercício, filhos, animais, espiritualidade). "Filhos" pesa 1,6 — é o item que mais desfaz relacionamento sério. |
| Ritmo de conversa | 10% | matriz entre "poucas e profundas", "equilibrado", "muitas e rápidas". |
| Faixa etária | 8% | satisfação **mútua** das preferências dos dois, com decaimento fora da faixa. |
| Distância | 8% | 1,0 até 10 km, decaindo linearmente até o limite configurado. |

- **Confiança** = média da completude dos dois perfis: ≥78% alta, ≥50% média, senão baixa.
  Com confiança baixa, o app diz na cara: *"Perfis ainda incompletos. Trate este número
  como um palpite fraco."*
- Sempre inclua o **ponto de atrito**: a dimensão de menor score aparece como "ponto de
  atenção", mesmo quando o índice geral é alto.
- Texto obrigatório em toda tela de compatibilidade: *"Este índice é uma sugestão de
  conversa, não uma previsão de relacionamento."*

**Filtros duros** (aplicados antes do ranking, quem não passa nem entra no funil):
gênero procurado nos dois sentidos, faixa etária nos dois sentidos, distância máxima,
bloqueios, status da conta, e 18 anos completos.

## 3. Copiloto de IA (Gemini) — sugere, nunca escreve por você

Use `@google/genai` com o modelo `gemini-2.5-flash`, chave em `process.env.API_KEY`.
Use `responseMimeType: 'application/json'` + `responseSchema` para saída estruturada.

Funções: sugerir 3 aberturas personalizadas; sugerir a próxima pergunta no nível certo
da escada; explicar em 2 frases por que faz sentido conversar; sugerir melhorias de
perfil; resumir afinidades; ler o termômetro; classificar risco em moderação; sugerir
despedidas gentis.

**Regras invioláveis, escritas no `systemInstruction`:**

1. A IA **nunca** envia mensagem sozinha. Ela preenche o campo; a pessoa edita e envia.
2. A IA **nunca** se passa pelo usuário nem inventa fatos sobre ele.
3. A IA **nunca** sugere pedir telefone, endereço, redes sociais ou dinheiro.
4. Nada de conteúdo sexual, elogio à aparência física ou pressão por encontro.
5. Nenhum dado sensível (e-mail, senha, coordenada) entra no prompt — só o que já é
   público no perfil.

**Requisito de robustez:** toda função de IA precisa de um **fallback determinístico
local**. Sem `API_KEY`, o app funciona 100%, com sugestões vindas de um banco curado de
perguntas. Mostre um aviso discreto de "modo local", nunca uma tela de erro.

## 4. Segurança e LGPD — desde o MVP, nunca atrás do paywall

- **Moderação em duas camadas.** Camada 1: heurística local em regex, roda **antes** do
  envio, sem rede e sem custo, cobrindo: pedido financeiro (Pix, transferência, cripto,
  código de verificação), contato externo precoce, conteúdo sexual não solicitado,
  discurso de ódio, assédio/ameaça, spam com link, suspeita de menor de idade. Camada 2:
  Gemini classifica o que a camada 1 marcou.
- Mensagem de **risco** abre um diálogo de confirmação consciente explicando o perigo
  antes de deixar enviar, e vai para a fila de revisão.
- **Nenhuma suspensão automática.** IA só sinaliza; quem decide é um humano no painel
  administrativo. Escreva isso na interface.
- Verificação de perfil por selfie-desafio (pose aleatória comparada com a foto), com
  selo visível. No MVP pode ser simulada, mas o estado `verified` e o selo existem.
- **Localização:** guarde apenas cidade + coordenada arredondada a ~0,05° (≈5 km). Exiba
  apenas faixas ("até 30 km"), nunca distância exata nem endereço.
- **LGPD (Lei 13.709/2018) funcionando de verdade:** exportar todos os meus dados em JSON
  (art. 18 II e V), corrigir dados (III), excluir a conta com anonimização do que precisa
  sobreviver por legítimo interesse — denúncias feitas contra a pessoa (VI), e
  consentimentos versionados com data (art. 8º §1º). Cada um desses é um botão que
  funciona, não um texto.
- E-mail e telefone **nunca** aparecem em perfil público.
- Bloquear e denunciar em um toque, com 8 motivos, em toda tela de perfil e de conversa.

## 5. Telas

1. **Landing** — herói com a tese, "Como funciona" em 4 passos, os 3 diferenciais, bloco
   de segurança, citação de fechamento.
2. **Cadastro em 7 etapas** com barra de progresso: conta (18+ validado) → identidade e
   preferências → objetivo e ritmo → interesses (mínimo 5) → Bússola de Conexão + estilo
   de vida → bio e respostas (mínimo 3) → foto, verificação e os três aceites.
3. **Login** com contas de demonstração de um clique.
4. **Início** — saudação, anel de completude do perfil, três indicadores, alertas de
   solicitações pendentes e de conversas paradas, Encontro do Dia, sugestões do Copiloto
   para o perfil, últimas conversas, dica de segurança rotativa.
5. **Descobrir** — Cartões de Essência + filtros (idade, distância, cidade, objetivo;
   compatibilidade mínima e interesses obrigatórios travados no Premium).
6. **Perfil de outra pessoa** — retrato velado com estágio, decomposição completa da
   compatibilidade, respostas, interesses (destacando os em comum), Bússola comparada com
   a sua sobreposta, aberturas sugeridas, denunciar e bloquear.
7. **Conexões** — abas: Novas, Conversando, Solicitações, Favoritos, Encerradas.
8. **Conversas** — lista com estágio do véu e não lidas.
9. **Chat** — mensagens agrupadas por dia, enviada/lida, "digitando…", envio de imagem,
   Rituais, painel lateral com Véu + Termômetro + Copiloto, encerrar com gentileza,
   denunciar, bloquear, desfazer conexão. Tela cheia no celular.
10. **Meu perfil** e **edição**, com prévia de como o Cartão de Essência aparece para os outros.
11. **Premium** — comparativo honesto. Segurança, verificação, moderação e direitos de
    LGPD **jamais** entram na lista do plano pago.
12. **Configurações e privacidade** — aparência, o que é visível, direitos LGPD,
    bloqueios, transparência sobre a IA.
13. **Notificações**.
14. **Painel administrativo** — visão geral, usuários (buscar, suspender, banir, reativar),
    denúncias (analisar, procedente, improcedente), fila de moderação (liberar, remover).
    Métrica de topo: **taxa de conexões que viraram conversa**, não tempo de tela.

Navegação: menu inferior no celular (Início, Descobrir, Conversas, Conexões, Perfil) e
sidebar no desktop.

## 6. Identidade visual — própria, não genérica

- **Paleta:** areia `#FAF6F1` (fundo), tinta `#1F1A2E` (texto), ameixa `#6E4C9B`
  (primária), brasa `#CA6A43` (acento), sálvia `#5A8667` (positivo). Modo escuro por
  troca de variáveis CSS. Nada de rosa-choque nem de vermelho saturado.
- **Tipografia:** serifa de display (Fraunces) para títulos e números; Inter para o resto.
  A serifa é o que separa este produto visualmente da categoria inteira.
- Cantos generosos (20–36 px), muito espaço em branco, sombras suaves, animação de
  entrada discreta, textura de grão sutil sobre os retratos velados.
- Respeite `prefers-reduced-motion`. Contraste AA. Todo ícone interativo com `aria-label`.

## 7. Arquitetura e qualidade

- React 19 + TypeScript **strict** + Vite + Tailwind. Sem `any`.
- Camadas separadas: `types.ts` (domínio) · `services/` (regras puras e testáveis:
  compatibilidade, termômetro, curadoria, moderação, LGPD, Gemini) · `state/`
  (reducer + contexto) · `components/` · `screens/`.
- **A regra de negócio não mora no componente.** Compatibilidade, termômetro e curadoria
  são funções puras, sem React, sem I/O.
- Persistência do MVP em `localStorage`, isolada em `services/storage.ts` — a única
  camada que muda ao plugar um backend real.
- Entregue junto o **schema PostgreSQL/Supabase** correspondente, com RLS: ninguém lê
  mensagem de conversa alheia, fila de moderação só para admin, checagem de 18+ como
  constraint no banco.
- Cotas de plano centralizadas em uma constante, não espalhadas por telas.

## 8. Dados de demonstração — obrigatórios

Crie **12 perfis fictícios brasileiros** completos (bio, profissão, 6–8 interesses,
Bússola, estilo de vida, 2–4 respostas escritas com voz própria e específica — nada de
"gosto de viajar e de rir"), mais uma conta de usuário logado e uma conta administrativa.
Semeie também: uma conversa viva com 14 mensagens (para o véu já aparecer em "Quase lá"),
uma conexão nova sem mensagem, uma solicitação recebida, uma conversa parada há dias (para
o anti-ghosting aparecer), duas denúncias e um item na fila de moderação.

Perfis fictícios devem ser claramente fictícios: nenhuma foto de pessoa real.

## 9. Critérios de aceitação — o app está pronto quando

1. `npm install && npm run dev` sobe sem erro, e `tsc --noEmit` passa limpo.
2. Sem `GEMINI_API_KEY`, tudo funciona; com a chave, as sugestões passam a ser geradas.
3. Dá para percorrer, sem tela morta: cadastro → perfil → descobrir → demonstrar interesse
   → conexão → conversar → enviar ritual → ver o véu abrir → propor revelação → encerrar
   com gentileza.
4. Enviar "me manda um pix de 200 reais" abre o diálogo de moderação **antes** do envio.
5. O painel administrativo mostra a denúncia semeada e permite resolvê-la.
6. "Exportar meus dados" baixa um JSON de verdade; "Excluir minha conta" apaga de verdade.
7. Funciona em 390 px de largura e em 1280 px, sem rolagem horizontal.
8. Nenhuma tela exibe percentual de compatibilidade sem a decomposição ao lado.

## 10. O que NÃO implementar agora (deixe preparado e documentado)

Pagamento real, notificações push, geolocalização por GPS, chamadas de vídeo, eventos e
comunidades. Deixe os tipos, o schema e os pontos de extensão prontos, com um comentário
dizendo exatamente onde plugar.

Comece pelo item 9.3 — o fluxo principal ponta a ponta — e só depois refine o visual.

<<< TERMINA O PROMPT
