# Google AI Studio ou Lovable para construir o CONEXÃO?

Resposta direta primeiro, justificativa depois.

## A recomendação

**Use os dois, em ordem — e o peso maior é do Lovable.**

1. **Google AI Studio** para prototipar e afinar a camada de IA (o Copiloto de Conversa,
   a moderação, a explicação de compatibilidade). É onde você testa prompt, `responseSchema`
   e temperatura em segundos, de graça, com o modelo na mão.
2. **Lovable** para construir o CONEXÃO como sistema de verdade: banco, autenticação,
   RLS, upload de foto, chat em tempo real, deploy e domínio.

Se você só puder escolher **um**, escolha **Lovable**. O CONEXÃO é um app com dados
privados por natureza — mensagens entre duas pessoas, denúncias, dados pessoais sob LGPD.
Isso exige banco com controle de acesso por linha, e é exatamente o que o AI Studio não
tem.

## Comparação no que importa para este projeto

| Necessidade real do CONEXÃO | Google AI Studio (Build) | Lovable |
|---|---|---|
| Banco de dados relacional | Não tem | Supabase nativo, integrado no fluxo |
| Autenticação de usuários | Não tem | Supabase Auth, pronto |
| RLS (mensagem privada entre duas pessoas) | Não tem | Sim — e é o requisito nº 1 aqui |
| Upload e storage das fotos | Não tem (só base64 no navegador) | Supabase Storage |
| Chat em tempo real | Você teria que simular | Supabase Realtime |
| Painel administrativo com dados reais | Não tem | Sim |
| Gemini / IA generativa | **Excelente** — é a casa do modelo | Via Edge Function, com um passo a mais |
| Chave de API protegida | **Não** — fica exposta no cliente | Sim, em Edge Function no servidor |
| Iterar em prompt de IA | **Excelente** | Razoável |
| Projeto multiarquivo com 15 telas | Sofre | Feito para isso |
| Deploy, domínio, GitHub | Compartilhamento simples | Deploy, domínio próprio e sync com GitHub |
| Custo para começar | Muito baixo | Créditos mensais, plano pago para volume |

## O ponto que decide

Num aplicativo de relacionamento, o dado mais sensível não é o perfil — é a **conversa**.
Se qualquer usuário conseguir ler a mensagem de outro, não existe produto: existe um
incidente. Isso se resolve com Row Level Security no banco, do lado do servidor.

O AI Studio Build gera aplicações que rodam inteiras no navegador. Não há servidor onde
essa regra possa morar. Serve muito bem para um protótipo navegável e para desenvolver a
camada de IA — e é por isso que o código deste repositório está pronto para ele — mas não
é onde o CONEXÃO vira SaaS.

Há ainda a questão da chave: no AI Studio a `API_KEY` do Gemini vai para o cliente. Para
um protótipo pessoal, tudo bem. Para um app publicado, é uma chave sua na mão de qualquer
visitante.

## Caminho prático recomendado

```
Semana 1   AI Studio   Protótipo navegável + afinar os prompts do Copiloto
                       (use docs/PROMPT-MESTRE.md e este repositório como base)
Semana 2   Lovable     Importar o repositório do GitHub, plugar Supabase,
                       aplicar docs/SUPABASE.sql (schema + RLS + policies)
Semana 3   Lovable     Auth real, upload de fotos, chat em tempo real
Semana 4   Lovable     Edge Function para o Gemini (tira a chave do cliente),
                       Stripe/Mercado Pago para o Premium, domínio próprio
```

## Como usar este repositório em cada ferramenta

**No Google AI Studio**

- O projeto já usa React 19 + TypeScript e lê a chave de `process.env.API_KEY`, que é a
  convenção do AI Studio. Crie um `.env` com `GEMINI_API_KEY=...`.
- Para gerar do zero lá dentro, cole `docs/PROMPT-MESTRE.md`. Se a interface truncar,
  use `docs/PROMPT-ETAPAS.md`, que já vem quebrado em blocos encadeados.
- Este repositório usa Tailwind compilado localmente (funciona offline e em produção).
  Se preferir o formato que o AI Studio gera por padrão, troque `index.css` pelo script
  `<script src="https://cdn.tailwindcss.com"></script>` no `index.html` — o resto do
  código não muda.

**No Lovable**

- Suba este repositório para o GitHub e importe. É React + Vite + Tailwind, o mesmo
  formato que o Lovable usa.
- Conecte o Supabase e rode `docs/SUPABASE.sql` no SQL Editor.
- Substitua `services/storage.ts` por chamadas ao `@supabase/supabase-js`. É a única
  camada que precisa mudar: telas, regras e componentes continuam idênticos, porque as
  regras de negócio são funções puras em `services/`.
- Mova `services/geminiService.ts` para uma Edge Function e chame-a a partir do cliente.

## Alternativas que valem menção

- **Bolt.new / v0** — bons para gerar telas soltas, fracos para um app com estado e banco.
- **Firebase Studio** — se você já vive no ecossistema Google, resolve auth + banco +
  Gemini no mesmo lugar. As regras do Firestore são menos expressivas que o RLS do
  Postgres para o caso "só os dois participantes leem esta conversa", mas dão conta.
- **Cursor / Claude Code direto no repositório** — a partir do momento em que o projeto
  passa de umas 40 telas e regras, sair da ferramenta no-code costuma acelerar.
