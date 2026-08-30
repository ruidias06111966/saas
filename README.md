# CONEXÃO

**Antes de escolher alguém, conheça alguém.**

Aplicativo web de relacionamentos em que a conversa vem antes da aparência. Não é um
clone de Tinder com outra paleta: a foto de um desconhecido entra velada e só se revela
conforme a conversa evolui de verdade.

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
| Dados | `localStorage`, 12 perfis fictícios | PostgreSQL no Supabase, com RLS |
| Login | comparação local de SHA-256 | Supabase Auth (bcrypt no servidor + JWT) |
| Fotos | dataURL no navegador | bucket privado, URL assinada de 1 h |
| Exclusão de conta | limpa o estado local | `delete_my_account()` no servidor |

Modo demo é o padrão e serve para navegar o produto inteiro. Para o modo online, rode
[`docs/SUPABASE.sql`](docs/SUPABASE.sql) no seu projeto e preencha:

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

### Contas de demonstração

| Conta | E-mail | Senha |
|---|---|---|
| Usuário | `joao@conexao.app` | `conexao123` |
| Administrador | `admin@conexao.app` | `conexao123` |

A tela de login tem botões de entrada em um clique. Há 12 perfis fictícios, uma conversa
já em andamento (véu em "Quase lá"), uma solicitação pendente, uma conversa parada para
ver o fluxo anti-ghosting, duas denúncias e um item na fila de moderação.

## Os três mecanismos

### Revelação Progressiva
A descoberta mostra **Cartões de Essência**: o retrato entra pequeno e velado, e o centro
do cartão é o que a pessoa **escreveu**. A imagem se abre em cinco estágios — Silhueta,
Contornos, Traços, Quase lá, Revelado — conforme o Termômetro sobe. Existe um atalho:
propor revelar agora, que só vale com o aceite dos dois.

Com backend conectado, **o véu é servido pelo servidor**: a foto vive em vários níveis de
resolução e o banco decide qual você pode baixar. Quem não conversou com você recebe um
arquivo de 12 pixels — o rosto não está nos bytes.

### Curadoria Diária
Um **Encontro do Dia** em destaque e mais 5 perfis (20 no Premium), escolhidos por uma
semente determinística. O destaque expira em 24 horas. Seis "Tenho interesse" por dia no
plano gratuito — e o app explica que o limite é proposital.

### Termômetro de Conversa
Mede reciprocidade, profundidade, constância e abertura, com fatores que impedem uma
conversa curta de pontuar alto. É o que abre o véu. Conversa parada há mais de cinco dias
aciona o **Encerrar com gentileza**: quem se despede ganha reputação, quem some perde.

## O que mais tem aqui

- **Compatibilidade explicável** — 7 dimensões com peso, score e a frase do porquê. Nunca
  um número solto, sempre com grau de confiança e o ponto de atrito.
- **Copiloto Gemini** — sugere aberturas, próximas perguntas e melhorias de perfil.
  Nunca envia por você, nunca finge ser você, nunca pede dado pessoal. Roda numa Edge
  Function que exige JWT e é dona dos prompts: a chave do modelo nunca chega ao navegador.
- **Moderação em duas camadas** — heurística local antes do envio, Gemini como reforço,
  e nenhuma suspensão automática: tudo cai na fila de revisão humana.
- **LGPD funcionando** — exportar dados em JSON, corrigir, excluir a conta com
  anonimização, consentimentos versionados. Localização só por cidade e faixa de distância.
- **Conversa ao vivo** — mensagens e recibos de leitura chegam sem recarregar, por
  Supabase Realtime, com o mesmo RLS que protege a leitura filtrando o stream.
- **Painel administrativo** — usuários, denúncias e fila de moderação. A métrica de topo é
  a taxa de conexões que viraram conversa, não tempo de tela.
- **15 telas**, mobile-first, modo claro e escuro, acessível.

## Documentação

| Arquivo | Para quê |
|---|---|
| [`docs/PROMPT-MESTRE.md`](docs/PROMPT-MESTRE.md) | O prompt completo, pronto para colar no AI Studio ou no Lovable |
| [`docs/PROMPT-ETAPAS.md`](docs/PROMPT-ETAPAS.md) | O mesmo prompt em 9 blocos encadeados, se a ferramenta truncar |
| [`docs/AI-STUDIO-vs-LOVABLE.md`](docs/AI-STUDIO-vs-LOVABLE.md) | Qual ferramenta usar, e por quê |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Decisões, fórmulas e limitações conhecidas |
| [`docs/SUPABASE.sql`](docs/SUPABASE.sql) | Schema PostgreSQL completo, com RLS e função de exclusão LGPD |

## Stack

React 19 · TypeScript strict · Vite 6 · Tailwind 3 · `@google/genai` (opcional).
Sem biblioteca de estado, sem biblioteca de ícones, sem biblioteca de rotas — o
roteamento é uma união discriminada de 15 rotas em `types.ts`.

## Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + build de produção
npm run preview    # serve o build
```

O GitHub Actions roda `npm ci`, o typecheck e o build a cada pull request e a
cada push na `main` (`.github/workflows/ci.yml`).

## Avisos

Este é um MVP de demonstração. A autenticação é uma comparação de hash no navegador e os
dados vivem no `localStorage` — nada disso vai para produção sem um backend real. O
caminho de migração está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

Todos os perfis são fictícios. Nenhuma foto de pessoa real é usada: perfis sem foto
ganham um retrato abstrato gerado por código.
