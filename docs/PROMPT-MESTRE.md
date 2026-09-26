# PROMPT-MESTRE — QICONEXÃO
### O prompt do produto atual, pronto para colar no Google AI Studio (Build) ou no Lovable

> Como usar: cole **tudo** o que está entre as linhas `>>>` e `<<<` como primeira
> mensagem. Ele descreve o QICONEXÃO como está hoje: um mercado de serviços
> profissionais. A primeira versão, um aplicativo de relacionamentos, continua no
> histórico do git e em `PROMPT-ETAPAS.md`, que é só registro e não serve para este
> produto.

---

>>> COMEÇA O PROMPT

# QICONEXÃO — quem sabe fazer, e quem precisa

Construa um aplicativo web responsivo, mobile-first, em **React + TypeScript**, chamado
**QICONEXÃO**. É um mercado de serviços profissionais **regional**: liga quem precisa de
um contador, engenheiro, advogado ou de alguém para resolver um alvará a quem sabe fazer
isso, na mesma região. Não é um site de freelancer nacional com outra cor.

## 0. A tese, e a anti-tese

**Tese:** *"Quem sabe fazer, e quem precisa."* Quem precisa de um serviço profissional
depende de indicação de conhecido; quem presta o serviço depende do boca a boca. Os dois
estão na mesma cidade e não se acham. Os sites grandes de freelancer não resolvem: são
nacionais, disputados por preço e feitos para trabalho remoto e genérico — laudo de obra,
vigilância sanitária e licitação não cabem ali.

**Anti-tese — o que este app NÃO deve ter, em nenhuma hipótese:**

- Nada de telefone ou e-mail à vista antes do acordo. O contato é o que o mercado protege.
- Nada de propostas visíveis entre concorrentes. Preço à vista faz todo mundo copiar
  quem chegou primeiro.
- Nada de cobrar de quem publica. Quem traz a demanda não paga, nunca.
- Nada de IA escrevendo mensagens no lugar da pessoa e enviando sozinha.
- Nada de vocabulário ou estética de aplicativo de relacionamento: sem "match", sem
  coração, sem foto borrada como recompensa, sem idade ao lado do nome.

Se alguma decisão de implementação empurrar o produto para um desses itens, escolha
a outra saída.

## 1. O mercado — o fluxo que define o produto

Implemente o fluxo **completo e integrado**, ponta a ponta:

1. **Quem precisa publica** um anúncio: título, descrição, categoria, modalidade
   (presencial, remoto ou híbrido), cidade e UF, tipo de orçamento (fechado, por hora ou
   a combinar, com mínimo e máximo opcionais) e prazo em dias. Publicar é gratuito,
   sempre. O anúncio fica aberto por **30 dias** e depois expira sozinho.
2. **Quem sabe fazer se oferece** com uma proposta: mensagem, valor e prazo.
3. **Quem publicou compara as propostas e escolhe** uma.
4. **Proposta aceita libera o telefone dos dois lados.** A liberação é uma função no
   servidor que exige proposta aceita e que quem pergunta seja parte dela.

**Regras que sustentam a confiança, impostas no banco e não só na tela:**

- **Contato protegido.** O telefone fica guardado e não aparece para ninguém até o aceite.
- **Proposta sigilosa.** Cada profissional vê apenas a própria proposta; quem publicou vê
  todas. O profissional não aceita a própria proposta nem muda o preço depois de enviada.
- **Busca de verdade.** O quadro é **procurado**, não empurrado: por palavra, categoria,
  UF, cidade e modalidade, com paginação de 20 por página. A busca ignora acento e
  maiúsculas — "goiania" encontra "Goiânia".
- **Foco regional.** Centro-Oeste e Minas primeiro. **37 categorias em 9 grupos**:
  Contábil e Tributário (5), Jurídico (5), Tecnologia (5), Marketing e Vendas (5),
  Engenharia e Obras (5), Licenças e Segurança (4), Administrativo (4), Consultoria (3)
  e Outros (1). As categorias vivem numa tabela, não no código.

## 2. Termômetro de Conversa e reputação pela conduta

A negociação acontece numa conversa. Meça se ela **anda**, e mostre a medição abertamente.

- Quatro métricas 0–100 sobre as mensagens: **reciprocidade** (os dois falam, ninguém
  fala sozinho), **profundidade** (tamanho das mensagens e perguntas feitas),
  **constância** (intervalo entre respostas) e **abertura**. Aplique fatores que impedem
  uma conversa curta de pontuar alto.
- Cinco degraus com nome e frase: **Primeiro contato** (0), **Conversando** (20),
  **Entendendo** (40), **Alinhando** (62, "já dá para falar de prazo e preço") e
  **Pronto** (82, "está na hora de fechar o combinado").
- **Encerrar com gentileza:** depois de cinco dias sem resposta, ofereça mensagens de
  despedida educadas e editáveis. Quem se despede **ganha** reputação; quem some
  **perde**. A reputação aparece no perfil profissional.

## 3. O perfil profissional

- Nome, foto, profissão, **até 5 áreas de atuação** entre as 37 categorias, anos de
  experiência, cidade, se atende a distância, resumo e telefone (guardado, nunca exibido).
- **Sem idade, sem gênero, sem data de nascimento.** Idade ao lado do nome num perfil
  profissional é convite para discriminação etária. A maioridade é declarada no
  consentimento do cadastro.
- **Foto nítida desde o primeiro segundo.** Num mercado de serviços o rosto é credencial,
  não recompensa. A foto segue exatamente a mesma regra de visibilidade do perfil.
- Sem foto enviada, gere um **retrato abstrato determinístico** por SVG a partir do id.
  Nunca use foto de banco de imagens representando pessoas reais.
- Selo de **verificado** por selfie, com revisão humana no painel — não reconhecimento
  facial. A selfie é apagada depois da decisão.
- **"Quem faz":** uma busca de profissionais por área, cidade e palavra, para quem
  prefere procurar a pessoa antes de publicar.

## 4. Planos — cobra-se de quem é abundante

Há muito mais profissional procurando cliente do que cliente procurando profissional, e
quem publica traz o combustível do mercado. Então:

| | Gratuito | Premium (R$ 39,90/mês) |
|---|---|---|
| Publicar anúncio | ilimitado | ilimitado |
| Propostas enviadas | **3 por mês** | ilimitadas |
| Pedidos de conversa por dia | 10 | 40 |
| Uso do Copiloto por dia | 8 | 100 |
| Filtros avançados | não | sim |

- As cotas ficam centralizadas numa constante, e o limite de propostas é imposto por
  **gatilho no banco**. Limite que só existe no navegador não é limite.
- Segurança, verificação, moderação e direitos de LGPD **jamais** entram na lista do
  plano pago.
- A tela de plano é **sempre** alcançável, também para quem já assina ("Meu plano"), com
  o botão de cancelar à vista. Esconder o cancelamento é prática abusiva.
- Pagamento pelo Stripe: o app abre o checkout, e quem muda o plano é o webhook, depois
  de conferir a assinatura do evento. O navegador nunca diz "paguei".

## 5. Copiloto de IA (Gemini) — sugere, nunca escreve por você

A geração passa por uma função no servidor que exige login e é dona dos prompts: a chave
do modelo **nunca** chega ao navegador. Saída estruturada em JSON.

Funções: sugerir como abrir a conversa sobre um serviço; sugerir a próxima pergunta —
o que falta para orçar, prazo, escopo; sugerir melhorias no perfil profissional; ler o
termômetro; classificar risco em moderação; sugerir despedidas gentis.

**Regras invioláveis, escritas no `systemInstruction`:**

1. A IA **nunca** envia mensagem sozinha. Ela preenche o campo; a pessoa edita e envia.
2. A IA **nunca** se passa pelo usuário nem inventa fatos sobre ele.
3. A IA **nunca** sugere pagamento antecipado ou dado bancário antes do acordo.
4. Nenhum dado sensível (e-mail, telefone, coordenada) entra no prompt — só o que já é
   público no perfil.

**Requisito de robustez:** toda função de IA tem um **fallback determinístico local**.
Sem chave ou sem servidor, o app funciona inteiro, com sugestões de um banco curado, e
mostra um aviso discreto de "modo local", nunca uma tela de erro.

## 6. Segurança e LGPD — desde o MVP

- **Moderação em duas camadas.** Camada 1: heurística local, **antes** do envio, sem rede,
  cobrindo pedido financeiro suspeito (Pix, transferência, cripto, código de
  verificação), contato externo, conteúdo sexual, discurso de ódio, assédio, spam com link
  e suspeita de menor de idade. Camada 2: Gemini classifica o que a camada 1 marcou.
- Dois níveis: **risco** marca a mensagem, abre um diálogo de confirmação antes de enviar
  e entra na fila de revisão humana; **atenção** é só um conselho para quem escreve,
  mostrado uma vez. Combinar contato depois de uma proposta aceita é o objetivo do
  produto, não uma suspeita.
- **Nenhuma suspensão automática.** A IA só sinaliza; quem decide é um humano no painel,
  e a decisão fica gravada com quem decidiu.
- Bloquear e denunciar em um toque, com 8 motivos (perfil falso, assédio, conteúdo
  ofensivo, golpe ou fraude, conteúdo sexual inadequado, spam, suspeita de menor de idade,
  outro), em toda tela de perfil e de conversa.
- **Localização:** a coordenada nunca é pedida; é deduzida da cidade informada, e a
  dedução ignora acento.
- **LGPD (Lei 13.709/2018) funcionando de verdade:** exportar os dados em JSON, corrigir,
  excluir a conta com anonimização do que precisa sobreviver por legítimo interesse, e
  consentimentos versionados com data. Quando as políticas mudam, peça o reaceite.
- Privacidade, Termos de Uso e Diretrizes da Comunidade descrevem **este** produto:
  anúncios, propostas, telefone liberado só depois do aceite.

## 7. Telas

1. **Landing** — a tese, "Como funciona" em 4 passos, os diferenciais, o bloco de
   segurança e o modelo de planos.
2. **Cadastro em 4 etapas** com barra de progresso: Conta → Seu trabalho → Suas áreas →
   Foto e termos.
3. **Login**, **recuperar senha** e **redefinir senha**, com contas de demonstração de
   um clique.
4. **Início** — saudação; três indicadores (propostas esperando sua resposta, propostas
   suas sem resposta, conversas ativas); aviso quando você é escolhido num trabalho;
   completude do perfil; pedidos de conversa; anúncios recentes; dicas para o perfil e de
   segurança.
5. **Trabalhos** — o quadro de anúncios, com busca e filtros.
6. **Anúncio** — pelos dois lados: quem publicou vê as propostas e escolhe; quem passa
   por ali se oferece.
7. **Publicar** — o formulário do anúncio, com as regras do banco ditas em português
   antes do clique.
8. **Publiquei** — meus anúncios e quantas propostas cada um recebeu.
9. **Propostas** — onde me ofereci, e no que deu.
10. **Quem faz** — a busca de profissionais.
11. **Perfil de outra pessoa** — profissão, áreas, experiência, reputação, selo,
    denunciar e bloquear.
12. **Conexões** — abas Novas, Conversando, Solicitações, Favoritos e Encerradas.
13. **Conversas** e **Chat** — mensagens agrupadas por dia, enviada/lida, "digitando…",
    termômetro, Copiloto e encerrar com gentileza. Tela cheia no celular.
14. **Meu perfil** e **edição**.
15. **Plano** — gratuito e Premium, honesto, com cancelar à vista.
16. **Configurações** — plano e cobrança primeiro, aparência, privacidade, direitos LGPD,
    bloqueios, transparência sobre a IA.
17. **Notificações**.
18. **Painel administrativo** — usuários, denúncias, verificações e fila de moderação.

Navegação: menu inferior no celular (Início, Trabalhos, Publiquei, Propostas, Conversas,
Perfil) e barra lateral no computador, com "Quem faz" a mais.

## 8. Identidade visual — própria, não genérica

- **Paleta:** areia `#FAF6F1` (fundo), tinta `#1F1A2E` (texto), ameixa `#6E4C9B`
  (primária), brasa `#CA6A43` (acento), sálvia `#5A8667` (positivo). Modo escuro por
  troca de variáveis CSS.
- **Tipografia:** serifa de display (Fraunces) para títulos e números; Inter para o resto.
- Cantos generosos, muito espaço em branco, sombras suaves, animação de entrada discreta.
- Respeite `prefers-reduced-motion`. Contraste AA. Todo ícone interativo com `aria-label`.

## 9. Arquitetura e qualidade

- React 19 + TypeScript **strict** + Vite + Tailwind. Sem `any`.
- Camadas separadas: `types.ts` (domínio) · `services/` (regras puras e testáveis:
  termômetro, reputação, moderação, LGPD, localização, mercado) · `state/` (reducer +
  contexto) · `components/` · `screens/`.
- **A regra de negócio não mora no componente.** E as regras do mercado — sigilo das
  propostas, cota, liberação do telefone — moram no **banco**, com RLS e gatilhos.
- Backend Supabase: Auth, PostgreSQL com RLS, Storage privado com URL assinada,
  Realtime para a conversa ao vivo e Edge Functions para IA, checkout, webhook do
  pagamento e aviso no celular. Toda alteração de schema entra como migração numerada.
- **RLS protege linhas, não colunas.** Terceiros leem o perfil por uma view só de
  leitura com os campos públicos (nome, profissão, cidade, foto, verificado, reputação),
  nunca a tabela de usuários.
- **Modo demo:** sem as variáveis do Supabase, o app roda em `localStorage` para navegar
  perfis, conversas e painel. O mercado exige o modo online.
- Testes com Vitest para as regras puras, e testes de guarda que leem as migrações e
  comparam com o que o cliente pede.

## 10. Dados de demonstração — obrigatórios

Crie **8 perfis profissionais fictícios** no Centro-Oeste e em Minas (contadora,
engenheiro civil, advogada, designer, consultor de licitações, consultora de vigilância
sanitária, uma construtora e outros), mais uma conta de usuário logado e uma conta
administrativa, todas com a mesma senha de demonstração. Semeie também: uma negociação em
andamento com escopo, prazo, preço e contraproposta (para o termômetro subir de verdade),
uma solicitação de conversa recebida, uma conversa parada há dias (para o "Encerrar com
gentileza" aparecer), duas denúncias e um item na fila de moderação.

Perfis fictícios devem ser claramente fictícios: nenhuma foto de pessoa real.

## 11. Critérios de aceitação — o app está pronto quando

1. `npm install && npm run dev` sobe sem erro, e `tsc --noEmit` e os testes passam limpos.
2. Sem a chave do Gemini, tudo funciona; com a chave, as sugestões passam a ser geradas.
3. Dá para percorrer, sem tela morta: cadastro → perfil profissional → publicar anúncio →
   outra conta encontra pela busca sem acento → envia proposta → quem publicou aceita →
   os dois veem o telefone → conversam → encerram com gentileza.
4. Antes do aceite, nenhuma tela e nenhuma consulta devolve o telefone de ninguém.
5. Um profissional não consegue ler a proposta de outro, nem aceitar a própria.
6. A quarta proposta do mês no plano gratuito é recusada **pelo banco**.
7. Enviar "me manda um pix de 200 reais" abre o diálogo de moderação **antes** do envio.
8. O painel administrativo mostra a denúncia semeada e permite resolvê-la, e a decisão
   continua lá depois de recarregar.
9. "Exportar meus dados" baixa um JSON de verdade; "Excluir minha conta" apaga de verdade.
10. Funciona em 390 px e em 1280 px de largura, sem rolagem horizontal.

## 12. O que NÃO implementar agora (deixe preparado e documentado)

Geolocalização por GPS, chamadas de áudio e vídeo, eventos e comunidades. Deixe os tipos,
o schema e os pontos de extensão prontos, com um comentário dizendo exatamente onde
plugar.

Comece pelo item 11.3 — o fluxo principal ponta a ponta — e só depois refine o visual.

<<< TERMINA O PROMPT
