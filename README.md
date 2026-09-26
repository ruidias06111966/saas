# QICONEXÃO

**Quem sabe fazer, e quem precisa.**

Aplicativo web que liga quem precisa de um serviço profissional (contador, engenheiro,
advogado, alvará, laudo) a quem sabe fazê-lo, na mesma região. Quem precisa publica de
graça, recebe propostas sigilosas e escolhe; o telefone só é liberado depois do acordo.

[![CI](https://github.com/ruidias06111966/saas/actions/workflows/ci.yml/badge.svg)](https://github.com/ruidias06111966/saas/actions/workflows/ci.yml) ![etapa](https://img.shields.io/badge/status-MVP%20funcional-6E4C9B) ![stack](https://img.shields.io/badge/React%2019-TypeScript-1F1A2E) ![ia](https://img.shields.io/badge/Gemini-opcional-CA6A43)

## Rodando

```bash
npm install
npm run dev          # http://localhost:5173
```

O app funciona **sem nenhuma chave de API**.

```bash
cp .env.example .env
```

### Os dois modos

| | Modo demo | Modo online |
|---|---|---|
| Quando | nenhuma variável `VITE_SUPABASE_*` definida | as duas definidas |
| Dados | `localStorage`, 8 perfis profissionais fictícios | PostgreSQL no Supabase, com RLS |
| Login | comparação local de SHA-256 | Supabase Auth (bcrypt no servidor + JWT) |
| Fotos | dataURL no navegador | bucket privado, URL assinada de 1 h |
| Quadro de anúncios e propostas | **indisponível** (a tela mostra o aviso "Supabase não configurado") | busca paginada no banco |
| Exclusão de conta | limpa o estado local | `delete_my_account()` no servidor |

O modo demo serve para navegar perfis, conversas, termômetro, moderação e painel
administrativo sem configurar nada. O mercado — anúncios, propostas e a liberação do
telefone — só existe no modo online, porque as regras que o sustentam moram no banco.
Para o modo online, aplique [`docs/SUPABASE.sql`](docs/SUPABASE.sql) e as migrações de
[`supabase/migrations/`](supabase/migrations/) no seu projeto e preencha:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### O Copiloto de IA

A chave do Gemini **não** vai no `.env` do app — tudo que está lá acaba no JavaScript
entregue ao navegador. Ela é segredo do projeto Supabase, e a geração passa por uma Edge
Function que exige login:

```bash
supabase secrets set GEMINI_API_KEY=sua_chave
# ou no painel: Edge Functions → Secrets → Add new secret
```

Sem a chave — ou sem backend — as sugestões vêm de um banco curado local e o app avisa
que está em "modo local". Nenhuma tela quebra em nenhuma combinação.

### As Edge Functions

| Função | O que faz | JWT |
|---|---|---|
| `copiloto` | fala com o Gemini; o servidor é dono dos prompts e da cota | exige |
| `assinar` | abre o checkout da assinatura no Stripe (não muda o plano) | exige |
| `stripe-webhook` | muda o plano depois do pagamento | **não** — confere a assinatura do Stripe |
| `notificar` | avisa no celular que chegou mensagem, sem o conteúdo | exige |
| `decidir-verificacao` | concede o selo de verificado e apaga a selfie | exige, e só administrador |
| `velar` | herança do app antigo: gerava versões borradas da foto. Continua publicada, mas sem nenhum chamador desde que o envio passou a gravar só o original | exige |

O webhook é a única sem JWT, e não poderia ser diferente: o Stripe não tem sessão no app.
Em troca, a primeira coisa que ela faz é conferir a assinatura criptográfica do evento com
o segredo do webhook. Sem isso, quem descobrisse a URL daria premium a quem quisesse.

### Cobrança

O plano **não** é gravável pelo cliente: `users.plan` está congelada pelo gatilho
`campos_privilegiados`, e quem escreve é o webhook, com `service_role`. Para ligar:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set URLS_DO_APP=https://seu-site/
```

O endpoint do webhook é `https://SEU-PROJETO.supabase.co/functions/v1/stripe-webhook`, e
os eventos a assinar são `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted` e
`invoice.payment_failed`.

Sem as chaves o app não quebra: a tela de Premium diz que a cobrança ainda não foi ligada.

**O modelo:** publicar anúncio é gratuito para sempre, para todo mundo — quem traz a
demanda não paga. No plano gratuito o profissional envia **3 propostas por mês**; o
Premium (R$ 39,90) libera propostas ilimitadas, mais pedidos de conversa por dia, mais
uso do Copiloto e filtros avançados. O limite de propostas mora no gatilho
`private.cota_de_propostas`, no banco — não na tela. Os valores estão em `QUOTAS`, em
`constants.ts`, e a promoção de lançamento está em [`docs/PROMOCAO.md`](docs/PROMOCAO.md).

### Confirmação de e-mail

Se a confirmação estiver ligada (padrão do Supabase), aponte o **Site URL** em
*Authentication → URL Configuration* para o endereço do seu site — senão o link do e-mail
devolve a pessoa para `localhost`.

O serviço de e-mail interno do Supabase é limitado a poucos envios por hora e, em projeto
novo, só entrega para o e-mail dono do projeto. Para gente de verdade, configure um SMTP
próprio.

### Contas de demonstração

| Conta | E-mail | Senha |
|---|---|---|
| Usuário | `demo@qiconexao.com.br` | `conexao123` |
| Administrador | `admin@qiconexao.com.br` | `conexao123` |

A tela de login tem botões de entrada em um clique. Há 8 perfis profissionais fictícios
no Centro-Oeste e em Minas (contadora, engenheiro civil, advogada, consultor de
licitações, uma construtora e outros), uma negociação em andamento já perto do combinado,
uma solicitação de conversa pendente, uma conversa
parada para ver o "Encerrar com gentileza", duas denúncias e um item na fila de
moderação.

## Como funciona

1. **Quem precisa publica** o que quer feito — categoria, cidade, modalidade (presencial,
   remoto ou híbrido), orçamento e prazo. De graça, sempre. O anúncio fica aberto por
   30 dias.
2. **Quem sabe fazer se oferece**, com mensagem, valor e prazo.
3. **Quem publicou compara as propostas e escolhe.**
4. **Proposta aceita libera o telefone** dos dois lados, pela função
   `contato_do_negocio`, que exige proposta aceita e que quem pergunta seja parte dela.

### O que sustenta a confiança

- **Contato protegido.** O telefone fica guardado e não aparece para ninguém até o
  acordo. Num quadro com telefone à vista, o primeiro a se cadastrar em massa é quem quer
  a lista.
- **Proposta sigilosa.** Cada profissional vê só a própria proposta; quem publicou vê
  todas. Com os preços à vista, todo mundo copiaria quem chegou primeiro.
- **Busca que funciona.** Por palavra, categoria, estado, cidade e modalidade, com
  paginação — e ignorando acento, do jeito que se digita.
- **Foco regional.** 37 categorias em 9 grupos, pesando o que pesa em Goiás, Minas e no
  Centro-Oeste: contábil e tributário, jurídico, engenharia e obras, licenças e
  segurança, tecnologia, marketing, administrativo, consultoria.
- **Reputação pela conduta.** O **Termômetro de Conversa** mede reciprocidade,
  profundidade, constância e abertura, em cinco degraus de "Primeiro contato" a
  "Pronto". Conversa parada há mais de cinco dias oferece o **Encerrar com gentileza**:
  quem se despede ganha reputação, quem some perde.
- **Foto nítida.** Num mercado de serviços o rosto é credencial, não recompensa: a foto
  segue a mesma regra de visibilidade do perfil profissional.

## O que mais tem aqui

- **"Quem faz"** — busca de profissionais por área, cidade e palavra.
- **Perfil profissional** — profissão, até 5 áreas de atuação, anos de experiência,
  atendimento a distância e selo de verificado. Sem idade: idade ao lado do nome num
  perfil profissional é convite para discriminação etária; a maioridade fica registrada
  no consentimento.
- **Copiloto Gemini** — sugere como abrir a conversa sobre um serviço, o que perguntar
  para orçar, como melhorar o perfil e como se despedir sem sumir. Nunca envia por você,
  nunca finge ser você, nunca pede dado pessoal. Roda numa Edge Function que exige JWT e
  é dona dos prompts: a chave do modelo nunca chega ao navegador.
- **Verificação por selfie** — revisão humana no painel, não reconhecimento facial; a
  selfie é apagada depois da decisão.
- **Moderação em duas camadas** — heurística local antes do envio, Gemini como reforço,
  e nenhuma suspensão automática: tudo cai na fila de revisão humana, e as decisões do
  painel ficam gravadas com quem decidiu.
- **LGPD funcionando** — exportar dados em JSON, corrigir, excluir a conta com
  anonimização, consentimentos versionados com pedido de reaceite quando as políticas
  mudam. A coordenada nunca é pedida: é deduzida da cidade informada.
- **Conversa ao vivo** — mensagens e recibos de leitura chegam sem recarregar, por
  Supabase Realtime, com o mesmo RLS que protege a leitura filtrando o stream.
- **Aviso no celular e app instalável** — notificação de mensagem nova e instalação
  direto do navegador ([`docs/PUSH.md`](docs/PUSH.md), [`docs/CELULAR.md`](docs/CELULAR.md)).
- **Painel administrativo** — usuários, denúncias, verificações e fila de moderação.
- **22 rotas**, mobile-first, modo claro e escuro, acessível.

## Documentação

| Arquivo | Para quê |
|---|---|
| [`docs/PROMPT-MESTRE.md`](docs/PROMPT-MESTRE.md) | O prompt do produto atual, para reconstruir ou evoluir o app no AI Studio ou no Lovable |
| [`docs/PROMPT-ETAPAS.md`](docs/PROMPT-ETAPAS.md) | Histórico: o prompt da primeira versão (app de relacionamentos) em 9 blocos |
| [`docs/AI-STUDIO-vs-LOVABLE.md`](docs/AI-STUDIO-vs-LOVABLE.md) | Qual ferramenta usar, e por quê |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Decisões, fórmulas e limitações conhecidas |
| [`docs/SUPABASE.sql`](docs/SUPABASE.sql) | Linha de base do schema PostgreSQL, com RLS e função de exclusão LGPD |
| [`supabase/migrations/`](supabase/migrations/) | Tudo o que mudou no banco depois da linha de base, inclusive o mercado |
| [`docs/EMAIL.md`](docs/EMAIL.md) | Sair do e-mail interno do Supabase: SMTP próprio, DNS e os modelos em português |
| [`docs/STRIPE.md`](docs/STRIPE.md) | Tirar a cobrança do modo de teste |
| [`docs/PUSH.md`](docs/PUSH.md) | Ligar o aviso no celular |
| [`docs/CELULAR.md`](docs/CELULAR.md) | Instalar pelo navegador e o caminho para a Play Store |
| [`docs/SENTRY.md`](docs/SENTRY.md) | Registro de erros, limitando o que ele recebe |
| [`docs/PROMOCAO.md`](docs/PROMOCAO.md) | A promoção de lançamento de 60 dias de Premium |

## Stack

React 19 · TypeScript strict · Vite 6 · Tailwind 3 · Supabase (Auth, PostgreSQL com RLS,
Storage, Realtime, Edge Functions) · Stripe · Gemini (opcional, só no servidor) · Sentry ·
Vitest. Sem biblioteca de estado, sem biblioteca de ícones, sem biblioteca de rotas — o
roteamento é uma união discriminada de 22 rotas em `types.ts`.

## Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run build      # typecheck + testes + build de produção
npm run preview    # serve o build
```

O GitHub Actions roda `npm ci`, o typecheck e o build a cada pull request e a
cada push na `main` (`.github/workflows/ci.yml`).

## Avisos

O modo demo é só para navegar: a autenticação é uma comparação de hash no navegador e os
dados vivem no `localStorage`. O que está no ar em
[conexao.qidominios.com.br](https://conexao.qidominios.com.br) roda no modo online, com
as regras impostas pelo servidor.

Todos os perfis de demonstração são fictícios. Nenhuma foto de pessoa real é usada:
perfis sem foto ganham um retrato abstrato gerado por código.
