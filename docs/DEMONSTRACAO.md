# Demonstração pública

Versão do QICONEXÃO para o botão "Experimente agora" do site da QiDomínios, publicada de graça
no Cloudflare Pages em `https://demo-conexao.qidominios.com.br`.

É o **modo demo** de sempre (sem Supabase, tudo no navegador, com os perfis fictícios de
`data/seed.ts`) **mais o mercado**, que no modo demo comum fica indisponível:

- `npm run build:demo` roda o typecheck, `vite build --mode demo` e `scripts/preparar-demo.mjs`.
- No modo `demo`, o `vite.config.ts`:
  - troca `services/mercado.ts` por `demo/mercado-demo.ts`, com anúncios e propostas fictícios
    em memória (as mesmas funções, as mesmas categorias da migração 008);
  - troca `services/backend.ts` por `demo/backend-demo.ts`, que só muda o contato liberado: o
    telefone mostrado é `(00) 00000-0000` (o DDD 00 não existe, não é o número de ninguém);
  - apaga à força `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, para a demonstração
    nunca falar com o banco real;
  - grava o resultado em `dist-demo/`.
- `demo/FaixaDemo.tsx` mostra o aviso "Demonstração" no topo; fora do modo demo não aparece.
- `scripts/preparar-demo.mjs` falha o build se encontrar o endereço ou uma chave do projeto real.

O visitante entra pelos botões "Entrar como usuário" ou "Entrar como administrador" da tela de
login. Anúncios e propostas voltam ao início ao recarregar a página; perfis e conversas do modo
demo ficam no `localStorage` do navegador do visitante.

## Publicação (Cloudflare Pages)

1. Cloudflare → Workers e Pages → Criar → Pages → conectar ao GitHub → repositório `saas`.
2. Diretório raiz: em branco. Comando de build: `npm run build:demo`. Diretório de saída: `dist-demo`.
3. **Não** cadastre `VITE_SUPABASE_*` nesse projeto.
4. Domínio personalizado: `demo-conexao.qidominios.com.br`.
